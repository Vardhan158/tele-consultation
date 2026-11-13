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
  { label: "How It Works", path: "/#how-it-works", sectionId: "how-it-works" },
  { label: "Services", path: "/#services", sectionId: "services" },
  { label: "About", path: "/#about", sectionId: "about" },
  { label: "FAQs", path: "/#faqs", sectionId: "faqs" },
];

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [activeHash, setActiveHash] = useState("");

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

  const getLinkClass = (item: NavItem) => {
    let isActive = false;
    if (item.path === "/" && location.pathname === "/" && !location.hash) {
      isActive = true;
    } else if (item.path === "/find-doctors" && location.pathname === "/find-doctors") {
      isActive = true;
    } else if (item.sectionId && location.pathname === "/" && activeHash === `#${item.sectionId}`) {
      isActive = true;
    }

    return `rounded-lg px-3 py-2 text-sm font-medium transition cursor-pointer ${
      isActive
        ? "bg-[#EEF6F3] text-[#1A7D67] font-bold"
        : "text-[#577877] hover:bg-[#F0F5F7] hover:text-[#162623]"
    }`;
  };

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <header className="sticky top-0 z-50 border-b border-[#577877]/15 bg-white/95 backdrop-blur-md select-none">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-6 py-3.5 lg:px-10">
        {/* Brand Logo */}
        <NavLink
          to="/"
          onClick={() => setOpen(false)}
          className="flex shrink-0 items-center gap-3 rounded-xl focus:outline-none"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1A7D67] text-white shadow-sm">
            <svg
              width="24"
              height="28"
              viewBox="0 0 35 42"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-auto text-white"
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
          <div>
            <p className="text-lg font-bold leading-none tracking-tight text-[#162623]">
              Kaizen Care
            </p>
            <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-widest text-[#577877]">
              Telehealth Platform
            </p>
          </div>
        </NavLink>

        {/* Desktop Navigation Links */}
        <nav aria-label="Primary navigation" className="hidden items-center gap-1 xl:flex">
          {PUBLIC_NAV_LINKS.map((item) => (
            <a
              key={item.label}
              href={item.path}
              onClick={(e) => handleLinkClick(item, e)}
              className={getLinkClass(item)}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Right Desktop Actions */}
        <div className="hidden items-center gap-3 lg:flex">
          <button
            type="button"
            onClick={() => go("/doctor/register")}
            className="rounded-lg px-2.5 py-2 text-xs font-semibold text-[#1A7D67] hover:bg-[#EEF6F3] transition cursor-pointer"
          >
            Clinician Registration
          </button>
          <button
            type="button"
            onClick={() => go("/login")}
            className="inline-flex items-center justify-center rounded-xl border border-[#577877]/30 bg-white px-4 py-2 text-xs font-semibold text-[#162623] hover:bg-[#F0F5F7] transition cursor-pointer"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => go("/find-doctors")}
            className="inline-flex items-center justify-center rounded-xl bg-[#1A7D67] hover:bg-[#156654] px-4.5 py-2 text-xs font-bold text-white shadow-sm transition cursor-pointer"
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
          className="rounded-lg p-2 text-[#1A7D67] hover:bg-[#EEF6F3] transition lg:hidden cursor-pointer"
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
          className="border-t border-[#577877]/15 bg-white px-6 py-4 lg:hidden animate-in fade-in slide-in-from-top-2 duration-200"
        >
          <nav aria-label="Mobile navigation" className="flex flex-col gap-1.5">
            {PUBLIC_NAV_LINKS.map((item) => (
              <a
                key={item.label}
                href={item.path}
                onClick={(e) => handleLinkClick(item, e)}
                className={getLinkClass(item)}
              >
                {item.label}
              </a>
            ))}
            <button
              type="button"
              onClick={() => go("/doctor/register")}
              className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#1A7D67] hover:bg-[#EEF6F3] cursor-pointer"
            >
              Clinician Registration
            </button>
            <div className="mt-3 flex gap-2 border-t border-[#577877]/15 pt-4">
              <button
                type="button"
                onClick={() => go("/login")}
                className="flex-1 rounded-xl border border-[#577877]/30 bg-white px-3 py-2.5 text-xs font-semibold text-[#162623] cursor-pointer"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => go("/find-doctors")}
                className="flex-1 rounded-xl bg-[#1A7D67] px-3 py-2.5 text-xs font-bold text-white cursor-pointer"
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
