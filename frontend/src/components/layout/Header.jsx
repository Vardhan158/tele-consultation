import { useState, useEffect } from 'react';
import { notificationApi } from '../../lib/api';

export default function Header({ onOpenMobile, onSelectTab, onSignOut, activeTab = 'dashboard', patient }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const name = patient?.full_name || 'Patient';
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'P';

  useEffect(() => {
    notificationApi.list()
      .then((items) => {
        if (Array.isArray(items)) setUnreadCount(items.filter((n) => n.status !== 'read').length);
      })
      .catch(() => {});
  }, [activeTab]);
  const getBreadcrumbTitle = () => {
    switch (activeTab) {
      case 'dashboard':
        return 'Dashboard';
      case 'find-doctors':
        return 'Find doctors';
      case 'appointments':
        return 'My appointments';
      case 'medical-records':
        return 'Medical records';
      case 'prescriptions':
        return 'Prescriptions';
      case 'summaries':
        return 'Consultation summaries';
      case 'follow-up':
        return 'Follow-up care';

      case 'support':
        return 'Help & support';
      case 'payments':
        return 'Payments';
      case 'consent':
        return 'Consent management';
      case 'notifications':
        return 'Notifications';
      case 'settings':
        return 'Settings';
      case 'profile':
        return 'Your patient profile';
      default:
        return 'Dashboard';
    }
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-[#F0F5F7]/95 backdrop-blur-md border-b border-[#577877]/15 flex items-center justify-between px-4 sm:px-6 lg:px-8 font-sans">
      {/* Left: Breadcrumbs & Toggle */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobile}
          className="p-1.5 rounded-lg text-[#577877] hover:text-[#162623] hover:bg-white transition"
          aria-label="Toggle sidebar"
        >
          <span className="material-symbols-outlined text-xl">menu</span>
        </button>

        <div className="flex items-center gap-2 text-xs font-medium text-[#577877]">
          <span
            className="hover:text-[#162623] cursor-pointer"
            onClick={() => onSelectTab('dashboard')}
          >
            Patient portal
          </span>
          <span>/</span>
          <span className="font-semibold text-[#162623]">
            {getBreadcrumbTitle()}
          </span>
        </div>
      </div>

      {/* Right Header Elements matching the screenshot */}
      <div className="flex items-center gap-3 sm:gap-4 text-xs">
        {/* Private Workspace indicator */}
        <div className="hidden sm:flex items-center gap-1.5 text-[#577877] font-medium">
          <span className="material-symbols-outlined !text-[#577877] text-base">lock</span>
          <span>Private workspace</span>
        </div>

        {/* User Pill with EM Avatar and Emma M. ⌄ */}
        <button type="button" onClick={() => onSelectTab('notifications')} className="flex items-center gap-1.5 p-1.5 rounded-xl hover:bg-white transition" title="Notifications">
          <span className="material-symbols-outlined !text-[#577877] text-xl">notifications</span>
          <span className="px-2 py-0.5 rounded-full bg-[#E5EEF1] text-[#295255] font-bold text-[11px]">{unreadCount} new</span>
        </button>

        <div className="flex items-center gap-2 pl-2 border-l border-[#577877]/20">
          <button
            type="button"
            onClick={() => onSelectTab('profile')}
            className="flex items-center gap-2 p-1 rounded-xl hover:bg-white transition"
          >
            <div className="w-8 h-8 rounded-full bg-[#E5EEF1] text-[#295255] flex items-center justify-center font-bold text-xs">
              {initials}
            </div>
            <span className="font-semibold text-[#162623] hidden md:inline">
              {name}
            </span>
            <span className="material-symbols-outlined !text-[#577877] text-base">
              expand_more
            </span>
          </button>

          <button
            type="button"
            onClick={onSignOut}
            className="p-1.5 rounded-lg text-[#577877] hover:text-red-700 hover:bg-white transition"
            title="Sign out"
          >
            <span className="material-symbols-outlined text-base">logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
