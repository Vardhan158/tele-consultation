const settled = new Set(["captured", "success", "not_required", "no_payment_required", "not_needed"]);
const joinable = new Set(["confirmed", "checked_in", "in_progress"]);

export function appointmentCategory(appointment, now = Date.now()) {
  const status = String(appointment.rawStatus ?? appointment.status ?? "").toLowerCase();
  if (status === "cancelled") return "cancelled";
  const end = Date.parse(appointment.ends_at);
  return status === "completed" || status === "no_show" || end < now ? "past" : "upcoming";
}

export function canJoinAppointment(appointment, now = Date.now()) {
  if (!appointment) return false;
  const status = String(appointment.rawStatus ?? appointment.status ?? "").toLowerCase();
  const payment = String(appointment.rawPaymentStatus ?? appointment.payment_status ?? "").toLowerCase();
  const start = Date.parse(appointment.starts_at);
  const end = Date.parse(appointment.ends_at);
  const minutes = appointment.join_window_minutes;
  return joinable.has(status) && settled.has(payment) && Number.isFinite(minutes)
    && now >= start - minutes * 60000 && now <= end;
}
