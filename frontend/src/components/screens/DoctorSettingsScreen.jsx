import { useEffect, useState } from "react";
import { doctorApi } from "../../lib/api";
import { QRCodeSVG } from "qrcode.react";

export default function DoctorSettingsScreen() {
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [showSetupKey, setShowSetupKey] = useState(false);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState([]);
  useEffect(() => {
    if (!enrollment) return undefined;
    const timer = window.setTimeout(() => {
      setEnrollment(null);
      setCode("");
      setShowSetupKey(false);
      setMessage("MFA enrollment expired. Start enrollment again.");
    }, (enrollment.expires_in_minutes || 10) * 60 * 1000);
    return () => window.clearTimeout(timer);
  }, [enrollment]);
  const enroll = async () => {
    try {
      setEnrollment(await doctorApi.enrollMfa());
      setRecoveryCodes([]);
      setShowSetupKey(false);
      setShowRecoveryCodes(false);
      setMessage(
        "Scan or enter the secret in an authenticator app, then verify a code.",
      );
    } catch (err) {
      setMessage(err.message);
    }
  };
  const verify = async (event) => {
    event.preventDefault();
    try {
      const result = await doctorApi.verifyMfa(code);
      setEnrollment(null);
      setCode("");
      setRecoveryCodes(result.recovery_codes || []);
      setMessage("MFA Enabled Successfully");
    } catch (err) {
      setMessage(err.message);
    }
  };
  return (
    <div className="p-6 lg:p-10 max-w-3xl mx-auto space-y-5">
      <h1 className="text-3xl font-bold">Doctor settings</h1>
      <div className="rounded-2xl bg-white border border-[#577877]/15 p-6 space-y-4">
        <h2 className="font-bold">Two-step verification</h2>
        <p className="text-sm text-[#577877]">
          MFA protects doctor accounts and is required when enabled.
        </p>
        {!enrollment && (
          <button className="btn-primary" type="button" onClick={enroll}>
            Begin MFA enrollment
          </button>
        )}
        {enrollment && (
          <>
            <div className="space-y-2 text-sm">
              <p>Open Google Authenticator or Microsoft Authenticator and scan this QR code.</p>
              <QRCodeSVG value={enrollment.otpauth_uri} size={192} level="M" includeMargin className="max-w-full h-auto" />
              <details><summary className="cursor-pointer text-xs font-semibold text-[#25836F]">Can&apos;t scan? Enter key manually</summary><p className="font-mono break-all mt-2">{showSetupKey ? enrollment.secret : "••••••••••••••••••••"}</p><button type="button" className="text-xs font-semibold text-[#25836F] hover:underline" onClick={() => setShowSetupKey((value) => !value)}>{showSetupKey ? "Hide setup key" : "Reveal setup key"}</button></details>
              <p className="text-xs text-[#577877] break-all">Issuer: Kaizentrix Care · Account: your doctor login</p>
              <p className="text-xs text-amber-700">This setup expires in {enrollment.expires_in_minutes || 10} minutes. The secret is shown only during enrollment.</p>
            </div>
            <p className="text-xs text-[#577877]">
              Store recovery codes securely; they are shown only during
              enrollment.
            </p>
            <form onSubmit={verify} className="flex gap-2">
              <input
                required
                pattern="[0-9]{6}"
                maxLength="6"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="6-digit code"
                className="rounded-lg border p-2"
              />
              <button className="btn-primary" type="submit">
                Verify
              </button>
              <button type="button" className="rounded-lg border px-3" onClick={async () => { await doctorApi.cancelMfaEnrollment().catch(() => {}); setEnrollment(null); setCode(""); setShowSetupKey(false); setMessage("Enrollment cancelled."); }}>Cancel</button>
            </form>
            {recoveryCodes.length > 0 && <div className="rounded-lg bg-amber-50 p-3 text-xs"><p className="font-semibold">Save these recovery codes now. Each code works once.</p><button type="button" className="mt-1 font-semibold text-[#25836F] hover:underline" onClick={() => setShowRecoveryCodes((value) => !value)}>{showRecoveryCodes ? "Hide recovery codes" : "Reveal recovery codes"}</button>{showRecoveryCodes && <p className="font-mono break-all mt-1">{recoveryCodes.join(" · ")}</p>}</div>}
          </>
        )}
        {message && <p className="text-sm text-[#25836F]">{message}</p>}
      </div>
    </div>
  );
}
