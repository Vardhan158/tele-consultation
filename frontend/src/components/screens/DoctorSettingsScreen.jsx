import { useEffect, useState } from "react";
import { doctorApi, supportDashboardApi } from "../../lib/api";
import { QRCodeSVG } from "qrcode.react";

export default function DoctorSettingsScreen() {
  const [enrollment, setEnrollment] = useState(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [showSetupKey, setShowSetupKey] = useState(false);
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState([]);

  // Support Ticket State for Doctor
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketCategory, setTicketCategory] = useState("technical");
  const [ticketSubmitting, setTicketSubmitting] = useState(false);
  const [ticketMsg, setTicketMsg] = useState("");

  const handleSupportTicketSubmit = async (e) => {
    e.preventDefault();
    if (!ticketSubject || !ticketDescription) return;
    setTicketSubmitting(true);
    setTicketMsg("");
    try {
      await supportDashboardApi.createTicket({
        subject: ticketSubject,
        description: ticketDescription,
        category: ticketCategory,
        user_type: "doctor",
      });
      setTicketMsg("Support ticket submitted successfully! A support agent will review your issue.");
      setTicketSubject("");
      setTicketDescription("");
    } catch (err) {
      setTicketMsg(err.message || "Failed to submit support request.");
    } finally {
      setTicketSubmitting(false);
    }
  };
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

      {/* Support Request Card for Doctors */}
      <div className="rounded-2xl bg-white border border-[#577877]/15 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#25836F]">headset_mic</span>
          <h2 className="font-bold text-lg text-[#162623]">Platform Support Request</h2>
        </div>
        <p className="text-sm text-[#577877]">
          Experiencing video connection issues, schedule problems, or account questions? Submit a ticket directly to the Kaizen Care Support Desk.
        </p>

        <form onSubmit={handleSupportTicketSubmit} className="space-y-3 pt-1">
          <div>
            <label className="block text-xs font-semibold text-[#162623] mb-1">Issue Category</label>
            <select
              value={ticketCategory}
              onChange={(e) => setTicketCategory(e.target.value)}
              className="w-full rounded-xl border border-[#577877]/30 p-2.5 text-sm outline-none"
            >
              <option value="technical">Technical / Video Consultation</option>
              <option value="appointment">Schedule / Appointment Problem</option>
              <option value="clinical">Clinical Notes / Prescription Issue</option>
              <option value="account_access">Account & Security</option>
              <option value="general">General Support Query</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#162623] mb-1">Subject</label>
            <input
              type="text"
              required
              value={ticketSubject}
              onChange={(e) => setTicketSubject(e.target.value)}
              placeholder="Brief title of the problem…"
              className="w-full rounded-xl border border-[#577877]/30 p-2.5 text-sm outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#162623] mb-1">Description</label>
            <textarea
              required
              rows={3}
              value={ticketDescription}
              onChange={(e) => setTicketDescription(e.target.value)}
              placeholder="Please provide relevant details so our support team can assist you quickly…"
              className="w-full rounded-xl border border-[#577877]/30 p-2.5 text-sm outline-none"
            />
          </div>

          {ticketMsg && (
            <p className={`text-xs font-semibold ${ticketMsg.includes("successfully") ? "text-emerald-700 bg-emerald-50 p-2.5 rounded-lg" : "text-red-600 bg-red-50 p-2.5 rounded-lg"}`}>
              {ticketMsg}
            </p>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={ticketSubmitting}
              className="btn-primary cursor-pointer disabled:opacity-50"
            >
              {ticketSubmitting ? "Submitting Ticket…" : "Submit Support Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
