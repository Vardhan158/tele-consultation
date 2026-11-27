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
  getEmergencyCard: () => apiRequest("/patient/emergency-card"),
  updateProfile: (profile) =>
    apiRequest("/patient/profile", {
      method: "PATCH",
      body: JSON.stringify(profile),
    }),
  uploadPhoto: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return apiRequest("/patient/profile/photo", {
      method: "POST",
      body: formData,
    });
  },
  submitIntake: (intake) =>
    apiRequest("/patient/intake", {
      method: "POST",
      body: JSON.stringify(intake),
    }),
  consents: () => apiRequest("/patient/consents"),
  consentDocuments: () => apiRequest("/patient/consents/documents"),
  consentHistory: () => apiRequest("/patient/consents/history"),
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
    apiRequest(`/patient/doctors/${doctorId}/availability`),
  doctorAvailability: (doctorId) =>
    apiRequest(`/patient/doctors/${doctorId}/availability`),
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
  cancelAppointment: (id, payload = {}) =>
    apiRequest(`/patient/appointments/${id}/cancel`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  rescheduleAppointment: (id, payload) =>
    apiRequest(`/patient/appointments/${id}/reschedule`, {
      method: "POST",
      body: JSON.stringify(typeof payload === "object" ? payload : { starts_at: payload }),
    }),
  getFamilyMembers: () => apiRequest("/patient/family-members"),
  createFamilyMember: (payload) =>
    apiRequest("/patient/family-members", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  deleteFamilyMember: (memberId) =>
    apiRequest(`/patient/family-members/${memberId}`, {
      method: "DELETE",
    }),
  getFollowUpThread: (appointmentId) =>
    apiRequest(`/patient/appointments/${appointmentId}/follow-up`),
  sendFollowUpMessage: (appointmentId, message) =>
    apiRequest(`/patient/appointments/${appointmentId}/follow-up`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  requestUrgentCare: (payload) =>
    apiRequest("/patient/urgent-care/request", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getUrgentCareStatus: () => apiRequest("/patient/urgent-care/status"),
  cancelUrgentCare: (ticketId) =>
    apiRequest(`/patient/urgent-care/${ticketId}/cancel`, { method: "POST" }),
};

export const doctorApi = {
  register: (payload) => {
    const hasFile = Object.values(payload || {}).some((v) => v instanceof File);
    if (hasFile) {
      const form = new FormData();
      Object.entries(payload).forEach(([key, value]) => {
        if (value instanceof File) form.append(key, value);
        else if (Array.isArray(value)) form.append(key, value.join(","));
        else if (value !== undefined && value !== null) form.append(key, String(value));
      });
      return apiRequest("/doctor/register", { method: "POST", body: form });
    }
    return apiRequest("/doctor/register", { method: "POST", body: JSON.stringify(payload) });
  },
  documents: (doctorId) => apiRequest(`/doctor/${doctorId}/documents`),
  downloadDocument: async (doctorId, documentType, inline = false) => {
    const response = await fetch(
      `${API_BASE_URL}/doctor/${doctorId}/documents/${documentType}/download${inline ? "?inline=true" : ""}`,
      { credentials: "include" },
    );
    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.detail || "Document content is unavailable.");
    }
    return response.blob();
  },
  uploadDocument: (doctorId, documentType, file) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest(`/doctor/${doctorId}/documents/${documentType}`, { method: "POST", body: form });
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
  createRecurringAvailability: (payload) =>
    apiRequest("/doctor/availability/recurring", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  payouts: () => apiRequest("/doctor/payouts"),
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
  publishPrescription: (payload) =>
    apiRequest("/clinician/clinical-outputs/prescriptions", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getFollowUpThread: (appointmentId) =>
    apiRequest(`/doctor/appointments/${appointmentId}/follow-up`),
  sendFollowUpMessage: (appointmentId, message) =>
    apiRequest(`/doctor/appointments/${appointmentId}/follow-up`, {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  toggleUrgentCareDuty: (active) =>
    apiRequest("/doctor/urgent-care/toggle", {
      method: "POST",
      body: JSON.stringify({ active }),
    }),
  getUrgentCareQueue: () => apiRequest("/doctor/urgent-care/queue"),
  claimUrgentCareTicket: (ticketId) =>
    apiRequest(`/doctor/urgent-care/${ticketId}/claim`, { method: "POST" }),
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
  unreadCount: () => apiRequest("/patient/notifications/unread-count"),
  markRead: (id) =>
    apiRequest(`/patient/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () =>
    apiRequest("/patient/notifications/read-all", { method: "POST" }),
  retry: (id) =>
    apiRequest(`/patient/notifications/${id}/retry`, { method: "POST" }),
};

export const adminNotificationApi = {
  list: (params) => {
    const q = new URLSearchParams();
    if (params?.unread_only) q.append("unread_only", "true");
    if (params?.limit) q.append("limit", params.limit);
    const qs = q.toString() ? `?${q.toString()}` : "";
    return apiRequest(`/clinic-admin/notifications${qs}`);
  },
  unreadCount: () => apiRequest("/clinic-admin/notifications/unread-count"),
  markRead: (id) =>
    apiRequest(`/clinic-admin/notifications/${id}/read`, { method: "POST" }),
  markAllRead: () =>
    apiRequest("/clinic-admin/notifications/read-all", { method: "POST" }),
  retry: (id) =>
    apiRequest(`/clinic-admin/notifications/${id}/retry`, { method: "POST" }),
  getConfig: () => apiRequest("/clinic-admin/notifications/config"),
  updateConfig: (data) =>
    apiRequest("/clinic-admin/notifications/config", {
      method: "PUT",
      body: JSON.stringify(data),
    }),
  checkExpiringPolicies: () =>
    apiRequest("/clinic-admin/notifications/check-expiring-policies", { method: "POST" }),
  checkPendingClaims: () =>
    apiRequest("/clinic-admin/notifications/check-pending-claims", { method: "POST" }),
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
  getGenericSubstitutes: (prescriptionId) =>
    apiRequest(`/patient/clinical-outputs/prescriptions/${prescriptionId}/generic-substitutes`),
  orderPharmacy: (prescriptionId, payload) =>
    apiRequest(`/patient/clinical-outputs/prescriptions/${prescriptionId}/order-pharmacy`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  pharmacyOrders: () => apiRequest("/patient/clinical-outputs/pharmacy-orders"),
  verifySignature: (prescriptionId) =>
    apiRequest(`/patient/clinical-outputs/prescriptions/${prescriptionId}/verify-signature`),
};

export const abdmApi = {
  generateOtp: (payload) =>
    apiRequest("/patient/abdm/abha/generate-otp", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  verifyOtp: (payload) =>
    apiRequest("/patient/abdm/abha/verify-otp", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  profile: () => apiRequest("/patient/abdm/abha/profile"),
  unlink: () =>
    apiRequest("/patient/abdm/abha/unlink", {
      method: "DELETE",
    }),
  consents: () => apiRequest("/patient/abdm/consents"),
  revokeConsent: (consentId) =>
    apiRequest(`/patient/abdm/consents/${consentId}/revoke`, {
      method: "POST",
    }),
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
  approveDoctor: (id, notes = "") =>
    apiRequest(`/doctor/${id}/approve`, {
      method: "POST",
      body: JSON.stringify({ notes }),
    }),
  rejectDoctor: (id, reason = "") =>
    apiRequest(`/doctor/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
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
  doctorDocuments: (id) => apiRequest(`/doctor/${id}/documents`),
  downloadDoctorDocument: async (id, documentType, inline = false) => {
    const response = await fetch(
      `${API_BASE_URL}/doctor/${id}/documents/${documentType}/download${inline ? "?inline=true" : ""}`,
      { credentials: "include" },
    );
    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.detail || "Document content is unavailable.");
    }
    return response.blob();
  },
  uploadDoctorDocument: (id, documentType, file) => {
    const form = new FormData();
    form.append("file", file);
    return apiRequest(`/doctor/${id}/documents/${documentType}`, { method: "POST", body: form });
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
  reassignAppointment: (id, payload) =>
    apiRequest(`/admin/appointments/${id}/reassign`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  payoutLedger: () => apiRequest("/admin/payout-ledger"),
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
  auditLogs: (params = {}) => {
    const qs = new URLSearchParams(params).toString();
    return apiRequest(`/admin/audit-logs${qs ? `?${qs}` : ""}`);
  },
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

export const insuranceApi = {
  listProviders: (params = {}) => {
    const query = new URLSearchParams();
    if (params.search) query.set("search", params.search);
    if (params.status && params.status !== "all") query.set("status", params.status);
    if (params.provider_type && params.provider_type !== "all") query.set("provider_type", params.provider_type);
    if (params.page) query.set("page", params.page);
    if (params.limit) query.set("limit", params.limit);
    const qs = query.toString();
    return apiRequest(`/clinic-admin/insurance/providers${qs ? `?${qs}` : ""}`);
  },
  getProvider: (id) => apiRequest(`/clinic-admin/insurance/providers/${id}`),
  createProvider: (payload) =>
    apiRequest("/clinic-admin/insurance/providers", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateProvider: (id, payload) =>
    apiRequest(`/clinic-admin/insurance/providers/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  toggleStatus: (id, status) =>
    apiRequest(`/clinic-admin/insurance/providers/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  // Patient Portal Insurance methods (Checkpoint 2 & 3)
  getPatientPolicies: () => apiRequest("/patient/insurance/policies"),
  getPatientPolicy: (policyId) => apiRequest(`/patient/insurance/policies/${policyId}`),
  getActiveProviders: () => apiRequest("/patient/insurance/providers"),
  registerPolicy: (formData) =>
    apiRequest("/patient/insurance/policies", {
      method: "POST",
      body: formData,
    }),
  updatePolicy: (policyId, formData) =>
    apiRequest(`/patient/insurance/policies/${policyId}`, {
      method: "PUT",
      body: formData,
    }),
  togglePolicyStatus: (policyId, status) =>
    apiRequest(`/patient/insurance/policies/${policyId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  downloadDocument: async (docId, fileName) => {
    const res = await fetch(`${API_BASE_URL}/patient/insurance/documents/${docId}/download`, {
      credentials: "include",
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || "Failed to download document");
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || "document";
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(link);
  },
  fetchDocumentPreviewBlob: async (docId) => {
    const res = await fetch(`${API_BASE_URL}/patient/insurance/documents/${docId}/preview`, {
      credentials: "include",
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || "Failed to preview document");
    }
    const blob = await res.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    return {
      objectUrl,
      contentType: res.headers.get("content-type") || "application/octet-stream",
    };
  },
  // Post-Consultation Insurance Claim (Checkpoint 4 & 5)
  preflightValidateClaim: (payload) =>
    apiRequest("/patient/insurance/claims/preflight-validate", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  checkClaimEligibility: (appointmentId) =>
    apiRequest(`/patient/insurance/appointments/${appointmentId}/claim-eligibility`),
  initiateClaim: (appointmentId, payload) =>
    apiRequest(`/patient/insurance/appointments/${appointmentId}/claim-initiate`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getClaimDossier: (appointmentId, policyId = null) => {
    const qs = policyId ? `?policy_id=${encodeURIComponent(policyId)}` : "";
    return apiRequest(`/patient/insurance/appointments/${appointmentId}/claim-dossier${qs}`);
  },
  uploadSupportingDocument: (appointmentId, formData) =>
    apiRequest(`/patient/insurance/appointments/${appointmentId}/claim-documents`, {
      method: "POST",
      body: formData,
    }),
  deleteDocument: (docId) =>
    apiRequest(`/patient/insurance/documents/${docId}`, {
      method: "DELETE",
    }),
  downloadClaimInvoice: async (appointmentId, fileName) => {
    const res = await fetch(`${API_BASE_URL}/patient/insurance/appointments/${appointmentId}/invoice/download`, {
      credentials: "include",
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || "Failed to download consultation invoice");
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || `Invoice-${appointmentId}.pdf`;
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(link);
  },
  fetchInvoicePreviewBlob: async (appointmentId) => {
    const res = await fetch(`${API_BASE_URL}/patient/insurance/appointments/${appointmentId}/invoice/preview`, {
      credentials: "include",
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || "Failed to preview invoice");
    }
    const blob = await res.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    return {
      objectUrl,
      contentType: res.headers.get("content-type") || "application/pdf",
    };
  },
  downloadClaimReceipt: async (appointmentId, fileName) => {
    const res = await fetch(`${API_BASE_URL}/patient/insurance/appointments/${appointmentId}/receipt/download`, {
      credentials: "include",
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || "Failed to download payment receipt");
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || `Receipt-${appointmentId}.pdf`;
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(link);
  },
  fetchReceiptPreviewBlob: async (appointmentId) => {
    const res = await fetch(`${API_BASE_URL}/patient/insurance/appointments/${appointmentId}/receipt/preview`, {
      credentials: "include",
    });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || "Failed to preview payment receipt");
    }
    const blob = await res.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    return {
      objectUrl,
      contentType: res.headers.get("content-type") || "application/pdf",
    };
  },
  fetchClinicalDocBlob: async (downloadUrl) => {
    const fullUrl = downloadUrl.startsWith("http") ? downloadUrl : `${API_BASE_URL}${downloadUrl.replace(/^\/api/, "")}`;
    const res = await fetch(fullUrl, { credentials: "include" });
    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.detail || "Failed to preview clinical document");
    }
    const blob = await res.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    return {
      objectUrl,
      contentType: res.headers.get("content-type") || "text/plain",
    };
  },
  // Checkpoint 6: Insurance Data Sharing Consent methods
  getClaimConsent: (appointmentId, policyId = null) => {
    const qs = policyId ? `?policy_id=${encodeURIComponent(policyId)}` : "";
    return apiRequest(`/patient/insurance/appointments/${appointmentId}/claim-consent${qs}`);
  },
  grantClaimConsent: (appointmentId, payload) =>
    apiRequest(`/patient/insurance/appointments/${appointmentId}/claim-consent`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  withdrawClaimConsent: (appointmentId) =>
    apiRequest(`/patient/insurance/appointments/${appointmentId}/claim-consent/withdraw`, {
      method: "POST",
    }),
  getClaimConsentDocument: () =>
    apiRequest("/patient/insurance/claim-consent/document"),
  // Checkpoint 7: Patient Insurance Claim Submission & Details
  submitClaim: (appointmentId, payload) =>
    apiRequest(`/patient/insurance/appointments/${appointmentId}/claim-submit`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getPatientClaims: () => apiRequest("/patient/insurance/claims"),
  getPatientClaimDetail: (claimId) => apiRequest(`/patient/insurance/claims/${claimId}`),
  resubmitPatientClaim: (claimId, payload) =>
    apiRequest(`/patient/insurance/claims/${claimId}/resubmit`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // Checkpoint 8: Clinic Admin Insurance Claim Verification & Audit
  listClinicAdminClaims: (params = {}) => {
    const qs = new URLSearchParams();
    if (params.search) qs.append("search", params.search);
    if (params.status && params.status !== "all") qs.append("status", params.status);
    if (params.provider_id && params.provider_id !== "all") qs.append("provider_id", params.provider_id);
    if (params.page) qs.append("page", params.page);
    if (params.limit) qs.append("limit", params.limit);
    const q = qs.toString();
    return apiRequest(`/clinic-admin/insurance/claims${q ? `?${q}` : ""}`);
  },
  getClinicAdminClaimDetail: (claimId) => apiRequest(`/clinic-admin/insurance/claims/${claimId}`),
  verifyClinicAdminClaim: (claimId, payload) =>
    apiRequest(`/clinic-admin/insurance/claims/${claimId}/verify`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // Checkpoint 9: Insurer Submission & Claim Status Tracking
  getClaimDocumentPackage: (claimId) =>
    apiRequest(`/clinic-admin/insurance/claims/${claimId}/document-package`),
  submitClaimToInsurer: (claimId, payload) =>
    apiRequest(`/clinic-admin/insurance/claims/${claimId}/submit-to-insurer`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateInsurerClaimStatus: (claimId, payload) =>
    apiRequest(`/clinic-admin/insurance/claims/${claimId}/insurer-status`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  uploadPatientAdditionalDoc: (claimId, formData) =>
    apiRequest(`/patient/insurance/claims/${claimId}/additional-documents`, {
      method: "POST",
      body: formData,
    }),
  submitPatientAdditionalDocs: (claimId, payload) =>
    apiRequest(`/patient/insurance/claims/${claimId}/submit-additional-docs`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  // Checkpoint 10: Patient Reimbursement Tracking
  uploadReimbursementEvidence: (claimId, formData) =>
    apiRequest(`/clinic-admin/insurance/claims/${claimId}/reimbursement-evidence`, {
      method: "POST",
      body: formData,
    }),
  recordClaimReimbursement: (claimId, payload) =>
    apiRequest(`/clinic-admin/insurance/claims/${claimId}/reimbursements`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  getClaimReimbursements: (claimId) =>
    apiRequest(`/clinic-admin/insurance/claims/${claimId}/reimbursements`),
  getPatientClaimReimbursements: (claimId) =>
    apiRequest(`/patient/insurance/claims/${claimId}/reimbursements`),
};

export const supportDashboardApi = {
  overview: () => apiRequest("/api/v1/support-dashboard/overview"),
  agents: () => apiRequest("/api/v1/support-dashboard/agents"),
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
  ticketDetails: (id) => apiRequest(`/api/v1/support-dashboard/tickets/${id}`),
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
  auditExport: (startDate = "", endDate = "", actorId = "", ticketId = "", action = "", resource = "", resultFilter = "") =>
    apiRequest(`/api/v1/support-dashboard/audit-export?start_date=${encodeURIComponent(startDate)}&end_date=${encodeURIComponent(endDate)}&actor_id=${encodeURIComponent(actorId)}&ticket_id=${encodeURIComponent(ticketId)}&action=${encodeURIComponent(action)}&resource=${encodeURIComponent(resource)}&result_filter=${encodeURIComponent(resultFilter)}`, {
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
  verifyBackupArtifact: (id) =>
    apiRequest(`/api/v1/secops-dashboard/backups/${id}/verify`, { method: "POST" }),
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
