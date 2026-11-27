import { useState, useEffect } from "react";
import { adminNotificationApi } from "../../../lib/api";
import { useToast } from "../../common/Toast";

export default function AdminNotificationsTab({ onNavigate }) {
  const { showToast } = useToast();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState("all"); // 'all' | 'unread' | 'claims' | 'reminders'
  const [unreadCount, setUnreadCount] = useState(0);

  // Config state
  const [config, setConfig] = useState({
    policy_expiry_reminder_days: 30,
    pending_claim_reminder_hours: 24,
    dedup_window_minutes: 60,
    in_app_enabled: true,
    email_enabled: true,
  });
  const [configLoading, setConfigLoading] = useState(true);
  const [configSaving, setConfigSaving] = useState(false);
  const [scanningPolicies, setScanningPolicies] = useState(false);
  const [scanningClaims, setScanningClaims] = useState(false);
  const [retryingId, setRetryingId] = useState(null);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const items = await adminNotificationApi.list({ limit: 100 });
      if (Array.isArray(items)) {
        setNotifications(items);
        const unread = items.filter((n) => !n.read_at && n.status !== "read");
        setUnreadCount(unread.length);
      }
    } catch (err) {
      showToast(err.message || "Failed to load clinic notifications.", "error");
    } finally {
      setLoading(false);
    }
  };

  const fetchConfig = async () => {
    try {
      setConfigLoading(true);
      const res = await adminNotificationApi.getConfig();
      if (res) {
        setConfig(res);
      }
    } catch {
      // fallback to defaults
    } finally {
      setConfigLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    fetchConfig();
  }, []);

  const handleMarkRead = async (item) => {
    if (!item.read_at && item.status !== "read") {
      try {
        await adminNotificationApi.markRead(item.id);
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, read_at: new Date().toISOString(), status: "read" } : n))
        );
        setUnreadCount((c) => Math.max(0, c - 1));
      } catch {
        // ignore
      }
    }
    if (item.claim_id && onNavigate) {
      onNavigate("clinic-insurance", { claimId: item.claim_id });
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await adminNotificationApi.markAllRead();
      const nowIso = new Date().toISOString();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, read_at: nowIso, status: "read" }))
      );
      setUnreadCount(0);
      showToast("All notifications marked as read.", "success");
    } catch (err) {
      showToast(err.message || "Failed to mark all as read.", "error");
    }
  };

  const handleRetryEmail = async (item, e) => {
    e.stopPropagation();
    try {
      setRetryingId(item.id);
      const res = await adminNotificationApi.retry(item.id);
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === item.id
            ? { ...n, email_delivery_status: res.status, email_retries: res.retries }
            : n
        )
      );
      showToast(`Email status: ${res.status}.`, res.status === "failed" ? "error" : "success");
    } catch (err) {
      showToast(err.message || "Retry failed.", "error");
    } finally {
      setRetryingId(null);
    }
  };

  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      setConfigSaving(true);
      const updated = await adminNotificationApi.updateConfig(config);
      setConfig(updated);
      showToast("Notification and reminder preferences saved successfully.", "success");
    } catch (err) {
      showToast(err.message || "Failed to save configuration.", "error");
    } finally {
      setConfigSaving(false);
    }
  };

  const handleScanExpiringPolicies = async () => {
    try {
      setScanningPolicies(true);
      const res = await adminNotificationApi.checkExpiringPolicies();
      showToast(
        `Policy expiry scan complete. ${res.reminders_dispatched || 0} reminder(s) dispatched.`,
        "info"
      );
      fetchNotifications();
    } catch (err) {
      showToast(err.message || "Failed to trigger policy expiry scan.", "error");
    } finally {
      setScanningPolicies(false);
    }
  };

  const handleScanPendingClaims = async () => {
    try {
      setScanningClaims(true);
      const res = await adminNotificationApi.checkPendingClaims();
      showToast(
        `Pending verification scan complete. ${res.reminders_dispatched || 0} alert(s) dispatched.`,
        "info"
      );
      fetchNotifications();
    } catch (err) {
      showToast(err.message || "Failed to trigger pending claims scan.", "error");
    } finally {
      setScanningClaims(false);
    }
  };

  const getEventIcon = (eventType) => {
    if (!eventType) return "notifications";
    if (eventType.includes("new_claim")) return "fact_check";
    if (eventType.includes("resubmitted")) return "edit_document";
    if (eventType.includes("pending_verification")) return "hourglass_top";
    if (eventType.includes("pending_submission")) return "send";
    if (eventType.includes("additional_doc")) return "upload_file";
    if (eventType.includes("awaiting_reimbursement") || eventType.includes("reimbursement")) return "payments";
    if (eventType.includes("policy")) return "health_and_safety";
    return "notifications";
  };

  const filteredNotifications = notifications.filter((n) => {
    const isUnread = !n.read_at && n.status !== "read";
    if (activeFilter === "unread") return isUnread;
    if (activeFilter === "claims") return n.claim_id || n.event_type?.includes("claim");
    if (activeFilter === "reminders") return n.event_type?.includes("reminder") || n.event_type?.includes("pending") || n.event_type?.includes("policy");
    return true;
  });

  return (
    <div className="w-full space-y-6 font-sans text-[#162623]">
      {/* Heading Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-[#25836F] via-[#1F6E5E] to-[#185A4D] text-white px-6 py-5 sm:px-8 sm:py-6 shadow-sm border border-[#185A4D]/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase text-[#F0F5F7]/85">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A3E2D4]" />
            Clinic Administration &amp; Operational Alerts
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Insurance Claims &amp; Verification Alerts
          </h1>
          <p className="text-xs sm:text-sm text-[#F0F5F7]/90 max-w-2xl leading-relaxed">
            Real-time notifications for incoming insurance claims, patient corrections, insurer adjudication decisions, and pending document reminders.
          </p>
        </div>

        <button
          type="button"
          onClick={handleMarkAllRead}
          disabled={unreadCount === 0}
          className={`px-4 py-2 rounded-xl font-semibold text-xs transition flex items-center gap-1.5 shadow-xs shrink-0 self-start sm:self-center ${
            unreadCount > 0
              ? "bg-white text-[#185A4D] hover:bg-[#F0F5F7] cursor-pointer"
              : "bg-white/40 text-white/70 cursor-not-allowed"
          }`}
        >
          <span className="material-symbols-outlined text-base">check</span>
          <span>Mark All as Read ({unreadCount})</span>
        </button>
      </div>

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (8 cols): Notification list */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-5">
          {/* Filter Tabs */}
          <div className="flex items-center gap-6 border-b border-[#577877]/15 overflow-x-auto text-xs sm:text-sm">
            <button
              type="button"
              onClick={() => setActiveFilter("all")}
              className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap ${
                activeFilter === "all"
                  ? "text-[#25836F] border-b-2 border-[#25836F]"
                  : "text-[#577877] hover:text-[#162623]"
              }`}
            >
              All Alerts ({notifications.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("unread")}
              className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeFilter === "unread"
                  ? "text-[#25836F] border-b-2 border-[#25836F]"
                  : "text-[#577877] hover:text-[#162623]"
              }`}
            >
              <span>Unread</span>
              <span
                className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                  activeFilter === "unread"
                    ? "bg-[#25836F] text-white"
                    : "bg-[#E5E7EB] text-[#577877]"
                }`}
              >
                {unreadCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("claims")}
              className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeFilter === "claims"
                  ? "text-[#25836F] border-b-2 border-[#25836F]"
                  : "text-[#577877] hover:text-[#162623]"
              }`}
            >
              <span className="material-symbols-outlined text-base">fact_check</span>
              <span>Insurance Claims</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveFilter("reminders")}
              className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                activeFilter === "reminders"
                  ? "text-[#25836F] border-b-2 border-[#25836F]"
                  : "text-[#577877] hover:text-[#162623]"
              }`}
            >
              <span className="material-symbols-outlined text-base">hourglass_top</span>
              <span>Reminders &amp; Expiry</span>
            </button>
          </div>

          {/* List Content */}
          {loading ? (
            <div className="py-12 text-center text-[#577877]">
              <span className="material-symbols-outlined animate-spin text-3xl text-[#25836F]">
                progress_activity
              </span>
              <p className="text-xs font-semibold mt-2">Loading alerts...</p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="py-12 text-center text-[#577877] space-y-2">
              <span className="material-symbols-outlined text-4xl text-[#577877]/40">
                notifications_off
              </span>
              <p className="text-sm font-semibold text-[#162623]">No alerts found</p>
              <p className="text-xs">No notifications matching this filter.</p>
            </div>
          ) : (
            <div className="space-y-3.5 pt-1">
              {filteredNotifications.map((item) => {
                const isUnread = !item.read_at && item.status !== "read";
                const icon = getEventIcon(item.event_type);
                const dtStr = item.created_at
                  ? new Date(item.created_at).toLocaleString("en-IN", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "Today";

                return (
                  <div
                    key={item.id}
                    onClick={() => handleMarkRead(item)}
                    className={`rounded-2xl p-4 sm:p-5 transition-all cursor-pointer ${
                      isUnread
                        ? "bg-[#EEF5FC] border border-[#BFDBFE]/60 shadow-2xs hover:border-[#2563EB]/40"
                        : "bg-white border border-[#577877]/12 hover:border-[#577877]/30"
                    }`}
                  >
                    <div className="flex items-start gap-3.5 sm:gap-4">
                      <div
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          isUnread
                            ? "bg-white text-[#2563EB] shadow-2xs"
                            : "bg-[#F0F5F7] text-[#577877]"
                        }`}
                      >
                        <span className="material-symbols-outlined text-lg sm:text-xl">
                          {icon}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-xs sm:text-sm font-bold text-[#162623] leading-snug">
                              {item.subject}
                            </h3>
                            {isUnread && (
                              <span className="w-2 h-2 rounded-full bg-[#2563EB] shrink-0" />
                            )}
                          </div>
                          <span className="text-[11px] text-[#577877] whitespace-nowrap shrink-0">
                            {dtStr}
                          </span>
                        </div>

                        <p className="text-xs text-[#577877] mt-1 leading-relaxed">
                          {item.body}
                        </p>

                        {/* Metadata & Actions */}
                        <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            {item.claim_reference && (
                              <span className="font-mono text-[11px] font-bold px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded-md border border-zinc-200">
                                {item.claim_reference}
                              </span>
                            )}

                            {item.email_delivery_status && (
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                  item.email_delivery_status === "sent"
                                    ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                    : item.email_delivery_status === "sandboxed"
                                    ? "bg-blue-50 text-blue-700 border border-blue-200"
                                    : "bg-rose-50 text-rose-700 border border-rose-200"
                                }`}
                              >
                                <span className="material-symbols-outlined text-[12px]">
                                  {item.email_delivery_status === "sent"
                                    ? "mail"
                                    : item.email_delivery_status === "sandboxed"
                                    ? "mark_email_read"
                                    : "error"}
                                </span>
                                <span className="capitalize">Email: {item.email_delivery_status}</span>
                              </span>
                            )}

                            {item.email_delivery_status === "failed" && (
                              <button
                                type="button"
                                onClick={(e) => handleRetryEmail(item, e)}
                                disabled={retryingId === item.id}
                                className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 underline cursor-pointer inline-flex items-center gap-1"
                              >
                                {retryingId === item.id ? "Retrying..." : "Retry Email"}
                              </button>
                            )}
                          </div>

                          {item.claim_id && (
                            <span className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] inline-flex items-center gap-1">
                              <span>Open in Claims →</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column (4 cols): Config & Manual Scanning */}
        <div className="lg:col-span-4 space-y-6">
          {/* Card 1: Configuration */}
          <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-xl text-[#25836F]">
                tune
              </span>
              <h2 className="text-base font-bold text-[#162623]">
                Reminder Preferences
              </h2>
            </div>

            <p className="text-xs text-[#577877] leading-relaxed">
              Configure alert frequency, deduplication cooldown windows, and threshold hours for clinic actions.
            </p>

            {configLoading ? (
              <p className="text-xs text-zinc-400">Loading settings...</p>
            ) : (
              <form onSubmit={handleSaveConfig} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Policy Expiry Reminder (Days Before)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="90"
                    value={config.policy_expiry_reminder_days}
                    onChange={(e) =>
                      setConfig({ ...config, policy_expiry_reminder_days: parseInt(e.target.value) || 30 })
                    }
                    className="w-full text-xs px-3 py-2 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#25836F]"
                  />
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Patients receive alerts when policies expire within this window.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Pending Claim Reminder (Hours Pending)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="168"
                    value={config.pending_claim_reminder_hours}
                    onChange={(e) =>
                      setConfig({ ...config, pending_claim_reminder_hours: parseInt(e.target.value) || 24 })
                    }
                    className="w-full text-xs px-3 py-2 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#25836F]"
                  />
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Alerts clinic admins if a claim stays in Pending Verification longer than this.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Deduplication Cooldown (Minutes)
                  </label>
                  <input
                    type="number"
                    min="5"
                    max="1440"
                    value={config.dedup_window_minutes}
                    onChange={(e) =>
                      setConfig({ ...config, dedup_window_minutes: parseInt(e.target.value) || 60 })
                    }
                    className="w-full text-xs px-3 py-2 border border-zinc-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-[#25836F]"
                  />
                  <p className="text-[10px] text-zinc-400 mt-0.5">
                    Prevents repetitive emails or duplicates within this cooldown period.
                  </p>
                </div>

                <div className="pt-2 border-t border-zinc-100 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-700">
                    <input
                      type="checkbox"
                      checked={config.in_app_enabled}
                      onChange={(e) => setConfig({ ...config, in_app_enabled: e.target.checked })}
                      className="rounded text-[#25836F] focus:ring-[#25836F]"
                    />
                    <span>In-App Notifications Enabled</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-zinc-700">
                    <input
                      type="checkbox"
                      checked={config.email_enabled}
                      onChange={(e) => setConfig({ ...config, email_enabled: e.target.checked })}
                      className="rounded text-[#25836F] focus:ring-[#25836F]"
                    />
                    <span>Email Delivery Enabled (Brevo)</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={configSaving}
                  className="w-full mt-2 py-2.5 rounded-xl bg-[#185A4D] hover:bg-[#13493E] text-white text-xs font-bold transition shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-base">save</span>
                  <span>{configSaving ? "Saving..." : "Save Preferences"}</span>
                </button>
              </form>
            )}
          </div>

          {/* Card 2: Manual Scanners */}
          <div className="rounded-2xl p-5 bg-[#E8F3F3] border border-[#25836F]/20 space-y-3 shadow-2xs">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-lg text-[#185A4D]">
                bolt
              </span>
              <h3 className="text-xs font-bold text-[#162623] uppercase tracking-wider">
                Automated Background Scanners
              </h3>
            </div>

            <p className="text-xs text-[#577877] leading-relaxed">
              Trigger background evaluation jobs on-demand to identify overdue tasks or expiring insurance policies across registered patients.
            </p>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={handleScanExpiringPolicies}
                disabled={scanningPolicies}
                className="w-full py-2 px-3 rounded-xl bg-white border border-[#25836F]/30 hover:bg-[#F0F5F7] text-[#185A4D] text-xs font-semibold transition cursor-pointer flex items-center justify-between"
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">health_and_safety</span>
                  <span>Scan Expiring Policies</span>
                </span>
                <span className="material-symbols-outlined text-sm">
                  {scanningPolicies ? "progress_activity" : "arrow_forward"}
                </span>
              </button>

              <button
                type="button"
                onClick={handleScanPendingClaims}
                disabled={scanningClaims}
                className="w-full py-2 px-3 rounded-xl bg-white border border-[#25836F]/30 hover:bg-[#F0F5F7] text-[#185A4D] text-xs font-semibold transition cursor-pointer flex items-center justify-between"
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base">hourglass_top</span>
                  <span>Scan Overdue Pending Claims</span>
                </span>
                <span className="material-symbols-outlined text-sm">
                  {scanningClaims ? "progress_activity" : "arrow_forward"}
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
