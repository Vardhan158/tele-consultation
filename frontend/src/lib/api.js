export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export async function apiRequest(path, options = {}) {
  const headers =
    options.body instanceof FormData
      ? { ...(options.headers || {}) }
      : { "Content-Type": "application/json", ...(options.headers || {}) };
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers,
  });
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
  return response.status === 204 ? null : response.json();
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
