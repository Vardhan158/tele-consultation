import { useEffect, useState } from "react";
import { adminApi } from "../../../lib/api";
import { useToast } from "../../common/Toast";

export default function OperationalReportsTab() {
  const { showToast } = useToast();
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState("30d");

  const loadReports = () => {
    setLoading(true);
    adminApi
      .reports(timeRange)
      .then((res) => setReports(res))
      .catch((err) => {
        showToast(err.message || "Failed to load operational reports.", "error");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadReports();
  }, [timeRange]);

  const handleExportCSV = () => {
    if (!reports) return;
    const csvRows = [
      ["Metric / Specialty", "Value / Count", "Revenue (INR)"],
      ["Total Consultations", reports.summary?.total_consultations ?? "", ""],
      ["Doctor Utilization Rate", reports.summary?.doctor_utilization_rate ?? "", ""],
      ["Completion Rate", reports.summary?.completion_rate ?? "", ""],
      ["Cancellation Rate", reports.summary?.cancellation_rate ?? "", ""],
      ["No-Show Rate", reports.summary?.no_show_rate ?? "", ""],
      [],
      ["Specialty Breakdown", "Visits Count", "Revenue (INR)"],
      ...(reports.by_specialty || []).map((s) => [s.specialty, s.count, s.revenue]),
    ];
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `kaizentrix_operational_analytics_${timeRange}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Operational report exported as CSV successfully.", "success");
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-[#577877]">
        <span className="material-symbols-outlined animate-spin text-3xl">sync</span>
      </div>
    );
  }

  const summary = reports?.summary ?? {};
  const bySpecialty = reports?.by_specialty ?? [];
  const monthlyRevenue = reports?.monthly_revenue ?? [];
  const maxSpecialtyCount = Math.max(...bySpecialty.map((item) => Number(item.count) || 0), 0);

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#577877]/15 pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
            Operational Reports & Analytics
          </span>
          <h1 className="text-2xl font-bold text-[#162623]">
            Clinic Performance, Doctor Utilization & Revenue Analytics
          </h1>
          <p className="text-xs text-[#577877]">
            Track doctor utilization rates, no-show percentages, specialty trends, and export compliance reports.
          </p>
        </div>

        {/* Range Selector & Export */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-[#F0F5F7] p-1 border border-[#577877]/15">
            {[
              ["7d", "7 Days"],
              ["30d", "30 Days"],
              ["90d", "90 Days"],
              ["ytd", "Year to Date"],
            ].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setTimeRange(val)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                  timeRange === val ? "bg-[#295255] text-white" : "text-[#577877]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCSV}
            className="rounded-xl bg-[#295255] px-3.5 py-2 text-xs font-semibold text-white shadow transition hover:bg-[#1f3f41] flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Operational Metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="care-card p-4 text-center">
          <div className="text-2xl font-bold text-[#295255]">
            {summary.total_consultations ?? "—"}
          </div>
          <div className="text-xs text-[#577877]">Total Consultations</div>
        </div>
        <div className="care-card p-4 text-center">
          <div className="text-2xl font-bold text-teal-600">
            {summary.doctor_utilization_rate ?? "—"}
          </div>
          <div className="text-xs text-[#577877]">Doctor Utilization</div>
        </div>
        <div className="care-card p-4 text-center">
          <div className="text-2xl font-bold text-emerald-600">
            {summary.completion_rate ?? "—"}
          </div>
          <div className="text-xs text-[#577877]">Completion Rate</div>
        </div>
        <div className="care-card p-4 text-center">
          <div className="text-2xl font-bold text-red-600">
            {summary.cancellation_rate ?? "—"}
          </div>
          <div className="text-xs text-[#577877]">Cancellation Rate</div>
        </div>
        <div className="care-card p-4 text-center">
          <div className="text-2xl font-bold text-amber-600">
            {summary.no_show_rate ?? "—"}
          </div>
          <div className="text-xs text-[#577877]">No-Show Rate</div>
        </div>
        <div className="care-card p-4 text-center">
          <div className="text-2xl font-bold text-[#162623]">
            {summary.patient_satisfaction ?? "—"}
          </div>
          <div className="text-xs text-[#577877]">Patient Satisfaction</div>
        </div>
      </div>

      {/* Breakdown Grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* By Specialty */}
        <div className="care-card p-6 space-y-4">
          <h2 className="text-sm font-bold text-[#162623]">Consultations & Revenue by Specialty</h2>
          <div className="space-y-3">
            {bySpecialty.map((item) => (
              <div key={item.specialty} className="space-y-1 text-xs">
                <div className="flex justify-between font-semibold text-[#162623]">
                  <span>{item.specialty}</span>
                  <span>{item.count} visits • ₹{item.revenue.toLocaleString()}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-[#F0F5F7]">
                  <div
                    className="h-2 rounded-full bg-[#295255]"
                    style={{
                      width: `${maxSpecialtyCount ? (Number(item.count || 0) / maxSpecialtyCount) * 100 : 0}%`,
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Monthly Revenue */}
        <div className="care-card p-6 space-y-4">
          <h2 className="text-sm font-bold text-[#162623]">Monthly Revenue Growth Trend</h2>
          <div className="space-y-3">
            {monthlyRevenue.map((m) => (
              <div key={m.month} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-[#F0F5F7]">
                <span className="font-bold text-[#162623]">{m.month}</span>
                <span className="text-[#577877]">{m.consultations} consultations</span>
                <span className="font-bold text-[#295255]">₹{m.revenue.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
