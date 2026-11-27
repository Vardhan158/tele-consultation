import { useState, useEffect, useRef } from "react";
import { authApi, notificationApi, adminNotificationApi, patientApi } from "../../lib/api";
import EmergencyModal from "../common/EmergencyModal";
import { useTranslation } from "../../i18n/I18nContext";

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
  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);
  const langDropdownRef = useRef(null);

  const { t, language, changeLanguage, languages } = useTranslation();
  const currentLangObj = languages.find((l) => l.code === language) || languages[0];

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
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target)) {
        setLangDropdownOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === "Escape") {
        setProfileOpen(false);
        setLangDropdownOpen(false);
      }
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
        return t("nav.clinic_overview", "Overview");
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
        return t("nav.appointments", "Appointments");
      case "clinic-payments":
        return t("nav.payments", "Payments");
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
        return t("nav.dashboard", "Dashboard");
      case "find-doctors":
        return t("nav.find_doctors", "Find doctors");
      case "doctor-availability":
      case "availability":
        return "Availability";
      case "appointments":
      case "doctor-appointments":
        return isDoctor ? t("nav.appointments", "Appointments") : t("nav.appointments", "My appointments");
      case "doctor-patients":
        return "Patients";
      case "medical-records":
        return t("nav.medical_records", "Medical records");
      case "prescriptions":
        return t("nav.prescriptions", "Prescriptions");
      case "summaries":
        return t("nav.summaries", "Consultation summaries");
      case "follow-up":
        return t("nav.follow_up", "Follow-up care");
      case "my-insurance":
        return t("nav.my_insurance", "My Insurance");
      case "support":
        return t("nav.support", "Help & support");
      case "payments":
        return t("nav.payments", "Payments");
      case "consent":
        return "Consent management";
      case "notifications":
        return t("nav.notifications", "Notifications");
      case "settings":
      case "doctor-settings":
        return t("nav.settings", "Settings");
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
      <div className="flex items-center gap-2 sm:gap-3 text-xs">
        {/* Phase 1 (F-03): Emergency SOS & Paramedic Card Trigger */}
        {!isAdmin && !isDoctor && (
          <button
            type="button"
            onClick={() => setEmergencyModalOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 transition cursor-pointer font-bold text-[11px] shadow-2xs"
            title="Emergency Medical Card & Hospital Locator"
          >
            <span className="material-symbols-outlined text-base text-red-600 animate-pulse">
              emergency
            </span>
            <span className="hidden sm:inline">{t("nav.emergency_care", "Emergency SOS")}</span>
          </button>
        )}

        {/* Phase 4 (F-12): Multi-Language Frontend Localization Selector */}
        <div className="relative" ref={langDropdownRef}>
          <button
            type="button"
            onClick={() => setLangDropdownOpen((prev) => !prev)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 border border-[#577877]/20 text-[#162623] transition cursor-pointer font-semibold text-xs shadow-2xs"
            title={t("common.select_language", "Select Language")}
          >
            <span className="text-sm">{currentLangObj?.flag || "🌐"}</span>
            <span className="hidden md:inline font-medium">{currentLangObj?.nativeName || "English"}</span>
            <span className="material-symbols-outlined text-xs text-[#577877]">arrow_drop_down</span>
          </button>
          {langDropdownOpen && (
            <div className="absolute right-0 mt-2 w-44 rounded-xl bg-white border border-[#577877]/20 shadow-xl py-1 z-50 animate-fade-in">
              {languages.map((lng) => (
                <button
                  key={lng.code}
                  type="button"
                  onClick={() => {
                    changeLanguage(lng.code);
                    setLangDropdownOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-[#F0F5F7] transition cursor-pointer ${
                    language === lng.code ? "bg-[#25836F]/10 text-[#185A4D] font-bold" : "text-[#162623]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>{lng.flag}</span>
                    <span>{lng.nativeName}</span>
                  </span>
                  {language === lng.code && <span className="text-[#25836F] font-bold">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

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

      {/* Emergency First Responder & Paramedic Modal */}
      <EmergencyModal
        isOpen={emergencyModalOpen}
        onClose={() => setEmergencyModalOpen(false)}
      />
    </header>
  );
}
