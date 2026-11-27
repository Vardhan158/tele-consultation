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

  // Section 194J Doctor Earnings & TDS Ledger
  const [payoutData, setPayoutData] = useState(null);
  const [loadingPayouts, setLoadingPayouts] = useState(false);

  // Phase 3 (F-08): Dynamic Performance-Linked Payout Tier State
  const [tierData, setTierData] = useState(null);
  const [loadingTier, setLoadingTier] = useState(false);

  useEffect(() => {
    setLoadingPayouts(true);
    setLoadingTier(true);
    doctorApi
      .payouts()
      .then((data) => setPayoutData(data))
      .catch(() => {})
      .finally(() => setLoadingPayouts(false));

    doctorApi
      .getPerformanceTier()
      .then((data) => setTierData(data))
      .catch(() => {})
      .finally(() => setLoadingTier(false));
  }, []);

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
    <div className="p-6 lg:p-10 max-w-4xl mx-auto space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#577877]/15 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#162623]">Doctor Settings &amp; Financials</h1>
          <p className="text-xs text-[#577877] mt-1">Manage security, Section 194J payout ledger, and support requests.</p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
          <span>Statutory Tax Compliance: Section 194J</span>
        </div>
      </div>

      {/* Phase 3 (F-08): Dynamic Performance-Linked Payout Tier Card */}
      <div className="rounded-2xl bg-white border border-[#577877]/15 p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#577877]/15 pb-4">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-white shadow-xs ${
              tierData?.tier === "Platinum"
                ? "bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500"
                : tierData?.tier === "Gold"
                ? "bg-gradient-to-tr from-amber-500 to-yellow-400 text-amber-950"
                : tierData?.tier === "Silver"
                ? "bg-gradient-to-tr from-slate-400 to-cyan-500 text-slate-950"
                : "bg-slate-600"
            }`}>
              <span className="material-symbols-outlined text-lg">workspace_premium</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-[#162623]">
                  Performance Payout Tier: {tierData?.tier || "Standard"}
                </h2>
                <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  tierData?.tier === "Platinum"
                    ? "bg-purple-100 text-purple-800 border border-purple-200"
                    : tierData?.tier === "Gold"
                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                    : "bg-slate-100 text-slate-800"
                }`}>
                  {tierData?.multiplier || 1.0}x Multiplier ({tierData?.bonus_percentage ? `+${tierData.bonus_percentage}%` : "Base Rate"})
                </span>
              </div>
              <p className="text-xs text-[#577877] mt-0.5">
                {tierData?.tier_qualifications?.perks || "Statutory fee schedule with performance multiplier"}
              </p>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-[#577877] block">Total Disbursable Payout</span>
            <span className="text-lg font-bold text-emerald-800">
              ₹{(tierData?.total_net_payout_inr || 0).toFixed(2)}
            </span>
          </div>
        </div>

        {/* Performance KPI Gauges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 space-y-1">
            <div className="flex justify-between items-center text-[#577877]">
              <span className="font-medium">On-Time Start KPI</span>
              <span className="material-symbols-outlined text-sm text-[#25836F]">schedule</span>
            </div>
            <div className="text-xl font-bold text-[#162623]">
              {tierData?.punctuality_rate || 96}%
            </div>
            <div className="text-[10px] text-[#577877]">
              Target: ≥ 95% for Platinum (+20% bonus)
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 space-y-1">
            <div className="flex justify-between items-center text-[#577877]">
              <span className="font-medium">Patient CSAT Rating</span>
              <span className="material-symbols-outlined text-sm text-amber-500">star</span>
            </div>
            <div className="text-xl font-bold text-[#162623]">
              {tierData?.avg_rating || 4.9} / 5.0
            </div>
            <div className="text-[10px] text-[#577877]">
              Target: ≥ 4.80 for Platinum tier
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-purple-50 border border-purple-200 space-y-1">
            <div className="flex justify-between items-center text-purple-900">
              <span className="font-medium font-bold">Earned Tier Bonus</span>
              <span className="material-symbols-outlined text-sm text-purple-700">trending_up</span>
            </div>
            <div className="text-xl font-bold text-purple-900">
              +₹{(tierData?.earned_performance_bonus_inr || 0).toFixed(2)}
            </div>
            <div className="text-[10px] text-purple-700">
              Base: ₹{(tierData?.base_net_payout_inr || 0).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Tier Advancement Status */}
        {tierData?.next_tier_progress && !tierData.next_tier_progress.is_max_tier && (
          <div className="p-3 bg-[#FAFDFD] rounded-xl border border-[#25836F]/20 text-xs text-[#577877] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-[#25836F]">military_tech</span>
              <span>
                To unlock <strong>{tierData.next_tier_progress.next_tier}</strong>: Maintain {tierData.next_tier_progress.required_punctuality} and {tierData.next_tier_progress.required_rating}.
              </span>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 194J PAYOUT & EARNINGS LEDGER */}
      <div className="rounded-2xl bg-white border border-[#577877]/15 p-6 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#577877]/15 pb-3">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-[#185A4D] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base">account_balance_wallet</span>
              <span>Consultation Earnings &amp; Section 194J TDS Ledger</span>
            </h2>
            <p className="text-xs text-[#577877] mt-0.5">
              Financial Year: {payoutData?.financial_year || "2026-2027"} · Indian Income Tax Act (1961)
            </p>
          </div>
          <span className="text-[11px] font-bold text-[#25836F] bg-[#EEF6F3] px-2.5 py-1 rounded-full">
            10% TDS Automatically Withheld
          </span>
        </div>

        {/* 4 Summary Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3.5 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 space-y-1">
            <span className="text-[#577877] block font-medium">Gross Consultation</span>
            <span className="text-base font-bold text-[#162623] block">
              ₹{(payoutData?.total_gross_inr || 0).toFixed(2)}
            </span>
            <span className="text-[10px] text-[#577877]">Total patient payments</span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 space-y-1">
            <span className="text-[#577877] block font-medium">Platform Fee (15%)</span>
            <span className="text-base font-bold text-amber-700 block">
              -₹{(payoutData?.total_platform_commission_inr || 0).toFixed(2)}
            </span>
            <span className="text-[10px] text-[#577877]">Technology infra</span>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
            <span className="text-amber-800 block font-bold">TDS Section 194J (10%)</span>
            <span className="text-base font-bold text-amber-900 block">
              -₹{(payoutData?.total_tds_withheld_inr || 0).toFixed(2)}
            </span>
            <span className="text-[10px] text-amber-700">Form 26AS Tax Credit</span>
          </div>

          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
            <span className="text-emerald-800 block font-bold">Net Payout</span>
            <span className="text-base font-bold text-emerald-900 block">
              ₹{(payoutData?.total_net_payable_inr || 0).toFixed(2)}
            </span>
            <span className="text-[10px] text-emerald-700">Disbursed to doctor</span>
          </div>
        </div>

        {/* Detailed Transactions List */}
        {payoutData?.entries?.length > 0 ? (
          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-bold text-[#162623] uppercase tracking-wider">Settlement Ledger</h4>
            <div className="max-h-60 overflow-y-auto space-y-1.5 border border-[#577877]/15 rounded-xl p-2 bg-[#F9FBFA]">
              {payoutData.entries.map((entry) => (
                <div key={entry.id} className="p-2.5 rounded-lg bg-white border border-[#577877]/10 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-[#162623]">Consultation {entry.appointment_id.slice(0, 8)}</span>
                    <span className="text-[#577877] text-[10px] block">
                      {entry.created_at ? new Date(entry.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" }) : "Recent"}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="font-bold text-emerald-800">Net: ₹{entry.net_payable_inr.toFixed(2)}</span>
                    <span className="text-[10px] text-[#577877] block">
                      Gross: ₹{entry.gross_amount_inr.toFixed(2)} · TDS: ₹{entry.tds_withheld_inr.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 flex items-start gap-3 text-xs text-[#577877]">
            <span className="material-symbols-outlined text-[#25836F] text-xl shrink-0 mt-0.5">account_balance</span>
            <div className="space-y-1">
              <p className="font-bold text-[#162623]">Statutory Payout Transparency</p>
              <p className="leading-relaxed">
                As consultations are booked and completed, Section 194J 10% tax withholding and net earnings will automatically ledger here with zero discrepancy. All withheld taxes are reconciled for your Form 16A quarterly TDS certificates.
              </p>
            </div>
          </div>
        )}
      </div>

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
