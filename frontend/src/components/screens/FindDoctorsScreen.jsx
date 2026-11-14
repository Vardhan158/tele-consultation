import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { patientApi } from "../../lib/api";
import PublicNavbar from "../public/PublicNavbar";

const AVAILABILITY_OPTIONS = [
  "Any time",
  "Available today",
  "Available this week",
  "Weekend availability",
];

const SORT_OPTIONS = [
  "Recommended",
  "Fee: Low to High",
  "Fee: High to Low",
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
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSpecialty = searchParams.get("specialty") || "all";
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedProfileDoctor, setSelectedProfileDoctor] = useState(null);

  const loadDoctors = () => {
    setLoading(true);
    setLoadError("");
    patientApi
      .doctors()
      .then(async (items) => {
        if (!Array.isArray(items)) return;
        const now = new Date();
        const mapped = await Promise.all(
          items.map(async (doctor) => {
            const rawSlots = await patientApi
              .availability(doctor.id)
              .catch(() => []);

            // Filter to ONLY future bookable slots (starts_at > now)
            const futureSlots = Array.isArray(rawSlots)
              ? rawSlots.filter(
                  (slot) => slot && slot.starts_at && new Date(slot.starts_at) > now,
                )
              : [];

            futureSlots.sort(
              (a, b) => new Date(a.starts_at) - new Date(b.starts_at),
            );

            const nextSlot = futureSlots.length ? futureSlots[0] : null;

            const qualList = Array.isArray(doctor.qualifications)
              ? doctor.qualifications.join(", ")
              : doctor.qualifications || "MBBS, MD";

            const isVerified = Boolean(
              doctor.approved_for_consultation || doctor.approval_status === "approved",
            );

            return {
              ...doctor,
              name: doctor.full_name,
              fullName: doctor.full_name,
              clinic: doctor.clinic_name,
              isVerified,
              qualificationsDisplay: qualList,
              experienceYears: doctor.experience_years ?? 5,
              registrationNumber: doctor.registration_number || doctor.registrationNo || "Registration on File",
              bio: doctor.bio || doctor.about || `Qualified ${doctor.specialty || "medical"} specialist providing high-quality teleconsultations, clinical evaluations, and treatment guidance.`,
              languages: doctor.supported_languages || doctor.languages || ["English"],
              fee: doctor.fee_paise == null ? null : doctor.fee_paise / 100,
              feeDisplay:
                doctor.fee_paise == null
                  ? "₹400.00"
                  : `${doctor.currency || "INR"} ${(doctor.fee_paise / 100).toFixed(2)}`,
              feeVideoVisit:
                doctor.fee_paise == null
                  ? "₹400.00 per video visit"
                  : `${doctor.currency || "INR"} ${(doctor.fee_paise / 100).toFixed(2)} per video visit`,
              availability: futureSlots,
              timezone: doctor.timezone || "Asia/Kolkata",
              availableToday: Boolean(
                nextSlot &&
                  new Date(nextSlot.starts_at).toDateString() ===
                    now.toDateString(),
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
                : "No upcoming slots available",
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
    if (!authenticated) return;
    patientApi
      .profile()
      .then((data) => setPatientProfile(data))
      .catch(() => {});
  }, [authenticated]);

  // Filters State
  // We keep draft filters and applied filters so "Apply Filters" operates cleanly
  const [searchInput, setSearchInput] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("Any time");
  const [selectedLanguage, setSelectedLanguage] = useState("all");
  const [sortOption, setSortOption] = useState("Recommended");

  // Applied filter state
  const [appliedFilters, setAppliedFilters] = useState({
    search: "",
    specialty: "all",
    availability: "Any time",
    language: "all",
    sort: "Recommended",
  });

  // Mobile filters collapsible state
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);

  // Booking Flow State
  const [bookingDoctor, setBookingDoctor] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
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

  // Dynamic filter options extracted from API data
  const specialties = useMemo(() => {
    return [...new Set(doctors.map((d) => d.specialty).filter(Boolean))].sort();
  }, [doctors]);

  // Resolve deep links against the live directory, falling back to all doctors.
  useEffect(() => {
    if (loading) return;
    const specialty = specialties.find(
      (value) => value.toLowerCase() === requestedSpecialty.toLowerCase(),
    ) || "all";
    setSelectedSpecialty(specialty);
    setAppliedFilters((current) => ({ ...current, specialty }));
    setPage(1);
  }, [requestedSpecialty, specialties, loading]);

  const updateSpecialtyUrl = (specialty) => {
    const next = new URLSearchParams(searchParams);
    if (specialty === "all") next.delete("specialty");
    else next.set("specialty", specialty);
    setSearchParams(next, { replace: true });
  };

  const languages = useMemo(() => {
    return [...new Set(doctors.flatMap((d) => d.languages || []).filter(Boolean))].sort();
  }, [doctors]);

  const handleApplyFilters = () => {
    updateSpecialtyUrl(selectedSpecialty);
    setAppliedFilters({
      search: searchInput.trim(),
      specialty: selectedSpecialty,
      availability: availabilityFilter,
      language: selectedLanguage,
      sort: sortOption,
    });
    setPage(1);
    setMobileFiltersOpen(false);
  };

  const handleClearFilters = () => {
    updateSpecialtyUrl("all");
    setSearchInput("");
    setSelectedSpecialty("all");
    setAvailabilityFilter("Any time");
    setSelectedLanguage("all");
    setSortOption("Recommended");
    setAppliedFilters({
      search: "",
      specialty: "all",
      availability: "Any time",
      language: "all",
      sort: "Recommended",
    });
    setPage(1);
    setMobileFiltersOpen(false);
  };

  const hasActiveFilters =
    appliedFilters.search !== "" ||
    appliedFilters.specialty !== "all" ||
    appliedFilters.availability !== "Any time" ||
    appliedFilters.language !== "all" ||
    appliedFilters.sort !== "Recommended";

  // Filtered list
  const filteredDoctors = useMemo(() => {
    return doctors.filter((doc) => {
      // Specialty
      if (
        appliedFilters.specialty !== "all" &&
        doc.specialty !== appliedFilters.specialty
      ) {
        return false;
      }
      // Availability
      if (
        appliedFilters.availability === "Available today" &&
        !doc.availableToday
      ) {
        return false;
      }
      if (
        appliedFilters.availability === "Available this week" &&
        (!doc.availability || doc.availability.length === 0)
      ) {
        return false;
      }
      // Language
      if (
        appliedFilters.language !== "all" &&
        !(doc.languages || []).includes(appliedFilters.language)
      ) {
        return false;
      }
      // Search
      if (appliedFilters.search) {
        const q = appliedFilters.search.toLowerCase();
        const matchName = (doc.fullName || "").toLowerCase().includes(q);
        const matchSpec = (doc.specialty || "").toLowerCase().includes(q);
        const matchClinic = (doc.clinic || "").toLowerCase().includes(q);
        return matchName || matchSpec || matchClinic;
      }
      return true;
    });
  }, [doctors, appliedFilters]);

  // Sorted list
  const sortedDoctors = useMemo(() => {
    const list = [...filteredDoctors];
    if (appliedFilters.sort === "Fee: Low to High") {
      list.sort((a, b) => (a.fee || 0) - (b.fee || 0));
    } else if (appliedFilters.sort === "Fee: High to Low") {
      list.sort((a, b) => (b.fee || 0) - (a.fee || 0));
    }
    return list;
  }, [filteredDoctors, appliedFilters.sort]);

  const pageSize = 5;
  const totalPages = Math.ceil(sortedDoctors.length / pageSize) || 1;
  const paginatedDoctors = sortedDoctors.slice(
    (page - 1) * pageSize,
    page * pageSize,
  );

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
      timezone: doctor.timezone,
    };
    setBookingDoctor(currentDoctor);
    setAppointmentType(bookingOptions.appointment_types?.[0] || "");
    setBookingPricing(null);
    setBookingPricingError("");
    setVisitFormat(bookingOptions.visit_formats?.[0] || "");

    if (currentDoctor.nextSlot) {
      const slotDate = new Date(currentDoctor.nextSlot.starts_at);
      const timezone = currentDoctor.timezone;
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

  const selectedMonthIndex = selectedDate
    ? new Date(`${selectedDate.monthName} 1, ${selectedDate.year}`).getMonth()
    : null;
  const bookingTimezone = bookingDoctor?.timezone;
  const selectedDateKey = selectedDate
    ? `${selectedDate.year}-${String(selectedMonthIndex + 1).padStart(2, "0")}-${String(selectedDate.day).padStart(2, "0")}`
    : "";
  const slotsForSelectedDate = (bookingDoctor?.availability || []).filter(
    (slot) => {
      return slotDateKeyInZone(slot.starts_at, bookingTimezone) === selectedDateKey;
    },
  );
  const selectedSlot = slotsForSelectedDate.find((slot) => {
    const slotTime = slotTimeInZone(slot.starts_at, bookingTimezone);
    return slotTime === selectedTimeSlot;
  });

  const handleConfirmBooking = async () => {
    if (!bookingDoctor || !selectedSlot || !bookingPricing) {
      setBookingError("Please select an available slot and an appointment type with valid pricing.");
      return;
    }
    setBookingLoading(true);
    setBookingError("");

    try {
      const orderRes = await patientApi.createOrder({
        doctor_id: bookingDoctor.id,
        appointment_type: appointmentType,
        starts_at: selectedSlot.starts_at,
        visit_format: visitFormat,
        visit_reason: visitReason,
        doctor_notes: doctorNotes,
      });

      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        throw new Error("Payment checkout is unavailable. Please try again.");
      }

      const options = {
        key: orderRes.key_id,
        amount: orderRes.amount_paise,
        currency: orderRes.currency,
        name: "Kaizen Care Telehealth",
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
          name: patientProfile?.full_name,
          email: patientProfile?.email,
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
    <div className="min-h-screen bg-[#F9FBFA] font-sans text-zinc-800 antialiased selection:bg-[#1A7D67] selection:text-white">
      {!authenticated && <PublicNavbar />}

      <div className={`max-w-7xl mx-auto px-5 py-6 lg:px-10 space-y-6 ${!authenticated ? "pt-24 sm:pt-28" : ""}`}>

        {/* Mobile Filter Toggle Header (Visible only on < lg screens) */}
        <div className="lg:hidden flex items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs">
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800">
            <span className="material-symbols-outlined text-[#1A7D67] text-xl">tune</span>
            <span>Filter Clinicians</span>
            {hasActiveFilters && (
              <span className="px-2 py-0.5 rounded-full bg-[#EEF6F3] text-[#1A7D67] text-[10px] font-bold">
                Active Filters
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMobileFiltersOpen((prev) => !prev)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#1A7D67] text-white text-xs font-bold shadow-xs hover:bg-[#156654] transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">
              {mobileFiltersOpen ? "close" : "tune"}
            </span>
            <span>{mobileFiltersOpen ? "Hide Filters" : "Filters"}</span>
          </button>
        </div>

        {/* Main 2-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">

          {/* ========================================================= */}
          {/* LEFT SIDEBAR FILTER PANEL                                 */}
          {/* ========================================================= */}
          <aside
            className={`${
              mobileFiltersOpen ? "block" : "hidden"
            } lg:block lg:col-span-4 xl:col-span-3 space-y-5 lg:sticky lg:top-24 z-10`}
          >
            <div className="rounded-2xl bg-white border border-zinc-200 p-5 sm:p-6 shadow-xs space-y-5">
              {/* Filter Panel Header */}
              <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#1A7D67] text-xl">tune</span>
                  <h2 className="text-base font-bold text-zinc-800">Filters</h2>
                </div>
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="text-xs font-semibold text-[#1A7D67] hover:underline cursor-pointer"
                  >
                    Reset All
                  </button>
                )}
              </div>

              {/* Search Filter */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs text-[#1A7D67]">search</span>
                  Search Doctor
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleApplyFilters();
                    }}
                    placeholder="Name, specialty, or clinic…"
                    className="w-full rounded-xl border border-zinc-300 pl-3.5 pr-8 py-2.5 text-xs text-zinc-800 placeholder:text-zinc-400 bg-[#F9FBFA] focus:bg-white focus:border-[#1A7D67] focus:ring-2 focus:ring-[#1A7D67]/15 focus:outline-none transition"
                  />
                  {searchInput && (
                    <button
                      type="button"
                      onClick={() => setSearchInput("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                      title="Clear search"
                    >
                      <span className="material-symbols-outlined text-base">close</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Specialty Filter */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs text-[#1A7D67]">medical_services</span>
                  Specialty
                </label>
                <select
                  value={selectedSpecialty}
                  onChange={(e) => setSelectedSpecialty(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-xs bg-white text-zinc-800 focus:border-[#1A7D67] focus:ring-2 focus:ring-[#1A7D67]/15 focus:outline-none transition cursor-pointer"
                >
                  <option value="all">All Specialties</option>
                  {specialties.map((spec) => (
                    <option key={spec} value={spec}>
                      {spec}
                    </option>
                  ))}
                </select>
              </div>

              {/* Availability Filter */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs text-[#1A7D67]">event_available</span>
                  Availability
                </label>
                <select
                  value={availabilityFilter}
                  onChange={(e) => setAvailabilityFilter(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-xs bg-white text-zinc-800 focus:border-[#1A7D67] focus:ring-2 focus:ring-[#1A7D67]/15 focus:outline-none transition cursor-pointer"
                >
                  {AVAILABILITY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Language Filter */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs text-[#1A7D67]">translate</span>
                  Language
                </label>
                <select
                  value={selectedLanguage}
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-xs bg-white text-zinc-800 focus:border-[#1A7D67] focus:ring-2 focus:ring-[#1A7D67]/15 focus:outline-none transition cursor-pointer"
                >
                  <option value="all">All Languages</option>
                  {languages.map((lang) => (
                    <option key={lang} value={lang}>
                      {lang}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort By Filter */}
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs text-[#1A7D67]">swap_vert</span>
                  Sort By
                </label>
                <select
                  value={sortOption}
                  onChange={(e) => setSortOption(e.target.value)}
                  className="w-full rounded-xl border border-zinc-300 px-3 py-2.5 text-xs bg-white text-zinc-800 focus:border-[#1A7D67] focus:ring-2 focus:ring-[#1A7D67]/15 focus:outline-none transition cursor-pointer"
                >
                  {SORT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filter Actions */}
              <div className="pt-3 border-t border-zinc-100 space-y-2">
                <button
                  type="button"
                  onClick={handleApplyFilters}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1A7D67] hover:bg-[#156654] text-white text-xs font-bold shadow-xs hover:shadow-md transition duration-300 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">filter_alt</span>
                  Apply Filters
                </button>

                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="w-full px-4 py-2 rounded-xl border border-zinc-300 bg-white text-zinc-600 hover:text-zinc-800 hover:bg-[#F9FBFA] text-xs font-semibold transition cursor-pointer"
                  >
                    Clear All Filters
                  </button>
                )}
              </div>
            </div>
          </aside>

          {/* ========================================================= */}
          {/* RIGHT MAIN CONTENT SECTION                                */}
          {/* ========================================================= */}
          <main className="lg:col-span-8 xl:col-span-9 space-y-5">
            {/* Results Count & Active Filter Pills Bar */}
            <div className="bg-white rounded-2xl border border-zinc-200 p-4 sm:px-5 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="text-zinc-500">
                Showing{" "}
                <span className="font-bold text-zinc-800">
                  {sortedDoctors.length}
                </span>{" "}
                available doctor{sortedDoctors.length === 1 ? "" : "s"}
                {appliedFilters.specialty !== "all" && (
                  <span className="ml-1 text-[#1A7D67] font-semibold">
                    in {appliedFilters.specialty}
                  </span>
                )}
              </div>

              {hasActiveFilters && (
                <div className="flex items-center gap-2">
                  <span className="text-zinc-500">Active filters applied</span>
                  <button
                    type="button"
                    onClick={handleClearFilters}
                    className="text-xs font-semibold text-[#1A7D67] hover:underline cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              )}
            </div>

            {/* Doctor Cards Listing / States */}
            {loading ? (
        <div className="rounded-2xl bg-white border border-zinc-200 p-16 flex flex-col items-center justify-center gap-3 text-zinc-500">
          <span className="material-symbols-outlined animate-spin text-4xl text-[#1A7D67]">
            sync
          </span>
          <p className="text-xs font-medium">Loading clinical directory and schedules…</p>
        </div>
      ) : loadError ? (
        <div className="rounded-2xl bg-white border border-rose-200 p-8 text-center text-rose-600 text-xs font-medium space-y-3">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={loadDoctors}
            className="px-4 py-2 rounded-xl bg-rose-50 text-rose-700 text-xs font-semibold hover:bg-rose-100 transition cursor-pointer"
          >
            Retry Loading
          </button>
        </div>
      ) : paginatedDoctors.length === 0 ? (
        /* Helpful Empty State */
        <div className="rounded-2xl bg-white border border-zinc-200 p-12 sm:p-16 text-center text-zinc-500 space-y-4 max-w-xl mx-auto shadow-xs">
          <div className="w-16 h-16 rounded-full bg-[#EEF6F3] text-[#1A7D67] mx-auto flex items-center justify-center">
            <span className="material-symbols-outlined text-3xl">person_search</span>
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-zinc-800">
              No Clinicians Match Your Criteria
            </h3>
            <p className="text-xs text-zinc-500 max-w-md mx-auto leading-relaxed">
              We couldn't find any doctors matching your search or filter combination. Try clearing your filters or selecting a different specialty.
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={handleClearFilters}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#1A7D67] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#156654] transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">restart_alt</span>
              Clear All Filters
            </button>
          </div>
        </div>
      ) : (
        /* Redesigned Doctor Cards matching Landing Page & Our Services Cards */
        <div className="space-y-4">
          {paginatedDoctors.map((doc) => {
            const hasSlots = Array.isArray(doc.availability) && doc.availability.length > 0;
            const initials = (doc.fullName || "MD")
              .split(/\s+/)
              .filter(Boolean)
              .map((n) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            return (
              <div
                key={doc.id}
                className="rounded-2xl bg-white hover:bg-[#EEF6F3]/40 border border-zinc-200 hover:border-[#1A7D67]/40 p-5 sm:p-6 shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group"
              >
                {/* Main Card Grid */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  {/* Left Column: Avatar & Doctor Details (md: col-span-7 lg: col-span-8) */}
                  <div className="md:col-span-7 lg:col-span-8 flex items-start gap-4 min-w-0">
                    {/* Avatar Pill Circle */}
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-[#EEF6F3] text-[#1A7D67] group-hover:bg-[#1A7D67] group-hover:text-white flex items-center justify-center text-lg sm:text-xl font-bold transition-colors duration-300 shadow-xs shrink-0 select-none">
                      {initials}
                    </div>

                    {/* Details */}
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedProfileDoctor(doc)}
                          className="text-base sm:text-lg font-bold text-zinc-800 group-hover:text-[#1A7D67] transition-colors truncate text-left cursor-pointer"
                        >
                          {doc.fullName}
                        </button>
                        {doc.isVerified && (
                          <span
                            className="material-symbols-outlined text-[#1A7D67] text-base shrink-0"
                            title="Verified Credentials"
                          >
                            verified
                          </span>
                        )}
                        <span className="inline-block px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#EEF6F3] text-[#1A7D67]">
                          {doc.specialty || "General Specialist"}
                        </span>
                        {doc.qualificationsDisplay && (
                          <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200/60">
                            {doc.qualificationsDisplay}
                          </span>
                        )}
                        <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200/60">
                          {doc.experienceYears ? `${doc.experienceYears} Yrs Exp` : "5+ Yrs Exp"}
                        </span>
                      </div>

                      {doc.clinic && (
                        <p className="text-xs text-zinc-500 flex flex-wrap items-center gap-x-3 gap-y-1 truncate">
                          <span className="flex items-center gap-1.5 truncate">
                            <span className="material-symbols-outlined text-sm text-zinc-400 shrink-0">
                              apartment
                            </span>
                            <span className="truncate">{doc.clinic}</span>
                          </span>
                          {doc.registrationNumber && (
                            <span className="text-[11px] text-zinc-500">
                              Reg No: <strong className="font-semibold text-zinc-700">{doc.registrationNumber}</strong>
                            </span>
                          )}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500 pt-0.5">
                        <span className="inline-flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-[#1A7D67]">translate</span>
                          Languages:{" "}
                          <strong className="font-semibold text-zinc-700">
                            {(doc.languages && doc.languages.length > 0)
                              ? doc.languages.join(", ")
                              : "English"}
                          </strong>
                        </span>

                        {doc.timezone && (
                          <span className="inline-flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs text-zinc-400">schedule</span>
                            {doc.timezone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Fee, Availability & Booking Action (md: col-span-5 lg: col-span-4) */}
                  <div className="md:col-span-5 lg:col-span-4 flex flex-col md:items-end justify-between gap-3 border-t md:border-t-0 md:border-l border-zinc-100 pt-4 md:pt-0 md:pl-5">
                    {/* Fee & Next Available */}
                    <div className="md:text-right space-y-0.5">
                      <div className="flex md:block items-baseline justify-between gap-2">
                        <span className="text-[11px] text-zinc-500 md:hidden">Consultation Fee</span>
                        <div className="text-lg font-bold text-[#1A7D67]">
                          {doc.feeDisplay || "Fee calculated at booking"}
                        </div>
                      </div>

                      <div className="text-[11px] text-zinc-500 pt-0.5">
                        Next slot:{" "}
                        <span
                          className={`font-semibold ${
                            hasSlots ? "text-zinc-800" : "text-amber-700"
                          }`}
                        >
                          {doc.nextSlotLabel}
                        </span>
                      </div>
                    </div>

                    {/* Booking & Profile Actions */}
                    <div className="w-full md:w-auto flex flex-col sm:flex-row md:flex-col items-stretch md:items-end gap-2 pt-1">
                      <div className="flex items-center gap-2 w-full md:w-auto">
                        <button
                          type="button"
                          onClick={() => setSelectedProfileDoctor(doc)}
                          className="px-3.5 py-2.5 rounded-xl border border-zinc-300 bg-white hover:bg-white/95 text-zinc-700 hover:text-[#1A7D67] hover:border-[#1A7D67]/30 text-xs font-semibold transition-all duration-300 shadow-2xs cursor-pointer flex items-center justify-center gap-1 shrink-0"
                          title="View detailed doctor profile"
                        >
                          <span className="material-symbols-outlined text-sm text-[#1A7D67]">visibility</span>
                          <span>View Profile</span>
                        </button>

                        <button
                          type="button"
                          disabled={!hasSlots}
                          onClick={() => startBooking(doc)}
                          className={`flex-1 md:flex-none px-4.5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 shadow-xs flex items-center justify-center gap-2 ${
                            hasSlots
                              ? "bg-[#1A7D67] hover:bg-[#156654] text-white hover:shadow-md cursor-pointer"
                              : "bg-zinc-100 text-zinc-400 cursor-not-allowed opacity-75"
                          }`}
                          title={
                            hasSlots
                              ? "Book an appointment with this doctor"
                              : "No appointment slots are currently available for this doctor"
                          }
                        >
                          <span className="material-symbols-outlined text-sm">
                            {hasSlots ? "calendar_add_on" : "event_busy"}
                          </span>
                          <span>{hasSlots ? "Book" : "No Slots"}</span>
                        </button>
                      </div>

                      <div className="text-center md:text-right text-[11px] text-[#577877]">
                        {hasSlots ? (
                          <span className="inline-flex items-center gap-1 text-[#25836F] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#25836F]" />
                            {doc.availability.length} slot{doc.availability.length === 1 ? "" : "s"} open
                          </span>
                        ) : (
                          <span className="text-[#577877]">Check back later</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[#577877]/15 pt-4 text-xs">
              <span className="text-[#577877]">
                Page <strong className="text-[#162623]">{page}</strong> of{" "}
                <strong className="text-[#162623]">{totalPages}</strong>
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-xl border border-[#577877]/25 px-3.5 py-1.5 font-semibold text-[#25836F] bg-white hover:bg-[#F0F5F7] disabled:opacity-40 transition cursor-pointer"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page === totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-xl border border-[#577877]/25 px-3.5 py-1.5 font-semibold text-[#25836F] bg-white hover:bg-[#F0F5F7] disabled:opacity-40 transition cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
          </main>
        </div>

      {/* Detailed Doctor Profile Modal */}
      {selectedProfileDoctor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162623]/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="care-card max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl my-8 relative animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-[#577877]/15 pb-4">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-2xl bg-[#185A4D] text-white flex items-center justify-center text-xl font-bold shadow-xs shrink-0 select-none">
                  {(selectedProfileDoctor.fullName || "MD")
                    .split(/\s+/)
                    .filter(Boolean)
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-[#162623]">
                      {selectedProfileDoctor.fullName}
                    </h2>
                    {selectedProfileDoctor.isVerified && (
                      <span className="material-symbols-outlined text-[#25836F] text-lg" title="Verified Credentials">
                        verified
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-[#F0F5F7] text-[#185A4D]">
                      {selectedProfileDoctor.specialty || "General Specialist"}
                    </span>
                    {selectedProfileDoctor.clinic && (
                      <span className="text-xs text-[#577877]">
                        · {selectedProfileDoctor.clinic}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProfileDoctor(null)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7] hover:text-[#162623] transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Detailed Doctor Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#F0F5F7]/60 p-4 rounded-xl border border-[#577877]/15">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#577877]">Qualifications</div>
                <div className="text-xs font-bold text-[#162623] mt-0.5 truncate" title={selectedProfileDoctor.qualificationsDisplay}>
                  {selectedProfileDoctor.qualificationsDisplay || "MBBS"}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#577877]">Experience</div>
                <div className="text-xs font-bold text-[#162623] mt-0.5">
                  {selectedProfileDoctor.experienceYears ? `${selectedProfileDoctor.experienceYears} Years` : "5+ Years"}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#577877]">Consultation Fee</div>
                <div className="text-xs font-bold text-[#185A4D] mt-0.5">
                  {selectedProfileDoctor.feeDisplay || "₹400.00"}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#577877]">Reg. Number</div>
                <div className="text-xs font-bold text-[#162623] mt-0.5 truncate" title={selectedProfileDoctor.registrationNumber}>
                  {selectedProfileDoctor.registrationNumber || "Reg. on File"}
                </div>
              </div>
            </div>

            {/* Specialization & Scope of Practice */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#577877] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#25836F]">clinical_notes</span>
                Clinical Specialization & Scope of Practice
              </h3>
              <p className="text-xs text-[#162623] leading-relaxed bg-white p-3.5 rounded-xl border border-[#577877]/15">
                {selectedProfileDoctor.bio ||
                  `Qualified ${selectedProfileDoctor.specialty || "medical"} specialist providing high-quality teleconsultations, clinical evaluations, and treatment guidance.`}
              </p>
            </div>

            {/* Languages & Location */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="space-y-1">
                <span className="font-bold text-[#577877] uppercase text-[11px] tracking-wider block">Languages Spoken</span>
                <span className="font-semibold text-[#162623]">
                  {Array.isArray(selectedProfileDoctor.languages) && selectedProfileDoctor.languages.length > 0
                    ? selectedProfileDoctor.languages.join(", ")
                    : "English"}
                </span>
              </div>
              <div className="space-y-1">
                <span className="font-bold text-[#577877] uppercase text-[11px] tracking-wider block">Time Zone</span>
                <span className="font-semibold text-[#162623]">
                  {selectedProfileDoctor.timezone || "Asia/Kolkata"}
                </span>
              </div>
            </div>

            {/* Real-time Schedule Availability */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#577877] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#25836F]">calendar_month</span>
                Available Consultation Schedule ({selectedProfileDoctor.availability?.length || 0} Slots)
              </h3>
              {Array.isArray(selectedProfileDoctor.availability) && selectedProfileDoctor.availability.length > 0 ? (
                <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                  {selectedProfileDoctor.availability.map((slot, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2.5 rounded-lg bg-[#F0F5F7] border border-[#577877]/10 text-xs">
                      <span className="font-semibold text-[#162623]">
                        {new Date(slot.starts_at).toLocaleString([], {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                      <span className="text-[11px] font-bold text-[#25836F] bg-white px-2 py-0.5 rounded border border-[#25836F]/20">
                        {slot.duration_minutes || 30} mins
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-[#577877] italic bg-[#F0F5F7] p-3 rounded-xl">
                  No upcoming schedule slots available at this moment.
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 border-t border-[#577877]/15 pt-4">
              <button
                type="button"
                onClick={() => setSelectedProfileDoctor(null)}
                className="px-4 py-2 rounded-xl border border-[#577877]/25 text-xs font-semibold text-[#577877] hover:bg-[#F0F5F7] transition cursor-pointer"
              >
                Close Profile
              </button>
              {Array.isArray(selectedProfileDoctor.availability) && selectedProfileDoctor.availability.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const docToBook = selectedProfileDoctor;
                    setSelectedProfileDoctor(null);
                    startBooking(docToBook);
                  }}
                  className="px-5 py-2 rounded-xl bg-[#25836F] hover:bg-[#1f6f5e] text-white text-xs font-bold shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">calendar_add_on</span>
                  Book Consultation Now
                </button>
              )}
            </div>
          </div>
        </div>
      )}

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
                      {selectedDate?.displayShort || ""} {selectedTimeSlot || "Select slot"} {bookingTimezone || ""}
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
                type="button"
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
    </div>
  );
}
