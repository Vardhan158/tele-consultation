import { useState } from "react";
import PublicNavbar from "../public/PublicNavbar";

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
    <div className="min-h-screen bg-[#F0F5F7] font-sans text-[#162623]">
      <PublicNavbar />
      <main className="px-4 py-8 sm:px-6 sm:py-14">
        <div className="mx-auto max-w-lg space-y-6 rounded-2xl border border-[rgba(87,120,119,0.18)] bg-white p-6 shadow-[0_10px_35px_-8px_rgba(22,38,35,0.08)] sm:p-10">

          <div className="flex items-center justify-between border-b border-[#577877]/15 pb-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-amber-800">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
              Awaiting Approval
            </span>
            <button
              onClick={onSignOut}
              className="text-xs font-semibold text-[#577877] hover:text-[#295255] hover:underline"
            >
              Sign out
            </button>
          </div>

          <div className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#295255]/10 text-[#295255]">
              <span className="text-3xl">🩺</span>
            </div>
            <h1 className="text-xl font-bold text-[#162623] sm:text-2xl">
              Email Verified — Awaiting Clinic Administrator Approval
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#577877]">
              Thank you for verifying your email address (<strong>{patient?.email || "doctor@clinic.com"}</strong>).
              Your professional clinician credentials are currently under review by a Clinic Administrator.
            </p>
          </div>

          <div className="rounded-xl border border-[#577877]/20 bg-[#F0F5F7]/60 p-4 space-y-3 text-xs text-[#162623]">
            <div className="flex items-center gap-2.5 font-medium">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-white text-[10px]">✓</span>
              <span>Email verification complete</span>
            </div>
            <div className="flex items-center gap-2.5 font-medium text-[#295255]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500 text-white text-[10px]">⏳</span>
              <span>Clinic Administrator verification in progress</span>
            </div>
            <div className="flex items-center gap-2.5 text-[#577877]">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#577877]/20 text-[10px]">🔒</span>
              <span>Consultation dashboard access locked until approval</span>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <button
              onClick={handleRefresh}
              disabled={checking}
              className="w-full rounded-xl bg-[#295255] px-4 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#1f3f41] disabled:opacity-50"
            >
              {checking ? "Checking approval status…" : "Check Approval Status"}
            </button>

            <button
              onClick={onSignOut}
              className="w-full rounded-xl border border-[#577877]/30 bg-white px-4 py-2.5 text-xs font-semibold text-[#577877] transition hover:border-[#295255] hover:text-[#162623]"
            >
              Sign out & return later
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}
