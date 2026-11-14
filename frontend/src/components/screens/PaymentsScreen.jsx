import { useState, useEffect } from "react";
import { paymentApi, patientApi } from "../../lib/api";

export default function PaymentsScreen({ onNavigate, navParams }) {
  const [userView, setUserView] = useState(null);
  const view = userView ?? (navParams?.view || "billing");
  const setView = (v) => setUserView(v);

  const [patientProfile, setPatientProfile] = useState(null);
  const [dbTransactions, setDbTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  // Billing tab states
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [toastMessage, setToastMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const fetchPaymentsData = async () => {
    setLoading(true);
    try {
      const profile = await patientApi.profile().catch(() => null);
      if (profile) setPatientProfile(profile);

      const items = await paymentApi.list().catch(() => []);
      if (Array.isArray(items)) {
        const formatted = items.map((t) => {
          const rawStatus = strVal(t.status).toLowerCase();
          const isPaid = ["captured", "success", "paid"].includes(rawStatus);
          const isRefunded = rawStatus === "refunded";
          const statusText = isPaid ? "Paid" : isRefunded ? "Refunded" : "Pending";
          const symbol = t.currency === "USD" ? "$" : t.currency === "INR" ? "₹" : `${t.currency || "₹"} `;
          const formattedAmount = t.formatted_amount || `${symbol}${((t.amount_paise || 0) / 100).toFixed(2)}`;

          return {
            id: t.id,
            appointmentId: t.appointment_id,
            receiptId: t.receipt || `KC-RC-${strVal(t.id).slice(-6).toUpperCase()}`,
            date: t.created_at || t.appointment_date
              ? new Date(t.created_at || t.appointment_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Recent",
            datePaidFormatted: t.created_at
              ? new Date(t.created_at).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })
              : "Verified",
            doctor: t.doctor_name || "Authorized Clinician",
            specialty: t.doctor_specialty || "General Teleconsultation",
            amount: formattedAmount,
            amountPaise: t.amount_paise || 0,
            status: statusText,
            rawStatus,
            isPaid,
            method: "Razorpay Online Payment",
            description: `${t.appointment_type || "Video Consultation"} · ${t.doctor_name || "Clinician"}`,
            transactionId: t.provider_transaction_id || `TXN-${strVal(t.id).slice(-8).toUpperCase()}`,
            rawItem: t,
          };
        });
        setDbTransactions(formatted);
        if (formatted.length > 0 && !selectedReceipt) {
          setSelectedReceipt(formatted[0]);
        }
      }
    } catch {
      // Handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPaymentsData();
  }, []);

  const activeTransactions = dbTransactions;
  const activeTx = selectedReceipt || activeTransactions[0] || null;

  const currentReceiptData = activeTx ? {
    id: activeTx.id,
    appointmentId: activeTx.appointmentId,
    receiptId: activeTx.receiptId,
    transactionId: activeTx.transactionId,
    amount: activeTx.amount,
    datePaid: activeTx.datePaidFormatted,
    doctor: activeTx.doctor,
    specialty: activeTx.specialty,
    description: activeTx.description,
    status: activeTx.status,
    isPaid: activeTx.isPaid,
  } : null;

  const filteredTransactions = activeTransactions.filter((item) => {
    if (statusFilter === "All") return true;
    return item.status.toLowerCase() === statusFilter.toLowerCase();
  });

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage) || 1;
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const handleDownloadReceiptPdf = async (tx) => {
    const targetId = tx?.id || activeTx?.id;
    if (!targetId) {
      window.print();
      return;
    }
    try {
      const blob = await paymentApi.downloadReceipt(targetId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Receipt_${targetId}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setToastMessage("Payment receipt downloaded successfully.");
    } catch (err) {
      setToastMessage(err.message || "Downloading receipt...");
      window.print();
    }
    setTimeout(() => setToastMessage(""), 3500);
  };

  const handleDownloadStatement = () => {
    if (dbTransactions.length === 0) {
      setToastMessage("No payment transactions available to download statement.");
      setTimeout(() => setToastMessage(""), 3500);
      return;
    }

    const csvContent = [
      "Receipt,Appointment Date,Doctor,Specialty,Amount,Status,Payment Method",
      ...dbTransactions.map(
        (t) =>
          `"${t.receiptId}","${t.date}","${t.doctor}","${t.specialty}","${t.amount}","${t.status}","${t.method}"`,
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const patName = (patientProfile?.full_name || "Patient").replace(/\s+/g, "_");
    link.setAttribute("download", `KaizenCare_${patName}_Statement.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToastMessage("Financial statement downloaded successfully.");
    setTimeout(() => setToastMessage(""), 3500);
  };

  // Paid consultations calculation
  const paidTransactions = dbTransactions.filter((t) => t.isPaid);
  const paidCount = paidTransactions.length;
  const totalPaidNum = paidTransactions.reduce((acc, t) => acc + (t.amountPaise || 0), 0);
  const totalPaidFormatted = totalPaidNum > 0 ? `₹${(totalPaidNum / 100).toFixed(2)}` : "₹0.00";

  // Pending payments calculation
  const pendingTransactions = dbTransactions.filter((t) => !t.isPaid && t.status !== "Refunded");
  const pendingCount = pendingTransactions.length;
  const pendingAmountNum = pendingTransactions.reduce((acc, t) => acc + (t.amountPaise || 0), 0);
  const pendingAmountFormatted = pendingAmountNum > 0 ? `₹${(pendingAmountNum / 100).toFixed(2)}` : "₹0.00";

  // ========================================================
  // VIEW 1: PAYMENT RECEIPT / PENDING STATEMENT VIEW
  // ========================================================
  if (view === "receipt") {
    const isPaid = currentReceiptData?.isPaid;

    return (
      <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="p-3.5 rounded-xl bg-white border border-[#25836F]/30 shadow-sm flex items-center justify-between text-xs text-[#25836F] font-semibold">
              <span className="flex items-center gap-2">
                <span className="material-symbols-outlined text-base">
                  check_circle
                </span>
                {toastMessage}
              </span>
              <button
                type="button"
                onClick={() => setToastMessage("")}
                className="text-[#577877] hover:text-[#162623]"
              >
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            </div>
          )}

          {/* Header Row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
                {isPaid ? "Payment received" : "Pending Payment Record"}
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-[#577877]">
                {isPaid
                  ? "Your appointment is paid and confirmed."
                  : "Payment is required to confirm this appointment. Complete payment via Razorpay to finalize your booking."}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setView("billing")}
                className="btn-secondary !px-4 !py-2.5 rounded-xl font-semibold text-xs shadow-2xs cursor-pointer"
              >
                Back to payments
              </button>
              {currentReceiptData && (
                <button
                  type="button"
                  onClick={() => handleDownloadReceiptPdf(activeTx)}
                  className="btn-primary !px-5 !py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs shrink-0 cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-white text-base">
                    download
                  </span>
                  <span>{isPaid ? "Download PDF" : "Download Statement"}</span>
                </button>
              )}
            </div>
          </div>

          {!currentReceiptData ? (
            <div className="care-card p-12 text-center text-[#577877] space-y-3 bg-white rounded-2xl border border-[#577877]/15">
              <span className="w-12 h-12 rounded-full bg-[#E0F0EC] text-[#25836F] flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined !text-[#25836F] text-2xl">
                  receipt_long
                </span>
              </span>
              <h3 className="text-base font-bold text-[#162623]">
                No payment history yet
              </h3>
              <p className="text-xs max-w-md mx-auto leading-relaxed">
                Your payment receipts and transaction records for telehealth consultations will appear here once confirmed.
              </p>
            </div>
          ) : (
            /* Main 2-Column Content Area */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column (8 cols): Formal Printable Receipt / Statement Card */}
              <div className="lg:col-span-8 care-card p-6 sm:p-9 space-y-7 border border-[#577877]/15 shadow-sm bg-white rounded-2xl">
                {/* Receipt Header: Brand + Receipt ID */}
                <div className="flex items-center justify-between pb-2 border-b border-[#577877]/15">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#25836F] flex items-center justify-center text-white shadow-2xs shrink-0">
                      <span className="material-symbols-outlined text-2xl">
                        vital_signs
                      </span>
                    </div>
                    <div>
                      <h2 className="text-lg font-bold text-[#162623] tracking-tight">
                        Kaizen Care
                      </h2>
                      <p className="text-[10px] font-semibold tracking-wider uppercase text-[#577877]">
                        Patient Portal
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <h3 className="text-xl sm:text-2xl font-bold text-[#162623]">
                      {isPaid ? "Receipt" : "Payment Record"}
                    </h3>
                    <p className="text-xs text-[#577877] font-medium mt-0.5">
                      {currentReceiptData.receiptId}
                    </p>
                  </div>
                </div>

                {/* 3-Column Info Row: Billed to | Date paid | Status */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                  <div>
                    <span className="text-[#577877] block text-[11px]">
                      Billed to
                    </span>
                    <span className="font-bold text-sm text-[#162623] mt-1 block">
                      {patientProfile?.full_name || "Patient"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#577877] block text-[11px]">
                      {isPaid ? "Date paid" : "Record date"}
                    </span>
                    <span className="font-bold text-sm text-[#162623] mt-1 block">
                      {currentReceiptData.datePaid}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#577877] block text-[11px]">
                      Status
                    </span>
                    <span className="font-bold text-sm text-[#162623] mt-1 block">
                      {isPaid ? "Paid" : "Pending Payment"}
                    </span>
                  </div>
                </div>

                {/* Billing Address Row */}
                {patientProfile?.address && (
                  <div className="text-xs">
                    <span className="text-[#577877] block text-[11px]">
                      Billing address
                    </span>
                    <span className="font-bold text-sm text-[#162623] mt-1 block">
                      {patientProfile.address}
                    </span>
                  </div>
                )}

                {/* Line Items Table with Shaded Header */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[#F0F5F7] text-[#577877] font-medium rounded-xl">
                        <th className="py-2.5 px-4 rounded-l-xl">Description</th>
                        <th className="py-2.5 px-4 text-center">Quantity</th>
                        <th className="py-2.5 px-4 text-right rounded-r-xl">
                          Amount
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-[#577877]/15">
                        <td className="py-4 px-4 font-semibold text-[#162623]">
                          {currentReceiptData.description || "Telehealth Consultation"}
                        </td>
                        <td className="py-4 px-4 text-center font-medium text-[#162623]">
                          1
                        </td>
                        <td className="py-4 px-4 text-right font-semibold text-[#162623]">
                          {currentReceiptData.amount}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Paid With / Payment Method Block */}
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-3 border-t border-[#577877]/15">
                  <div className="text-xs space-y-0.5">
                    <span className="text-[#577877] block text-[11px]">
                      Payment method
                    </span>
                    <p className="font-semibold text-sm text-[#162623]">
                      Razorpay Online Payment
                    </p>
                    <p className="text-[11px] text-[#577877]">
                      Transaction · {currentReceiptData.transactionId}
                    </p>
                  </div>

                  <div className="text-left sm:text-right space-y-1">
                    <span className="text-[11px] text-[#577877] block">
                      {isPaid ? "Total paid" : "Total due"}
                    </span>
                    <p className="text-3xl font-bold text-[#162623] tracking-tight">
                      {currentReceiptData.amount}
                    </p>
                    <div>
                      {isPaid ? (
                        <span className="inline-flex items-center text-[11px] font-semibold px-3 py-1 rounded-full bg-[#E6F4EA] text-[#1E7E34]">
                          Payment successful
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[11px] font-semibold px-3 py-1 rounded-full bg-amber-100 text-amber-900">
                          Payment Pending
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer Note */}
                <div className="pt-4 border-t border-[#577877]/15 text-[11px] text-[#577877] leading-relaxed">
                  {isPaid
                    ? "Thank you for choosing Kaizen Care. This receipt confirms payment and is not a statement of insurance benefits. Keep it for your records."
                    : "This statement reflects an unverified or pending payment item. Complete payment through the patient portal to receive your verified paid receipt."}
                </div>
              </div>

              {/* Right Column (4 cols) */}
              <div className="lg:col-span-4 space-y-4">
                <div className="care-card p-6 sm:p-7 space-y-4 bg-white rounded-2xl border border-[#577877]/15">
                  <h3 className="text-base font-bold text-[#162623]">
                    {isPaid ? "What happens next?" : "Action Required"}
                  </h3>
                  <p className="text-xs text-[#577877] leading-relaxed">
                    {isPaid
                      ? `You're booked with ${currentReceiptData.doctor || "your clinician"}. Visit details and preparation tips are ready in My appointments.`
                      : `Payment of ${currentReceiptData.amount} is pending for your appointment with ${currentReceiptData.doctor || "your clinician"}.`}
                  </p>

                  <div className="space-y-2.5 pt-1">
                    {!isPaid ? (
                      <button
                        type="button"
                        onClick={() => onNavigate && onNavigate("appointments")}
                        className="btn-primary w-full !py-2.5 rounded-xl font-semibold text-xs shadow-2xs cursor-pointer"
                      >
                        Complete Payment in Appointments
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onNavigate && onNavigate("appointments")}
                        className="btn-primary w-full !py-2.5 rounded-xl font-semibold text-xs shadow-2xs cursor-pointer"
                      >
                        View appointments
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setView("billing")}
                      className="btn-secondary w-full !py-2.5 rounded-xl font-semibold text-xs text-[#162623] shadow-2xs cursor-pointer"
                    >
                      Back to payments
                    </button>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-[#E8F3F3] border border-[#577877]/20 flex items-start gap-3">
                  <span className="material-symbols-outlined !text-[#25836F] text-lg shrink-0 mt-0.5">
                    info
                  </span>
                  <div className="text-xs space-y-1">
                    <h4 className="font-bold text-[#162623]">
                      Need a billing correction?
                    </h4>
                    <p className="text-[#577877] leading-relaxed">
                      <span
                        onClick={() => onNavigate && onNavigate("support")}
                        className="text-[#25836F] font-semibold hover:underline cursor-pointer"
                      >
                        Contact billing support
                      </span>{" "}
                      and include record {currentReceiptData.receiptId}. Never send full card details.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Global Footer */}
          <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
            <p>© 2026 Kaizen Care · Your health, thoughtfully connected.</p>
            <div className="flex items-center gap-4">
              <span className="hover:text-[#162623] cursor-pointer">
                Privacy
              </span>
              <span>·</span>
              <span className="hover:text-[#162623] cursor-pointer">Terms</span>
              <span>·</span>
              <span
                className="hover:text-[#162623] cursor-pointer"
                onClick={() => onNavigate && onNavigate("support")}
              >
                Need help?
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // VIEW 2: PAYMENTS & BILLING OVERVIEW
  // ========================================================
  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Toast Notification */}
        {toastMessage && (
          <div className="p-3.5 rounded-xl bg-white border border-[#25836F]/30 shadow-sm flex items-center justify-between text-xs text-[#25836F] font-semibold">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base">
                check_circle
              </span>
              {toastMessage}
            </span>
            <button
              type="button"
              onClick={() => setToastMessage("")}
              className="text-[#577877] hover:text-[#162623]"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Page Heading & Top Action Row */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
              Payments &amp; billing
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#577877]">
              Simple, transparent payments. Your receipts are always here when
              you need them.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {dbTransactions.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const paid = dbTransactions.find((t) => t.isPaid) || dbTransactions[0];
                  setSelectedReceipt(paid);
                  setView("receipt");
                }}
                className="btn-primary !px-4 !py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs cursor-pointer"
              >
                <span className="material-symbols-outlined !text-white text-base">
                  receipt_long
                </span>
                <span>Latest receipt</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleDownloadStatement}
              className="btn-secondary !px-4 !py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined !text-[#25836F] text-base">
                download
              </span>
              <span>Download statement</span>
            </button>
          </div>
        </div>

        {/* 3 Metric Stat Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Card 1: Pending / Outstanding balance */}
          <div className="care-card p-6 space-y-3 bg-white rounded-2xl border border-[#577877]/15">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#577877] font-medium">
                Outstanding balance
              </span>
              <span
                className={`material-symbols-outlined text-lg ${
                  pendingCount > 0 ? "text-amber-600" : "!text-[#25836F]"
                }`}
              >
                {pendingCount > 0 ? "pending" : "check_circle"}
              </span>
            </div>
            <p className="text-3xl font-bold text-[#162623] tracking-tight">
              {pendingAmountFormatted}
            </p>
            <p className="text-xs text-[#577877]">
              {pendingCount > 0
                ? `${pendingCount} pending payment`
                : "You're all up to date"}
            </p>
          </div>

          {/* Card 2: Total Paid */}
          <div className="care-card p-6 space-y-3 bg-white rounded-2xl border border-[#577877]/15">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#577877] font-medium">
                Total paid
              </span>
              <span className="material-symbols-outlined !text-[#25836F] text-lg">
                account_balance_wallet
              </span>
            </div>
            <p className="text-3xl font-bold text-[#162623] tracking-tight">
              {totalPaidFormatted}
            </p>
            <p className="text-xs text-[#577877]">
              {paidCount} paid {paidCount === 1 ? "consultation" : "consultations"}
            </p>
          </div>

          {/* Card 3: Refunds in progress */}
          <div className="care-card p-6 space-y-3 bg-white rounded-2xl border border-[#577877]/15">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#577877] font-medium">
                Refunds in progress
              </span>
              <span className="material-symbols-outlined !text-[#25836F] text-lg">
                sync
              </span>
            </div>
            <p className="text-3xl font-bold text-[#162623] tracking-tight">
              ₹0.00
            </p>
            <p className="text-xs text-[#577877]">No pending refunds</p>
          </div>
        </div>

        {/* Main Card: Transactions Table */}
        <div className="care-card p-6 sm:p-7 space-y-5 bg-white rounded-2xl border border-[#577877]/15">
          <div className="flex items-center gap-8 border-b border-[#577877]/20 pt-1 text-sm font-medium">
            <button
              type="button"
              className="pb-3 font-semibold text-[#25836F] relative cursor-pointer"
            >
              <span>Transactions</span>
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#25836F] rounded-full" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#577877]">
                All transactions ({filteredTransactions.length})
              </span>
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="appearance-none bg-[#F0F5F7] text-[#577877] hover:text-[#162623] font-medium px-3.5 py-1.5 rounded-full text-xs focus:outline-none cursor-pointer pr-7"
                >
                  <option value="All">All statuses</option>
                  <option value="Paid">Paid</option>
                  <option value="Pending">Pending</option>
                  <option value="Refunded">Refunded</option>
                </select>
                <span className="material-symbols-outlined !text-[#577877] text-xs absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  expand_more
                </span>
              </div>
            </div>

            {filteredTransactions.length === 0 ? (
              <div className="py-12 text-center text-[#577877] space-y-2">
                <span className="material-symbols-outlined text-4xl text-[#25836F]">
                  receipt_long
                </span>
                <h3 className="text-base font-bold text-[#162623]">
                  No payment transactions found
                </h3>
                <p className="text-xs max-w-sm mx-auto">
                  Your verified payment history and consultation receipts will appear here.
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-[#F0F5F7]/80 text-[#577877] font-semibold uppercase text-[11px] tracking-wider border-y border-[#577877]/15">
                        <th className="py-3 px-4">Receipt</th>
                        <th className="py-3 px-4">Appointment</th>
                        <th className="py-3 px-4">Doctor</th>
                        <th className="py-3 px-4">Amount</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#577877]/10">
                      {paginatedTransactions.map((item) => (
                        <tr key={item.id} className="hover:bg-[#F8FAFB] transition">
                          <td className="py-3.5 px-4 font-mono font-semibold text-[#162623]">
                            {item.receiptId}
                          </td>
                          <td className="py-3.5 px-4 text-[#577877]">
                            {item.date}
                          </td>
                          <td className="py-3.5 px-4 font-medium text-[#162623]">
                            {item.doctor}
                          </td>
                          <td className="py-3.5 px-4 font-bold text-[#162623]">
                            {item.amount}
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full font-bold text-[10px] uppercase ${
                                item.isPaid
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-900"
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedReceipt(item);
                                setView("receipt");
                              }}
                              className="text-[#25836F] font-bold hover:underline cursor-pointer"
                            >
                              {item.isPaid ? "View receipt" : "View record"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-3 text-xs text-[#577877]">
                    <span>
                      Page {currentPage} of {totalPages}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={currentPage === 1}
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        className="px-3 py-1.5 rounded-lg border border-[#577877]/25 font-semibold hover:bg-[#F0F5F7] disabled:opacity-40 cursor-pointer"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={currentPage === totalPages}
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        className="px-3 py-1.5 rounded-lg border border-[#577877]/25 font-semibold hover:bg-[#F0F5F7] disabled:opacity-40 cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Global Footer */}
        <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
          <p>© 2026 Kaizen Care · Your health, thoughtfully connected.</p>
          <div className="flex items-center gap-4">
            <span className="hover:text-[#162623] cursor-pointer">
              Privacy
            </span>
            <span>·</span>
            <span className="hover:text-[#162623] cursor-pointer">Terms</span>
            <span>·</span>
            <span
              className="hover:text-[#162623] cursor-pointer"
              onClick={() => onNavigate && onNavigate("support")}
            >
              Need help?
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function strVal(v) {
  return typeof v === "string" ? v : v ? String(v) : "";
}
