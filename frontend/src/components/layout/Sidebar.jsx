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
}) {
  const role = patient?.role === "doctor" || patient?.role === "clinic_admin" ? patient.role : "patient";
  const isDoctor = role === "doctor";
  const isAdmin = role === "clinic_admin";
  const navigation = roleNavigation[role];

  const sidebarContent = (
    <div
      className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden no-scrollbar px-4 py-5 relative z-10 select-none"
      style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
    >
      {/* Logo & Brand matching brand palette */}
      <div className="flex items-center justify-between pb-6">
        <div
          className="flex items-center gap-3 cursor-pointer group min-w-0"
          onClick={() => onSelectTab(isAdmin ? "clinic-overview" : isDoctor ? "doctor-dashboard" : "dashboard")}
        >
          <div className="w-10 h-10 rounded-xl bg-[#F0F5F7] flex items-center justify-center text-[#125747] shadow-sm shrink-0">
            <svg
              className="w-6 h-6 text-[#125747]"
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

        {/* Mobile close */}
        <button
          type="button"
          className="lg:hidden p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
          onClick={onCloseMobile}
          aria-label="Close menu"
        >
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
      </div>

      {/* Main Navigation Links */}
      <nav aria-label={`${role.replace("_", " ")} navigation`} className="space-y-1">
        {navigation.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => {
                onSelectTab(item.id);
                if (onCloseMobile) onCloseMobile();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-xl transition-all text-xs font-medium cursor-pointer ${
                isActive
                  ? "bg-[#F0F5F7] text-[#125747] font-bold shadow-xs"
                  : "text-[#F0F5F7]/85 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span
                className={`material-symbols-outlined text-[19px] shrink-0 ${
                  isActive ? "!text-[#125747]" : "!text-[#F0F5F7]/80"
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
      {!isAdmin && (
        <nav aria-label="Account navigation" className="space-y-1">
          {secondaryNavItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => {
                  onSelectTab(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-left rounded-xl transition-all text-xs font-medium cursor-pointer ${
                  isActive
                    ? "bg-[#F0F5F7] text-[#125747] font-bold shadow-xs"
                    : "text-[#F0F5F7]/85 hover:bg-white/10 hover:text-white"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`material-symbols-outlined text-[19px] shrink-0 ${
                      isActive ? "!text-[#125747]" : "!text-[#F0F5F7]/80"
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>
              </button>
            );
          })}
        </nav>
      )}

      {/* Bottom Support section */}
      {!isDoctor && !isAdmin && (
        <div className="mt-6 p-4 rounded-2xl bg-white/10 border border-white/15 space-y-2">
          <div className="w-8 h-8 rounded-lg bg-[#F0F5F7] flex items-center justify-center text-[#125747] shadow-2xs">
            <span className="material-symbols-outlined !text-[#125747] text-lg">
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
      )}
    </div>
  );

  return (
    <>
      {/* Mobile Drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-[#162623]/60 backdrop-blur-xs z-50 lg:hidden"
          onClick={onCloseMobile}
        >
          <aside
            className="fixed left-0 top-0 h-full w-72 bg-[#125747] text-white border-r border-[#162623]/30 flex flex-col justify-between shadow-xl no-scrollbar"
            style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
            onClick={(e) => e.stopPropagation()}
          >
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Desktop Persistent Flex Sidebar */}
      <aside
        className="hidden lg:flex lg:w-72 lg:shrink-0 lg:sticky lg:top-0 lg:h-screen lg:z-30 bg-[#125747] text-white border-r border-[#162623]/30 flex-col justify-between shadow-xl no-scrollbar"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
