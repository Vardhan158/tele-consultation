const mainNavItems = [
  { id: "dashboard", label: "Dashboard", icon: "grid_view" },
  { id: "find-doctors", label: "Find doctors", icon: "person_search" },
  { id: "appointments", label: "My appointments", icon: "calendar_month" },
  { id: "medical-records", label: "Medical records", icon: "folder" },
  { id: "prescriptions", label: "Prescriptions", icon: "medication" },
  { id: "summaries", label: "Consultation summaries", icon: "description" },
  { id: "follow-up", label: "Follow-up care", icon: "favorite" },
  { id: "payments", label: "Payments", icon: "credit_card" },
  { id: "consent", label: "Consent management", icon: "verified_user" },
];

const roleNavigation = {
  patient: [
    { id: "dashboard", label: "Dashboard", icon: "grid_view" },
    ...mainNavItems.slice(1),
  ],
  doctor: [
    { id: "doctor-dashboard", label: "Dashboard", icon: "grid_view" },
    { id: "doctor-appointments", label: "Appointments", icon: "calendar_month" },
    { id: "doctor-patients", label: "Patients", icon: "groups" },
    { id: "doctor-availability", label: "Availability", icon: "schedule" },
    { id: "doctor-settings", label: "Settings", icon: "tune" },
  ],
  clinic_admin: [
    { id: "clinic-overview", label: "Overview", icon: "dashboard" },
    { id: "clinic-doctors", label: "Doctors", icon: "badge" },
    { id: "clinic-services", label: "Services & fees", icon: "medical_services" },
    { id: "clinic-schedules", label: "Schedules", icon: "schedule" },
    { id: "clinic-appointments", label: "Appointments", icon: "calendar_month" },
    { id: "clinic-payments", label: "Payments", icon: "payments" },
    { id: "clinic-reports", label: "Reports", icon: "analytics" },
    { id: "clinic-settings", label: "Clinic settings", icon: "settings" },
  ],
};

const secondaryNavItems = [
  { id: "notifications", label: "Notifications", icon: "notifications" },
  { id: "settings", label: "Settings", icon: "tune" },
];

export default function Sidebar({
  activeTab,
  onSelectTab,
  mobileOpen,
  onCloseMobile,
  patient,
  collapsed = false,
  onToggleCollapse,
}) {
  const role = patient?.role === "doctor" || patient?.role === "clinic_admin" ? patient.role : "patient";
  const isDoctor = role === "doctor";
  const isAdmin = role === "clinic_admin";
  const navigation = roleNavigation[role];

  const renderContent = (isColl) => (
    <div className={`flex flex-col flex-1 overflow-y-auto overflow-x-hidden ${isColl ? "px-2.5 py-5" : "px-4 py-5"} relative z-10 select-none`}>
      {/* Logo & Brand matching brand palette */}
      {isColl ? (
        <div className="flex flex-col items-center gap-3 pb-5">
          <div
            className="w-10 h-10 rounded-xl bg-[#F0F5F7] flex items-center justify-center text-[#25836F] shadow-sm cursor-pointer hover:scale-105 transition shrink-0"
            onClick={() => onSelectTab(isAdmin ? "clinic-overview" : isDoctor ? "doctor-dashboard" : "dashboard")}
            title="Kaizen Care - Go to dashboard"
          >
            <svg
              className="w-6 h-6 text-[#25836F]"
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
          <button
            type="button"
            onClick={onToggleCollapse}
            className="hidden lg:flex p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Expand sidebar"
            aria-label="Expand sidebar"
          >
            <span className="material-symbols-outlined text-xl">keyboard_double_arrow_right</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between pb-6">
          <div
            className="flex items-center gap-3 cursor-pointer group min-w-0"
            onClick={() => onSelectTab(isAdmin ? "clinic-overview" : isDoctor ? "doctor-dashboard" : "dashboard")}
          >
            <div className="w-10 h-10 rounded-xl bg-[#F0F5F7] flex items-center justify-center text-[#25836F] shadow-sm shrink-0">
              <svg
                className="w-6 h-6 text-[#25836F]"
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
            <div className="flex flex-col min-w-0">
              <span className="font-headline-sm text-base text-white tracking-tight font-bold leading-tight truncate">
                Kaizen Care
              </span>
              <span className="text-[10px] text-[#F0F5F7]/80 tracking-widest uppercase font-semibold mt-0.5 truncate">
                {isAdmin ? "Clinic Admin Workspace" : isDoctor ? "Doctor Portal" : "Patient Portal"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {/* Desktop collapse button */}
            <button
              type="button"
              onClick={onToggleCollapse}
              className="hidden lg:flex p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <span className="material-symbols-outlined text-xl">keyboard_double_arrow_left</span>
            </button>

            {/* Mobile close */}
            <button
              type="button"
              className="lg:hidden p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
              onClick={onCloseMobile}
              aria-label="Close menu"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Navigation Links */}
      <nav aria-label={`${role.replace("_", " ")} navigation`} className="space-y-1">
        {navigation.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              title={isColl ? item.label : undefined}
              onClick={() => {
                onSelectTab(item.id);
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center ${
                isColl ? "justify-center p-2.5" : "gap-3 px-3 py-2.5 text-left"
              } rounded-xl transition-all text-xs font-medium cursor-pointer relative group ${
                isActive
                  ? "bg-[#F0F5F7] text-[#25836F] font-bold shadow-xs"
                  : "text-[#F0F5F7]/85 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span
                className={`material-symbols-outlined ${isColl ? "text-[22px]" : "text-[19px]"} shrink-0 ${
                  isActive ? "!text-[#25836F]" : "!text-[#F0F5F7]/80"
                }`}
              >
                {item.icon}
              </span>
              {!isColl && <span className="truncate">{item.label}</span>}
              {isColl && (
                <div className="absolute left-full ml-3 px-2.5 py-1 bg-[#162623] text-white text-xs font-medium rounded-lg shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                  {item.label}
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="my-4 border-t border-white/15" />

      {/* Secondary Navigation */}
      {!isAdmin && (
        <nav aria-label="Account navigation" className="space-y-1">
          {secondaryNavItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                title={isColl ? item.label : undefined}
                onClick={() => {
                  onSelectTab(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={`w-full flex items-center ${
                  isColl ? "justify-center p-2.5" : "justify-between px-3 py-2 text-left"
                } rounded-xl transition-all text-xs font-medium cursor-pointer relative group ${
                  isActive
                    ? "bg-[#F0F5F7] text-[#25836F] font-bold shadow-xs"
                    : "text-[#F0F5F7]/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <div className={`flex items-center ${isColl ? "justify-center" : "gap-3"}`}>
                  <span
                    className={`material-symbols-outlined ${isColl ? "text-[22px]" : "text-[19px]"} shrink-0 ${
                      isActive ? "!text-[#25836F]" : "!text-[#F0F5F7]/80"
                    }`}
                  >
                    {item.icon}
                  </span>
                  {!isColl && <span>{item.label}</span>}
                </div>
                {isColl && (
                  <div className="absolute left-full ml-3 px-2.5 py-1 bg-[#162623] text-white text-xs font-medium rounded-lg shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
                    {item.label}
                  </div>
                )}
              </button>
            );
          })}
        </nav>
      )}

      {/* Bottom Support section */}
      {!isDoctor && !isAdmin && (
        isColl ? (
          <button
            type="button"
            onClick={() => {
              onSelectTab("support");
              if (onCloseMobile) onCloseMobile();
            }}
            className="mt-6 p-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition cursor-pointer relative group shrink-0"
            title="Contact support"
            aria-label="Contact support"
          >
            <span className="material-symbols-outlined text-[20px]">
              volunteer_activism
            </span>
            <div className="absolute left-full ml-3 px-2.5 py-1 bg-[#162623] text-white text-xs font-medium rounded-lg shadow-xl whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50">
              Support
            </div>
          </button>
        ) : (
          <div className="mt-6 p-4 rounded-2xl bg-white/10 border border-white/15 space-y-2">
            <div className="w-8 h-8 rounded-lg bg-[#F0F5F7] flex items-center justify-center text-[#25836F] shadow-2xs">
              <span className="material-symbols-outlined !text-[#25836F] text-lg">
                volunteer_activism
              </span>
            </div>
            <div>
              <p className="text-xs font-bold text-white">
                A little help, anytime.
              </p>
              <p className="text-[11px] text-[#F0F5F7]/80 mt-0.5">
                Our care team is here for you.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onSelectTab("support");
                if (onCloseMobile) onCloseMobile();
              }}
              className="text-xs font-bold text-[#F0F5F7] hover:text-white hover:underline flex items-center gap-1 pt-1 cursor-pointer"
            >
              Contact support →
            </button>
          </div>
        )
      )}
    </div>
  );

  return (
    <>
      {/* Mobile Drawer (Always full width for ease of tapping) */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-[#162623]/60 backdrop-blur-xs z-50 lg:hidden"
          onClick={onCloseMobile}
        >
          <aside
            className="fixed left-0 top-0 h-full w-72 bg-[#25836F] text-white border-r border-[#162623]/30 flex flex-col justify-between shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {renderContent(false)}
          </aside>
        </div>
      )}

      {/* Desktop Persistent Flex Sidebar (Collapsible) */}
      <aside
        className={`hidden lg:flex ${
          collapsed ? "lg:w-20" : "lg:w-72"
        } lg:shrink-0 lg:sticky lg:top-0 lg:h-screen lg:z-30 bg-[#25836F] text-white border-r border-[#162623]/30 flex-col justify-between shadow-xl transition-[width] duration-300 ease-in-out`}
      >
        {renderContent(collapsed)}
      </aside>
    </>
  );
}
