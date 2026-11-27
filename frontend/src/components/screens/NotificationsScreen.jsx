import { useState, useEffect } from "react";
import { notificationApi } from "../../lib/api";

export default function NotificationsScreen({ onNavigate }) {
  const [notifications, setNotifications] = useState([]);
  const [activeFilter, setActiveFilter] = useState("all"); // 'all' | 'unread' | 'appointments' | 'care' | 'billing'
  const [showPreferencesModal, setShowPreferencesModal] = useState(false);
  const [preferences, setPreferences] = useState({
    emailSummary: true,
    smsAlerts: true,
    inPortalAlerts: true,
    appointments: true,
    labResults: true,
    prescriptions: true,
  });
  const [prefSaveSuccess, setPrefSaveSuccess] = useState(false);

  useEffect(() => {
    notificationApi
      .list()
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          setNotifications(
            items.map((n) => {
              const isUnread = !n.read_at && n.status !== "read";
              const isInsurance =
                n.target_tab === "my-insurance" ||
                n.claim_id ||
                n.policy_id ||
                n.event_type?.includes("insurance") ||
                n.event_type?.includes("claim") ||
                n.event_type?.includes("reimbursement") ||
                n.event_type?.includes("policy");

              const cat = isInsurance
                ? "insurance"
                : n.event_type?.includes("appointment")
                  ? "appointments"
                  : n.event_type?.includes("payment")
                    ? "billing"
                    : "care";

              let icon = "notifications";
              if (cat === "insurance") {
                if (n.event_type?.includes("reimbursement")) icon = "payments";
                else if (n.event_type?.includes("approved")) icon = "verified";
                else if (n.event_type?.includes("correction") || n.event_type?.includes("additional_docs")) icon = "rule";
                else if (n.event_type?.includes("policy")) icon = "health_and_safety";
                else icon = "receipt_long";
              } else if (cat === "appointments") {
                icon = "calendar_month";
              } else if (cat === "billing") {
                icon = "credit_card";
              } else {
                icon = n.event_type?.includes("lab")
                  ? "science"
                  : n.event_type?.includes("prescription")
                    ? "medication"
                    : "favorite";
              }

              const targetTab = isInsurance
                ? "my-insurance"
                : cat === "appointments"
                  ? "appointments"
                  : cat === "billing"
                    ? "payments"
                    : n.event_type?.includes("lab")
                      ? "medical-records"
                      : n.event_type?.includes("prescription")
                        ? "prescriptions"
                        : "follow-up";

              const targetParams = isInsurance
                ? { claimId: n.claim_id, policyId: n.policy_id, tab: n.policy_id ? "policies" : "claims" }
                : null;

              const linkText = isInsurance
                ? (n.claim_id ? "View Claim Details →" : "View Insurance Policy →")
                : `View ${cat} →`;

              return {
                id: n.id,
                category: cat,
                isUnread,
                icon,
                title: n.subject || "Care notification",
                timestamp: n.created_at
                  ? new Date(n.created_at).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })
                  : "Today",
                message: n.body,
                linkText,
                targetTab,
                targetParams,
                emailDeliveryStatus: n.email_delivery_status,
              };
            }),
          );
        }
      })
      .catch(() => {});
  }, []);

  const unreadCount = notifications.filter((n) => n.isUnread).length;

  const handleMarkAllAsRead = async () => {
    try {
      await notificationApi.markAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isUnread: false })));
      window.dispatchEvent(new Event("notifications_updated"));
    } catch {
      notifications.forEach((n) => {
        if (n.isUnread) notificationApi.markRead(n.id).catch(() => {});
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isUnread: false })));
      window.dispatchEvent(new Event("notifications_updated"));
    }
  };

  const handleNotificationClick = (item) => {
    if (item.isUnread) {
      notificationApi.markRead(item.id).catch(() => {});
      setNotifications((prev) =>
        prev.map((n) => (n.id === item.id ? { ...n, isUnread: false } : n)),
      );
      window.dispatchEvent(new Event("notifications_updated"));
    }
    if (onNavigate && item.targetTab) {
      onNavigate(item.targetTab, item.targetParams);
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeFilter === "unread") return n.isUnread;
    if (activeFilter === "appointments") return n.category === "appointments";
    if (activeFilter === "care") return n.category === "care";
    if (activeFilter === "billing") return n.category === "billing";
    if (activeFilter === "insurance") return n.category === "insurance";
    return true;
  });

  return (
    <div className="w-full space-y-6 font-sans text-[#162623]">
      {/* Compact Heading Banner matching Portal Brand System */}
      <div className="rounded-2xl bg-gradient-to-r from-[#25836F] via-[#1F6E5E] to-[#185A4D] text-white px-6 py-5 sm:px-8 sm:py-6 shadow-sm border border-[#185A4D]/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase text-[#F0F5F7]/85">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A3E2D4]" />
            Care Alerts &amp; Portal Updates
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Notifications
          </h1>
          <p className="text-xs sm:text-sm text-[#F0F5F7]/90 max-w-2xl leading-relaxed">
            Stay updated with appointment confirmations, clinical notes, prescriptions, and billing receipts.
          </p>
        </div>

        <button
          type="button"
          onClick={handleMarkAllAsRead}
          disabled={unreadCount === 0}
          className={`px-4 py-2 rounded-xl font-semibold text-xs transition flex items-center gap-1.5 shadow-xs shrink-0 self-start sm:self-center ${
            unreadCount > 0
              ? "bg-white text-[#185A4D] hover:bg-[#F0F5F7] cursor-pointer"
              : "bg-white/40 text-white/70 cursor-not-allowed"
          }`}
        >
          <span className="material-symbols-outlined text-base">check</span>
          <span>Mark All as Read</span>
        </button>
      </div>

        {/* Main 2-Column Layout matching Screenshot */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (8 cols): Tabs & Notification Items */}
          <div className="lg:col-span-8 bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-5">
            {/* Filter Tabs matching Screenshot */}
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
                All updates
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
                onClick={() => setActiveFilter("appointments")}
                className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap ${
                  activeFilter === "appointments"
                    ? "text-[#25836F] border-b-2 border-[#25836F]"
                    : "text-[#577877] hover:text-[#162623]"
                }`}
              >
                Appointments
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("care")}
                className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap ${
                  activeFilter === "care"
                    ? "text-[#25836F] border-b-2 border-[#25836F]"
                    : "text-[#577877] hover:text-[#162623]"
                }`}
              >
                Care
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("billing")}
                className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap ${
                  activeFilter === "billing"
                    ? "text-[#25836F] border-b-2 border-[#25836F]"
                    : "text-[#577877] hover:text-[#162623]"
                }`}
              >
                Billing
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter("insurance")}
                className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeFilter === "insurance"
                    ? "text-[#25836F] border-b-2 border-[#25836F]"
                    : "text-[#577877] hover:text-[#162623]"
                }`}
              >
                <span className="material-symbols-outlined text-base">health_and_safety</span>
                <span>Insurance &amp; Claims</span>
              </button>
            </div>

            {/* Notification items list matching Screenshot */}
            <div className="space-y-3.5 pt-1">
              {filteredNotifications.length === 0 ? (
                <div className="py-12 text-center text-[#577877] space-y-2">
                  <span className="material-symbols-outlined text-4xl text-[#577877]/40">
                    notifications_off
                  </span>
                  <p className="text-sm font-semibold text-[#162623]">
                    No notifications found
                  </p>
                  <p className="text-xs">
                    You have no items in this filter category.
                  </p>
                </div>
              ) : (
                filteredNotifications.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-2xl p-4 sm:p-5 transition-all ${
                      item.isUnread
                        ? "bg-[#EEF5FC] border border-[#BFDBFE]/50 shadow-2xs"
                        : "bg-white border border-[#577877]/12 hover:border-[#577877]/30"
                    }`}
                  >
                    <div className="flex items-start gap-3.5 sm:gap-4">
                      {/* Left icon in circle matching screenshot */}
                      <div
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          item.isUnread
                            ? "bg-white text-[#2563EB] shadow-2xs"
                            : "bg-[#F0F5F7] text-[#577877]"
                        }`}
                      >
                        <span className="material-symbols-outlined text-lg sm:text-xl">
                          {item.icon}
                        </span>
                      </div>

                      {/* Content block */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-xs sm:text-sm font-bold text-[#162623] leading-snug">
                            {item.title}
                          </h3>
                          <span className="text-[11px] text-[#577877] whitespace-nowrap shrink-0">
                            {item.timestamp}
                          </span>
                        </div>

                        <p className="text-xs text-[#577877] mt-1 leading-relaxed">
                          {item.message}
                        </p>

                        {/* Action link & Email Status */}
                        <div className="mt-2.5 flex items-center justify-between gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => handleNotificationClick(item)}
                            className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] hover:underline cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>{item.linkText}</span>
                          </button>

                          {item.emailDeliveryStatus && (
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                                item.emailDeliveryStatus === "sent"
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : item.emailDeliveryStatus === "sandboxed"
                                  ? "bg-blue-50 text-blue-700 border border-blue-200"
                                  : "bg-rose-50 text-rose-700 border border-rose-200"
                              }`}
                            >
                              <span className="material-symbols-outlined text-[12px]">
                                {item.emailDeliveryStatus === "sent" ? "mail" : item.emailDeliveryStatus === "sandboxed" ? "mark_email_read" : "error"}
                              </span>
                              <span className="capitalize">Email: {item.emailDeliveryStatus}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column (4 cols): Updates your way & Keep details current */}
          <div className="lg:col-span-4 space-y-6">
            {/* CARD 1: Updates, your way matching Screenshot */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-4">
              <h2 className="text-base font-bold text-[#162623]">
                Updates, your way
              </h2>

              <div>
                <span className="bg-[#EFF6FF] text-[#2563EB] text-xs font-semibold px-3 py-1 rounded-full inline-block">
                  {unreadCount} unread update{unreadCount === 1 ? "" : "s"}
                </span>
              </div>

              <p className="text-xs sm:text-sm text-[#577877] leading-relaxed">
                Choose which reminders arrive by email, SMS, or in your portal.
              </p>

              <button
                type="button"
                onClick={() => setShowPreferencesModal(true)}
                className="w-full border border-[#577877]/30 bg-white text-[#162623] hover:bg-[#F0F5F7] font-semibold text-xs sm:text-sm py-2.5 rounded-xl transition cursor-pointer shadow-2xs"
              >
                Manage preferences
              </button>
            </div>

            {/* CARD 2: Keep your details current matching Screenshot */}
            <div className="rounded-2xl p-5 bg-[#E8F3F3] border border-[#25836F]/20 flex items-start gap-3.5 shadow-2xs">
              <span className="material-symbols-outlined !text-[#25836F] text-lg shrink-0 mt-0.5">
                info
              </span>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#162623]">
                  Keep your details current
                </h3>
                <p className="text-xs text-[#577877] mt-1 leading-relaxed">
                  Make sure your email and mobile number are correct so
                  appointment reminders can reach you.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate("profile")}
                  className="mt-2 text-xs font-semibold text-[#25836F] hover:underline cursor-pointer inline-flex items-center gap-1"
                >
                  <span>Review profile & contacts →</span>
                </button>
              </div>
            </div>
          </div>
        </div>

      {/* Preferences Modal */}
      {showPreferencesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl border border-[#577877]/20 shadow-xl p-6 space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#25836F]/10 flex items-center justify-center text-[#25836F]">
                  <span className="material-symbols-outlined text-lg">
                    tune
                  </span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#162623]">
                    Notification preferences
                  </h3>
                  <p className="text-xs text-[#577877]">
                    Choose how and when we reach you
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPreferencesModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#577877] hover:bg-[#F0F5F7] transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {prefSaveSuccess && (
              <div className="p-3 bg-[#E6F4EA] border border-[#137333]/20 rounded-xl text-xs text-[#137333] font-medium flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">
                  check_circle
                </span>
                <span>Preferences updated successfully!</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-[#162623]">
                    Email summaries & confirmations
                  </h4>
                  <p className="text-[#577877]">
                    Receive receipts, appointment confirmations, and summaries
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.emailSummary}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      emailSummary: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-[#25836F] rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-[#162623]">
                    SMS text reminders
                  </h4>
                  <p className="text-[#577877]">
                    Day-before and 15-minute video appointment links
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.smsAlerts}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      smsAlerts: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-[#25836F] rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-[#162623]">
                    In-portal activity feed
                  </h4>
                  <p className="text-[#577877]">
                    Keep updates active in your portal notification hub
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.inPortalAlerts}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      inPortalAlerts: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-[#25836F] rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-[#162623]">
                    Lab result alerts
                  </h4>
                  <p className="text-[#577877]">
                    Notify immediately when doctor posts metabolic or blood
                    panels
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.labResults}
                  onChange={(e) =>
                    setPreferences({
                      ...preferences,
                      labResults: e.target.checked,
                    })
                  }
                  className="w-4 h-4 accent-[#25836F] rounded cursor-pointer"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[#577877]/15 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPreferencesModal(false)}
                className="px-4 py-2 border border-[#577877]/30 rounded-xl text-xs font-semibold text-[#162623] hover:bg-[#F0F5F7] transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setPrefSaveSuccess(true);
                  setTimeout(() => {
                    setPrefSaveSuccess(false);
                    setShowPreferencesModal(false);
                  }, 1200);
                }}
                className="btn-primary !px-5 !py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Save preferences
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
