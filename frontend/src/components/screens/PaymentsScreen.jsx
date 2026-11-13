import { useState, useEffect, useMemo } from "react";
import { paymentApi, patientApi, loadRazorpayScript } from "../../lib/api";

export default function PaymentsScreen({ onNavigate, navParams, patient }) {
  // Default view is "billing" overview. "receipt" or "checkout" are only active when explicitly requested.
  const [userView, setUserView] = useState(null);
  const view = userView ?? (navParams?.view || "billing");
  const setView = (v) => setUserView(v);

  const [dbTransactions, setDbTransactions] = useState([]);
  const [dbAppointments, setDbAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paymentError, setPaymentError] = useState("");
  const [paymentSuccessData, setPaymentSuccessData] = useState(null);
  const [toastMessage, setToastMessage] = useState("");

  // Billing tab states
  const [activeBillingTab, setActiveBillingTab] = useState("transactions");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [statusFilter, setStatusFilter] = useState("All");

  const patientName = patient?.full_name || "Patient";
  const patientEmail = patient?.email || "";
  const billingAddress = patient?.address || "Address on record";

  // Load real transactions and appointments
  useEffect(() => {
    setLoading(true);
    Promise.all([
      paymentApi.list().catch(() => []),
      patientApi.appointments().catch(() => []),
    ])
      .then(([payments, appointments]) => {
        const aptMap = new Map();
        if (Array.isArray(appointments)) {
          setDbAppointments(appointments);
          appointments.forEach((a) => {
            if (a.id) aptMap.set(a.id, a);
          });
        }

        if (Array.isArray(payments) && payments.length > 0) {
          const formatted = payments.map((t) => {
            const apt = aptMap.get(t.appointment_id) || {};
            const docName =
              apt.doctor?.full_name ||
              apt.doctor?.name ||
              (apt.doctor_id ? "Consultation Specialist" : "Telehealth Specialist");
            const specialty = apt.doctor?.specialty || "Telehealth Consultation";
            const dateStr = t.created_at
              ? new Date(t.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : apt.starts_at
                ? new Date(apt.starts_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Recent";
            const rawAmountPaise =
              Number(t.amount_paise) ||
              (apt.amount_paise ? Number(apt.amount_paise) : 0);
            const amountFormatted = rawAmountPaise
              ? `INR ${(rawAmountPaise / 100).toFixed(2)}`
              : "INR 0.00";

            return {
              id: t.id,
              appointmentId: t.appointment_id,
              receiptId:
                t.receipt ||
                `KC-RC-${(t.id || "").replace(/-/g, "").slice(0, 6).toUpperCase()}`,
              date: dateStr,
              doctor: docName,
              specialty: specialty,
              amount: amountFormatted,
              rawAmountPaise,
              status:
                t.status === "success" || t.status === "paid"
                  ? "Paid"
                  : t.status === "refunded"
                    ? "Refunded"
                    : t.status === "pending"
                      ? "Pending"
                      : t.status || "Completed",
              method:
                t.provider === "razorpay"
                  ? "Razorpay Online"
                  : "Online Payment",
              description: apt.type
                ? `${apt.type} consultation`
                : `Telehealth Consultation · ${docName}`,
              transactionId: t.provider_transaction_id || t.id,
            };
          });
          setDbTransactions(formatted);
        } else {
          setDbTransactions([]);
        }
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return dbTransactions.filter((item) => {
      if (statusFilter === "All") return true;
      return item.status.toLowerCase() === statusFilter.toLowerCase();
    });
  }, [dbTransactions, statusFilter]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage) || 1;
  const paginatedTransactions = useMemo(() => {
    return filteredTransactions.slice(
      (currentPage - 1) * itemsPerPage,
      currentPage * itemsPerPage,
    );
  }, [filteredTransactions, currentPage, itemsPerPage]);

  // Derived financial metrics from real data
  const totalPaidPaise = useMemo(() => {
    return dbTransactions
      .filter((t) => t.status === "Paid")
      .reduce((sum, t) => sum + (t.rawAmountPaise || 0), 0);
  }, [dbTransactions]);

  const totalRefundedPaise = useMemo(() => {
    return dbTransactions
      .filter((t) => t.status === "Refunded")
      .reduce((sum, t) => sum + (t.rawAmountPaise || 0), 0);
  }, [dbTransactions]);

  const paidCount = useMemo(() => {
    return dbTransactions.filter((t) => t.status === "Paid").length;
  }, [dbTransactions]);

  const refundedCount = useMemo(() => {
    return dbTransactions.filter((t) => t.status === "Refunded").length;
  }, [dbTransactions]);

  // Pending balance from uncompleted appointments
  const pendingBalancePaise = useMemo(() => {
    return dbAppointments
      .filter((a) => a.payment_status === "pending" || a.status === "pending_payment")
      .reduce((sum, a) => sum + (Number(a.amount_paise) || 0), 0);
  }, [dbAppointments]);

  // Active appointment / receipt data
  const rawApt = navParams?.appointment || null;
  const selectedTx = selectedReceipt || dbTransactions[0] || null;

  const checkoutApt = {
    id: rawApt?.id || selectedTx?.appointmentId || selectedTx?.id || "KC-ONLINE-PAYMENT",
    receiptId:
      paymentSuccessData?.receiptId ||
      rawApt?.receiptId ||
      selectedTx?.receiptId ||
      "KC-RC-DIRECT",
    doctor: {
      name:
        rawApt?.doctor?.name ||
        rawApt?.doctor?.fullName ||
        selectedTx?.doctor ||
        "Telehealth Specialist",
      specialty:
        rawApt?.doctor?.specialty ||
        selectedTx?.specialty ||
        "Teleconsultation",
      initials: (
        rawApt?.doctor?.name ||
        selectedTx?.doctor ||
        "Dr"
      )
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join("")
        .toUpperCase(),
    },
    dateFormatted:
      rawApt?.dateFull ||
      rawApt?.dateFormatted ||
      selectedTx?.date ||
      new Date().toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    dateShort: rawApt?.dateShort || selectedTx?.date || "Recent",
    datePaid:
      paymentSuccessData?.datePaid ||
      selectedTx?.date ||
      new Date().toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    timeFormatted: rawApt?.timeFull || rawApt?.timeFormatted || "Scheduled Slot",
    timeAppointment: rawApt?.timeRange || "Consultation Hour",
    patient: patientName,
    billingAddress: billingAddress,
    visitFormatted: rawApt?.format || "Video Teleconsultation",
    visitType: rawApt?.appointmentType || "Telehealth Consultation",
    description:
      rawApt?.reason ||
      selectedTx?.description ||
      `Video Consultation · ${rawApt?.doctor?.name || selectedTx?.doctor || "Specialist"}`,
    fee:
      paymentSuccessData?.amount ||
      rawApt?.fee ||
      selectedTx?.amount ||
      "INR 0.00",
    cardLast4: rawApt?.cardLast4 || "Online",
    transactionId:
      paymentSuccessData?.transactionId ||
      rawApt?.transactionId ||
      selectedTx?.transactionId ||
      "RZP-TXN-VERIFIED",
    status: selectedTx?.status === "Refunded" ? "Refunded" : "Paid in full",
  };

  const handleDownloadReceiptPdf = () => {
    window.print();
  };

  const handleDownloadStatement = () => {
    if (dbTransactions.length === 0) {
      setToastMessage("No transaction statements to export yet.");
      setTimeout(() => setToastMessage(""), 3500);
      return;
    }

    const csvContent = [
      "Receipt,Date,Doctor,Specialty,Amount,Status,Payment Method",
      ...dbTransactions.map(
        (t) =>
          `"${t.receiptId}","${t.date}","${t.doctor}","${t.specialty}","${t.amount}","${t.status}","${t.method}"`,
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Kaizen-Care-Statement-${new Date().getFullYear()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToastMessage("Financial statement downloaded successfully.");
    setTimeout(() => setToastMessage(""), 3500);
  };

  // ========================================================
  // VIEW 1: PAYMENT RECEIPT VIEW
  // ========================================================
  if (view === "receipt") {
    // If no receipt data exists at all, gently redirect to billing view
    if (!rawApt && !paymentSuccessData && dbTransactions.length === 0) {
      return (
        <div className="space-y-6 font-sans text-[#162623]">
          <div className="rounded-2xl bg-white border border-[#577877]/15 p-12 text-center space-y-3">
            <span className="material-symbols-outlined text-4xl text-[#577877]/60">
              receipt_long
            </span>
            <h2 className="text-lg font-bold text-[#162623]">
              No Receipts Available
            </h2>
            <p className="text-xs text-[#577877] max-w-sm mx-auto">
              You haven't completed any paid teleconsultations yet. Your invoices and receipts will appear here automatically.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setView("billing")}
                className="btn-primary !px-5 !py-2.5 rounded-xl font-semibold text-xs"
              >
                Back to Billing Overview
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6 font-sans text-[#162623]">
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

        {/* Compact Heading Banner matching Portal Brand System */}
        <div className="rounded-2xl bg-gradient-to-r from-[#25836F] via-[#1F6E5E] to-[#185A4D] text-white px-6 py-5 sm:px-8 sm:py-6 shadow-sm border border-[#185A4D]/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase text-[#F0F5F7]/85">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A3E2D4]" />
              Official Clinical Consultation Invoice
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Payment Received
            </h1>
            <p className="text-xs sm:text-sm text-[#F0F5F7]/90 max-w-2xl leading-relaxed">
              Your consultation fee has been verified. A copy of this receipt is preserved in your portal records.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
            <button
              type="button"
              onClick={() => setView("billing")}
              className="px-4 py-2.5 rounded-xl font-semibold text-xs bg-white/10 hover:bg-white/20 text-white border border-white/20 flex items-center gap-2 backdrop-blur-xs transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-base !text-white">
                arrow_back
              </span>
              <span>All Payments</span>
            </button>
            <button
              type="button"
              onClick={handleDownloadReceiptPdf}
              className="px-4 py-2.5 rounded-xl font-semibold text-xs bg-white text-[#185A4D] hover:bg-[#F0F5F7] flex items-center gap-2 shadow-xs transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-base !text-[#185A4D]">
                download
              </span>
              <span>Download PDF</span>
            </button>
          </div>
        </div>

        {/* Main 2-Column Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (8 cols): Formal Printable Receipt Card */}
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
                  Receipt
                </h3>
                <p className="text-xs text-[#577877] font-medium mt-0.5">
                  {checkoutApt.receiptId}
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
                  {checkoutApt.patient}
                </span>
              </div>

              <div>
                <span className="text-[#577877] block text-[11px]">
                  Date paid
                </span>
                <span className="font-bold text-sm text-[#162623] mt-1 block">
                  {checkoutApt.datePaid}
                </span>
              </div>

              <div>
                <span className="text-[#577877] block text-[11px]">
                  Status
                </span>
                <span className="font-bold text-sm text-[#162623] mt-1 block">
                  {checkoutApt.status}
                </span>
              </div>
            </div>

            {/* Billing Address Row */}
            <div className="text-xs">
              <span className="text-[#577877] block text-[11px]">
                Billing contact &amp; address
              </span>
              <span className="font-bold text-sm text-[#162623] mt-1 block">
                {checkoutApt.billingAddress}
              </span>
              {patientEmail && (
                <span className="text-xs text-[#577877] mt-0.5 block">
                  {patientEmail}
                </span>
              )}
            </div>

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
                      {checkoutApt.description}
                    </td>
                    <td className="py-4 px-4 text-center font-medium text-[#162623]">
                      1
                    </td>
                    <td className="py-4 px-4 text-right font-semibold text-[#162623]">
                      {checkoutApt.fee}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Appointment Reference Row */}
            <div className="text-xs space-y-1">
              <span className="text-[#577877] block text-[11px]">
                Appointment Details
              </span>
              <p className="font-bold text-[#162623]">
                {checkoutApt.dateShort} · {checkoutApt.timeAppointment} · Ref: {checkoutApt.id}
              </p>
            </div>

            {/* Paid With & Total Paid Block */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-3 border-t border-[#577877]/15">
              <div className="text-xs space-y-0.5">
                <span className="text-[#577877] block text-[11px]">
                  Payment Method
                </span>
                <p className="font-semibold text-sm text-[#162623]">
                  Razorpay Secure Gateway
                </p>
                <p className="text-[11px] text-[#577877]">
                  Transaction Ref · {checkoutApt.transactionId}
                </p>
              </div>

              <div className="text-left sm:text-right space-y-1">
                <span className="text-[11px] text-[#577877] block">
                  Total Paid · INR
                </span>
                <p className="text-3xl font-bold text-[#162623] tracking-tight">
                  {checkoutApt.fee}
                </p>
                <div>
                  <span className="inline-flex items-center text-[11px] font-semibold px-3 py-1 rounded-full bg-[#E6F4EA] text-[#1E7E34]">
                    Payment verified
                  </span>
                </div>
              </div>
            </div>

            {/* Footer Note */}
            <div className="pt-4 border-t border-[#577877]/15 text-[11px] text-[#577877] leading-relaxed">
              Thank you for choosing Kaizen Care. This receipt confirms verified clinical payment. Keep it for your medical records and insurance claims.
            </div>
          </div>

          {/* Right Column (4 cols): What happens next & Billing Support */}
          <div className="lg:col-span-4 space-y-4">
            {/* Card 1: What happens next? */}
            <div className="care-card p-6 sm:p-7 space-y-4">
              <h3 className="text-base font-bold text-[#162623]">
                What happens next?
              </h3>
              <p className="text-xs text-[#577877] leading-relaxed">
                Your consultation with {checkoutApt.doctor.name} is on schedule. Review your appointment instructions and access the waiting room from Appointments.
              </p>

              <div className="space-y-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => onNavigate("appointments")}
                  className="btn-primary w-full !py-2.5 rounded-xl font-semibold text-xs shadow-2xs"
                >
                  View in My Appointments
                </button>

                <button
                  type="button"
                  onClick={() => setView("billing")}
                  className="btn-secondary w-full !py-2.5 rounded-xl font-semibold text-xs text-[#162623] shadow-2xs"
                >
                  Back to Payments
                </button>
              </div>
            </div>

            {/* Card 2: Need a billing correction? */}
            <div className="p-5 rounded-2xl bg-white border border-[#577877]/15 flex items-start gap-3 shadow-xs">
              <span className="material-symbols-outlined !text-[#25836F] text-xl shrink-0 mt-0.5">
                info
              </span>
              <div className="text-xs space-y-1">
                <h4 className="font-bold text-[#162623]">
                  Need a billing correction?
                </h4>
                <p className="text-[#577877] leading-relaxed">
                  <span
                    className="text-[#25836F] font-semibold hover:underline cursor-pointer"
                    onClick={() => onNavigate("support")}
                  >
                    Contact billing support
                  </span>{" "}
                  with receipt {checkoutApt.receiptId} for refunds or fee adjustments.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // VIEW 2: PAYMENTS & BILLING OVERVIEW (Default View)
  // ========================================================
  return (
    <div className="space-y-6 font-sans text-[#162623]">
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

      {/* Compact Heading Banner matching Portal Brand System */}
      <div className="rounded-2xl bg-gradient-to-r from-[#25836F] via-[#1F6E5E] to-[#185A4D] text-white px-6 py-5 sm:px-8 sm:py-6 shadow-sm border border-[#185A4D]/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase text-[#F0F5F7]/85">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A3E2D4]" />
            Secure Billing &amp; Transaction History
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Payments &amp; Billing
          </h1>
          <p className="text-xs sm:text-sm text-[#F0F5F7]/90 max-w-2xl leading-relaxed">
            Transparent consultation fees, downloadable invoices, and verified digital receipts.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
          {dbTransactions.length > 0 && (
            <button
              type="button"
              onClick={() => setView("receipt")}
              className="px-4 py-2.5 rounded-xl font-semibold text-xs bg-white text-[#185A4D] hover:bg-[#F0F5F7] flex items-center gap-2 shadow-xs transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-base !text-[#185A4D]">
                receipt_long
              </span>
              <span>Latest Receipt</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDownloadStatement}
            className="px-4 py-2.5 rounded-xl font-semibold text-xs bg-white/10 hover:bg-white/20 text-white border border-white/20 flex items-center gap-2 backdrop-blur-xs transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-base !text-white">
              download
            </span>
            <span>Download Statement</span>
          </button>
        </div>
      </div>

      {/* 3 Metric Stat Cards dynamically derived from backend records */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        {/* Card 1: Outstanding balance */}
        <div className="care-card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#577877] font-medium">
              Outstanding Balance
            </span>
            <span className="material-symbols-outlined !text-[#25836F] text-lg">
              check_circle
            </span>
          </div>
          <p className="text-3xl font-bold text-[#162623] tracking-tight">
            {pendingBalancePaise > 0
              ? `INR ${(pendingBalancePaise / 100).toFixed(2)}`
              : "INR 0.00"}
          </p>
          <p className="text-xs text-[#577877]">
            {pendingBalancePaise > 0
              ? "Payment pending for upcoming visit"
              : "You're all up to date"}
          </p>
        </div>

        {/* Card 2: Paid this year */}
        <div className="care-card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#577877] font-medium">
              Paid to Date
            </span>
            <span className="material-symbols-outlined !text-[#25836F] text-lg">
              account_balance_wallet
            </span>
          </div>
          <p className="text-3xl font-bold text-[#162623] tracking-tight">
            {totalPaidPaise > 0
              ? `INR ${(totalPaidPaise / 100).toFixed(2)}`
              : "INR 0.00"}
          </p>
          <p className="text-xs text-[#577877]">
            {paidCount} consultation{paidCount !== 1 ? "s" : ""} completed
          </p>
        </div>

        {/* Card 3: Refunds in progress */}
        <div className="care-card p-6 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#577877] font-medium">
              Refunds Processed
            </span>
            <span className="material-symbols-outlined !text-[#25836F] text-lg">
              sync
            </span>
          </div>
          <p className="text-3xl font-bold text-[#162623] tracking-tight">
            {totalRefundedPaise > 0
              ? `INR ${(totalRefundedPaise / 100).toFixed(2)}`
              : "INR 0.00"}
          </p>
          <p className="text-xs text-[#577877]">
            {refundedCount > 0
              ? `${refundedCount} refund${refundedCount !== 1 ? "s" : ""} recorded`
              : "No pending refunds"}
          </p>
        </div>
      </div>

      {/* Main Card: Tabs + Content */}
      <div className="care-card p-6 sm:p-7 space-y-5">
        {/* Tabs: Transactions | Payment methods | Billing details */}
        <div className="flex items-center gap-8 border-b border-[#577877]/20 pt-1 text-sm font-medium">
          {[
            { id: "transactions", label: "Transactions" },
            { id: "methods", label: "Payment Methods" },
            { id: "details", label: "Billing Profile" },
          ].map((tab) => {
            const isActive = activeBillingTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveBillingTab(tab.id)}
                className={`pb-3 font-semibold transition-all relative cursor-pointer ${
                  isActive
                    ? "text-[#25836F]"
                    : "text-[#577877] hover:text-[#162623]"
                }`}
              >
                <span>{tab.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#25836F] rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 1: Transactions Table */}
        {activeBillingTab === "transactions" && (
          <div className="space-y-4">
            {/* Subheader: Filter row */}
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#577877]">
                {loading
                  ? "Loading records…"
                  : `Showing ${filteredTransactions.length} transaction${filteredTransactions.length !== 1 ? "s" : ""}`}
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
                  <option value="Refunded">Refunded</option>
                  <option value="Pending">Pending</option>
                </select>
                <span className="material-symbols-outlined !text-[#577877] text-xs absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                  expand_more
                </span>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#F0F5F7]/80 text-[#577877] font-semibold uppercase text-[11px] tracking-wider border-y border-[#577877]/15">
                    <th className="py-3 px-4">Receipt</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Provider</th>
                    <th className="py-3 px-4">Amount</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#577877]/15">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[#577877]">
                        <div className="flex flex-col items-center justify-center space-y-2">
                          <span className="material-symbols-outlined text-4xl text-[#577877]/60">
                            receipt_long
                          </span>
                          <p className="font-semibold text-sm text-[#162623]">
                            No payment transactions found
                          </p>
                          <p className="text-xs max-w-sm text-[#577877]">
                            Invoices, consultation receipts, and payment statements will be recorded here automatically once an appointment is scheduled.
                          </p>
                          <div className="pt-2">
                            <button
                              type="button"
                              onClick={() => onNavigate("find-doctors")}
                              className="btn-primary !px-4 !py-2 text-xs font-semibold rounded-xl"
                            >
                              Book a Consultation
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedTransactions.map((item) => (
                      <tr
                        key={item.receiptId || item.id}
                        className="hover:bg-[#F0F5F7]/40 transition"
                      >
                        <td className="py-4 px-4 font-medium text-[#162623]">
                          {item.receiptId}
                        </td>
                        <td className="py-4 px-4 text-[#577877]">
                          {item.date}
                        </td>
                        <td className="py-4 px-4 font-medium text-[#162623]">
                          {item.doctor}
                        </td>
                        <td className="py-4 px-4 font-semibold text-[#162623]">
                          {item.amount}
                        </td>
                        <td className="py-4 px-4">
                          <span
                            className={`font-semibold text-[11px] px-2.5 py-0.5 rounded-full ${
                              item.status === "Paid"
                                ? "bg-emerald-50 text-[#1E7E34]"
                                : item.status === "Refunded"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-blue-50 text-[#25836F]"
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedReceipt(item);
                            }}
                            className="font-medium text-[#162623] hover:text-[#25836F] inline-flex items-center gap-1 cursor-pointer transition"
                          >
                            <span>View receipt</span>
                            <span className="material-symbols-outlined text-xs">
                              open_in_new
                            </span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Row */}
            {filteredTransactions.length > itemsPerPage && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-[#577877]/15 text-xs text-[#577877]">
                <span>
                  Showing {(currentPage - 1) * itemsPerPage + 1}–
                  {Math.min(
                    currentPage * itemsPerPage,
                    filteredTransactions.length,
                  )}{" "}
                  of {filteredTransactions.length} transactions
                </span>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className={`px-3.5 py-1.5 rounded-xl border border-[#577877]/25 font-semibold text-xs transition ${
                      currentPage === 1
                        ? "bg-[#F0F5F7] text-[#577877]/50 cursor-not-allowed"
                        : "bg-white text-[#162623] hover:bg-[#F0F5F7]"
                    }`}
                  >
                    Previous
                  </button>

                  <button
                    type="button"
                    disabled={currentPage === totalPages}
                    onClick={() =>
                      setCurrentPage((p) => Math.min(totalPages, p + 1))
                    }
                    className={`px-3.5 py-1.5 rounded-xl border border-[#577877]/25 font-semibold text-xs transition ${
                      currentPage === totalPages
                        ? "bg-[#F0F5F7] text-[#577877]/50 cursor-not-allowed"
                        : "bg-white text-[#162623] hover:bg-[#F0F5F7]"
                    }`}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Payment Methods & Gateway */}
        {activeBillingTab === "methods" && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#162623]">
                  Payment Gateway Integration
                </h3>
                <p className="text-xs text-[#577877] mt-0.5">
                  Telehealth consultations and slot reservations are securely processed via Razorpay.
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                Razorpay Active
              </span>
            </div>

            <div className="p-5 rounded-2xl border border-[#577877]/20 bg-[#F0F5F7]/30 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-[#25836F] text-white flex items-center justify-center shrink-0 shadow-xs">
                <span className="material-symbols-outlined text-2xl">
                  security
                </span>
              </div>
              <div className="space-y-1 text-xs">
                <p className="font-bold text-[#162623]">
                  Zero Card Data Stored On-Device
                </p>
                <p className="text-[#577877] leading-relaxed">
                  UPI, Debit/Credit Cards, and NetBanking payments are directly tokenized through Razorpay with end-to-end 256-bit encryption. Payment details are not permanently cached on our servers.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Billing Profile */}
        {activeBillingTab === "details" && (
          <div className="space-y-4 pt-2 text-xs">
            <h3 className="text-sm font-bold text-[#162623]">
              Patient Billing Information
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[#F0F5F7] space-y-1">
                <span className="text-[#577877] block text-[11px]">
                  Account Name
                </span>
                <p className="font-semibold text-[#162623]">{patientName}</p>
              </div>
              <div className="p-4 rounded-xl bg-[#F0F5F7] space-y-1">
                <span className="text-[#577877] block text-[11px]">
                  Registered Billing Email
                </span>
                <p className="font-semibold text-[#162623]">{patientEmail || "Not provided"}</p>
              </div>
              <div className="p-4 rounded-xl bg-[#F0F5F7] space-y-1">
                <span className="text-[#577877] block text-[11px]">
                  Billing Address
                </span>
                <p className="font-semibold text-[#162623]">{billingAddress}</p>
              </div>
              <div className="p-4 rounded-xl bg-[#F0F5F7] space-y-1">
                <span className="text-[#577877] block text-[11px]">
                  Currency
                </span>
                <p className="font-semibold text-[#162623]">INR (₹) · Indian Rupee</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Selected Receipt Detail Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined !text-[#25836F] text-xl">
                  receipt_long
                </span>
                <h3 className="text-base font-bold text-[#162623]">
                  Receipt {selectedReceipt.receiptId}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#F0F5F7] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#577877]">Receipt ID:</span>
                <span className="font-semibold text-[#162623]">
                  {selectedReceipt.receiptId}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Date of Service:</span>
                <span className="font-semibold text-[#162623]">
                  {selectedReceipt.date}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Provider:</span>
                <span className="font-semibold text-[#162623]">
                  {selectedReceipt.doctor}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Service:</span>
                <span className="font-semibold text-[#162623]">
                  {selectedReceipt.description}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Payment Method:</span>
                <span className="font-semibold text-[#162623]">
                  {selectedReceipt.method}
                </span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#577877]/15">
                <span className="font-bold text-[#162623]">Amount Paid:</span>
                <span className="font-bold text-base text-[#25836F]">
                  {selectedReceipt.amount}
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="btn-secondary !py-2 !px-4 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
