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
    if (!refundModal) return;
    setRefunding(true);
    try {
      await adminApi.refundPayment(refundModal, refundReason);
      showToast("Refund processed successfully.", "warning");
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
            Payment Oversight & Reconciliation
          </span>
          <h1 className="text-2xl font-bold text-[#162623]">
            Financial Transactions, Razorpay Receipts & Refunds
          </h1>
          <p className="text-xs text-[#577877]">
            Monitor gateway transactions, view receipts, handle failed payments, and process refunds.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleExportCSV}
            className="rounded-xl border border-[#577877]/30 bg-white px-3.5 py-2 text-xs font-semibold text-[#25836F] hover:bg-[#F0F5F7] flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">download</span>
            Export CSV
          </button>
        </div>
      </div>

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

      {/* Refund Modal */}
      {refundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162623]/50 backdrop-blur-xs p-4">
          <div className="care-card max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-[#162623]">Issue Administrative Refund</h3>
            <p className="text-xs text-[#577877]">
              Provide a reason for processing this payment refund.
            </p>
            <textarea
              value={refundReason}
              onChange={(e) => setRefundReason(e.target.value)}
              className="w-full rounded-xl border border-[#577877]/25 p-3 text-xs h-24"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setRefundModal(null)}
                className="rounded-xl border border-[#577877]/30 px-3 py-2 text-xs font-semibold text-[#577877]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRefund}
                disabled={refunding}
                className="rounded-xl bg-amber-700 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-800 disabled:opacity-50"
              >
                {refunding ? "Refunding…" : "Confirm Refund"}
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
                {paginatedPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-[#F0F5F7]/50">
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
                          onClick={() => setRefundModal(p.id)}
                          className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-50"
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
    </div>
  );
}
