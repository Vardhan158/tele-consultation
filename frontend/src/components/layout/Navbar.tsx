import { useEffect, useState, useRef } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import DoctorRegistrationScreen from "../auth/DoctorRegistrationScreen";
import { authApi, patientApi } from "../../lib/api";

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
        className={`nav-draw px-3.5 py-2 text-[15px] font-semibold transition-colors duration-200 cursor-pointer ${baseText}`}
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
      className={`fixed top-0 left-0 right-0 w-full z-50 select-none transition-all duration-300 ${
        useSolidWhiteHeader
          ? "bg-white/80 backdrop-blur-xl backdrop-saturate-150 border-b border-white/60 shadow-[0_4px_25px_rgba(22,38,35,0.08)]"
          : "bg-transparent border-b border-transparent shadow-none"
      }`}
    >
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-6 sm:px-10 lg:px-16 xl:px-20 py-4.5 sm:py-5">
        {/* Brand Logo */}
        <NavLink
          to="/"
          onClick={() => setOpen(false)}
          className={`flex shrink-0 items-center gap-2.5 rounded-xl focus:outline-none transition-colors duration-300 ${
            useSolidWhiteHeader ? "text-[#162623]" : "text-white"
          }`}
        >
          <svg
            width="35"
            height="42"
            viewBox="0 0 35 42"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 sm:h-9 w-auto shrink-0"
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
          <span className="text-2xl sm:text-[27px] font-bold leading-none tracking-tight">
            Kaizen Care
          </span>
        </NavLink>

        {/* Center Desktop Navigation Links */}
        <nav aria-label="Primary navigation" className="hidden items-center gap-1.5 md:flex">
          {PUBLIC_NAV_LINKS.map((item) => renderNavLink(item, false))}
        </nav>

        {/* Right Desktop Actions */}
        <div className="hidden items-center gap-4 sm:flex">
          {currentUser ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => go(getDashboardPath())}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition-all duration-200 cursor-pointer ${
                  useSolidWhiteHeader
                    ? "bg-[#EEF6F3] text-[#165849] hover:bg-[#E2F0EB]"
                    : "bg-white/15 text-white hover:bg-white/25"
                }`}
              >
                <span className="material-symbols-outlined text-lg">dashboard</span>
                <span>Dashboard</span>
              </button>

              {/* Profile Dropdown */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setProfileOpen((prev) => !prev)}
                  aria-expanded={profileOpen}
                  aria-haspopup="true"
                  className={`flex items-center gap-2 p-1.5 rounded-xl transition cursor-pointer ${
                    useSolidWhiteHeader
                      ? "hover:bg-zinc-100"
                      : "hover:bg-white/10"
                  }`}
                >
                  {currentUser.avatar_url ? (
                    <img
                      src={currentUser.avatar_url}
                      alt={userName}
                      className="w-8 h-8 rounded-full object-cover shadow-sm ring-1 ring-zinc-300"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[#185A4D] text-white flex items-center justify-center font-bold text-xs shadow-sm">
                      {userInitials}
                    </div>
                  )}
                  <span
                    className={`font-semibold hidden lg:inline text-xs sm:text-sm ${
                      useSolidWhiteHeader ? "text-[#162623]" : "text-white"
                    }`}
                  >
                    {userName}
                  </span>
                  <span
                    className={`material-symbols-outlined text-base transition-transform duration-200 ${
                      useSolidWhiteHeader ? "text-[#577877]" : "text-white/80"
                    } ${profileOpen ? "rotate-180" : ""}`}
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
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => go("/login")}
                className={`text-sm sm:text-[15px] font-semibold transition-colors duration-200 cursor-pointer ${
                  useSolidWhiteHeader
                    ? "text-[#165849] hover:text-[#124b3e]"
                    : "text-white hover:text-white/80"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => setShowDoctorModal(true)}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 sm:px-6 sm:py-2.5 text-sm sm:text-[15px] font-semibold transition-all duration-200 cursor-pointer shadow-xs ${
                  useSolidWhiteHeader
                    ? "bg-[#165849] hover:bg-[#124b3e] text-white"
                    : "bg-white hover:bg-[#f6f7f2] text-[#162623]"
                }`}
              >
                <span>Doctor Registration</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={useSolidWhiteHeader ? "text-white" : "text-[#162623]"}
                >
                  <path d="M5 12h14"></path>
                  <path d="m12 5 7 7-7 7"></path>
                </svg>
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
          className={`rounded-lg p-2 transition md:hidden cursor-pointer ${
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
          className={`border-t px-6 py-4 md:hidden animate-in fade-in slide-in-from-top-2 duration-200 ${
            useSolidWhiteHeader
              ? "border-white/40 bg-white/95 backdrop-blur-xl text-[#162623]"
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
                  <div className="flex items-center gap-3 p-2 rounded-xl bg-[#F0F5F7]/80">
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
                    className="w-full rounded-xl bg-[#165849] py-2.5 text-xs font-semibold text-white cursor-pointer"
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
                    className={`w-full rounded-xl py-2.5 text-xs font-semibold cursor-pointer ${
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
                    className={`w-full inline-flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-bold cursor-pointer ${
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
        <DoctorRegistrationScreen
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
        />
      )}
    </header>
  );
}
