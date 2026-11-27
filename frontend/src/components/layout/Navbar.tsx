import { useEffect, useState, useRef } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import DoctorRegistrationScreen from "../auth/DoctorRegistrationScreen";
import { authApi, patientApi, notificationApi, adminNotificationApi } from "../../lib/api";

const PUBLIC_NAV_LINKS = [
  { label: "Home", path: "/" },
  { label: "Find Doctors", path: "/find-doctors" },
  { label: "Services", path: "/services", sectionId: "services" },
  { label: "About Us", path: "/about-us", sectionId: "about" },
  { label: "FAQs", path: "/faqs" },
  { label: "Contact", path: "/contact" },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [showDoctorModal, setShowDoctorModal] = useState(false);
  const [activeHash, setActiveHash] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync authentication state across page navigations
  useEffect(() => {
    let isMounted = true;
    authApi
      .me()
      .then(async (u) => {
        if (!isMounted) return;
        if (u?.authenticated) {
          let userState = { ...u };
          if (u.role === "patient") {
            try {
              const profile = await patientApi.getProfile();
              if (profile && isMounted) {
                userState = {
                  ...userState,
                  ...profile,
                  avatar_url: profile.avatar_url || u.avatar_url,
                  full_name: profile.full_name || u.full_name,
                };
              }
            } catch {
              // fallback to authApi.me
            }
          }
          if (isMounted) setCurrentUser(userState);
        } else {
          if (isMounted) setCurrentUser(null);
        }
      })
      .catch(() => {
        if (isMounted) setCurrentUser(null);
      });
    return () => {
      isMounted = false;
    };
  }, [location.pathname]);

  // Sync unread notification count when authenticated
  useEffect(() => {
    if (!currentUser || currentUser.role === "doctor") {
      setUnreadCount(0);
      return;
    }
    if (currentUser.role === "clinic_admin") {
      adminNotificationApi
        .unreadCount()
        .then((res: any) => {
          setUnreadCount(res?.unread_count || 0);
        })
        .catch(() => {});
      return;
    }
    notificationApi
      .list()
      .then((items) => {
        if (Array.isArray(items)) {
          const unread = items.filter((n: any) => !n.read_at && n.status !== "read");
          setUnreadCount(unread.length);
        }
      })
      .catch(() => {});
  }, [currentUser]);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      setIsScrolled(scrollTop > 20);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setProfileOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    if (profileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [profileOpen]);

  useEffect(() => {
    setActiveHash(location.hash);
    if (location.pathname === "/" && location.hash) {
      const sectionId = location.hash.replace("#", "");
      const element = document.getElementById(sectionId);
      if (element) {
        requestAnimationFrame(() => {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    }
  }, [location.pathname, location.hash]);

  const handleLinkClick = (item: { label: string; path: string; sectionId?: string }, e: React.MouseEvent) => {
    setOpen(false);
    if (item.sectionId && location.pathname === "/") {
      e.preventDefault();
      const element = document.getElementById(item.sectionId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "start" });
        window.history.pushState(null, "", `#${item.sectionId}`);
        setActiveHash(`#${item.sectionId}`);
        return;
      }
    }
    navigate(item.path);
  };

  const isLightPage = [
    "/find-doctors",
    "/faqs",
    "/services",
    "/about",
    "/about-us",
    "/contact",
    "/login",
    "/register",
    "/doctor/register",
  ].includes(location.pathname);

  const useSolidWhiteHeader = isScrolled || isLightPage;

  const renderNavLink = (item: { label: string; path: string; sectionId?: string }, isMobile = false) => {
    let isActive = false;
    if (item.path !== "/" && !item.sectionId && item.path === location.pathname) {
      isActive = true;
    } else if (item.sectionId && location.pathname === "/" && activeHash === `#${item.sectionId}`) {
      isActive = true;
    } else if (item.path === "/" && location.pathname === "/" && !activeHash) {
      isActive = true;
    }

    if (isMobile) {
      return (
        <a
          key={item.label}
          href={item.path}
          onClick={(e) => handleLinkClick(item, e)}
          className={`rounded-lg px-3 py-2 text-sm font-medium transition cursor-pointer ${
            useSolidWhiteHeader
              ? isActive
                ? "bg-[#EEF6F3]/90 text-[#165849] font-bold"
                : "text-[#577877] hover:bg-[#F0F5F7]/80 hover:text-[#162623]"
              : isActive
              ? "bg-white/20 text-white font-bold"
              : "text-white/90 hover:bg-white/10 hover:text-white"
          }`}
        >
          {item.label}
        </a>
      );
    }

    const baseText = useSolidWhiteHeader
      ? isActive
        ? "text-[#165849] font-bold"
        : "text-[#577877] hover:text-[#162623]"
      : isActive
      ? "text-white font-bold"
      : "text-white/90 hover:text-white";

    return (
      <a
        key={item.label}
        href={item.path}
        onClick={(e) => handleLinkClick(item, e)}
        className={`nav-draw px-3 py-1.5 text-xs sm:text-sm font-semibold transition-colors duration-200 cursor-pointer ${baseText}`}
      >
        <span>{item.label}</span>
      </a>
    );
  };

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  const handleSignOut = async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore error
    }
    setCurrentUser(null);
    setProfileOpen(false);
    navigate("/", { replace: true });
    window.location.reload();
  };

  const getDashboardPath = () => {
    if (!currentUser) return "/dashboard";
    if (currentUser.role === "clinic_admin") return "/clinic/overview";
    if (currentUser.role === "doctor") return "/doctor/dashboard";
    if (currentUser.role === "support") return "/support";
    if (currentUser.role === "secops") return "/secops";
    return "/dashboard";
  };

  const userName = currentUser?.full_name || (currentUser?.role === "doctor" ? "Doctor" : "Patient");
  const userInitials =
    userName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p: string) => p[0])
      .join("")
      .toUpperCase() || "A";

  const roleLabel =
    currentUser?.role === "clinic_admin"
      ? "Clinic Administrator"
      : currentUser?.role === "doctor"
      ? "Doctor"
      : "Patient";

  return (
    <header
      className={`fixed top-0 left-0 right-0 w-full z-50 h-16 select-none transition-all duration-300 ${
        useSolidWhiteHeader
          ? "bg-[#F0F5F7]/95 backdrop-blur-md border-b border-[#577877]/15 shadow-xs text-[#162623]"
          : "bg-transparent border-b border-transparent shadow-none text-white"
      }`}
    >
      <div className="w-full h-full flex items-center justify-between px-4 sm:px-6 lg:px-8 font-sans">
        {/* Brand Logo */}
        <NavLink
          to="/"
          onClick={() => setOpen(false)}
          className={`flex shrink-0 items-center gap-2.5 rounded-xl focus:outline-none transition-colors duration-200 ${
            useSolidWhiteHeader ? "text-[#162623]" : "text-white"
          }`}
        >
          <div
            className={`flex items-center justify-center w-8 h-8 rounded-xl ${
              useSolidWhiteHeader ? "bg-[#185A4D] text-white" : "bg-white text-[#185A4D]"
            } shadow-xs`}
          >
            <svg
              width="20"
              height="24"
              viewBox="0 0 35 42"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="h-4.5 w-auto"
              aria-hidden="true"
            >
              <path
                d="M14.451 5.223A7.466 7.466 0 0 1 24.9 15.891q-.3.293-.584.512L13.933 5.802q.22-.285.518-.579M7.093 25.239A7.466 7.466 0 0 0 17.607 35.84a7 7 0 0 0 .518-.574L7.675 24.73a6 6 0 0 0-.582.508"
                fill="currentColor"
              />
              <rect
                width="12.629"
                height="32.626"
                rx="6.315"
                transform="rotate(-45 16.202 6.711)"
                fill="currentColor"
              />
            </svg>
          </div>
          <span className="text-lg sm:text-xl font-bold leading-none tracking-tight">
            Kaizen Care
          </span>
        </NavLink>

        {/* Center Desktop Navigation Links */}
        <nav aria-label="Primary navigation" className="hidden items-center gap-1 md:flex">
          {PUBLIC_NAV_LINKS.map((item) => renderNavLink(item, false))}
        </nav>

        {/* Right Desktop Actions */}
        <div className="hidden items-center gap-3 sm:gap-4 text-xs sm:flex">
          {currentUser ? (
            <>
              {/* Notifications bell matching portal top bar */}
              <button
                type="button"
                onClick={() => go("/notifications")}
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

              {/* Profile Dropdown matching portal top bar 1:1 */}
              <div className="relative pl-2 border-l border-[#577877]/20" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((prev) => !prev)}
                  aria-expanded={profileOpen}
                  aria-haspopup="true"
                  className="flex items-center gap-2 p-1.5 rounded-xl hover:bg-white transition cursor-pointer group"
                >
                  {currentUser.avatar_url ? (
                    <img
                      src={currentUser.avatar_url}
                      alt={userName}
                      className="w-8 h-8 rounded-full object-cover shadow-sm ring-1 ring-[#577877]/20"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#185A4D] text-white flex items-center justify-center font-bold text-xs shadow-sm">
                      {userInitials}
                    </div>
                  )}
                  <span className="font-semibold text-[#162623] hidden md:inline text-xs">
                    {userName}
                  </span>
                  <span
                    className={`material-symbols-outlined text-base text-[#577877] transition-transform duration-200 ${
                      profileOpen ? "rotate-180" : ""
                    }`}
                  >
                    expand_more
                  </span>
                </button>

                {profileOpen && (
                  <div className="absolute right-0 mt-2 w-60 rounded-2xl bg-white border border-[#577877]/20 shadow-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150 text-[#162623]">
                    <div className="px-4 py-2.5 border-b border-[#577877]/10 flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-[#162623] truncate">{userName}</p>
                      <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-semibold bg-[#F0F5F7] text-[#185A4D] shrink-0">
                        {roleLabel}
                      </span>
                    </div>

                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          go(getDashboardPath());
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-[#162623] hover:bg-[#F0F5F7] hover:text-[#185A4D] transition cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base text-[#577877]">
                          dashboard
                        </span>
                        <span>Workspace Dashboard</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setProfileOpen(false);
                          go("/profile");
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
                          go("/settings");
                        }}
                        className="w-full flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-[#162623] hover:bg-[#F0F5F7] hover:text-[#185A4D] transition cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base text-[#577877]">
                          tune
                        </span>
                        <span>Account Settings</span>
                      </button>
                    </div>

                    <div className="pt-1 border-t border-[#577877]/10">
                      <button
                        type="button"
                        onClick={handleSignOut}
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
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => go("/login")}
                className={`text-xs font-semibold transition-colors duration-200 cursor-pointer px-3 py-1.5 rounded-xl ${
                  useSolidWhiteHeader
                    ? "text-[#165849] hover:bg-white"
                    : "text-white hover:bg-white/10"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setShowDoctorModal(true)}
                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 cursor-pointer shadow-xs ${
                  useSolidWhiteHeader
                    ? "bg-[#165849] hover:bg-[#124b3e] text-white"
                    : "bg-white hover:bg-[#f6f7f2] text-[#162623]"
                }`}
              >
                <span>Doctor Registration</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
            </>
          )}
        </div>

        {/* Mobile Menu Toggle Button */}
        <button
          type="button"
          aria-label="Toggle navigation menu"
          aria-expanded={open}
          aria-controls="public-mobile-navigation"
          onClick={() => setOpen((prev) => !prev)}
          className={`rounded-lg p-2 transition lg:hidden cursor-pointer ${
            useSolidWhiteHeader
              ? "text-[#165849] hover:bg-[#EEF6F3]"
              : "text-white hover:bg-white/10"
          }`}
        >
          <span className="material-symbols-outlined" aria-hidden="true">
            {open ? "close" : "menu"}
          </span>
        </button>
      </div>

      {/* Mobile Drawer */}
      {open && (
        <div
          id="public-mobile-navigation"
          className={`border-t px-6 py-4 lg:hidden animate-in fade-in slide-in-from-top-2 duration-200 ${
            useSolidWhiteHeader
              ? "border-white/40 bg-[#F0F5F7]/95 backdrop-blur-xl text-[#162623]"
              : "border-white/10 bg-[#165849]/95 backdrop-blur-xl text-white"
          }`}
        >
          <nav aria-label="Mobile navigation" className="flex flex-col gap-1.5">
            {PUBLIC_NAV_LINKS.map((item) => renderNavLink(item, true))}
            <div
              className={`mt-3 flex flex-col gap-2 border-t pt-4 ${
                useSolidWhiteHeader ? "border-[#577877]/15" : "border-white/10"
              }`}
            >
              {currentUser ? (
                <>
                  <div className="flex items-center gap-3 p-2 rounded-xl bg-white/80">
                    {currentUser.avatar_url ? (
                      <img
                        src={currentUser.avatar_url}
                        alt={userName}
                        className="w-10 h-10 rounded-full object-cover shadow-sm ring-1 ring-zinc-300"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-[#185A4D] text-white flex items-center justify-center font-bold text-sm shadow-sm">
                        {userInitials}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#162623] truncate">{userName}</p>
                      <p className="text-xs text-[#577877]">{roleLabel}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => go(getDashboardPath())}
                    className="w-full rounded-xl bg-[#165849] py-2 text-xs font-semibold text-white cursor-pointer"
                  >
                    Go to Dashboard
                  </button>
                  <button
                    type="button"
                    onClick={() => go("/profile")}
                    className="w-full rounded-xl border border-[#577877]/30 bg-white py-2 text-xs font-semibold text-[#162623] cursor-pointer"
                  >
                    My Profile
                  </button>
                  <button
                    type="button"
                    onClick={() => go("/settings")}
                    className="w-full rounded-xl border border-[#577877]/30 bg-white py-2 text-xs font-semibold text-[#162623] cursor-pointer"
                  >
                    Settings
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="w-full rounded-xl py-2 text-xs font-semibold text-red-600 hover:bg-red-50 cursor-pointer"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => go("/login")}
                    className={`w-full rounded-xl py-2 text-xs font-semibold cursor-pointer ${
                      useSolidWhiteHeader
                        ? "border border-[#577877]/30 bg-white text-[#162623]"
                        : "border border-white/40 bg-white/10 text-white"
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setShowDoctorModal(true);
                    }}
                    className={`w-full inline-flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold cursor-pointer ${
                      useSolidWhiteHeader
                        ? "bg-[#165849] text-white"
                        : "bg-white text-[#162623]"
                    }`}
                  >
                    <span>Doctor Registration</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </>
              )}
            </div>
          </nav>
        </div>
      )}

      {/* Doctor Registration Popup Modal with all 3 steps */}
      {showDoctorModal && (
        <Suspense fallback={null}><DoctorRegistrationScreen
          isModal={true}
          onClose={() => setShowDoctorModal(false)}
          onSuccess={(email: string) => {
            setShowDoctorModal(false);
            navigate("/doctor/verify-email", { state: { email } });
          }}
          onSwitchToPatientAuth={() => {
            setShowDoctorModal(false);
            navigate("/login");
          }}
        /></Suspense>
      )}
    </header>
  );
}
