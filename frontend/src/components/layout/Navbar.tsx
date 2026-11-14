import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

interface NavItem {
  label: string;
  path: string;
  sectionId?: string;
}

const PUBLIC_NAV_LINKS: NavItem[] = [
  { label: "Home", path: "/" },
  { label: "Find Doctors", path: "/find-doctors" },
  { label: "How It Works", path: "/how-it-works" },
  { label: "Services", path: "/#services", sectionId: "services" },
  { label: "About", path: "/#about", sectionId: "about" },
  { label: "FAQs", path: "/#faqs", sectionId: "faqs" },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [activeHash, setActiveHash] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);

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
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, []);

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

  const handleLinkClick = (item: NavItem, e: React.MouseEvent) => {
    setOpen(false);
    if (item.sectionId) {
      if (location.pathname === "/") {
        e.preventDefault();
        const element = document.getElementById(item.sectionId);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
          window.history.pushState(null, "", `#${item.sectionId}`);
          setActiveHash(`#${item.sectionId}`);
        }
      } else {
        navigate(`/#${item.sectionId}`);
      }
    } else {
      navigate(item.path);
    }
  };

  const isLightPage = ["/find-doctors", "/faqs", "/services"].includes(location.pathname);
  const useSolidWhiteHeader = isScrolled || isLightPage;

  const renderNavLink = (item: NavItem, isMobile = false) => {
    let isActive = false;
    if (item.path !== "/" && !item.sectionId && item.path === location.pathname) {
      isActive = true;
    } else if (item.sectionId && location.pathname === "/" && activeHash === `#${item.sectionId}`) {
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
                ? "bg-[#EEF6F3]/90 text-[#1A7D67] font-bold"
                : "text-[#577877] hover:bg-[#F0F5F7]/80 hover:text-[#162623]"
              : isActive
              ? "bg-white/20 text-white font-bold"
              : "text-white/85 hover:bg-white/10 hover:text-white"
          }`}
        >
          {item.label}
        </a>
      );
    }

    const baseText = useSolidWhiteHeader
      ? isActive
        ? "text-[#1A7D67] font-bold"
        : "text-[#577877] hover:text-[#162623]"
      : isActive
      ? "text-white font-bold"
      : "text-white/85 hover:text-white";

    const underlineGradient = useSolidWhiteHeader
      ? "bg-gradient-to-r from-[#1A7D67] via-[#25836F] to-[#1A7D67] shadow-[0_0_8px_rgba(26,125,103,0.5)]"
      : "bg-gradient-to-r from-white/70 via-white to-white/70 shadow-[0_0_8px_rgba(255,255,255,0.8)]";

    return (
      <a
        key={item.label}
        href={item.path}
        onClick={(e) => handleLinkClick(item, e)}
        className={`group relative rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors duration-300 cursor-pointer ${baseText}`}
      >
        <span>{item.label}</span>
        {/* Cinematic Animated Underline */}
        <span
          className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-[2px] rounded-full transition-all duration-300 ease-out pointer-events-none ${
            isActive ? "w-4/5" : "w-0 group-hover:w-4/5"
          } ${underlineGradient}`}
        />
      </a>
    );
  };

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 w-full z-50 select-none transition-all duration-300 ${
        useSolidWhiteHeader
          ? "bg-white/80 backdrop-blur-xl backdrop-saturate-150 border-b border-white/60 shadow-[0_4px_25px_rgba(22,38,35,0.08)]"
          : "bg-transparent border-b border-transparent shadow-none"
      }`}
    >
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-6 sm:px-8 py-4.5 lg:px-12">
        {/* Brand Logo */}
        <NavLink
          to="/"
          onClick={() => setOpen(false)}
          className={`flex shrink-0 items-center rounded-xl focus:outline-none transition-colors duration-300 ${
            useSolidWhiteHeader ? "text-[#162623]" : "text-white"
          }`}
        >
          <svg
            width="210"
            height="42"
            viewBox="0 0 210 42"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 sm:h-9 w-auto"
            aria-label="Kaizen Care"
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
            <text
              x="44"
              y="29"
              fill="currentColor"
              fontFamily="'Poppins', system-ui, sans-serif"
              fontSize="24"
              fontWeight="700"
              letterSpacing="-0.4"
            >
              Kaizen Care
            </text>
          </svg>
        </NavLink>

        {/* Desktop Navigation Links */}
        <nav aria-label="Primary navigation" className="hidden items-center gap-1 xl:flex">
          {PUBLIC_NAV_LINKS.map((item) => renderNavLink(item, false))}
        </nav>

        {/* Right Desktop Actions */}
        <div className="hidden items-center gap-3 lg:flex">
          <button
            type="button"
            onClick={() => go("/doctor/register")}
            className={`group relative rounded-lg px-2.5 py-2 text-xs font-semibold transition-colors duration-300 cursor-pointer ${
              useSolidWhiteHeader ? "text-[#1A7D67] hover:text-[#162623]" : "text-white/90 hover:text-white"
            }`}
          >
            <span>Clinician Registration</span>
            <span
              className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 h-[2px] w-0 group-hover:w-4/5 rounded-full transition-all duration-300 ease-out pointer-events-none ${
                useSolidWhiteHeader
                  ? "bg-gradient-to-r from-[#1A7D67] via-[#25836F] to-[#1A7D67] shadow-[0_0_8px_rgba(26,125,103,0.5)]"
                  : "bg-gradient-to-r from-white/70 via-white to-white/70 shadow-[0_0_8px_rgba(255,255,255,0.8)]"
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => go("/login")}
            className={`inline-flex items-center justify-center rounded-xl px-4 py-2 text-xs font-semibold transition cursor-pointer ${
              useSolidWhiteHeader
                ? "border border-[#577877]/30 bg-white/90 hover:bg-white text-[#162623]"
                : "border border-white/40 bg-white/10 text-white hover:bg-white/20 backdrop-blur-xs"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => go("/find-doctors")}
            className={`inline-flex items-center justify-center rounded-xl px-4.5 py-2 text-xs font-bold transition cursor-pointer shadow-xs ${
              useSolidWhiteHeader
                ? "bg-[#1A7D67] hover:bg-[#156654] text-white"
                : "bg-white hover:bg-white/90 text-[#1A7D67]"
            }`}
          >
            Book Appointment
          </button>
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
              ? "text-[#1A7D67] hover:bg-[#EEF6F3]"
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
              ? "border-white/40 bg-white/90 backdrop-blur-xl text-[#162623]"
              : "border-white/10 bg-[#1A7D67]/95 backdrop-blur-xl text-white"
          }`}
        >
          <nav aria-label="Mobile navigation" className="flex flex-col gap-1.5">
            {PUBLIC_NAV_LINKS.map((item) => renderNavLink(item, true))}
            <button
              type="button"
              onClick={() => go("/doctor/register")}
              className={`rounded-lg px-3 py-2 text-left text-sm font-semibold cursor-pointer ${
                useSolidWhiteHeader
                  ? "text-[#1A7D67] hover:bg-[#EEF6F3]"
                  : "text-white/90 hover:bg-white/10"
              }`}
            >
              Clinician Registration
            </button>
            <div
              className={`mt-3 flex gap-2 border-t pt-4 ${
                useSolidWhiteHeader ? "border-[#577877]/15" : "border-white/10"
              }`}
            >
              <button
                type="button"
                onClick={() => go("/login")}
                className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-semibold cursor-pointer ${
                  useSolidWhiteHeader
                    ? "border border-[#577877]/30 bg-white text-[#162623]"
                    : "border border-white/40 bg-white/10 text-white"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => go("/find-doctors")}
                className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-bold cursor-pointer ${
                  useSolidWhiteHeader
                    ? "bg-[#1A7D67] text-white"
                    : "bg-white text-[#1A7D67]"
                }`}
              >
                Book Appointment
              </button>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
