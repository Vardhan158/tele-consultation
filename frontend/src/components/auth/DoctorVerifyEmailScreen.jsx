import { useState, useRef } from "react";
import { authApi } from "../../lib/api";
import PublicNavbar from "../public/PublicNavbar";

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
      // Handle paste
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
      await authApi.verifyEmail(email.trim().lower ? email.trim().toLowerCase() : email.trim(), code);
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
    <div className="min-h-screen bg-[#F0F5F7] font-sans text-[#162623]">
      <PublicNavbar />
      <main className="px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-md space-y-6 rounded-2xl border border-[rgba(87,120,119,0.18)] bg-white p-6 shadow-[0_10px_30px_-8px_rgba(22,38,35,0.08)] sm:p-8">

          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 text-sm font-medium text-[#295255] hover:underline"
          >
            ← Back to registration
          </button>

          <div className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#295255]/10 text-[#295255]">
              <span className="text-2xl">🔐</span>
            </div>
            <h1 className="text-2xl font-bold text-[#162623]">
              Verify Clinician Email
            </h1>
            <p className="mt-2 text-sm text-[#577877]">
              Enter the 6-digit verification code sent to your registered email address.
            </p>
          </div>

          <form onSubmit={handleVerify} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#577877]">
                Registered Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="doctor@clinic.com"
                className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2.5 text-sm font-medium text-[#162623] focus:border-[#295255] focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#577877]">
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
                    className="h-12 w-11 rounded-xl border border-[#577877]/30 text-center text-xl font-bold text-[#295255] shadow-sm transition focus:border-[#295255] focus:ring-2 focus:ring-[#295255]/20 focus:outline-none"
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
              className="w-full rounded-xl bg-[#295255] px-4 py-3 font-semibold text-white shadow-md transition hover:bg-[#1f3f41] disabled:opacity-50"
            >
              {status === "submitting" ? "Verifying OTP…" : "Verify OTP"}
            </button>
          </form>

          <div className="pt-2 text-center text-xs text-[#577877]">
            Didn't receive the code?{" "}
            <button
              type="button"
              onClick={handleResend}
              disabled={resendStatus === "sending"}
              className="font-semibold text-[#295255] hover:underline disabled:opacity-50"
            >
              {resendStatus === "sending" ? "Resending…" : "Resend OTP"}
            </button>
          </div>

        </div>
      </main>
    </div>
  );
}
