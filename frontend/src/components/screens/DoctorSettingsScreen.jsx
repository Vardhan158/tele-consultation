import { useState } from "react";
import { doctorApi } from "../../lib/api";

export default function DoctorSettingsScreen() {
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const enroll = async () => {
    try {
      setEnrollment(await doctorApi.enrollMfa());
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
      await doctorApi.verifyMfa(code);
      setMessage("MFA enabled for future doctor logins.");
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
            <p className="font-mono text-sm break-all">
              Secret: {enrollment.secret}
            </p>
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
            </form>
          </>
        )}
        {message && <p className="text-sm text-[#295255]">{message}</p>}
      </div>
    </div>
  );
}
