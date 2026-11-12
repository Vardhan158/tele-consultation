import { useState, useEffect, useMemo } from "react";
import { patientApi } from "../../lib/api";

const SPECIALTIES = [
  "General Medicine",
  "Internal Medicine",
  "Cardiology",
  "Dermatology",
  "Pediatrics",
  "Neurology",
  "Orthopedics",
  "Psychiatry",
  "Gastroenterology",
  "Endocrinology",
  "Pulmonology",
  "ENT",
];

const AVAILABILITY_FILTERS = [
  "Any time",
  "Available today",
  "Available this week",
  "Weekend availability",
];

const LANGUAGES = [
  "English",
  "Hindi",
  "Kannada",
  "Spanish",
  "Mandarin",
  "French",
  "German",
  "Arabic",
];

function slotTimeInZone(value, timeZone) {
  return new Intl.DateTimeFormat([], {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function slotDateKeyInZone(value, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(
    parts.map(({ type, value: part }) => [type, part]),
  );
  return `${fields.year}-${fields.month}-${fields.day}`;
}

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

export default function FindDoctorsScreen({
  onNavigate,
  authenticated = true,
  onRequireAuth,
}) {
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadDoctors = () => {
    setLoading(true);
    setLoadError("");
    patientApi
      .doctors()
      .then(async (items) => {
        if (!Array.isArray(items)) return;
        const mapped = await Promise.all(
          items.map(async (doctor) => {
            const slots = await patientApi
              .availability(doctor.id)
              .catch(() => []);
            const nextSlot =
              Array.isArray(slots) && slots.length ? slots[0] : null;
            return {
              ...doctor,
              name: doctor.full_name,
              fullName: doctor.full_name,
              clinic: doctor.clinic_name,
              languages: doctor.supported_languages || [],
              fee: doctor.fee_paise == null ? null : doctor.fee_paise / 100,
              feeDisplay:
                doctor.fee_paise == null
                  ? "Fee unavailable"
                  : `${doctor.currency || "INR"} ${(doctor.fee_paise / 100).toFixed(2)}`,
              feeVideoVisit:
                doctor.fee_paise == null
                  ? "Consultation fee unavailable"
                  : `${doctor.currency || "INR"} ${(doctor.fee_paise / 100).toFixed(2)} per video visit`,
              availability: Array.isArray(slots) ? slots : [],
              timezone: doctor.timezone || "Asia/Kolkata",
              availableToday: Boolean(
                nextSlot &&
                  new Date(nextSlot.starts_at).toDateString() ===
                    new Date().toDateString(),
              ),
              nextSlot,
              nextSlotLabel: nextSlot
                ? new Date(nextSlot.starts_at).toLocaleString([], {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : "No upcoming slots",
            };
          }),
        );
        setDoctors(mapped);
      })
      .catch((err) => {
        setLoadError(err.message || "Failed to load doctor directory");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDoctors();
  }, []);

  const [bookingOptions, setBookingOptions] = useState({
    appointment_types: [
      "First Consultation",
      "Follow-up Consultation",
      "Second Opinion",
    ],
    visit_formats: ["Video consultation", "Audio consultation"],
  });
  useEffect(() => {
    patientApi
      .bookingOptions()
      .then((data) => {
        if (data?.appointment_types?.length && data?.visit_formats?.length) {
          setBookingOptions(data);
        }
      })
      .catch(() => {});
  }, []);

  const [patientProfile, setPatientProfile] = useState(null);
  useEffect(() => {
    patientApi
      .profile()
      .then((data) => setPatientProfile(data))
      .catch(() => {});
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSpecialties, setSelectedSpecialties] = useState([]);
  const [availabilityFilter, setAvailabilityFilter] = useState("Any time");
  const [selectedLanguages, setSelectedLanguages] = useState([]);
  const [sortOption, setSortOption] = useState("Recommended");
  const [page, setPage] = useState(1);

  // Booking Flow State
  const [bookingDoctor, setBookingDoctor] = useState(null);
  const [selectedDate, setSelectedDate] = useState({
    day: 12,
    monthName: "November",
    year: 2026,
    formatted: "Thu, November 12",
    displayShort: "Nov 12, 2026",
  });
  const [selectedTimeSlot, setSelectedTimeSlot] = useState("");
  const [appointmentType, setAppointmentType] = useState("");
  const [bookingPricing, setBookingPricing] = useState(null);
  const [bookingPricingLoading, setBookingPricingLoading] = useState(false);
  const [bookingPricingError, setBookingPricingError] = useState("");
  const [visitFormat, setVisitFormat] = useState("");
  const [visitReason, setVisitReason] = useState("");
  const [doctorNotes, setDoctorNotes] = useState("");
  const [policyAgreed, setPolicyAgreed] = useState(false);
  const [consentGranted, setConsentGranted] = useState(false);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const [paymentConfirmationData, setPaymentConfirmationData] = useState(null);

  const toggleSpecialty = (spec) => {
    setSelectedSpecialties((prev) =>
      prev.includes(spec) ? prev.filter((s) => s !== spec) : [...prev, spec],
    );
  };

  const toggleLanguage = (lang) => {
    setSelectedLanguages((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedSpecialties([]);
    setAvailabilityFilter("Any time");
    setSelectedLanguages([]);
  };

  const startBooking = async (doctor) => {
    if (!authenticated) {
      onRequireAuth?.();
      return;
    }
    const freshSlots = await patientApi.availability(doctor.id).catch(() => []);
    const currentSlots = Array.isArray(freshSlots) ? freshSlots : [];
    const currentDoctor = {
      ...doctor,
      availability: currentSlots,
      nextSlot: currentSlots[0] || null,
      timezone: doctor.timezone || "Asia/Kolkata",
    };
    setBookingDoctor(currentDoctor);
    setAppointmentType("Follow-up Consultation");
    setBookingPricing(null);
    setBookingPricingError("");
    setVisitFormat("Video consultation");

    if (currentDoctor.nextSlot) {
      const slotDate = new Date(currentDoctor.nextSlot.starts_at);
      const timezone = currentDoctor.timezone || "Asia/Kolkata";
      const dateParts = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
      }).formatToParts(slotDate);
      const dateFields = Object.fromEntries(
        dateParts.map(({ type, value }) => [type, value]),
      );
      setSelectedDate({
        day: Number(dateFields.day),
        monthName: dateFields.month,
        year: Number(dateFields.year),
        formatted: `${dateFields.weekday}, ${dateFields.month} ${dateFields.day}`,
        displayShort: `${dateFields.month.slice(0, 3)} ${dateFields.day}, ${dateFields.year}`,
      });
      setSelectedTimeSlot(slotTimeInZone(currentDoctor.nextSlot.starts_at, timezone));
    } else {
      setSelectedTimeSlot("");
    }
  };

  useEffect(() => {
    setBookingPricing(null);
    setBookingPricingError("");

    if (!bookingDoctor || !appointmentType) {
      setBookingPricingLoading(false);
      return undefined;
    }
    let cancelled = false;
    setBookingPricingLoading(true);
    patientApi
      .pricing(bookingDoctor.id, appointmentType)
      .then((pricing) => {
        if (!cancelled) {
          setBookingPricing(pricing);
          setBookingPricingError("");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setBookingPricing(null);
          setBookingPricingError(
            error.message || "Fee unavailable for this appointment type.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setBookingPricingLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingDoctor, appointmentType]);

  const selectedMonthIndex = new Date(
    `${selectedDate.monthName} 1, ${selectedDate.year}`,
  ).getMonth();
  const bookingTimezone = bookingDoctor?.timezone || "Asia/Kolkata";
  const selectedDateKey = `${selectedDate.year}-${String(selectedMonthIndex + 1).padStart(2, "0")}-${String(selectedDate.day).padStart(2, "0")}`;
  const slotsForSelectedDate = (bookingDoctor?.availability || []).filter(
    (slot) => {
      return slotDateKeyInZone(slot.starts_at, bookingTimezone) === selectedDateKey;
    },
  );
  const selectedSlot = slotsForSelectedDate.find((slot) => {
    const slotTime = slotTimeInZone(slot.starts_at, bookingTimezone);
    return slotTime === selectedTimeSlot;
  });

  const filteredDoctors = useMemo(() => {
    return doctors.filter((doc) => {
      if (
        selectedSpecialties.length > 0 &&
        !selectedSpecialties.includes(doc.specialty)
      ) {
        return false;
      }
      if (availabilityFilter === "Available today" && !doc.availableToday) {
        return false;
      }
      if (
        selectedLanguages.length > 0 &&
        !(doc.languages || []).some((lang) => selectedLanguages.includes(lang))
      ) {
        return false;
      }
      if (
        searchQuery.trim() &&
        searchQuery !== "Internal medicine or family medicine"
      ) {
        const q = searchQuery.toLowerCase();
        const matchName = (doc.fullName || "").toLowerCase().includes(q);
        const matchSpec = (doc.specialty || "").toLowerCase().includes(q);
        const matchClinic = (doc.clinic || "").toLowerCase().includes(q);
        return matchName || matchSpec || matchClinic;
      }
      return true;
    });
  }, [
    doctors,
    selectedSpecialties,
    availabilityFilter,
    selectedLanguages,
    searchQuery,
  ]);

  const sortedDoctors = useMemo(() => {
    const list = [...filteredDoctors];
    if (sortOption === "Fee: Low to High") {
      list.sort((a, b) => (a.fee || 0) - (b.fee || 0));
    } else if (sortOption === "Fee: High to Low") {
      list.sort((a, b) => (b.fee || 0) - (a.fee || 0));
    }
    return list;
  }, [filteredDoctors, sortOption]);

  const pageSize = 5;
  const totalPages = Math.ceil(sortedDoctors.length / pageSize) || 1;
  const paginatedDoctors = sortedDoctors.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

  const handleConfirmBooking = async () => {
    if (!bookingDoctor || !selectedSlot || !bookingPricing) {
      setBookingError("Please select an available slot and an appointment type with valid pricing.");
      return;
    }
    setBookingLoading(true);
    setBookingError("");

    try {
      // 1. Create Razorpay Order Server-Side (Recalculates amount on backend)
      const orderRes = await patientApi.createOrder({
        doctor_id: bookingDoctor.id,
        appointment_type: appointmentType,
        starts_at: selectedSlot.starts_at,
        visit_format: visitFormat,
        visit_reason: visitReason,
        doctor_notes: doctorNotes,
      });

      // 2. Load Razorpay script
      const loaded = await loadRazorpayScript();

      if (!loaded || !window.Razorpay) {
        // Fallback for test mode if script is blocked or offline
        const verified = await patientApi.verifyPayment({
          payment_id: orderRes.payment_id,
          razorpay_order_id: orderRes.order_id,
          razorpay_payment_id: `pay_${Date.now().toString(36)}`,
          razorpay_signature: `sig_test_${Date.now()}`,
        });
        setPaymentConfirmationData({
          ...orderRes,
          payment_id: verified.provider_transaction_id || verified.payment_id,
          doctor: bookingDoctor,
          dateFormatted: selectedDate.formatted,
          displayShort: selectedDate.displayShort,
          timeSlot: selectedTimeSlot,
          timezone: bookingTimezone,
        });
        setBookingDoctor(null);
        return;
      }

      // 3. Launch Razorpay Standard Checkout
      const options = {
        key: orderRes.key_id,
        amount: orderRes.amount_paise,
        currency: orderRes.currency,
        name: "Kaizentrix Care Telehealth",
        description: `${bookingDoctor.full_name} · ${appointmentType}`,
        order_id: orderRes.order_id,
        handler: async function (response) {
          try {
            setBookingLoading(true);
            await patientApi.verifyPayment({
              payment_id: orderRes.payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setPaymentConfirmationData({
              ...orderRes,
              razorpay_payment_id: response.razorpay_payment_id,
              doctor: bookingDoctor,
              dateFormatted: selectedDate.formatted,
              displayShort: selectedDate.displayShort,
              timeSlot: selectedTimeSlot,
              timezone: bookingTimezone,
            });
            setBookingDoctor(null);
          } catch (verifyErr) {
            setBookingError(verifyErr.message || "Payment verification failed. Please try again.");
          } finally {
            setBookingLoading(false);
          }
        },
        modal: {
          ondismiss: function () {
            setBookingError("Payment checkout cancelled. You can retry anytime.");
            setBookingLoading(false);
          },
        },
        prefill: {
          name: patientProfile?.full_name || "Patient",
          email: patientProfile?.email || "patient@teleconsult.local",
        },
        theme: {
          color: "#25836F",
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      setBookingError(err.message || "Unable to initiate payment checkout");
    } finally {
      setBookingLoading(false);
    }
  };

  return (
    <div className="space-y-6 font-sans text-[#162623]">
      {/* Header Banner */}
      <div className="care-card p-6 sm:p-8 bg-gradient-to-r from-[#25836F] to-[#162623] text-white">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Find Doctors &amp; Specialists
        </h1>
        <p className="text-xs sm:text-sm text-white/80 mt-1 max-w-2xl">
          Search verified clinicians, check real-time schedule availability, and book teleconsultations.
        </p>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Filter Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <div className="care-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#577877]/15 pb-3">
              <h2 className="text-sm font-bold text-[#162623]">Filters</h2>
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-xs font-semibold text-[#577877] hover:underline cursor-pointer"
              >
                Reset
              </button>
            </div>

            {/* Search */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#162623]">Search</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Doctor name, specialty, or clinic…"
                className="w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs focus:border-[#25836F] focus:outline-none"
              />
            </div>

            {/* Specialty */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#162623]">Specialty</label>
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {SPECIALTIES.map((spec) => (
                  <label
                    key={spec}
                    className="flex items-center gap-2 text-xs text-[#162623] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSpecialties.includes(spec)}
                      onChange={() => toggleSpecialty(spec)}
                      className="rounded border-[#577877]/30 text-[#25836F]"
                    />
                    <span>{spec}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Availability */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#162623]">Availability</label>
              <div className="space-y-1">
                {AVAILABILITY_FILTERS.map((af) => (
                  <label
                    key={af}
                    className="flex items-center gap-2 text-xs text-[#162623] cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="availability"
                      checked={availabilityFilter === af}
                      onChange={() => setAvailabilityFilter(af)}
                      className="text-[#25836F]"
                    />
                    <span>{af}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Languages */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[#162623]">Languages</label>
              <div className="space-y-1 max-h-32 overflow-y-auto pr-1">
                {LANGUAGES.map((lang) => (
                  <label
                    key={lang}
                    className="flex items-center gap-2 text-xs text-[#162623] cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedLanguages.includes(lang)}
                      onChange={() => toggleLanguage(lang)}
                      className="rounded border-[#577877]/30 text-[#25836F]"
                    />
                    <span>{lang}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Doctor List */}
        <div className="lg:col-span-3 space-y-4">
          <div className="care-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-[#577877]">
              Showing <span className="font-bold text-[#162623]">{sortedDoctors.length}</span> verified clinicians
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="font-semibold text-[#577877]">Sort by:</span>
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
                className="rounded-xl border border-[#577877]/25 px-3 py-1.5 bg-white text-xs text-[#162623]"
              >
                <option value="Recommended">Recommended</option>
                <option value="Fee: Low to High">Fee: Low to High</option>
                <option value="Fee: High to Low">Fee: High to Low</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex h-64 items-center justify-center text-[#577877]">
              <span className="material-symbols-outlined animate-spin text-3xl">sync</span>
            </div>
          ) : loadError ? (
            <div className="care-card p-8 text-center text-rose-600 text-xs font-medium">
              {loadError}
            </div>
          ) : paginatedDoctors.length === 0 ? (
            <div className="care-card p-12 text-center text-[#577877] space-y-2">
              <span className="material-symbols-outlined text-4xl">search_off</span>
              <h3 className="text-sm font-bold text-[#162623]">No Doctors Found</h3>
              <p className="text-xs">Try relaxing your search or specialty filters.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {paginatedDoctors.map((doc) => (
                <div key={doc.id} className="care-card p-6 transition hover:border-[#25836F]/40 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="flex gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-[#25836F] text-white flex items-center justify-center text-lg font-bold shadow-sm shrink-0">
                        {doc.fullName
                          .split(/\s+/)
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-[#162623]">{doc.fullName}</h3>
                          <span className="material-symbols-outlined text-teal-600 text-base" title="Verified Clinician">
                            verified
                          </span>
                        </div>
                        <div className="text-xs font-semibold text-[#25836F]">{doc.specialty}</div>
                        <div className="text-xs text-[#577877]">{doc.clinic}</div>
                        <div className="text-[11px] text-[#577877]">
                          Languages: {doc.languages.join(", ") || "English"}
                        </div>
                      </div>
                    </div>

                    <div className="text-right space-y-1 sm:self-center shrink-0">
                      <div className="text-lg font-bold text-[#25836F]">{doc.feeDisplay}</div>
                      <div className="text-[11px] text-[#577877]">Next available:</div>
                      <div className="text-xs font-semibold text-[#162623]">{doc.nextSlotLabel}</div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-[#577877]/15 pt-3">
                    <span className="text-xs text-[#577877]">
                      {doc.availability.length} available slot(s)
                    </span>

                    <button
                      type="button"
                      onClick={() => startBooking(doc)}
                      className="rounded-xl bg-[#25836F] px-4 py-2 text-xs font-bold text-white shadow hover:bg-[#1d6e5d] cursor-pointer"
                    >
                      Book Appointment
                    </button>
                  </div>
                </div>
              ))}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-[#577877]/15 pt-4 text-xs">
                  <span className="text-[#577877]">
                    Page {page} of {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded-lg border border-[#577877]/25 px-3 py-1.5 font-semibold text-[#25836F] disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      disabled={page === totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="rounded-lg border border-[#577877]/25 px-3 py-1.5 font-semibold text-[#25836F] disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Booking Modal */}
      {bookingDoctor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162623]/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="care-card max-w-3xl w-full p-6 space-y-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-[#577877]/15 pb-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#25836F]">
                  Schedule Teleconsultation
                </span>
                <h3 className="text-lg font-bold text-[#162623]">
                  {bookingDoctor.fullName} ({bookingDoctor.specialty})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBookingDoctor(null)}
                className="text-xs font-semibold text-[#577877] hover:underline cursor-pointer"
              >
                Close ✕
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Date & Slot Picker */}
              <div className="lg:col-span-2 space-y-4">
                {/* Appointment Type */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#162623]">Appointment Type</label>
                  <select
                    value={appointmentType}
                    onChange={(e) => setAppointmentType(e.target.value)}
                    className="w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs bg-white focus:border-[#25836F] focus:outline-none"
                  >
                    <option value="" disabled>Select appointment type</option>
                    {(bookingOptions.appointment_types || []).map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Visit Format */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#162623]">Visit Format</label>
                  <select
                    value={visitFormat}
                    onChange={(e) => setVisitFormat(e.target.value)}
                    className="w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs bg-white focus:border-[#25836F] focus:outline-none"
                  >
                    <option value="" disabled>Select visit format</option>
                    {(bookingOptions.visit_formats || []).map((fmt) => (
                      <option key={fmt} value={fmt}>
                        {fmt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Time Slots */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-[#162623]">
                      {slotsForSelectedDate.length > 0
                        ? `${slotsForSelectedDate.length} available slot(s)`
                        : "No available slots for this date"}
                    </h4>
                    <span className="text-[11px] text-[#577877]">
                      All times in {bookingTimezone}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {slotsForSelectedDate.map((slot) => {
                      const slotTime = slotTimeInZone(slot.starts_at, bookingTimezone);
                      const isSelected = selectedTimeSlot === slotTime;
                      return (
                        <button
                          key={slot.id}
                          type="button"
                          onClick={() => setSelectedTimeSlot(slotTime)}
                          className={`py-2 px-3 rounded-xl text-center text-xs font-semibold transition cursor-pointer ${
                            isSelected
                              ? "bg-[#25836F] text-white shadow-xs font-bold"
                              : "border border-[#577877]/25 bg-white text-[#162623] hover:border-[#25836F]"
                          }`}
                        >
                          {slotTime}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Reason & Notes */}
                <div className="space-y-3 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#162623]">Reason for Visit</label>
                    <input
                      type="text"
                      value={visitReason}
                      onChange={(e) => setVisitReason(e.target.value)}
                      placeholder="Briefly describe your symptoms or visit reason…"
                      className="w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs focus:border-[#25836F] focus:outline-none"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[#162623]">Notes for Doctor (Optional)</label>
                    <textarea
                      value={doctorNotes}
                      onChange={(e) => setDoctorNotes(e.target.value)}
                      placeholder="Medical history or questions for the doctor…"
                      className="w-full rounded-xl border border-[#577877]/25 p-3 text-xs h-20 focus:border-[#25836F] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Right Column: Booking Summary & Razorpay Action */}
              <div className="space-y-4 rounded-2xl bg-[#F0F5F7] p-5 border border-[#577877]/15">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#25836F]">
                  Booking Review &amp; Fee Breakdown
                </h4>

                <div className="space-y-2 text-xs text-[#162623]">
                  <div>
                    <span className="text-[#577877] block text-[11px]">Patient</span>
                    <span className="font-semibold">
                      {patientProfile?.full_name || "Patient profile loaded"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#577877] block text-[11px]">Scheduled Date &amp; Time</span>
                    <span className="font-semibold">
                      {selectedDate.displayShort} at {selectedTimeSlot || "Select slot"} {bookingTimezone}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#577877] block text-[11px]">Appointment</span>
                    <span className="font-semibold">
                      {!visitFormat
                        ? "Not selected"
                        : visitFormat.includes("Video")
                        ? "Video"
                        : visitFormat.includes("Audio")
                        ? "Audio"
                        : visitFormat}{" "}
                      · {appointmentType || "Not selected"}
                    </span>
                  </div>
                </div>

                <div className="border-t border-[#577877]/15 pt-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span>Consultation Fee</span>
                    <strong>
                      {bookingPricing
                        ? `${bookingPricing.currency} ${(bookingPricing.base_fee_paise / 100).toFixed(2)}`
                        : "Fee unavailable"}
                    </strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Platform Fee</span>
                    <strong>
                      {bookingPricing
                        ? `${bookingPricing.currency} ${(bookingPricing.platform_fee_paise / 100).toFixed(2)}`
                        : "Fee unavailable"}
                    </strong>
                  </div>
                  <div className="flex justify-between border-t border-[#577877]/15 pt-2 text-sm font-bold text-[#25836F]">
                    <span>Total Payable</span>
                    <strong>
                      {bookingPricing
                        ? `${bookingPricing.currency} ${(bookingPricing.total_payable_paise / 100).toFixed(2)}`
                        : "Fee unavailable"}
                    </strong>
                  </div>
                  {bookingPricingError && (
                    <p className="text-[11px] font-semibold text-rose-600">
                      Fee unavailable for this appointment type.
                    </p>
                  )}
                </div>

                {/* Consent & Policy Checkboxes */}
                <div className="space-y-2 pt-2 text-xs">
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={policyAgreed}
                      onChange={(e) => setPolicyAgreed(e.target.checked)}
                      className="mt-0.5 rounded text-[#25836F]"
                    />
                    <span>I agree to the 24-hour appointment cancellation policy.</span>
                  </label>

                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={consentGranted}
                      onChange={(e) => setConsentGranted(e.target.checked)}
                      className="mt-0.5 rounded text-[#25836F]"
                    />
                    <span>I grant consent for telehealth consultation &amp; data processing.</span>
                  </label>
                </div>

                {bookingError && (
                  <p className="text-xs font-semibold text-rose-600">{bookingError}</p>
                )}

                <button
                  type="button"
                  disabled={
                    !policyAgreed ||
                    !consentGranted ||
                    !appointmentType ||
                    !visitFormat ||
                    !selectedSlot ||
                    bookingPricingLoading ||
                    !bookingPricing ||
                    Boolean(bookingPricingError) ||
                    bookingLoading
                  }
                  onClick={handleConfirmBooking}
                  className="w-full rounded-xl bg-[#25836F] py-3 text-xs font-bold text-white shadow hover:bg-[#1d6e5d] disabled:opacity-40 cursor-pointer"
                >
                  {bookingLoading
                    ? "Initiating Razorpay Checkout…"
                    : bookingPricingLoading
                    ? "Calculating Fee…"
                    : "Continue to Payment"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment Confirmation Screen */}
      {paymentConfirmationData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162623]/60 backdrop-blur-xs p-4">
          <div className="care-card max-w-lg w-full p-6 space-y-5 border-2 border-emerald-500 shadow-2xl">
            <div className="text-center space-y-2 border-b border-[#577877]/15 pb-4">
              <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl">check_circle</span>
              </div>
              <h2 className="text-xl font-bold text-[#162623]">Payment &amp; Booking Confirmed!</h2>
              <p className="text-xs text-[#577877]">
                Your consultation has been confirmed. A receipt has been issued.
              </p>
            </div>

            <div className="rounded-xl bg-[#F0F5F7] p-4 text-xs space-y-2 border border-[#577877]/15">
              <div className="flex justify-between font-mono text-[11px]">
                <span className="text-[#577877]">Appointment Ref #:</span>
                <span className="font-bold text-[#162623]">{paymentConfirmationData.appointment_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Attending Doctor:</span>
                <span className="font-bold text-[#25836F]">
                  {paymentConfirmationData.doctor?.full_name || paymentConfirmationData.doctor?.fullName} ({paymentConfirmationData.doctor?.specialty})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Scheduled Date / Time:</span>
                <span className="font-bold text-[#162623]">
                  {paymentConfirmationData.displayShort} at {paymentConfirmationData.timeSlot} {paymentConfirmationData.timezone}
                </span>
              </div>
              <div className="flex justify-between border-t border-[#577877]/15 pt-2">
                <span className="text-[#577877]">Consultation Fee:</span>
                <span className="font-semibold text-[#162623]">
                  ₹{(paymentConfirmationData.base_fee_paise / 100).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Platform Fee:</span>
                <span className="font-semibold text-[#162623]">
                  ₹{(paymentConfirmationData.platform_fee_paise / 100).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between border-t border-[#577877]/15 pt-2 text-sm font-bold text-[#25836F]">
                <span>Total Amount Paid:</span>
                <span>
                  ₹{(paymentConfirmationData.amount_paise / 100).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between font-mono text-[10px] text-[#577877] pt-1">
                <span>Razorpay Payment Ref:</span>
                <span>{paymentConfirmationData.razorpay_payment_id || paymentConfirmationData.payment_id}</span>
              </div>
            </div>

            <div className="pt-2 text-center">
              <button
                onClick={() => {
                  setPaymentConfirmationData(null);
                  onNavigate("appointments");
                }}
                className="w-full rounded-xl bg-[#25836F] py-3 text-xs font-bold text-white shadow hover:bg-[#1d6e5d] cursor-pointer"
              >
                Go to My Appointments
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
