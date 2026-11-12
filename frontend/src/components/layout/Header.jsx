import { useState, useEffect } from "react";
import { notificationApi } from "../../lib/api";

export default function Header({
  onOpenMobile,
  collapsed = false,
  onToggleCollapse,
  onSelectTab,
  onSignOut,
  activeTab = "dashboard",
  patient,
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const isAdmin = patient?.role === "clinic_admin";
  const isDoctor = patient?.role === "doctor";
  const name = patient?.full_name || (isAdmin ? "Clinic Admin" : isDoctor ? "Doctor" : "Patient");
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "A";

  useEffect(() => {
    if (isAdmin || isDoctor) {
      setUnreadCount(0);
      return;
    }
    notificationApi
      .list()
      .then((items) => {
        if (Array.isArray(items))
          setUnreadCount(items.filter((n) => n.status !== "read").length);
      })
      .catch(() => {});
  }, [activeTab, patient, isAdmin, isDoctor]);

  const getBreadcrumbTitle = () => {
    switch (activeTab) {
      case "clinic-overview":
      case "overview":
        return "Clinic Overview";
      case "clinic-doctors":
      case "doctors":
      case "clinic-approvals":
        return "Doctor Approvals & Credentials";
      case "clinic-services":
      case "services":
        return "Services & Fee Structure";
      case "clinic-schedules":
      case "schedules":
        return "Schedule & Shifts";
      case "clinic-appointments":
        return "Master Appointments";
      case "clinic-payments":
        return "Payments & Refunds";
      case "clinic-reports":
      case "reports":
        return "Operational Reports";
      case "clinic-settings":
        return "Clinic Settings";
      case "dashboard":
      case "doctor-dashboard":
        return "Dashboard";
      case "find-doctors":
        return "Find doctors";
      case "appointments":
      case "doctor-appointments":
        return "Appointments";
      case "medical-records":
        return "Medical records";
      case "prescriptions":
        return "Prescriptions";
      case "summaries":
        return "Consultation summaries";
      case "follow-up":
        return "Follow-up care";
      case "support":
        return "Help & support";
      case "payments":
        return "Payments";
      case "consent":
        return "Consent management";
      case "notifications":
        return "Notifications";
      case "settings":
      case "doctor-settings":
        return "Settings";
      case "profile":
        return "Profile";
      default:
        return "Overview";
    }
  };

  return (
    <header className="sticky top-0 z-30 h-16 bg-[#F0F5F7]/95 backdrop-blur-md border-b border-[#577877]/15 flex items-center justify-between px-4 sm:px-6 lg:px-8 font-sans text-[#162623]">
      {/* Left: Breadcrumbs & Toggle */}
      <div className="flex items-center gap-3">
        {/* Mobile drawer toggle */}
        <button
          type="button"
          onClick={onOpenMobile}
          className="p-1.5 rounded-lg text-[#577877] hover:text-[#162623] hover:bg-white transition lg:hidden cursor-pointer"
          aria-label="Toggle navigation drawer"
          title="Menu"
        >
          <span className="material-symbols-outlined text-xl">menu</span>
        </button>

        {/* Desktop collapse/expand toggle */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden lg:flex p-1.5 rounded-lg text-[#577877] hover:text-[#162623] hover:bg-white transition cursor-pointer"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span className="material-symbols-outlined text-xl">
            {collapsed ? "menu_open" : "menu"}
          </span>
        </button>

        <div className="flex items-center gap-2 text-xs font-medium text-[#577877]">
          <span
            className="hover:text-[#162623] cursor-pointer"
            onClick={() => onSelectTab(isAdmin ? "clinic-overview" : isDoctor ? "doctor-dashboard" : "dashboard")}
          >
            {isAdmin ? "Clinic Admin Workspace" : isDoctor ? "Doctor Portal" : "Patient Portal"}
          </span>
          <span>/</span>
          <span className="font-semibold text-[#162623]">
            {getBreadcrumbTitle()}
          </span>
        </div>
      </div>

      {/* Right Header Elements */}
      <div className="flex items-center gap-3 sm:gap-4 text-xs">
        {/* Private Workspace indicator */}
        <div className="hidden sm:flex items-center gap-1.5 text-[#577877] font-medium">
          <span className="material-symbols-outlined !text-[#577877] text-base">
            lock
          </span>
          <span>{isAdmin ? "Admin Security Vault" : "Private workspace"}</span>
        </div>

        {/* Notifications (Patient only) */}
        {!isAdmin && !isDoctor && (
          <button
            type="button"
            onClick={() => onSelectTab("notifications")}
            className="flex items-center gap-1.5 p-1.5 rounded-xl hover:bg-white transition"
            title="Notifications"
          >
            <span className="material-symbols-outlined !text-[#577877] text-xl">
              notifications
            </span>
            <span className="px-2 py-0.5 rounded-full bg-[#E5EEF1] text-[#25836F] font-bold text-[11px]">
              {unreadCount} new
            </span>
          </button>
        )}

        <div className="flex items-center gap-2 pl-2 border-l border-[#577877]/20">
          <div className="flex items-center gap-2 p-1">
            <div className="w-8 h-8 rounded-full bg-[#25836F] text-white flex items-center justify-center font-bold text-xs shadow-sm">
              {initials}
            </div>
            <span className="font-semibold text-[#162623] hidden md:inline">
              {name}
            </span>
          </div>

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
