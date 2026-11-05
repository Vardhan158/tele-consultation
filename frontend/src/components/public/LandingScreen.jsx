export default function LandingScreen({ onSignIn, onRegister, onDoctorRegister }) {
  return (
    <div className="min-h-screen bg-[#F0F5F7] font-sans text-[#162623]">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-[#F0F5F7]/95 backdrop-blur-md border-b border-[#577877]/20">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 lg:px-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#295255] text-white flex items-center justify-center shadow-sm">
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
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onDoctorRegister}
              className="text-xs font-semibold text-[#295255] hover:underline"
            >Clinician registration</button>
            <button
              type="button"
              onClick={onSignIn}
              className="btn-secondary !py-2 !px-4 text-xs font-semibold"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={onRegister}
              className="btn-primary !py-2 !px-4 text-xs font-semibold"
            >
              Create Account
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-[#295255] px-6 py-20 text-white lg:px-10 lg:py-28">
        <div className="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-white/20 text-xs font-medium text-[#F0F5F7]">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              ABHA & DISHA Compliant Healthcare Platform
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight">
              Connected care, thoughtfully delivered.
            </h1>

            <p className="text-base sm:text-lg text-[#F0F5F7]/85 max-w-xl leading-relaxed">
              Find verified medical specialists, schedule authoritative teleconsultations, join private encrypted video rooms, and access clinician-released records in one secure place.
            </p>

            <div className="flex flex-wrap gap-3.5 pt-2">
              <button
                type="button"
                onClick={onRegister}
                className="px-6 py-3.5 rounded-xl bg-[#F0F5F7] text-[#295255] font-semibold text-sm shadow-lg hover:bg-white transition"
              >
                Get Started as a Patient
              </button>
              <button
                type="button"
                onClick={onSignIn}
                className="px-6 py-3.5 rounded-xl border border-white/30 text-white font-semibold text-sm hover:bg-white/10 transition"
              >
                Sign In to Portal
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-4 text-xs text-[#F0F5F7]/80">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined !text-[#F0F5F7] text-lg">lock</span>
                256-Bit Encrypted Video
              </span>
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined !text-[#F0F5F7] text-lg">verified</span>
                Licensed Clinic Specialists
              </span>
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined !text-[#F0F5F7] text-lg">receipt_long</span>
                Direct Invoicing & Receipts
              </span>
            </div>
          </div>

          {/* Interactive Feature Preview Card */}
          <div className="care-card p-6 sm:p-8 bg-white/95 text-[#162623] shadow-2xl space-y-5 border-white/40">
            <div className="flex items-center justify-between border-b border-[#577877]/15 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F0F5F7] flex items-center justify-center text-[#295255]">
                  <span className="material-symbols-outlined !text-[#295255] text-2xl">videocam</span>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#162623]">Dr. Sarah Chen, MD</h3>
                  <p className="text-xs text-[#577877]">Cardiology Consultation Live</p>
                </div>
              </div>
              <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                Connected
              </span>
            </div>

            <div className="space-y-3">
              {[
                { title: 'Doctor Discovery', desc: 'Filter board-certified doctors by specialty, language, and real-time availability.', icon: 'person_search' },
                { title: 'Secure Video Room', desc: 'Pre-call device diagnostics and private waiting room admission.', icon: 'videocam' },
                { title: 'Encrypted Records & Rx', desc: 'Tamper-verified diagnostic PDFs and doctor signed e-prescriptions.', icon: 'folder_shared' },
                { title: 'Patient Consent Control', desc: 'Granular HIPAA & DISHA notice management with instant revocation.', icon: 'security' },
              ].map((step) => (
                <div key={step.title} className="flex items-start gap-3 p-3 rounded-xl bg-[#F0F5F7] border border-[#577877]/15">
                  <span className="w-8 h-8 rounded-lg bg-white flex items-center justify-center shrink-0 shadow-xs">
                    <span className="material-symbols-outlined !text-[#295255] text-base">{step.icon}</span>
                  </span>
                  <div>
                    <h4 className="text-xs font-bold text-[#162623]">{step.title}</h4>
                    <p className="text-[11px] text-[#577877] mt-0.5 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 rounded-xl bg-[#295255]/5 border border-[#295255]/20 text-[11px] text-[#295255]">
              Authoritative healthcare workflows: appointments, consultations, and document releases are verified strictly server-side.
            </div>
          </div>
        </div>
      </section>

      {/* Core Portal Modules Feature Grid */}
      <section className="mx-auto max-w-7xl px-6 py-20 lg:px-10 space-y-12">
        <div className="max-w-2xl space-y-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
            Enterprise Healthcare Platform
          </span>
          <h2 className="text-2xl sm:text-3xl font-bold text-[#162623]">
            One portal for your entire healthcare journey
          </h2>
          <p className="text-sm text-[#577877]">
            Designed with clinical clarity, intuitive navigation, and robust security for modern patients.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            { title: 'Doctor Discovery', desc: 'Search clinic-vetted doctors across multiple specialties with verified fees and credentials.', icon: 'person_search' },
            { title: 'Appointment Booking', desc: 'Book verified time slots with automated reminders, rescheduling, and cancellation policies.', icon: 'calendar_month' },
            { title: 'Encrypted Video Visits', desc: 'Low-latency browser teleconsultation with clinical chat, vital review, and screen sharing.', icon: 'videocam' },
            { title: 'E-Prescriptions & Rx', desc: 'Clinician-signed digital prescriptions with dosage, frequency, and refill counts.', icon: 'medication' },
            { title: 'Medical Records Vault', desc: 'Secure repository for lab panels, cardiology traces, and radiology scans up to 25 MB.', icon: 'folder_shared' },
            { title: 'Payments & Invoicing', desc: 'Instant server verification for UPI, cards, and net banking with downloadable GST receipts.', icon: 'receipt_long' },
            { title: 'Care Notifications', desc: 'Operational updates and appointment alerts via multi-channel in-app and SMS.', icon: 'notifications' },
            { title: 'ABHA & Consent', desc: 'ABHA health ID integration with granular HIPAA/DISHA legal consent tracking.', icon: 'badge' },
          ].map((item) => (
            <div key={item.title} className="care-card p-6 space-y-3">
              <span className="w-12 h-12 rounded-xl bg-[#F0F5F7] flex items-center justify-center">
                <span className="material-symbols-outlined !text-[#295255] text-2xl">{item.icon}</span>
              </span>
              <h3 className="text-base font-bold text-[#162623]">{item.title}</h3>
              <p className="text-xs text-[#577877] leading-relaxed">{item.desc}</p>
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
              Create your account or log in to access your personal patient workspace.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={onRegister} className="btn-primary text-xs font-semibold py-3 px-6">
              Create Patient Account
            </button>
            <button onClick={onSignIn} className="btn-secondary text-xs font-semibold py-3 px-6">
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
            <span>HIPAA & DISHA Compliant</span>
            <span>Privacy Policy</span>
            <span>Terms of Use</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
