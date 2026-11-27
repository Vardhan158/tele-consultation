import { useEffect, useState } from "react";
import { adminApi } from "../../../lib/api";

export default function ClinicOverviewTab({ onSelectTab }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Phase 3 (F-07): Clinical SLA Monitor & Queue Escalation State
  const [slaData, setSlaData] = useState(null);
  const [loadingSla, setLoadingSla] = useState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [reassignModalTicket, setReassignModalTicket] = useState(null);
  const [targetDoctorId, setTargetDoctorId] = useState("");
  const [reassignReason, setReassignReason] = useState("SLA Delay Mitigation");

  const loadSlaData = () => {
    setLoadingSla(true);
    adminApi
      .getSlaMonitor()
      .then(setSlaData)
      .catch(() => {})
      .finally(() => setLoadingSla(false));
  };

  useEffect(() => {
    adminApi
      .overview()
      .then((res) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));

    loadSlaData();
  }, []);

  const handleNudge = async (ticketId, doctorId) => {
    try {
      await adminApi.nudgeSlaDoctor({
        ticket_id: ticketId,
        doctor_id: doctorId || "doc-urgent",
        message: "Urgent SLA Alert: Patient wait time approaching clinical threshold. Please admit consultation.",
      });
      setActionMessage(`Priority clinical nudge sent for ticket #${ticketId.slice(0, 8)}`);
      setTimeout(() => setActionMessage(""), 4000);
    } catch (err) {
      setActionMessage(err.message || "Failed to dispatch nudge.");
    }
  };

  const handleReassign = async (e) => {
    e.preventDefault();
    if (!reassignModalTicket || !targetDoctorId.trim()) return;
    try {
      await adminApi.reassignSlaTicket({
        ticket_id: reassignModalTicket.ticket_id,
        target_doctor_id: targetDoctorId.trim(),
        reason: reassignReason,
      });
      setActionMessage(`Ticket #${reassignModalTicket.ticket_id.slice(0, 8)} reassigned to Dr. ${targetDoctorId}.`);
      setReassignModalTicket(null);
      loadSlaData();
      setTimeout(() => setActionMessage(""), 4000);
    } catch (err) {
      setActionMessage(err.message || "Reassignment failed.");
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-[#577877]">
        <span className="material-symbols-outlined animate-spin text-3xl">sync</span>
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const alerts = data?.alerts || [];
  const activity = data?.recent_activity || [];

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-[#25836F] via-[#1F6E5E] to-[#185A4D] p-6 text-white shadow-sm border border-[#185A4D]/30 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-white">
              Clinic Overview Dashboard
            </span>
            <h1 className="mt-2 text-2xl font-bold text-white sm:text-3xl">
              Clinic Operations & Key Performance Indicators
            </h1>
            <p className="mt-1 text-xs text-white/80 sm:text-sm">
              Real-time snapshot of clinician credentialing, daily bookings, consultations, and net revenue.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => onSelectTab("doctors")}
              className="rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-[#25836F] shadow transition hover:bg-[#F0F5F7]"
            >
              Verify Doctors ({kpis.pending_approvals || 0})
            </button>
          </div>
        </div>
      </div>

      {/* KPI Grid - Responsive 7 cards layout wrapping cleanly without overflow */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
        <div className="care-card p-4 text-center min-w-0">
          <div className="text-2xl font-bold text-[#25836F] truncate">{kpis.total_doctors || 0}</div>
          <div className="mt-1 text-[11px] font-medium text-[#577877] truncate">Total Doctors</div>
        </div>
        <div className="care-card p-4 text-center min-w-0">
          <div className="text-2xl font-bold text-amber-600 truncate">{kpis.pending_approvals || 0}</div>
          <div className="mt-1 text-[11px] font-medium text-[#577877] truncate">Pending Approvals</div>
        </div>
        <div className="care-card p-4 text-center min-w-0">
          <div className="text-2xl font-bold text-teal-600 truncate">{kpis.active_doctors || 0}</div>
          <div className="mt-1 text-[11px] font-medium text-[#577877] truncate">Active Clinicians</div>
        </div>
        <div className="care-card p-4 text-center min-w-0">
          <div className="text-2xl font-bold text-blue-600 truncate">{kpis.today_appointments || 0}</div>
          <div className="mt-1 text-[11px] font-medium text-[#577877] truncate">Appointments Today</div>
        </div>
        <div className="care-card p-4 text-center min-w-0">
          <div className="text-2xl font-bold text-emerald-600 truncate">{kpis.completed_consultations || 0}</div>
          <div className="mt-1 text-[11px] font-medium text-[#577877] truncate">Completed Visits</div>
        </div>
        <div className="care-card p-4 text-center min-w-0">
          <div className="text-2xl font-bold text-[#162623] truncate">{kpis.total_appointments || 0}</div>
          <div className="mt-1 text-[11px] font-medium text-[#577877] truncate">Total Bookings</div>
        </div>
        <div className="care-card p-4 text-center min-w-0">
          <div className="text-2xl font-bold text-[#25836F] truncate">
            ₹{(kpis.total_revenue || 0).toLocaleString("en-IN")}
          </div>
          <div className="mt-1 text-[11px] font-medium text-[#577877] truncate">Net Revenue</div>
        </div>
      </div>

      {/* Action Toast Notification */}
      {actionMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            {actionMessage}
          </span>
          <button type="button" onClick={() => setActionMessage("")} className="cursor-pointer">✕</button>
        </div>
      )}

      {/* Phase 3 (F-07): Clinical SLA Monitor & Escalation Engine */}
      <div className="care-card p-6 space-y-5 bg-white rounded-2xl border border-[#577877]/15">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#577877]/15 pb-4">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-outlined text-rose-500 text-2xl">
              hourglass_top
            </span>
            <div>
              <h2 className="text-base font-bold text-[#162623] flex items-center gap-2">
                <span>Clinical SLA Monitor &amp; Breach Predictor</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E8F3F3] text-[#25836F]">
                  Real-Time Queue Telemetry
                </span>
              </h2>
              <p className="text-xs text-[#577877] mt-0.5">
                Proactive wait time surveillance across urgent care lobby and checked-in consultations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadSlaData}
              disabled={loadingSla}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[#577877]/20 bg-white text-xs font-semibold text-[#577877] hover:bg-[#F0F5F7] transition cursor-pointer"
            >
              <span className={`material-symbols-outlined text-sm ${loadingSla ? "animate-spin" : ""}`}>
                sync
              </span>
              <span>Refresh SLA</span>
            </button>
          </div>
        </div>

        {/* SLA Status Metrics Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 space-y-1">
            <span className="text-[#577877] block font-medium">Patients Waiting</span>
            <span className="text-xl font-bold text-[#162623] block">
              {slaData?.summary?.total_waiting || 0}
            </span>
            <span className="text-[10px] text-[#577877]">In queue or lobby</span>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
            <span className="text-emerald-800 block font-medium">Normal (&lt;10m)</span>
            <span className="text-xl font-bold text-emerald-900 block">
              {slaData?.summary?.normal_count || 0}
            </span>
            <span className="text-[10px] text-emerald-700">Within standard SLA</span>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
            <span className="text-amber-800 block font-medium">Warning (10-20m)</span>
            <span className="text-xl font-bold text-amber-900 block">
              {slaData?.summary?.warning_count || 0}
            </span>
            <span className="text-[10px] text-amber-700">Approaching threshold</span>
          </div>

          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 space-y-1">
            <span className="text-rose-800 block font-bold">Breach Risk (&gt;20m)</span>
            <span className="text-xl font-bold text-rose-900 block">
              {slaData?.summary?.breached_count || 0}
            </span>
            <span className="text-[10px] text-rose-700">Action required</span>
          </div>
        </div>

        {/* Live Tickets Table */}
        {!slaData?.tickets || slaData.tickets.length === 0 ? (
          <div className="p-6 text-center text-xs text-[#577877] bg-[#F8FAFB] rounded-xl border border-dashed border-[#577877]/20">
            No patients currently waiting in urgent lobby. All active consultations are within standard SLA targets.
          </div>
        ) : (
          <div className="overflow-x-auto border border-[#577877]/15 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F0F5F7] text-[#577877] border-b border-[#577877]/15">
                <tr>
                  <th className="p-3 font-semibold">Patient &amp; Complaint</th>
                  <th className="p-3 font-semibold">Wait Time</th>
                  <th className="p-3 font-semibold">SLA Status</th>
                  <th className="p-3 font-semibold">Breach Probability</th>
                  <th className="p-3 font-semibold">Attending / Queue</th>
                  <th className="p-3 font-semibold text-right">Escalation Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#577877]/10">
                {slaData.tickets.map((t) => (
                  <tr key={t.ticket_id} className="hover:bg-slate-50/60 transition">
                    <td className="p-3 font-medium text-[#162623]">
                      <div className="font-bold">{t.patient_name}</div>
                      <div className="text-[11px] text-[#577877]">{t.chief_complaint}</div>
                    </td>
                    <td className="p-3 font-mono font-semibold text-slate-800">
                      {t.wait_time_minutes} min
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          t.sla_status === "breached"
                            ? "bg-rose-100 text-rose-800"
                            : t.sla_status === "warning"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {t.sla_status}
                      </span>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              t.breach_probability >= 0.75
                                ? "bg-rose-500"
                                : t.breach_probability >= 0.45
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                            }`}
                            style={{ width: `${Math.round(t.breach_probability * 100)}%` }}
                          />
                        </div>
                        <span className="text-[11px] font-mono text-[#577877]">
                          {Math.round(t.breach_probability * 100)}%
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-[11px] text-[#577877]">
                      {t.assigned_doctor_name || "Unassigned on-duty"}
                    </td>
                    <td className="p-3 text-right space-x-1.5">
                      <button
                        type="button"
                        onClick={() => handleNudge(t.ticket_id, t.assigned_doctor_id)}
                        className="px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-semibold transition cursor-pointer"
                        title="Send high-priority clinical nudge to doctor"
                      >
                        Nudge
                      </button>
                      <button
                        type="button"
                        onClick={() => setReassignModalTicket(t)}
                        className="px-2.5 py-1 rounded-lg border border-[#25836F] bg-white hover:bg-emerald-50 text-[#25836F] text-[11px] font-semibold transition cursor-pointer"
                        title="Reassign to alternate doctor"
                      >
                        Reassign
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Reassign Ticket Modal */}
      {reassignModalTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#577877]/20 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#577877]/15 pb-2">
              <h3 className="font-bold text-sm text-[#162623] flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#25836F] text-lg">swap_horiz</span>
                <span>Reassign Delayed Queue Ticket</span>
              </h3>
              <button type="button" onClick={() => setReassignModalTicket(null)} className="cursor-pointer">✕</button>
            </div>
            <p className="text-xs text-[#577877]">
              Reassign patient <strong>{reassignModalTicket.patient_name}</strong> (waiting {reassignModalTicket.wait_time_minutes}m) to another on-duty clinician to mitigate SLA breach.
            </p>
            <form onSubmit={handleReassign} className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Target Doctor User / Clinician ID *</label>
                <input
                  type="text"
                  required
                  value={targetDoctorId}
                  onChange={(e) => setTargetDoctorId(e.target.value)}
                  placeholder="e.g. doc-urgent-standby, doc-102"
                  className="w-full p-2.5 rounded-xl border border-[#577877]/30 text-xs focus:outline-none focus:border-[#25836F]"
                />
              </div>
              <div>
                <label className="font-semibold block mb-1">Reassignment Reason</label>
                <input
                  type="text"
                  value={reassignReason}
                  onChange={(e) => setReassignReason(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#577877]/30 text-xs focus:outline-none focus:border-[#25836F]"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2">
                <button type="button" onClick={() => setReassignModalTicket(null)} className="btn-secondary text-xs !py-1.5 !px-3 cursor-pointer">
                  Cancel
                </button>
                <button type="submit" className="btn-primary text-xs !py-1.5 !px-4 cursor-pointer">
                  Confirm Reassignment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* System Alerts & Recent Activity Feed */}
      <div className="grid gap-6 md:grid-cols-2 items-start">
        {/* Alerts & System Status */}
        <div className="care-card p-6 space-y-4 min-w-0">
          <div className="flex items-center justify-between border-b border-[#577877]/15 pb-3">
            <h2 className="text-base font-bold text-[#162623] flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500">warning</span>
              Operational Alerts ({alerts.length})
            </h2>
            <span className="text-xs text-[#577877]">Live feed</span>
          </div>
          <div className="space-y-3">
            {alerts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#577877]/20 bg-[#F0F5F7] p-3 text-xs text-[#577877] text-center font-medium">
                No active operational alerts. System functioning normally.
              </div>
            ) : (
              alerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`rounded-xl p-3 text-xs font-medium flex items-start gap-2.5 ${
                    alert.type === "warning"
                      ? "bg-amber-50 text-amber-800 border border-amber-200"
                      : "bg-teal-50 text-[#25836F] border border-teal-200"
                  }`}
                >
                  <span className="mt-0.5 font-bold">
                    {alert.type === "warning" ? "⚠️" : "ℹ️"}
                  </span>
                  <div>{alert.message}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Activity Log */}
        <div className="care-card p-6 space-y-4 min-w-0">
          <div className="flex items-center justify-between border-b border-[#577877]/15 pb-3">
            <h2 className="text-base font-bold text-[#162623] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#25836F]">history</span>
              Recent Activity Log
            </h2>
            <span className="text-xs text-[#577877]">Today</span>
          </div>
          <div className="space-y-3">
            {activity.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#577877]/25 bg-[#F0F5F7] p-5 text-sm text-[#577877]">
                No recent clinic activity.
              </div>
            ) : (
              activity.map((act) => (
                <div
                  key={act.id}
                  className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-[#F0F5F7]"
                >
                  <span className="font-medium text-[#162623]">{act.text}</span>
                  <span className="text-[11px] font-semibold text-[#577877]">{act.timestamp}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
