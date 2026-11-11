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

  useEffect(() => {
    Promise.all([doctorApi.dashboard(), doctorApi.appointments()])
      .then(([summary, items]) => {
        setDashboard(summary);
        setAppointments(Array.isArray(items) ? items : []);
        setState("ready");
      })
      .catch((err) => {
        setError(err.message || "Unable to load doctor dashboard.");
        setState("error");
      });
  }, []);

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
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
            Clinician workspace
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
            Doctor Dashboard
          </h1>
        </div>

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
              className="text-xs font-bold text-[#295255] hover:underline cursor-pointer"
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
                      <p className="text-[#295255] font-semibold">{visitType}</p>
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
      </div>
    </div>
  );
}
