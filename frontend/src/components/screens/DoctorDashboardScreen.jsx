import { useEffect, useState } from "react";
import { doctorApi } from "../../lib/api";

function formatPaymentLabel(raw) {
  const p = (raw || "").toLowerCase();
  if (p === "captured" || p === "success" || p === "paid") return "Paid";
  if (p === "not_required" || p === "no_payment_required") return "No Payment Required";
  if (p === "failed") return "Payment Failed";
  if (p === "refunded") return "Refunded";
  return "Payment Pending";
}

function formatAptDate(startsAt) {
  if (!startsAt) return "Time not set";
  const dt = new Date(startsAt);
  return dt.toLocaleDateString("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }) + ", " + dt.toLocaleTimeString("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  }) + " IST";
}

export default function DoctorDashboardScreen({ onNavigate }) {
  const [state, setState] = useState("loading");
  const [dashboard, setDashboard] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState("");

  // Urgent Care On-Demand State (Phase 3.3)
  const [urgentDuty, setUrgentDuty] = useState(false);
  const [urgentQueue, setUrgentQueue] = useState([]);
  const [togglingDuty, setTogglingDuty] = useState(false);
  const [claimingTicketId, setClaimingTicketId] = useState(null);

  useEffect(() => {
    Promise.all([
      doctorApi.dashboard(),
      doctorApi.appointments(),
      doctorApi.getUrgentCareQueue().catch(() => null),
    ])
      .then(([summary, items, qData]) => {
        setDashboard(summary);
        setAppointments(Array.isArray(items) ? items : []);
        if (qData) {
          setUrgentDuty(Boolean(qData.doctor_on_duty));
          setUrgentQueue(Array.isArray(qData.waiting_patients) ? qData.waiting_patients : []);
        }
        setState("ready");
      })
      .catch((err) => {
        setError(err.message || "Unable to load doctor dashboard.");
        setState("error");
      });
  }, []);

  // Poll urgent care queue when on duty
  useEffect(() => {
    if (!urgentDuty) return;
    const interval = setInterval(() => {
      doctorApi
        .getUrgentCareQueue()
        .then((qData) => {
          if (qData) {
            setUrgentDuty(Boolean(qData.doctor_on_duty));
            setUrgentQueue(Array.isArray(qData.waiting_patients) ? qData.waiting_patients : []);
          }
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(interval);
  }, [urgentDuty]);

  const handleToggleDuty = async () => {
    setTogglingDuty(true);
    const nextState = !urgentDuty;
    try {
      await doctorApi.toggleUrgentCareDuty(nextState);
      setUrgentDuty(nextState);
      if (nextState) {
        const qData = await doctorApi.getUrgentCareQueue().catch(() => null);
        if (qData) setUrgentQueue(qData.waiting_patients || []);
      }
    } catch {
      // Revert if failed
    } finally {
      setTogglingDuty(false);
    }
  };

  const handleClaimUrgentCare = async (ticketId) => {
    setClaimingTicketId(ticketId);
    try {
      const res = await doctorApi.claimUrgentCareTicket(ticketId);
      if (res?.appointment_id) {
        onNavigate("video-consultation", { appointmentId: res.appointment_id });
      }
    } catch (err) {
      alert(err.message || "Failed to claim urgent care ticket.");
    } finally {
      setClaimingTicketId(null);
    }
  };

  if (state === "loading")
    return (
      <div className="min-h-[70vh] flex items-center justify-center text-[#577877] font-sans">
        Loading clinician workspace…
      </div>
    );
  if (state === "error")
    return (
      <div className="m-8 rounded-2xl bg-white border border-red-200 p-6 text-red-700 font-sans">
        {error}
      </div>
    );

  const todayStr = new Date().toLocaleDateString("en-CA");
  const todayCount =
    dashboard?.today ??
    appointments.filter(
      (a) =>
        a.starts_at &&
        new Date(a.starts_at).toISOString().split("T")[0] === todayStr &&
        !["cancelled"].includes(a.status),
    ).length;

  const upcomingCount =
    dashboard?.upcoming ??
    appointments.filter((a) =>
      ["confirmed", "requested", "pending_payment", "checked_in"].includes(a.status),
    ).length;

  const completedCount =
    dashboard?.completed ??
    appointments.filter((a) => a.status === "completed").length;

  const pendingNotesCount = dashboard?.pending_notes ?? 0;

  const cards = [
    ["Today", todayCount],
    ["Upcoming", upcomingCount],
    ["Completed", completedCount],
    ["Pending notes", pendingNotesCount],
  ];

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
              Clinician workspace
            </p>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
              Doctor Dashboard
            </h1>
          </div>

          {/* Urgent Care Duty Switch */}
          <div className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-[#577877]/15 shadow-2xs self-start sm:self-auto">
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${urgentDuty ? "bg-emerald-500 animate-pulse" : "bg-zinc-300"}`} />
              <span className="text-xs font-bold text-[#162623]">
                Express Urgent Care: {urgentDuty ? "ON DUTY" : "OFF DUTY"}
              </span>
            </div>
            <button
              type="button"
              disabled={togglingDuty}
              onClick={handleToggleDuty}
              className={`px-3 py-1.5 rounded-xl font-bold text-xs transition cursor-pointer ${
                urgentDuty
                  ? "bg-rose-100 hover:bg-rose-200 text-rose-800"
                  : "bg-[#25836F] hover:bg-[#1E6B5A] text-white"
              }`}
            >
              {urgentDuty ? "Go Off-Duty" : "Go On-Duty"}
            </button>
          </div>
        </div>

        {/* Live Urgent Care Queue (When On-Duty) */}
        {urgentDuty && (
          <div className="care-card p-6 sm:p-7 rounded-2xl bg-gradient-to-br from-emerald-50/90 to-teal-50/50 border border-emerald-300/60 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-emerald-200/60 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-2xl text-[#185A4D]">bolt</span>
                <div>
                  <h2 className="font-bold text-base text-[#185A4D]">
                    Incoming Urgent Care Queue ({urgentQueue.length})
                  </h2>
                  <p className="text-xs text-[#577877]">Instant 5-minute consultation requests waiting for clinician claim</p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-full bg-emerald-600 text-white font-bold text-xs animate-pulse">
                Live Dispatch
              </span>
            </div>

            {urgentQueue.length === 0 ? (
              <div className="py-6 text-center space-y-1">
                <span className="material-symbols-outlined text-3xl text-emerald-600">check_circle</span>
                <p className="font-bold text-xs text-[#162623]">Queue is currently clear</p>
                <p className="text-[11px] text-[#577877]">You are on duty. Incoming patients will appear here instantly.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {urgentQueue.map((patient) => (
                  <div
                    key={patient.ticket_id}
                    className="p-4 rounded-xl bg-white border border-emerald-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-[10px] uppercase">
                          Queue #{patient.queue_position}
                        </span>
                        <span className="font-bold text-sm text-[#162623]">{patient.patient_name}</span>
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 font-bold text-[10px] uppercase">
                          {patient.urgency_level}
                        </span>
                      </div>
                      <p className="text-[#577877]">
                        <span className="font-semibold text-[#162623]">Complaint:</span> {patient.chief_complaint}
                      </p>
                      <p className="text-[11px] text-[#577877]">
                        Requested: {new Date(patient.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={claimingTicketId === patient.ticket_id}
                      onClick={() => handleClaimUrgentCare(patient.ticket_id)}
                      className="bg-[#185A4D] hover:bg-[#12443A] text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-xs transition flex items-center justify-center gap-2 shrink-0 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">videocam</span>
                      <span>{claimingTicketId === patient.ticket_id ? "Claiming…" : "Claim & Start Video Consult"}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map(([label, value]) => (
            <div
              key={label}
              className="care-card p-5 space-y-1 rounded-2xl bg-white border border-[#577877]/15"
            >
              <p className="text-3xl font-bold text-[#162623]">{value}</p>
              <p className="text-xs font-semibold text-[#577877]">{label}</p>
            </div>
          ))}
        </div>

        <div className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-4">
          <div className="flex items-center justify-between border-b border-[#577877]/15 pb-3">
            <h2 className="font-bold text-base text-[#162623]">Recent Consultation Schedule</h2>
            <button
              type="button"
              onClick={() => onNavigate("doctor-appointments")}
              className="text-xs font-bold text-[#25836F] hover:underline cursor-pointer"
            >
              View All Appointments →
            </button>
          </div>

          {appointments.length === 0 ? (
            <p className="text-xs text-[#577877] p-4 text-center">No appointments assigned.</p>
          ) : (
            <div className="space-y-3">
              {appointments.slice(0, 8).map((item, idx) => {
                const displayRef = item.id ? `KC-APT-${item.id.slice(-6).toUpperCase()}` : "KC-APT-1001";
                const patientName = item.patient_name || "Patient";
                const visitType = item.type || "Follow-up Consultation";
                const payLabel = formatPaymentLabel(item.payment_status);

                return (
                  <div
                    key={`${item.id}-${idx}`}
                    className="p-4 rounded-xl border border-[#577877]/15 bg-[#F0F5F7]/40 hover:bg-[#F0F5F7] transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[#577877] text-[11px]">{displayRef}</span>
                        <span className="font-bold text-[#162623] text-sm">{patientName}</span>
                      </div>
                      <p className="text-[#25836F] font-semibold">{visitType}</p>
                      <p className="text-[#577877]">🗓️ {formatAptDate(item.starts_at)}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold uppercase text-[10px]">
                        {item.status}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold uppercase text-[10px]">
                        {payLabel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Clinical Actions Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
          <button
            type="button"
            onClick={() => onNavigate("doctor-availability")}
            className="care-card p-5 text-left rounded-2xl bg-white border border-[#577877]/15 hover:border-[#25836F] transition-all group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-[#EEF6F3] text-[#25836F] group-hover:bg-[#25836F] group-hover:text-white flex items-center justify-center transition-colors mb-3">
              <span className="material-symbols-outlined text-xl">schedule</span>
            </div>
            <h3 className="font-bold text-sm text-[#162623] group-hover:text-[#25836F] transition-colors">
              Manage Availability
            </h3>
            <p className="text-xs text-[#577877] mt-1">Set consultation shifts &amp; recurring slots</p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate("doctor-patients")}
            className="care-card p-5 text-left rounded-2xl bg-white border border-[#577877]/15 hover:border-[#25836F] transition-all group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-[#EEF6F3] text-[#25836F] group-hover:bg-[#25836F] group-hover:text-white flex items-center justify-center transition-colors mb-3">
              <span className="material-symbols-outlined text-xl">groups</span>
            </div>
            <h3 className="font-bold text-sm text-[#162623] group-hover:text-[#25836F] transition-colors">
              Patient Directory
            </h3>
            <p className="text-xs text-[#577877] mt-1">Review medical records &amp; consultation history</p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate("doctor-appointments")}
            className="care-card p-5 text-left rounded-2xl bg-white border border-[#577877]/15 hover:border-[#25836F] transition-all group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-[#EEF6F3] text-[#25836F] group-hover:bg-[#25836F] group-hover:text-white flex items-center justify-center transition-colors mb-3">
              <span className="material-symbols-outlined text-xl">calendar_month</span>
            </div>
            <h3 className="font-bold text-sm text-[#162623] group-hover:text-[#25836F] transition-colors">
              Consultation Schedule
            </h3>
            <p className="text-xs text-[#577877] mt-1">Manage upcoming &amp; completed appointments</p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate("doctor-settings")}
            className="care-card p-5 text-left rounded-2xl bg-white border border-[#577877]/15 hover:border-[#25836F] transition-all group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-[#EEF6F3] text-[#25836F] group-hover:bg-[#25836F] group-hover:text-white flex items-center justify-center transition-colors mb-3">
              <span className="material-symbols-outlined text-xl">settings</span>
            </div>
            <h3 className="font-bold text-sm text-[#162623] group-hover:text-[#25836F] transition-colors">
              Clinician Profile &amp; Settings
            </h3>
            <p className="text-xs text-[#577877] mt-1">Update fee structure &amp; clinic settings</p>
          </button>
        </div>

        {/* Clinical Quality & Practice Highlights Footer Banner */}
        <div className="rounded-2xl bg-gradient-to-r from-[#185A4D] via-[#1F6E5E] to-[#25836F] text-white p-6 sm:p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6 mb-8">
          <div className="space-y-1 text-center md:text-left">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/15 text-white text-[11px] font-semibold tracking-wider uppercase backdrop-blur-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-[#20C7A7]" />
              Kaizen Care Clinician Network
            </span>
            <h3 className="text-lg sm:text-xl font-bold text-white pt-1">
              Delivering Exceptional Remote Healthcare
            </h3>
            <p className="text-xs sm:text-sm text-[#F0F5F7]/85 max-w-xl">
              Encrypted video consultations, digital clinical documentation, and instant prescription fulfillment for verified patients across India.
            </p>
          </div>

          <div className="flex items-center gap-6 text-center shrink-0 border-t md:border-t-0 md:border-l border-white/20 pt-4 md:pt-0 md:pl-6">
            <div>
              <p className="text-xl font-bold text-white">4.9 ★</p>
              <p className="text-[11px] text-[#F0F5F7]/80">Patient Rating</p>
            </div>
            <div>
              <p className="text-xl font-bold text-white">99.2%</p>
              <p className="text-[11px] text-[#F0F5F7]/80">On-Time Visits</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
