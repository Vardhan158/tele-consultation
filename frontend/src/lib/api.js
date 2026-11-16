export function sanitizeApiUrl(rawUrl) {
  if (!rawUrl) return "";
  let url = String(rawUrl).trim();
  if (url.includes("=")) {
    const parts = url.split("=");
    url = parts[parts.length - 1].trim();
  }
  return url.replace(/\/+$/, "");
}

export const API_BASE_URL =
  sanitizeApiUrl(import.meta.env.VITE_API_BASE_URL) ||
  sanitizeApiUrl(import.meta.env.VITE_API_URL) ||
  "http://localhost:8000";

export async function apiRequest(path, options = {}) {
  const headers =
    options.body instanceof FormData
      ? { ...(options.headers || {}) }
      : { "Content-Type": "application/json", ...(options.headers || {}) };
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${API_BASE_URL}${normalizedPath}`;
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers,
  });

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (contentType.includes("text/html")) {
    throw new Error(
      `API returned HTML instead of JSON from ${url}. Check VITE_API_BASE_URL (currently "${API_BASE_URL}") and verify that your FastAPI backend service is running and accessible.`
    );
  }

  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    const raw = detail.detail ?? detail.message ?? detail.error;
    const message = Array.isArray(raw)
      ? raw
          .map((item) => {
            const location = Array.isArray(item.loc)
              ? item.loc.filter((part) => part !== "body").join(".")
              : "";
            return location
              ? `${location}: ${item.msg || "Invalid value"}`
              : item.msg || "Invalid value";
          })
          .join(" ")
      : typeof raw === "object" && raw !== null
        ? raw.message || JSON.stringify(raw)
        : raw;
    throw new Error(message || `Request failed (${response.status})`);
  }
  if (response.status === 204) return null;
  if (!contentType.includes("application/json") && !contentType.includes("+json")) {
    throw new Error(
      `API returned an unexpected response (HTTP ${response.status}, ${contentType || "unknown content type"}) for ${response.url || url}. Check VITE_API_BASE_URL and that the FastAPI backend is running; the request may be reaching the frontend HTML server instead.`,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new Error(
      `API returned invalid JSON (HTTP ${response.status}) for ${response.url || url}.`,
    );
  }
}

export const patientApi = {
  bookingOptions: () => apiRequest("/api/v1/patient/booking-options"),
  profile: () => apiRequest("/patient/profile"),
  updateProfile: (profile) =>
    apiRequest("/patient/profile", {
      method: "PATCH",
      body: JSON.stringify(profile),
    }),
  submitIntake: (intake) =>
    apiRequest("/patient/intake", {
      method: "POST",
      body: JSON.stringify(intake),
    }),
  consents: () => apiRequest("/patient/consents"),
  grantConsent: (consent) =>
    apiRequest("/patient/consents", {
      method: "POST",
      body: JSON.stringify(consent),
    }),
  withdrawConsent: (id) =>
    apiRequest(`/patient/consents/${id}/withdraw`, { method: "POST" }),
  doctors: (specialty, language) =>
    apiRequest(
      `/api/v1/patient/doctors?${new URLSearchParams({ ...(specialty ? { specialty } : {}), ...(language ? { language } : {}) })}`,
    ),
  availability: (doctorId) =>
    apiRequest(`/api/v1/patient/doctors/${doctorId}/availability`),
  pricing: (doctorId, appointmentType) =>
    apiRequest(`/api/v1/patient/doctors/${doctorId}/pricing?${new URLSearchParams({ appointment_type: appointmentType })}`),
  createProfile: (profile) =>
    apiRequest("/patient/profile", {
      method: "POST",
      body: JSON.stringify(profile),
    }),
  bookAppointment: (appointment) =>
    apiRequest("/patient/appointments", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify(appointment),
    }),
  createOrder: (payload) =>
    apiRequest("/patient/payments/create-order", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  verifyPayment: (payload) =>
    apiRequest("/patient/payments/verify", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  appointments: () => apiRequest("/patient/appointments"),
  cancelAppointment: (id) =>
    apiRequest(`/patient/appointments/${id}/cancel`, { method: "POST" }),
  rescheduleAppointment: (id, starts_at) =>
    apiRequest(`/patient/appointments/${id}/reschedule`, {
      method: "POST",
      body: JSON.stringify({ starts_at }),
    }),
};

export const doctorApi = {
  register: (payload) => {
    if (payload?.credential_document instanceof File) {
      const form = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (key === "credential_document") form.append(key, value);
        else if (Array.isArray(value)) form.append(key, value.join(","));
        else if (value !== undefined && value !== null) form.append(key, String(value));
      });
      return apiRequest("/doctor/register", { method: "POST", body: form });
    }
    return apiRequest("/doctor/register", { method: "POST", body: JSON.stringify(payload) });
  },
  dashboard: () => apiRequest("/doctor/dashboard"),
  notifications: () => apiRequest("/doctor/notifications"),
  markNotificationRead: (id) =>
    apiRequest(`/doctor/notifications/${id}/read`, { method: "POST" }),
  markAllNotificationsRead: () =>
    apiRequest("/doctor/notifications/read-all", { method: "POST" }),
  appointments: () => apiRequest("/doctor/appointments"),
  availability: () => apiRequest("/doctor/availability"),
  createAvailability: (slot) =>
    apiRequest("/doctor/availability", {
      method: "POST",
      body: JSON.stringify(slot),
    }),
  deleteAvailability: (slotId) =>
    apiRequest(`/doctor/availability/${slotId}`, {
      method: "DELETE",
    }),
  saveNote: (appointmentId, content_reference) =>
    apiRequest(`/doctor/appointments/${appointmentId}/notes`, {
      method: "POST",
      body: JSON.stringify({ content_reference }),
    }),
  notes: (appointmentId) =>
    apiRequest(`/doctor/appointments/${appointmentId}/notes`),
  updateNote: (noteId, content_reference) =>
    apiRequest(`/doctor/notes/${noteId}`, {
      method: "PATCH",
      body: JSON.stringify({ content_reference }),
    }),
  patients: () => apiRequest("/doctor/patients"),
  patientDetail: (patientId) => apiRequest(`/doctor/patients/${patientId}`),
  finalizeNote: (appointmentId, noteId) =>
    apiRequest(
      `/doctor/appointments/${appointmentId}/notes/${noteId}/finalize`,
      { method: "POST" },
    ),
  joinConsultation: (appointmentId) =>
    apiRequest(`/doctor/consultations/${appointmentId}/join`, {
      method: "POST",
    }),
  amendments: (noteId) => apiRequest(`/doctor/notes/${noteId}/amendments`),
  amendNote: (noteId, content_reference, reason = "") =>
    apiRequest(`/doctor/notes/${noteId}/amend`, {
      method: "POST",
      body: JSON.stringify({ content_reference, reason }),
    }),
  enrollMfa: () => apiRequest("/doctor/mfa/enroll", { method: "POST" }),
  cancelMfaEnrollment: () => apiRequest("/doctor/mfa/enroll/cancel", { method: "POST" }),
  verifyMfa: (code) =>
    apiRequest("/doctor/mfa/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
};

export const authApi = {
  register: (payload) =>
    apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  verifyEmail: (email, code) =>
    apiRequest("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ email, code }),
    }),
  login: (payload) =>
    apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  logout: () => apiRequest("/auth/logout", { method: "POST" }),
  me: () => apiRequest("/auth/me"),
  requestRecovery: (email) =>
    apiRequest("/auth/recovery", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),
  resetPassword: (payload) =>
    apiRequest("/auth/recovery/reset", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const settingsApi = {
  get: () => apiRequest("/patient/settings"),
  update: (payload) =>
    apiRequest("/patient/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  changePassword: (payload) =>
    apiRequest("/patient/settings/password", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  sessions: () => apiRequest("/patient/settings/sessions"),
  revokeSession: (id) =>
    apiRequest(`/patient/settings/sessions/${id}/revoke`, { method: "POST" }),
  requestExport: () =>
    apiRequest("/patient/settings/export", { method: "POST" }),
  requestDeletion: () =>
    apiRequest("/patient/settings/deletion-request", { method: "POST" }),
};

export const paymentApi = {
  list: () => apiRequest("/patient/payments"),
  getReceipt: (id) => apiRequest(`/patient/payments/${id}`),
  downloadReceipt: async (id) => {
    const response = await fetch(`${API_BASE_URL}/patient/payments/${id}/download`, {
      credentials: "include",
    });
    if (!response.ok) throw new Error("Unable to download payment receipt.");
    return response.blob();
  },
  initiate: (appointmentId) =>
    apiRequest("/patient/payments/initiate", {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ appointment_id: appointmentId }),
    }),
  verify: (
    paymentId,
    providerTransactionId,
    razorpayOrderId = null,
    razorpaySignature = null,
  ) =>
    apiRequest(`/patient/payments/${paymentId}/verify`, {
      method: "POST",
      body: JSON.stringify({
        provider_transaction_id: providerTransactionId,
        ...(razorpayOrderId ? { razorpay_order_id: razorpayOrderId } : {}),
        ...(razorpaySignature ? { razorpay_signature: razorpaySignature } : {}),
      }),
    }),
  refund: (paymentId) =>
    apiRequest(`/patient/payments/${paymentId}/refund`, { method: "POST" }),
};

export const notificationApi = {
  list: () => apiRequest("/patient/notifications"),
  markRead: (id) =>
    apiRequest(`/patient/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () =>
    apiRequest("/patient/notifications/read-all", { method: "POST" }),
  retry: (id) =>
    apiRequest(`/patient/notifications/${id}/retry`, { method: "POST" }),
};

export const consultationApi = {
  config: () => apiRequest("/patient/consultations/config"),
  join: (id) =>
    apiRequest(`/patient/consultations/${id}/join`, { method: "POST" }),
  status: (id) => apiRequest(`/patient/consultations/${id}/status`),
  connected: (id) =>
    apiRequest(`/patient/consultations/${id}/connected`, { method: "POST" }),
  disconnected: (id) =>
    apiRequest(`/patient/consultations/${id}/disconnected`, { method: "POST" }),
  complete: (id) =>
    apiRequest(`/patient/consultations/${id}/complete`, { method: "POST" }),
};

export const recordsApi = {
  list: () => apiRequest("/patient/documents"),
  upload: (file, category) => {
    const body = new FormData();
    body.append("file", file);
    body.append("category", category);
    return apiRequest("/patient/documents", {
      method: "POST",
      headers: {},
      body,
    });
  },
  access: (id) => apiRequest(`/patient/documents/${id}/access`),
  remove: (id) => apiRequest(`/patient/documents/${id}`, { method: "DELETE" }),
  download: async (id) => {
    const headers = {};
    const response = await fetch(
      `${API_BASE_URL}/patient/documents/${id}/download`,
      { credentials: "include", headers },
    );
    if (!response.ok) throw new Error("Unable to download this record.");
    return response.blob();
  },
};

export const clinicalApi = {
  summaries: () => apiRequest("/patient/clinical-outputs/summaries"),
  downloadSummary: async (id) => {
    const response = await fetch(
      `${API_BASE_URL}/patient/clinical-outputs/summaries/${id}/download`,
      { credentials: "include" },
    );
    if (!response.ok)
      throw new Error("Unable to download this consultation summary.");
    return response.blob();
  },
  prescriptions: () => apiRequest("/patient/clinical-outputs/prescriptions"),
  downloadPrescription: async (id) => {
    const response = await fetch(
      `${API_BASE_URL}/patient/clinical-outputs/prescriptions/${id}/download`,
      { credentials: "include" },
    );
    if (!response.ok) throw new Error("Unable to download this prescription.");
    return response.blob();
  },
};

export const supportApi = {
  followUp: () => apiRequest("/patient/follow-up"),
  bpReadings: () => apiRequest("/patient/vitals/blood-pressure"),
  saveBpReading: (payload) =>
    apiRequest("/patient/vitals/blood-pressure", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  tickets: () => apiRequest("/patient/support/tickets"),
  createTicket: (payload) =>
    apiRequest("/patient/support/tickets", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const contactApi = {
  createInquiry: (payload) =>
    apiRequest("/contact/inquiries", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};

export const portalConfigApi = {
  get: () => apiRequest("/config/patient-portal"),
};

export const adminApi = {
  overview: () => apiRequest("/admin/overview"),
  doctors: () => apiRequest("/admin/doctors"),
  pendingDoctors: () => apiRequest("/doctor/pending"),
  approveDoctor: (id) => apiRequest(`/doctor/${id}/approve`, { method: "POST" }),
  rejectDoctor: (id) => apiRequest(`/doctor/${id}/reject`, { method: "POST" }),
  downloadDoctorCredential: async (id, inline = false) => {
    const response = await fetch(
      `${API_BASE_URL}/doctor/${id}/credentials${inline ? "?inline=true" : ""}`,
      { credentials: "include" },
    );
    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.detail || "Credential document content is unavailable.");
    }
    return response.blob();
  },
  uploadDoctorCredential: (id, file) => {
    const form = new FormData();
    form.append("credential_document", file);
    return apiRequest(`/doctor/${id}/credentials`, { method: "POST", body: form });
  },
  toggleDoctorStatus: (id, active, reason = "") =>
    apiRequest(`/admin/doctors/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ active, reason }),
    }),
  services: () => apiRequest("/admin/services"),
  saveService: (payload) =>
    apiRequest("/admin/services", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteService: (id) =>
    apiRequest(`/admin/services/${id}`, {
      method: "DELETE",
    }),
  schedules: (doctorId = null) =>
    apiRequest(
      `/admin/schedules${doctorId ? `?doctor_id=${doctorId}` : ""}`,
    ),
  blockDate: (payload) =>
    apiRequest("/admin/schedules/block-date", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  unblockDate: (date) =>
    apiRequest(`/admin/schedules/block-date/${encodeURIComponent(date)}`, {
      method: "DELETE",
    }),
  addShift: (payload) =>
    apiRequest("/admin/schedules/shifts", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteSlot: (slotId) =>
    apiRequest(`/admin/schedules/slots/${slotId}`, {
      method: "DELETE",
    }),
  appointments: (status = "all", q = "") => {
    const params = new URLSearchParams({ status_filter: status });
    if (q) params.append("q", q);
    return apiRequest(`/admin/appointments?${params}`);
  },
  cancelAppointment: (id, reason = "Administrative cancellation") =>
    apiRequest(`/admin/appointments/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  payments: (status = "all") =>
    apiRequest(`/admin/payments?${new URLSearchParams({ status_filter: status })}`),
  refundPayment: (id, reason = "Administrative refund") =>
    apiRequest(`/admin/payments/${id}/refund`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
  reports: (range = "30d") =>
    apiRequest(`/admin/reports?${new URLSearchParams({ time_range: range })}`),
  settings: () => apiRequest("/admin/settings"),
  updateSettings: (payload) =>
    apiRequest("/admin/settings", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
};

export const supportStaffApi = {
  list: () => apiRequest("/clinic-admin/support-staff"),
  create: (payload) =>
    apiRequest("/clinic-admin/support-staff", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id, payload) =>
    apiRequest(`/clinic-admin/support-staff/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  delete: (id) =>
    apiRequest(`/clinic-admin/support-staff/${id}`, {
      method: "DELETE",
    }),
};

export const supportDashboardApi = {
  overview: () => apiRequest("/api/v1/support-dashboard/overview"),
  accountDiagnostics: (query) =>
    apiRequest(`/api/v1/support-dashboard/account-diagnostics?query=${encodeURIComponent(query)}`),
  accountAction: (userId, action, ticketId = null, note = null) =>
    apiRequest("/api/v1/support-dashboard/account-action", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, action, ticket_id: ticketId, note }),
    }),
  bookingDiagnostics: (query) =>
    apiRequest(`/api/v1/support-dashboard/booking-diagnostics?query=${encodeURIComponent(query)}`),
  bookingAction: (appointmentId, action, reason, startsAt = null, ticketId = null) =>
    apiRequest("/api/v1/support-dashboard/booking-action", {
      method: "POST",
      body: JSON.stringify({ appointment_id: appointmentId, action, reason, starts_at: startsAt, ticket_id: ticketId }),
    }),
  patients: (search = "", offset = 0, limit = 25) =>
    apiRequest(`/api/v1/support-dashboard/patients?search=${encodeURIComponent(search)}&offset=${offset}&limit=${limit}`),
  patientDetail: (id) => apiRequest(`/api/v1/support-dashboard/patients/${id}`),
  doctors: (search = "", status = "", offset = 0, limit = 25) =>
    apiRequest(`/api/v1/support-dashboard/doctors?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&offset=${offset}&limit=${limit}`),
  doctorDetail: (id) => apiRequest(`/api/v1/support-dashboard/doctors/${id}`),
  appointments: (search = "", status = "", date = "", offset = 0, limit = 25) =>
    apiRequest(`/api/v1/support-dashboard/appointments?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&date=${encodeURIComponent(date)}&offset=${offset}&limit=${limit}`),
  appointmentAction: (id, action, reason, startsAt = null) =>
    apiRequest(`/api/v1/support-dashboard/appointments/${id}/action`, {
      method: "POST",
      body: JSON.stringify({ action, reason, ...(startsAt ? { starts_at: startsAt } : {}) }),
    }),
  payments: (search = "", status = "", offset = 0, limit = 25) =>
    apiRequest(`/api/v1/support-dashboard/payments?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&offset=${offset}&limit=${limit}`),
  refundPayment: (id, reason, amount = null) =>
    apiRequest(`/api/v1/support-dashboard/payments/${id}/refund`, {
      method: "POST",
      body: JSON.stringify({ reason, amount }),
    }),
  videoSessions: (status = "") =>
    apiRequest(`/api/v1/support-dashboard/video-sessions?status=${encodeURIComponent(status)}`),
  videoDiagnostics: (query) =>
    apiRequest(`/api/v1/support-dashboard/video-diagnostics?query=${encodeURIComponent(query)}`),
  videoAction: (sessionId, action, ticketId = null, note = null) =>
    apiRequest("/api/v1/support-dashboard/video-action", {
      method: "POST",
      body: JSON.stringify({ session_id: sessionId, action, ticket_id: ticketId, note }),
    }),
  endVideoSession: (id) =>
    apiRequest(`/api/v1/support-dashboard/video-sessions/${id}/end`, {
      method: "POST",
    }),
  tickets: (status = "", priority = "", category = "", offset = 0, limit = 25) =>
    apiRequest(`/api/v1/support-dashboard/tickets?status=${encodeURIComponent(status)}&priority=${encodeURIComponent(priority)}&category=${encodeURIComponent(category)}&offset=${offset}&limit=${limit}`),
  createTicket: (payload) =>
    apiRequest("/api/v1/support-dashboard/tickets", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateTicket: (id, payload) =>
    apiRequest(`/api/v1/support-dashboard/tickets/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  escalations: (status = "", team = "", priority = "", ticketId = "", offset = 0, limit = 25) =>
    apiRequest(`/api/v1/support-dashboard/escalations?status=${encodeURIComponent(status)}&destination_team=${encodeURIComponent(team)}&priority=${encodeURIComponent(priority)}&ticket_id=${encodeURIComponent(ticketId)}&offset=${offset}&limit=${limit}`),
  createEscalation: (payload) =>
    apiRequest("/api/v1/support-dashboard/escalations", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateEscalation: (id, payload) =>
    apiRequest(`/api/v1/support-dashboard/escalations/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  auditHistory: (startDate = "", endDate = "", actorId = "", ticketId = "", action = "", resource = "", resultFilter = "", offset = 0, limit = 50) =>
    apiRequest(`/api/v1/support-dashboard/audit-history?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&actor_id=${encodeURIComponent(actorId)}&ticket_id=${encodeURIComponent(ticketId)}&action=${encodeURIComponent(action)}&resource=${encodeURIComponent(resource)}&result_filter=${encodeURIComponent(resultFilter)}&offset=${offset}&limit=${limit}`),
  auditExport: () =>
    apiRequest("/api/v1/support-dashboard/audit-export", {
      method: "POST",
    }),
  slaConfig: () => apiRequest("/api/v1/support-dashboard/sla-config"),
  updateSlaConfig: (payload) =>
    apiRequest("/api/v1/support-dashboard/sla-config", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  uploadAttachment: (ticketId, file) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest(`/api/v1/support-dashboard/tickets/${ticketId}/attachments`, {
      method: "POST",
      body: formData,
    });
  },
};

export const secopsDashboardApi = {
  healthOverview: () => apiRequest("/api/v1/secops-dashboard/health-overview"),
  triggerHealthCheck: () =>
    apiRequest("/api/v1/secops-dashboard/health/check", { method: "POST" }),
  securityEvents: (severity = "", search = "", eventType = "", status = "", startDate = "", endDate = "", offset = 0, limit = 25) =>
    apiRequest(`/api/v1/secops-dashboard/security/events?severity=${encodeURIComponent(severity)}&search=${encodeURIComponent(search)}&event_type=${encodeURIComponent(eventType)}&status=${encodeURIComponent(status)}&start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&offset=${offset}&limit=${limit}`),
  updateSecurityEvent: (id, payload) =>
    apiRequest(`/api/v1/secops-dashboard/security/events/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  executeSecurityAction: (payload) =>
    apiRequest("/api/v1/secops-dashboard/security/action", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  auditLogs: (startDate = "", endDate = "", actorId = "", action = "", resource = "", resultFilter = "", correlationId = "", offset = 0, limit = 50) =>
    apiRequest(`/api/v1/secops-dashboard/audit-logs?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&actor_id=${encodeURIComponent(actorId)}&action=${encodeURIComponent(action)}&resource=${encodeURIComponent(resource)}&result_filter=${encodeURIComponent(resultFilter)}&correlation_id=${encodeURIComponent(correlationId)}&offset=${offset}&limit=${limit}`),
  exportAuditLogs: () =>
    apiRequest("/api/v1/secops-dashboard/audit/export", { method: "POST" }),
  incidents: (status = "", severity = "", category = "", offset = 0, limit = 25) =>
    apiRequest(`/api/v1/secops-dashboard/incidents?status=${encodeURIComponent(status)}&severity=${encodeURIComponent(severity)}&category=${encodeURIComponent(category)}&offset=${offset}&limit=${limit}`),
  createIncident: (payload) =>
    apiRequest("/api/v1/secops-dashboard/incidents", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateIncident: (id, payload) =>
    apiRequest(`/api/v1/secops-dashboard/incidents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  providers: () => apiRequest("/api/v1/secops-dashboard/providers"),
  probeProvider: (providerKey) =>
    apiRequest(`/api/v1/secops-dashboard/providers/${providerKey}/check`, { method: "POST" }),
  recordProviderMaintenance: (payload) =>
    apiRequest("/api/v1/secops-dashboard/providers/maintenance", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  backups: () => apiRequest("/api/v1/secops-dashboard/backups"),
  triggerBackup: () =>
    apiRequest("/api/v1/secops-dashboard/backups/trigger", { method: "POST" }),
  createRecoveryRequest: (payload) =>
    apiRequest("/api/v1/secops-dashboard/backups/recovery-requests", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateRecoveryRequest: (id, payload) =>
    apiRequest(`/api/v1/secops-dashboard/backups/recovery-requests/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  alerts: (status = "", severity = "", offset = 0, limit = 25) =>
    apiRequest(`/api/v1/secops-dashboard/alerts?status=${encodeURIComponent(status)}&severity=${encodeURIComponent(severity)}&offset=${offset}&limit=${limit}`),
  acknowledgeAlert: (alertId) =>
    apiRequest(`/api/v1/secops-dashboard/alerts/${alertId}/acknowledge`, { method: "POST" }),
  updateAlertAction: (alertId, payload) =>
    apiRequest(`/api/v1/secops-dashboard/alerts/${alertId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
  alertRules: () => apiRequest("/api/v1/secops-dashboard/alerts/rules"),
  updateAlertRules: (payload) =>
    apiRequest("/api/v1/secops-dashboard/alerts/rules", {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),
};

export function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (typeof window !== "undefined" && window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}
