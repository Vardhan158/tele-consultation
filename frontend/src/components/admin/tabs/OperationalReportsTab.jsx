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
    const timeRangeLabel =
      timeRange === "7d"
        ? "Last 7 Days"
        : timeRange === "90d"
          ? "Last 90 Days"
          : timeRange === "ytd"
            ? "Year to Date"
            : "Last 30 Days";

    const csvRows = [
      ["KAIZEN CARE TELEHEALTH - OPERATIONAL ANALYTICS REPORT"],
      ["Time Range", timeRangeLabel],
      ["Generated At", new Date().toLocaleString("en-IN")],
      ["--------------------------------------------------"],
      ["METRIC SUMMARY", "VALUE"],
      ["Total Consultations", summary.total_consultations ?? 0],
      ["Doctor Utilization Rate", summary.doctor_utilization_rate ?? "0.0%"],
      ["Completion Rate", summary.completion_rate ?? "0.0%"],
      ["Cancellation Rate", summary.cancellation_rate ?? "0.0%"],
      ["No-Show Rate", summary.no_show_rate ?? "0.0%"],
      ["--------------------------------------------------"],
      ["SPECIALTY BREAKDOWN", "VISITS COUNT", "NET REVENUE (INR)"],
      ...(bySpecialty.length > 0
        ? bySpecialty.map((s) => [s.specialty, s.count, `₹${s.revenue.toFixed(2)}`])
        : [["No records found for selected period", "0", "₹0.00"]]),
      ["--------------------------------------------------"],
      ["MONTHLY REVENUE TREND", "CONSULTATIONS", "NET REVENUE (INR)"],
      ...(monthlyRevenue.length > 0
        ? monthlyRevenue.map((m) => [m.month, m.consultations, `₹${m.revenue.toFixed(2)}`])
        : [["No records found for selected period", "0", "₹0.00"]]),
    ];

    const csvContent =
      "data:text/csv;charset=utf-8," +
      csvRows.map((row) => row.map((val) => `"${val}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `KaizenCare_Operational_Analytics_${timeRange}_${Date.now()}.csv`,
    );
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
                  timeRange === val ? "bg-[#25836F] text-white" : "text-[#577877]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            onClick={handleExportCSV}
            className="rounded-xl bg-[#25836F] px-3.5 py-2 text-xs font-semibold text-white shadow transition hover:bg-[#1d6e5d] flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Operational Metrics */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <div className="care-card p-4 text-center">
          <div className="text-2xl font-bold text-[#25836F]">
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
      <div className="grid gap-6 md:grid-cols-2 items-start">
        {/* By Specialty */}
        <div className="care-card p-6 space-y-4">
          <h2 className="text-sm font-bold text-[#162623]">Consultations &amp; Revenue by Specialty</h2>
          <div className="space-y-3">
            {bySpecialty.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#577877]/20 bg-[#F0F5F7] p-5 text-center text-xs font-semibold text-[#577877]">
                No data available for selected period.
              </div>
            ) : (
              bySpecialty.map((item) => (
                <div key={item.specialty} className="space-y-1 text-xs">
                  <div className="flex justify-between font-semibold text-[#162623]">
                    <span>{item.specialty}</span>
                    <span>{item.count} {item.count === 1 ? "visit" : "visits"} • ₹{item.revenue.toLocaleString()}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#F0F5F7]">
                    <div
                      className="h-2 rounded-full bg-[#25836F]"
                      style={{
                        width: `${maxSpecialtyCount ? (Number(item.count || 0) / maxSpecialtyCount) * 100 : 0}%`,
                      }}
                    ></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Monthly Revenue */}
        <div className="care-card p-6 space-y-4">
          <h2 className="text-sm font-bold text-[#162623]">Monthly Revenue Growth Trend</h2>
          <div className="space-y-3">
            {monthlyRevenue.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#577877]/20 bg-[#F0F5F7] p-5 text-center text-xs font-semibold text-[#577877]">
                No data available for selected period.
              </div>
            ) : (
              monthlyRevenue.map((m) => (
                <div key={m.month} className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-[#F0F5F7]">
                  <span className="font-bold text-[#162623]">{m.month}</span>
                  <span className="text-[#577877]">{m.consultations} consultations</span>
                  <span className="font-bold text-[#25836F]">₹{m.revenue.toLocaleString()}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
