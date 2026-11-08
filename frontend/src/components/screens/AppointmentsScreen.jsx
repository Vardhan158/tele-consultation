import { useState, useEffect, useRef } from "react";
import { patientApi, consultationApi } from "../../lib/api";
import WebRtcConsultation from "../consultation/WebRtcConsultation";

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

function formatDbAppointment(apt) {
  const startDate = apt.starts_at ? new Date(apt.starts_at) : new Date();
  const endDate = apt.ends_at
    ? new Date(apt.ends_at)
    : new Date(startDate.getTime() + 30 * 60000);

  const tz = apt.doctor?.timezone || "Asia/Kolkata";

  const dateShort = startDate.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const dateFull = startDate.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const startTime = startDate.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = endDate.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });

  const docName = apt.doctor?.full_name || "Dr. Clinician";
  const docInitials =
    docName
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(-2)
      .join("")
      .toUpperCase() || "DC";

  // Fee calculation from backend records ONLY! No hardcoded $85!
  const totalPaise = apt.total_payable_paise ?? apt.fee_paise ?? (apt.doctor?.fee_paise ?? null);
  const currency = apt.currency;
  const currSymbol = currency === "INR" ? "₹" : "$";

  const isValidatedFree = totalPaise === 0 && apt.payment_status === "not_required";
  const feeFull = isValidatedFree
    ? "NO PAYMENT REQUIRED"
    : totalPaise != null && currency
      ? `${currSymbol}${(totalPaise / 100).toFixed(2)}`
    : "Fee unavailable";

  const isPaid = apt.payment_status === "captured" || apt.payment_status === "success";
  const isPendingPayment = apt.status === "pending_payment" || apt.payment_status === "pending" || apt.payment_status === "pending_payment";
  const canJoinVideo = isPaid || isValidatedFree;

  const statusLabel =
    apt.status === "confirmed"
      ? "Confirmed"
      : apt.status === "completed"
        ? "Completed"
        : apt.status === "cancelled"
          ? "Cancelled"
          : apt.status === "pending_payment"
            ? "Pending Payment"
            : apt.status ? apt.status.charAt(0).toUpperCase() + apt.status.slice(1) : "Confirmed";

  const paymentStatusLabel = isPaid
    ? "Paid"
    : apt.payment_status === "failed"
      ? "Payment Failed"
      : apt.payment_status === "refunded"
        ? "Refunded"
        : "Payment Pending";

  return {
    id: apt.id,
    displayId: apt.id.length > 12 ? `KC-APT-${apt.id.slice(0, 4).toUpperCase()}` : apt.id,
    doctor: {
      id: apt.doctor?.id,
      name: docName,
      fullName: docName,
      initials: docInitials,
      specialty: apt.doctor?.specialty || "General Medicine",
      experienceShort: "Verified Clinician",
      clinic: apt.doctor?.clinic_name || "Kaizentrix Care Center",
      feeDisplay: feeFull,
      timezone: tz,
    },
    reason: apt.type ? `${apt.type} consultation` : "Telehealth video consultation",
    appointmentType: apt.type || "Follow-up Consultation",
    dateShort,
    dateFull,
    timeRange: `${startTime}–${endTime} IST`,
    timeFull: `${startTime}–${endTime} · IST (${tz})`,
    format: "Video appointment",
    status: statusLabel,
    rawStatus: apt.status,
    paymentStatus: paymentStatusLabel,
    rawPaymentStatus: apt.payment_status,
    isPaid,
    isPendingPayment,
    canJoinVideo,
    fee: feeFull,
    feePaise: totalPaise,
    currency,
    starts_at: apt.starts_at,
    ends_at: apt.ends_at,
  };
}

export default function AppointmentsScreen({ onNavigate, navParams }) {
  const [userSelectedView, setUserSelectedView] = useState(null);
  const view = userSelectedView ?? (navParams?.view || "list");
  const setView = (v) => setUserSelectedView(v);

  const [activeTab, setActiveTab] = useState("upcoming");

  const [dbAppointments, setDbAppointments] = useState([]);
  const [consultationRoom, setConsultationRoom] = useState(null);
  const [consultationError, setConsultationError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("Waiting for doctor");
  const videoContainerRef = useRef(null);
  const localVideoRef = useRef(null);
  const mediaStreamRef = useRef(null);

  const fetchAppointments = async () => {
    try {
      const items = await patientApi.appointments();
      if (Array.isArray(items) && items.length > 0) {
        setDbAppointments(items.map(formatDbAppointment));
      }
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  const activeUpcomingList = dbAppointments.filter((a) =>
    ["confirmed", "requested", "pending_payment", "checked_in"].includes(a.rawStatus),
  );
  const activePastList = dbAppointments.filter((a) => a.rawStatus === "completed");
  const activeCancelledList = dbAppointments.filter((a) => a.rawStatus === "cancelled");

  const appointmentHistoryData = dbAppointments.map((a) => ({
    id: a.displayId,
    date: a.dateShort,
    provider: a.doctor.name,
    reason: a.reason,
    status: a.status,
    documents: [{ name: "Summary", type: "summary" }],
  }));

  const [detailAppointment, setDetailAppointment] = useState(
    navParams?.appointment || activeUpcomingList[0] || null,
  );

  const [consultationDuration, setConsultationDuration] = useState(0);
  const [consultationSideTab, setConsultationSideTab] = useState("chat");
  const [consultationChatMessages, setConsultationChatMessages] = useState([
    {
      id: 1,
      sender: "Doctor",
      time: "2:32 PM",
      isMe: false,
      text: "Hi, good to see you. Please share your latest reading when you're ready.",
    },
  ]);
  const [consultationInput, setConsultationInput] = useState("");
  const [consultationMic, setConsultationMic] = useState(true);
  const [consultationCam, setConsultationCam] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [selectedMic, setSelectedMic] = useState("Built-in microphone");
  const [selectedSpeaker, setSelectedSpeaker] = useState("Built-in speakers");
  const [testingSpeaker, setTestingSpeaker] = useState(false);

  const [historyFilterTab, setHistoryFilterTab] = useState("all");
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [historyPage, setHistoryPage] = useState(1);

  const [selectedRescheduleDay, setSelectedRescheduleDay] = useState("13");
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState("10:00 AM");
  const [rescheduleReason, setRescheduleReason] = useState("Schedule conflict");
  const [rescheduleNote, setRescheduleNote] = useState("Thank you for helping me find another time.");

  const [cancellationReason, setCancellationReason] = useState("No longer needed");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [pendingCancelApt, setPendingCancelApt] = useState(null);

  const [toastMessage, setToastMessage] = useState("");

  const handleCompletePayment = async (apt) => {
    try {
      setToastMessage("Initiating Razorpay Checkout...");
      const orderRes = await patientApi.createOrder({
        doctor_id: apt.doctor.id,
        appointment_type: apt.appointmentType || "Follow-up Consultation",
        starts_at: apt.starts_at,
        visit_format: "Video consultation",
        visit_reason: apt.reason || "Consultation",
        doctor_notes: "",
      });

      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        setToastMessage("Payment service is temporarily unavailable. Please try again.");
        return;
      }

      const options = {
        key: orderRes.key_id,
        amount: orderRes.amount_paise,
        currency: orderRes.currency,
        name: "Kaizentrix Care Telehealth",
        description: `${apt.doctor.name} · ${apt.appointmentType || "Consultation"}`,
        order_id: orderRes.order_id,
        handler: async function (response) {
          try {
            await patientApi.verifyPayment({
              payment_id: orderRes.payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setToastMessage("Payment completed & appointment confirmed!");
            fetchAppointments();
          } catch (err) {
            setToastMessage(err.message || "Payment verification failed.");
          }
        },
        modal: {
          ondismiss: function () {
            setToastMessage("Payment checkout cancelled.");
          },
        },
        prefill: {
          name: "Patient",
        },
        theme: {
          color: "#295255",
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      setToastMessage(err.message || "Unable to resume payment.");
    }
  };

  const handleJoinWaitingRoom = async (aptToJoin) => {
    if (!aptToJoin) return;
    if (aptToJoin.isPendingPayment || aptToJoin.rawStatus === "pending_payment" || aptToJoin.rawPaymentStatus === "pending") {
      setToastMessage("Payment is required before joining the consultation room.");
      setTimeout(() => setToastMessage(""), 4000);
      return;
    }
    if (!["confirmed", "checked_in", "rescheduled"].includes(aptToJoin.rawStatus)) {
      setToastMessage("This appointment is not eligible for video consultation yet.");
      setTimeout(() => setToastMessage(""), 4000);
      return;
    }
    setDetailAppointment(aptToJoin);
    setView("waiting-room");
    setConsultationError("");
    setConnectionStatus("Waiting for doctor");
    try {
      const room = await consultationApi.join(aptToJoin.id);
      setConsultationRoom(room);
    } catch (err) {
      setConsultationError(err.message || "Unable to join the waiting room.");
    }
  };

  const handleConfirmCancellation = async () => {
    const targetApt = pendingCancelApt || detailAppointment;
    if (targetApt?.id) {
      try {
        await patientApi.cancelAppointment(targetApt.id);
        setToastMessage("Appointment successfully cancelled.");
        fetchAppointments();
      } catch (err) {
        setToastMessage(`Cancellation notice: ${err.message}`);
      }
    }
    setShowCancelModal(false);
    setView("cancellation");
  };

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 font-sans text-[#162623]">
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 rounded-xl bg-[#295255] text-white p-4 shadow-xl text-xs font-semibold">
          ℹ️ {toastMessage}
        </div>
      )}

      {/* Main View: List of Appointments */}
      {view === "list" && (
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
                My Appointments
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-[#577877]">
                Manage your telehealth appointments, join consultation rooms, and complete payments.
              </p>
            </div>

            <button
              type="button"
              onClick={() => onNavigate("find-doctors")}
              className="rounded-xl bg-[#295255] px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-[#1f3f41] cursor-pointer"
            >
              + Book New Appointment
            </button>
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-6 border-b border-[#577877]/20 pb-2 text-xs font-semibold">
            {[
              { id: "upcoming", label: `Upcoming (${activeUpcomingList.length})` },
              { id: "past", label: `Past (${activePastList.length})` },
              { id: "cancelled", label: `Cancelled (${activeCancelledList.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-2 relative transition cursor-pointer ${
                  activeTab === tab.id ? "text-[#295255] font-bold" : "text-[#577877]"
                }`}
              >
                <span>{tab.label}</span>
                {activeTab === tab.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#295255] rounded-full" />
                )}
              </button>
            ))}
          </div>

          {/* List of Appointments */}
          {activeTab === "upcoming" && (
            <div className="space-y-4">
              {activeUpcomingList.length === 0 ? (
                <div className="care-card p-12 text-center text-[#577877] space-y-2">
                  <span className="material-symbols-outlined text-4xl">calendar_today</span>
                  <h3 className="text-base font-bold text-[#162623]">No Upcoming Appointments</h3>
                  <p className="text-xs max-w-sm mx-auto">
                    You have no upcoming teleconsultations scheduled. Book an appointment to get started.
                  </p>
                </div>
              ) : (
                activeUpcomingList.map((apt, idx) => (
                  <div key={`${apt.id || 'apt'}-${idx}`} className="care-card p-6 space-y-4 shadow-sm hover:border-[#295255]/30">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-[#577877]">{apt.displayId}</span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                            apt.isPendingPayment
                              ? "bg-amber-100 text-amber-900"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {apt.status}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                            apt.isPaid
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-900"
                          }`}
                        >
                          {apt.paymentStatus}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <h3 className="text-base font-bold text-[#162623]">{apt.doctor.name}</h3>
                        <p className="text-xs font-semibold text-[#295255]">{apt.doctor.specialty}</p>
                        <p className="text-xs text-[#577877]">{apt.reason}</p>
                        <p className="text-xs text-[#162623] font-medium pt-1">
                          🗓️ {apt.dateShort} at {apt.timeRange}
                        </p>
                      </div>

                      <div className="text-right space-y-2">
                        <div className="text-lg font-bold text-[#295255]">{apt.fee}</div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          {apt.isPendingPayment ? (
                            <button
                              onClick={() => handleCompletePayment(apt)}
                              className="rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-amber-800 cursor-pointer"
                            >
                              Complete Payment ({apt.fee})
                            </button>
                          ) : apt.canJoinVideo ? (
                            <button
                              onClick={() => handleJoinWaitingRoom(apt)}
                              className="rounded-xl bg-[#295255] px-4 py-2 text-xs font-bold text-white shadow hover:bg-[#1f3f41] cursor-pointer"
                            >
                              Join Video Room
                            </button>
                          ) : (
                            <span className="text-xs text-[#577877]">Video access unavailable until payment is verified.</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "past" && (
            <div className="space-y-4">
              {activePastList.length === 0 ? (
                <div className="care-card p-12 text-center text-[#577877]">
                  No past consultation records found.
                </div>
              ) : (
                activePastList.map((apt, idx) => (
                  <div key={`${apt.id || 'apt'}-${idx}`} className="care-card p-6 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-[#162623]">{apt.doctor.name}</span>
                      <span className="text-[#577877]">{apt.dateShort}</span>
                    </div>
                    <p className="text-xs text-[#577877]">{apt.reason} • {apt.fee}</p>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "cancelled" && (
            <div className="space-y-4">
              {activeCancelledList.length === 0 ? (
                <div className="care-card p-12 text-center text-[#577877]">
                  No cancelled appointments.
                </div>
              ) : (
                activeCancelledList.map((apt, idx) => (
                  <div key={`${apt.id || 'apt'}-${idx}`} className="care-card p-6 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-[#162623]">{apt.doctor.name}</span>
                      <span className="text-red-700 font-bold">Cancelled</span>
                    </div>
                    <p className="text-xs text-[#577877]">{apt.dateShort} • {apt.fee}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
