import { useState, useEffect, useRef } from "react";
import { authApi, notificationApi, adminNotificationApi, patientApi } from "../../lib/api";

export default function Header({
  onOpenMobile,
  onSelectTab,
  onSignOut,
  activeTab = "dashboard",
  patient,
}) {
  const [currentUser, setCurrentUser] = useState(patient || null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (patient) {
      setCurrentUser(patient);
      if (!patient.avatar_url && patient.role !== "doctor" && patient.role !== "clinic_admin") {
        patientApi.getProfile().then((p) => {
          if (p?.avatar_url) {
            setCurrentUser((prev) => ({ ...prev, avatar_url: p.avatar_url }));
          }
        }).catch(() => {});
      }
    } else {
      authApi
        .me()
        .then((u) => {
          if (u?.authenticated) {
            setCurrentUser(u);
            if (!u.avatar_url && u.role !== "doctor" && u.role !== "clinic_admin") {
              patientApi.getProfile().then((p) => {
                if (p?.avatar_url) {
                  setCurrentUser((prev) => ({ ...prev, avatar_url: p.avatar_url }));
                }
              }).catch(() => {});
            }
          }
        })
        .catch(() => {});
    }
  }, [patient]);

  const activeUser = currentUser || patient;
  const isAdmin = activeUser?.role === "clinic_admin";
  const isDoctor = activeUser?.role === "doctor";
  const name = activeUser?.full_name || (isAdmin ? "Clinic Admin" : isDoctor ? "Doctor" : "Patient");
  const roleLabel = isAdmin ? "Clinic Administrator" : isDoctor ? "Doctor" : "Patient";
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "A";

  useEffect(() => {
    if (isDoctor) {
      setUnreadCount(0);
      return;
    }
    if (isAdmin) {
      adminNotificationApi
        .unreadCount()
        .then((res) => {
          setUnreadCount(res?.unread_count || 0);
        })
        .catch(() => {});
      return;
    }
    notificationApi
      .list()
      .then((items) => {
        if (Array.isArray(items)) {
          const unread = items.filter((n) => !n.read_at && n.status !== "read");
          setUnreadCount(unread.length);
        }
      })
      .catch(() => {});
  }, [activeTab, activeUser, isAdmin, isDoctor]);

  // Close dropdown on outside click or escape
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") setProfileOpen(false);
    };

    if (profileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [profileOpen]);

  const getBreadcrumbTitle = () => {
    switch (activeTab) {
      case "clinic-overview":
      case "overview":
        return "Overview";
      case "clinic-doctors":
      case "doctors":
      case "clinic-approvals":
        return "Doctors";
      case "clinic-services":
      case "services":
        return "Services & fees";
      case "clinic-schedules":
      case "schedules":
        return "Schedules";
      case "clinic-appointments":
        return "Appointments";
      case "clinic-payments":
        return "Payments";
      case "clinic-insurance":
      case "insurance":
      case "insurance-providers":
        return "Insurance Providers";
      case "clinic-reports":
      case "reports":
        return "Reports";
      case "clinic-support-staff":
        return "Support staff";
      case "clinic-secops":
      case "secops":
        return "Security & Operations";
      case "clinic-settings":
        return "Clinic settings";
      case "dashboard":
      case "doctor-dashboard":
        return "Dashboard";
      case "find-doctors":
        return "Find doctors";
      case "doctor-availability":
      case "availability":
        return "Availability";
      case "appointments":
      case "doctor-appointments":
        return isDoctor ? "Appointments" : "My appointments";
      case "doctor-patients":
        return "Patients";
      case "medical-records":
        return "Medical records";
      case "prescriptions":
        return "Prescriptions";
      case "summaries":
        return "Consultation summaries";
      case "follow-up":
        return "Follow-up care";
      case "my-insurance":
        return "My Insurance";
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

        <div className="flex items-center gap-1.5 sm:gap-2 text-xs font-medium text-[#577877] min-w-0 truncate">
          <span
            className="hover:text-[#162623] cursor-pointer hidden sm:inline truncate"
            onClick={() => onSelectTab(isAdmin ? "clinic-overview" : isDoctor ? "doctor-dashboard" : "dashboard")}
          >
            {isAdmin ? "Clinic Admin Workspace" : isDoctor ? "Doctor Portal" : "Patient Portal"}
          </span>
          <span className="hidden sm:inline">/</span>
          <span className="font-semibold text-[#162623] truncate">
            {getBreadcrumbTitle()}
          </span>
        </div>
      </div>

      {/* Right Header Elements */}
      <div className="flex items-center gap-3 sm:gap-4 text-xs">
        {/* Notifications (Patient & Clinic Admin) */}
        {!isDoctor && (
          <button
            type="button"
            onClick={() => onSelectTab(isAdmin ? "clinic-notifications" : "notifications")}
            className="flex items-center gap-1.5 p-1.5 rounded-xl hover:bg-white transition cursor-pointer"
            title="Notifications"
          >
            <span className="material-symbols-outlined !text-[#577877] text-xl">
              notifications
            </span>
            {unreadCount > 0 ? (
              <span className="px-2 py-0.5 rounded-full bg-[#25836F] text-white font-bold text-[11px]">
                {unreadCount} new
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-[#E5EEF1] text-[#577877] font-medium text-[11px]">
                0 new
              </span>
            )}
          </button>
        )}

        {/* Profile Dropdown */}
        <div className="relative pl-2 border-l border-[#577877]/20" ref={dropdownRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((prev) => !prev)}
            aria-expanded={profileOpen}
            aria-haspopup="true"
            className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white transition cursor-pointer group"
          >
            {activeUser?.avatar_url ? (
              <img
                src={activeUser.avatar_url}
                alt={name}
                className="w-8 h-8 rounded-full object-cover shadow-sm ring-1 ring-[#577877]/20"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#185A4D] text-white flex items-center justify-center font-bold text-xs shadow-sm">
                {initials}
              </div>
            )}
            <span className="font-semibold text-[#162623] hidden md:inline text-xs">
              {name}
            </span>
            <span
              className={`material-symbols-outlined text-base text-[#577877] transition-transform duration-200 ${
                profileOpen ? "rotate-180" : ""
              }`}
            >
              expand_more
            </span>
          </button>

          {/* Dropdown Menu */}
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-60 rounded-2xl bg-white border border-[#577877]/20 shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              {/* User info snippet */}
              <div className="px-4 py-2.5 border-b border-[#577877]/10 flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-[#162623] truncate">{name}</p>
                <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#F0F5F7] text-[#185A4D] shrink-0">
                  {roleLabel}
                </span>
              </div>

              {/* Menu items */}
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onSelectTab(isAdmin ? "clinic-settings" : isDoctor ? "doctor-settings" : "profile");
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-[#162623] hover:bg-[#F0F5F7] hover:text-[#185A4D] transition cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base text-[#577877]">
                    person
                  </span>
                  <span>My Profile</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onSelectTab(isAdmin ? "clinic-settings" : isDoctor ? "doctor-settings" : "settings");
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-[#162623] hover:bg-[#F0F5F7] hover:text-[#185A4D] transition cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base text-[#577877]">
                    tune
                  </span>
                  <span>Account Settings</span>
                </button>
              </div>

              {/* Sign out item */}
              <div className="pt-1 border-t border-[#577877]/10">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onSignOut();
                  }}
                  className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 transition cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base text-red-600">
                    logout
                  </span>
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
