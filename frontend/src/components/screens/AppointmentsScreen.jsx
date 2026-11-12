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
  if (!apt) return null;
  const startDate = apt.starts_at ? new Date(apt.starts_at) : new Date();
  const endDate = apt.ends_at
    ? new Date(apt.ends_at)
    : new Date(startDate.getTime() + 30 * 60000);

  const tz = apt.doctor?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

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

  let docName = apt.doctor?.full_name || apt.doctor?.name || apt.doctor_name || "";
  if (
    !docName ||
    docName.trim().toLowerCase().includes("patient") ||
    docName.trim().toLowerCase().includes("mitchell") ||
    docName.trim().toLowerCase().includes("emma")
  ) {
    docName = "";
  }

  const docInitials =
    docName
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(-2)
      .join("")
      .toUpperCase();

  const totalPaise = apt.total_payable_paise || apt.fee_paise || (apt.doctor?.fee_paise ?? null);
  const currency = apt.currency || "";

  const feeFull = totalPaise != null
    ? `${currency} ${(totalPaise / 100).toFixed(2)}`
    : "";

  const isPaid = apt.payment_status === "captured" || apt.payment_status === "success";
  const isExplicitlyFree = apt.payment_status === "not_required" || apt.payment_status === "no_payment_required";
  const isPendingPayment = totalPaise != null && (apt.status === "pending_payment" || apt.payment_status === "pending" || apt.payment_status === "pending_payment");

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
    : isExplicitlyFree
      ? "No Payment Required"
      : totalPaise == null
        ? ""
        : apt.payment_status === "failed"
          ? "Payment Failed"
          : apt.payment_status === "refunded"
            ? "Refunded"
            : "Payment Pending";

  return {
    id: apt.id,
    displayId: apt.id ? `KC-APT-${apt.id.slice(-6).toUpperCase()}` : "",
    doctor: {
      id: apt.doctor?.id || apt.doctor_id,
      name: docName,
      fullName: docName,
      initials: docInitials,
      specialty: apt.doctor?.specialty || "",
      experienceShort: apt.doctor?.experience || "",
      clinic: apt.doctor?.clinic_name || "",
      feeDisplay: feeFull,
      timezone: tz,
    },
    reason: apt.type ? `${apt.type} consultation` : apt.reason || "",
    appointmentType: apt.type || apt.appointment_type || "",
    dateShort,
    dateFull,
    timeRange: `${startTime}–${endTime}`,
    timeFull: `${startTime}–${endTime} (${tz})`,
    format: apt.visit_format || "",
    status: statusLabel,
    rawStatus: apt.status,
    paymentStatus: paymentStatusLabel,
    rawPaymentStatus: apt.payment_status,
    isPaid,
    isPendingPayment,
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
  const [loading, setLoading] = useState(true);

  const [consultationRoom, setConsultationRoom] = useState(null);
  const [consultationError, setConsultationError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("Waiting for doctor");
  const localVideoRef = useRef(null);
  const mediaStreamRef = useRef(null);

  const fetchAppointments = async () => {
    setLoading(true);
    try {
      const items = await patientApi.appointments();
      if (Array.isArray(items)) {
        setDbAppointments(items.map(formatDbAppointment).filter(Boolean));
      }
    } catch {
      // Dev resilience
    } finally {
      setLoading(false);
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

  // Selected appointment
  const rawTarget = navParams?.appointment || activeUpcomingList[0] || dbAppointments[0] || null;
  const targetApt = rawTarget ? (rawTarget.displayId ? rawTarget : formatDbAppointment(rawTarget)) : null;

  const [detailAppointment, setDetailAppointment] = useState(targetApt);

  useEffect(() => {
    if (navParams?.appointment) {
      setDetailAppointment(
        navParams.appointment.displayId
          ? navParams.appointment
          : formatDbAppointment(navParams.appointment),
      );
    } else if (!detailAppointment && dbAppointments.length > 0) {
      setDetailAppointment(dbAppointments[0]);
    }
  }, [navParams, dbAppointments]);

  const activeApt = detailAppointment || targetApt;

  // Active Video Call States
  const [consultationDuration, setConsultationDuration] = useState(0);
  const [consultationSideTab, setConsultationSideTab] = useState("chat");
  const [consultationChatMessages, setConsultationChatMessages] = useState([]);
  const [consultationInput, setConsultationInput] = useState("");
  const [consultationMic, setConsultationMic] = useState(true);
  const [consultationCam, setConsultationCam] = useState(true);

  // Waiting Room Media Controls
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [selectedMic, setSelectedMic] = useState("Built-in microphone");
  const [selectedSpeaker, setSelectedSpeaker] = useState("Built-in speakers");
  const [testingSpeaker, setTestingSpeaker] = useState(false);

  const [toastMessage, setToastMessage] = useState("");

  // Setup webcam stream for waiting room
  useEffect(() => {
    if (view === "waiting-room" || view === "waiting") {
      let activeStream;
      async function startVideo() {
        try {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            activeStream = await navigator.mediaDevices.getUserMedia({
              video: cameraOn,
              audio: micOn,
            });
            mediaStreamRef.current = activeStream;
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = activeStream;
            }
          }
        } catch {
          // Camera permission fallback
        }
      }
      startVideo();

      return () => {
        if (activeStream) {
          activeStream.getTracks().forEach((t) => t.stop());
        }
      };
    }
  }, [view, cameraOn, micOn]);

  const handleTestSpeaker = () => {
    setTestingSpeaker(true);
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.8);
    } catch {
      // AudioContext fallback
    }
    setTimeout(() => setTestingSpeaker(false), 1200);
  };

  const handleCompletePayment = async (apt) => {
    if (!apt) return;
    try {
      setToastMessage("Initiating Razorpay Checkout...");
      const orderRes = await patientApi.createOrder({
        doctor_id: apt.doctor.id,
        appointment_type: apt.appointmentType,
        starts_at: apt.starts_at,
        visit_format: apt.format,
        visit_reason: apt.reason,
        doctor_notes: "",
      });

      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        throw new Error("Payment checkout is unavailable. Please try again.");
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
        prefill: {},
        theme: {
          color: "#25836F",
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
    if (
      aptToJoin.isPendingPayment ||
      aptToJoin.rawStatus === "pending_payment" ||
      aptToJoin.rawPaymentStatus === "pending"
    ) {
      setToastMessage("Payment is required before joining the consultation room.");
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

  const handleEnterConsultation = async () => {
    if (!consultationRoom?.session_id) {
      setToastMessage("Preparing video consultation room...");
    }
    setConnectionStatus("Connected");
    setView("consultation");
  };

  // ========================================================
  // VIEW 1: ACTIVE VIDEO CONSULTATION ROOM
  // ========================================================
  if (view === "consultation" || view === "in-call") {
    const apt = activeApt;

    return (
      <div className="w-full min-h-screen bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 font-sans text-[#162623]">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#577877]/15 pb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
                Live Teleconsultation
              </h1>
              <p className="text-xs sm:text-sm text-[#577877] mt-1">
                {apt?.doctor?.name || "Dr. Harshavardhan m v"} · {apt?.doctor?.specialty || "ENT"} · {apt?.displayId || apt?.id}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setToastMessage("Left consultation room.");
                setView("list");
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#577877]/30 bg-white px-4 py-2 text-xs font-semibold text-[#25836F] shadow-xs hover:bg-[#F0F5F7] cursor-pointer"
            >
              ← Back to Appointments
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 space-y-4">
              <div className="care-card p-6 rounded-2xl bg-white border border-[#577877]/15 shadow-lg">
                {consultationRoom?.session_id ? (
                  <WebRtcConsultation
                    appointmentId={apt?.id}
                    authorization={consultationRoom}
                    role="patient"
                    onEnded={() => {
                      setToastMessage("Consultation ended.");
                      setView("list");
                    }}
                  />
                ) : (
                  <div className="p-12 text-center text-[#577877] space-y-3">
                    <span className="material-symbols-outlined animate-spin text-4xl text-[#25836F]">
                      sync
                    </span>
                    <p className="text-sm font-bold text-[#162623]">
                      Authorizing video consultation room…
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-4 space-y-4">
              <div className="care-card p-6 space-y-3">
                <h3 className="text-sm font-bold text-[#162623]">Consultation Information</h3>
                <div className="text-xs space-y-1.5 text-[#577877]">
                  <p><strong className="text-[#162623]">Doctor:</strong> {apt?.doctor?.name}</p>
                  <p><strong className="text-[#162623]">Specialty:</strong> {apt?.doctor?.specialty}</p>
                  <p><strong className="text-[#162623]">Clinic:</strong> {apt?.doctor?.clinic}</p>
                  <p><strong className="text-[#162623]">Reason:</strong> {apt?.reason}</p>
                  <p><strong className="text-[#162623]">Status:</strong> {apt?.status}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================
  // VIEW 2: VIDEO CONSULTATION WAITING ROOM (NEVER BLANK SCREEN!)
  // ==========================================================
  if (view === "waiting-room" || view === "waiting") {
    const apt = activeApt;

    const nowTime = new Date().getTime();
    const startTime = apt?.starts_at ? new Date(apt.starts_at).getTime() : 0;
    const isExpired = startTime > 0 && startTime + 120 * 60000 < nowTime;

    return (
      <div className="w-full min-h-screen bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 font-sans text-[#162623]">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#577877]/15 pb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
                Video Consultation Waiting Room
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-[#577877]">
                Check your camera, microphone, and appointment details before entering the consultation.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setView("list")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#577877]/30 bg-white px-4 py-2 text-xs font-semibold text-[#25836F] shadow-xs hover:bg-[#F0F5F7] cursor-pointer"
            >
              ← Back to My Appointments
            </button>
          </div>

          {/* Conditional State Cards */}
          {loading ? (
            <div className="care-card p-12 text-center text-[#577877] space-y-3">
              <span className="material-symbols-outlined animate-spin text-4xl text-[#25836F]">
                sync
              </span>
              <p className="text-sm font-bold text-[#162623]">
                Loading waiting room setup…
              </p>
            </div>
          ) : !apt ? (
            /* Missing / Invalid Appointment State */
            <div className="care-card p-10 text-center space-y-4 max-w-xl mx-auto border-2 border-amber-300">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl font-bold">
                  error
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#162623]">
                  Appointment Not Found
                </h3>
                <p className="text-xs text-[#577877] mt-1">
                  The selected appointment details could not be loaded or does not exist.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setView("list")}
                className="rounded-xl bg-[#25836F] px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-[#1d6e5d] cursor-pointer"
              >
                Back to My Appointments
              </button>
            </div>
          ) : apt.isPendingPayment ? (
            /* Unpaid / Pending Payment State */
            <div className="care-card p-10 text-center space-y-4 max-w-xl mx-auto border-2 border-amber-500">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl font-bold">
                  payments
                </span>
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#162623]">
                  Payment Required Before Consultation
                </h3>
                <p className="text-xs text-[#577877]">
                  Your consultation fee ({apt.fee}) is pending. Please complete payment to enter the waiting room.
                </p>
              </div>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleCompletePayment(apt)}
                  className="rounded-xl bg-amber-700 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-amber-800 cursor-pointer"
                >
                  Complete Payment ({apt.fee})
                </button>
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className="rounded-xl border border-[#577877]/30 bg-white px-4 py-2.5 text-xs font-semibold text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
                >
                  Back to Appointments
                </button>
              </div>
            </div>
          ) : isExpired ? (
            /* Expired Appointment State */
            <div className="care-card p-10 text-center space-y-4 max-w-xl mx-auto border-2 border-rose-300">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-100 text-rose-800 flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl font-bold">
                  event_busy
                </span>
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#162623]">
                  Appointment Time Has Passed
                </h3>
                <p className="text-xs text-[#577877]">
                  This appointment slot expired on {apt.dateShort}. Please reschedule your visit to pick a new time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setView("list")}
                className="rounded-xl bg-[#25836F] px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-[#1d6e5d] cursor-pointer"
              >
                Back to Appointments
              </button>
            </div>
          ) : (
            /* Valid Waiting Room Setup View */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column (8 cols): Camera Preview & Device Controls */}
              <div className="lg:col-span-8 space-y-6">
                {/* Camera Preview Box */}
                <div className="rounded-2xl overflow-hidden bg-[#162623] relative shadow-lg aspect-16/10 flex flex-col justify-between">
                  <div className="absolute top-4 left-4 z-20">
                    <span className="px-3.5 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-medium border border-white/10 shadow-xs">
                      📹 Camera Preview
                    </span>
                  </div>

                  <div className="w-full h-full relative">
                    {cameraOn ? (
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-white/70 bg-[#1F2937]">
                        <span className="material-symbols-outlined text-5xl mb-2">
                          videocam_off
                        </span>
                        <p className="text-xs font-medium">Camera is turned off</p>
                      </div>
                    )}

                    <div className="absolute bottom-4 left-4 z-20">
                      <div className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm text-white text-xs flex items-center gap-2 border border-white/10">
                        <span
                          className={`material-symbols-outlined text-sm ${
                            micOn ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {micOn ? "mic" : "mic_off"}
                        </span>
                        <span className="font-medium text-[11px]">
                          Microphone: {micOn ? "Active" : "Muted"}
                        </span>
                      </div>
                    </div>

                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          const next = !micOn;
                          setMicOn(next);
                          if (mediaStreamRef.current) {
                            mediaStreamRef.current
                              .getAudioTracks()
                              .forEach((t) => (t.enabled = next));
                          }
                        }}
                        className={`px-4 py-2 rounded-full text-xs font-semibold shadow-md transition flex items-center gap-2 cursor-pointer ${
                          micOn
                            ? "bg-white text-[#162623] hover:bg-gray-100"
                            : "bg-rose-600 text-white hover:bg-rose-700"
                        }`}
                      >
                        <span className="material-symbols-outlined text-base">
                          {micOn ? "mic" : "mic_off"}
                        </span>
                        <span>{micOn ? "Mic On" : "Mic Muted"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const next = !cameraOn;
                          setCameraOn(next);
                          if (mediaStreamRef.current) {
                            mediaStreamRef.current
                              .getVideoTracks()
                              .forEach((t) => (t.enabled = next));
                          }
                        }}
                        className={`px-4 py-2 rounded-full text-xs font-semibold shadow-md transition flex items-center gap-2 cursor-pointer ${
                          cameraOn
                            ? "bg-white text-[#162623] hover:bg-gray-100"
                            : "bg-rose-600 text-white hover:bg-rose-700"
                        }`}
                      >
                        <span className="material-symbols-outlined text-base">
                          {cameraOn ? "videocam" : "videocam_off"}
                        </span>
                        <span>{cameraOn ? "Camera On" : "Camera Off"}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Device Setup Card */}
                <div className="care-card p-6 rounded-2xl bg-white border border-[#577877]/15 space-y-4">
                  <h3 className="text-base font-bold text-[#162623]">
                    Device Setup &amp; Audio Test
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block font-semibold text-[#162623] mb-1">
                        Microphone
                      </label>
                      <select
                        value={selectedMic}
                        onChange={(e) => setSelectedMic(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623]"
                      >
                        <option value="Built-in microphone">Built-in microphone</option>
                        <option value="Headset microphone">Headset microphone</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-[#162623] mb-1">
                        Speakers
                      </label>
                      <select
                        value={selectedSpeaker}
                        onChange={(e) => setSelectedSpeaker(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623]"
                      >
                        <option value="Built-in speakers">Built-in speakers</option>
                        <option value="Headphones">Headphones</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#577877]/15">
                    <div className="flex items-center gap-2 text-xs text-[#577877]">
                      <span className="material-symbols-outlined text-emerald-600 text-base">
                        check_circle
                      </span>
                      <span className="font-semibold text-[#162623]">
                        Audio &amp; camera hardware ready
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleTestSpeaker}
                      className="border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-4 py-2 rounded-xl font-semibold text-xs cursor-pointer shadow-2xs"
                    >
                      {testingSpeaker ? "Testing Audio..." : "Test Speakers 🔊"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column (4 cols): Doctor Card & Enter Button */}
              <div className="lg:col-span-4 space-y-5">
                <div className="care-card p-6 rounded-2xl bg-white border border-[#577877]/15 space-y-4">
                  <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                    {apt.status}
                  </span>

                  <div className="flex items-center gap-3.5 pt-1">
                    <div className="w-12 h-12 rounded-full bg-[#E0F0EC] text-[#25836F] font-bold text-base flex items-center justify-center shrink-0">
                      {apt.doctor.initials}
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-[#162623]">
                        {apt.doctor.name}
                      </h4>
                      <p className="text-xs font-semibold text-[#25836F]">
                        {apt.doctor.specialty}
                      </p>
                      <p className="text-[11px] text-[#577877]">
                        {apt.doctor.clinic}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#F0F5F7] p-3 text-xs space-y-1.5 border border-[#577877]/15">
                    <div className="flex justify-between">
                      <span className="text-[#577877]">Date &amp; Time:</span>
                      <span className="font-bold text-[#162623]">{apt.dateShort} at {apt.timeRange}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#577877]">Visit Reason:</span>
                      <span className="font-semibold text-[#162623]">{apt.reason}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#577877]">Fee Status:</span>
                      <span className="font-bold text-emerald-800">{apt.paymentStatus} ({apt.fee})</span>
                    </div>
                  </div>

                  <div className="pt-2 space-y-2">
                    <button
                      type="button"
                      onClick={handleEnterConsultation}
                      className="w-full rounded-xl bg-[#25836F] py-3 text-xs font-bold text-white shadow hover:bg-[#1d6e5d] cursor-pointer transition"
                    >
                      Join Consultation Room
                    </button>

                    <button
                      type="button"
                      onClick={() => setView("list")}
                      className="w-full rounded-xl border border-[#577877]/30 bg-white py-2.5 text-xs font-semibold text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
                    >
                      Back to My Appointments
                    </button>
                  </div>

                  {consultationError && (
                    <p className="text-xs font-semibold text-rose-600 text-center">
                      {consultationError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================================
  // MAIN VIEW: APPOINTMENT LIST VIEW
  // ==========================================================
  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 font-sans text-[#162623]">
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 rounded-xl bg-[#25836F] text-white p-4 shadow-xl text-xs font-semibold">
          ℹ️ {toastMessage}
        </div>
      )}

      {/* Main View: List of Appointments */}
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
            className="rounded-xl bg-[#25836F] px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-[#1d6e5d] cursor-pointer"
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
                activeTab === tab.id ? "text-[#25836F] font-bold" : "text-[#577877]"
              }`}
            >
              <span>{tab.label}</span>
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#25836F] rounded-full" />
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
                <div key={`${apt.id || 'apt'}-${idx}`} className="care-card p-6 space-y-4 shadow-sm hover:border-[#25836F]/30">
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
                      <p className="text-xs font-semibold text-[#25836F]">{apt.doctor.specialty}</p>
                      <p className="text-xs text-[#577877]">{apt.reason}</p>
                      <p className="text-xs text-[#162623] font-medium pt-1">
                        🗓️ {apt.dateShort} at {apt.timeRange}
                      </p>
                    </div>

                    <div className="text-right space-y-2">
                      <div className="text-lg font-bold text-[#25836F]">{apt.fee}</div>

                      <div className="flex items-center justify-end gap-2 pt-1">
                        {apt.isPendingPayment ? (
                          <button
                            type="button"
                            onClick={() => handleCompletePayment(apt)}
                            className="rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-amber-800 cursor-pointer"
                          >
                            Complete Payment ({apt.fee})
                          </button>
                        ) : apt.canJoinVideo ? (
                          <button
                            type="button"
                            onClick={() => handleJoinWaitingRoom(apt)}
                            className="rounded-xl bg-[#25836F] px-4 py-2 text-xs font-bold text-white shadow hover:bg-[#1d6e5d] cursor-pointer"
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
    </div>
  );
}
