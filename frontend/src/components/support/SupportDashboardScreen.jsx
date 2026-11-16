import { useEffect, useState } from "react";
import { supportDashboardApi } from "../../lib/api";
import { ToastProvider, useToast } from "../common/Toast";

function SupportDashboardContent({ user, onLogout }) {
  const { showToast } = useToast();
  const addToast = showToast;
  const [activeTab, setActiveTab] = useState("overview");

  // Overview State
  const [overviewData, setOverviewData] = useState(null);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Account & Access State
  const [accountQuery, setAccountQuery] = useState("");
  const [accountDiagData, setAccountDiagData] = useState(null);
  const [accountDiagLoading, setAccountDiagLoading] = useState(false);

  // Booking Diagnostics State
  const [bookingQuery, setBookingQuery] = useState("");
  const [bookingDiagData, setBookingDiagData] = useState(null);
  const [bookingDiagLoading, setBookingDiagLoading] = useState(false);

  // Patients State
  const [patients, setPatients] = useState([]);
  const [patientSearch, setPatientSearch] = useState("");
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Doctors State
  const [doctors, setDoctors] = useState([]);
  const [doctorSearch, setDoctorSearch] = useState("");
  const [doctorStatus, setDoctorStatus] = useState("");
  const [doctorsLoading, setDoctorsLoading] = useState(false);

  // Appointments State
  const [appointments, setAppointments] = useState([]);
  const [appointmentSearch, setAppointmentSearch] = useState("");
  const [appointmentStatus, setAppointmentStatus] = useState("");
  const [appointmentsLoading, setAppointmentsLoading] = useState(false);
  const [actionModalAppointment, setActionModalAppointment] = useState(null);
  const [actionType, setActionType] = useState("reschedule"); // reschedule | cancel
  const [actionReason, setActionReason] = useState("");
  const [rescheduleDate, setRescheduleDate] = useState("");

  // Payments State
  const [payments, setPayments] = useState([]);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [refundModalPayment, setRefundModalPayment] = useState(null);
  const [refundReason, setRefundReason] = useState("");

  // Video Sessions & Diagnostics State
  const [videoSessions, setVideoSessions] = useState([]);
  const [videoLoading, setVideoLoading] = useState(false);
  const [videoQuery, setVideoQuery] = useState("");
  const [videoDiagData, setVideoDiagData] = useState(null);
  const [videoDiagLoading, setVideoDiagLoading] = useState(false);

  // Tickets State
  const [tickets, setTickets] = useState([]);
  const [ticketStatus, setTicketStatus] = useState("");
  const [ticketPriority, setTicketPriority] = useState("");
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [newNoteText, setNewNoteText] = useState("");

  // Create Ticket Modal State
  const [showCreateTicketModal, setShowCreateTicketModal] = useState(false);
  const [newTicketForm, setNewTicketForm] = useState({
    subject: "",
    description: "",
    category: "general",
    priority: "medium",
    patient_id: "",
    doctor_id: "",
  });

  // Load Overview Data
  const loadOverview = async () => {
    setOverviewLoading(true);
    try {
      const data = await supportDashboardApi.overview();
      setOverviewData(data);
    } catch (err) {
      addToast(err.message || "Failed to load support overview", "error");
    } finally {
      setOverviewLoading(false);
    }
  };

  // Load Patients
  const loadPatients = async () => {
    setPatientsLoading(true);
    try {
      const res = await supportDashboardApi.patients(patientSearch);
      setPatients(res.items || []);
    } catch (err) {
      addToast(err.message || "Failed to load patients", "error");
    } finally {
      setPatientsLoading(false);
    }
  };

  // Load Doctors
  const loadDoctors = async () => {
    setDoctorsLoading(true);
    try {
      const res = await supportDashboardApi.doctors(doctorSearch, doctorStatus);
      setDoctors(res.items || []);
    } catch (err) {
      addToast(err.message || "Failed to load doctors", "error");
    } finally {
      setDoctorsLoading(false);
    }
  };

  // Load Appointments
  const loadAppointments = async () => {
    setAppointmentsLoading(true);
    try {
      const res = await supportDashboardApi.appointments(appointmentSearch, appointmentStatus);
      setAppointments(res.items || []);
    } catch (err) {
      addToast(err.message || "Failed to load appointments", "error");
    } finally {
      setAppointmentsLoading(false);
    }
  };

  // Load Payments
  const loadPayments = async () => {
    setPaymentsLoading(true);
    try {
      const res = await supportDashboardApi.payments(paymentSearch);
      setPayments(res.items || []);
    } catch (err) {
      addToast(err.message || "Failed to load payments", "error");
    } finally {
      setPaymentsLoading(false);
    }
  };

  // Load Video Sessions
  const loadVideoSessions = async () => {
    setVideoLoading(true);
    try {
      const res = await supportDashboardApi.videoSessions();
      setVideoSessions(res || []);
    } catch (err) {
      addToast(err.message || "Failed to load video sessions", "error");
    } finally {
      setVideoLoading(false);
    }
  };

  // Load Tickets
  const loadTickets = async () => {
    setTicketsLoading(true);
    try {
      const res = await supportDashboardApi.tickets(ticketStatus, ticketPriority);
      setTickets(res.items || []);
    } catch (err) {
      addToast(err.message || "Failed to load tickets", "error");
    } finally {
      setTicketsLoading(false);
    }
  };

  const loadAccountDiagnostics = async () => {
    if (!accountQuery || accountQuery.length < 2) {
      addToast("Please enter at least 2 characters (email, user ID, or name)", "warning");
      return;
    }
    setAccountDiagLoading(true);
    try {
      const data = await supportDashboardApi.accountDiagnostics(accountQuery);
      setAccountDiagData(data);
    } catch (err) {
      addToast(err.message || "Account record not found", "error");
      setAccountDiagData(null);
    } finally {
      setAccountDiagLoading(false);
    }
  };

  const handleAccountAction = async (action, ticketId = null) => {
    if (!accountDiagData) return;
    try {
      await supportDashboardApi.accountAction(accountDiagData.user_id, action, ticketId);
      addToast(`Action '${action.replace(/_/g, " ")}' completed successfully`, "success");
      loadAccountDiagnostics();
    } catch (err) {
      addToast(err.message || "Failed to execute account action", "error");
    }
  };

  const loadBookingDiagnostics = async () => {
    if (!bookingQuery || bookingQuery.length < 2) {
      addToast("Please enter at least 2 characters (Booking ID, patient name, or doctor name)", "warning");
      return;
    }
    setBookingDiagLoading(true);
    try {
      const data = await supportDashboardApi.bookingDiagnostics(bookingQuery);
      setBookingDiagData(data);
    } catch (err) {
      addToast(err.message || "Booking record not found", "error");
      setBookingDiagData(null);
    } finally {
      setBookingDiagLoading(false);
    }
  };

  const handleBookingAction = async (action, reason = "Support Action", startsAt = null, ticketId = null) => {
    if (!bookingDiagData) return;
    try {
      await supportDashboardApi.bookingAction(bookingDiagData.booking_id, action, reason, startsAt, ticketId);
      addToast(`Booking action '${action}' completed successfully`, "success");
      loadBookingDiagnostics();
    } catch (err) {
      addToast(err.message || "Failed to execute booking action", "error");
    }
  };

  const loadVideoDiagnostics = async () => {
    if (!videoQuery || videoQuery.length < 2) {
      addToast("Please enter at least 2 characters (Session ID or Appointment ID)", "warning");
      return;
    }
    setVideoDiagLoading(true);
    try {
      const data = await supportDashboardApi.videoDiagnostics(videoQuery);
      setVideoDiagData(data);
    } catch (err) {
      addToast(err.message || "Video session record not found", "error");
      setVideoDiagData(null);
    } finally {
      setVideoDiagLoading(false);
    }
  };

  const handleVideoAction = async (action, ticketId = null) => {
    const targetId = videoDiagData?.consultation_id;
    if (!targetId) return;
    try {
      await supportDashboardApi.videoAction(targetId, action, ticketId);
      addToast(`Video support action '${action.replace(/_/g, " ")}' completed`, "success");
      loadVideoDiagnostics();
      loadVideoSessions();
    } catch (err) {
      addToast(err.message || "Failed to execute video action", "error");
    }
  };

  useEffect(() => {
    if (activeTab === "overview") loadOverview();
    else if (activeTab === "account_access") { if (accountQuery) loadAccountDiagnostics(); }
    else if (activeTab === "booking_issues") { if (bookingQuery) loadBookingDiagnostics(); }
    else if (activeTab === "patients") loadPatients();
    else if (activeTab === "doctors") loadDoctors();
    else if (activeTab === "appointments") loadAppointments();
    else if (activeTab === "payments") loadPayments();
    else if (activeTab === "video") { loadVideoSessions(); if (videoQuery) loadVideoDiagnostics(); }
    else if (activeTab === "tickets") loadTickets();
  }, [activeTab]);

  // Appointment Action Submit
  const handleAppointmentAction = async (e) => {
    e.preventDefault();
    if (!actionReason) {
      addToast("Please provide a reason", "warning");
      return;
    }
    try {
      await supportDashboardApi.appointmentAction(
        actionModalAppointment.id,
        actionType,
        actionReason,
        actionType === "reschedule" ? rescheduleDate : null
      );
      addToast(`Appointment ${actionType}d successfully`, "success");
      setActionModalAppointment(null);
      setActionReason("");
      setRescheduleDate("");
      loadAppointments();
    } catch (err) {
      addToast(err.message || `Failed to ${actionType} appointment`, "error");
    }
  };

  // Payment Refund Submit
  const handleRefundSubmit = async (e) => {
    e.preventDefault();
    if (!refundReason) {
      addToast("Please provide a refund reason", "warning");
      return;
    }
    try {
      await supportDashboardApi.refundPayment(refundModalPayment.id, refundReason);
      addToast("Refund request processed successfully", "success");
      setRefundModalPayment(null);
      setRefundReason("");
      loadPayments();
    } catch (err) {
      addToast(err.message || "Failed to process refund", "error");
    }
  };

  // End Video Session
  const handleEndVideoSession = async (sessionId) => {
    if (!window.confirm("Force-end this active consultation video session?")) return;
    try {
      await supportDashboardApi.endVideoSession(sessionId);
      addToast("Video session ended by support", "success");
      loadVideoSessions();
    } catch (err) {
      addToast(err.message || "Failed to end video session", "error");
    }
  };

  // Create Ticket Submit
  const handleCreateTicket = async (e) => {
    e.preventDefault();
    try {
      await supportDashboardApi.createTicket(newTicketForm);
      addToast("Support ticket created successfully", "success");
      setShowCreateTicketModal(false);
      setNewTicketForm({ subject: "", description: "", category: "general", priority: "medium", patient_id: "", doctor_id: "" });
      if (activeTab === "tickets") loadTickets();
    } catch (err) {
      addToast(err.message || "Failed to create ticket", "error");
    }
  };

  // Update Ticket Status/Note
  const handleUpdateTicket = async (updates) => {
    try {
      const updated = await supportDashboardApi.updateTicket(selectedTicket.id, updates);
      setSelectedTicket(updated);
      addToast("Ticket updated", "success");
      loadTickets();
    } catch (err) {
      addToast(err.message || "Failed to update ticket", "error");
    }
  };

  const handleAddNote = async (e) => {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    try {
      const updated = await supportDashboardApi.updateTicket(selectedTicket.id, { note: newNoteText });
      setSelectedTicket(updated);
      setNewNoteText("");
      addToast("Note added", "success");
    } catch (err) {
      addToast(err.message || "Failed to add note", "error");
    }
  };

  const tabs = [
    { id: "overview", label: "Live Operations", icon: "grid_view" },
    { id: "account_access", label: "Account & Access", icon: "manage_accounts" },
    { id: "booking_issues", label: "Booking Issues", icon: "event_busy" },
    { id: "patients", label: "Patient Support", icon: "groups" },
    { id: "doctors", label: "Doctor Assistance", icon: "badge" },
    { id: "appointments", label: "Appointments", icon: "calendar_month" },
    { id: "payments", label: "Payments & Refunds", icon: "payments" },
    { id: "video", label: "Video Diagnostics", icon: "video_camera_front" },
    { id: "tickets", label: "Support Desk", icon: "headset_mic" },
  ];

  return (
    <div className="min-h-screen bg-[#F0F5F7] text-[#162623] font-sans flex flex-col">
      {/* Top Support Header */}
      <header className="sticky top-0 z-30 bg-[#162623] text-white border-b border-zinc-800 shadow-md">
        <div className="max-w-[1440px] mx-auto px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-[#29E2B9] text-[#162623] flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-xl">support_agent</span>
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none tracking-tight flex items-center gap-2">
                Kaizen Care
                <span className="bg-[#29E2B9]/20 text-[#29E2B9] text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                  Support Portal
                </span>
              </h1>
              <p className="text-xs text-zinc-400 mt-0.5">Platform Support Operations Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setShowCreateTicketModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#29E2B9] px-3.5 py-2 text-xs font-bold text-[#162623] hover:bg-white transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">add_comment</span>
              <span>Create Ticket</span>
            </button>
            <div className="h-6 w-px bg-zinc-700"></div>
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-full bg-[#1e322e] text-[#29E2B9] font-bold flex items-center justify-center text-xs">
                {user?.full_name?.charAt(0) || "S"}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-xs font-semibold text-white leading-none">{user?.full_name || "Support Agent"}</p>
                <p className="text-[10px] text-zinc-400 mt-0.5">{user?.email}</p>
              </div>
            </div>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                title="Sign out"
                className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">logout</span>
              </button>
            )}
          </div>
        </div>

        {/* Sub Navigation Bar */}
        <div className="bg-[#101c1a] border-t border-zinc-800/80 px-6">
          <div className="max-w-[1440px] mx-auto flex items-center gap-1 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
                  activeTab === tab.id
                    ? "border-[#29E2B9] text-[#29E2B9] bg-white/5"
                    : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
                }`}
              >
                <span className="material-symbols-outlined text-base">{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main Screen Content Area */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto p-6 space-y-6">
        {/* ========================================================================= */}
        {/* SCREEN 1: LIVE OPERATIONS OVERVIEW                                        */}
        {/* ========================================================================= */}
        {activeTab === "overview" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* PRD 5.2 & 5.3 KPI Counters Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs flex items-center gap-4">
                <div className="size-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl">confirmation_number</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500">Total Open</p>
                  <p className="text-xl font-bold text-zinc-900">{overviewData?.kpis?.open_tickets ?? 0}</p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs flex items-center gap-4">
                <div className="size-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl">person_search</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500">Unassigned</p>
                  <p className="text-xl font-bold text-blue-600">{overviewData?.kpis?.unassigned_tickets ?? 0}</p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs flex items-center gap-4">
                <div className="size-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl">warning</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500">Urgent Tickets</p>
                  <p className="text-xl font-bold text-red-600">{overviewData?.kpis?.urgent_tickets ?? 0}</p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs flex items-center gap-4">
                <div className="size-11 rounded-xl bg-green-50 text-green-700 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl">task_alt</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500">Resolved Today</p>
                  <p className="text-xl font-bold text-green-700">{overviewData?.kpis?.resolved_today ?? 0}</p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs flex items-center gap-4">
                <div className="size-11 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl">timer_off</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500">SLA Breaches</p>
                  <p className="text-xl font-bold text-purple-700">{overviewData?.kpis?.sla_breaches ?? 0}</p>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs flex items-center gap-4">
                <div className="size-11 rounded-xl bg-[#EEF6F3] text-[#1A7D67] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl">assignment_ind</span>
                </div>
                <div>
                  <p className="text-xs font-medium text-zinc-500">My Queue</p>
                  <p className="text-xl font-bold text-[#1A7D67]">{overviewData?.kpis?.my_assigned_tickets ?? 0}</p>
                </div>
              </div>
            </div>

            {/* Ticket Category Summary Distribution */}
            {overviewData?.category_summary && (
              <div className="bg-white p-5 rounded-2xl border border-zinc-200 shadow-xs space-y-3">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Active Ticket Distribution by Issue Category</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                  {Object.entries(overviewData.category_summary).map(([cat, count]) => (
                    <div key={cat} className="p-3 bg-[#F8FAF9] rounded-xl border border-zinc-100 flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-700 uppercase">{cat.replace("_", " ")}</span>
                      <span className="text-xs font-bold text-[#1A7D67] bg-[#EEF6F3] px-2 py-0.5 rounded-full">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Overview Content Columns */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Recent Support Tickets Table */}
              <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#1A7D67]">headset_mic</span>
                    Recent Support Requests
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab("tickets")}
                    className="text-xs font-semibold text-[#1A7D67] hover:underline cursor-pointer"
                  >
                    Go to Support Desk →
                  </button>
                </div>

                {overviewLoading ? (
                  <p className="text-xs text-zinc-400 py-6 text-center">Loading tickets…</p>
                ) : !overviewData?.recent_tickets?.length ? (
                  <p className="text-xs text-zinc-400 py-6 text-center">No active tickets.</p>
                ) : (
                  <div className="space-y-3">
                    {overviewData.recent_tickets.map((ticket) => (
                      <div
                        key={ticket.id}
                        onClick={() => {
                          setSelectedTicket(ticket);
                          setActiveTab("tickets");
                        }}
                        className="p-3.5 rounded-xl border border-zinc-100 hover:border-[#1A7D67]/30 bg-[#F9FBFA] hover:bg-[#EEF6F3]/50 transition cursor-pointer flex items-center justify-between gap-3"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-[#1A7D67]">{ticket.id}</span>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              ticket.priority === "urgent" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                            }`}>
                              {ticket.priority}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-zinc-800 mt-1">{ticket.subject}</p>
                        </div>
                        <span className="text-xs font-medium text-zinc-500 capitalize">{ticket.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Live Activity Stream */}
              <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs space-y-4">
                <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#1A7D67]">history</span>
                  Operational Audit Trail
                </h3>

                {overviewLoading ? (
                  <p className="text-xs text-zinc-400 py-6 text-center">Loading logs…</p>
                ) : !overviewData?.recent_activity?.length ? (
                  <p className="text-xs text-zinc-400 py-6 text-center">No audit logs available.</p>
                ) : (
                  <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
                    {overviewData.recent_activity.map((log) => (
                      <div key={log.id} className="p-3 rounded-xl bg-zinc-50 border border-zinc-100 text-xs flex justify-between gap-3">
                        <div>
                          <p className="font-semibold text-zinc-800">{log.action}</p>
                          <p className="text-zinc-500 text-[11px]">Actor: {log.actor_id}</p>
                        </div>
                        <span className="text-[10px] text-zinc-400 shrink-0">{new Date(log.created_at).toLocaleTimeString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 2: ACCOUNT & ACCESS ISSUES                                         */}
        {/* ========================================================================= */}
        {activeTab === "account_access" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Search Input */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs flex flex-col sm:flex-row gap-3 justify-between items-center">
              <div className="relative w-full sm:w-96">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-zinc-400 text-lg">manage_accounts</span>
                <input
                  type="text"
                  value={accountQuery}
                  onChange={(e) => setAccountQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadAccountDiagnostics()}
                  placeholder="Enter Email, User ID, or Name for account diagnostics…"
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-zinc-300 outline-none focus:border-[#1A7D67]"
                />
              </div>
              <button
                type="button"
                onClick={loadAccountDiagnostics}
                className="w-full sm:w-auto px-4 py-2 bg-[#1A7D67] text-white rounded-xl text-xs font-semibold hover:bg-[#156654] cursor-pointer"
              >
                Inspect Account Diagnostics
              </button>
            </div>

            {/* Security Policy Alert Banner */}
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200/80 text-xs text-amber-900 flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-600 text-lg shrink-0 mt-0.5">lock</span>
              <div>
                <p className="font-bold">Strict Security &amp; Privacy Restrictions (PRD Section 6.3)</p>
                <p className="mt-0.5 text-amber-800">
                  Support agents must not directly reveal OTPs, bypass MFA, change user passwords, or approve accounts without authorization. All privileged support actions are logged.
                </p>
              </div>
            </div>

            {/* Diagnostics View */}
            {accountDiagLoading ? (
              <div className="bg-white p-12 rounded-2xl border border-zinc-200 text-center text-zinc-400">
                Running account diagnostics…
              </div>
            ) : !accountDiagData ? (
              <div className="bg-white p-12 rounded-2xl border border-zinc-200 text-center text-zinc-400 space-y-2">
                <span className="material-symbols-outlined text-4xl text-zinc-300">person_search</span>
                <p className="text-sm font-medium">Enter an email, user ID, or name above to inspect authentication diagnostics.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Account Details Card */}
                <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-zinc-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-zinc-500">User ID: {accountDiagData.user_id}</span>
                        <span className="text-xs bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full font-bold uppercase">{accountDiagData.role}</span>
                      </div>
                      <h2 className="text-xl font-bold text-zinc-900 mt-1">{accountDiagData.full_name}</h2>
                      <p className="text-xs text-zinc-500 font-mono mt-0.5">Masked Email: {accountDiagData.masked_email}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase ${
                        accountDiagData.account_status === "active" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                      }`}>
                        Account: {accountDiagData.account_status}
                      </span>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase ${
                        accountDiagData.email_verified ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        Email: {accountDiagData.email_verified ? "Verified" : "Pending Verification"}
                      </span>
                    </div>
                  </div>

                  {/* Diagnostics Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                      <p className="text-xs text-zinc-500 font-medium">Recent Auth Error Category</p>
                      <p className={`text-sm font-bold mt-1 ${accountDiagData.recent_login_error_category !== "None" ? "text-amber-600" : "text-zinc-800"}`}>
                        {accountDiagData.recent_login_error_category}
                      </p>
                    </div>

                    <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                      <p className="text-xs text-zinc-500 font-medium">Last Successful Login</p>
                      <p className="text-sm font-bold text-zinc-800 mt-1">
                        {accountDiagData.last_successful_login ? new Date(accountDiagData.last_successful_login).toLocaleString() : "Never / No record"}
                      </p>
                    </div>

                    <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                      <p className="text-xs text-zinc-500 font-medium">Email Verification Date</p>
                      <p className="text-sm font-bold text-zinc-800 mt-1">
                        {accountDiagData.verified_at ? new Date(accountDiagData.verified_at).toLocaleDateString() : "Unverified"}
                      </p>
                    </div>
                  </div>

                  {/* Approved Actions Toolbar */}
                  <div className="space-y-3 pt-4 border-t border-zinc-100">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Approved Support Actions (PRD Section 6.3)</h3>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => handleAccountAction("resend_verification")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 text-[#1A7D67] text-xs font-semibold rounded-xl hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base">mark_email_unread</span>
                        <span>Resend Verification Email</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleAccountAction("send_troubleshooting")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 text-blue-700 text-xs font-semibold rounded-xl hover:bg-blue-100 border border-blue-200 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base">help_outline</span>
                        <span>Send Troubleshooting Guide</span>
                      </button>

                      {accountDiagData.role === "doctor" && (
                        <button
                          type="button"
                          onClick={() => handleAccountAction("refer_to_clinic_admin")}
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 text-amber-800 text-xs font-semibold rounded-xl hover:bg-amber-100 border border-amber-200 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-base">admin_panel_settings</span>
                          <span>Refer Doctor Approval to Clinic Admin</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleAccountAction("escalate_security")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-50 text-red-700 text-xs font-semibold rounded-xl hover:bg-red-100 border border-red-200 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base">security</span>
                        <span>Escalate to Security &amp; Operations</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Linked Support Tickets History */}
                <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs space-y-4">
                  <h3 className="text-base font-bold text-zinc-900">Linked Support Ticket History</h3>
                  {!accountDiagData.linked_tickets?.length ? (
                    <p className="text-xs text-zinc-400 py-4 italic">No prior support tickets associated with this account.</p>
                  ) : (
                    <div className="space-y-2">
                      {accountDiagData.linked_tickets.map((tk) => (
                        <div key={tk.id} className="p-3.5 bg-zinc-50 rounded-xl border border-zinc-100 flex items-center justify-between gap-3 text-xs">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-[#1A7D67]">{tk.id}</span>
                              <span className="bg-zinc-200 text-zinc-700 px-2 py-0.5 rounded-full font-semibold uppercase text-[10px]">{tk.category}</span>
                            </div>
                            <p className="font-semibold text-zinc-800 mt-1">{tk.subject}</p>
                          </div>
                          <span className="capitalize font-bold text-zinc-600">{tk.status}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 3: PATIENT SUPPORT                                                 */}
        {/* ========================================================================= */}
        {activeTab === "patients" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Search Controls */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs flex flex-col sm:flex-row gap-3 justify-between items-center">
              <div className="relative w-full sm:w-96">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-zinc-400 text-lg">search</span>
                <input
                  type="text"
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadPatients()}
                  placeholder="Search by patient name, email, or phone…"
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-zinc-300 outline-none focus:border-[#1A7D67]"
                />
              </div>
              <button
                type="button"
                onClick={loadPatients}
                className="w-full sm:w-auto px-4 py-2 bg-[#1A7D67] text-white rounded-xl text-xs font-semibold hover:bg-[#156654] cursor-pointer"
              >
                Search
              </button>
            </div>

            {/* Patients Table */}
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs overflow-hidden">
              {patientsLoading ? (
                <div className="p-12 text-center text-zinc-400">Loading patients…</div>
              ) : patients.length === 0 ? (
                <div className="p-12 text-center text-zinc-400">No patient records found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8FAF9] border-b border-zinc-200 text-xs font-semibold text-zinc-500 uppercase">
                      <tr>
                        <th className="px-6 py-3.5">Patient Name</th>
                        <th className="px-6 py-3.5">Contact Details</th>
                        <th className="px-6 py-3.5">Language</th>
                        <th className="px-6 py-3.5">Registered</th>
                        <th className="px-6 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {patients.map((p) => (
                        <tr key={p.id} className="hover:bg-[#F9FBFA]">
                          <td className="px-6 py-4 font-semibold text-zinc-900">{p.full_name}</td>
                          <td className="px-6 py-4 text-xs text-zinc-600">{p.email} • {p.phone || "No Phone"}</td>
                          <td className="px-6 py-4 text-xs uppercase">{p.preferred_language || "EN"}</td>
                          <td className="px-6 py-4 text-xs text-zinc-500">{p.created_at ? new Date(p.created_at).toLocaleDateString() : "—"}</td>
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={async () => {
                                const detail = await supportDashboardApi.patientDetail(p.id);
                                setSelectedPatient(detail);
                              }}
                              className="px-3 py-1.5 bg-[#EEF6F3] text-[#1A7D67] text-xs font-semibold rounded-lg hover:bg-[#1A7D67] hover:text-white transition cursor-pointer"
                            >
                              Inspect Details
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 3: BOOKING ISSUES & DIAGNOSTICS                                    */}
        {/* ========================================================================= */}
        {activeTab === "booking_issues" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Search Bar */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs flex flex-col sm:flex-row gap-3 justify-between items-center">
              <div className="relative w-full sm:w-96">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-zinc-400 text-lg">event_busy</span>
                <input
                  type="text"
                  value={bookingQuery}
                  onChange={(e) => setBookingQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadBookingDiagnostics()}
                  placeholder="Enter Booking ID, Patient Name, or Doctor Name…"
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-zinc-300 outline-none focus:border-[#1A7D67]"
                />
              </div>
              <button
                type="button"
                onClick={loadBookingDiagnostics}
                className="w-full sm:w-auto px-4 py-2 bg-[#1A7D67] text-white rounded-xl text-xs font-semibold hover:bg-[#156654] cursor-pointer"
              >
                Inspect Booking Diagnostics
              </button>
            </div>

            {/* Compliance Restrictions Alert */}
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200/80 text-xs text-amber-900 flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-600 text-lg shrink-0 mt-0.5">verified_user</span>
              <div>
                <p className="font-bold">Booking Policy Restrictions (PRD Section 7.3)</p>
                <p className="mt-0.5 text-amber-800">
                  Support must not create duplicate bookings, override cancellation policies, bypass payment requirements, or manually modify appointment statuses in MongoDB without policy checks.
                </p>
              </div>
            </div>

            {/* Diagnostics View */}
            {bookingDiagLoading ? (
              <div className="bg-white p-12 rounded-2xl border border-zinc-200 text-center text-zinc-400">
                Retrieving booking diagnostics…
              </div>
            ) : !bookingDiagData ? (
              <div className="bg-white p-12 rounded-2xl border border-zinc-200 text-center text-zinc-400 space-y-2">
                <span className="material-symbols-outlined text-4xl text-zinc-300">calendar_month</span>
                <p className="text-sm font-medium">Enter a Booking ID, Patient Name, or Doctor Name above to inspect appointment details.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Booking Detail Fields Grid (PRD 7.3) */}
                <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-zinc-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#1A7D67]">Booking #{bookingDiagData.booking_id}</span>
                        <span className="text-xs bg-blue-100 text-blue-800 px-2.5 py-0.5 rounded-full font-bold uppercase">{bookingDiagData.appointment_type}</span>
                      </div>
                      <h2 className="text-xl font-bold text-zinc-900 mt-1">
                        {bookingDiagData.patient?.name} ↔ {bookingDiagData.doctor?.name}
                      </h2>
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Clinic Scope: <span className="font-semibold text-zinc-800">{bookingDiagData.clinic_id}</span> • Specialty: <span className="font-semibold text-zinc-800">{bookingDiagData.doctor?.specialty}</span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase ${
                        bookingDiagData.booking_status === "completed" ? "bg-green-100 text-green-800" :
                        bookingDiagData.booking_status === "cancelled" ? "bg-red-100 text-red-800" :
                        bookingDiagData.booking_status === "rescheduled" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"
                      }`}>
                        Booking: {bookingDiagData.booking_status}
                      </span>
                      <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase ${
                        bookingDiagData.payment?.status === "paid" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                      }`}>
                        Payment: {bookingDiagData.payment?.status} (₹{bookingDiagData.payment?.amount || 0})
                      </span>
                    </div>
                  </div>

                  {/* Detail Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                    <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 space-y-1">
                      <p className="text-zinc-500 font-medium">Scheduled Time</p>
                      <p className="font-bold text-zinc-900 text-sm">{bookingDiagData.starts_at ? new Date(bookingDiagData.starts_at).toLocaleString() : "—"}</p>
                    </div>

                    <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 space-y-1">
                      <p className="text-zinc-500 font-medium">Patient Contact</p>
                      <p className="font-semibold text-zinc-800">{bookingDiagData.patient?.email}</p>
                      <p className="text-zinc-500">{bookingDiagData.patient?.phone || "No phone"}</p>
                    </div>

                    <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 space-y-1">
                      <p className="text-zinc-500 font-medium">Clinician</p>
                      <p className="font-semibold text-zinc-800">{bookingDiagData.doctor?.name}</p>
                      <p className="text-zinc-500">{bookingDiagData.doctor?.specialty}</p>
                    </div>

                    <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 space-y-1">
                      <p className="text-zinc-500 font-medium">Linked Payment ID</p>
                      <p className="font-mono font-bold text-[#1A7D67]">{bookingDiagData.payment?.id || "None"}</p>
                    </div>
                  </div>

                  {/* Available Doctor Slots */}
                  {bookingDiagData.available_doctor_slots?.length > 0 && (
                    <div className="p-4 bg-blue-50/60 rounded-xl border border-blue-100 space-y-2">
                      <h4 className="text-xs font-bold text-blue-900 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">schedule</span>
                        Available Doctor Slots ({bookingDiagData.doctor?.name})
                      </h4>
                      <div className="flex flex-wrap gap-2">
                        {bookingDiagData.available_doctor_slots.map((slot) => (
                          <button
                            key={slot.id || slot.starts_at}
                            type="button"
                            onClick={() => {
                              setActionModalAppointment({ id: bookingDiagData.booking_id });
                              setActionType("reschedule");
                              setRescheduleDate(slot.starts_at ? slot.starts_at.slice(0, 16) : "");
                            }}
                            className="px-2.5 py-1 bg-white hover:bg-blue-100 border border-blue-200 text-blue-800 text-xs font-semibold rounded-lg transition cursor-pointer"
                          >
                            {new Date(slot.starts_at).toLocaleString()}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Approved Booking Actions Toolbar */}
                  <div className="space-y-3 pt-4 border-t border-zinc-100">
                    <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Permitted Booking Actions (PRD Section 7.3)</h3>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setActionModalAppointment({ id: bookingDiagData.booking_id });
                          setActionType("reschedule");
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 text-blue-700 text-xs font-semibold rounded-xl hover:bg-blue-100 border border-blue-200 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base">edit_calendar</span>
                        <span>Authorized Reschedule</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActionModalAppointment({ id: bookingDiagData.booking_id });
                          setActionType("cancel");
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-50 text-red-700 text-xs font-semibold rounded-xl hover:bg-red-100 border border-red-200 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base">event_busy</span>
                        <span>Authorized Cancellation</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleBookingAction("send_instructions", "Support Booking Instructions")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 text-[#1A7D67] text-xs font-semibold rounded-xl hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base">send</span>
                        <span>Send Booking Access Instructions</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleBookingAction("escalate_scheduling", "Escalated scheduling exception")}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 text-amber-800 text-xs font-semibold rounded-xl hover:bg-amber-100 border border-amber-200 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base">warning</span>
                        <span>Escalate Scheduling Exception</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Booking Audit History Timeline */}
                <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs space-y-4">
                  <h3 className="text-base font-bold text-zinc-900">Booking Audit History Timeline</h3>
                  {!bookingDiagData.booking_history?.length ? (
                    <p className="text-xs text-zinc-400 py-4 italic">No audit history records found for this booking.</p>
                  ) : (
                    <div className="space-y-2">
                      {bookingDiagData.booking_history.map((log) => (
                        <div key={log.id} className="p-3 bg-zinc-50 rounded-xl border border-zinc-100 flex justify-between gap-3 text-xs">
                          <div>
                            <span className="font-semibold text-zinc-800">{log.action}</span>
                            <p className="text-[10px] text-zinc-500">Actor: {log.actor_id} • {log.metadata?.reason || ""}</p>
                          </div>
                          <span className="text-[10px] text-zinc-400 shrink-0">{new Date(log.created_at).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 3: DOCTOR ASSISTANCE                                               */}
        {/* ========================================================================= */}
        {activeTab === "doctors" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="flex gap-3 w-full sm:w-auto">
                <input
                  type="text"
                  value={doctorSearch}
                  onChange={(e) => setDoctorSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadDoctors()}
                  placeholder="Search doctor or specialty…"
                  className="px-3.5 py-2 text-sm rounded-xl border border-zinc-300 outline-none focus:border-[#1A7D67]"
                />
                <select
                  value={doctorStatus}
                  onChange={(e) => {
                    setDoctorStatus(e.target.value);
                    loadDoctors();
                  }}
                  className="px-3 py-2 text-sm rounded-xl border border-zinc-300 outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              <button
                type="button"
                onClick={loadDoctors}
                className="px-4 py-2 bg-[#1A7D67] text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Search Doctors
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs overflow-hidden">
              {doctorsLoading ? (
                <div className="p-12 text-center text-zinc-400">Loading doctors…</div>
              ) : doctors.length === 0 ? (
                <div className="p-12 text-center text-zinc-400">No doctor records found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8FAF9] border-b border-zinc-200 text-xs font-semibold text-zinc-500 uppercase">
                      <tr>
                        <th className="px-6 py-3.5">Doctor</th>
                        <th className="px-6 py-3.5">Specialty</th>
                        <th className="px-6 py-3.5">License / Experience</th>
                        <th className="px-6 py-3.5">Approval Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {doctors.map((d) => (
                        <tr key={d.id} className="hover:bg-[#F9FBFA]">
                          <td className="px-6 py-4 font-semibold text-zinc-900">{d.full_name}</td>
                          <td className="px-6 py-4 text-xs font-medium text-zinc-700">{d.specialty || "General"}</td>
                          <td className="px-6 py-4 text-xs text-zinc-500">{d.medical_license_number || "—"} ({d.years_of_experience || 0} yrs)</td>
                          <td className="px-6 py-4">
                            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full capitalize ${
                              d.approval_status === "approved" ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"
                            }`}>
                              {d.approval_status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 4: APPOINTMENT OPERATIONS                                          */}
        {/* ========================================================================= */}
        {activeTab === "appointments" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="flex gap-3 w-full sm:w-auto">
                <input
                  type="text"
                  value={appointmentSearch}
                  onChange={(e) => setAppointmentSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadAppointments()}
                  placeholder="Search patient, doctor, or ID…"
                  className="px-3.5 py-2 text-sm rounded-xl border border-zinc-300 outline-none focus:border-[#1A7D67]"
                />
                <select
                  value={appointmentStatus}
                  onChange={(e) => setAppointmentStatus(e.target.value)}
                  className="px-3 py-2 text-sm rounded-xl border border-zinc-300 outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="booked">Booked</option>
                  <option value="rescheduled">Rescheduled</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <button
                type="button"
                onClick={loadAppointments}
                className="px-4 py-2 bg-[#1A7D67] text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Filter Appointments
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs overflow-hidden">
              {appointmentsLoading ? (
                <div className="p-12 text-center text-zinc-400">Loading appointments…</div>
              ) : appointments.length === 0 ? (
                <div className="p-12 text-center text-zinc-400">No appointments found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8FAF9] border-b border-zinc-200 text-xs font-semibold text-zinc-500 uppercase">
                      <tr>
                        <th className="px-6 py-3.5">Appointment ID</th>
                        <th className="px-6 py-3.5">Patient</th>
                        <th className="px-6 py-3.5">Doctor</th>
                        <th className="px-6 py-3.5">Schedule Time</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5 text-right">Support Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {appointments.map((apt) => (
                        <tr key={apt.id} className="hover:bg-[#F9FBFA]">
                          <td className="px-6 py-4 font-mono text-xs font-bold text-[#1A7D67]">{apt.id}</td>
                          <td className="px-6 py-4 font-medium text-zinc-800">{apt.patient_name || apt.patient_id}</td>
                          <td className="px-6 py-4 font-medium text-zinc-800">{apt.doctor_name || apt.doctor_id}</td>
                          <td className="px-6 py-4 text-xs text-zinc-600">{apt.starts_at ? new Date(apt.starts_at).toLocaleString() : "—"}</td>
                          <td className="px-6 py-4">
                            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full capitalize ${
                              apt.status === "completed" ? "bg-green-100 text-green-800" : apt.status === "cancelled" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"
                            }`}>
                              {apt.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {apt.status !== "completed" && apt.status !== "cancelled" && (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActionModalAppointment(apt);
                                    setActionType("reschedule");
                                  }}
                                  className="px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 cursor-pointer"
                                >
                                  Reschedule
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setActionModalAppointment(apt);
                                    setActionType("cancel");
                                  }}
                                  className="px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 rounded-lg hover:bg-red-100 cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 5: PAYMENTS & REFUNDS                                              */}
        {/* ========================================================================= */}
        {activeTab === "payments" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs flex justify-between items-center">
              <input
                type="text"
                value={paymentSearch}
                onChange={(e) => setPaymentSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadPayments()}
                placeholder="Search payment ID or appointment ID…"
                className="px-3.5 py-2 text-sm rounded-xl border border-zinc-300 w-80 outline-none focus:border-[#1A7D67]"
              />
              <button
                type="button"
                onClick={loadPayments}
                className="px-4 py-2 bg-[#1A7D67] text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Refresh Payments
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs overflow-hidden">
              {paymentsLoading ? (
                <div className="p-12 text-center text-zinc-400">Loading payments…</div>
              ) : payments.length === 0 ? (
                <div className="p-12 text-center text-zinc-400">No payment records found.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8FAF9] border-b border-zinc-200 text-xs font-semibold text-zinc-500 uppercase">
                      <tr>
                        <th className="px-6 py-3.5">Payment ID</th>
                        <th className="px-6 py-3.5">Amount</th>
                        <th className="px-6 py-3.5">Method</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5 text-right">Refund Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {payments.map((pmt) => (
                        <tr key={pmt.id} className="hover:bg-[#F9FBFA]">
                          <td className="px-6 py-4 font-mono text-xs font-bold text-[#1A7D67]">{pmt.id}</td>
                          <td className="px-6 py-4 font-bold text-zinc-900">₹{pmt.amount || pmt.total_amount || 0}</td>
                          <td className="px-6 py-4 text-xs uppercase">{pmt.payment_method || "card"}</td>
                          <td className="px-6 py-4">
                            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full capitalize ${
                              pmt.status === "paid" || pmt.status === "completed" ? "bg-green-100 text-green-800" : pmt.status === "refunded" ? "bg-purple-100 text-purple-800" : "bg-amber-100 text-amber-800"
                            }`}>
                              {pmt.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            {pmt.status !== "refunded" && (
                              <button
                                type="button"
                                onClick={() => setRefundModalPayment(pmt)}
                                className="px-3 py-1.5 bg-purple-50 text-purple-700 text-xs font-semibold rounded-lg hover:bg-purple-100 transition cursor-pointer"
                              >
                                Issue Refund
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 5: VIDEO TROUBLESHOOTING & WEBRTC DIAGNOSTICS                       */}
        {/* ========================================================================= */}
        {activeTab === "video" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Search Bar */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs flex flex-col sm:flex-row gap-3 justify-between items-center">
              <div className="relative w-full sm:w-96">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-zinc-400 text-lg">video_camera_front</span>
                <input
                  type="text"
                  value={videoQuery}
                  onChange={(e) => setVideoQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadVideoDiagnostics()}
                  placeholder="Enter Consultation ID or Appointment ID…"
                  className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-zinc-300 outline-none focus:border-[#1A7D67]"
                />
              </div>
              <button
                type="button"
                onClick={loadVideoDiagnostics}
                className="w-full sm:w-auto px-4 py-2 bg-[#1A7D67] text-white rounded-xl text-xs font-semibold hover:bg-[#156654] cursor-pointer"
              >
                Inspect Video Diagnostics
              </button>
            </div>

            {/* Privacy Alert Banner (PRD Section 9.3) */}
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200/80 text-xs text-amber-900 flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-600 text-lg shrink-0 mt-0.5">lock</span>
              <div>
                <p className="font-bold">Strict Consultation Privacy Policy (PRD Section 9.3)</p>
                <p className="mt-0.5 text-amber-800">
                  Support agents must not join private consultations as a hidden participant or access clinical audio/video content. All diagnostic inspection is performed on sanitized WebRTC signaling events.
                </p>
              </div>
            </div>

            {/* Video Diagnostics Card */}
            {videoDiagLoading ? (
              <div className="bg-white p-12 rounded-2xl border border-zinc-200 text-center text-zinc-400">
                Retrieving WebRTC signaling diagnostics…
              </div>
            ) : videoDiagData && (
              <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs space-y-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-zinc-100">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#1A7D67]">Consultation #{videoDiagData.consultation_id}</span>
                      <span className="text-xs bg-zinc-100 text-zinc-700 px-2.5 py-0.5 rounded-full font-mono">Appt: {videoDiagData.appointment_id || "—"}</span>
                    </div>
                    <h2 className="text-xl font-bold text-zinc-900 mt-1">
                      {videoDiagData.participant?.patient_name} ↔ {videoDiagData.participant?.doctor_name}
                    </h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase ${
                      videoDiagData.session_status === "active" ? "bg-green-100 text-green-800" :
                      videoDiagData.session_status === "stalled" ? "bg-red-100 text-red-800" : "bg-zinc-100 text-zinc-700"
                    }`}>
                      Session: {videoDiagData.session_status}
                    </span>
                    <span className={`text-xs font-bold px-3 py-1 rounded-full uppercase ${
                      videoDiagData.signaling_status === "Connected" ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}>
                      Signaling: {videoDiagData.signaling_status}
                    </span>
                  </div>
                </div>

                {/* Technical Diagnostic Fields (PRD 9.3) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 space-y-1">
                    <p className="text-zinc-500 font-medium">Camera Permission</p>
                    <p className={`font-bold text-sm ${videoDiagData.camera_permission === "Granted" ? "text-green-700" : "text-amber-700"}`}>
                      {videoDiagData.camera_permission}
                    </p>
                  </div>

                  <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 space-y-1">
                    <p className="text-zinc-500 font-medium">Microphone Permission</p>
                    <p className={`font-bold text-sm ${videoDiagData.microphone_permission === "Granted" ? "text-green-700" : "text-amber-700"}`}>
                      {videoDiagData.microphone_permission}
                    </p>
                  </div>

                  <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 space-y-1">
                    <p className="text-zinc-500 font-medium">Sanitized Error Category</p>
                    <p className={`font-bold text-sm ${videoDiagData.error_category !== "None" ? "text-red-600" : "text-zinc-800"}`}>
                      {videoDiagData.error_category}
                    </p>
                  </div>

                  <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 space-y-1">
                    <p className="text-zinc-500 font-medium">Disconnect Time</p>
                    <p className="font-bold text-zinc-900 text-sm">
                      {videoDiagData.disconnect_time ? new Date(videoDiagData.disconnect_time).toLocaleTimeString() : "N/A (Active/Connected)"}
                    </p>
                  </div>
                </div>

                {/* Approved Video Support Actions Toolbar */}
                <div className="space-y-3 pt-2 border-t border-zinc-100">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Permitted Video Support Actions (PRD Section 9.3)</h3>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => handleVideoAction("send_permission_guide")}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 text-[#1A7D67] text-xs font-semibold rounded-xl hover:bg-emerald-100 border border-emerald-200 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">videocam</span>
                      <span>Send Camera/Mic Permission Guide</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleVideoAction("send_connectivity_guide")}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 text-blue-700 text-xs font-semibold rounded-xl hover:bg-blue-100 border border-blue-200 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">wifi</span>
                      <span>Send WebRTC Connectivity Checklist</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleVideoAction("end_stalled_session")}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 text-amber-800 text-xs font-semibold rounded-xl hover:bg-amber-100 border border-amber-200 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">call_end</span>
                      <span>Force End Stalled Session</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleVideoAction("escalate_technical_ops")}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-red-50 text-red-700 text-xs font-semibold rounded-xl hover:bg-red-100 border border-red-200 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">engineering</span>
                      <span>Refer Infrastructure Failure to Technical Operations</span>
                    </button>
                  </div>
                </div>

                {/* Connection Events Timeline */}
                <div className="space-y-3 pt-2 border-t border-zinc-100">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Sanitized Connection Event History</h3>
                  {!videoDiagData.connection_events?.length ? (
                    <p className="text-xs text-zinc-400 italic">No connection error logs recorded for this session.</p>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {videoDiagData.connection_events.map((evt) => (
                        <div key={evt.id} className="p-2.5 bg-zinc-50 rounded-lg border border-zinc-100 text-xs flex justify-between gap-3">
                          <div>
                            <span className="font-semibold text-zinc-800">{evt.action}</span>
                            <p className="text-[10px] text-zinc-500">Actor: {evt.actor_id}</p>
                          </div>
                          <span className="text-[10px] text-zinc-400 shrink-0">{new Date(evt.created_at).toLocaleTimeString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Live Active Sessions Monitoring List */}
            <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-xs space-y-4">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold text-zinc-900">Active Consultation Rooms</h3>
                  <p className="text-xs text-zinc-500">Monitor live WebRTC peer connections across the platform.</p>
                </div>
                <button
                  type="button"
                  onClick={loadVideoSessions}
                  className="px-4 py-2 bg-[#1A7D67] text-white rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Refresh Live Sessions
                </button>
              </div>

              <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden">
                {videoLoading ? (
                  <div className="p-8 text-center text-zinc-400">Loading live video rooms…</div>
                ) : videoSessions.length === 0 ? (
                  <div className="p-8 text-center text-zinc-400">No active consultation rooms at present.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-[#F8FAF9] border-b border-zinc-200 text-xs font-semibold text-zinc-500 uppercase">
                        <tr>
                          <th className="px-6 py-3.5">Session ID</th>
                          <th className="px-6 py-3.5">Appointment</th>
                          <th className="px-6 py-3.5">Status</th>
                          <th className="px-6 py-3.5">Started At</th>
                          <th className="px-6 py-3.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {videoSessions.map((vs) => (
                          <tr key={vs.id} className="hover:bg-[#F9FBFA]">
                            <td className="px-6 py-4 font-mono text-xs font-bold text-[#1A7D67]">{vs.id}</td>
                            <td className="px-6 py-4 font-mono text-xs text-zinc-600">{vs.appointment_id || "—"}</td>
                            <td className="px-6 py-4">
                              <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full capitalize ${
                                vs.status === "active" ? "bg-green-100 text-green-800" : "bg-zinc-100 text-zinc-700"
                              }`}>
                                {vs.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-xs text-zinc-500">{vs.created_at ? new Date(vs.created_at).toLocaleTimeString() : "—"}</td>
                            <td className="px-6 py-4 text-right">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVideoQuery(vs.id);
                                    loadVideoDiagnostics();
                                  }}
                                  className="px-3 py-1 bg-blue-50 text-blue-700 text-xs font-semibold rounded-lg hover:bg-blue-100 cursor-pointer"
                                >
                                  Inspect Diagnostics
                                </button>
                                {vs.status === "active" && (
                                  <button
                                    type="button"
                                    onClick={() => handleEndVideoSession(vs.id)}
                                    className="px-3 py-1 bg-red-50 text-red-700 text-xs font-semibold rounded-lg hover:bg-red-100 cursor-pointer"
                                  >
                                    Force End
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* SCREEN 7: SUPPORT TICKET DESK                                             */}
        {/* ========================================================================= */}
        {activeTab === "tickets" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="flex gap-3 w-full sm:w-auto">
                <select
                  value={ticketStatus}
                  onChange={(e) => setTicketStatus(e.target.value)}
                  className="px-3 py-2 text-sm rounded-xl border border-zinc-300 outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="open">Open</option>
                  <option value="in_progress">In Progress</option>
                  <option value="resolved">Resolved</option>
                  <option value="closed">Closed</option>
                </select>
                <select
                  value={ticketPriority}
                  onChange={(e) => setTicketPriority(e.target.value)}
                  className="px-3 py-2 text-sm rounded-xl border border-zinc-300 outline-none"
                >
                  <option value="">All Priorities</option>
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateTicketModal(true)}
                className="px-4 py-2 bg-[#1A7D67] text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                + New Support Ticket
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Ticket List */}
              <div className="lg:col-span-1 bg-white rounded-2xl border border-zinc-200 shadow-xs overflow-hidden space-y-2 p-4 max-h-[600px] overflow-y-auto">
                {ticketsLoading ? (
                  <p className="text-xs text-zinc-400 py-6 text-center">Loading tickets…</p>
                ) : tickets.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-6 text-center">No tickets match criteria.</p>
                ) : (
                  tickets.map((t) => (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTicket(t)}
                      className={`p-4 rounded-xl border transition cursor-pointer ${
                        selectedTicket?.id === t.id
                          ? "border-[#1A7D67] bg-[#EEF6F3]/60 shadow-xs"
                          : "border-zinc-200 hover:border-[#1A7D67]/40 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-[#1A7D67]">{t.id}</span>
                        <div className="flex items-center gap-1.5">
                          {t.sla && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                              t.sla.status === "breached" ? "bg-red-100 text-red-700 border border-red-200" :
                              t.sla.status === "near_breach" ? "bg-amber-100 text-amber-800 border border-amber-200" :
                              t.sla.status === "met" ? "bg-green-100 text-green-800" : "bg-blue-50 text-blue-700"
                            }`}>
                              SLA: {t.sla.status.replace("_", " ")}
                            </span>
                          )}
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                            t.priority === "urgent" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                          }`}>
                            {t.priority}
                          </span>
                        </div>
                      </div>
                      <h4 className="font-bold text-sm text-zinc-900 mt-1.5">{t.subject}</h4>
                      <div className="flex items-center justify-between text-xs text-zinc-500 mt-2">
                        <span className="capitalize font-semibold text-zinc-700">{t.status?.replace("_", " ")}</span>
                        <span>{new Date(t.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Selected Ticket Detail & Internal Staff Notes */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-zinc-200 shadow-xs p-6 space-y-6">
                {!selectedTicket ? (
                  <div className="py-20 text-center text-zinc-400 flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-4xl">headset_mic</span>
                    <p className="text-sm font-medium">Select a support ticket to inspect details and add notes</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-4 border-b border-zinc-100">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-bold text-[#1A7D67]">{selectedTicket.id}</span>
                          <span className="text-xs bg-zinc-100 text-zinc-700 px-2.5 py-0.5 rounded-full font-semibold uppercase">{selectedTicket.category?.replace("_", " ")}</span>
                          <span className="text-xs bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full font-semibold uppercase">{selectedTicket.user_type || "patient"}</span>
                          {selectedTicket.sla && (
                            <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full uppercase ${
                              selectedTicket.sla.status === "breached" ? "bg-red-100 text-red-700 border border-red-200" :
                              selectedTicket.sla.status === "near_breach" ? "bg-amber-100 text-amber-800 border border-amber-200" :
                              selectedTicket.sla.status === "met" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"
                            }`}>
                              SLA ({selectedTicket.sla.hours_target}h): {selectedTicket.sla.status.replace("_", " ")}
                            </span>
                          )}
                          {selectedTicket.escalated_to && (
                            <span className="text-xs bg-red-100 text-red-800 px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <span className="material-symbols-outlined text-xs">warning</span>
                              Escalated to {selectedTicket.escalated_to}
                            </span>
                          )}
                        </div>
                        <h2 className="text-lg font-bold text-zinc-900">{selectedTicket.subject}</h2>
                        {selectedTicket.reporter_name && (
                          <p className="text-xs text-zinc-500 mt-0.5">
                            Reporter: <span className="font-semibold text-zinc-800">{selectedTicket.reporter_name}</span> ({selectedTicket.reporter_email})
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={selectedTicket.status}
                          onChange={(e) => handleUpdateTicket({ status: e.target.value })}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border border-zinc-300 outline-none"
                        >
                          <option value="open">Open</option>
                          <option value="in_progress">In Progress</option>
                          <option value="escalated">Escalated</option>
                          <option value="resolved">Resolved</option>
                          <option value="closed">Closed</option>
                        </select>
                        <select
                          value={selectedTicket.priority}
                          onChange={(e) => handleUpdateTicket({ priority: e.target.value })}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border border-zinc-300 outline-none"
                        >
                          <option value="low">Low Priority</option>
                          <option value="medium">Medium Priority</option>
                          <option value="high">High Priority</option>
                          <option value="urgent">Urgent</option>
                        </select>
                        <select
                          value={selectedTicket.escalated_to || ""}
                          onChange={(e) => handleUpdateTicket({ escalated_to: e.target.value })}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border border-amber-300 bg-amber-50 text-amber-900 outline-none"
                        >
                          <option value="">Escalate To…</option>
                          <option value="Engineering">Engineering Team</option>
                          <option value="Billing Operations">Billing Operations</option>
                          <option value="Clinical Lead">Clinical Lead</option>
                          <option value="System Admin">System Admin</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-1">Issue Description</h4>
                      <p className="text-sm text-zinc-700 bg-zinc-50 p-4 rounded-xl border border-zinc-100 whitespace-pre-wrap">{selectedTicket.description}</p>
                    </div>

                    {/* Support Notes Log */}
                    <div className="space-y-3 pt-2">
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Internal Support Staff Notes</h4>
                      {selectedTicket.notes?.length === 0 ? (
                        <p className="text-xs text-zinc-400 italic">No notes added yet.</p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {selectedTicket.notes.map((note) => (
                            <div key={note.id} className="p-3 bg-[#EEF6F3]/50 rounded-xl border border-[#1A7D67]/20 text-xs space-y-1">
                              <p className="text-zinc-800">{note.text}</p>
                              <p className="text-[10px] text-zinc-400 text-right">{new Date(note.created_at).toLocaleString()}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      <form onSubmit={handleAddNote} className="flex gap-2 pt-2">
                        <input
                          type="text"
                          value={newNoteText}
                          onChange={(e) => setNewNoteText(e.target.value)}
                          placeholder="Add internal note for support team…"
                          className="flex-1 px-3.5 py-2 text-xs rounded-xl border border-zinc-300 outline-none focus:border-[#1A7D67]"
                        />
                        <button
                          type="submit"
                          className="px-4 py-2 bg-[#1A7D67] text-white text-xs font-bold rounded-xl hover:bg-[#156654] cursor-pointer"
                        >
                          Add Note
                        </button>
                      </form>
                    </div>

                    {/* Support Audit History Timeline */}
                    <div className="space-y-3 pt-2 border-t border-zinc-100">
                      <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm text-[#1A7D67]">history</span>
                        Ticket Audit Trail &amp; History
                      </h4>
                      {!selectedTicket.history?.length ? (
                        <p className="text-xs text-zinc-400 italic">No history records logged yet.</p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {selectedTicket.history.map((h) => (
                            <div key={h.id} className="p-2.5 bg-zinc-50 rounded-lg border border-zinc-100 text-xs flex justify-between gap-3">
                              <div>
                                <span className="font-semibold text-zinc-800">{h.details}</span>
                                <p className="text-[10px] text-zinc-400">Actor: {h.actor_id}</p>
                              </div>
                              <span className="text-[10px] text-zinc-400 shrink-0">{new Date(h.created_at).toLocaleTimeString()}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Appointment Action Modal (Reschedule / Cancel) */}
      {actionModalAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-zinc-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-base font-bold text-zinc-900 capitalize">
                {actionType} Appointment #{actionModalAppointment.id}
              </h3>
              <button
                type="button"
                onClick={() => setActionModalAppointment(null)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleAppointmentAction} className="space-y-4">
              {actionType === "reschedule" && (
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">New Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-sm outline-none focus:border-[#1A7D67]"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Support Action Reason</label>
                <textarea
                  required
                  rows={3}
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Provide detailed support reason…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-sm outline-none focus:border-[#1A7D67]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setActionModalAppointment(null)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 border border-zinc-300 rounded-xl hover:bg-zinc-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2 text-xs font-semibold text-white rounded-xl cursor-pointer ${
                    actionType === "cancel" ? "bg-red-600 hover:bg-red-700" : "bg-[#1A7D67] hover:bg-[#156654]"
                  }`}
                >
                  Confirm {actionType}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Refund Modal */}
      {refundModalPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-zinc-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-base font-bold text-zinc-900">Issue Refund for Payment #{refundModalPayment.id}</h3>
              <button
                type="button"
                onClick={() => setRefundModalPayment(null)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleRefundSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Refund Reason</label>
                <textarea
                  required
                  rows={3}
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Specify refund authorization reason…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-sm outline-none focus:border-[#1A7D67]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setRefundModalPayment(null)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 border border-zinc-300 rounded-xl hover:bg-zinc-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-xl cursor-pointer"
                >
                  Confirm Refund
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Ticket Modal */}
      {showCreateTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-zinc-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1A7D67]">add_comment</span>
                New Platform Support Ticket
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateTicketModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Subject</label>
                <input
                  type="text"
                  required
                  value={newTicketForm.subject}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, subject: e.target.value })}
                  placeholder="Short ticket summary…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-sm outline-none focus:border-[#1A7D67]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Category</label>
                  <select
                    value={newTicketForm.category}
                    onChange={(e) => setNewTicketForm({ ...newTicketForm, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 text-sm outline-none"
                  >
                    <option value="general">General</option>
                    <option value="billing">Billing / Refund</option>
                    <option value="technical">Technical / WebRTC</option>
                    <option value="appointment">Appointment</option>
                    <option value="clinical">Clinical Notes</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Priority</label>
                  <select
                    value={newTicketForm.priority}
                    onChange={(e) => setNewTicketForm({ ...newTicketForm, priority: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 text-sm outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Detailed Description</label>
                <textarea
                  required
                  rows={4}
                  value={newTicketForm.description}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, description: e.target.value })}
                  placeholder="Describe the issue or support request in detail…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-sm outline-none focus:border-[#1A7D67]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowCreateTicketModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 border border-zinc-300 rounded-xl hover:bg-zinc-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#1A7D67] hover:bg-[#156654] rounded-xl cursor-pointer"
                >
                  Submit Ticket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SupportDashboardScreen(props) {
  return (
    <ToastProvider>
      <SupportDashboardContent {...props} />
    </ToastProvider>
  );
}
