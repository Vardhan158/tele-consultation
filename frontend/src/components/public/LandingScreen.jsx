import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import "./landing-theme.css";

const navItems = [
  { label: "Home", to: "/", route: true },
  { label: "Find Doctors", to: "/find-doctors", route: true },
  { label: "How It Works", to: "/how-it-works", route: true },
  { label: "About Us", to: "/about-us", route: true },
  { label: "Contact", to: "/contact", route: true },
];

function navLinkClass({ isActive }) {
  return `rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#295255] focus-visible:ring-offset-2 ${
    isActive
      ? "bg-[#F0F5F7] text-[#295255]"
      : "text-[#577877] hover:bg-[#F0F5F7] hover:text-[#162623]"
  }`;
}

export default function LandingScreen({
  onSignIn,
  onRegister,
  onDoctorRegister,
  onFindDoctor,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (location.hash === "#how-it-works") {
      requestAnimationFrame(() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  }, [location.hash]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="min-h-screen bg-[#F0F5F7] font-sans text-[#162623]">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-[rgba(87,120,119,0.15)] bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-5 py-4 lg:px-10">
          <NavLink
            to="/"
            aria-label="Kaizentrix Care home"
            className="flex shrink-0 items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#295255] focus-visible:ring-offset-2"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#295255] text-white shadow-sm">
              <span className="material-symbols-outlined !text-white text-2xl font-bold">
                health_and_safety
              </span>
            </div>
            <div>
              <p className="font-headline-sm text-lg font-bold text-[#162623] tracking-tight leading-none">
                Kaizentrix Care
              </p>
              <p className="text-[10px] font-semibold text-[#577877] tracking-widest uppercase mt-0.5">
                Patient Portal
              </p>
            </div>
          </NavLink>

          <nav
            aria-label="Primary navigation"
            className="hidden items-center gap-1 xl:flex"
          >
            {navItems.map((item) =>
              item.route ? (
                <NavLink
                  key={item.label}
                  to={item.to}
                  className={navLinkClass}
                  end
                >
                  {item.label}
                </NavLink>
              ) : (
                <a
                  key={item.label}
                  href={item.to}
                  className={navLinkClass({ isActive: location.hash === item.to.slice(1) })}
                >
                  {item.label}
                </a>
              ),
            )}
          </nav>

          <div className="hidden items-center gap-3 lg:flex">
            <button
              type="button"
              onClick={onDoctorRegister}
              className="rounded-lg px-2 py-2 text-xs font-semibold text-[#295255] transition hover:bg-[#F0F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#295255] focus-visible:ring-offset-2"
            >
              Clinician registration
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[rgba(87,120,119,0.35)] bg-white px-4 py-2 text-xs font-semibold text-[#295255] shadow-sm transition hover:border-[#295255] hover:bg-[#F0F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#295255] focus-visible:ring-offset-2"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={onRegister}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#295255] px-4 py-2 text-xs font-semibold text-white shadow-[0_2px_8px_rgba(41,82,85,0.2)] transition hover:bg-[#1F3F41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#295255] focus-visible:ring-offset-2"
            >
              Create Account
            </button>
          </div>

          <button
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
            className="rounded-lg p-2 text-[#295255] transition hover:bg-[#F0F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#295255] focus-visible:ring-offset-2 lg:hidden"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {menuOpen ? "close" : "menu"}
            </span>
          </button>
        </div>
        {menuOpen && (
          <div
            id="mobile-navigation"
            className="border-t border-[rgba(87,120,119,0.15)] bg-white px-5 py-4 lg:hidden"
          >
            <nav aria-label="Mobile navigation" className="flex flex-col gap-1">
              {navItems.map((item) =>
                item.route ? (
                  <NavLink
                    key={item.label}
                    to={item.to}
                    onClick={closeMenu}
                    className={navLinkClass}
                    end
                  >
                    {item.label}
                  </NavLink>
                ) : (
                  <a
                    key={item.label}
                    href={item.to}
                    onClick={closeMenu}
                    className={navLinkClass({ isActive: location.hash === item.to.slice(1) })}
                  >
                    {item.label}
                  </a>
                ),
              )}
              <button
                type="button"
                onClick={() => {
                  closeMenu();
                  onDoctorRegister();
                }}
                className="rounded-lg px-3 py-2 text-left text-sm font-medium text-[#295255] hover:bg-[#F0F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#295255] focus-visible:ring-offset-2"
              >
                Clinician registration
              </button>
              <div className="mt-3 flex gap-2 border-t border-[rgba(87,120,119,0.15)] pt-4">
                <button
                  type="button"
                  onClick={() => {
                    closeMenu();
                    onSignIn();
                  }}
                  className="inline-flex flex-1 items-center justify-center rounded-xl border border-[rgba(87,120,119,0.35)] bg-white px-4 py-2 text-xs font-semibold text-[#295255] shadow-sm transition hover:bg-[#F0F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#295255] focus-visible:ring-offset-2"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeMenu();
                    onRegister();
                  }}
                  className="inline-flex flex-1 items-center justify-center rounded-xl bg-[#295255] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1F3F41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#295255] focus-visible:ring-offset-2"
                >
                  Create Account
                </button>
              </div>
            </nav>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-[#295255] px-6 py-20 text-white lg:px-10 lg:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-medium text-[#F0F5F7]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Secure teleconsultation platform
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight">
              Connected care, thoughtfully delivered.
            </h1>

            <p className="text-base sm:text-lg text-[#F0F5F7]/85 max-w-xl leading-relaxed">
              Find the right care, book a convenient appointment, and stay
              connected with your care team from wherever you are.
            </p>

            <div className="flex flex-wrap gap-3.5 pt-2">
              <button
                type="button"
                onClick={onFindDoctor}
                className="px-6 py-3.5 rounded-xl bg-[#F0F5F7] text-[#295255] font-semibold text-sm shadow-lg hover:bg-white transition"
              >
                Find a Doctor
              </button>
              <button
                type="button"
                onClick={onRegister}
                className="px-6 py-3.5 rounded-xl border border-white/30 text-white font-semibold text-sm hover:bg-white/10 transition"
              >
                Create Patient Account
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-4 text-xs text-[#F0F5F7]/80">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined !text-[#F0F5F7] text-lg">
                  person_search
                </span>
                Care that fits your needs
              </span>
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined !text-[#F0F5F7] text-lg">
                  calendar_month
                </span>
                Flexible appointments
              </span>
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined !text-[#F0F5F7] text-lg">
                  support_agent
                </span>
                Care team support
              </span>
            </div>
          </div>

          {/* Illustrative teleconsultation preview */}
          <div className="rounded-[1.75rem] border border-white/60 bg-white p-4 text-[#162623] shadow-2xl sm:p-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#577877]">
                  Illustrative Preview
                </p>
                <h3 className="mt-1 text-sm font-semibold text-[#162623]">
                  A calmer way to meet your care team
                </h3>
              </div>
              <span className="rounded-full border border-[#577877]/20 bg-[#F0F5F7] px-2.5 py-1 text-[10px] font-semibold text-[#577877]">
                Preview
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="relative aspect-[1.25] overflow-hidden rounded-2xl bg-[#295255] p-3 text-white">
                <div className="absolute inset-0 bg-gradient-to-br from-[#577877] via-[#295255] to-[#162623]" />
                <div className="relative flex h-full flex-col justify-between">
                  <span className="self-start rounded-md bg-black/20 px-2 py-1 text-[10px] font-medium">
                    Dr. Sarah Chen
                  </span>
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/70 bg-[#F0F5F7] text-2xl font-semibold text-[#295255]">
                    SC
                  </div>
                  <span className="text-[10px] text-white/80">
                    Care specialist
                  </span>
                </div>
              </div>
              <div className="relative aspect-[1.25] overflow-hidden rounded-2xl bg-[#F0F5F7] p-3">
                <div className="relative flex h-full flex-col justify-between">
                  <span className="self-start rounded-md bg-white/80 px-2 py-1 text-[10px] font-medium text-[#577877]">
                    You
                  </span>
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-2 border-white bg-white text-2xl font-semibold text-[#577877] shadow-sm">
                    YU
                  </div>
                  <span className="text-[10px] text-[#577877]">
                    Patient view
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-center gap-2">
              {["mic", "videocam"].map((icon) => (
                <span
                  key={icon}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F0F5F7] text-[#295255]"
                >
                  <span className="material-symbols-outlined text-base !text-[#295255]">
                    {icon}
                  </span>
                </span>
              ))}
              <span className="flex h-9 w-12 items-center justify-center rounded-full bg-[#295255] text-white">
                <span className="material-symbols-outlined text-base !text-white">
                  call_end
                </span>
              </span>
            </div>

            <div className="mt-5 flex items-center justify-between rounded-2xl border border-[#577877]/15 bg-[#F0F5F7] p-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#577877]">
                  Upcoming appointment
                </p>
                <p className="mt-1 text-xs font-semibold text-[#162623]">
                  General care · 30 minutes
                </p>
              </div>
              <span className="material-symbols-outlined !text-[#295255]">
                event_available
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Core Portal Modules Feature Grid */}
      <section id="how-it-works" className="scroll-mt-24 mx-auto max-w-7xl px-6 py-20 lg:px-10 space-y-12">
        <div className="max-w-2xl space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
            Enterprise Healthcare Platform
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#162623]">
            How Your Care Journey Works
          </h2>
          <p className="text-sm text-[#577877]">
            Designed with clinical clarity, intuitive navigation, and robust
            security for modern patients.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              title: "Doctor Discovery",
              desc: "Search clinic-vetted doctors across multiple specialties with verified fees and credentials.",
              icon: "person_search",
            },
            {
              title: "Appointment Booking",
              desc: "Book verified time slots with automated reminders, rescheduling, and cancellation policies.",
              icon: "calendar_month",
            },
            {
              title: "Video Visits",
              desc: "Browser teleconsultation with clinical chat, vital review, and screen sharing.",
              icon: "videocam",
            },
            {
              title: "E-Prescriptions & Rx",
              desc: "Clinician-signed digital prescriptions with dosage, frequency, and refill counts.",
              icon: "medication",
            },
            {
              title: "Medical Records Vault",
              desc: "Secure repository for lab panels, cardiology traces, and radiology scans up to 25 MB.",
              icon: "folder_shared",
            },
            {
              title: "Payments & Invoicing",
              desc: "Instant server verification for UPI, cards, and net banking with downloadable GST receipts.",
              icon: "receipt_long",
            },
            {
              title: "Care Notifications",
              desc: "Operational updates and appointment alerts via multi-channel in-app and SMS.",
              icon: "notifications",
            },
            {
              title: "Consent Controls",
              desc: "Granular consent tracking for video care, records, and diagnostic releases.",
              icon: "badge",
            },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-[rgba(87,120,119,0.15)] bg-white p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] transition hover:shadow-[0_10px_25px_-3px_rgba(22,38,35,0.08)]">
              <span className="w-12 h-12 rounded-xl bg-[#F0F5F7] flex items-center justify-center">
                <span className="material-symbols-outlined !text-[#295255] text-2xl">
                  {item.icon}
                </span>
              </span>
              <h3 className="text-base font-bold text-[#162623]">
                {item.title}
              </h3>
              <p className="text-xs text-[#577877] leading-relaxed">
                {item.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Footer Banner */}
      <section className="bg-white border-t border-[#577877]/20 py-16 px-6 lg:px-10">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-6">
          <div>
            <h3 className="text-xl sm:text-2xl font-bold text-[#162623]">
              Ready to take charge of your care?
            </h3>
            <p className="text-xs sm:text-sm text-[#577877] mt-1">
              Create your account or log in to access your personal patient
              workspace.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onRegister}
              className="inline-flex items-center justify-center rounded-xl bg-[#295255] px-6 py-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#1F3F41] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#295255] focus-visible:ring-offset-2"
            >
              Create Patient Account
            </button>
            <button
              onClick={onSignIn}
              className="inline-flex items-center justify-center rounded-xl border border-[rgba(87,120,119,0.35)] bg-white px-6 py-3 text-xs font-semibold text-[#295255] shadow-sm transition hover:bg-[#F0F5F7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#295255] focus-visible:ring-offset-2"
            >
              Sign In
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#577877]/20 bg-[#F0F5F7] py-8 px-6 lg:px-10 text-xs text-[#577877]">
        <div className="mx-auto max-w-7xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>© 2026 Kaizentrix Care · Patient Portal. All rights reserved.</p>
          <div className="flex gap-6">
            <span>Privacy-focused care workflows</span>
            <span>Privacy Policy</span>
            <span>Terms of Use</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
