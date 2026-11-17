import { useEffect, useState } from "react";
import { supportDashboardApi } from "../../lib/api";
import { ToastProvider, useToast } from "../common/Toast";

function safeFormatDate(value, mode = "datetime", fallback = "Date unavailable") {
  if (!value) return fallback;
  try {
    const dt = new Date(value);
    if (isNaN(dt.getTime())) return fallback;
    if (mode === "time") return dt.toLocaleTimeString();
    if (mode === "date") return dt.toLocaleDateString();
    return dt.toLocaleString();
  } catch (err) {
    return fallback;
  }
}

const ESCALATION_STATUS_TRANSITIONS = {
  PENDING: ["ACCEPTED", "IN_PROGRESS", "REASSIGNED", "RESOLVED", "REJECTED"],
  ACCEPTED: ["IN_PROGRESS", "REASSIGNED", "RESOLVED", "REJECTED"],
  IN_PROGRESS: ["REASSIGNED", "RESOLVED", "REJECTED"],
  REASSIGNED: ["ACCEPTED", "IN_PROGRESS", "RESOLVED", "REJECTED"],
  RESOLVED: ["CLOSED"],
  REJECTED: [],
  CLOSED: [],
};

function canTransitionEscalation(currentStatus, nextStatus) {
  return (ESCALATION_STATUS_TRANSITIONS[currentStatus] || []).includes(nextStatus);
}

function SupportDashboardContent({ user, onLogout }) {
  const { showToast } = useToast();
  const addToast = showToast;
  const [activeTab, setActiveTab] = useState("overview");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

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

  // Escalations State (PRD Section 10)
  const [escalations, setEscalations] = useState([]);
  const [escalationStatus, setEscalationStatus] = useState("");
  const [escalationTeam, setEscalationTeam] = useState("");
  const [escalationPriority, setEscalationPriority] = useState("");
  const [escalationsLoading, setEscalationsLoading] = useState(false);
  const [selectedEscalation, setSelectedEscalation] = useState(null);
  const [escalationNoteText, setEscalationNoteText] = useState("");
  const [escalationAction, setEscalationAction] = useState(null);
  const [escalationActionText, setEscalationActionText] = useState("");
  const [escalationActionError, setEscalationActionError] = useState("");
  const [escalationActionSubmitting, setEscalationActionSubmitting] = useState(false);

  // Create Escalation Modal State
  const [showCreateEscalationModal, setShowCreateEscalationModal] = useState(false);
  const [newEscalationForm, setNewEscalationForm] = useState({
    original_ticket_id: "",
    escalation_category: "application_defect",
    destination_team: "Engineering",
    priority: "high",
    reason: "",
    impact_description: "",
    expected_follow_up: "4 hours",
    incident_id: "",
  });

  // Audit History State (PRD Section 11)
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditStartDate, setAuditStartDate] = useState("");
  const [auditEndDate, setAuditEndDate] = useState("");
  const [auditActor, setAuditActor] = useState("");
  const [auditTicketId, setAuditTicketId] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState("");
  const [auditResourceFilter, setAuditResourceFilter] = useState("");
  const [auditResultFilter, setAuditResultFilter] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);

  // Tickets State
  const [tickets, setTickets] = useState([]);
  const [ticketStatus, setTicketStatus] = useState("");
  const [ticketPriority, setTicketPriority] = useState("");
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [newNoteText, setNewNoteText] = useState("");
  const [supportAgents, setSupportAgents] = useState([]);
  const [supportAgentsLoading, setSupportAgentsLoading] = useState(false);

  // Ticket Resolution Modal State
  const [ticketToResolve, setTicketToResolve] = useState(null);
  const [ticketResolutionSummary, setTicketResolutionSummary] = useState("");
  const [isResolvingTicket, setIsResolvingTicket] = useState(false);

  // Create Ticket Modal State
  const [showCreateTicketModal, setShowCreateTicketModal] = useState(false);
  const [newTicketForm, setNewTicketForm] = useState({
    subject: "",
    description: "",
    category: "general",
    priority: "medium",
    requester_type: "Patient",
    requester_search: "",
    requester_id: "",
    requester_name: "",
    requester_email: "",
    appointment_id: "",
  });
  const [requesterSearchResults, setRequesterSearchResults] = useState([]);
  const [isSearchingRequester, setIsSearchingRequester] = useState(false);

  const handleSearchRequesters = async (term) => {
    setNewTicketForm((prev) => ({ ...prev, requester_search: term }));
    if (!term || term.length < 2) {
      setRequesterSearchResults([]);
      return;
    }
    setIsSearchingRequester(true);
    try {
      if (newTicketForm.requester_type === "Doctor") {
        const res = await supportDashboardApi.doctors(term);
        const candidates = (res.items || []).map((d) => ({
          id: d.id,
          name: d.full_name || d.name,
          email: d.email || `${d.id}@kaizencare.in`,
          role: "DOCTOR",
        }));
        setRequesterSearchResults(candidates);
      } else {
        const res = await supportDashboardApi.patients(term);
        const candidates = (res.items || []).map((p) => ({
          id: p.id,
          name: p.full_name || p.name,
          email: p.email || `${p.id}@kaizencare.in`,
          role: "PATIENT",
        }));
        setRequesterSearchResults(candidates);
      }
    } catch (err) {
      setRequesterSearchResults([]);
    } finally {
      setIsSearchingRequester(false);
    }
  };

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

  const loadSupportAgents = async () => {
    setSupportAgentsLoading(true);
    try {
      const res = await supportDashboardApi.agents();
      setSupportAgents(res.items || []);
    } catch (err) {
      addToast(err.message || "Failed to load active support agents", "error");
    } finally {
      setSupportAgentsLoading(false);
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

  const loadEscalations = async ({ notifyOnError = true } = {}) => {
    setEscalationsLoading(true);
    try {
      const res = await supportDashboardApi.escalations(escalationStatus, escalationTeam, escalationPriority);
      setEscalations(res.items || []);
    } catch (err) {
      if (notifyOnError) addToast(err.message || "Failed to load escalations", "error");
    } finally {
      setEscalationsLoading(false);
    }
  };

  const handleCreateEscalation = async (e) => {
    e.preventDefault();
    if (!newEscalationForm.original_ticket_id || !newEscalationForm.reason || !newEscalationForm.impact_description) {
      addToast("Please fill in required fields", "warning");
      return;
    }
    try {
      await supportDashboardApi.createEscalation(newEscalationForm);
      addToast("Escalation record created successfully", "success");
      setShowCreateEscalationModal(false);
      setNewEscalationForm({ original_ticket_id: "", escalation_category: "application_defect", destination_team: "Engineering", priority: "high", reason: "", impact_description: "", expected_follow_up: "4 hours", incident_id: "" });
      loadEscalations();
    } catch (err) {
      addToast(err.message || "Failed to create escalation", "error");
    }
  };

  const handleUpdateEscalation = async (id, updates) => {
    try {
      const updated = await supportDashboardApi.updateEscalation(id, updates);
      setSelectedEscalation(updated);
      addToast("Escalation record updated", "success");
      await Promise.all([
        loadEscalations({ notifyOnError: false }),
        loadTickets({ notifyOnError: false }),
        loadOverview({ notifyOnError: false }),
        loadAuditHistory({ notifyOnError: false }),
      ]);
      if (selectedTicket && (selectedTicket.id === updated.original_ticket_id || selectedTicket.ticket_id === updated.original_ticket_id)) {
        const refreshedTicket = await supportDashboardApi.ticketDetails(selectedTicket.id || selectedTicket.ticket_id);
        setSelectedTicket(refreshedTicket);
      }
    } catch (err) {
      addToast(err.message || "Failed to update escalation", "error");
    }
  };

  const openEscalationAction = (type, escalation) => {
    setEscalationAction({ type, escalation });
    setEscalationActionText("");
    setEscalationActionError("");
  };

  const closeEscalationAction = () => {
    if (escalationActionSubmitting) return;
    setEscalationAction(null);
    setEscalationActionText("");
    setEscalationActionError("");
  };

  const handleEscalationActionSubmit = async (e) => {
    e.preventDefault();
    const value = escalationActionText.trim();
    if (!value) {
      setEscalationActionError(
        escalationAction?.type === "resolve"
          ? "Resolution summary is required."
          : "Rejection reason is required.",
      );
      return;
    }

    setEscalationActionSubmitting(true);
    setEscalationActionError("");
    try {
      const isResolution = escalationAction.type === "resolve";
      const updated = await supportDashboardApi.updateEscalation(
        escalationAction.escalation.id,
        isResolution
          ? { status: "RESOLVED", resolution_summary: value }
          : { status: "REJECTED", rejection_reason: value },
      );
      setSelectedEscalation(updated);
      addToast(isResolution ? "Escalation resolved successfully" : "Escalation rejected", "success");
      setEscalationAction(null);
      setEscalationActionText("");
      void loadEscalations({ notifyOnError: false });
    } catch (err) {
      setEscalationActionError(err.message || "Unable to update this escalation.");
    } finally {
      setEscalationActionSubmitting(false);
    }
  };

  const loadAuditHistory = async ({ notifyOnError = true } = {}) => {
    setAuditLoading(true);
    try {
      const res = await supportDashboardApi.auditHistory(
        auditStartDate,
        auditEndDate,
        auditActor,
        auditTicketId,
        auditActionFilter,
        auditResourceFilter,
        auditResultFilter
      );
      setAuditLogs(res.items || []);
    } catch (err) {
      if (notifyOnError) addToast(err.message || "Failed to load support audit history", "error");
    } finally {
      setAuditLoading(false);
    }
  };

  const handleExportAudit = async () => {
    try {
      const res = await supportDashboardApi.auditExport(
        auditStartDate,
        auditEndDate,
        auditActor,
        auditTicketId,
        auditActionFilter,
        auditResourceFilter,
        auditResultFilter
      );
      const blob = new Blob([res.csv_data], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", res.filename || "support_audit_export.csv");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      addToast("Support audit log exported successfully", "success");
    } catch (err) {
      addToast(err.message || "Failed to export audit log", "error");
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
    else if (activeTab === "escalations") loadEscalations();
    else if (activeTab === "audit_history") loadAuditHistory();
    else if (activeTab === "tickets") {
      loadTickets();
      loadSupportAgents();
    }
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

  // Confirm Ticket Resolution Modal Submit
  const handleConfirmTicketResolution = async (e) => {
    e.preventDefault();
    const summary = ticketResolutionSummary.trim();
    if (!summary) {
      addToast("A resolution summary is required to resolve this ticket", "warning");
      return;
    }
    if (!ticketToResolve) return;

    setIsResolvingTicket(true);
    try {
      const targetId = ticketToResolve.id || ticketToResolve.ticket_id;
      const updated = await supportDashboardApi.updateTicket(targetId, {
        status: "RESOLVED",
        note: summary,
      });
      setSelectedTicket(updated);
      setTicketToResolve(null);
      setTicketResolutionSummary("");
      addToast("Support ticket resolved successfully.", "success");
      await Promise.all([
        loadTickets({ notifyOnError: false }),
        loadOverview({ notifyOnError: false }),
        loadAuditHistory({ notifyOnError: false }),
      ]);
    } catch (err) {
      addToast(err.message || "Failed to resolve support ticket", "error");
    } finally {
      setIsResolvingTicket(false);
    }
  };

  // Create Ticket Submit
  const handleCreateTicket = async (e) => {
    e.preventDefault();
    if (!newTicketForm.subject.trim()) {
      addToast("Ticket Subject is required", "warning");
      return;
    }
    if (!newTicketForm.description.trim()) {
      addToast("Ticket Description is required", "warning");
      return;
    }
    if (!newTicketForm.requester_id && !newTicketForm.requester_search.trim()) {
      addToast("Please search and select a Requester or enter Requester details", "warning");
      return;
    }

    try {
      const reqRole = newTicketForm.requester_type.toUpperCase().replace(" ", "_");
      const createdTicket = await supportDashboardApi.createTicket({
        subject: newTicketForm.subject.trim(),
        description: newTicketForm.description.trim(),
        category: newTicketForm.category,
        priority: newTicketForm.priority,
        user_type: newTicketForm.requester_type.toLowerCase().replace(" ", "_"),
        requester_role: reqRole,
        requester_id: newTicketForm.requester_id || user?.user_id,
        requester_name: newTicketForm.requester_name || newTicketForm.requester_search,
        requester_email: newTicketForm.requester_email,
        patient_id: reqRole === "PATIENT" ? newTicketForm.requester_id : null,
        doctor_id: reqRole === "DOCTOR" ? newTicketForm.requester_id : null,
        appointment_id: newTicketForm.appointment_id.trim() || null,
        related_record_id: newTicketForm.appointment_id.trim() || null,
        reporter_name: newTicketForm.requester_name || newTicketForm.requester_search,
        reporter_email: newTicketForm.requester_email,
      });

      if (!createdTicket?.persistence_confirmed) {
        throw new Error("The backend did not confirm that the support ticket was saved.");
      }

      addToast(`Support ticket #${createdTicket.id || createdTicket.ticket_id || ""} created successfully`, "success");
      setShowCreateTicketModal(false);
      setNewTicketForm({
        subject: "",
        description: "",
        category: "general",
        priority: "medium",
        requester_type: "Patient",
        requester_search: "",
        requester_id: "",
        requester_name: "",
        requester_email: "",
        appointment_id: "",
      });
      setRequesterSearchResults([]);

      // Synchronize all backend data views: Overview KPIs, Tickets queue, and Audit Trail
      await Promise.all([
        loadOverview(),
        loadTickets(),
        loadAuditHistory(),
      ]);

      if (createdTicket && createdTicket.id) {
        setSelectedTicket(createdTicket);
      }
    } catch (err) {
      addToast(err.message || "Failed to create ticket", "error");
    }
  };

  // Update Ticket Status/Note
  const handleUpdateTicket = async (updates) => {
    try {
      const updated = await supportDashboardApi.updateTicket(selectedTicket.id, updates);
      setSelectedTicket(updated);
      addToast(Object.hasOwn(updates, "assigned_to") ? "Ticket assignment updated" : "Ticket updated", "success");
      await Promise.all([loadTickets(), loadOverview(), loadAuditHistory()]);
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
      loadOverview();
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
    { id: "escalations", label: "Inter-Team Escalations", icon: "published_with_changes" },
    { id: "audit_history", label: "Support Audit History", icon: "policy" },
    { id: "tickets", label: "Support Desk", icon: "headset_mic" },
  ];

  return (
    <div className="min-h-screen bg-[#F0F5F7] text-[#172B2B] font-sans flex flex-col lg:flex-row">
      {/* Mobile Top Navigation Header */}
      <div className="lg:hidden sticky top-0 z-40 bg-[#123D35] text-white px-4 py-3 flex items-center justify-between border-b border-[#176354]">
        <div className="flex items-center gap-2.5">
          <div className="size-8 rounded-lg bg-[#20C7A7] text-[#123D35] flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-lg">support_agent</span>
          </div>
          <span className="font-bold text-sm tracking-tight">Kaizen Support</span>
        </div>
        <button
          type="button"
          onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          className="p-2 rounded-lg text-white hover:bg-[#176354] cursor-pointer"
        >
          <span className="material-symbols-outlined text-xl">{isMobileSidebarOpen ? "close" : "menu"}</span>
        </button>
      </div>

      {/* Fixed Responsive Left Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-30 h-screen w-64 lg:w-68 bg-[#123D35] text-white flex flex-col border-r border-[#176354]/40 shadow-xl transition-transform duration-200 shrink-0 ${
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        }`}
      >
        {/* Brand Header */}
        <div className="p-5 border-b border-[#176354]/40 flex items-center gap-3">
          <div className="size-10 rounded-xl bg-[#20C7A7] text-[#123D35] flex items-center justify-center font-bold shadow-xs shrink-0">
            <span className="material-symbols-outlined text-2xl">support_agent</span>
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight tracking-tight text-white flex items-center gap-1">
              Kaizen Care
            </h1>
            <span className="text-[10px] font-bold text-[#20C7A7] uppercase tracking-wider block">
              Support Portal
            </span>
          </div>
        </div>

        {/* Sidebar Nav Items (14px font, 20px icons, no truncation) */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          <p className="px-3.5 text-[10px] font-bold uppercase tracking-wider text-[#20C7A7]/70 mb-2">
            Operations Desk
          </p>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  setIsMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[14px] leading-snug font-medium transition text-left cursor-pointer ${
                  isActive
                    ? "bg-[#20C7A7] text-[#123D35] font-bold shadow-xs"
                    : "text-white/80 hover:text-white hover:bg-[#176354]/50"
                }`}
              >
                <span className={`material-symbols-outlined text-[20px] shrink-0 ${isActive ? "text-[#123D35]" : "text-[#20C7A7]"}`}>
                  {tab.icon}
                </span>
                <span className="break-words whitespace-normal leading-tight font-medium">{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer User Info & Ticket Button */}
        <div className="p-4 border-t border-[#176354]/40 bg-[#0e3029] space-y-3">
          <button
            type="button"
            onClick={() => setShowCreateTicketModal(true)}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 bg-[#20C7A7] text-[#123D35] rounded-xl text-xs font-bold hover:bg-white transition cursor-pointer shadow-xs"
          >
            <span className="material-symbols-outlined text-base">add_comment</span>
            <span>+ Create Ticket</span>
          </button>

          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="size-8 rounded-full bg-[#176354] text-[#20C7A7] font-bold flex items-center justify-center text-xs shrink-0">
                {user?.full_name?.charAt(0) || "S"}
              </div>
              <div className="min-w-0 text-left">
                <p className="text-xs font-semibold text-white truncate">{user?.full_name || "Support Agent"}</p>
                <p className="text-[10px] text-[#577877] truncate">{user?.email}</p>
              </div>
            </div>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                title="Sign out"
                className="p-1.5 rounded-lg text-[#577877] hover:text-white hover:bg-[#176354] transition cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-lg">logout</span>
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Screen Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Desktop Sticky Header */}
        <header className="hidden lg:flex sticky top-0 z-20 bg-white border-b border-[#577877]/15 px-8 py-4 items-center justify-between shadow-xs">
          <div>
            <h2 className="text-xl font-bold text-[#172B2B]">
              {tabs.find((t) => t.id === activeTab)?.label || "Dashboard"}
            </h2>
            <p className="text-xs text-[#577877] mt-0.5">Platform Support Operations &amp; Diagnostics</p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#E8F3F3] text-[#176354] border border-[#176354]/20">
              Agent Portal Active
            </span>
          </div>
        </header>

        {/* Content Body Container */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 space-y-6 max-w-full">
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
                        <span className="text-[10px] text-zinc-400 shrink-0">{safeFormatDate(log.created_at, "time")}</span>
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
                        {safeFormatDate(accountDiagData.last_successful_login, "datetime", "Never / No record")}
                      </p>
                    </div>

                    <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                      <p className="text-xs text-zinc-500 font-medium">Email Verification Date</p>
                      <p className="text-sm font-bold text-zinc-800 mt-1">
                        {safeFormatDate(accountDiagData.verified_at, "date", "Unverified")}
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
                          <td className="px-6 py-4 text-xs text-zinc-500">{safeFormatDate(p.created_at, "date")}</td>
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
                      <p className="font-bold text-zinc-900 text-sm">{safeFormatDate(bookingDiagData.starts_at)}</p>
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
                            {safeFormatDate(slot.starts_at)}
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
                          <td className="px-6 py-4 text-xs text-zinc-600">{safeFormatDate(apt.starts_at)}</td>
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
                      {safeFormatDate(videoDiagData.disconnect_time, "time", "N/A (Active/Connected)")}
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
                          <span className="text-[10px] text-zinc-400 shrink-0">{safeFormatDate(evt.created_at, "time")}</span>
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
                            <td className="px-6 py-4 text-xs text-zinc-500">{safeFormatDate(vs.created_at, "time")}</td>
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
        {/* SCREEN 6: INTER-TEAM ESCALATIONS MANAGEMENT (PRD SECTION 10)            */}
        {/* ========================================================================= */}
        {activeTab === "escalations" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header & Filter Controls */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="flex flex-wrap gap-3 w-full sm:w-auto">
                <select
                  value={escalationStatus}
                  onChange={(e) => { setEscalationStatus(e.target.value); loadEscalations(); }}
                  className="px-3 py-2 text-sm rounded-xl border border-zinc-300 outline-none"
                >
                  <option value="">All Escalation Statuses</option>
                  <option value="PENDING">Pending Acceptance</option>
                  <option value="ACCEPTED">Accepted</option>
                  <option value="IN_PROGRESS">In Progress</option>
                  <option value="REASSIGNED">Reassigned</option>
                  <option value="RESOLVED">Resolved</option>
                  <option value="CLOSED">Closed</option>
                  <option value="REJECTED">Rejected</option>
                </select>

                <select
                  value={escalationTeam}
                  onChange={(e) => { setEscalationTeam(e.target.value); loadEscalations(); }}
                  className="px-3 py-2 text-sm rounded-xl border border-zinc-300 outline-none"
                >
                  <option value="">All Specialist Teams</option>
                  <option value="Security & Operations">Security &amp; Operations</option>
                  <option value="Technical Operations">Technical Operations</option>
                  <option value="Authorized Finance">Authorized Finance</option>
                  <option value="Clinic Administrator">Clinic Administrator</option>
                  <option value="Operations">Operations</option>
                  <option value="Security / Privacy Officer">Security / Privacy Officer</option>
                  <option value="Engineering">Engineering</option>
                </select>

                <select
                  value={escalationPriority}
                  onChange={(e) => { setEscalationPriority(e.target.value); loadEscalations(); }}
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
                onClick={() => setShowCreateEscalationModal(true)}
                className="px-4 py-2 bg-purple-700 text-white rounded-xl text-xs font-semibold hover:bg-purple-800 transition cursor-pointer shrink-0"
              >
                + New Inter-Team Escalation
              </button>
            </div>

            {/* Escalation Table & Details Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Escalation Queue List */}
              <div className="lg:col-span-1 bg-white rounded-2xl border border-zinc-200 shadow-xs p-4 space-y-2 max-h-[600px] overflow-y-auto">
                {escalationsLoading ? (
                  <p className="text-xs text-zinc-400 py-6 text-center">Loading escalations…</p>
                ) : escalations.length === 0 ? (
                  <p className="text-xs text-zinc-400 py-6 text-center">No escalation records found.</p>
                ) : (
                  escalations.map((esc) => (
                    <div
                      key={esc.id}
                      onClick={() => setSelectedEscalation(esc)}
                      className={`p-4 rounded-xl border transition cursor-pointer ${
                        selectedEscalation?.id === esc.id
                          ? "border-purple-600 bg-purple-50/60 shadow-xs"
                          : "border-zinc-200 hover:border-purple-300 bg-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs font-bold text-purple-700">{esc.id}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          esc.status === "PENDING" ? "bg-amber-100 text-amber-800" :
                          esc.status === "RESOLVED" ? "bg-green-100 text-green-800" :
                          esc.status === "REJECTED" ? "bg-red-100 text-red-800" : "bg-blue-100 text-blue-800"
                        }`}>
                          {esc.status}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-zinc-900 mt-1">{esc.ticket_subject || `Ref Ticket #${esc.original_ticket_id}`}</h4>
                      <div className="flex items-center justify-between text-xs text-zinc-500 mt-2">
                        <span className="font-semibold text-zinc-700">{esc.destination_team}</span>
                        <span className="font-mono text-[11px] text-zinc-400">{esc.original_ticket_id}</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-zinc-500 mt-2 pt-2 border-t border-zinc-100">
                        <span className="font-bold uppercase">Priority: {esc.priority || "high"}</span>
                        <span>{safeFormatDate(esc.escalation_timestamp || esc.created_at, "datetime")}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Selected Escalation Details & Action Panel */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-zinc-200 shadow-xs p-6 space-y-6">
                {!selectedEscalation ? (
                  <div className="py-20 text-center text-zinc-400 flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-4xl text-purple-300">published_with_changes</span>
                    <p className="text-sm font-medium">Select an escalation record to review details, update status, and manage team ownership</p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-4 border-b border-zinc-100">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-bold text-purple-700">{selectedEscalation.id}</span>
                          <span className="text-xs bg-purple-100 text-purple-900 px-2.5 py-0.5 rounded-full font-bold uppercase">{selectedEscalation.destination_team}</span>
                          <span className="text-xs bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-full font-semibold uppercase">{selectedEscalation.escalation_category?.replace("_", " ")}</span>
                          {selectedEscalation.incident_id && (
                            <span className="text-xs bg-red-100 text-red-800 px-2.5 py-0.5 rounded-full font-mono font-bold">
                              Inc: {selectedEscalation.incident_id}
                            </span>
                          )}
                        </div>
                        <h2 className="text-lg font-bold text-zinc-900">Original Ticket: {selectedEscalation.original_ticket_id}</h2>
                        <p className="text-xs text-zinc-500 mt-0.5">SLA Target Follow-up: <span className="font-semibold text-zinc-800">{selectedEscalation.expected_follow_up || "4 hours"}</span></p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={selectedEscalation.status}
                          onChange={(e) => handleUpdateEscalation(selectedEscalation.id, { status: e.target.value })}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border border-purple-300 bg-purple-50 text-purple-900 outline-none"
                        >
                          {["PENDING", "ACCEPTED", "IN_PROGRESS", "REASSIGNED", "RESOLVED", "CLOSED", "REJECTED"].map((status) => (
                            <option
                              key={status}
                              value={status}
                              disabled={
                                status !== selectedEscalation.status
                                && (
                                  !canTransitionEscalation(selectedEscalation.status, status)
                                  || status === "RESOLVED"
                                  || status === "REJECTED"
                                )
                              }
                            >
                              {status}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Escalation Details Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                      <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 space-y-1">
                        <p className="text-zinc-500 font-medium">Escalation Reason</p>
                        <p className="font-semibold text-zinc-800">{selectedEscalation.reason}</p>
                      </div>

                      <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 space-y-1">
                        <p className="text-zinc-500 font-medium">Impact Description</p>
                        <p className="font-semibold text-zinc-800">{selectedEscalation.impact_description}</p>
                      </div>
                    </div>

                    {/* Action Toolbar for Destination Team / Lead */}
                    {selectedEscalation.status !== "RESOLVED" && (
                    <div className="space-y-3 pt-2 border-t border-zinc-100">
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Escalation Management Actions</h4>
                      <div className="flex flex-wrap gap-2.5">
                        {selectedEscalation.status === "PENDING" && (
                          <button
                            type="button"
                            onClick={() => handleUpdateEscalation(selectedEscalation.id, { status: "ACCEPTED", assigned_owner: user?.full_name || user?.user_id })}
                            className="px-3.5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 cursor-pointer"
                          >
                            Accept Escalation
                          </button>
                        )}
                        {canTransitionEscalation(selectedEscalation.status, "RESOLVED") && (
                          <button
                            type="button"
                            onClick={() => openEscalationAction("resolve", selectedEscalation)}
                            className="px-3.5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 cursor-pointer"
                          >
                            Mark Escalation Resolved
                          </button>
                        )}
                        {canTransitionEscalation(selectedEscalation.status, "REJECTED") && (
                          <button
                            type="button"
                            onClick={() => openEscalationAction("reject", selectedEscalation)}
                            className="px-3.5 py-2 bg-red-50 text-red-700 text-xs font-semibold rounded-xl hover:bg-red-100 border border-red-200 cursor-pointer"
                          >
                            Reject Escalation
                          </button>
                        )}
                      </div>
                    </div>
                    )}

                    {/* Audit History Log */}
                    <div className="space-y-3 pt-2 border-t border-zinc-100">
                      <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Escalation Audit Timeline</h4>
                      {!selectedEscalation.history?.length ? (
                        <p className="text-xs text-zinc-400 italic">No timeline history recorded.</p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {selectedEscalation.history.map((h) => (
                            <div key={h.id} className="p-2.5 bg-zinc-50 rounded-lg border border-zinc-100 text-xs flex justify-between gap-3">
                              <div>
                                <span className="font-semibold text-zinc-800">{h.details}</span>
                                <p className="text-[10px] text-zinc-500">Actor: {h.actor_id}</p>
                              </div>
                              <span className="text-[10px] text-zinc-400 shrink-0">{safeFormatDate(h.created_at, "time")}</span>
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

        {/* ========================================================================= */}
        {/* SCREEN 7: SUPPORT AUDIT HISTORY & EXPORT (PRD SECTION 11)                 */}
        {/* ========================================================================= */}
        {activeTab === "audit_history" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header & Filter Controls (PRD Section 11.2) */}
            <div className="bg-white p-4 rounded-2xl border border-zinc-200 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-zinc-100">
                <div>
                  <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#1A7D67]">policy</span>
                    Support Audit Trail &amp; Event Logs
                  </h3>
                  <p className="text-xs text-zinc-500">Immutable, append-only history of support actions and privileged investigations.</p>
                </div>

                <button
                  type="button"
                  onClick={handleExportAudit}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#1A7D67] text-white text-xs font-semibold rounded-xl hover:bg-[#156654] transition cursor-pointer shrink-0"
                >
                  <span className="material-symbols-outlined text-base">download</span>
                  <span>Export Audit CSV</span>
                </button>
              </div>

              {/* Filters Toolbar */}
              <div className="flex flex-wrap gap-2.5">
                <input
                  type="date"
                  value={auditStartDate}
                  onChange={(e) => setAuditStartDate(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-xl border border-zinc-300 outline-none"
                  title="Start Date"
                />
                <input
                  type="date"
                  value={auditEndDate}
                  onChange={(e) => setAuditEndDate(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-xl border border-zinc-300 outline-none"
                  title="End Date"
                />
                <input
                  type="text"
                  value={auditActor}
                  onChange={(e) => setAuditActor(e.target.value)}
                  placeholder="Agent / Actor ID…"
                  className="px-3 py-1.5 text-xs rounded-xl border border-zinc-300 outline-none w-36"
                />
                <input
                  type="text"
                  value={auditTicketId}
                  onChange={(e) => setAuditTicketId(e.target.value)}
                  placeholder="Ticket ID…"
                  className="px-3 py-1.5 text-xs rounded-xl border border-zinc-300 outline-none w-32 font-mono"
                />
                <select
                  value={auditResourceFilter}
                  onChange={(e) => setAuditResourceFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-xl border border-zinc-300 outline-none"
                >
                  <option value="">All Resources</option>
                  <option value="ticket">Ticket</option>
                  <option value="account">Account</option>
                  <option value="booking">Booking</option>
                  <option value="payment">Payment</option>
                  <option value="video">Video Session</option>
                  <option value="escalation">Escalation</option>
                  <option value="general">General</option>
                </select>
                <select
                  value={auditResultFilter}
                  onChange={(e) => setAuditResultFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-xl border border-zinc-300 outline-none"
                >
                  <option value="">All Results</option>
                  <option value="Success">Success</option>
                  <option value="Denied">Denied</option>
                  <option value="Failed">Failed</option>
                </select>
                <button
                  type="button"
                  onClick={loadAuditHistory}
                  className="px-3.5 py-1.5 bg-[#1A7D67] text-white text-xs font-semibold rounded-xl hover:bg-[#156654] cursor-pointer"
                >
                  Apply Filters
                </button>
              </div>
            </div>

            {/* Audit Table */}
            <div className="bg-white rounded-2xl border border-zinc-200 shadow-xs overflow-hidden">
              {auditLoading ? (
                <div className="p-12 text-center text-zinc-400">Loading audit history logs…</div>
              ) : auditLogs.length === 0 ? (
                <div className="p-12 text-center text-zinc-400">No audit events match specified criteria.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-[#F8FAF9] border-b border-zinc-200 text-xs font-semibold text-zinc-500 uppercase">
                      <tr>
                        <th className="px-6 py-3.5">Event ID</th>
                        <th className="px-6 py-3.5">Timestamp (UTC)</th>
                        <th className="px-6 py-3.5">Agent / Actor</th>
                        <th className="px-6 py-3.5">Action</th>
                        <th className="px-6 py-3.5">Ticket ID</th>
                        <th className="px-6 py-3.5">Resource</th>
                        <th className="px-6 py-3.5">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 text-xs">
                      {auditLogs.map((log) => (
                        <tr key={log.event_id} className="hover:bg-[#F9FBFA]">
                          <td className="px-6 py-4 font-mono font-bold text-[#1A7D67]">{log.event_id?.slice(0, 18)}</td>
                          <td className="px-6 py-4 text-zinc-600">{safeFormatDate(log.timestamp || log.created_at, "datetime", "Date unavailable")}</td>
                          <td className="px-6 py-4 font-medium text-zinc-800">{log.agent?.name || log.agent?.id}</td>
                          <td className="px-6 py-4 font-semibold text-zinc-900">{log.action}</td>
                          <td className="px-6 py-4 font-mono text-zinc-600">{log.ticket_id}</td>
                          <td className="px-6 py-4">
                            <span className="bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-md font-semibold uppercase text-[10px]">
                              {log.resource}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`font-bold px-2 py-0.5 rounded-full text-[10px] uppercase ${
                              log.result === "Success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                            }`}>
                              {log.result}
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
                        <span>{safeFormatDate(t.created_at, "date")}</span>
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
                            <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                              selectedTicket.escalation_resolved || selectedTicket.escalation_status === "RESOLVED" || ["resolved", "closed"].includes(selectedTicket.status?.toLowerCase())
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : "bg-amber-100 text-amber-800 border border-amber-300"
                            }`}>
                              <span className="material-symbols-outlined text-xs">
                                {selectedTicket.escalation_resolved || selectedTicket.escalation_status === "RESOLVED" || ["resolved", "closed"].includes(selectedTicket.status?.toLowerCase()) ? "check_circle" : "warning"}
                              </span>
                              {selectedTicket.escalation_resolved || selectedTicket.escalation_status === "RESOLVED"
                                ? `${selectedTicket.escalation_resolved_team || selectedTicket.escalated_to} Escalation Resolved`
                                : `Escalated to ${selectedTicket.escalated_to}`}
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
                        <label className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#1A7D67]/30 bg-[#EEF6F3] text-xs font-bold text-[#155f50]">
                          <span>Assigned To</span>
                          <select
                            aria-label="Assigned To"
                            value={selectedTicket.assigned_to || ""}
                            disabled={supportAgentsLoading}
                            onChange={(e) => handleUpdateTicket({ assigned_to: e.target.value })}
                            className="bg-transparent outline-none font-semibold text-zinc-800 disabled:opacity-60"
                          >
                            <option value="">Unassigned</option>
                            {selectedTicket.assigned_to && !supportAgents.some((agent) => agent.id === selectedTicket.assigned_to) && (
                              <option value={selectedTicket.assigned_to} disabled>
                                {selectedTicket.assigned_to_name || "Inactive support agent"}
                              </option>
                            )}
                            {supportAgents.map((agent) => (
                              <option key={agent.id} value={agent.id}>
                                {agent.full_name}{agent.email ? ` (${agent.email})` : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <select
                          value={selectedTicket.status?.toLowerCase() || "open"}
                          onChange={(e) => {
                            const newSt = e.target.value;
                            if (["resolved", "closed"].includes(newSt.toLowerCase())) {
                              setTicketToResolve(selectedTicket);
                              setTicketResolutionSummary("");
                            } else {
                              handleUpdateTicket({ status: newSt });
                            }
                          }}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border border-zinc-300 outline-none uppercase"
                        >
                          <option value="new">NEW</option>
                          <option value="open">OPEN</option>
                          <option value="in_progress">IN_PROGRESS</option>
                          <option value="waiting_for_user">WAITING_FOR_USER</option>
                          <option value="escalated">ESCALATED</option>
                          <option value="resolved">RESOLVED</option>
                          <option value="closed">CLOSED</option>
                          <option value="reopened">REOPENED</option>
                        </select>
                        <select
                          value={selectedTicket.priority?.toLowerCase() || "medium"}
                          onChange={(e) => handleUpdateTicket({ priority: e.target.value })}
                          className="px-3 py-1.5 text-xs font-bold rounded-lg border border-zinc-300 outline-none uppercase"
                        >
                          <option value="low">LOW</option>
                          <option value="medium">MEDIUM</option>
                          <option value="high">HIGH</option>
                          <option value="urgent">CRITICAL / URGENT</option>
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

                    {/* Attachments Section (PRD Section 12.2) */}
                    <div className="space-y-2 pt-1 border-t border-zinc-100">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-sm">attach_file</span>
                          Secure Attachments (PDF, Images, Logs ≤10MB)
                        </h4>
                        <label className="px-3 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-semibold rounded-lg transition cursor-pointer">
                          <span>+ Upload Attachment</span>
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.txt,.log,.csv,.json"
                            className="hidden"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              try {
                                const att = await supportDashboardApi.uploadAttachment(selectedTicket.id, file);
                                setSelectedTicket((prev) => ({
                                  ...prev,
                                  attachments: [...(prev.attachments || []), att],
                                }));
                                addToast(`Attachment '${file.name}' uploaded successfully`, "success");
                              } catch (err) {
                                addToast(err.message || "Failed to upload attachment", "error");
                              }
                            }}
                          />
                        </label>
                      </div>

                      {!selectedTicket.attachments?.length ? (
                        <p className="text-xs text-zinc-400 italic">No file attachments associated with this ticket.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {selectedTicket.attachments.map((att) => (
                            <a
                              key={att.id}
                              href={`${import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}/api/v1/support-dashboard/tickets/${selectedTicket.id}/attachments/${att.id}`}
                              target="_blank"
                              rel="noreferrer"
                              className="px-3 py-1.5 bg-[#EEF6F3] text-[#1A7D67] rounded-xl border border-[#1A7D67]/20 text-xs font-semibold hover:underline flex items-center gap-1.5"
                            >
                              <span className="material-symbols-outlined text-sm">description</span>
                              <span>{att.filename}</span>
                              <span className="text-[10px] text-zinc-500 font-normal">({(att.size / 1024).toFixed(1)} KB)</span>
                            </a>
                          ))}
                        </div>
                      )}
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
                              <p className="text-[10px] text-zinc-400 text-right">{safeFormatDate(note.created_at)}</p>
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
                                <p className="text-[10px] text-zinc-400 font-medium">By: {h.actor_name || h.actor_id}</p>
                              </div>
                              <span className="text-[10px] text-zinc-400 shrink-0">{safeFormatDate(h.created_at, "time")}</span>
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
      </div>

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

      {/* Resolve Support Ticket Modal (Custom Centered React Popup) */}
      {ticketToResolve && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-200"
          onKeyDown={(e) => e.key === "Escape" && !isResolvingTicket && setTicketToResolve(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="resolve-ticket-modal-title"
            className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl border border-zinc-200 animate-in zoom-in-95 duration-200"
          >
            {/* Dark Emerald Header */}
            <div className="bg-[#123D35] text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-xl bg-[#20C7A7] text-[#123D35] flex items-center justify-center font-bold shadow-xs">
                  <span className="material-symbols-outlined text-2xl">check_circle</span>
                </div>
                <div>
                  <h3 id="resolve-ticket-modal-title" className="text-base font-bold text-white leading-tight">
                    Resolve Support Ticket
                  </h3>
                  <p className="text-xs text-[#20C7A7] mt-0.5">Provide a resolution summary before closing this ticket.</p>
                </div>
              </div>
              <button
                type="button"
                disabled={isResolvingTicket}
                onClick={() => setTicketToResolve(null)}
                aria-label="Close modal"
                className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleConfirmTicketResolution} className="p-5 sm:p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Ticket ID</p>
                  <p className="font-mono font-bold text-[#176354] text-sm">{ticketToResolve.id || ticketToResolve.ticket_id}</p>
                </div>
                <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Category</p>
                  <p className="font-bold text-zinc-800 capitalize">{ticketToResolve.category?.replace("_", " ") || "General"}</p>
                </div>
              </div>

              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200 space-y-0.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Ticket Title</p>
                <p className="font-bold text-zinc-900 text-sm truncate">{ticketToResolve.subject || "No Subject"}</p>
              </div>

              <div>
                <label htmlFor="resolve-ticket-summary" className="block text-xs font-bold text-zinc-700 mb-1.5">
                  Resolution Summary <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="resolve-ticket-summary"
                  required
                  rows={4}
                  autoFocus
                  disabled={isResolvingTicket}
                  value={ticketResolutionSummary}
                  onChange={(e) => setTicketResolutionSummary(e.target.value)}
                  placeholder="Describe how the issue was resolved..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-xs text-zinc-800 outline-none focus:border-[#176354] focus:ring-2 focus:ring-[#176354]/10 transition disabled:opacity-60"
                />
              </div>

              {/* Footer Actions */}
              <div className="flex justify-end gap-3 pt-3 border-t border-zinc-100">
                <button
                  type="button"
                  disabled={isResolvingTicket}
                  onClick={() => setTicketToResolve(null)}
                  className="px-4 py-2.5 text-xs font-semibold text-zinc-700 border border-zinc-300 rounded-xl hover:bg-zinc-50 transition cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isResolvingTicket || !ticketResolutionSummary.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-white bg-[#176354] hover:bg-[#123D35] rounded-xl transition cursor-pointer disabled:opacity-50 shadow-sm"
                >
                  {isResolvingTicket ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                      <span>Resolving Ticket…</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">check</span>
                      <span>Confirm Resolution</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Improved Create Support Ticket Modal */}
      {showCreateTicketModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-zinc-200 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <div>
                <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#176354]">add_comment</span>
                  Create Platform Support Ticket
                </h3>
                <p className="text-[11px] text-[#577877] mt-0.5">
                  Log a support ticket on behalf of a Patient, Doctor, or Clinic Admin.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateTicketModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateTicket} className="space-y-4 text-xs">
              {/* Logged-In Agent Badge */}
              <div className="p-3 rounded-xl bg-[#E8F3F3] border border-[#176354]/20 flex items-center justify-between">
                <span className="font-semibold text-[#176354] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">support_agent</span>
                  Created By Agent: <strong className="text-[#123D35]">{user?.full_name || user?.user_id || "Support Agent"}</strong>
                </span>
                <span className="text-[10px] uppercase font-bold text-[#176354] bg-white px-2 py-0.5 rounded">
                  Agent ID Saved
                </span>
              </div>

              {/* Requester Type Selection */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1.5">
                  Requester Type <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {["Patient", "Doctor", "Clinic Admin", "Other"].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setNewTicketForm({
                          ...newTicketForm,
                          requester_type: type,
                          requester_id: "",
                          requester_name: "",
                          requester_email: "",
                          requester_search: "",
                        });
                        setRequesterSearchResults([]);
                      }}
                      className={`py-2 px-1 rounded-xl text-center font-bold text-xs border transition cursor-pointer ${
                        newTicketForm.requester_type === type
                          ? "bg-[#176354] text-white border-[#176354]"
                          : "bg-zinc-50 text-zinc-600 border-zinc-200 hover:bg-zinc-100"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {/* Searchable Requester Selection */}
              <div className="relative space-y-1">
                <label className="block text-xs font-semibold text-zinc-700">
                  Search &amp; Select {newTicketForm.requester_type} Requester <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="material-symbols-outlined absolute left-3 top-2.5 text-zinc-400 text-lg">person_search</span>
                  <input
                    type="text"
                    value={newTicketForm.requester_search}
                    onChange={(e) => handleSearchRequesters(e.target.value)}
                    placeholder={`Type ${newTicketForm.requester_type} name or email to search…`}
                    className="w-full pl-9 pr-4 py-2.5 text-xs rounded-xl border border-zinc-300 outline-none focus:border-[#176354]"
                  />
                  {isSearchingRequester && (
                    <span className="absolute right-3 top-2.5 text-[10px] text-zinc-400 font-medium">Searching…</span>
                  )}
                </div>

                {/* Candidate Search Dropdown */}
                {requesterSearchResults.length > 0 && (
                  <div className="absolute left-0 right-0 z-20 mt-1 bg-white border border-zinc-200 rounded-xl shadow-xl max-h-40 overflow-y-auto divide-y divide-zinc-100">
                    {requesterSearchResults.map((cand) => (
                      <div
                        key={cand.id}
                        onClick={() => {
                          setNewTicketForm({
                            ...newTicketForm,
                            requester_id: cand.id,
                            requester_name: cand.name,
                            requester_email: cand.email,
                            requester_search: `${cand.name} (${cand.email})`,
                          });
                          setRequesterSearchResults([]);
                        }}
                        className="p-2.5 hover:bg-[#E8F3F3] cursor-pointer text-xs flex justify-between items-center"
                      >
                        <div>
                          <p className="font-bold text-zinc-900">{cand.name}</p>
                          <p className="text-[10px] text-zinc-500">{cand.email}</p>
                        </div>
                        <span className="font-mono text-[10px] text-[#176354] bg-[#E8F3F3] px-2 py-0.5 rounded font-bold">Select</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Selected Requester Confirmation Box */}
                {newTicketForm.requester_id && (
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex justify-between items-center mt-1">
                    <div>
                      <p className="font-bold">{newTicketForm.requester_name}</p>
                      <p className="text-[10px] text-emerald-700">ID: {newTicketForm.requester_id} • {newTicketForm.requester_email || "No email"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setNewTicketForm({ ...newTicketForm, requester_id: "", requester_name: "", requester_email: "", requester_search: "" })}
                      className="text-[10px] font-bold text-red-600 hover:underline cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              {/* Subject */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Subject <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTicketForm.subject}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, subject: e.target.value })}
                  placeholder="Short ticket summary…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-xs outline-none focus:border-[#176354]"
                />
              </div>

              {/* Category, Priority & Optional Related Appointment ID Grid */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Category</label>
                  <select
                    value={newTicketForm.category}
                    onChange={(e) => setNewTicketForm({ ...newTicketForm, category: e.target.value })}
                    className="w-full px-2.5 py-2 rounded-xl border border-zinc-300 text-xs outline-none"
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
                    className="w-full px-2.5 py-2 rounded-xl border border-zinc-300 text-xs outline-none"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Related Appt ID (Optional)</label>
                  <input
                    type="text"
                    value={newTicketForm.appointment_id}
                    onChange={(e) => setNewTicketForm({ ...newTicketForm, appointment_id: e.target.value })}
                    placeholder="e.g. APT-1029"
                    className="w-full px-2.5 py-2 rounded-xl border border-zinc-300 font-mono text-xs outline-none focus:border-[#176354]"
                  />
                </div>
              </div>

              {/* Detailed Description */}
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Detailed Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={newTicketForm.description}
                  onChange={(e) => setNewTicketForm({ ...newTicketForm, description: e.target.value })}
                  placeholder="Describe the issue or support request in detail…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-xs outline-none focus:border-[#176354]"
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

      {escalationAction && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="escalation-action-title"
            className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl border border-emerald-100 animate-in zoom-in-95 duration-200"
          >
            <div className={`px-6 py-5 text-white ${escalationAction.type === "resolve" ? "bg-[#176354]" : "bg-red-700"}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined rounded-xl bg-white/15 p-2 text-2xl">
                    {escalationAction.type === "resolve" ? "task_alt" : "cancel"}
                  </span>
                  <div>
                    <h3 id="escalation-action-title" className="text-lg font-bold" style={{ color: "#FFFFFF" }}>
                      {escalationAction.type === "resolve" ? "Resolve Escalation" : "Reject Escalation"}
                    </h3>
                    <p className="mt-0.5 text-xs text-white/75">
                      This update will be recorded in the escalation audit timeline.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={escalationActionSubmitting}
                  onClick={closeEscalationAction}
                  aria-label="Close modal"
                  className="rounded-lg p-1.5 text-white/80 hover:bg-white/15 hover:text-white disabled:opacity-50 cursor-pointer"
                >
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleEscalationActionSubmit} className="space-y-5 p-5 sm:p-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Escalation ID</p>
                  <p className="mt-1 font-mono text-sm font-bold text-[#176354]">{escalationAction.escalation.id}</p>
                </div>
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Original Ticket ID</p>
                  <p className="mt-1 font-mono text-sm font-bold text-zinc-800">{escalationAction.escalation.original_ticket_id}</p>
                </div>
              </div>

              <div>
                <label htmlFor="escalation-action-text" className="mb-1.5 block text-xs font-bold text-zinc-700">
                  {escalationAction.type === "resolve" ? "Resolution Summary" : "Rejection Reason"}
                  <span className="ml-1 text-red-500">*</span>
                </label>
                <textarea
                  id="escalation-action-text"
                  rows={5}
                  autoFocus
                  value={escalationActionText}
                  onChange={(e) => {
                    setEscalationActionText(e.target.value);
                    if (escalationActionError) setEscalationActionError("");
                  }}
                  placeholder={escalationAction.type === "resolve" ? "Describe the resolution and outcome…" : "Explain why this escalation is being rejected…"}
                  aria-invalid={Boolean(escalationActionError)}
                  aria-describedby={escalationActionError ? "escalation-action-error" : undefined}
                  className={`w-full resize-none rounded-2xl border px-4 py-3 text-sm text-zinc-800 outline-none transition focus:ring-2 ${
                    escalationActionError
                      ? "border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-100"
                      : "border-zinc-300 bg-white focus:border-emerald-600 focus:ring-emerald-100"
                  }`}
                />
                {escalationActionError && (
                  <p id="escalation-action-error" role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-red-600">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {escalationActionError}
                  </p>
                )}
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-zinc-100 pt-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  disabled={escalationActionSubmitting}
                  onClick={closeEscalationAction}
                  className="rounded-xl border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={escalationActionSubmitting}
                  className={`rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer ${
                    escalationAction.type === "resolve"
                      ? "bg-emerald-600 hover:bg-emerald-700"
                      : "bg-red-700 hover:bg-red-800"
                  }`}
                >
                  {escalationActionSubmitting
                    ? "Saving…"
                    : escalationAction.type === "resolve"
                      ? "Confirm Resolution"
                      : "Confirm Rejection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Inter-Team Escalation Modal (PRD Section 10.3) */}
      {showCreateEscalationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-zinc-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-base font-bold text-zinc-900 flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-700">published_with_changes</span>
                New Inter-Team Escalation Form
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateEscalationModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateEscalation} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Original Support Ticket ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newEscalationForm.original_ticket_id}
                  onChange={(e) => setNewEscalationForm({ ...newEscalationForm, original_ticket_id: e.target.value })}
                  placeholder="e.g. TICK-102938"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 font-mono text-sm outline-none focus:border-purple-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Escalation Category</label>
                  <select
                    value={newEscalationForm.escalation_category}
                    onChange={(e) => {
                      const cat = e.target.value;
                      const teamMap = {
                        account_security: "Security & Operations",
                        video_infrastructure: "Technical Operations",
                        refund_approval: "Authorized Finance",
                        doctor_approval: "Clinic Administrator",
                        platform_outage: "Operations",
                        privacy_concern: "Security / Privacy Officer",
                        application_defect: "Engineering",
                      };
                      setNewEscalationForm({
                        ...newEscalationForm,
                        escalation_category: cat,
                        destination_team: teamMap[cat] || newEscalationForm.destination_team,
                      });
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 text-sm outline-none"
                  >
                    <option value="application_defect">Application Defect</option>
                    <option value="account_security">Suspicious Account Access</option>
                    <option value="video_infrastructure">Video Infrastructure Failure</option>
                    <option value="refund_approval">Refund Approval</option>
                    <option value="doctor_approval">Doctor Approval Issue</option>
                    <option value="platform_outage">Platform Outage</option>
                    <option value="privacy_concern">Privacy Concern</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Destination Team</label>
                  <select
                    value={newEscalationForm.destination_team}
                    onChange={(e) => setNewEscalationForm({ ...newEscalationForm, destination_team: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 text-sm outline-none"
                  >
                    <option value="Engineering">Engineering</option>
                    <option value="Security & Operations">Security &amp; Operations</option>
                    <option value="Technical Operations">Technical Operations</option>
                    <option value="Authorized Finance">Authorized Finance</option>
                    <option value="Clinic Administrator">Clinic Administrator</option>
                    <option value="Operations">Operations</option>
                    <option value="Security / Privacy Officer">Security / Privacy Officer</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Priority</label>
                  <select
                    value={newEscalationForm.priority}
                    onChange={(e) => setNewEscalationForm({ ...newEscalationForm, priority: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 text-sm outline-none"
                  >
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Expected Follow-up SLA</label>
                  <select
                    value={newEscalationForm.expected_follow_up}
                    onChange={(e) => setNewEscalationForm({ ...newEscalationForm, expected_follow_up: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-300 text-sm outline-none"
                  >
                    <option value="1 hour">1 Hour (Urgent Outage)</option>
                    <option value="4 hours">4 Hours (High Priority)</option>
                    <option value="12 hours">12 Hours (Medium)</option>
                    <option value="24 hours">24 Hours (Low)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Escalation Reason <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newEscalationForm.reason}
                  onChange={(e) => setNewEscalationForm({ ...newEscalationForm, reason: e.target.value })}
                  placeholder="Why Support cannot resolve independently…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-sm outline-none focus:border-purple-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Impact Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  value={newEscalationForm.impact_description}
                  onChange={(e) => setNewEscalationForm({ ...newEscalationForm, impact_description: e.target.value })}
                  placeholder="Describe impact on user, clinician, or system…"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-300 text-sm outline-none focus:border-purple-600"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowCreateEscalationModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 border border-zinc-300 rounded-xl hover:bg-zinc-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-purple-700 hover:bg-purple-800 rounded-xl cursor-pointer"
                >
                  Submit Escalation
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
