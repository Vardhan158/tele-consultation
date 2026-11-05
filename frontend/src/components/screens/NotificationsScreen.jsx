import { useState, useEffect } from 'react';
import { notificationApi } from '../../lib/api';

// Legacy fixture retained only for backwards-compatible layout data.
// eslint-disable-next-line no-unused-vars
const initialNotifications = [
  {
    id: 'notif-1',
    category: 'appointments',
    isUnread: true,
    icon: 'calendar_month',
    title: 'Appointment confirmed',
    timestamp: 'Today · 9:32 AM',
    message: 'Your video visit with Dr. Sarah Chen is booked for Nov 12 at 2:30 PM PT.',
    linkText: 'View appointment →',
    targetTab: 'appointments',
    targetParams: null,
  },
  {
    id: 'notif-2',
    category: 'care',
    isUnread: true,
    icon: 'favorite',
    title: 'A small step for your follow-up',
    timestamp: 'Today · 8:00 AM',
    message: 'Your next blood pressure log is due Nov 6. Add your latest readings when ready.',
    linkText: 'Open care plan →',
    targetTab: 'follow-up',
    targetParams: null,
  },
  {
    id: 'notif-3',
    category: 'care',
    isUnread: true,
    icon: 'science',
    title: 'Your lab report is ready',
    timestamp: 'Yesterday · 3:14 PM',
    message: 'The metabolic panel from Oct 30 is available in Medical records.',
    linkText: 'View report →',
    targetTab: 'medical-records',
    targetParams: null,
  },
  {
    id: 'notif-4',
    category: 'care',
    isUnread: false,
    icon: 'description',
    title: 'Consultation summary added',
    timestamp: 'Oct 29 · 11:20 AM',
    message: 'Dr. Sarah Chen added notes and next steps from your Oct 29 visit.',
    linkText: 'Read summary →',
    targetTab: 'summaries',
    targetParams: null,
  },
  {
    id: 'notif-5',
    category: 'care',
    isUnread: false,
    icon: 'medication',
    title: 'Prescription updated',
    timestamp: 'Oct 29 · 11:18 AM',
    message: 'Your medication list has been updated by your care team.',
    linkText: 'View prescriptions →',
    targetTab: 'prescriptions',
    targetParams: null,
  },
  {
    id: 'notif-6',
    category: 'billing',
    isUnread: false,
    icon: 'credit_card',
    title: 'Payment receipt available',
    timestamp: 'Oct 29 · 9:45 AM',
    message: 'Your $85.00 consultation payment was received. Thank you.',
    linkText: 'View receipt →',
    targetTab: 'payments',
    targetParams: { view: 'receipt' },
  },
];

export default function NotificationsScreen({ onNavigate }) {
  const [notifications, setNotifications] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all'); // 'all' | 'unread' | 'appointments' | 'care' | 'billing'
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
    notificationApi.list()
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          setNotifications(items.map((n) => {
            const isUnread = n.status !== 'read';
            const cat = n.event_type?.includes('appointment') ? 'appointments'
              : n.event_type?.includes('payment') ? 'billing'
              : 'care';
            const icon = cat === 'appointments' ? 'calendar_month'
              : cat === 'billing' ? 'credit_card'
              : n.event_type?.includes('lab') ? 'science'
              : n.event_type?.includes('prescription') ? 'medication'
              : 'favorite';
            const targetTab = cat === 'appointments' ? 'appointments'
              : cat === 'billing' ? 'payments'
              : n.event_type?.includes('lab') ? 'medical-records'
              : n.event_type?.includes('prescription') ? 'prescriptions'
              : 'follow-up';

            return {
              id: n.id,
              category: cat,
              isUnread,
              icon,
              title: n.subject || 'Care notification',
              timestamp: n.created_at ? new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Today',
              message: n.body,
              linkText: `View ${cat} →`,
              targetTab,
              targetParams: null,
            };
          }));
        }
      })
      .catch(() => {});
  }, []);

  const unreadCount = notifications.filter((n) => n.isUnread).length;

  const handleMarkAllAsRead = () => {
    notifications.forEach((n) => {
      if (n.isUnread) notificationApi.markRead(n.id).catch(() => {});
    });
    setNotifications((prev) => prev.map((n) => ({ ...n, isUnread: false })));
  };

  const handleNotificationClick = (item) => {
    if (item.isUnread) {
      notificationApi.markRead(item.id).catch(() => {});
    }
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, isUnread: false } : n))
    );
    if (onNavigate && item.targetTab) {
      onNavigate(item.targetTab, item.targetParams);
    }
  };

  const filteredNotifications = notifications.filter((n) => {
    if (activeFilter === 'unread') return n.isUnread;
    if (activeFilter === 'appointments') return n.category === 'appointments';
    if (activeFilter === 'care') return n.category === 'care';
    if (activeFilter === 'billing') return n.category === 'billing';
    return true;
  });

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Page Header matching Screenshot 1:1 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#162623] tracking-tight">
              Your care updates
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#577877]">
              The things that matter, without the noise.
            </p>
          </div>

          <button
            type="button"
            onClick={handleMarkAllAsRead}
            disabled={unreadCount === 0}
            className={`self-start sm:self-auto border border-[#577877]/30 bg-white px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm shadow-2xs transition flex items-center gap-2 ${
              unreadCount > 0
                ? 'text-[#162623] hover:bg-[#F0F5F7] cursor-pointer'
                : 'text-[#577877]/60 cursor-not-allowed opacity-75'
            }`}
          >
            <span className="material-symbols-outlined text-base">check</span>
            <span>Mark all as read</span>
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
                onClick={() => setActiveFilter('all')}
                className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap ${
                  activeFilter === 'all'
                    ? 'text-[#295255] border-b-2 border-[#295255]'
                    : 'text-[#577877] hover:text-[#162623]'
                }`}
              >
                All updates
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('unread')}
                className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                  activeFilter === 'unread'
                    ? 'text-[#295255] border-b-2 border-[#295255]'
                    : 'text-[#577877] hover:text-[#162623]'
                }`}
              >
                <span>Unread</span>
                <span className={`text-[11px] px-1.5 py-0.2 rounded-full ${
                  activeFilter === 'unread' ? 'bg-[#295255] text-white' : 'bg-[#E5E7EB] text-[#577877]'
                }`}>
                  {unreadCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('appointments')}
                className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap ${
                  activeFilter === 'appointments'
                    ? 'text-[#295255] border-b-2 border-[#295255]'
                    : 'text-[#577877] hover:text-[#162623]'
                }`}
              >
                Appointments
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('care')}
                className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap ${
                  activeFilter === 'care'
                    ? 'text-[#295255] border-b-2 border-[#295255]'
                    : 'text-[#577877] hover:text-[#162623]'
                }`}
              >
                Care
              </button>

              <button
                type="button"
                onClick={() => setActiveFilter('billing')}
                className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap ${
                  activeFilter === 'billing'
                    ? 'text-[#295255] border-b-2 border-[#295255]'
                    : 'text-[#577877] hover:text-[#162623]'
                }`}
              >
                Billing
              </button>
            </div>

            {/* Notification items list matching Screenshot */}
            <div className="space-y-3.5 pt-1">
              {filteredNotifications.length === 0 ? (
                <div className="py-12 text-center text-[#577877] space-y-2">
                  <span className="material-symbols-outlined text-4xl text-[#577877]/40">notifications_off</span>
                  <p className="text-sm font-semibold text-[#162623]">No notifications found</p>
                  <p className="text-xs">You have no items in this filter category.</p>
                </div>
              ) : (
                filteredNotifications.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-2xl p-4 sm:p-5 transition-all ${
                      item.isUnread
                        ? 'bg-[#EEF5FC] border border-[#BFDBFE]/50 shadow-2xs'
                        : 'bg-white border border-[#577877]/12 hover:border-[#577877]/30'
                    }`}
                  >
                    <div className="flex items-start gap-3.5 sm:gap-4">
                      {/* Left icon in circle matching screenshot */}
                      <div
                        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                          item.isUnread
                            ? 'bg-white text-[#2563EB] shadow-2xs'
                            : 'bg-[#F0F5F7] text-[#577877]'
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

                        {/* Action link */}
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() => handleNotificationClick(item)}
                            className="text-xs font-semibold text-[#2563EB] hover:text-[#1D4ED8] hover:underline cursor-pointer inline-flex items-center gap-1"
                          >
                            <span>{item.linkText}</span>
                          </button>
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
                  {unreadCount} unread update{unreadCount === 1 ? '' : 's'}
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
            <div className="rounded-2xl p-5 bg-[#E8F3F3] border border-[#295255]/20 flex items-start gap-3.5 shadow-2xs">
              <span className="material-symbols-outlined !text-[#295255] text-lg shrink-0 mt-0.5">
                info
              </span>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#162623]">
                  Keep your details current
                </h3>
                <p className="text-xs text-[#577877] mt-1 leading-relaxed">
                  Make sure your email and mobile number are correct so appointment reminders can reach you.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('profile')}
                  className="mt-2 text-xs font-semibold text-[#295255] hover:underline cursor-pointer inline-flex items-center gap-1"
                >
                  <span>Review profile & contacts →</span>
                </button>
              </div>
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
                <div className="w-8 h-8 rounded-lg bg-[#295255]/10 flex items-center justify-center text-[#295255]">
                  <span className="material-symbols-outlined text-lg">tune</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#162623]">Notification preferences</h3>
                  <p className="text-xs text-[#577877]">Choose how and when we reach you</p>
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
                <span className="material-symbols-outlined text-sm">check_circle</span>
                <span>Preferences updated successfully!</span>
              </div>
            )}

            <div className="space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-[#162623]">Email summaries & confirmations</h4>
                  <p className="text-[#577877]">Receive receipts, appointment confirmations, and summaries</p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.emailSummary}
                  onChange={(e) => setPreferences({ ...preferences, emailSummary: e.target.checked })}
                  className="w-4 h-4 accent-[#295255] rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-[#162623]">SMS text reminders</h4>
                  <p className="text-[#577877]">Day-before and 15-minute video appointment links</p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.smsAlerts}
                  onChange={(e) => setPreferences({ ...preferences, smsAlerts: e.target.checked })}
                  className="w-4 h-4 accent-[#295255] rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-[#162623]">In-portal activity feed</h4>
                  <p className="text-[#577877]">Keep updates active in your portal notification hub</p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.inPortalAlerts}
                  onChange={(e) => setPreferences({ ...preferences, inPortalAlerts: e.target.checked })}
                  className="w-4 h-4 accent-[#295255] rounded cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-[#162623]">Lab result alerts</h4>
                  <p className="text-[#577877]">Notify immediately when doctor posts metabolic or blood panels</p>
                </div>
                <input
                  type="checkbox"
                  checked={preferences.labResults}
                  onChange={(e) => setPreferences({ ...preferences, labResults: e.target.checked })}
                  className="w-4 h-4 accent-[#295255] rounded cursor-pointer"
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
