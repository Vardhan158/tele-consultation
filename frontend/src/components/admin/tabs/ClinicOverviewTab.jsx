import { useEffect, useState } from "react";
import { adminApi } from "../../../lib/api";

export default function ClinicOverviewTab({ onSelectTab }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminApi
      .overview()
      .then((res) => setData(res))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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
      <div className="rounded-2xl bg-gradient-to-r from-[#25836F] to-[#162623] p-6 text-white shadow-md border border-[rgba(87,120,119,0.15)] sm:p-8">
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

      {/* System Alerts & Recent Activity Feed */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Alerts & System Status */}
        <div className="care-card p-6 space-y-4 min-w-0 flex flex-col">
          <div className="flex items-center justify-between border-b border-[#577877]/15 pb-3">
            <h2 className="text-base font-bold text-[#162623] flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-500">warning</span>
              Operational Alerts ({alerts.length})
            </h2>
            <span className="text-xs text-[#577877]">Live feed</span>
          </div>
          <div className="space-y-3 flex-1">
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
