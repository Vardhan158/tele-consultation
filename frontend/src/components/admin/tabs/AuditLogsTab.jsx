import { useState, useEffect } from "react";
import { adminApi } from "../../../lib/api";

export default function AuditLogsTab() {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    setError("");
    try {
      const params = {};
      if (actionFilter !== "all") params.action = actionFilter;
      const res = await adminApi.auditLogs(params);
      setLogs(res.logs || []);
      setTotal(res.total || (res.logs || []).length);
    } catch (err) {
      setError(err.message || "Failed to load audit trail.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [actionFilter]);

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      log.action.toLowerCase().includes(q) ||
      log.actor_id.toLowerCase().includes(q) ||
      log.resource_type.toLowerCase().includes(q) ||
      log.resource_id.toLowerCase().includes(q)
    );
  });

  const getActionBadgeColor = (action) => {
    if (action.includes("reassign") || action.includes("delete")) {
      return "bg-rose-100 text-rose-800 border-rose-200";
    }
    if (action.includes("approve") || action.includes("verified")) {
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    }
    if (action.includes("save") || action.includes("update")) {
      return "bg-blue-100 text-blue-800 border-blue-200";
    }
    return "bg-zinc-100 text-zinc-800 border-zinc-200";
  };

  const handleExportCsv = () => {
    if (logs.length === 0) return;
    const headers = ["Log ID", "Actor ID", "Action", "Resource Type", "Resource ID", "Timestamp"];
    const rows = logs.map((l) => [
      l.id,
      l.actor_id,
      l.action,
      l.resource_type,
      l.resource_id,
      l.occurred_at,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.map((x) => `"${x}"`).join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `clinic_audit_log_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
            Compliance &amp; Governance
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
            Clinic Audit Trail Explorer
          </h1>
          <p className="text-xs sm:text-sm text-[#577877] mt-1">
            Immutable, cryptographically verifiable log of all administrative actions, clinical reassignments, and billing adjustments.
          </p>
        </div>

        <button
          type="button"
          onClick={handleExportCsv}
          disabled={logs.length === 0}
          className="bg-white border border-[#577877]/30 hover:bg-[#F0F5F7] text-[#162623] px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs transition cursor-pointer self-start sm:self-auto"
        >
          <span className="material-symbols-outlined !text-[#25836F] text-base">download</span>
          <span>Export Audit CSV</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="care-card p-4 rounded-2xl bg-white border border-[#577877]/15 flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <label className="text-xs font-bold text-[#162623] shrink-0">Action Filter:</label>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-[#577877]/25 text-xs text-[#162623] bg-white focus:outline-none focus:border-[#25836F]"
          >
            <option value="all">All Administrative Actions</option>
            <option value="appointment.reassign">Emergency Doctor Reassignments</option>
            <option value="doctor.approve">Doctor Approvals</option>
            <option value="service.save_fee">Service Fee Configurations</option>
            <option value="settings.update">Clinic Settings Updates</option>
          </select>
        </div>

        <div className="w-full sm:w-72">
          <input
            type="text"
            placeholder="Search by actor, action, or resource…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3.5 py-1.5 rounded-xl border border-[#577877]/25 text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
          />
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Logs Table */}
      <div className="care-card rounded-2xl bg-white border border-[#577877]/15 overflow-hidden shadow-2xs">
        <div className="p-4 border-b border-[#577877]/15 flex items-center justify-between">
          <h2 className="font-bold text-sm text-[#162623]">
            Audit Records ({filteredLogs.length} of {total})
          </h2>
          <button
            type="button"
            onClick={fetchLogs}
            className="text-xs text-[#25836F] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-[#577877]">
            Loading audit trail records…
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-[#577877] space-y-2">
            <span className="material-symbols-outlined text-3xl text-[#577877]/60">history_edu</span>
            <p className="text-sm font-semibold text-[#162623]">No audit log events match this criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F0F5F7] text-[#577877] border-b border-[#577877]/15 uppercase tracking-wider text-[11px] font-semibold">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Actor</th>
                  <th className="py-3 px-4">Resource</th>
                  <th className="py-3 px-4">Context Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#577877]/10">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F0F5F7]/40 transition">
                    <td className="py-3 px-4 whitespace-nowrap text-[#577877] font-mono text-[11px]">
                      {new Date(log.occurred_at).toLocaleString("en-IN", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider ${getActionBadgeColor(
                          log.action
                        )}`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-[#162623]">
                      {log.actor_id}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-[#577877]">
                      <span className="font-semibold text-[#162623]">{log.resource_type}</span>
                      {log.resource_id && (
                        <span className="font-mono text-[10px] ml-1.5 text-[#577877]">
                          ({log.resource_id.slice(-8)})
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-[#577877] max-w-xs truncate">
                      {log.metadata && Object.keys(log.metadata).length > 0 ? (
                        <span className="font-mono text-[11px] bg-zinc-100 px-2 py-0.5 rounded text-zinc-700">
                          {JSON.stringify(log.metadata)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
