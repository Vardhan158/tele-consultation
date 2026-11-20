import { useState } from "react";

function ClinicianBrandPanel({ isRejected, onSignOut }) {
  return (
    <aside className="relative hidden overflow-hidden bg-[#25836F] text-white lg:flex lg:flex-col justify-between p-10 lg:p-14 xl:p-16 min-h-screen">
      <div className="space-y-8 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F0F5F7] text-[#125747] flex items-center justify-center font-bold shadow-sm">
              <svg
                width="24"
                height="28"
                viewBox="0 0 35 42"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-auto text-[#125747]"
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
              <p className="text-xl font-bold tracking-tight text-white">
                Kaizen Care
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
          <span
            className={`inline-block px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase border ${
              isRejected
                ? "bg-red-400/20 text-red-200 border-red-300/30"
                : "bg-amber-400/20 text-amber-200 border-amber-300/30"
            }`}
          >
            {isRejected ? "Application Rejected" : "Awaiting Approval"}
          </span>
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight text-white">
            {isRejected ? (
              <>
                Credential Review
                <br />
                Decision Issued.
              </>
            ) : (
              <>
                Email Verified.
                <br />
                Credential Review.
              </>
            )}
          </h1>
          <p className="text-sm xl:text-base text-[#F0F5F7]/85 leading-relaxed max-w-md">
            {isRejected
              ? "Your clinician application was reviewed by clinic administration. Please examine the feedback provided or contact support for assistance."
              : "Your clinician account and professional registration credentials are currently being reviewed by an authorized Clinic Administrator."}
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
          Clinical practice authorizations comply with Indian Telemedicine Practice Guidelines and Medical Council standards.
        </p>
      </div>

      <div className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full bg-[#577877]/25 blur-3xl pointer-events-none" />
    </aside>
  );
}

export default function DoctorPendingApprovalScreen({ patient, onRefresh, onSignOut }) {
  const [checking, setChecking] = useState(false);
  const isRejected = patient?.approval_status === "rejected";

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
      <ClinicianBrandPanel isRejected={isRejected} onSignOut={onSignOut} />

      <main className="flex flex-col justify-between p-6 sm:p-10 lg:p-14 xl:p-16 min-h-screen overflow-y-auto">
        <div className="max-w-md w-full mx-auto space-y-6">
          <div className="flex items-center justify-between border-b border-[#577877]/15 pb-4">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                isRejected
                  ? "bg-red-100 text-red-800 border border-red-200"
                  : "bg-amber-100 text-amber-800"
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  isRejected ? "bg-red-600" : "bg-amber-500 animate-pulse"
                }`}
              ></span>
              {isRejected ? "Application Rejected" : "Awaiting Approval"}
            </span>
            <button
              onClick={onSignOut}
              className="text-xs font-semibold text-[#577877] hover:text-[#25836F] hover:underline cursor-pointer"
            >
              Sign out
            </button>
          </div>

          <div className="space-y-2 text-center">
            <div
              className={`mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl ${
                isRejected
                  ? "bg-red-100 text-red-700"
                  : "bg-[#25836F]/10 text-[#25836F]"
              }`}
            >
              <span className="material-symbols-outlined text-3xl">
                {isRejected ? "cancel" : "medical_services"}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold text-[#162623]">
              {isRejected
                ? "Credential Verification Rejected"
                : "Awaiting Administrator Approval"}
            </h2>
            <p className="text-xs sm:text-sm text-[#577877] leading-relaxed">
              Account: <strong>{patient?.email || "doctor@clinic.com"}</strong>
              <br />
              {isRejected
                ? "Your clinician credential verification could not be approved by the clinic administration."
                : "Your professional registration credentials and documents are under review."}
            </p>
          </div>

          {isRejected ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3 text-xs text-red-950">
              <div className="flex items-center gap-2 font-bold text-red-900">
                <span className="material-symbols-outlined text-base text-red-700">error</span>
                <span>Administrative Decision Reason:</span>
              </div>
              <p className="rounded-lg bg-white p-3 border border-red-200 text-red-900 leading-relaxed font-mono text-[11px]">
                {patient?.rejection_reason || "Medical credentials could not be verified by clinic administration."}
              </p>
              <p className="text-[11px] text-red-800/90 leading-relaxed">
                If you believe this decision was made in error or wish to provide updated certificates, please contact clinic administration or email <strong>support@kaizencare.com</strong>.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-[#577877]/20 bg-[#F0F5F7]/60 p-4 space-y-3 text-xs text-[#162623]">
              <div className="flex items-center gap-2.5 font-medium">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-white text-[10px]">✓</span>
                <span>Email verification complete</span>
              </div>
              <div className="flex items-center gap-2.5 font-medium text-[#25836F]">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-[10px]">⏳</span>
                <span>Clinic Administrator review in progress</span>
              </div>
              <div className="flex items-center gap-2.5 text-[#577877]">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#577877]/20 text-[10px]">🔒</span>
                <span>Consultation workspace locked until approval</span>
              </div>
            </div>
          )}

          <div className="space-y-3 pt-2">
            {!isRejected && (
              <button
                type="button"
                onClick={handleRefresh}
                disabled={checking}
                className="w-full rounded-xl bg-[#25836F] py-3 text-xs font-bold text-white shadow transition hover:bg-[#1d6e5d] disabled:opacity-50 cursor-pointer"
              >
                {checking ? "Checking Approval Status…" : "Check Approval Status"}
              </button>
            )}

            <button
              type="button"
              onClick={onSignOut}
              className="w-full rounded-xl border border-[#577877]/30 bg-white py-2.5 text-xs font-semibold text-[#577877] transition hover:border-[#25836F] hover:text-[#162623] cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>

        <footer className="pt-8 text-center text-xs text-[#577877]">
          © 2026 Kaizen Care · Clinician Credentialing Workspace.
        </footer>
      </main>
    </div>
  );
}
