import { useState } from "react";

function ClinicianBrandPanel({ onSignOut }) {
  return (
    <aside className="relative hidden overflow-hidden bg-[#295255] text-white lg:flex lg:flex-col justify-between p-10 lg:p-14 xl:p-16 min-h-screen">
      <div className="space-y-8 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F0F5F7] text-[#295255] flex items-center justify-center font-bold shadow-sm">
              <span className="material-symbols-outlined !text-[#295255] text-2xl font-bold">
                verified
              </span>
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight text-white">
                Kaizentrix Care
              </p>
              <p className="text-[10px] tracking-[.18em] uppercase text-[#F0F5F7]/80 font-semibold">
                Credential Review
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3.5 py-1.5 rounded-xl border border-white/10 transition cursor-pointer"
          >
            Sign out
          </button>
        </div>

        <div className="pt-16 xl:pt-24 space-y-5">
          <span className="inline-block px-3 py-1 rounded-full bg-amber-400/20 text-xs font-semibold text-amber-200 tracking-wider uppercase border border-amber-300/30">
            Awaiting Approval
          </span>
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight text-white">
            Email Verified.
            <br />
            Credential Review.
          </h1>
          <p className="text-sm xl:text-base text-[#F0F5F7]/85 leading-relaxed max-w-md">
            Your clinician account and professional registration credentials are currently being reviewed by an authorized Clinic Administrator.
          </p>
        </div>
      </div>

      <div className="relative z-10 pt-10 border-t border-white/15 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <span className="material-symbols-outlined !text-[#F0F5F7] text-base">
            admin_panel_settings
          </span>
          <span>Authorized Clinic Governance</span>
        </div>
        <p className="text-xs text-[#F0F5F7]/75">
          You will receive an automated notification once your clinician access is enabled.
        </p>
      </div>

      <div className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full bg-[#577877]/25 blur-3xl pointer-events-none" />
    </aside>
  );
}

export default function DoctorPendingApprovalScreen({ patient, onRefresh, onSignOut }) {
  const [checking, setChecking] = useState(false);

  const handleRefresh = async () => {
    setChecking(true);
    try {
      if (onRefresh) await onRefresh();
    } finally {
      setTimeout(() => setChecking(false), 600);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F5F7] font-sans grid grid-cols-1 lg:grid-cols-2 text-[#162623]">
      <ClinicianBrandPanel onSignOut={onSignOut} />

      <main className="flex flex-col justify-between p-6 sm:p-10 lg:p-14 xl:p-16 min-h-screen overflow-y-auto">
        <div className="max-w-md w-full mx-auto space-y-6">
          <div className="flex items-center justify-between border-b border-[#577877]/15 pb-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
              Awaiting Approval
            </span>
            <button
              onClick={onSignOut}
              className="text-xs font-semibold text-[#577877] hover:text-[#295255] hover:underline cursor-pointer"
            >
              Sign out
            </button>
          </div>

          <div className="space-y-2 text-center">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#295255]/10 text-[#295255]">
              <span className="material-symbols-outlined text-3xl text-[#295255]">
                medical_services
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#162623]">
              Awaiting Administrator Approval
            </h2>
            <p className="text-xs sm:text-sm text-[#577877] leading-relaxed">
              Thank you for verifying your email address (<strong>{patient?.email || "doctor@clinic.com"}</strong>).
              Your clinician credentials are under review.
            </p>
          </div>

          <div className="rounded-xl border border-[#577877]/20 bg-[#F0F5F7]/60 p-4 space-y-3 text-xs text-[#162623]">
            <div className="flex items-center gap-2.5 font-medium">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-white text-[10px]">✓</span>
              <span>Email verification complete</span>
            </div>
            <div className="flex items-center gap-2.5 font-medium text-[#295255]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-[10px]">⏳</span>
              <span>Clinic Administrator review in progress</span>
            </div>
            <div className="flex items-center gap-2.5 text-[#577877]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#577877]/20 text-[10px]">🔒</span>
              <span>Consultation workspace locked until approval</span>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={checking}
              className="w-full rounded-xl bg-[#295255] py-3 text-xs font-bold text-white shadow transition hover:bg-[#1f3f41] disabled:opacity-50 cursor-pointer"
            >
              {checking ? "Checking Approval Status…" : "Check Approval Status"}
            </button>

            <button
              type="button"
              onClick={onSignOut}
              className="w-full rounded-xl border border-[#577877]/30 bg-white py-2.5 text-xs font-semibold text-[#577877] transition hover:border-[#295255] hover:text-[#162623] cursor-pointer"
            >
              Sign Out &amp; Return Later
            </button>
          </div>
        </div>

        <footer className="pt-8 text-center text-xs text-[#577877]">
          © 2026 Kaizentrix Care · Clinician Credentialing Workspace.
        </footer>
      </main>
    </div>
  );
}
