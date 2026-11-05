const mainNavItems = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid_view' },
  { id: 'find-doctors', label: 'Find doctors', icon: 'person_search' },
  { id: 'appointments', label: 'My appointments', icon: 'calendar_month' },
  { id: 'medical-records', label: 'Medical records', icon: 'folder' },
  { id: 'prescriptions', label: 'Prescriptions', icon: 'medication' },
  { id: 'summaries', label: 'Consultation summaries', icon: 'description' },
  { id: 'follow-up', label: 'Follow-up care', icon: 'favorite' },
  { id: 'payments', label: 'Payments', icon: 'credit_card' },
  { id: 'consent', label: 'Consent management', icon: 'verified_user' },
];

const secondaryNavItems = [
  { id: 'notifications', label: 'Notifications', icon: 'notifications' },
  { id: 'settings', label: 'Settings', icon: 'tune' },
];

export default function Sidebar({ activeTab, onSelectTab, mobileOpen, onCloseMobile, patient }) {
  const isDoctor = patient?.role === 'doctor';
  const isAdmin = patient?.role === 'clinic_admin';
  const navigation = isAdmin ? [
    { id: 'clinic-admin', label: 'Clinic administrator', icon: 'admin_panel_settings' },
  ] : isDoctor ? [
    { id: 'doctor-dashboard', label: 'Dashboard', icon: 'grid_view' },
    { id: 'doctor-appointments', label: 'Appointments', icon: 'calendar_month' },
    { id: 'doctor-patients', label: 'Patients', icon: 'groups' },
    { id: 'doctor-availability', label: 'Availability', icon: 'schedule' },
    { id: 'doctor-settings', label: 'Settings', icon: 'tune' },
  ] : mainNavItems;
  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-[#162623]/60 backdrop-blur-xs z-40 lg:hidden"
          onClick={onCloseMobile}
        />
      )}

      <aside
        className={`fixed left-0 top-0 h-full w-72 bg-[#295255] text-white border-r border-[#162623]/30 z-50 flex flex-col justify-between shadow-xl transition-transform duration-300 lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col flex-1 overflow-y-auto px-4 py-5 relative z-10">
          {/* Logo & Brand matching brand palette */}
          <div className="flex items-center justify-between pb-6">
            <div
              className="flex items-center gap-3 cursor-pointer group"
              onClick={() => onSelectTab('dashboard')}
            >
              <div className="w-10 h-10 rounded-xl bg-[#F0F5F7] flex items-center justify-center text-[#295255] shadow-sm">
                <svg
                  className="w-6 h-6 text-[#295255]"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.2"
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
              </div>
              <div className="flex flex-col">
                <span className="font-headline-sm text-base text-white tracking-tight font-bold leading-tight">
                  Kaizentrix Care
                </span>
                <span className="text-[10px] text-[#F0F5F7]/80 tracking-widest uppercase font-semibold mt-0.5">
                  {isDoctor ? 'Doctor Portal' : 'Patient Portal'}
                </span>
              </div>
            </div>

            {/* Mobile close */}
            <button
              type="button"
              className="lg:hidden p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10"
              onClick={onCloseMobile}
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>

          {/* Patient Account Pill (hidden) */}
          {/*
          <button
            type="button"
            onClick={() => onSelectTab('profile')}
            className="w-full flex items-center justify-between p-2.5 rounded-xl border border-white/15 bg-white/10 hover:bg-white/15 transition mb-4 text-left group cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-[#F0F5F7] text-[#295255] flex items-center justify-center font-bold text-xs shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-white truncate leading-tight">
                  {name}
                </p>
                <p className="text-[11px] text-[#F0F5F7]/75 truncate leading-tight mt-0.5">
                  Patient{patient?.patient_id ? ` · ${patient.patient_id}` : ''}
                </p>
              </div>
            </div>
            <span className="material-symbols-outlined !text-[#F0F5F7]/75 text-base shrink-0 group-hover:text-white">
              unfold_more
            </span>
          </button>

          */}
          {/* Main Navigation Links */}
          <nav className="space-y-1">
            {navigation.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all text-xs font-medium cursor-pointer ${
                    isActive
                      ? 'bg-[#F0F5F7] text-[#295255] font-bold shadow-xs'
                      : 'text-[#F0F5F7]/85 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-[19px] ${
                      isActive ? '!text-[#295255]' : '!text-[#F0F5F7]/80'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Divider */}
          <div className="my-4 border-t border-white/15" />

          {/* Secondary Navigation */}
          <nav className="space-y-1">
            {secondaryNavItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onSelectTab(item.id);
                    if (onCloseMobile) onCloseMobile();
                  }}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all text-xs font-medium cursor-pointer ${
                    isActive
                      ? 'bg-[#F0F5F7] text-[#295255] font-bold shadow-xs'
                      : 'text-[#F0F5F7]/85 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`material-symbols-outlined text-[19px] ${
                        isActive ? '!text-[#295255]' : '!text-[#F0F5F7]/80'
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-white/20 text-[#F0F5F7] border border-white/10">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {!isDoctor && <div className="mt-6 p-4 rounded-2xl bg-white/10 border border-white/15 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-[#F0F5F7] flex items-center justify-center text-[#295255] shadow-2xs">
              <span className="material-symbols-outlined !text-[#295255] text-lg">
                volunteer_activism
              </span>
            </div>
            <div>
              <p className="text-xs font-bold text-white">A little help, anytime.</p>
              <p className="text-[11px] text-[#F0F5F7]/80 mt-0.5">Our care team is here for you.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                onSelectTab('support');
                if (onCloseMobile) onCloseMobile();
              }}
              className="text-xs font-bold text-[#F0F5F7] hover:text-white hover:underline flex items-center gap-1 pt-1 cursor-pointer"
            >
              Contact support →
            </button>
          </div>}
        </div>

        {/* Subtle decorative glow at bottom */}
        <div className="absolute -bottom-16 -right-16 w-64 h-64 rounded-full bg-[#577877]/20 blur-3xl pointer-events-none" />
      </aside>
    </>
  );
}
