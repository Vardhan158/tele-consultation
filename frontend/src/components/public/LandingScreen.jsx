import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Lenis from "lenis";
import "./landing-theme.css";

// ============================================================================
// Scroll Animation Hooks & Components
// ============================================================================

function useInView(options = { threshold: 0.15, rootMargin: "0px 0px -40px 0px", triggerOnce: true }) {
  const [inView, setInView] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true);
        if (options.triggerOnce !== false) {
          observer.unobserve(el);
        }
      } else if (options.triggerOnce === false) {
        setInView(false);
      }
    }, options);

    observer.observe(el);
    return () => observer.disconnect();
  }, [options.threshold, options.rootMargin, options.triggerOnce]);

  return [ref, inView];
}

function ScrollReveal({
  children,
  animation = "fade-up",
  delay = 0,
  duration = 750,
  className = "",
}) {
  const [ref, inView] = useInView();

  const getTransform = () => {
    if (inView) return "translate-x-0 translate-y-0 scale-100 opacity-100";
    switch (animation) {
      case "fade-up":
        return "translate-y-12 opacity-0";
      case "fade-down":
        return "-translate-y-8 opacity-0";
      case "fade-left":
        return "-translate-x-14 opacity-0";
      case "fade-right":
        return "translate-x-14 opacity-0";
      case "zoom-in":
        return "scale-95 opacity-0";
      default:
        return "translate-y-10 opacity-0";
    }
  };

  return (
    <div
      ref={ref}
      style={{
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`,
        transitionTimingFunction: "cubic-bezier(0.16, 1, 0.3, 1)",
      }}
      className={`transform transition-all will-change-transform ${getTransform()} ${className}`}
    >
      {children}
    </div>
  );
}

function AnimatedNumber({ target, suffix = "", duration = 1600 }) {
  const [ref, inView] = useInView();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!inView) return;
    let startTime = null;
    let frameId;

    const step = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / duration, 1);
      // easeOutExpo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCount(Math.floor(ease * target));
      if (progress < 1) {
        frameId = requestAnimationFrame(step);
      } else {
        setCount(target);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [inView, target, duration]);

  return (
    <span ref={ref}>
      {count}
      {suffix}
    </span>
  );
}

// ============================================================================
// Main Landing Screen Component
// ============================================================================

export default function LandingScreen({
  onSignIn,
  onRegister,
  onDoctorRegister,
  onFindDoctor,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [heroMounted, setHeroMounted] = useState(true);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  const lenisRef = useRef(null);

  // Initialize 60+ FPS inertia smooth scrolling with Lenis
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // smooth easeOutExpo
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
    });
    lenisRef.current = lenis;

    const onScroll = ({ scroll }) => {
      setScrolled(scroll > 40);
    };
    lenis.on("scroll", onScroll);

    let rafId;
    function raf(time) {
      lenis.raf(time);
      rafId = requestAnimationFrame(raf);
    }
    rafId = requestAnimationFrame(raf);

    return () => {
      cancelAnimationFrame(rafId);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  useEffect(() => {
    // Trigger hero entrance animation on mount
    const timer = setTimeout(() => setHeroMounted(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (location.hash) {
      const target = document.getElementById(location.hash.slice(1));
      if (target) {
        if (lenisRef.current) {
          lenisRef.current.scrollTo(target, { offset: -80 });
        } else {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }
  }, [location.hash]);

  const closeMenu = () => setMenuOpen(false);

  const scrollToSection = (id) => {
    closeMenu();
    const el = document.getElementById(id);
    if (el) {
      if (lenisRef.current) {
        lenisRef.current.scrollTo(el, { offset: -80 });
      } else {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
  };

  return (
    <div className="min-h-screen bg-white font-sans text-[#162623] antialiased selection:bg-[#1A7D67] selection:text-white overflow-x-hidden">
      {/* ========================================================= */}
      {/* 1. HERO SECTION & TOP NAVBAR                              */}
      {/* ========================================================= */}
      <section
        id="home"
        className="relative w-full overflow-hidden flex flex-col justify-between"
        style={{
          background:
            "linear-gradient(180deg, #1A7D67 0%, #358C79 11%, #519C8C 22%, #6DAC9F 33%, #7BB4A8 38.4%, #86BBAF 44%, #9BC7BC 55%, #B0D4C9 66%, #C5E0D6 77%, #D9EBE3 88%, #EEF6F3 100%)",
          minHeight: "912px",
        }}
      >
        {/* Top Navbar — 100% Transparent (Initial) & Smooth Transition on Scroll */}
        <header
          className={`fixed top-0 left-0 right-0 z-50 w-full transform transition-all duration-500 ease-out will-change-transform ${
            heroMounted ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0"
          } ${
            scrolled
              ? "bg-white/85 backdrop-blur-xl shadow-md border-b border-zinc-200/50 py-3.5"
              : "bg-transparent border-b border-transparent py-5 sm:py-6"
          }`}
        >
          <div className="mx-auto flex max-w-[1440px] items-center justify-between px-6 sm:px-10 lg:px-16 xl:px-20">
            {/* Brand Logo */}
            <a
              href="#home"
              onClick={(e) => {
                e.preventDefault();
                scrollToSection("home");
              }}
              className="flex items-center gap-2.5 focus-visible:outline-none transition-transform hover:scale-102"
              aria-label="Kaizen Care Home"
            >
              <svg
                width="34"
                height="38"
                viewBox="0 0 35 42"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className={`h-8 sm:h-9 w-auto shrink-0 select-none transition-colors duration-500 ${
                  scrolled ? "text-[#1A7D67]" : "text-white"
                }`}
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
              <span
                className={`text-2xl sm:text-[26px] font-bold tracking-tight select-none transition-colors duration-500 ${
                  scrolled ? "text-[#162623]" : "text-white"
                }`}
              >
                Kaizen Care
              </span>
            </a>

            {/* Center Navigation Links */}
            <nav
              aria-label="Primary navigation"
              className="hidden md:flex items-center gap-7 lg:gap-9 text-sm lg:text-[15px] font-medium"
            >
              <a
                href="#home"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("home");
                }}
                className={`transition-colors duration-500 relative py-1 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 hover:after:w-full after:transition-all ${
                  scrolled
                    ? "text-zinc-700 hover:text-[#1A7D67] after:bg-[#1A7D67]"
                    : "text-white/95 hover:text-white after:bg-white"
                }`}
              >
                Home
              </a>
              <button
                type="button"
                onClick={onFindDoctor}
                className={`transition-colors duration-500 relative py-1 cursor-pointer after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 hover:after:w-full after:transition-all ${
                  scrolled
                    ? "text-zinc-700 hover:text-[#1A7D67] after:bg-[#1A7D67]"
                    : "text-white/95 hover:text-white after:bg-white"
                }`}
              >
                Find Doctors
              </button>
              <a
                href="#how-it-works"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("how-it-works");
                }}
                className={`transition-colors duration-500 relative py-1 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 hover:after:w-full after:transition-all ${
                  scrolled
                    ? "text-zinc-700 hover:text-[#1A7D67] after:bg-[#1A7D67]"
                    : "text-white/95 hover:text-white after:bg-white"
                }`}
              >
                How It Works
              </a>
              <a
                href="#services"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("services");
                }}
                className={`transition-colors duration-500 relative py-1 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 hover:after:w-full after:transition-all ${
                  scrolled
                    ? "text-zinc-700 hover:text-[#1A7D67] after:bg-[#1A7D67]"
                    : "text-white/95 hover:text-white after:bg-white"
                }`}
              >
                Services
              </a>
              <a
                href="#about"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("about");
                }}
                className={`transition-colors duration-500 relative py-1 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 hover:after:w-full after:transition-all ${
                  scrolled
                    ? "text-zinc-700 hover:text-[#1A7D67] after:bg-[#1A7D67]"
                    : "text-white/95 hover:text-white after:bg-white"
                }`}
              >
                About
              </a>
              <a
                href="#faqs"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("faqs");
                }}
                className={`transition-colors duration-500 relative py-1 after:absolute after:bottom-0 after:left-0 after:h-0.5 after:w-0 hover:after:w-full after:transition-all ${
                  scrolled
                    ? "text-zinc-700 hover:text-[#1A7D67] after:bg-[#1A7D67]"
                    : "text-white/95 hover:text-white after:bg-white"
                }`}
              >
                FAQs
              </a>
            </nav>

            {/* Right Action Button */}
            <div className="hidden sm:flex items-center gap-3">
              <button
                type="button"
                onClick={onSignIn}
                className={`text-sm font-medium transition-colors duration-500 px-3 py-1.5 rounded-lg cursor-pointer ${
                  scrolled
                    ? "text-zinc-700 hover:text-[#1A7D67] hover:bg-zinc-100/60"
                    : "text-white/95 hover:text-white hover:bg-white/10"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={onFindDoctor}
                className={`inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium shadow-xs transition-all duration-500 group cursor-pointer hover:-translate-y-0.5 ${
                  scrolled
                    ? "bg-[#1A7D67] text-white hover:bg-[#156654] hover:shadow-md"
                    : "bg-white text-[#162623] hover:bg-white/95 hover:shadow-md"
                }`}
              >
                <span>Book Appointment</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform duration-300 group-hover:translate-x-1"
                >
                  <path d="M5 12h14"></path>
                  <path d="m12 5 7 7-7 7"></path>
                </svg>
              </button>
            </div>

            {/* Mobile Menu Toggle */}
            <button
              type="button"
              aria-label="Toggle navigation menu"
              onClick={() => setMenuOpen(!menuOpen)}
              className={`p-2 rounded-lg transition-colors duration-300 md:hidden focus-visible:outline-none ${
                scrolled
                  ? "text-zinc-800 hover:bg-zinc-100/50"
                  : "text-white hover:bg-white/10"
              }`}
            >
              {menuOpen ? (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                </svg>
              )}
            </button>
          </div>

          {/* Mobile Drawer */}
          {menuOpen && (
            <div
              className={`fixed inset-x-0 ${
                scrolled ? "top-[64px]" : "top-[76px]"
              } z-50 border-b ${
                scrolled
                  ? "bg-white/95 backdrop-blur-xl text-zinc-800 shadow-xl border-zinc-200/60"
                  : "bg-[#1A7D67]/98 backdrop-blur-xl text-white shadow-xl border-white/15"
              } px-6 py-6 md:hidden animate-in fade-in slide-in-from-top-4 duration-300 transition-all`}
            >
              <div className="flex flex-col gap-4 text-base font-medium">
                <a
                  href="#home"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("home");
                  }}
                  className="py-1 hover:opacity-80"
                >
                  Home
                </a>
                <button
                  type="button"
                  onClick={() => {
                    closeMenu();
                    onFindDoctor();
                  }}
                  className="text-left py-1 hover:opacity-80 font-medium"
                >
                  Find Doctors
                </button>
                <a
                  href="#how-it-works"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("how-it-works");
                  }}
                  className="py-1 hover:opacity-80"
                >
                  How It Works
                </a>
                <a
                  href="#services"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("services");
                  }}
                  className="py-1 hover:opacity-80"
                >
                  Services
                </a>
                <a
                  href="#about"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("about");
                  }}
                  className="py-1 hover:opacity-80"
                >
                  About
                </a>
                <a
                  href="#faqs"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("faqs");
                  }}
                  className="py-1 hover:opacity-80"
                >
                  FAQs
                </a>
                <div
                  className={`pt-4 border-t flex flex-col gap-3 ${
                    scrolled ? "border-zinc-200" : "border-white/20"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      closeMenu();
                      onDoctorRegister();
                    }}
                    className={`text-left text-sm font-medium ${
                      scrolled
                        ? "text-[#1A7D67] hover:underline"
                        : "text-emerald-100 hover:text-white"
                    }`}
                  >
                    Clinician Registration
                  </button>
                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        onSignIn();
                      }}
                      className={`flex-1 py-2.5 rounded-lg border text-center text-sm font-medium ${
                        scrolled
                          ? "border-zinc-300 bg-zinc-50 text-zinc-800"
                          : "border-white/40 bg-white/10 text-white"
                      }`}
                    >
                      Sign In
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        closeMenu();
                        onFindDoctor();
                      }}
                      className={`flex-1 py-2.5 rounded-lg text-center text-sm font-medium shadow-sm ${
                        scrolled
                          ? "bg-[#1A7D67] text-white"
                          : "bg-white text-[#162623]"
                      }`}
                    >
                      Book Appointment
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </header>

        {/* Hero Content Section */}
        <div className="relative mx-auto flex-1 flex flex-col lg:flex-row items-center lg:items-end justify-between w-full max-w-[1440px] px-6 sm:px-10 lg:px-16 xl:px-20 pt-24 sm:pt-28 lg:pt-32 pb-0">
          {/* Left Column Text & CTAs */}
          <div className="flex-1 max-w-2xl self-center lg:self-center pb-12 lg:pb-24 pt-4 lg:pt-0 z-10">
            {/* Pill Tag */}
            <div
              className={`inline-flex items-center gap-2 pl-3 pr-4 py-1.5 rounded-full border border-white/40 bg-white/10 backdrop-blur-sm text-xs sm:text-sm font-medium text-white mb-6 shadow-sm transform transition-all duration-300 ${
                heroMounted ? "translate-y-0 opacity-100" : "-translate-y-4 opacity-0"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-white"
              >
                <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
              <span>Online Healthcare Platform</span>
            </div>

            {/* Display Heading */}
            <h1
              className={`text-4xl sm:text-5xl lg:text-[62px] xl:text-[68px] font-bold text-white tracking-tight leading-[1.12] mb-5 transform transition-all duration-300 ${
                heroMounted ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
              }`}
            >
              Quality Healthcare, Wherever You Are.
            </h1>

            {/* Description */}
            <p
              className={`text-sm sm:text-base lg:text-[17px] text-white/90 max-w-xl leading-relaxed mb-10 font-normal transform transition-all duration-300 ${
                heroMounted ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
              }`}
            >
              Connect with qualified healthcare professionals through seamless online doctor consultations,
              easy appointment booking, and secure video consultations from the comfort of your home.
            </p>

            {/* Action Buttons */}
            <div
              className={`flex flex-wrap items-center gap-4 mb-10 transform transition-all duration-300 ${
                heroMounted ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
              }`}
            >
              <button
                type="button"
                onClick={onFindDoctor}
                className="inline-flex items-center gap-2 rounded-lg bg-[#165849] hover:bg-[#124b3e] text-white text-sm sm:text-base font-medium px-6 py-3.5 transition-all duration-300 shadow-md hover:shadow-lg hover:-translate-y-0.5 group cursor-pointer"
              >
                <span>Book Appointment</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform group-hover:translate-x-1"
                >
                  <path d="M5 12h14"></path>
                  <path d="m12 5 7 7-7 7"></path>
                </svg>
              </button>
              <a
                href="#how-it-works"
                onClick={(e) => {
                  e.preventDefault();
                  scrollToSection("how-it-works");
                }}
                className="inline-flex items-center justify-center rounded-lg bg-white hover:bg-white/95 text-[#165849] text-sm sm:text-base font-medium px-6 py-3.5 transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
              >
                How It Works
              </a>
            </div>

            {/* Factual Messaging & Security Proof */}
            <div
              className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/85 backdrop-blur-md border border-white/60 shadow-xs text-sm transform transition-all duration-300 ${
                heroMounted ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
              }`}
            >
              <span className="material-symbols-outlined text-[#145A4A] text-lg shrink-0">
                verified_user
              </span>
              <span className="text-[#145A4A] font-semibold text-xs sm:text-sm tracking-tight">
                Secure Video Consultations · Qualified Healthcare Professionals · Digital Prescriptions
              </span>
            </div>
          </div>

          {/* Right Column Physician Image */}
          <div
            className={`flex-1 w-full flex justify-center lg:justify-end items-end self-end z-10 mt-6 lg:mt-0 transform transition-all duration-300 ${
              heroMounted ? "translate-y-0 opacity-100 scale-100" : "translate-y-12 opacity-0 scale-98"
            }`}
          >
            <img
              src="/assets/doctor.png"
              alt="Physician at Kaizen Care"
              className="w-auto h-auto max-h-[500px] sm:max-h-[580px] lg:max-h-[660px] xl:max-h-[720px] object-contain object-bottom pointer-events-none select-none drop-shadow-sm transition-transform duration-700 hover:scale-[1.01]"
              loading="eager"
            />
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 2. STATS MARQUEE (PLATFORM HIGHLIGHTS)                     */}
      {/* ========================================================= */}
      <section
        aria-label="Clinical Highlights"
        className="relative w-full overflow-hidden bg-[#1A7D67] border-y border-white/10 py-5 sm:py-6 select-none shadow-inner"
      >
        {/* Soft edge gradient masks */}
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-16 sm:w-28 bg-gradient-to-r from-[#1A7D67] via-[#1A7D67]/80 to-transparent z-10" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-16 sm:w-28 bg-gradient-to-l from-[#1A7D67] via-[#1A7D67]/80 to-transparent z-10" />

        <div className="animate-marquee flex items-center">
          {[...Array(2)].map((_, setIdx) => (
            <div key={setIdx} className="flex items-center shrink-0">
              {[
                "Qualified Healthcare Professionals",
                "Secure Video Consultations",
                "Digital Prescriptions After Consultation",
                "Seamless Slot Booking",
                "Secure Medical Records",
                "Patient Data Privacy & Security",
              ].map((text, idx) => (
                <div key={idx} className="flex items-center">
                  <div className="flex items-center gap-2.5 px-6 sm:px-10">
                    <span className="font-poppins font-semibold text-sm sm:text-base text-white opacity-95 tracking-wide uppercase">
                      {text}
                    </span>
                  </div>
                  <span
                    className="inline-block size-1.5 rounded-full bg-white/40 shrink-0"
                    aria-hidden="true"
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      {/* ========================================================= */}
      {/* HOW IT WORKS SECTION (4-Step Process)                     */}
      {/* ========================================================= */}
      <section
        id="how-it-works"
        className="scroll-mt-16 w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 xl:px-20 py-20 md:py-28"
      >
        <ScrollReveal animation="fade-up">
          <div className="flex flex-col items-center text-center max-w-2xl mx-auto space-y-3 mb-16">
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-zinc-300 text-xs sm:text-sm text-zinc-600 uppercase font-semibold">
              <span className="size-2 rounded-full bg-[#1A7D67]"></span>
              Simple 4-Step Process
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium text-zinc-800 leading-tight">
              How Kaizen Care Works
            </h2>
            <p className="text-zinc-600 text-sm sm:text-base">
              Get quality medical care in four easy steps from anywhere.
            </p>
          </div>
        </ScrollReveal>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            {
              step: "01",
              title: "Find a Doctor",
              desc: "Search qualified healthcare professionals by specialty, language, or consultation availability.",
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              ),
            },
            {
              step: "02",
              title: "Book Appointment",
              desc: "Choose an available date and time, complete payment if required, and receive your appointment confirmation.",
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                  <line x1="16" x2="16" y1="2" y2="6" />
                  <line x1="8" x2="8" y1="2" y2="6" />
                  <line x1="3" x2="21" y1="10" y2="10" />
                </svg>
              ),
            },
            {
              step: "03",
              title: "Consult Online",
              desc: "Join high-definition, secure video consultations with your doctor from any device.",
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="23 7 16 12 23 17 23 7" />
                  <rect width="15" height="14" x="1" y="5" rx="2" ry="2" />
                </svg>
              ),
            },
            {
              step: "04",
              title: "Access Records",
              desc: "Access consultation summaries, doctor-issued prescriptions, and available medical records after your consultation.",
              icon: (
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              ),
            },
          ].map((item, idx) => (
            <ScrollReveal key={idx} animation="fade-up" delay={idx * 100}>
              <div className="relative p-6 rounded-2xl bg-[#F9FBFA] border border-zinc-200/80 hover:border-[#1A7D67]/40 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 h-full flex flex-col justify-between group">
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <div className="size-12 rounded-xl bg-[#EEF6F3] text-[#1A7D67] group-hover:bg-[#1A7D67] group-hover:text-white flex items-center justify-center transition-colors duration-300 shadow-xs">
                      {item.icon}
                    </div>
                    <span className="text-2xl font-bold font-poppins text-zinc-300 group-hover:text-[#1A7D67]/40 transition-colors">
                      {item.step}
                    </span>
                  </div>
                  <h3 className="font-semibold text-lg text-zinc-800 mb-2 group-hover:text-[#1A7D67] transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-zinc-600 text-sm leading-relaxed">
                    {item.desc}
                  </p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ========================================================= */}
      {/* 3. ABOUT US SECTION (Personalized Care, Trusted Results)   */}
      {/* ========================================================= */}
      <section
        id="about"
        className="scroll-mt-16 w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 xl:px-20 py-24 md:py-32"
      >
        <div className="flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-16">
          {/* Left: About Image with Fade-Left */}
          <div className="w-full lg:w-1/2 flex justify-center">
            <ScrollReveal animation="fade-left" duration={900}>
              <div className="relative w-full max-w-[530px] overflow-hidden rounded-2xl shadow-xl border border-zinc-200 group">
                <img
                  src="/assets/about.png"
                  alt="Personalized Care, Trusted Results"
                  className="w-full h-auto object-cover rounded-2xl transition-transform duration-700 group-hover:scale-103"
                />
              </div>
            </ScrollReveal>
          </div>

          {/* Right: Content with Fade-Right */}
          <div className="w-full lg:w-1/2 flex flex-col items-start">
            <ScrollReveal animation="fade-right" duration={900}>
              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-zinc-300 text-xs sm:text-sm text-zinc-600 uppercase font-semibold mb-6">
                <span className="size-2 rounded-full bg-[#1A7D67] animate-ping"></span>
                About Us
              </div>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium text-zinc-800 leading-tight tracking-tight mb-4 max-w-lg">
                Personalized Care, Wherever You Are
              </h2>

              <p className="text-zinc-600 text-sm sm:text-base leading-relaxed mb-4 max-w-xl">
                Kaizen Care is an online teleconsultation platform connecting patients with qualified healthcare professionals. Patients can discover doctors, book appointments, attend secure video consultations, and access their consultation records through one convenient digital platform.
              </p>

              <p className="text-zinc-600 text-sm sm:text-base leading-relaxed mb-8 max-w-xl">
                Our goal is to make healthcare more accessible by simplifying the entire patient journey, from appointment booking to consultation completion and follow-up care.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full mb-8">
                <div className="flex items-start gap-3 p-3 rounded-xl transition-colors hover:bg-zinc-50">
                  <div className="h-10 w-10 rounded-xl bg-[#EEF6F3] text-[#1A7D67] flex items-center justify-center shrink-0 shadow-xs">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-[#1A7D67]"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      <path d="m9 12 2 2 4-4" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-800">
                      Qualified Healthcare Professionals
                    </h4>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Connect with doctors across available medical specialties.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 p-3 rounded-xl transition-colors hover:bg-zinc-50">
                  <div className="h-10 w-10 rounded-xl bg-[#EEF6F3] text-[#1A7D67] flex items-center justify-center shrink-0 shadow-xs">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="text-[#1A7D67]"
                    >
                      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-zinc-800">
                      Digital Health Records
                    </h4>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      Access consultation summaries, doctor-issued prescriptions, and available medical records securely.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={onFindDoctor}
                  className="bg-[#197C66] hover:bg-[#156755] text-white text-sm font-medium px-6 py-3 rounded-lg transition duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
                >
                  Meet Our Doctors
                </button>
                <button
                  type="button"
                  onClick={onRegister}
                  className="border border-zinc-300 hover:border-zinc-400 bg-white text-zinc-700 text-sm font-medium px-6 py-3 rounded-lg transition duration-300 hover:-translate-y-0.5 cursor-pointer"
                >
                  Register As Patient
                </button>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 4. OUR SERVICES SECTION                                   */}
      {/* ========================================================= */}
      <section
        id="services"
        className="scroll-mt-16 py-24 md:py-32 bg-[#F9FBFA] border-y border-zinc-200"
      >
        <div className="w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 xl:px-20 space-y-12">
          {/* Section Header with Fade-Up */}
          <ScrollReveal animation="fade-up">
            <div className="flex flex-col items-center text-center max-w-2xl mx-auto space-y-3">
              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-zinc-300 text-xs sm:text-sm text-zinc-600 uppercase font-semibold">
                <span className="size-2 rounded-full bg-[#1A7D67]"></span>
                Our Services
              </div>
              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium text-zinc-800 leading-tight">
                Healthcare Services Designed for You
              </h2>
              <p className="text-zinc-600 text-sm sm:text-base max-w-xl">
                Connect with qualified healthcare professionals through online consultations, appointment booking, digital health records, and follow-up care.
              </p>
            </div>
          </ScrollReveal>

          {/* Services Grid with Staggered Cascading Animation */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                title: "General Consultation",
                desc: "Connect with qualified doctors for general health concerns through online consultations.",
                svg: (
                  <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
                    <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
                    <circle cx="20" cy="10" r="2" />
                  </svg>
                ),
              },
              {
                title: "Preventive Health Guidance",
                desc: "Receive preventive health advice, wellness recommendations, and follow-up guidance through online consultations.",
                svg: (
                  <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    <path d="m9 12 2 2 4-4" />
                  </svg>
                ),
              },
              {
                title: "Specialist Consultation",
                desc: "Consult available medical specialists for expert advice and ongoing care.",
                svg: (
                  <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                    <path d="M12 5v14" />
                  </svg>
                ),
              },
              {
                title: "Online Video Consultation",
                desc: "Attend scheduled, secure video consultations with your doctor from a supported device.",
                svg: (
                  <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="23 7 16 12 23 17 23 7" />
                    <rect width="15" height="14" x="1" y="5" rx="2" ry="2" />
                  </svg>
                ),
              },
              {
                title: "Digital Prescriptions & Records",
                desc: "Access doctor-issued prescriptions, consultation summaries, and available medical records.",
                svg: (
                  <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                ),
              },
              {
                title: "Follow-up & Support",
                desc: "Schedule follow-up appointments and receive continued consultation-related assistance.",
                svg: (
                  <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                    <path d="M16 16h5v5" />
                  </svg>
                ),
              },
            ].map((service, idx) => (
              <ScrollReveal
                key={idx}
                animation="fade-up"
                delay={idx * 100}
                duration={700}
                className="h-full"
              >
                <div className="flex flex-col items-center text-center bg-white hover:bg-[#EEF6F3]/50 border border-zinc-200 hover:border-[#1A7D67]/40 rounded-2xl px-8 py-10 transition-all duration-300 shadow-sm hover:shadow-xl hover:-translate-y-1.5 justify-between h-full group">
                  <div>
                    <div className="size-16 rounded-full bg-[#EEF6F3] text-[#1A7D67] group-hover:bg-[#1A7D67] group-hover:text-white flex items-center justify-center mb-6 mx-auto transition-colors duration-300 shadow-xs">
                      {service.svg}
                    </div>
                    <h3 className="font-semibold text-lg text-zinc-800 mb-3 group-hover:text-[#1A7D67] transition-colors">
                      {service.title}
                    </h3>
                    <p className="text-zinc-600 text-sm leading-relaxed mb-6">
                      {service.desc}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={onFindDoctor}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1A7D67] hover:text-[#124B3E] transition group/btn cursor-pointer"
                  >
                    <span>Book Consultation</span>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="transition-transform group-hover/btn:translate-x-1.5"
                    >
                      <path d="M5 12h14" />
                      <path d="m12 5 7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 5. TESTIMONIALS / WHAT OUR PATIENTS SAY                   */}
      {/* ========================================================= */}
      <section
        id="testimonials"
        className="scroll-mt-16 w-full max-w-[1440px] mx-auto px-6 sm:px-10 lg:px-16 xl:px-20 py-24 md:py-32"
      >
        <ScrollReveal animation="fade-up">
          <div className="flex flex-col items-center text-center max-w-2xl mx-auto space-y-3 mb-16">
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-zinc-300 text-xs sm:text-sm text-zinc-600 uppercase font-semibold">
              <span className="size-2 rounded-full bg-[#1A7D67]"></span>
              Trusted by Patients
            </div>
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-medium text-zinc-800 leading-tight">
              What Our Patients Say
            </h2>
            <p className="text-zinc-600 text-sm sm:text-base">
              Experiences from patients who used Kaizen Care for online doctor consultations,
              video appointments, and follow-up care.
            </p>
          </div>
        </ScrollReveal>

        {/* Testimonials Grid with Animations */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[340px_1fr_1fr] gap-6 items-stretch">
          {/* Feature Video / Image Testimonial */}
          <ScrollReveal animation="fade-left" delay={100} className="md:row-span-2 h-full">
            <div className="border border-zinc-200 bg-white rounded-2xl p-6 flex flex-col justify-between shadow-sm hover:shadow-lg transition-all duration-300 h-full group">
              <div>
                <div className="relative -mx-6 -mt-6 rounded-t-2xl overflow-hidden mb-6 aspect-4/3">
                  <img
                    src="/assets/testimonial.png"
                    alt="Patient testimonial story"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/20 flex items-center justify-center transition-colors group-hover:bg-black/30">
                    <div className="size-12 rounded-full bg-white/90 text-[#1A7D67] flex items-center justify-center shadow-md transform transition-transform group-hover:scale-110">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="ml-0.5 text-[#1A7D67]"
                      >
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="flex text-[#F59E0B] text-sm mb-3">★★★★★</div>
                <p className="text-zinc-700 text-sm leading-relaxed font-normal">
                  "The doctor took the time to listen carefully during our video consultation and explained my treatment plan clearly. I felt comfortable and well cared for from start to finish."
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-zinc-100">
                <p className="font-semibold text-sm text-zinc-800">
                  Elena Rostova
                </p>
                <p className="text-xs text-zinc-500">Online Video Consultation</p>
              </div>
            </div>
          </ScrollReveal>

          {/* Testimonial Card 2 */}
          <ScrollReveal animation="fade-up" delay={200}>
            <div className="border border-zinc-200 bg-white rounded-2xl p-6 flex flex-col justify-between shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 h-full">
              <div>
                <div className="flex text-[#F59E0B] text-sm mb-3">★★★★★</div>
                <p className="text-zinc-700 text-sm leading-relaxed">
                  "Booking an online appointment was seamless, and the doctor was punctual and thorough. Accessing my doctor-issued prescription directly on the portal made the process effortless."
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-zinc-100">
                <p className="font-semibold text-sm text-zinc-800">
                  Marcus Sterling
                </p>
                <p className="text-xs text-zinc-500">Online Appointment Booking</p>
              </div>
            </div>
          </ScrollReveal>

          {/* Testimonial Card 3 */}
          <ScrollReveal animation="fade-up" delay={300}>
            <div className="border border-zinc-200 bg-white rounded-2xl p-6 flex flex-col justify-between shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 h-full">
              <div>
                <div className="flex text-[#F59E0B] text-sm mb-3">★★★★★</div>
                <p className="text-zinc-700 text-sm leading-relaxed">
                  "Professional doctors and exceptional online service. The video consultation worked seamlessly right in my browser without installing extra software."
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-zinc-100">
                <p className="font-semibold text-sm text-zinc-800">
                  Priya Sharma
                </p>
                <p className="text-xs text-zinc-500">Specialist Video Consultation</p>
              </div>
            </div>
          </ScrollReveal>

          {/* Testimonial Card 4 */}
          <ScrollReveal animation="fade-up" delay={400}>
            <div className="border border-zinc-200 bg-white rounded-2xl p-6 flex flex-col justify-between shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 h-full">
              <div>
                <div className="flex text-[#F59E0B] text-sm mb-3">★★★★★</div>
                <p className="text-zinc-700 text-sm leading-relaxed">
                  "Every online consultation has been a great experience. The doctors are attentive, thorough, and genuinely focused on patient well-being and follow-up care."
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-zinc-100">
                <p className="font-semibold text-sm text-zinc-800">
                  Jonathan Vance
                </p>
                <p className="text-xs text-zinc-500">Follow-up & Support</p>
              </div>
            </div>
          </ScrollReveal>

          {/* Testimonial Card 5 */}
          <ScrollReveal animation="fade-up" delay={500}>
            <div className="border border-zinc-200 bg-white rounded-2xl p-6 flex flex-col justify-between shadow-sm hover:shadow-lg transition-all duration-300 hover:-translate-y-1 h-full">
              <div>
                <div className="flex text-[#F59E0B] text-sm mb-3">★★★★★</div>
                <p className="text-zinc-700 text-sm leading-relaxed">
                  "From booking the online appointment to receiving follow-up care, everything was handled with professionalism and clarity. Convenient digital healthcare for my family."
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-zinc-100">
                <p className="font-semibold text-sm text-zinc-800">
                  Sarah Jenkins
                </p>
                <p className="text-xs text-zinc-500">Online Consultation</p>
              </div>
            </div>
          </ScrollReveal>
        </div>
      </section>

      {/* ========================================================= */}
      {/* 6. FREQUENTLY ASKED QUESTIONS                             */}
      {/* ========================================================= */}
      <section
        id="faqs"
        className="scroll-mt-16 w-full max-w-4xl mx-auto px-6 sm:px-10 py-24 md:py-32"
      >
        <ScrollReveal animation="fade-up">
          <div className="flex flex-col items-center text-center space-y-3 mb-12">
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-zinc-300 text-xs sm:text-sm text-zinc-600 uppercase font-semibold">
              <span className="size-2 rounded-full bg-[#1A7D67]"></span>
              Common Questions
            </div>
            <h2 className="text-3xl sm:text-4xl font-medium text-zinc-800 tracking-tight">
              Frequently Asked Questions
            </h2>
            <p className="text-zinc-600 text-sm sm:text-base">
              Everything you need to know about booking, medical care, and portal
              features.
            </p>
          </div>
        </ScrollReveal>

        <div className="space-y-4">
          {[
            {
              q: "How do I book an appointment?",
              a: "You can book an appointment online through our website by clicking the 'Book Appointment' button or by calling our clinic directly. We will help you select a convenient time slot with your doctor.",
            },
            {
              q: "Do you accept walk-in patients?",
              a: "Yes, we accept walk-in patients. However, booking an appointment in advance is highly recommended to secure your preferred doctor and minimize your waiting time.",
            },
            {
              q: "What services does your clinic provide?",
              a: "Our clinic provides general consultations, preventive care, cardiac care, diagnostic tests, vaccinations, and continuous follow-up support tailored to your healthcare needs.",
            },
            {
              q: "Can I reschedule my appointment?",
              a: "Yes, you can easily reschedule or cancel your appointment. Please contact our support team or use the online portal at least 24 hours prior to your scheduled time.",
            },
            {
              q: "Do you offer online consultations?",
              a: "Yes, we offer secure online video consultations powered by Daily SDK, allowing you to connect with our specialists directly from your browser at home.",
            },
          ].map((faq, idx) => (
            <ScrollReveal key={idx} animation="fade-up" delay={idx * 80}>
              <details className="group rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all duration-300 hover:border-[#1A7D67] hover:shadow-md">
                <summary className="flex cursor-pointer list-none items-center justify-between text-base font-semibold text-zinc-800">
                  <span>{faq.q}</span>
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-zinc-500 transition-transform duration-300 group-open:rotate-180 shrink-0"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </summary>
                <p className="mt-3 text-sm text-zinc-600 leading-relaxed border-t border-zinc-100 pt-3">
                  {faq.a}
                </p>
              </details>
            </ScrollReveal>
          ))}
        </div>
      </section>

      {/* ========================================================= */}
      {/* 8. EXCEPTIONAL CARE AWAITS YOU CTA                        */}
      {/* ========================================================= */}
      <section className="px-6 sm:px-10 lg:px-16 xl:px-20 pb-24 md:pb-32">
        <ScrollReveal animation="zoom-in" duration={850}>
          <div className="max-w-5xl mx-auto bg-gradient-to-b from-[#E0FAF4] to-white rounded-[24px] px-8 py-14 sm:py-20 border border-[#29E2B9]/30 text-center space-y-6 shadow-lg hover:shadow-xl transition-shadow duration-500">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-zinc-800 max-w-lg mx-auto leading-tight">
              Exceptional Care{" "}
              <span className="bg-gradient-to-r from-[#197C66] to-[#29E2B9] bg-clip-text text-transparent">
                Awaits you
              </span>
            </h2>
            <p className="text-zinc-600 text-sm sm:text-base max-w-md mx-auto leading-relaxed">
              Whether it's a routine visit or ongoing care, we're here to help you
              stay healthy with confidence.
            </p>
            <div className="flex flex-wrap justify-center items-center gap-4 pt-2">
              <button
                type="button"
                onClick={onRegister}
                className="bg-[#197C66] hover:bg-[#156755] text-white text-sm font-medium px-8 py-3.5 rounded-lg inline-flex items-center gap-2 cursor-pointer transition-all duration-300 shadow-sm hover:shadow-md hover:-translate-y-0.5 group"
              >
                <span>Book Appointment</span>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="transition-transform group-hover:translate-x-1"
                >
                  <path d="M5 12h14"></path>
                  <path d="m12 5 7 7-7 7"></path>
                </svg>
              </button>
              <button
                type="button"
                onClick={onRegister}
                className="border border-zinc-300 hover:border-zinc-400 bg-white text-zinc-700 text-sm font-medium px-8 py-3.5 rounded-lg transition-all duration-300 hover:-translate-y-0.5 cursor-pointer shadow-xs"
              >
                Create Account
              </button>
            </div>
          </div>
        </ScrollReveal>
      </section>

      {/* ========================================================= */}
      {/* 9. FOOTER (Kaizen Care)                                   */}
      {/* ========================================================= */}
      <footer className="w-full bg-[#162623] text-white pt-16 pb-8 border-t border-zinc-800">
        <div className="px-6 sm:px-10 lg:px-16 xl:px-20 w-full max-w-[1440px] mx-auto">
          <div className="flex flex-col md:flex-row flex-wrap justify-between items-start gap-12 pb-16 border-b border-zinc-800">
            {/* Logo and About */}
            <div className="flex flex-col items-start max-w-sm">
              <div className="flex items-center gap-2.5 mb-4 select-none">
                <svg
                  width="32"
                  height="36"
                  viewBox="0 0 35 42"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-8 w-auto text-white shrink-0"
                  aria-hidden="true"
                >
                  <path
                    d="M14.451 5.223A7.466 7.466 0 0 1 24.9 15.891q-.3.293-.584.512L13.933 5.802q.22-.285.518-.579M7.093 25.239A7.466 7.466 0 0 0 17.607 35.84a7 7 0 0 0 .518-.574L7.675 24.73a6 6 0 0 0-.582.508"
                    fill="#ffffff"
                  />
                  <rect
                    width="12.629"
                    height="32.626"
                    rx="6.315"
                    transform="rotate(-45 16.202 6.711)"
                    fill="#ffffff"
                  />
                </svg>
                <span className="text-2xl font-bold text-white tracking-tight">
                  Kaizen Care
                </span>
              </div>
              <p className="text-sm text-zinc-400 leading-relaxed">
                Providing accessible teleconsultation healthcare through qualified
                healthcare professionals, secure video consultations, and patient-first digital care.
              </p>
            </div>

            {/* Quick Links */}
            <div>
              <p className="font-semibold text-sm text-white mb-4 uppercase tracking-wider">
                Quick Links
              </p>
              <div className="flex flex-col gap-2.5 text-sm text-zinc-400">
                <a
                  href="#home"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("home");
                  }}
                  className="hover:text-white transition"
                >
                  Home
                </a>
                <a
                  href="#about"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("about");
                  }}
                  className="hover:text-white transition"
                >
                  About
                </a>
                <a
                  href="#services"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("services");
                  }}
                  className="hover:text-white transition"
                >
                  Services
                </a>
                <a
                  href="#testimonials"
                  onClick={(e) => {
                    e.preventDefault();
                    scrollToSection("testimonials");
                  }}
                  className="hover:text-white transition"
                >
                  Testimonials
                </a>
                <button
                  type="button"
                  onClick={onRegister}
                  className="text-left hover:text-white transition cursor-pointer"
                >
                  Book Appointment
                </button>
              </div>
            </div>

            {/* Our Services */}
            <div>
              <p className="font-semibold text-sm text-white mb-4 uppercase tracking-wider">
                Our Services
              </p>
              <div className="flex flex-col gap-2.5 text-sm text-zinc-400">
                <span>General Consultation</span>
                <span>Preventive Health Guidance</span>
                <span>Specialist Consultation</span>
                <span>Online Video Consultation</span>
                <span>Digital Prescriptions & Records</span>
                <span>Follow-up & Support</span>
              </div>
            </div>

            {/* Get in Touch */}
            <div>
              <p className="font-semibold text-sm text-white mb-4 uppercase tracking-wider">
                Get in Touch
              </p>
              <div className="flex flex-col gap-3 text-sm text-zinc-400">
                <div className="flex items-center gap-2.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#29E2B9] shrink-0">
                    <rect width="20" height="16" x="2" y="4" rx="2" />
                    <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                  </svg>
                  <a
                    href="mailto:hello@kaizencare.com"
                    className="hover:text-white transition"
                  >
                    hello@kaizencare.com
                  </a>
                </div>
                <div className="flex items-center gap-2.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#29E2B9] shrink-0">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                  <a href="tel:+15551234567" className="hover:text-white transition">
                    +1 (555) 123-4567
                  </a>
                </div>
                <div className="flex items-center gap-2.5">
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#29E2B9] shrink-0">
                    <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <span>San Francisco, CA, USA</span>
                </div>
                <button
                  type="button"
                  onClick={onDoctorRegister}
                  className="text-left text-xs font-semibold text-[#29E2B9] hover:underline pt-2 cursor-pointer"
                >
                  Clinician Registration Portal →
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-8 text-xs text-zinc-500">
            <p>© 2026 Kaizen Care · All Right Reserved.</p>
            <div className="flex gap-6">
              <span className="hover:text-zinc-400 cursor-pointer">
                Privacy Policy
              </span>
              <span className="hover:text-zinc-400 cursor-pointer">
                Terms of Service
              </span>
              <span className="hover:text-zinc-400 cursor-pointer">
                Patient Security
              </span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
