import { useState, useRef } from "react";
import { authApi } from "../../lib/api";

function ClinicianBrandPanel({ onBack }) {
  return (
    <aside className="relative hidden overflow-hidden bg-[#295255] text-white lg:flex lg:flex-col justify-between p-10 lg:p-14 xl:p-16 min-h-screen">
      <div className="space-y-8 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F0F5F7] text-[#295255] flex items-center justify-center font-bold shadow-sm">
              <span className="material-symbols-outlined !text-[#295255] text-2xl font-bold">
                mark_email_read
              </span>
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight text-white">
                Kaizentrix Care
              </p>
              <p className="text-[10px] tracking-[.18em] uppercase text-[#F0F5F7]/80 font-semibold">
                Email Verification
              </p>
            </div>
          </div>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3.5 py-1.5 rounded-xl border border-white/10 transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">
                arrow_back
              </span>
              Back
            </button>
          )}
        </div>

        <div className="pt-16 xl:pt-24 space-y-5">
          <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-xs font-semibold text-[#F0F5F7] tracking-wider uppercase border border-white/10">
            Security & Verification
          </span>
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight text-white">
            Verify your
            <br />
            clinician email.
          </h1>
          <p className="text-sm xl:text-base text-[#F0F5F7]/85 leading-relaxed max-w-md">
            Enter the 6-digit verification code sent to your email to verify ownership before administrator credential review.
          </p>
        </div>
      </div>

      <div className="relative z-10 pt-10 border-t border-white/15 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <span className="material-symbols-outlined !text-[#F0F5F7] text-base">
            lock
          </span>
          <span>HIPAA & GDPR Compliant Identity Verification</span>
        </div>
        <p className="text-xs text-[#F0F5F7]/75">
          Two-step verification ensures clinical communications remain secure.
        </p>
      </div>

      <div className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full bg-[#577877]/25 blur-3xl pointer-events-none" />
    </aside>
  );
}

export default function DoctorVerifyEmailScreen({ initialEmail = "", onBack, onVerified }) {
  const [email, setEmail] = useState(initialEmail);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [resendStatus, setResendStatus] = useState("idle");
  const [resendMessage, setResendMessage] = useState("");
  const inputRefs = useRef([]);

  const handleDigitChange = (index, value) => {
    const cleaned = value.replace(/\D/g, "");
    if (!cleaned && value !== "") return;

    const newDigits = [...digits];
    if (cleaned.length > 1) {
      const pasted = cleaned.slice(0, 6).split("");
      for (let i = 0; i < 6; i++) {
        newDigits[i] = pasted[i] || "";
      }
      setDigits(newDigits);
      const nextFocus = Math.min(pasted.length, 5);
      inputRefs.current[nextFocus]?.focus();
      return;
    }

    newDigits[index] = cleaned.slice(-1);
    setDigits(newDigits);
    setErrorMessage("");

    if (cleaned && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, event) => {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (event) => {
    event?.preventDefault();
    setErrorMessage("");
    setResendMessage("");
    const code = digits.join("");

    if (!email || !email.trim()) {
      setErrorMessage("Please provide a valid registered email address.");
      return;
    }

    if (code.length !== 6 || digits.some((d) => !d)) {
      setErrorMessage("Please enter all 6 digits of your verification code.");
      return;
    }

    setStatus("submitting");
    try {
      await authApi.verifyEmail(email.trim().toLowerCase(), code);
      setStatus("success");
      if (onVerified) {
        onVerified();
      }
    } catch (error) {
      setStatus("error");
      setErrorMessage(error.message || "Invalid or expired verification code. Please try again.");
    }
  };

  const handleResend = async () => {
    if (!email || !email.trim()) {
      setErrorMessage("Please enter your registered email address.");
      return;
    }
    setResendStatus("sending");
    setResendMessage("");
    setErrorMessage("");
    try {
      await authApi.register({ email: email.trim() });
      setResendStatus("sent");
      setResendMessage(`A new verification code has been sent to ${email}.`);
    } catch (error) {
      setResendStatus("error");
      setResendMessage(error.message || "Unable to resend verification code. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F5F7] font-sans grid grid-cols-1 lg:grid-cols-2 text-[#162623]">
      <ClinicianBrandPanel onBack={onBack} />

      <main className="flex flex-col justify-between p-6 sm:p-10 lg:p-14 xl:p-16 min-h-screen overflow-y-auto">
        <div className="max-w-md w-full mx-auto space-y-6">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#295255] hover:underline cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">arrow_back</span>
            Back to registration
          </button>

          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
              Verify Clinician Email
            </h2>
            <p className="text-xs sm:text-sm text-[#577877]">
              Enter the 6-digit OTP code sent to your registered email address.
            </p>
          </div>

          <form onSubmit={handleVerify} className="space-y-5">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#162623]">
                Registered Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@clinic.com"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#295255]"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-semibold text-[#162623]">
                6-Digit Verification Code (OTP)
              </label>
              <div className="mt-2 flex justify-between gap-2">
                {digits.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => (inputRefs.current[idx] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleDigitChange(idx, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(idx, e)}
                    className="h-12 w-11 rounded-xl border border-[#577877]/30 text-center text-xl font-bold text-[#295255] shadow-xs transition focus:border-[#295255] focus:outline-none"
                  />
                ))}
              </div>
            </div>

            {errorMessage && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-medium text-red-600">
                ⚠️ {errorMessage}
              </div>
            )}

            {resendMessage && (
              <div
                className={`rounded-xl p-3 text-xs font-medium ${
                  resendStatus === "error"
                    ? "border border-red-200 bg-red-50 text-red-600"
                    : "border border-teal-200 bg-teal-50 text-[#295255]"
                }`}
              >
                {resendStatus === "sent" ? "✅ " : "ℹ️ "}
                {resendMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={status === "submitting"}
              className="w-full rounded-xl bg-[#295255] py-3 text-xs font-bold text-white shadow transition hover:bg-[#1f3f41] disabled:opacity-50 cursor-pointer"
            >
              {status === "submitting" ? "Verifying OTP…" : "Verify OTP Code"}
            </button>
          </form>

          <div className="text-center text-xs text-[#577877]">
            Didn't receive the code?{" "}
            <button
              type="button"
              onClick={handleResend}
              disabled={resendStatus === "sending"}
              className="font-bold text-[#295255] hover:underline disabled:opacity-50 cursor-pointer"
            >
              {resendStatus === "sending" ? "Resending…" : "Resend OTP"}
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
