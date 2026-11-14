import { useState } from "react";
import { useNavigate } from "react-router-dom";
import PublicNavbar from "./PublicNavbar";

const journeySteps = [
  {
    step: "01",
    title: "Find Your Doctor",
    subtitle: "Explore care specialists by specialty, language, availability, and consultation fee.",
    description:
      "Search through our network of qualified healthcare professionals. Filter by medical specialty, languages spoken, consultation fees, and real-time schedule availability to find the clinician best suited for your needs.",
    icon: "person_search",
    highlights: [
      "Filter by medical domain & specialty",
      "View verified credentials & qualifications",
      "Check real-time appointment availability",
    ],
  },
  {
    step: "02",
    title: "Book with Confidence",
    subtitle: "Choose an available appointment time and review details before confirming your visit.",
    description:
      "Select a convenient date and time slot that fits your schedule. Review your appointment details clearly, complete secure online payment if required, and receive instant confirmation in your portal dashboard.",
    icon: "calendar_month",
    highlights: [
      "Transparent consultation fees with no hidden costs",
      "Instant booking confirmation & appointment details",
      "Flexible rescheduling options",
    ],
  },
  {
    step: "03",
    title: "Meet from Anywhere",
    subtitle: "Join your scheduled video appointment from a private, convenient place that works for you.",
    description:
      "Connect directly with your doctor via encrypted, high-definition video consultation directly from your phone, tablet, or computer with no app downloads required.",
    icon: "videocam",
    highlights: [
      "Encrypted HD WebRTC video consultations",
      "No app downloads or software installation required",
      "Real-time audio & video controls",
    ],
  },
  {
    step: "04",
    title: "Stay Connected to Care",
    subtitle: "Keep your appointment details, clinician-released records, and follow-up information together.",
    description:
      "After your consultation, securely access digital prescriptions, clinical summaries, and treatment instructions. Easily arrange follow-up consultations whenever you need continued care.",
    icon: "folder_shared",
    highlights: [
      "Instant access to digital prescriptions",
      "Detailed consultation summaries & care plans",
      "Easy follow-up consultation booking",
    ],
  },
];

const platformBenefits = [
  {
    icon: "lock_reset",
    title: "Private & Secure",
    desc: "Your consultations and health records are protected by industry-standard encryption and strict privacy protocols.",
  },
  {
    icon: "devices",
    title: "Works on Any Device",
    desc: "Access your portal and join video calls effortlessly from smartphone, tablet, or desktop web browsers.",
  },
  {
    icon: "verified",
    title: "Verified Clinicians",
    desc: "Every healthcare professional on Kaizen Care undergoes license verification and credential checks.",
  },
  {
    icon: "payments",
    title: "Transparent Pricing",
    desc: "Clear upfront consultation fees before booking, with secure instant payment processing.",
  },
];

export default function HowItWorksScreen() {
  const navigate = useNavigate();
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  return (
    <div className="min-h-screen bg-[#F0F5F7] font-sans text-[#162623] antialiased selection:bg-[#1A7D67] selection:text-white">
      <PublicNavbar />

      <main>
        {/* ========================================================= */}
        {/* 1. HERO SECTION                                           */}
        {/* ========================================================= */}
        <section
          className="relative w-full overflow-hidden bg-[#1A7D67] px-6 py-20 text-white lg:px-10 lg:py-24"
          style={{
            background:
              "linear-gradient(180deg, #1A7D67 0%, #25836F 40%, #358C79 70%, #519C8C 100%)",
          }}
        >
          <div className="mx-auto max-w-4xl text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white backdrop-blur-xs">
              <span className="material-symbols-outlined text-sm text-white">route</span>
              Your Patient Journey
            </div>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl leading-tight">
              How Your Care Journey Works
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-white/90 sm:text-lg">
              From finding the right specialist to staying on top of follow-up care, Kaizen Care keeps each step simple, transparent, and connected.
            </p>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 2. FOUR-STEP PATIENT JOURNEY                              */}
        {/* ========================================================= */}
        <section className="mx-auto max-w-7xl px-6 py-16 lg:px-10 lg:py-24">
          <div className="mx-auto max-w-2xl text-center mb-16">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#1A7D67]">
              Simple 4-Step Process
            </span>
            <h2 className="mt-2 text-3xl font-bold text-[#162623] sm:text-4xl">
              One Portal for Your Complete Healthcare Needs
            </h2>
            <p className="mt-3 text-sm sm:text-base leading-relaxed text-[#577877]">
              Designed with clinical clarity to give you an easy, intuitive healthcare experience.
            </p>
          </div>

          <div className="space-y-8 lg:space-y-12">
            {journeySteps.map((step) => (
              <div
                key={step.step}
                className="group relative rounded-3xl border border-[rgba(87,120,119,0.18)] bg-white p-7 sm:p-10 shadow-xs hover:shadow-md transition-all duration-300"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-8">
                  {/* Left Step Header & Description */}
                  <div className="flex-1 space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#EEF6F3] text-[#1A7D67] group-hover:bg-[#1A7D67] group-hover:text-white transition-colors duration-300 shadow-xs">
                        <span className="material-symbols-outlined text-2xl">{step.icon}</span>
                      </div>
                      <div>
                        <span className="text-xs font-bold uppercase tracking-widest text-[#1A7D67]">
                          Step {step.step}
                        </span>
                        <h3 className="text-xl sm:text-2xl font-bold text-[#162623]">
                          {step.title}
                        </h3>
                      </div>
                    </div>

                    <p className="text-sm font-semibold text-[#1A7D67] leading-relaxed">
                      {step.subtitle}
                    </p>

                    <p className="text-sm text-[#577877] leading-relaxed">
                      {step.description}
                    </p>
                  </div>

                  {/* Right Highlights Card */}
                  <div className="lg:w-[380px] shrink-0 rounded-2xl bg-[#F0F5F7]/80 p-5 border border-[#577877]/15">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#162623] mb-3">
                      What to expect
                    </p>
                    <ul className="space-y-2.5">
                      {step.highlights.map((highlight, hIdx) => (
                        <li key={hIdx} className="flex items-start gap-2.5 text-xs text-[#577877] leading-relaxed">
                          <span className="material-symbols-outlined text-[#1A7D67] text-base shrink-0 mt-0.5">
                            check_circle
                          </span>
                          <span>{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ========================================================= */}
        {/* 3. PLATFORM ADVANTAGES                                    */}
        {/* ========================================================= */}
        <section className="border-y border-[#577877]/15 bg-white px-6 py-16 lg:px-10 lg:py-20">
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto max-w-2xl text-center mb-12">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#1A7D67]">
                Why Choose Kaizen Care
              </span>
              <h2 className="mt-2 text-2xl font-bold text-[#162623] sm:text-3xl">
                Built Around Patient Wellbeing
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {platformBenefits.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-[rgba(87,120,119,0.15)] bg-[#F0F5F7]/50 p-6 transition-all hover:bg-white hover:shadow-xs"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF6F3] text-[#1A7D67] mb-4">
                    <span className="material-symbols-outlined text-xl">{item.icon}</span>
                  </div>
                  <h4 className="text-base font-bold text-[#162623]">{item.title}</h4>
                  <p className="mt-2 text-xs text-[#577877] leading-relaxed">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ========================================================= */}
        {/* 4. CALL TO ACTION SECTION                                 */}
        {/* ========================================================= */}
        <section className="px-6 py-16 lg:px-10 lg:py-24">
          <div className="mx-auto max-w-5xl rounded-3xl bg-gradient-to-r from-[#1A7D67] via-[#25836F] to-[#165849] px-6 py-12 text-center text-white sm:px-12 sm:py-16 shadow-lg">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              Ready to Start Your Care Journey?
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm sm:text-base text-white/90 leading-relaxed">
              Find qualified specialists, check availability, and book your online video consultation today.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <button
                type="button"
                onClick={() => navigate("/find-doctors")}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-[#1A7D67] shadow-sm hover:bg-white/95 transition cursor-pointer"
              >
                <span>Find a Doctor &amp; Book Now</span>
                <span className="material-symbols-outlined text-lg">arrow_forward</span>
              </button>
              <button
                type="button"
                onClick={() => navigate("/register")}
                className="inline-flex items-center justify-center rounded-xl border border-white/40 bg-white/10 px-6 py-3.5 text-sm font-semibold text-white backdrop-blur-xs hover:bg-white/20 transition cursor-pointer"
              >
                Create Account
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* ========================================================= */}
      {/* 5. FOOTER                                                 */}
      {/* ========================================================= */}
      <footer className="border-t border-[#577877]/20 bg-white px-6 py-8 text-xs text-[#577877] lg:px-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <p>© 2026 Kaizen Care · Telehealth Platform. All rights reserved.</p>
          <div className="flex gap-6">
            <button
              type="button"
              onClick={() => setShowPrivacyModal(true)}
              className="hover:text-[#162623] cursor-pointer"
            >
              Privacy Policy
            </button>
            <button
              type="button"
              onClick={() => setShowTermsModal(true)}
              className="hover:text-[#162623] cursor-pointer"
            >
              Terms of Use
            </button>
          </div>
        </div>
      </footer>

      {/* Privacy Policy Modal */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[#1A7D67] text-2xl">policy</span>
                <h3 className="text-base font-bold text-[#162623]">Kaizen Care Privacy Policy</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="space-y-3 text-xs text-[#577877] leading-relaxed max-h-72 overflow-y-auto pr-1">
              <p>
                <strong>1. Data Encryption &amp; Security:</strong> All patient personal health information (PHI) is encrypted at rest and in transit using TLS 1.3 and AES-256 standards.
              </p>
              <p>
                <strong>2. Telehealth Consultations:</strong> Video consultations are conducted over tokenized, end-to-end peer WebRTC connections. Video streams are private and never recorded without explicit consent.
              </p>
              <p>
                <strong>3. Patient Rights:</strong> You maintain full control over your profile details and clinical record access permissions.
              </p>
            </div>
            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="rounded-xl bg-[#1A7D67] px-5 py-2 text-xs font-semibold text-white hover:bg-[#156654] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terms of Use Modal */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[#1A7D67] text-2xl">gavel</span>
                <h3 className="text-base font-bold text-[#162623]">Kaizen Care Terms of Use</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="space-y-3 text-xs text-[#577877] leading-relaxed max-h-72 overflow-y-auto pr-1">
              <p>
                <strong>1. Platform Scope:</strong> Kaizen Care facilitates appointment booking, online video consultations, and digital record access with licensed medical professionals.
              </p>
              <p>
                <strong>2. Medical Emergency Disclaimer:</strong> Telehealth is not for medical emergencies. If you are experiencing a life-threatening emergency, please call your local emergency services immediately.
              </p>
              <p>
                <strong>3. Clinician Credentials:</strong> Healthcare providers listed on Kaizen Care undergo medical license verification.
              </p>
            </div>
            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="rounded-xl bg-[#1A7D67] px-5 py-2 text-xs font-semibold text-white hover:bg-[#156654] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

