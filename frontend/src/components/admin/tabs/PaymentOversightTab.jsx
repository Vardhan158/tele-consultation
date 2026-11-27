import { useEffect, useState } from "react";
import { adminApi } from "../../../lib/api";
import { useToast } from "../../common/Toast";

const ITEMS_PER_PAGE = 5;

export default function PaymentOversightTab() {
  const { showToast } = useToast();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [refundModal, setRefundModal] = useState(null);
  const [refundReason, setRefundReason] = useState("Administrative refund / Goodwill");
  const [refunding, setRefunding] = useState(false);

  // Section 194J Statutory Payout Ledger State
  const [viewMode, setViewMode] = useState("transactions"); // "transactions" | "section_194j"
  const [payoutLedgerData, setPayoutLedgerData] = useState(null);
  const [loadingLedger, setLoadingLedger] = useState(false);

  const loadPayoutLedger = () => {
    setLoadingLedger(true);
    adminApi
      .payoutLedger()
      .then((data) => setPayoutLedgerData(data))
      .catch((err) => {
        showToast(err.message || "Failed to load Section 194J payout ledger.", "error");
      })
      .finally(() => setLoadingLedger(false));
  };

  useEffect(() => {
    if (viewMode === "section_194j") {
      loadPayoutLedger();
    }
  }, [viewMode]);

  const loadPayments = () => {
    setLoading(true);
    adminApi
      .payments(filter)
      .then((res) => setPayments(Array.isArray(res) ? res : []))
      .catch((err) => {
        showToast(err.message || "Failed to load payment transactions.", "error");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPayments();
  }, [filter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery]);

  const handleConfirmRefund = async () => {
    if (!refundModal || refunding) return;
    setRefunding(true);
    try {
      const targetId = typeof refundModal === "object" ? refundModal.id : refundModal;
      const res = await adminApi.refundPayment(targetId, refundReason);
      const refId = res.razorpay_refund_id || res.id;
      const amt = res.formatted_amount || (refundModal.amount ? `₹${refundModal.amount}` : "payment");
      showToast(`Refund of ${amt} processed via Razorpay (Reference: ${refId}).`, "success");
      setRefundModal(null);
      loadPayments();
    } catch (err) {
      showToast(err.message || "Failed to process refund.", "error");
    } finally {
      setRefunding(false);
    }
  };

  const handleExportCSV = () => {
    if (!payments.length) return;
    const csvRows = [
      ["Payment ID", "Patient Name", "Amount", "Currency", "Status", "Provider", "Razorpay Order ID", "Created At"],
      ...payments.map((p) => [
        p.id,
        p.patient_name,
        p.amount,
        p.currency,
        p.status,
        p.provider,
        p.razorpay_order_id || p.provider_transaction_id || "",
        p.created_at || "",
      ]),
    ];
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.map((e) => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `kaizentrix_payments_ledger_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast("Payment ledger exported as CSV successfully.", "success");
  };

  const filteredPayments = payments.filter((p) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const idMatch = (p.id || "").toLowerCase().includes(q);
    const nameMatch = (p.patient_name || "").toLowerCase().includes(q);
    const orderMatch = (p.razorpay_order_id || p.provider_transaction_id || "").toLowerCase().includes(q);
    return idMatch || nameMatch || orderMatch;
  });

  const totalPages = Math.ceil(filteredPayments.length / ITEMS_PER_PAGE) || 1;
  const paginatedPayments = filteredPayments.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const totalCaptured = payments
    .filter((p) => p.status === "captured")
    .reduce((acc, curr) => acc + (curr.amount || 0), 0);

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#577877]/15 pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
            Financial &amp; Statutory Compliance Oversight
          </span>
          <h1 className="text-2xl font-bold text-[#162623]">
            {viewMode === "section_194j" ? "Section 194J 10% TDS Ledger & Clinician Payouts" : "Financial Transactions, Razorpay Receipts & Refunds"}
          </h1>
          <p className="text-xs text-[#577877]">
            {viewMode === "section_194j"
              ? "Reconciled statutory tax deduction ledger under Section 194J of the Indian Income Tax Act for quarterly Form 26Q filing."
              : "Monitor gateway transactions, view receipts, handle failed payments, and process refunds."}
          </p>
        </div>

        <div className="flex gap-2">
          {viewMode === "transactions" ? (
            <button
              onClick={handleExportCSV}
              className="rounded-xl border border-[#577877]/30 bg-white px-3.5 py-2 text-xs font-semibold text-[#25836F] hover:bg-[#F0F5F7] flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              Export CSV
            </button>
          ) : (
            <button
              onClick={() => {
                if (!payoutLedgerData?.entries?.length) return;
                const rows = [
                  ["Ledger ID", "Financial Year", "Doctor Name", "Appointment ID", "Gross Fee (INR)", "Platform Cut (INR)", "TDS Rate (%)", "TDS Withheld (INR)", "Net Payable (INR)", "Status", "Date"],
                  ...payoutLedgerData.entries.map((e) => [
                    e.id,
                    e.financial_year,
                    e.doctor_name,
                    e.appointment_id,
                    e.gross_amount_inr,
                    e.platform_fee_inr,
                    e.tds_rate_percent,
                    e.tds_withheld_inr,
                    e.net_payable_inr,
                    e.status,
                    e.created_at || "",
                  ]),
                ];
                const content = "data:text/csv;charset=utf-8," + rows.map((r) => r.join(",")).join("\n");
                const link = document.createElement("a");
                link.setAttribute("href", encodeURI(content));
                link.setAttribute("download", `section_194j_tds_ledger_${Date.now()}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                showToast("Section 194J Tax Ledger CSV exported successfully.", "success");
              }}
              className="btn-primary !px-3.5 !py-2 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">file_download</span>
              Export Form 26Q CSV
            </button>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex gap-2 border-b border-[#577877]/15 pb-2">
        <button
          type="button"
          onClick={() => setViewMode("transactions")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            viewMode === "transactions"
              ? "bg-[#25836F] text-white shadow-xs"
              : "bg-white text-[#577877] border border-[#577877]/20 hover:text-[#162623]"
          }`}
        >
          <span className="material-symbols-outlined text-sm">receipt_long</span>
          <span>Patient Payments ({payments.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setViewMode("section_194j")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
            viewMode === "section_194j"
              ? "bg-[#25836F] text-white shadow-xs"
              : "bg-white text-[#577877] border border-[#577877]/20 hover:text-[#162623]"
          }`}
        >
          <span className="material-symbols-outlined text-sm">account_balance</span>
          <span>Section 194J 10% TDS Ledger</span>
          <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
            Form 26Q Ready
          </span>
        </button>
      </div>

      {viewMode === "section_194j" ? (
        <div className="space-y-6">
          {/* Statutory Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-white border border-[#577877]/15 shadow-xs space-y-1">
              <span className="text-[#577877] font-medium block">Total Consultation Volume</span>
              <span className="text-xl font-bold text-[#162623] block">
                ₹{(payoutLedgerData?.total_gross_inr || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-[#577877]">FY {payoutLedgerData?.financial_year || "2026-2027"}</span>
            </div>

            <div className="p-4 rounded-xl bg-white border border-[#577877]/15 shadow-xs space-y-1">
              <span className="text-[#577877] font-medium block">Platform Commission (15%)</span>
              <span className="text-xl font-bold text-[#25836F] block">
                ₹{(payoutLedgerData?.total_platform_commission_inr || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-[#577877]">Clinic net software margin</span>
            </div>

            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 shadow-xs space-y-1">
              <span className="text-amber-800 font-bold block flex items-center gap-1">
                <span className="material-symbols-outlined text-xs">gavel</span>
                TDS Section 194J (10%)
              </span>
              <span className="text-xl font-bold text-amber-900 block">
                ₹{(payoutLedgerData?.total_tds_withheld_inr || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-amber-700">Statutory Tax Payable to Govt</span>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 shadow-xs space-y-1">
              <span className="text-emerald-800 font-bold block">Net Clinician Payable</span>
              <span className="text-xl font-bold text-emerald-900 block">
                ₹{(payoutLedgerData?.total_net_payable_inr || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-emerald-700">Total doctor settlement pool</span>
            </div>
          </div>

          {/* Section 194J Ledger Table */}
          <div className="care-card overflow-hidden">
            <div className="p-4 bg-[#F0F5F7] border-b border-[#577877]/15 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#25836F]">description</span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#162623]">
                  Statutory Tax Withholding Ledger (Form 26Q Schedule)
                </h3>
              </div>
              <span className="text-[11px] font-semibold text-[#577877]">
                {payoutLedgerData?.entries?.length || 0} Transactions Ledgered
              </span>
            </div>

            {loadingLedger ? (
              <div className="flex h-36 items-center justify-center text-[#577877]">
                <span className="material-symbols-outlined animate-spin text-2xl">sync</span>
              </div>
            ) : payoutLedgerData?.entries?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F9FBFA] border-b border-[#577877]/15 text-[#577877] font-semibold">
                    <tr>
                      <th className="p-3">Attending Clinician</th>
                      <th className="p-3">Consultation Ref</th>
                      <th className="p-3">Gross Fee</th>
                      <th className="p-3">Platform Cut (15%)</th>
                      <th className="p-3">TDS Section 194J (10%)</th>
                      <th className="p-3">Net Clinician Due</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Statutory Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#577877]/15">
                    {payoutLedgerData.entries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-[#F0F5F7]/50">
                        <td className="p-3 font-semibold text-[#162623]">{entry.doctor_name}</td>
                        <td className="p-3 font-mono text-[11px] text-[#577877]">{entry.appointment_id.slice(0, 10)}…</td>
                        <td className="p-3 font-bold text-[#162623]">₹{entry.gross_amount_inr.toFixed(2)}</td>
                        <td className="p-3 text-[#577877]">₹{entry.platform_fee_inr.toFixed(2)}</td>
                        <td className="p-3 font-bold text-amber-800 bg-amber-50/50">₹{entry.tds_withheld_inr.toFixed(2)}</td>
                        <td className="p-3 font-bold text-emerald-800">₹{entry.net_payable_inr.toFixed(2)}</td>
                        <td className="p-3 text-[11px] text-[#577877]">
                          {entry.created_at ? new Date(entry.created_at).toLocaleDateString("en-IN") : "Recent"}
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800">
                            Reconciled
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-[#577877] space-y-1">
                <span className="material-symbols-outlined text-3xl text-[#577877]/60">account_balance_wallet</span>
                <p className="font-semibold text-[#162623]">No Section 194J TDS entries ledgered yet.</p>
                <p>As patient payments are captured, 10% TDS withholding records will populate here automatically.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Search & Filter Bar */}
          <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between care-card p-4">
          <div className="flex gap-2">
            {["all", "captured", "refunded", "failed"].map((st) => (
              <button
                key={st}
                onClick={() => setFilter(st)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                  filter === st ? "bg-[#25836F] text-white" : "bg-[#F0F5F7] text-[#577877]"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="text-right text-xs">
            <span className="text-[#577877]">Net Captured Revenue: </span>
            <span className="font-bold text-lg text-[#25836F]">
              ₹{totalCaptured.toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        <div className="care-card p-4">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#577877] text-lg">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Payment ID, Patient Name, or Razorpay Order ID…"
              className="w-full rounded-xl border border-[#577877]/25 pl-9 pr-3 py-2 text-xs focus:border-[#25836F] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Receipt Modal */}
      {selectedPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162623]/50 backdrop-blur-xs p-4">
          <div className="care-card max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#577877]/15 pb-3">
              <h3 className="text-sm font-bold text-[#162623]">
                Digital Payment Receipt #{selectedPayment.id}
              </h3>
              <button
                onClick={() => setSelectedPayment(null)}
                className="text-xs font-semibold text-[#577877] hover:underline"
              >
                Close ✕
              </button>
            </div>

            <div className="rounded-xl bg-[#F0F5F7] p-4 text-xs space-y-2">
              <div><strong>Patient Name:</strong> {selectedPayment.patient_name}</div>
              <div><strong>Amount Paid:</strong> ₹{selectedPayment.amount} {selectedPayment.currency}</div>
              <div><strong>Gateway Provider:</strong> {selectedPayment.provider || "Razorpay"}</div>
              <div><strong>Razorpay Order ID:</strong> {selectedPayment.razorpay_order_id || "N/A"}</div>
              <div><strong>Transaction ID:</strong> {selectedPayment.provider_transaction_id || "N/A"}</div>
              <div><strong>Payment Status:</strong> <span className="font-bold uppercase text-emerald-700">{selectedPayment.status}</span></div>
              <div><strong>Transaction Date:</strong> {selectedPayment.created_at ? new Date(selectedPayment.created_at).toLocaleString() : "N/A"}</div>
              {selectedPayment.refund_reason && (
                <div className="text-amber-800"><strong>Refund Reason:</strong> {selectedPayment.refund_reason}</div>
              )}
            </div>

            <div className="text-right">
              <button
                onClick={() => setSelectedPayment(null)}
                className="rounded-xl bg-[#25836F] px-4 py-2 text-xs font-semibold text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refund Confirmation Modal */}
      {refundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162623]/60 backdrop-blur-xs p-4">
          <div className="care-card max-w-md w-full p-6 sm:p-7 space-y-5 bg-white rounded-2xl border border-[#577877]/20 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-xl">undo</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-[#162623]">
                  Issue Administrative Refund
                </h3>
                <p className="text-xs text-[#577877]">
                  Verify payment details before confirming.
                </p>
              </div>
            </div>

            {/* Refund Item Details Card */}
            <div className="rounded-xl bg-[#F0F5F7] p-3.5 text-xs space-y-2 border border-[#577877]/15">
              <div className="flex justify-between">
                <span className="text-[#577877]">Refund Amount:</span>
                <span className="font-bold text-[#162623] text-sm">
                  {typeof refundModal === "object"
                    ? refundModal.formatted_amount || (refundModal.amount ? `₹${refundModal.amount}` : "₹400.00")
                    : "₹400.00"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Transaction Reference:</span>
                <span className="font-mono font-semibold text-[#162623]">
                  {typeof refundModal === "object"
                    ? refundModal.provider_transaction_id || refundModal.id
                    : refundModal}
                </span>
              </div>
              {typeof refundModal === "object" && refundModal.patient_name && (
                <div className="flex justify-between">
                  <span className="text-[#577877]">Patient Name:</span>
                  <span className="font-semibold text-[#162623]">
                    {refundModal.patient_name}
                  </span>
                </div>
              )}
            </div>

            {/* Explicit Final Warning Banner */}
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2.5">
              <span className="material-symbols-outlined text-rose-600 text-base shrink-0 mt-0.5">
                warning
              </span>
              <div className="space-y-0.5">
                <div className="font-bold text-rose-900">Final Confirmation Warning</div>
                <div className="font-normal leading-relaxed text-rose-800">
                  This action will initiate an immediate financial refund through Razorpay and cancel the associated appointment booking. This operation cannot be undone.
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                Administrative Reason
              </label>
              <textarea
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Reason for administrative refund..."
                className="w-full rounded-xl border border-[#577877]/25 p-3 text-xs h-20 text-[#162623] focus:outline-none focus:border-[#25836F] bg-white"
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-1">
              <button
                type="button"
                disabled={refunding}
                onClick={() => setRefundModal(null)}
                className="btn-secondary !py-2 !px-4 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={refunding}
                onClick={handleConfirmRefund}
                className="rounded-xl bg-rose-600 text-xs font-bold text-white shadow-xs hover:bg-rose-700 px-4 py-2 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                {refunding ? (
                  <>
                    <span className="material-symbols-outlined animate-spin text-sm">
                      sync
                    </span>
                    <span>Refunding…</span>
                  </>
                ) : (
                  "Confirm & Issue Refund"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Table & Empty State */}
      {loading ? (
        <div className="flex h-48 items-center justify-center text-[#577877]">
          <span className="material-symbols-outlined animate-spin text-3xl">sync</span>
        </div>
      ) : paginatedPayments.length === 0 ? (
        <div className="care-card p-12 text-center text-[#577877] space-y-2">
          <span className="material-symbols-outlined text-4xl text-[#577877]/60">payments</span>
          <h3 className="text-base font-bold text-[#162623]">No Payments Found</h3>
          <p className="text-xs max-w-sm mx-auto">
            No transactions match status filter <strong>"{filter}"</strong> or query <strong>"{searchQuery}"</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="care-card overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F0F5F7] border-b border-[#577877]/15 text-[#577877] font-semibold">
                <tr>
                  <th className="p-3">Payment ID / Date</th>
                  <th className="p-3">Patient</th>
                  <th className="p-3">Razorpay Order ID</th>
                  <th className="p-3">Amount</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#577877]/15">
                {paginatedPayments.map((p, idx) => (
                  <tr key={`${p.id || 'pay'}-${idx}`} className="hover:bg-[#F0F5F7]/50">
                    <td className="p-3 font-mono text-[11px] text-[#162623]">
                      <div className="font-bold">{p.id}</div>
                      <div className="text-[#577877] font-sans text-[10px]">
                        {p.created_at ? new Date(p.created_at).toLocaleString() : "N/A"}
                      </div>
                    </td>
                    <td className="p-3 font-semibold text-[#162623]">{p.patient_name}</td>
                    <td className="p-3 text-[#577877] font-mono text-[10px]">
                      {p.razorpay_order_id || p.provider_transaction_id || "N/A"}
                    </td>
                    <td className="p-3 font-bold text-[#25836F]">₹{p.amount}</td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          p.status === "captured"
                            ? "bg-emerald-100 text-emerald-800"
                            : p.status === "refunded"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => setSelectedPayment(p)}
                        className="rounded-lg border border-[#577877]/30 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#25836F] hover:bg-[#F0F5F7]"
                      >
                        Receipt
                      </button>

                      {p.status === "captured" && (
                        <button
                          onClick={() => setRefundModal(p)}
                          className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-50 cursor-pointer"
                        >
                          Refund
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[#577877]/15 pt-4 text-xs">
              <span className="text-[#577877]">
                Showing Page {currentPage} of {totalPages} ({filteredPayments.length} payment records)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-[#577877]/25 px-3 py-1.5 font-semibold text-[#25836F] hover:bg-[#F0F5F7] disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-[#577877]/25 px-3 py-1.5 font-semibold text-[#25836F] hover:bg-[#F0F5F7] disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
