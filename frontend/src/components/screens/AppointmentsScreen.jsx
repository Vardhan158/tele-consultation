import { useState, useEffect, useRef } from "react";
import { patientApi, consultationApi } from "../../lib/api";
import WebRtcConsultation from "../consultation/WebRtcConsultation";

function formatDbAppointment(apt) {
  const startDate = apt.starts_at ? new Date(apt.starts_at) : new Date();
  const endDate = apt.ends_at
    ? new Date(apt.ends_at)
    : new Date(startDate.getTime() + 30 * 60000);

  const dateShort = startDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const dateFull = startDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const startTime = startDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = endDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const docName = apt.doctor?.full_name || "Dr. Sarah Chen";
  const docInitials =
    docName
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(-2)
      .join("")
      .toUpperCase() || "SC";
  const feeDisplay = apt.doctor?.fee_paise
    ? `$${(apt.doctor.fee_paise / 100).toFixed(0)}`
    : "$85";
  const feeFull = apt.doctor?.fee_paise
    ? `$${(apt.doctor.fee_paise / 100).toFixed(2)}`
    : "$85.00";

  const statusLabel =
    apt.status === "confirmed"
      ? "Confirmed"
      : apt.status === "completed"
        ? "Completed"
        : apt.status === "cancelled"
          ? "Cancelled"
          : apt.status === "pending_payment"
            ? "Pending Payment"
            : apt.status.charAt(0).toUpperCase() + apt.status.slice(1);

  return {
    id: apt.id,
    displayId:
      apt.id.length > 12
        ? `KC-APT-${apt.id.slice(0, 4).toUpperCase()}`
        : apt.id,
    doctor: {
      id: apt.doctor?.id,
      name: docName,
      fullName: `${docName}, MD`,
      initials: docInitials,
      specialty: apt.doctor?.specialty || "Internal medicine",
      experienceShort: "12 years of experience",
      clinic: apt.doctor?.clinic_name || "Kaizentrix Medical Center",
      feeDisplay: feeDisplay,
    },
    reason: apt.reason || "Telehealth video consultation",
    dateShort,
    dateFull,
    timeRange: `${startTime}–${endTime} PT`,
    timeFull: `${startTime}–${endTime} · Pacific Time`,
    format: "Video appointment",
    status: statusLabel,
    rawStatus: apt.status,
    fee: feeFull,
    cardLast4: "4242",
    starts_at: apt.starts_at,
    ends_at: apt.ends_at,
  };
}

const upcomingAppointmentsList = [
  {
    id: "00000000-0000-0000-0000-000000001064",
    displayId: "KC-APT-1064",
    doctor: {
      name: "Dr. Sarah Chen",
      fullName: "Dr. Sarah Chen, MD",
      initials: "SC",
      specialty: "Internal medicine",
      experienceShort: "12 years of experience",
      clinic: "Kaizentrix Medical Center",
      feeDisplay: "$85",
    },
    reason: "Blood pressure follow-up",
    dateShort: "Thu, Nov 12, 2026",
    dateFull: "Thursday, November 12, 2026",
    timeRange: "2:30–3:00 PM PT",
    timeFull: "2:30–3:00 PM · Pacific Time",
    format: "Video appointment",
    status: "Confirmed",
    fee: "$85.00",
    cardLast4: "4242",
  },
  {
    id: "00000000-0000-0000-0000-000000001072",
    displayId: "KC-APT-1072",
    doctor: {
      name: "Dr. Avery Wilson",
      fullName: "Dr. Avery Wilson, MD",
      initials: "AW",
      specialty: "Dermatology",
      experienceShort: "8 years of experience",
      clinic: "San Francisco Health Hub",
      feeDisplay: "$65",
    },
    reason: "Skin health consultation",
    dateShort: "Tue, Nov 17, 2026",
    dateFull: "Tuesday, November 17, 2026",
    timeRange: "10:00–10:30 AM PT",
    timeFull: "10:00–10:30 AM · Pacific Time",
    format: "Video appointment",
    status: "Confirmed",
    fee: "$65.00",
    cardLast4: "4242",
  },
];

// Legacy fixture retained only for backwards-compatible layout data.
// eslint-disable-next-line no-unused-vars
const pastAppointmentsList = [
  {
    id: "00000000-0000-0000-0000-000000001038",
    displayId: "KC-APT-1038",
    doctor: {
      name: "Dr. Sarah Chen",
      fullName: "Dr. Sarah Chen, MD",
      initials: "SC",
      specialty: "Internal medicine",
      clinic: "Kaizentrix Medical Center",
    },
    reason: "Hypertension Management Consultation",
    dateShort: "Thu, Oct 29, 2026",
    timeRange: "11:00–11:30 AM PT",
    format: "Video appointment",
    status: "Completed",
    fee: "$85.00",
  },
  {
    id: "00000000-0000-0000-0000-000000001011",
    displayId: "KC-APT-1011",
    doctor: {
      name: "Dr. Sarah Chen",
      fullName: "Dr. Sarah Chen, MD",
      initials: "SC",
      specialty: "Internal medicine",
      clinic: "Kaizentrix Medical Center",
    },
    reason: "Routine follow-up",
    dateShort: "Thu, Sep 24, 2026",
    timeRange: "9:30–10:00 AM PT",
    format: "Video appointment",
    status: "Completed",
    fee: "$85.00",
  },
];

// eslint-disable-next-line no-unused-vars
const cancelledAppointmentsList = [
  {
    id: "KC-APT-0954",
    displayId: "KC-APT-0954",
    doctor: {
      name: "Dr. Avery Wilson",
      fullName: "Dr. Avery Wilson, MD",
      initials: "AW",
      specialty: "Dermatology",
      clinic: "San Francisco Health Hub",
    },
    reason: "Skin consultation",
    dateShort: "Wed, Jul 22, 2026",
    timeRange: "3:00–3:30 PM PT",
    format: "Video appointment",
    status: "Cancelled",
    fee: "$65.00",
  },
];

const availableRescheduleDates = [
  { dayName: "THU", dayNum: "12", month: "Nov", isCurrent: true },
  { dayName: "FRI", dayNum: "13", month: "Nov", isCurrent: false },
  { dayName: "SAT", dayNum: "14", month: "Nov", isCurrent: false },
  { dayName: "MON", dayNum: "16", month: "Nov", isCurrent: false },
  { dayName: "TUE", dayNum: "17", month: "Nov", isCurrent: false },
];

const availableRescheduleSlots = [
  { time: "9:00 AM", slotRange: "9:00–9:30 AM PT" },
  { time: "10:00 AM", slotRange: "10:00–10:30 AM PT" },
  { time: "11:30 AM", slotRange: "11:30 AM–12:00 PM PT" },
];

// eslint-disable-next-line no-unused-vars
const defaultHistoryData = [
  {
    id: "KC-APT-1038",
    date: "Oct 29, 2026",
    provider: "Dr. Sarah Chen",
    reason: "Blood pressure review",
    status: "Completed",
    documents: [
      { name: "Summary", type: "summary" },
      { name: "Prescription", type: "prescription" },
    ],
  },
  {
    id: "KC-APT-1011",
    date: "Sep 24, 2026",
    provider: "Dr. Sarah Chen",
    reason: "Routine follow-up",
    status: "Completed",
    documents: [{ name: "Summary", type: "summary" }],
  },
  {
    id: "KC-APT-0987",
    date: "Aug 19, 2026",
    provider: "Dr. Michael Patel",
    reason: "Annual wellness",
    status: "Completed",
    documents: [
      { name: "Summary", type: "summary" },
      { name: "Lab report", type: "lab" },
    ],
  },
  {
    id: "KC-APT-0954",
    date: "Jul 22, 2026",
    provider: "Dr. Avery Wilson",
    reason: "Skin consultation",
    status: "Cancelled",
    documents: [{ name: "Cancellation details", type: "cancellation" }],
  },
];

export default function AppointmentsScreen({ onNavigate, navParams }) {
  // 'consultation' (Matches Screenshot 15) | 'waiting-room' (Matches Screenshot 14) | 'history' (Matches Screenshot 13) | 'cancellation' (Matches Screenshot 12) | 'reschedule' (Matches Screenshot 11) | 'confirmation' (Matches Screenshot 6) | 'list' (Matches Screenshot 7)
  const [userSelectedView, setUserSelectedView] = useState(null);
  const view = userSelectedView ?? (navParams?.view || "list");
  const setView = (v) => setUserSelectedView(v);

  // Tab: 'upcoming' | 'past' | 'cancelled'
  const [activeTab, setActiveTab] = useState("upcoming");

  const [dbAppointments, setDbAppointments] = useState([]);
  const [consultationRoom, setConsultationRoom] = useState(null);
  const [consultationError, setConsultationError] = useState("");
  const [connectionStatus, setConnectionStatus] =
    useState("Waiting for doctor");
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
    // The async request synchronizes this screen with the API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAppointments();
  }, []);

  const activeUpcomingList =
    dbAppointments.length > 0
      ? dbAppointments.filter((a) =>
          ["confirmed", "requested", "pending_payment", "checked_in"].includes(
            a.rawStatus,
          ),
        )
      : [];
  const activePastList =
    dbAppointments.length > 0
      ? dbAppointments.filter((a) => a.rawStatus === "completed")
      : [];
  const activeCancelledList =
    dbAppointments.length > 0
      ? dbAppointments.filter((a) => a.rawStatus === "cancelled")
      : [];

  const appointmentHistoryData =
    dbAppointments.length > 0
      ? dbAppointments.map((a) => ({
          id: a.displayId,
          date: a.dateShort,
          provider: a.doctor.name,
          reason: a.reason,
          status: a.status,
          documents: [{ name: "Summary", type: "summary" }],
        }))
      : [];

  // Selected appointment for detail/confirmation/reschedule/cancellation card
  const [detailAppointment, setDetailAppointment] = useState(
    navParams?.appointment ||
      (navParams?.view === "cancellation" || navParams?.view === "cancelled"
        ? activeUpcomingList[1] || activeUpcomingList[0]
        : activeUpcomingList[0]),
  );

  // Active Consultation States (Matches Screenshot 15)
  const [consultationDuration, setConsultationDuration] = useState(0);
  const [consultationSideTab, setConsultationSideTab] = useState("chat"); // 'chat' | 'details'
  const [consultationChatMessages, setConsultationChatMessages] = useState([
    {
      id: 1,
      sender: "Dr. Sarah Chen",
      time: "2:32 PM",
      isMe: false,
      text: "Hi Emma, good to see you. Please share your latest blood pressure log when you're ready.",
    },
    {
      id: 2,
      sender: "You",
      time: "2:33 PM",
      isMe: true,
      text: "Of course — I've attached the readings from this week.",
      attachment: "bp-log-nov.pdf · 245 KB",
    },
  ]);
  const [consultationInput, setConsultationInput] = useState("");
  const [consultationMic, setConsultationMic] = useState(true);
  const [consultationCam, setConsultationCam] = useState(true);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // Waiting Room States (Matches Screenshot 14)
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [selectedMic, setSelectedMic] = useState("Built-in microphone");
  const [selectedSpeaker, setSelectedSpeaker] = useState("Built-in speakers");
  const [testingSpeaker, setTestingSpeaker] = useState(false);

  // History States (Matches Screenshot 13)
  const [historyFilterTab, setHistoryFilterTab] = useState("all");
  const [historySearchTerm, setHistorySearchTerm] = useState("");
  const [historyDateRange, setHistoryDateRange] = useState("2026");
  const [historyPage, setHistoryPage] = useState(1);

  // Reschedule Interactive States (Matches Screenshot 11)
  const [selectedRescheduleDay, setSelectedRescheduleDay] = useState("13"); // Default Friday Nov 13
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] =
    useState("10:00 AM");
  const [rescheduleReason, setRescheduleReason] = useState("Schedule conflict");
  const [rescheduleNote, setRescheduleNote] = useState(
    "Thank you for helping me find another time.",
  );

  // Cancellation States (Matches Screenshot 12)
  const [cancellationReason, setCancellationReason] =
    useState("No longer needed");
  const [cancellationDate] = useState("November 4, 2026 · 9:45 AM PT");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [pendingCancelApt, setPendingCancelApt] = useState(null);

  // Modals & UI states
  const [showDeviceModal, setShowDeviceModal] = useState(false);
  const [deviceCheckState, setDeviceCheckState] = useState({
    mic: "Passed",
    cam: "Passed",
    speaker: "Passed",
    network: "Optimal (18ms latency, 85 Mbps)",
  });
  const [showReceipt, setShowReceipt] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Setup webcam stream for waiting room
  useEffect(() => {
    if (view === "waiting-room") {
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
          // Camera/microphone permission or device fallback
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
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        audioCtx.currentTime + 0.8,
      );
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.8);
    } catch {
      // AudioContext fallback
    }
    setTimeout(() => setTestingSpeaker(false), 1200);
  };

  const handleDownloadIcs = (apt = detailAppointment) => {
    const icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Kaizentrix Care//Patient Portal//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `SUMMARY:Telehealth with ${apt.doctor.name}`,
      `DESCRIPTION:Video consultation on Kaizentrix Care. Reason: ${apt.reason}. Appointment ID: ${apt.id}`,
      "LOCATION:Kaizentrix Care Patient Portal (Video Room)",
      "DTSTART:20261112T223000Z",
      "DTEND:20261112T230000Z",
      "STATUS:CONFIRMED",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([icsContent], {
      type: "text/calendar;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `${apt.id}-appointment.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToastMessage(
      "Appointment downloaded (.ics) for Apple/Google/Outlook calendar.",
    );
    setTimeout(() => setToastMessage(""), 4000);
  };

  const handleExportHistory = () => {
    const csvRows = [
      ["Date", "Provider", "Visit Reason", "Status", "Appointment ID"],
      ...appointmentHistoryData.map((item) => [
        `"${item.date}"`,
        `"${item.provider}"`,
        `"${item.reason}"`,
        `"${item.status}"`,
        `"${item.id}"`,
      ]),
    ];
    const csvContent = csvRows.map((e) => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "KC-Appointment-History-2026.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToastMessage("Appointment history exported to CSV successfully.");
    setTimeout(() => setToastMessage(""), 4000);
  };

  const handleCancelAppointment = (apt) => {
    setPendingCancelApt(apt);
    setShowCancelModal(true);
  };

  const handleConfirmCancellation = async () => {
    const targetApt = pendingCancelApt || detailAppointment;
    if (targetApt?.id) {
      try {
        await patientApi.cancelAppointment(targetApt.id);
        setToastMessage(
          "Appointment successfully cancelled. Refund initiated if eligible.",
        );
        fetchAppointments();
      } catch (err) {
        setToastMessage(`Cancellation notice: ${err.message}`);
      }
    }
    if (pendingCancelApt) {
      setDetailAppointment(pendingCancelApt);
    }
    setShowCancelModal(false);
    setView("cancellation");
  };

  const handleConfirmReschedule = async () => {
    const chosenDayObj = availableRescheduleDates.find(
      (d) => d.dayNum === selectedRescheduleDay,
    );
    const dateFormatted = `${chosenDayObj?.dayName === "FRI" ? "Friday" : chosenDayObj?.dayName || "Day"}, November ${selectedRescheduleDay}, 2026`;
    const timeFormatted = `${selectedRescheduleSlot === "10:00 AM" ? "10:00–10:30 AM" : selectedRescheduleSlot} · Pacific Time`;

    if (detailAppointment?.id) {
      try {
        const parts = selectedRescheduleSlot.replace(/ (AM|PM)/, "").split(":");
        let hour = parseInt(parts[0], 10);
        if (selectedRescheduleSlot.includes("PM") && hour !== 12) hour += 12;
        if (selectedRescheduleSlot.includes("AM") && hour === 12) hour = 0;
        const newIso = `2026-11-${String(selectedRescheduleDay).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${parts[1] || "00"}:00Z`;
        await patientApi.rescheduleAppointment(detailAppointment.id, newIso);
        setToastMessage("Appointment rescheduled successfully.");
        fetchAppointments();
      } catch (err) {
        setToastMessage(`Reschedule notice: ${err.message}`);
      }
    }

    setDetailAppointment((prev) => ({
      ...prev,
      dateShort: `${chosenDayObj?.dayName || "Fri"}, Nov ${selectedRescheduleDay}, 2026`,
      dateFull: dateFormatted,
      timeRange: `${selectedRescheduleSlot === "10:00 AM" ? "10:00–10:30 AM" : selectedRescheduleSlot} PT`,
      timeFull: timeFormatted,
    }));

    setToastMessage(
      `Appointment successfully rescheduled to ${dateFormatted} at ${selectedRescheduleSlot} PT.`,
    );
    setView("confirmation");
    setTimeout(() => setToastMessage(""), 4500);
  };

  const handleJoinWaitingRoom = async (aptToJoin) => {
    if (
      !aptToJoin ||
      !["confirmed", "checked_in", "rescheduled"].includes(aptToJoin.rawStatus)
    ) {
      setToastMessage(
        "This appointment is not eligible for video consultation yet.",
      );
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
    if (!consultationRoom?.session_id) return;
    const status = await consultationApi
      .status(consultationRoom.session_id)
      .catch((err) => {
        setConsultationError(
          err.message || "Unable to check consultation status.",
        );
        return null;
      });
    if (status?.status === "in_progress") {
      setConnectionStatus("Connecting");
      setView("consultation");
    } else {
      setConnectionStatus("Waiting for doctor");
      setToastMessage("The doctor has not admitted you yet.");
    }
  };

  useEffect(() => {
    if (view !== "waiting-room" || !consultationRoom?.session_id)
      return undefined;
    const poll = setInterval(async () => {
      const status = await consultationApi
        .status(consultationRoom.session_id)
        .catch(() => null);
      if (status?.status) {
        setConsultationRoom((room) =>
          room ? { ...room, status: status.status } : room,
        );
      }
      if (status?.status === "in_progress")
        setConnectionStatus("Ready to connect");
    }, 3000);
    return () => clearInterval(poll);
  }, [view, consultationRoom]);

  useEffect(() => {
    if (view !== "consultation") return undefined;
    const timer = setInterval(
      () => setConsultationDuration((seconds) => seconds + 1),
      1000,
    );
    return () => clearInterval(timer);
  }, [view]);

  const handleLeaveConsultation = async () => {
    if (
      window.confirm("Are you sure you want to leave this video consultation?")
    ) {
      if (consultationRoom?.session_id) {
        try {
          await consultationApi.disconnected(consultationRoom.session_id);
        } catch {
          // Dev resilience
        }
      }
      setToastMessage("You have left the video consultation.");
      setView("list");
      setTimeout(() => setToastMessage(""), 4000);
    }
  };

  const formatCallTimer = (sec) => {
    const mins = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(mins).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const handleSendConsultationMessage = (e) => {
    e.preventDefault();
    if (!consultationInput.trim()) return;
    const newMsg = {
      id: Date.now(),
      sender: "You",
      time: "2:34 PM",
      isMe: true,
      text: consultationInput,
    };
    setConsultationChatMessages((prev) => [...prev, newMsg]);
    setConsultationInput("");
  };

  // ========================================================
  // VIEW G: ACTIVE VIDEO CONSULTATION (Matches Screenshot 15)
  // ========================================================
  if (view === "consultation" || view === "in-call") {
    const apt = detailAppointment || upcomingAppointmentsList[0];

    return (
      <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Heading Row matching Screenshot */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
                Your consultation
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-[#577877]">
                {apt.doctor.name} · {apt.doctor.specialty} · {apt.id}
              </p>
            </div>

            {/* Connected Badge matching Screenshot */}
            <div className="flex items-center gap-2 self-start sm:self-auto">
              <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#E6F4EA] text-[#1E7E34] text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-[#1E7E34] animate-pulse" />
                <span>Connected · {formatCallTimer(consultationDuration)}</span>
              </span>
            </div>
          </div>

          {/* Main 2-Column Content Layout matching Screenshot */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column (8 cols): Main Video Feed + Controls Bar + Note */}
            <div className="lg:col-span-8 space-y-4">
              {/* VIDEO FEED CONTAINER matching Screenshot */}
              <div
                ref={videoContainerRef}
                className="rounded-2xl overflow-hidden bg-[#162623] relative shadow-lg aspect-16/10 flex flex-col justify-between"
              >
                {consultationRoom?.session_id && (
                  <WebRtcConsultation
                    appointmentId={apt.id}
                    authorization={consultationRoom}
                    role="patient"
                    onEnded={() => setView("list")}
                  />
                )}

                {/* Top Left Badge: Good connection */}
                <div className="absolute top-4 left-4 z-20">
                  <div className="px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-md text-white text-xs font-medium border border-white/10 flex items-center gap-2 shadow-xs">
                    <span className="material-symbols-outlined text-sm text-emerald-400">
                      signal_cellular_alt
                    </span>
                    <span>{connectionStatus}</span>
                  </div>
                </div>

                {/* Main Video View: Dr. Sarah Chen */}
                <div className="w-full h-full relative">
                  <img
                    src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=1200"
                    alt="Dr. Sarah Chen live video"
                    className="w-full h-full object-cover"
                  />

                  {/* Bottom Left Pill: Dr. Sarah Chen */}
                  <div className="absolute bottom-4 left-4 z-20">
                    <div className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm text-white text-xs flex items-center gap-2 border border-white/10">
                      <span className="material-symbols-outlined text-sm text-emerald-400">
                        mic
                      </span>
                      <span className="font-medium text-[11px]">
                        {apt.doctor.name}
                      </span>
                    </div>
                  </div>

                  {/* Bottom Right Floating PiP: Emma Mitchell matching Screenshot */}
                  <div className="absolute bottom-4 right-4 z-20 rounded-xl overflow-hidden shadow-2xl border-2 border-white w-36 sm:w-44 aspect-16/10 bg-[#162623]">
                    {consultationCam ? (
                      <img
                        src="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=600"
                        alt="You (Emma Mitchell)"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/70 text-xs">
                        Camera off
                      </div>
                    )}
                    <div className="absolute bottom-1.5 left-2 px-2 py-0.5 rounded bg-black/60 text-[10px] text-white font-medium">
                      You · Emma
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Control Bar Row matching Screenshot */}
              <div className="care-card p-4 rounded-2xl bg-white border border-[#577877]/15 flex items-center justify-between gap-3">
                {/* Left Live Indicator */}
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#0E9F6E]">
                  <span className="w-2 h-2 rounded-full bg-[#0E9F6E] animate-pulse" />
                  <span>Live · {formatCallTimer(consultationDuration)}</span>
                </div>

                {/* Center Buttons matching Screenshot */}
                <div className="flex items-center gap-2 sm:gap-3">
                  <button
                    type="button"
                    onClick={() => setConsultationMic(!consultationMic)}
                    className="border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs transition cursor-pointer"
                  >
                    <span
                      className={`material-symbols-outlined text-base ${consultationMic ? "text-[#295255]" : "text-rose-600"}`}
                    >
                      {consultationMic ? "mic" : "mic_off"}
                    </span>
                    <span className="hidden sm:inline">
                      {consultationMic ? "Mic on" : "Mic off"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConsultationCam(!consultationCam)}
                    className="border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs transition cursor-pointer"
                  >
                    <span
                      className={`material-symbols-outlined text-base ${consultationCam ? "text-[#295255]" : "text-rose-600"}`}
                    >
                      {consultationCam ? "videocam" : "videocam_off"}
                    </span>
                    <span className="hidden sm:inline">Camera</span>
                  </button>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowMoreMenu(!showMoreMenu)}
                      className="border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs transition cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">
                        more_horiz
                      </span>
                      <span className="hidden sm:inline">More</span>
                    </button>

                    {showMoreMenu && (
                      <div className="absolute bottom-full mb-2 left-0 w-48 rounded-xl bg-white border border-[#577877]/20 p-2 shadow-lg space-y-1 text-xs z-30">
                        <button
                          type="button"
                          onClick={() => {
                            setShowMoreMenu(false);
                            setShowDeviceModal(true);
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#F0F5F7] font-medium text-[#162623]"
                        >
                          Device settings
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMoreMenu(false);
                            onNavigate("support");
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-[#F0F5F7] font-medium text-[#162623]"
                        >
                          Report technical issue
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Leave Call Button matching Screenshot */}
                <div>
                  <button
                    type="button"
                    onClick={handleLeaveConsultation}
                    className="bg-[#DC2626] hover:bg-[#B91C1C] text-white px-4 sm:px-5 py-2 sm:py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-sm transition cursor-pointer shrink-0"
                  >
                    <span className="material-symbols-outlined text-base">
                      call_end
                    </span>
                    <span>Leave call</span>
                  </button>
                </div>
              </div>

              {/* Privacy Note matching Screenshot */}
              <div className="flex items-center gap-2 text-xs text-[#577877] pt-1">
                <span className="material-symbols-outlined text-sm !text-[#577877]">
                  lock
                </span>
                <span>
                  This consultation is not being recorded. If disconnected, stay
                  here and try rejoining.
                </span>
              </div>
            </div>

            {/* Right Column (4 cols): Chat / Visit details tab + After your visit */}
            <div className="lg:col-span-4 space-y-5">
              {/* CARD 1: Chat / Visit details matching Screenshot */}
              <div className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-4">
                {/* Tabs matching Screenshot */}
                <div className="flex items-center gap-6 border-b border-[#577877]/20 pb-3 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setConsultationSideTab("chat")}
                    className={`transition pb-1 relative cursor-pointer ${
                      consultationSideTab === "chat"
                        ? "text-[#295255] font-bold"
                        : "text-[#577877] hover:text-[#162623]"
                    }`}
                  >
                    <span>Chat</span>
                    {consultationSideTab === "chat" && (
                      <span className="absolute -bottom-3 left-0 right-0 h-0.5 bg-[#295255] rounded-full" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => setConsultationSideTab("details")}
                    className={`transition pb-1 relative cursor-pointer ${
                      consultationSideTab === "details"
                        ? "text-[#295255] font-bold"
                        : "text-[#577877] hover:text-[#162623]"
                    }`}
                  >
                    <span>Visit details</span>
                    {consultationSideTab === "details" && (
                      <span className="absolute -bottom-3 left-0 right-0 h-0.5 bg-[#295255] rounded-full" />
                    )}
                  </button>
                </div>

                {consultationSideTab === "chat" ? (
                  <>
                    {/* Timestamp divider matching Screenshot */}
                    <div className="text-center py-1">
                      <span className="text-[10px] text-[#577877] font-semibold tracking-wider uppercase">
                        TODAY · NOV 12, 2026
                      </span>
                    </div>

                    {/* Messages container */}
                    <div className="space-y-3.5 max-h-72 overflow-y-auto pr-1">
                      {consultationChatMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`rounded-2xl p-3.5 text-xs space-y-1.5 ${
                            msg.isMe
                              ? "bg-[#EFF6FF] border border-[#BFDBFE] text-[#162623]"
                              : "bg-[#F0F5F7] text-[#162623]"
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px]">
                            <span
                              className={`font-semibold ${msg.isMe ? "text-[#2563EB]" : "text-[#577877]"}`}
                            >
                              {msg.sender} · {msg.time}
                            </span>
                          </div>
                          <p className="leading-relaxed">{msg.text}</p>
                          {msg.attachment && (
                            <div className="mt-2 p-2 rounded-xl bg-white/90 border border-[#BFDBFE] flex items-center gap-2 text-xs font-semibold text-[#1E40AF]">
                              <span className="material-symbols-outlined text-base">
                                description
                              </span>
                              <span>{msg.attachment}</span>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>

                    <p className="text-[11px] text-[#577877] pt-1">
                      Only you and your care team can see this chat.
                    </p>

                    {/* Message input matching Screenshot */}
                    <form
                      onSubmit={handleSendConsultationMessage}
                      className="space-y-2 pt-2"
                    >
                      <label className="block text-xs font-semibold text-[#162623]">
                        Message
                      </label>
                      <div className="relative">
                        <textarea
                          rows={2}
                          value={consultationInput}
                          onChange={(e) => setConsultationInput(e.target.value)}
                          placeholder="Type a message..."
                          className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] placeholder-[#577877]/70 focus:outline-none focus:border-[#295255] resize-none"
                        />
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          className="p-1.5 rounded-lg text-[#577877] hover:text-[#162623] hover:bg-[#F0F5F7] cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-base">
                            attach_file
                          </span>
                        </button>
                        <button
                          type="submit"
                          className="border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-4 py-1.5 rounded-xl font-semibold text-xs shadow-2xs transition cursor-pointer"
                        >
                          Send
                        </button>
                      </div>
                    </form>
                  </>
                ) : (
                  /* Visit Details tab */
                  <div className="space-y-3 text-xs pt-1">
                    <div className="p-3 rounded-xl bg-[#F0F5F7] space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-[#577877]">Appointment ID:</span>
                        <span className="font-semibold text-[#162623]">
                          {apt.id}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#577877]">Provider:</span>
                        <span className="font-semibold text-[#162623]">
                          {apt.doctor.name}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#577877]">Specialty:</span>
                        <span className="font-semibold text-[#295255]">
                          {apt.doctor.specialty}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#577877]">Reason:</span>
                        <span className="font-semibold text-[#162623]">
                          {apt.reason}
                        </span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-[#577877]/15">
                        <span className="text-[#577877]">Fee:</span>
                        <span className="font-bold text-[#162623]">
                          Paid · {apt.fee}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* CARD 2: After your visit matching Screenshot */}
              <div className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-2">
                <h3 className="text-base font-bold text-[#162623]">
                  After your visit
                </h3>
                <p className="text-xs text-[#577877] leading-relaxed">
                  Your doctor will add a summary and any updated prescriptions
                  to your portal.
                </p>
              </div>
            </div>
          </div>

          {/* Global Footer matching Screenshot */}
          <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
            <p>© 2026 Kaizentrix Care · Your health, thoughtfully connected.</p>
            <div className="flex items-center gap-4">
              <span className="hover:text-[#162623] cursor-pointer">
                Privacy
              </span>
              <span>·</span>
              <span className="hover:text-[#162623] cursor-pointer">Terms</span>
              <span>·</span>
              <span
                className="hover:text-[#162623] cursor-pointer"
                onClick={() => onNavigate("support")}
              >
                Need help?
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // VIEW F: VIDEO CONSULTATION WAITING ROOM (Matches Screenshot 14)
  // ========================================================
  if (view === "waiting-room" || view === "waiting") {
    const apt = detailAppointment || upcomingAppointmentsList[0];

    return (
      <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Heading & Subtitle matching Screenshot */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
              A moment to get comfortable
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#577877]">
              Thu, Nov 12 · Your 2:30 PM video appointment with{" "}
              {apt.doctor.name}
            </p>
          </div>

          {/* Main 2-Column Content Layout matching Screenshot */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column (8 cols): Video Preview Box + Check your setup */}
            <div className="lg:col-span-8 space-y-6">
              {/* CARD 1: Video Preview Container matching Screenshot */}
              <div className="rounded-2xl overflow-hidden bg-[#162623] relative shadow-lg aspect-16/10 flex flex-col justify-between">
                {/* Top Badge: Your camera preview */}
                <div className="absolute top-4 left-4 z-20">
                  <span className="px-3.5 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-medium border border-white/10 shadow-xs">
                    Your camera preview
                  </span>
                </div>

                {/* Top-Right indicators */}
                <div className="absolute top-4 right-4 z-20 hidden sm:flex items-center gap-3 text-white/70 text-[11px]">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">
                      group
                    </span>
                    <span>5</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">
                      chat
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">
                      mood
                    </span>
                  </span>
                </div>

                {/* Main Video View / Feed */}
                <div className="w-full h-full relative">
                  {cameraOn ? (
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                      poster="https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=1200"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-white/70 bg-[#1F2937]">
                      <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center text-2xl font-bold mb-2">
                        EM
                      </div>
                      <p className="text-xs">Camera is turned off</p>
                    </div>
                  )}

                  {/* Bottom Left Pill: Emma Mitchell */}
                  <div className="absolute bottom-4 left-4 z-20">
                    <div className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm text-white text-xs flex items-center gap-2 border border-white/10">
                      <span
                        className={`material-symbols-outlined text-sm ${micOn ? "text-emerald-400" : "text-rose-400"}`}
                      >
                        {micOn ? "mic" : "mic_off"}
                      </span>
                      <span className="font-medium text-[11px]">
                        Emma Mitchell
                      </span>
                    </div>
                  </div>

                  {/* Bottom Center Floating Controls matching Screenshot */}
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
                      <span>{micOn ? "Mic on" : "Mic off"}</span>
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
                      <span>{cameraOn ? "Camera on" : "Camera off"}</span>
                    </button>
                  </div>
                </div>

                {/* Sub-strip on bottom of video container matching Screenshot */}
                <div className="h-8 bg-black/80 flex items-center justify-between px-4 text-[10px] text-white/50 z-10 border-t border-white/5">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-xs">
                      videocam
                    </span>
                    <span>Video</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span>Participants</span>
                    <span>Chat</span>
                    <span className="text-emerald-400 font-semibold">
                      Share Screen
                    </span>
                    <span>Record</span>
                  </div>
                </div>
              </div>

              {/* CARD 2: Check your setup matching Screenshot */}
              <div className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-5">
                <h3 className="text-base font-bold text-[#162623]">
                  Check your setup
                </h3>

                {/* 2 Dropdowns Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                      Microphone
                    </label>
                    <div className="relative">
                      <select
                        value={selectedMic}
                        onChange={(e) => setSelectedMic(e.target.value)}
                        className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] font-medium focus:outline-none focus:border-[#295255] cursor-pointer pr-8"
                      >
                        <option value="Built-in microphone">
                          Built-in microphone
                        </option>
                        <option value="Headset microphone">
                          Headset microphone (AirPods)
                        </option>
                        <option value="USB Audio device">
                          USB Audio device
                        </option>
                      </select>
                      <span className="material-symbols-outlined !text-[#577877] text-base absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        expand_more
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                      Speaker
                    </label>
                    <div className="relative">
                      <select
                        value={selectedSpeaker}
                        onChange={(e) => setSelectedSpeaker(e.target.value)}
                        className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] font-medium focus:outline-none focus:border-[#295255] cursor-pointer pr-8"
                      >
                        <option value="Built-in speakers">
                          Built-in speakers
                        </option>
                        <option value="Headphones (AirPods)">
                          Headphones (AirPods)
                        </option>
                        <option value="External speakers">
                          External speakers
                        </option>
                      </select>
                      <span className="material-symbols-outlined !text-[#577877] text-base absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                        expand_more
                      </span>
                    </div>
                  </div>
                </div>

                {/* Audio Status & Test Row matching Screenshot */}
                <div className="flex items-center justify-between pt-2">
                  <div className="flex items-center gap-2 text-xs text-[#577877]">
                    <span className="material-symbols-outlined !text-[#295255] text-base">
                      mic
                    </span>
                    <span className="font-medium text-[#162623]">
                      We can hear you
                    </span>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Pulsing Audio Meter Bars */}
                    <div className="flex items-center gap-1 h-5">
                      <span className="w-1 h-3 bg-[#295255] rounded-full animate-pulse" />
                      <span className="w-1 h-5 bg-[#295255] rounded-full animate-pulse delay-75" />
                      <span className="w-1 h-2.5 bg-[#295255] rounded-full animate-pulse delay-150" />
                      <span className="w-1 h-4 bg-[#295255] rounded-full animate-pulse delay-100" />
                      <span className="w-1 h-2 bg-[#295255] rounded-full animate-pulse" />
                    </div>

                    <button
                      type="button"
                      onClick={handleTestSpeaker}
                      className="border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-4 py-2 rounded-xl font-semibold text-xs transition cursor-pointer shadow-2xs"
                    >
                      {testingSpeaker ? "Testing audio..." : "Test speakers"}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column (4 cols): Doctor Soon Card + While you wait */}
            <div className="lg:col-span-4 space-y-5">
              {/* CARD 1: Your doctor will be with you soon matching Screenshot */}
              <div className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-4">
                <h3 className="text-base font-bold text-[#162623]">
                  Your doctor will be with you soon
                </h3>

                {/* Doctor Row */}
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-full bg-[#E0F0EC] text-[#295255] font-bold text-sm flex items-center justify-center shrink-0">
                    {apt.doctor.initials || "SC"}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-[#162623]">
                      {apt.doctor.name}
                    </h4>
                    <p className="text-xs font-semibold text-[#295255]">
                      {apt.doctor.specialty}
                    </p>
                    <p className="text-[11px] text-[#577877]">
                      {apt.doctor.experienceShort || "12 years of experience"}
                    </p>
                  </div>
                </div>

                {/* Status Badge: Waiting for doctor */}
                <div>
                  <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full bg-[#FEF3C7] text-[#92400E]">
                    Waiting for doctor
                  </span>
                </div>

                <p className="text-xs text-[#577877] leading-relaxed">
                  You're checked in. Dr. Chen will invite you into the
                  consultation when ready.
                </p>

                {/* Connection Check Callout */}
                <div className="p-4 rounded-xl bg-[#E8F3F3] border border-[#577877]/20 flex items-start gap-3">
                  <span className="material-symbols-outlined !text-[#295255] text-base shrink-0 mt-0.5">
                    wifi
                  </span>
                  <div className="text-xs space-y-0.5">
                    <h5 className="font-bold text-[#162623]">
                      Connection looks good
                    </h5>
                    <p className="text-[#577877] leading-relaxed">
                      Camera, microphone, and internet checks passed.
                    </p>
                  </div>
                </div>

                {/* Consent Confirmed Row */}
                <div className="flex items-start gap-2.5 pt-1">
                  <span className="material-symbols-outlined !text-[#295255] text-base shrink-0 mt-0.5">
                    check_box
                  </span>
                  <div className="text-xs space-y-0.5">
                    <h5 className="font-bold text-[#162623]">
                      Telehealth consent confirmed
                    </h5>
                    <p className="text-[11px] text-[#577877]">
                      You are in California and in a private location.
                    </p>
                  </div>
                </div>

                {/* Waiting Button with Spinner */}
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleEnterConsultation}
                    disabled={consultationRoom?.status !== "in_progress"}
                    className="w-full py-3 rounded-xl bg-[#F0F5F7] hover:bg-[#E2EBEA] hover:text-[#162623] text-[#577877] font-semibold text-xs flex items-center justify-center gap-2 border border-[#577877]/10 cursor-pointer select-none transition disabled:cursor-not-allowed disabled:opacity-60"
                    title={
                      consultationRoom?.status === "in_progress"
                        ? "Join active consultation"
                        : "Waiting for doctor admission"
                    }
                  >
                    <span className="material-symbols-outlined text-base animate-spin">
                      progress_activity
                    </span>
                    <span>
                      {consultationRoom?.status === "in_progress"
                        ? "Join consultation"
                        : "Waiting for doctor admission"}
                    </span>
                  </button>
                  {consultationError && (
                    <p className="mt-2 text-center text-xs text-red-600">
                      {consultationError}
                    </p>
                  )}
                </div>

                {/* Timestamp & Appointment ID */}
                <p className="text-[11px] text-[#577877] text-center pt-1">
                  Checked in at 2:24 PM · Appointment {apt.id}
                </p>
              </div>

              {/* CARD 2: While you wait matching Screenshot */}
              <div className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-4">
                <h3 className="text-base font-bold text-[#162623]">
                  While you wait
                </h3>
                <p className="text-xs text-[#577877] leading-relaxed">
                  Keep your medication list and blood pressure readings nearby.
                  Headphones can help keep your conversation private.
                </p>

                <div className="pt-2 space-y-2.5">
                  <button
                    type="button"
                    onClick={() => onNavigate("support")}
                    className="btn-secondary w-full !py-2.5 rounded-xl font-semibold text-xs text-[#162623] shadow-2xs text-center block"
                  >
                    Need technical help?
                  </button>

                  <button
                    type="button"
                    onClick={() => setView("list")}
                    className="w-full text-center text-xs font-semibold text-[#162623] hover:text-[#295255] py-1 cursor-pointer transition block"
                  >
                    Leave waiting room
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Global Footer matching Screenshot */}
          <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
            <p>© 2026 Kaizentrix Care · Your health, thoughtfully connected.</p>
            <div className="flex items-center gap-4">
              <span className="hover:text-[#162623] cursor-pointer">
                Privacy
              </span>
              <span>·</span>
              <span className="hover:text-[#162623] cursor-pointer">Terms</span>
              <span>·</span>
              <span
                className="hover:text-[#162623] cursor-pointer"
                onClick={() => onNavigate("support")}
              >
                Need help?
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // VIEW E: APPOINTMENT HISTORY VIEW (Matches Screenshot 13)
  // ========================================================
  if (view === "history") {
    const filteredHistory = appointmentHistoryData.filter((item) => {
      const matchesTab =
        historyFilterTab === "all" ||
        item.status.toLowerCase() === historyFilterTab.toLowerCase();
      const matchesSearch =
        item.provider.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
        item.reason.toLowerCase().includes(historySearchTerm.toLowerCase()) ||
        item.id.toLowerCase().includes(historySearchTerm.toLowerCase());
      return matchesTab && matchesSearch;
    });

    const pageSize = 6;
    const startIndex = (historyPage - 1) * pageSize;
    const paginatedHistory = filteredHistory.slice(
      startIndex,
      startIndex + pageSize,
    );

    return (
      <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Heading & Top Action Row matching Screenshot */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
                Your care, over time
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-[#577877]">
                Review past appointments, find visit documents, and reconnect
                with your doctor.
              </p>
            </div>

            <button
              type="button"
              onClick={handleExportHistory}
              className="bg-white border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs transition cursor-pointer self-start sm:self-auto"
            >
              <span className="material-symbols-outlined !text-[#295255] text-base">
                download
              </span>
              <span>Export history</span>
            </button>
          </div>

          {/* 3 Metric Cards matching Screenshot */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Metric 1 */}
            <div className="care-card p-6 rounded-2xl bg-white border border-[#577877]/15 space-y-3">
              <div className="flex items-center justify-between text-xs text-[#577877]">
                <span>Completed consultations</span>
                <span className="material-symbols-outlined !text-[#295255] text-xl">
                  assignment_turned_in
                </span>
              </div>
              <div className="text-3xl font-bold text-[#162623] tracking-tight">
                08
              </div>
              <p className="text-xs text-[#577877]">Across your care team</p>
            </div>

            {/* Metric 2 */}
            <div className="care-card p-6 rounded-2xl bg-white border border-[#577877]/15 space-y-3">
              <div className="flex items-center justify-between text-xs text-[#577877]">
                <span>Your care providers</span>
                <span className="material-symbols-outlined !text-[#295255] text-xl">
                  stethoscope
                </span>
              </div>
              <div className="text-3xl font-bold text-[#162623] tracking-tight">
                03
              </div>
              <p className="text-xs text-[#577877]">
                Connected through your portal
              </p>
            </div>

            {/* Metric 3 */}
            <div className="care-card p-6 rounded-2xl bg-white border border-[#577877]/15 space-y-3">
              <div className="flex items-center justify-between text-xs text-[#577877]">
                <span>Latest consultation</span>
                <span className="material-symbols-outlined !text-[#295255] text-xl">
                  event_available
                </span>
              </div>
              <div className="text-3xl font-bold text-[#162623] tracking-tight">
                Oct 29
              </div>
              <p className="text-xs text-[#577877]">
                Dr. Sarah Chen · Internal medicine
              </p>
            </div>
          </div>

          {/* Main Table Card matching Screenshot */}
          <div className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-6">
            {/* Status Tabs Row matching Screenshot */}
            <div className="flex items-center gap-8 border-b border-[#577877]/20 pb-3 text-sm font-semibold">
              {[
                { id: "all", label: "All history" },
                { id: "Completed", label: "Completed" },
                { id: "Cancelled", label: "Cancelled" },
                { id: "Rescheduled", label: "Rescheduled" },
              ].map((tab) => {
                const isTabActive = historyFilterTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setHistoryFilterTab(tab.id);
                      setHistoryPage(1);
                    }}
                    className={`transition pb-1 relative cursor-pointer ${
                      isTabActive
                        ? "text-[#295255] font-bold"
                        : "text-[#577877] hover:text-[#162623]"
                    }`}
                  >
                    <span>{tab.label}</span>
                    {isTabActive && (
                      <span className="absolute -bottom-3 left-0 right-0 h-0.5 bg-[#295255] rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Filters Row: Search + Date Range matching Screenshot */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-8">
                <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                  Search
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined text-base absolute left-3 top-1/2 -translate-y-1/2 !text-[#577877]">
                    search
                  </span>
                  <input
                    type="text"
                    value={historySearchTerm}
                    onChange={(e) => {
                      setHistorySearchTerm(e.target.value);
                      setHistoryPage(1);
                    }}
                    placeholder="Doctor, specialty or appointment ID"
                    className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] placeholder-[#577877]/70 focus:outline-none focus:border-[#295255]"
                  />
                </div>
              </div>

              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                  Date range
                </label>
                <div className="relative">
                  <select
                    value={historyDateRange}
                    onChange={(e) => setHistoryDateRange(e.target.value)}
                    className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] font-medium focus:outline-none focus:border-[#295255] cursor-pointer pr-8"
                  >
                    <option value="2026">Jan 1 – Dec 31, 2026</option>
                    <option value="last6m">Last 6 months</option>
                    <option value="all">All time</option>
                  </select>
                  <span className="material-symbols-outlined !text-[#577877] text-base absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                    expand_more
                  </span>
                </div>
              </div>
            </div>

            {/* Table matching Screenshot */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#577877]/15 bg-[#F8FAFB] text-[#577877] font-medium">
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Provider</th>
                    <th className="py-3 px-4">Visit reason</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Documents</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#577877]/10">
                  {paginatedHistory.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-[#F8FAFB]/70 transition"
                    >
                      <td className="py-3.5 px-4 font-medium text-[#162623] whitespace-nowrap">
                        {row.date}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-[#162623] whitespace-nowrap">
                        {row.provider}
                      </td>
                      <td className="py-3.5 px-4 text-[#577877]">
                        {row.reason}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {row.status === "Completed" && (
                          <span className="font-semibold text-[#0E9F6E]">
                            Completed
                          </span>
                        )}
                        {row.status === "Cancelled" && (
                          <span className="font-semibold text-[#DC2626]">
                            Cancelled
                          </span>
                        )}
                        {row.status === "Rescheduled" && (
                          <span className="font-semibold text-[#D97706]">
                            Rescheduled
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs text-[#295255] font-medium">
                          {row.documents.map((doc, idx) => (
                            <span
                              key={doc.name}
                              className="flex items-center gap-1"
                            >
                              <span
                                className="hover:underline cursor-pointer"
                                onClick={() => {
                                  if (doc.type === "summary")
                                    onNavigate("summaries");
                                  else if (doc.type === "prescription")
                                    onNavigate("prescriptions");
                                  else if (doc.type === "cancellation")
                                    setView("cancellation");
                                  else onNavigate("medical-records");
                                }}
                              >
                                {doc.name}
                              </span>
                              {idx < row.documents.length - 1 && (
                                <span className="text-[#577877]">·</span>
                              )}
                            </span>
                          ))}
                          <span className="material-symbols-outlined !text-[#295255] text-xs">
                            open_in_new
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {paginatedHistory.length === 0 && (
                    <tr>
                      <td
                        colSpan={5}
                        className="py-8 text-center text-[#577877]"
                      >
                        No appointment records match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer / Pagination matching Screenshot */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#577877]/15 text-xs text-[#577877]">
              <span>
                Showing {filteredHistory.length > 0 ? startIndex + 1 : 0}–
                {Math.min(startIndex + pageSize, filteredHistory.length)} of{" "}
                {filteredHistory.length} appointments
              </span>

              <div className="flex items-center gap-2">
                {historyPage > 1 && (
                  <button
                    type="button"
                    onClick={() => setHistoryPage((p) => p - 1)}
                    className="border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-4 py-2 rounded-xl font-semibold text-xs cursor-pointer transition shadow-2xs"
                  >
                    Previous
                  </button>
                )}
                {startIndex + pageSize < filteredHistory.length && (
                  <button
                    type="button"
                    onClick={() => setHistoryPage((p) => p + 1)}
                    className="border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-4 py-2 rounded-xl font-semibold text-xs cursor-pointer transition shadow-2xs"
                  >
                    Next page
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Banner: Your records remain available matching Screenshot */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#E8F3F3] border border-[#577877]/20 flex items-start gap-3.5">
            <span className="material-symbols-outlined !text-[#295255] text-lg shrink-0 mt-0.5">
              info
            </span>
            <div className="text-xs space-y-0.5">
              <h4 className="font-bold text-[#162623]">
                Your records remain available
              </h4>
              <p className="text-[#577877] leading-relaxed">
                Cancelling an appointment doesn't remove your previous
                consultation summaries or prescriptions. Clinical questions?
                Contact your care team.
              </p>
            </div>
          </div>

          {/* Global Footer */}
          <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
            <p>© 2026 Kaizentrix Care · Your health, thoughtfully connected.</p>
            <div className="flex items-center gap-4">
              <span className="hover:text-[#162623] cursor-pointer">
                Privacy
              </span>
              <span>·</span>
              <span className="hover:text-[#162623] cursor-pointer">Terms</span>
              <span>·</span>
              <span
                className="hover:text-[#162623] cursor-pointer"
                onClick={() => onNavigate("support")}
              >
                Need help?
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // VIEW D: CANCELLATION CONFIRMATION VIEW (Matches Screenshot 12)
  // ========================================================
  if (view === "cancellation" || view === "cancelled") {
    const apt = detailAppointment || upcomingAppointmentsList[1];
    const refundRef = apt.id ? apt.id.replace("KC-APT-", "RF-") : "RF-1072";

    return (
      <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Heading & Subtitle matching Screenshot */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
              Your appointment is cancelled
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#577877]">
              We've notified your doctor and sent a confirmation to your email.
            </p>
          </div>

          {/* Main 2-Column Content Layout matching Screenshot */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column (8 cols): Main Cancellation Card */}
            <div className="lg:col-span-8 care-card p-6 sm:p-8 space-y-6">
              {/* Top Row: Red Event Busy Icon + Title + ID */}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-[#FDF2F2] text-[#E02424] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined !text-[#E02424] text-2xl font-bold">
                    event_busy
                  </span>
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-[#162623] tracking-tight">
                    Plans change. We're here when you need us.
                  </h2>
                  <p className="text-xs text-[#577877] mt-0.5">
                    Appointment · {apt.id}
                  </p>
                </div>
              </div>

              {/* Status Badge */}
              <div>
                <span className="inline-flex items-center text-xs font-semibold px-3 py-1 rounded-full bg-[#FDF2F2] text-[#9B1C1C]">
                  Cancelled by patient
                </span>
              </div>

              {/* Doctor Row */}
              <div className="flex items-center gap-3.5 pt-1">
                <div className="w-12 h-12 rounded-full bg-[#E0F0EC] text-[#295255] font-bold text-sm flex items-center justify-center shrink-0">
                  {apt.doctor.initials || "AW"}
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#162623]">
                    {apt.doctor.name}
                  </h3>
                  <p className="text-xs font-semibold text-[#295255]">
                    {apt.doctor.specialty}
                  </p>
                  <p className="text-xs text-[#577877]">
                    {apt.reason || "Skin health consultation"}
                  </p>
                </div>
              </div>

              <div className="border-t border-[#577877]/15" />

              {/* 2-Column Metadata Grid matching Screenshot */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs">
                <div>
                  <span className="text-[#577877] block text-[11px]">
                    Original appointment
                  </span>
                  <span className="font-semibold text-xs text-[#162623] mt-0.5 block">
                    {apt.dateShort === "Tue, Nov 17, 2026"
                      ? "Nov 17, 2026 · 10:00 AM PT"
                      : `${apt.dateShort} · ${apt.timeRange}`}
                  </span>
                </div>

                <div>
                  <span className="text-[#577877] block text-[11px]">
                    Cancellation reason
                  </span>
                  <span className="font-semibold text-xs text-[#162623] mt-0.5 block">
                    {cancellationReason}
                  </span>
                </div>

                <div>
                  <span className="text-[#577877] block text-[11px]">
                    Cancelled on
                  </span>
                  <span className="font-semibold text-xs text-[#162623] mt-0.5 block">
                    {cancellationDate}
                  </span>
                </div>
              </div>

              <div className="border-t border-[#577877]/15" />

              {/* Refund Row matching Screenshot */}
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-[#162623]">
                    Full refund initiated
                  </h4>
                  <p className="text-xs text-[#577877] mt-0.5">
                    Visa ending {apt.cardLast4 || "4242"} · {refundRef}
                  </p>
                </div>
                <span className="text-2xl sm:text-3xl font-bold text-[#295255]">
                  {apt.fee}
                </span>
              </div>

              {/* Refund Info Banner matching Screenshot */}
              <div className="p-4 sm:p-5 rounded-2xl bg-[#E8F3F3] border border-[#577877]/20 flex items-start gap-3.5">
                <span className="material-symbols-outlined !text-[#295255] text-xl shrink-0 mt-0.5">
                  cached
                </span>
                <div className="text-xs space-y-0.5">
                  <h4 className="font-bold text-[#162623]">
                    Your refund is on its way
                  </h4>
                  <p className="text-[#577877] leading-relaxed">
                    Allow 5–10 business days for your bank to post the refund.
                    You can track its status in Payments.
                  </p>
                </div>
              </div>

              {/* Action Buttons matching Screenshot */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate("find-doctors")}
                  className="px-6 py-2.5 rounded-xl font-semibold text-xs bg-[#2563EB] hover:bg-[#1D4ED8] text-white shadow-xs transition cursor-pointer"
                >
                  Find another appointment
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setView("list");
                    setActiveTab("cancelled");
                  }}
                  className="btn-secondary !px-5 !py-2.5 rounded-xl font-semibold text-xs shadow-2xs"
                >
                  Back to my appointments
                </button>
              </div>
            </div>

            {/* Right Column (4 cols): Sidebar Cards matching Screenshot */}
            <div className="lg:col-span-4 space-y-4">
              {/* Card 1: Keep your care on track */}
              <div className="care-card p-6 sm:p-7 space-y-4">
                <h3 className="text-base font-bold text-[#162623]">
                  Keep your care on track
                </h3>
                <p className="text-xs text-[#577877] leading-relaxed">
                  Your other appointments and health records haven't changed.
                </p>

                <div className="pt-1">
                  <span className="text-[11px] text-[#577877] font-semibold block uppercase tracking-wider">
                    Still upcoming
                  </span>
                  <p className="font-bold text-xs text-[#162623] mt-1">
                    Dr. Sarah Chen · Nov 12, 2:30 PM
                  </p>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setView("list");
                      setActiveTab("upcoming");
                    }}
                    className="btn-secondary w-full !py-2.5 rounded-xl font-semibold text-xs text-[#162623] shadow-2xs"
                  >
                    View upcoming visits
                  </button>
                </div>
              </div>

              {/* Card 2: Symptoms have changed? Amber Alert Box */}
              <div className="p-5 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] flex items-start gap-3">
                <span className="material-symbols-outlined !text-[#D97706] text-lg shrink-0 mt-0.5">
                  info
                </span>
                <div className="text-xs space-y-1">
                  <h4 className="font-bold text-[#92400E]">
                    Symptoms have changed?
                  </h4>
                  <p className="text-[#B45309] leading-relaxed">
                    Contact your care team for advice. This portal is not
                    monitored for emergencies.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Global Footer */}
          <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
            <p>© 2026 Kaizentrix Care · Your health, thoughtfully connected.</p>
            <div className="flex items-center gap-4">
              <span className="hover:text-[#162623] cursor-pointer">
                Privacy
              </span>
              <span>·</span>
              <span className="hover:text-[#162623] cursor-pointer">Terms</span>
              <span>·</span>
              <span
                className="hover:text-[#162623] cursor-pointer"
                onClick={() => onNavigate("support")}
              >
                Need help?
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // VIEW C: RESCHEDULE APPOINTMENT VIEW (Matches Screenshot 11)
  // ========================================================
  if (view === "reschedule") {
    const apt = detailAppointment;
    const selectedSlotObj = availableRescheduleSlots.find(
      (s) => s.time === selectedRescheduleSlot,
    );
    const newAppointmentDisplay = `Fri, Nov ${selectedRescheduleDay} · ${selectedSlotObj?.slotRange || "10:00–10:30 AM PT"}`;

    return (
      <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Heading & Subtitle matching Screenshot */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
              Find a better time
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#577877]">
              Reschedule your visit with {apt.doctor.name} · {apt.id}
            </p>
          </div>

          {/* Safe Slot Alert Banner matching Screenshot */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#E8F3F3] border border-[#577877]/20 flex items-start gap-3">
            <span className="material-symbols-outlined !text-[#295255] text-xl shrink-0 mt-0.5">
              calendar_month
            </span>
            <div className="text-xs space-y-0.5">
              <h2 className="font-bold text-[#162623]">
                Your current appointment is safe
              </h2>
              <p className="text-[#577877] leading-relaxed">
                Your original time stays booked until you confirm your new
                appointment. No additional fee applies.
              </p>
            </div>
          </div>

          {/* Main 2-Column Content Layout matching Screenshot */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column (8 cols): Choose new date & time + Context notes */}
            <div className="lg:col-span-8 space-y-6">
              {/* CARD 1: Choose a new date & time */}
              <div className="care-card p-6 sm:p-7 space-y-5">
                <h3 className="text-base font-bold text-[#162623]">
                  Choose a new date
                </h3>

                {/* 5-Day Card Carousel matching Screenshot */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
                  {availableRescheduleDates.map((item) => {
                    const isSelected = selectedRescheduleDay === item.dayNum;
                    return (
                      <button
                        key={item.dayNum}
                        type="button"
                        onClick={() => setSelectedRescheduleDay(item.dayNum)}
                        className={`p-4 rounded-2xl text-center transition flex flex-col items-center justify-center cursor-pointer ${
                          isSelected
                            ? "bg-[#295255] text-white shadow-sm"
                            : "bg-white border border-[#577877]/25 text-[#162623] hover:border-[#295255]"
                        }`}
                      >
                        <span
                          className={`text-[10px] font-bold tracking-wider uppercase ${
                            isSelected ? "text-white/80" : "text-[#577877]"
                          }`}
                        >
                          {item.dayName}
                        </span>
                        <span className="text-2xl font-bold my-1">
                          {item.dayNum}
                        </span>
                        <span
                          className={`text-[11px] font-medium ${
                            isSelected ? "text-white/80" : "text-[#577877]"
                          }`}
                        >
                          {item.month}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Subtitle with active day */}
                <div className="pt-2">
                  <p className="text-xs text-[#577877]">
                    Friday, November {selectedRescheduleDay} · All times in
                    Pacific Time
                  </p>
                </div>

                {/* 3 Horizontal Time Slot Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  {availableRescheduleSlots.map((slot) => {
                    const isSlotSelected = selectedRescheduleSlot === slot.time;
                    return (
                      <button
                        key={slot.time}
                        type="button"
                        onClick={() => setSelectedRescheduleSlot(slot.time)}
                        className={`py-3.5 px-4 rounded-xl text-center text-xs font-semibold transition cursor-pointer ${
                          isSlotSelected
                            ? "border-2 border-[#2563EB] bg-[#F4F8FD] text-[#2563EB] font-bold shadow-xs"
                            : "border border-[#577877]/25 bg-white text-[#162623] hover:border-[#295255]"
                        }`}
                      >
                        {slot.time}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* CARD 2: A little context (optional) matching Screenshot */}
              <div className="care-card p-6 sm:p-7 space-y-4">
                <h3 className="text-base font-bold text-[#162623]">
                  A little context (optional)
                </h3>

                {/* Reason Dropdown */}
                <div>
                  <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                    Reason for rescheduling
                  </label>
                  <div className="relative">
                    <select
                      value={rescheduleReason}
                      onChange={(e) => setRescheduleReason(e.target.value)}
                      className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] font-medium focus:outline-none focus:border-[#295255] cursor-pointer pr-8"
                    >
                      <option value="Schedule conflict">
                        Schedule conflict
                      </option>
                      <option value="Work / Travel commitment">
                        Work / Travel commitment
                      </option>
                      <option value="Health status changed">
                        Health status changed
                      </option>
                      <option value="Other">Other</option>
                    </select>
                    <span className="material-symbols-outlined !text-[#577877] text-base absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      expand_more
                    </span>
                  </div>
                </div>

                {/* Note Field */}
                <div>
                  <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                    Note to your care team
                  </label>
                  <input
                    type="text"
                    value={rescheduleNote}
                    onChange={(e) => setRescheduleNote(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#295255]"
                  />
                </div>
              </div>
            </div>

            {/* Right Column (4 cols): Review your change card matching Screenshot */}
            <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-24">
              {/* CARD 3: Review your change */}
              <div className="care-card p-6 sm:p-7 space-y-4">
                <h3 className="text-base font-bold text-[#162623]">
                  Review your change
                </h3>

                {/* Doctor Row */}
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-full bg-[#E0F0EC] text-[#295255] font-bold text-sm flex items-center justify-center shrink-0">
                    {apt.doctor.initials || "SC"}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-[#162623]">
                      {apt.doctor.name}
                    </h4>
                    <p className="text-xs font-semibold text-[#295255]">
                      {apt.doctor.specialty}
                    </p>
                    <p className="text-[11px] text-[#577877]">
                      {apt.doctor.experienceShort || "12 years of experience"}
                    </p>
                  </div>
                </div>

                <div className="border-t border-[#577877]/15 my-3" />

                {/* Current appointment */}
                <div className="text-xs space-y-1">
                  <span className="text-[#577877] block text-[11px]">
                    Current appointment
                  </span>
                  <p className="font-semibold text-[#162623]">
                    Thu, Nov 12 · 2:30 PM PT
                  </p>
                </div>

                {/* Pill: Changes to */}
                <div className="py-0.5">
                  <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-md bg-[#F4F8FD] text-[#2563EB]">
                    Changes to
                  </span>
                </div>

                {/* New appointment */}
                <div className="text-xs space-y-1">
                  <span className="text-[#577877] block text-[11px]">
                    New appointment
                  </span>
                  <p className="font-bold text-[#162623]">
                    {newAppointmentDisplay}
                  </p>
                </div>

                <div className="border-t border-[#577877]/15 my-3" />

                {/* Payment info */}
                <div className="text-xs space-y-1">
                  <span className="text-[#577877] block text-[11px]">
                    Payment
                  </span>
                  <p className="font-semibold text-[#162623]">
                    $85.00 transferred to your new visit
                  </p>
                </div>

                {/* Rescheduling fee */}
                <div className="flex items-center justify-between text-xs pt-1">
                  <span className="text-[#577877]">Rescheduling fee</span>
                  <span className="font-bold text-[#162623]">$0.00</span>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 space-y-2">
                  <button
                    type="button"
                    onClick={handleConfirmReschedule}
                    className="btn-primary w-full !py-3 rounded-xl font-semibold text-xs shadow-sm"
                  >
                    Confirm new time
                  </button>

                  <button
                    type="button"
                    onClick={() => setView("list")}
                    className="btn-secondary w-full !py-2.5 rounded-xl font-semibold text-xs text-[#162623] shadow-2xs"
                  >
                    Keep original appointment
                  </button>

                  <p className="text-[11px] text-[#577877] text-center pt-1 leading-relaxed">
                    We'll email you and your doctor once the new time is
                    confirmed.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Global Footer */}
          <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
            <p>© 2026 Kaizentrix Care · Your health, thoughtfully connected.</p>
            <div className="flex items-center gap-4">
              <span className="hover:text-[#162623] cursor-pointer">
                Privacy
              </span>
              <span>·</span>
              <span className="hover:text-[#162623] cursor-pointer">Terms</span>
              <span>·</span>
              <span
                className="hover:text-[#162623] cursor-pointer"
                onClick={() => onNavigate("support")}
              >
                Need help?
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // VIEW B: BOOKING CONFIRMATION VIEW (Matches Screenshot 6)
  // ========================================================
  if (view === "confirmation") {
    const apt = detailAppointment;

    return (
      <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Back Navigation Bar */}
          <div className="flex items-center justify-between pb-1">
            <button
              type="button"
              onClick={() => setView("list")}
              className="btn-secondary !px-3.5 !py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-2xs"
            >
              <span className="material-symbols-outlined !text-[#295255] text-sm">
                arrow_back
              </span>
              <span>Back to all appointments</span>
            </button>
            <span className="text-xs text-[#577877]">
              Appointment ID ·{" "}
              <strong className="text-[#162623]">{apt.id}</strong>
            </span>
          </div>

          {/* Toast Notification */}
          {toastMessage && (
            <div className="p-3.5 rounded-xl bg-white border border-[#295255]/30 shadow-sm flex items-center justify-between text-xs text-[#295255] font-semibold">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base">
                  check_circle
                </span>
                {toastMessage}
              </span>
              <button
                type="button"
                onClick={() => setToastMessage("")}
                className="text-[#577877] hover:text-[#162623]"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          )}

          {/* Page Heading & Subtitle */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
              You're all set, Emma
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#577877]">
              Your appointment is confirmed. We've sent the details to your
              email.
            </p>
          </div>

          {/* Main 2-Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column (8 cols): Large Booking Confirmation Card */}
            <div className="lg:col-span-8 care-card p-6 sm:p-8 space-y-6">
              {/* Top Row: Icon + Title + ID + Confirmed Badge */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-full bg-[#E0F2EE] text-[#295255] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined !text-[#295255] text-2xl font-bold">
                      check
                    </span>
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-[#162623] tracking-tight">
                      Your next step is booked.
                    </h2>
                    <p className="text-xs text-[#577877] mt-0.5">
                      Appointment ID · {apt.id}
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center text-xs font-semibold px-3.5 py-1 rounded-full bg-[#E6F4EA] text-[#1E7E34]">
                  Confirmed
                </span>
              </div>

              <div className="border-t border-[#577877]/15" />

              {/* Doctor Row */}
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-[#E0F0EC] text-[#295255] font-bold text-sm flex items-center justify-center shrink-0">
                  {apt.doctor.initials || "SC"}
                </div>
                <div>
                  <h3 className="font-bold text-base text-[#162623]">
                    {apt.doctor.name}
                  </h3>
                  <p className="text-xs font-semibold text-[#295255]">
                    {apt.doctor.specialty}
                  </p>
                  <p className="text-xs text-[#577877]">
                    {apt.doctor.experienceShort || "12 years of experience"}
                  </p>
                </div>
              </div>

              {/* 4-Field Metadata Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs pt-1">
                <div>
                  <span className="text-[#577877] block text-[11px]">Date</span>
                  <span className="font-semibold text-sm text-[#162623] mt-0.5 block">
                    {apt.dateFull || apt.dateShort}
                  </span>
                </div>

                <div>
                  <span className="text-[#577877] block text-[11px]">Time</span>
                  <span className="font-semibold text-sm text-[#162623] mt-0.5 block">
                    {apt.timeFull || apt.timeRange}
                  </span>
                </div>

                <div>
                  <span className="text-[#577877] block text-[11px]">
                    Patient
                  </span>
                  <span className="font-semibold text-sm text-[#162623] mt-0.5 block">
                    Emma Mitchell
                  </span>
                </div>

                <div>
                  <span className="text-[#577877] block text-[11px]">
                    Visit
                  </span>
                  <span className="font-semibold text-sm text-[#162623] mt-0.5 block">
                    {apt.format} · {apt.reason}
                  </span>
                </div>
              </div>

              <div className="border-t border-[#577877]/15" />

              {/* Payment Summary Row */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-[#577877]">
                  Payment received · Visa ending {apt.cardLast4 || "4242"}
                </span>
                <span className="text-2xl font-bold text-[#162623]">
                  {apt.fee}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className="btn-primary !px-6 !py-2.5 rounded-xl font-semibold text-xs shadow-2xs"
                >
                  View appointment
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadIcs(apt)}
                  className="btn-secondary !px-4 !py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs"
                >
                  <span className="material-symbols-outlined !text-[#295255] text-base">
                    calendar_today
                  </span>
                  <span>Add to calendar</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowReceipt(true)}
                  className="text-xs font-semibold text-[#162623] hover:text-[#295255] px-2 py-2 cursor-pointer transition"
                >
                  View receipt
                </button>
              </div>
            </div>

            {/* Right Column (4 cols): Information & Support Cards */}
            <div className="lg:col-span-4 space-y-4">
              {/* Card 1: Before we see you */}
              <div className="care-card p-6 sm:p-7 space-y-4">
                <h3 className="text-base font-bold text-[#162623]">
                  Before we see you
                </h3>

                <div className="space-y-4 pt-1">
                  {/* Step 1 */}
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#E8F3F3] text-[#295255] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      1
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-[#162623]">
                        Gather your readings
                      </h4>
                      <p className="text-xs text-[#577877] leading-relaxed">
                        Have your blood pressure log and medications nearby.
                      </p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#E8F3F3] text-[#295255] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      2
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-[#162623]">
                        Find a quiet space
                      </h4>
                      <p className="text-xs text-[#577877] leading-relaxed">
                        Use a private, well-lit room and a reliable connection.
                      </p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-[#E8F3F3] text-[#295255] font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      3
                    </div>
                    <div className="space-y-0.5">
                      <h4 className="text-xs font-bold text-[#162623]">
                        Join a few minutes early
                      </h4>
                      <p className="text-xs text-[#577877] leading-relaxed">
                        Your waiting room opens at 2:20 PM PT.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Card 2: Plans can change */}
              <div className="p-5 rounded-2xl bg-[#E8F3F3] border border-[#577877]/20 flex items-start gap-3">
                <span className="material-symbols-outlined !text-[#295255] text-lg shrink-0 mt-0.5">
                  info
                </span>
                <div className="text-xs space-y-1">
                  <h4 className="font-bold text-[#162623]">Plans can change</h4>
                  <p className="text-[#577877] leading-relaxed">
                    Reschedule or cancel before Nov 11 at 2:30 PM PT for a full
                    refund.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Global Footer */}
          <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
            <p>© 2026 Kaizentrix Care · Your health, thoughtfully connected.</p>
            <div className="flex items-center gap-4">
              <span className="hover:text-[#162623] cursor-pointer">
                Privacy
              </span>
              <span>·</span>
              <span className="hover:text-[#162623] cursor-pointer">Terms</span>
              <span>·</span>
              <span
                className="hover:text-[#162623] cursor-pointer"
                onClick={() => onNavigate("support")}
              >
                Need help?
              </span>
            </div>
          </div>
        </div>

        {/* Receipt Modal */}
        {showReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined !text-[#295255] text-xl">
                    receipt_long
                  </span>
                  <h3 className="text-base font-bold text-[#162623]">
                    Payment Receipt
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowReceipt(false)}
                  className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7]"
                >
                  <span className="material-symbols-outlined text-lg">
                    close
                  </span>
                </button>
              </div>

              <div className="p-4 rounded-xl bg-[#F0F5F7] space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#577877]">Receipt Number:</span>
                  <span className="font-semibold text-[#162623]">
                    RCP-2026-8841
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#577877]">Appointment ID:</span>
                  <span className="font-semibold text-[#162623]">{apt.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#577877]">Patient:</span>
                  <span className="font-semibold text-[#162623]">
                    Emma Mitchell
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#577877]">Provider:</span>
                  <span className="font-semibold text-[#162623]">
                    {apt.doctor.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#577877]">Payment Method:</span>
                  <span className="font-semibold text-[#162623]">
                    Visa •••• {apt.cardLast4 || "4242"}
                  </span>
                </div>
                <div className="flex justify-between pt-2 border-t border-[#577877]/15">
                  <span className="font-bold text-[#162623]">Total Paid:</span>
                  <span className="font-bold text-base text-[#295255]">
                    {apt.fee}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowReceipt(false)}
                  className="btn-secondary !py-2 !px-4 text-xs"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="btn-primary !py-2 !px-4 text-xs flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">
                    print
                  </span>
                  <span>Print Receipt</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ========================================================
  // VIEW A: MY APPOINTMENTS DIRECTORY VIEW (Matches Screenshot 7)
  // ========================================================
  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Toast Notification */}
        {toastMessage && (
          <div className="p-3.5 rounded-xl bg-white border border-[#295255]/30 shadow-sm flex items-center justify-between text-xs text-[#295255] font-semibold">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base">
                check_circle
              </span>
              {toastMessage}
            </span>
            <button
              type="button"
              onClick={() => setToastMessage("")}
              className="text-[#577877] hover:text-[#162623]"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Page Heading & Top Action Row matching Screenshot */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
              My appointments
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#577877]">
              A clear view of your care, from the next visit to the last.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate("find-doctors")}
            className="btn-primary !px-5 !py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs shrink-0"
          >
            <span className="material-symbols-outlined !text-white text-base">
              add
            </span>
            <span>Book appointment</span>
          </button>
        </div>

        {/* Tabs Row: Upcoming (2) | Past appointments | Cancelled */}
        <div className="flex items-center gap-8 border-b border-[#577877]/20 pt-1 text-sm font-medium">
          {[
            {
              id: "upcoming",
              label: `Upcoming (${activeUpcomingList.length})`,
            },
            {
              id: "past",
              label: `Past appointments (${activePastList.length})`,
            },
            {
              id: "cancelled",
              label: `Cancelled (${activeCancelledList.length})`,
            },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 font-semibold transition-all relative ${
                  isActive
                    ? "text-[#295255]"
                    : "text-[#577877] hover:text-[#162623]"
                }`}
              >
                <span>{tab.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#295255] rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Main 2-Column Content Layout matching Screenshot */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (8 cols): Appointment Feed Cards */}
          <div className="lg:col-span-8 space-y-5">
            {activeTab === "upcoming" && (
              <>
                {activeUpcomingList.map((apt) => (
                  <div
                    key={apt.id}
                    className="care-card p-6 sm:p-7 space-y-5 transition-all hover:shadow-md"
                  >
                    {/* Top Row: Appointment ID + Confirmed Badge */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#577877] font-medium">
                        {apt.displayId || apt.id}
                      </span>
                      <span className="inline-flex items-center text-xs font-semibold px-3 py-0.5 rounded-full bg-[#E6F4EA] text-[#1E7E34]">
                        {apt.status}
                      </span>
                    </div>

                    {/* Doctor Info Row */}
                    <div className="flex items-start gap-4">
                      <div className="w-11 h-11 rounded-full bg-[#E0F0EC] text-[#295255] font-bold text-sm flex items-center justify-center shrink-0">
                        {apt.doctor.initials}
                      </div>

                      <div className="space-y-0.5">
                        <h3 className="text-base font-bold text-[#162623]">
                          {apt.doctor.name}
                        </h3>
                        <p className="text-xs font-semibold text-[#295255]">
                          {apt.doctor.specialty}
                        </p>
                        <p className="text-xs text-[#577877]">{apt.reason}</p>
                      </div>
                    </div>

                    {/* 3-Column Metadata Row matching Screenshot */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-3 gap-x-4 text-xs pt-1">
                      <div>
                        <span className="text-[#577877] block text-[11px]">
                          Date
                        </span>
                        <span className="font-semibold text-xs text-[#162623] mt-0.5 block">
                          {apt.dateShort}
                        </span>
                      </div>

                      <div>
                        <span className="text-[#577877] block text-[11px]">
                          Time
                        </span>
                        <span className="font-semibold text-xs text-[#162623] mt-0.5 block">
                          {apt.timeRange}
                        </span>
                      </div>

                      <div>
                        <span className="text-[#577877] block text-[11px]">
                          Format
                        </span>
                        <span className="font-semibold text-xs text-[#162623] mt-0.5 block">
                          {apt.format}
                        </span>
                      </div>
                    </div>

                    {/* Actions Row + Paid Amount matching Screenshot */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#577877]/15">
                      <div className="flex items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            setDetailAppointment(apt);
                            setView("confirmation");
                          }}
                          className="btn-primary !px-4 !py-2 rounded-xl text-xs font-semibold shadow-2xs"
                        >
                          View details
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setDetailAppointment(apt);
                            setView("reschedule");
                          }}
                          className="btn-secondary !px-4 !py-2 rounded-xl text-xs font-semibold"
                        >
                          Reschedule
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCancelAppointment(apt)}
                          className="text-xs font-semibold text-[#162623] hover:text-rose-600 px-2 py-2 cursor-pointer transition"
                        >
                          Cancel visit
                        </button>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-semibold text-[#295255]">
                          Paid · {apt.fee}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}

            {activeTab === "past" && (
              <div className="space-y-4">
                {activePastList.map((apt) => (
                  <div key={apt.id} className="care-card p-6 sm:p-7 space-y-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#577877]">
                        {apt.displayId || apt.id}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-[#F0F5F7] text-[#577877] font-semibold text-[11px]">
                        {apt.status}
                      </span>
                    </div>

                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-full bg-[#E4EDF0] text-[#295255] font-bold text-xs flex items-center justify-center shrink-0">
                        {apt.doctor.initials}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#162623]">
                          {apt.doctor.name}
                        </h3>
                        <p className="text-xs text-[#295255]">
                          {apt.doctor.specialty}
                        </p>
                        <p className="text-xs text-[#577877]">{apt.reason}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-xs pt-1">
                      <div>
                        <span className="text-[#577877] block text-[11px]">
                          Completed Date
                        </span>
                        <span className="font-semibold text-[#162623]">
                          {apt.dateShort}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#577877] block text-[11px]">
                          Consultation Fee
                        </span>
                        <span className="font-semibold text-[#162623]">
                          {apt.fee}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 pt-3 border-t border-[#577877]/15">
                      <button
                        type="button"
                        onClick={() => onNavigate("summaries")}
                        className="btn-secondary !px-3.5 !py-1.5 text-xs font-semibold rounded-xl"
                      >
                        View summary
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigate("prescriptions")}
                        className="btn-secondary !px-3.5 !py-1.5 text-xs font-semibold rounded-xl"
                      >
                        Prescriptions
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "cancelled" && (
              <div className="space-y-4">
                {activeCancelledList.map((apt) => (
                  <div key={apt.id} className="care-card p-6 sm:p-7 space-y-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#577877]">
                        {apt.displayId || apt.id}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-red-50 text-red-700 font-semibold text-[11px]">
                        Cancelled · Refunded
                      </span>
                    </div>

                    <div className="flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-full bg-[#F0F5F7] text-[#577877] font-bold text-xs flex items-center justify-center shrink-0">
                        {apt.doctor.initials}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-[#162623]">
                          {apt.doctor.name}
                        </h3>
                        <p className="text-xs text-[#577877]">
                          {apt.doctor.specialty} · {apt.reason}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-3 border-t border-[#577877]/15 text-xs">
                      <span className="text-[#577877]">
                        Refund status:{" "}
                        <strong>Credited to original payment method</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => onNavigate("find-doctors")}
                        className="btn-primary !px-3.5 !py-1.5 text-xs font-semibold rounded-xl"
                      >
                        Rebook
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column (4 cols): Information & Support Cards matching Screenshot */}
          <div className="lg:col-span-4 space-y-4">
            {/* Card 1: Before your appointment matching Screenshot */}
            <div className="care-card p-6 sm:p-7 space-y-4">
              <h3 className="text-base font-bold text-[#162623]">
                Before your appointment
              </h3>
              <p className="text-xs text-[#577877] leading-relaxed">
                Make the most of your time with your doctor.
              </p>

              <div className="space-y-3 pt-1 text-xs">
                <div className="flex items-center gap-2.5 text-[#162623]">
                  <span className="text-[#295255] font-bold">✓</span>
                  <span>Add your recent health records</span>
                </div>
                <div className="flex items-center gap-2.5 text-[#162623]">
                  <span className="text-[#295255] font-bold">✓</span>
                  <span>Prepare a list of questions</span>
                </div>
                <div className="flex items-center gap-2.5 text-[#162623]">
                  <span className="text-[#295255] font-bold">✓</span>
                  <span>Test your camera &amp; microphone</span>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeviceModal(true)}
                  className="btn-secondary w-full !py-2.5 rounded-xl font-semibold text-xs text-[#162623] shadow-2xs"
                >
                  Test my device
                </button>
              </div>
            </div>

            {/* Card 2: Joining your video visit matching Screenshot */}
            <div className="p-5 rounded-2xl bg-[#E8F3F3] border border-[#577877]/20 flex items-start gap-3">
              <span className="material-symbols-outlined !text-[#295255] text-lg shrink-0 mt-0.5">
                info
              </span>
              <div className="text-xs space-y-2 w-full">
                <div>
                  <h4 className="font-bold text-[#162623]">
                    Joining your video visit
                  </h4>
                  <p className="text-[#577877] leading-relaxed">
                    The join button becomes available 10 minutes before your
                    visit. We'll send a reminder, too.
                  </p>
                </div>
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => handleJoinWaitingRoom(detailAppointment)}
                    className="btn-primary !px-4 !py-2 text-xs rounded-xl font-semibold shadow-2xs w-full flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">
                      videocam
                    </span>
                    <span>Enter waiting room</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Card 3: Looking for a past visit? matching Screenshot */}
            <div className="care-card p-6 sm:p-7 space-y-3">
              <h3 className="text-base font-bold text-[#162623]">
                Looking for a past visit?
              </h3>
              <p className="text-xs text-[#577877] leading-relaxed">
                Find your summaries, prescriptions, and visit history in one
                place.
              </p>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setView("history")}
                  className="btn-secondary w-full !py-2.5 rounded-xl font-semibold text-xs text-[#162623] shadow-2xs"
                >
                  View appointment history
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Global Footer matching Screenshot */}
        <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
          <p>© 2026 Kaizentrix Care · Your health, thoughtfully connected.</p>
          <div className="flex items-center gap-4">
            <span className="hover:text-[#162623] cursor-pointer">Privacy</span>
            <span>·</span>
            <span className="hover:text-[#162623] cursor-pointer">Terms</span>
            <span>·</span>
            <span
              className="hover:text-[#162623] cursor-pointer"
              onClick={() => onNavigate("support")}
            >
              Need help?
            </span>
          </div>
        </div>
      </div>

      {/* Device Test Modal */}
      {showDeviceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined !text-[#295255] text-2xl">
                  videocam
                </span>
                <h3 className="text-base font-bold text-[#162623]">
                  Hardware &amp; Network Check
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowDeviceModal(false)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7]"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#F0F5F7] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[#577877]">
                    Camera (FaceTime HD 1080p):
                  </span>
                  <span className="font-bold text-[#1E7E34] flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">
                      check_circle
                    </span>
                    {deviceCheckState.cam}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#577877]">Microphone Input:</span>
                  <span className="font-bold text-[#1E7E34] flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">
                      check_circle
                    </span>
                    {deviceCheckState.mic}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#577877]">Audio Output Speaker:</span>
                  <span className="font-bold text-[#1E7E34] flex items-center gap-1">
                    <span className="material-symbols-outlined text-xs">
                      check_circle
                    </span>
                    {deviceCheckState.speaker}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-[#577877]/15">
                  <span className="text-[#577877]">Network Connection:</span>
                  <span className="font-semibold text-[#295255]">
                    {deviceCheckState.network}
                  </span>
                </div>
              </div>
              <p className="text-[11px] text-[#577877] leading-relaxed">
                Your device hardware is ready for encrypted HD
                teleconsultations.
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => {
                  setDeviceCheckState((prev) => ({ ...prev }));
                  setShowDeviceModal(false);
                  setToastMessage(
                    "Hardware self-check passed! Ready for your visit.",
                  );
                  setTimeout(() => setToastMessage(""), 3500);
                }}
                className="btn-primary w-full text-xs !py-2.5"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Visit Modal */}
      {showCancelModal && pendingCancelApt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#FDF2F2] text-[#E02424] flex items-center justify-center">
                  <span className="material-symbols-outlined !text-[#E02424] text-base">
                    event_busy
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#162623]">
                  Cancel Appointment
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7]"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#F0F5F7] space-y-2">
                <div className="flex justify-between">
                  <span className="text-[#577877]">Doctor:</span>
                  <span className="font-semibold text-[#162623]">
                    {pendingCancelApt.doctor.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#577877]">Scheduled for:</span>
                  <span className="font-semibold text-[#162623]">
                    {pendingCancelApt.dateShort} · {pendingCancelApt.timeRange}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#577877]">Refund Amount:</span>
                  <span className="font-bold text-[#295255]">
                    {pendingCancelApt.fee} (Full refund)
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                  Reason for cancellation
                </label>
                <select
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] font-medium focus:outline-none focus:border-[#295255] cursor-pointer"
                >
                  <option value="No longer needed">No longer needed</option>
                  <option value="Schedule conflict">Schedule conflict</option>
                  <option value="Found alternative care">
                    Found alternative care
                  </option>
                  <option value="Fee or insurance issue">
                    Fee or insurance issue
                  </option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <p className="text-[11px] text-[#577877] leading-relaxed">
                A full refund of {pendingCancelApt.fee} will be credited to your
                Visa ending {pendingCancelApt.cardLast4 || "4242"}.
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="btn-secondary !py-2 !px-4 text-xs font-semibold"
              >
                Keep appointment
              </button>
              <button
                type="button"
                onClick={handleConfirmCancellation}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white transition cursor-pointer"
              >
                Confirm cancellation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
