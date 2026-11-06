import { useState, useEffect } from "react";
import { paymentApi, loadRazorpayScript } from "../../lib/api";

// eslint-disable-next-line no-unused-vars
const defaultTransactionsList = [
  {
    receiptId: "KC-RC-1064",
    date: "Nov 12, 2026",
    doctor: "Dr. Sarah Chen",
    specialty: "Internal medicine",
    amount: "$85.00",
    status: "Paid",
    method: "Visa •••• 4242",
    description: "Video follow-up · Dr. Sarah Chen",
  },
  {
    receiptId: "KC-RC-1072",
    date: "Nov 17, 2026",
    doctor: "Dr. Avery Wilson",
    specialty: "Dermatology",
    amount: "$65.00",
    status: "Refunded",
    method: "Visa •••• 4242",
    description: "Video Dermatology Consultation (30 mins)",
  },
  {
    receiptId: "KC-RC-1038",
    date: "Oct 29, 2026",
    doctor: "Dr. Sarah Chen",
    specialty: "Internal medicine",
    amount: "$85.00",
    status: "Paid",
    method: "Visa •••• 4242",
    description: "Hypertension Management Video Visit",
  },
  {
    receiptId: "KC-RC-1011",
    date: "Sep 24, 2026",
    doctor: "Dr. Sarah Chen",
    specialty: "Internal medicine",
    amount: "$85.00",
    status: "Paid",
    method: "Visa •••• 4242",
    description: "Prescription & Lab Review Visit",
  },
];

const defaultCheckoutApt = {
  id: "00000000-0000-0000-0000-000000001064",
  receiptId: "KC-RC-1064",
  doctor: {
    name: "Dr. Sarah Chen",
    fullName: "Dr. Sarah Chen, MD",
    initials: "SC",
    specialty: "Internal medicine",
    experienceShort: "12 years of experience",
    feeDisplay: "$85",
  },
  dateFormatted: "Thursday, November 12, 2026",
  dateShort: "Nov 12, 2026",
  datePaid: "November 4, 2026",
  timeFormatted: "2:30–3:00 PM · Pacific Time",
  timeRange: "2:30 PM PT",
  timeAppointment: "2:30–3:00 PM PT",
  patient: "Emma Mitchell",
  billingAddress: "2148 Pine Street, Apt 3 · San Francisco, CA 94115",
  visitFormatted: "Video · Follow-up consultation",
  visitType: "Video · Follow-up · 30 minutes",
  description: "Video follow-up · Dr. Sarah Chen",
  fee: "$85.00",
  feeNum: 85,
  cardLast4: "4242",
  transactionId: "TXN-861042",
  status: "Paid in full",
};

export default function PaymentsScreen({ onNavigate, navParams }) {
  // 'receipt' (Matches Screenshot 10) | 'checkout' (Matches Screenshot 9) | 'billing' (Matches Screenshot 8)
  const [userView, setUserView] = useState(null);
  const view = userView ?? (navParams?.view || "receipt");
  const setView = (v) => setUserView(v);

  const [dbTransactions, setDbTransactions] = useState([]);
  const [paymentError, setPaymentError] = useState("");
  const [paymentSuccessData, setPaymentSuccessData] = useState(null);

  useEffect(() => {
    paymentApi
      .list()
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          const formatted = items.map((t) => ({
            id: t.id,
            receiptId: `KC-RC-${t.id.slice(0, 4).toUpperCase()}`,
            date: t.created_at
              ? new Date(t.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Nov 12, 2026",
            doctor: "Dr. Sarah Chen",
            specialty: "Internal medicine",
            amount: `$${(t.amount_paise / 100).toFixed(2)}`,
            status:
              t.status === "success"
                ? "Paid"
                : t.status === "refunded"
                  ? "Refunded"
                  : t.status,
            method: "Visa •••• 4242",
            description: "Telehealth video consultation",
          }));
          setDbTransactions(formatted);
        }
      })
      .catch(() => {});
  }, []);

  const activeTransactions = dbTransactions;

  // Active appointment for checkout/receipt flow
  const rawApt = navParams?.appointment || defaultCheckoutApt;
  const checkoutApt = {
    id: rawApt.id || defaultCheckoutApt.id,
    receiptId:
      paymentSuccessData?.receiptId ||
      rawApt.receiptId ||
      defaultCheckoutApt.receiptId,
    doctor: rawApt.doctor || defaultCheckoutApt.doctor,
    dateFormatted: rawApt.dateFormatted || defaultCheckoutApt.dateFormatted,
    dateShort: rawApt.dateShort || defaultCheckoutApt.dateShort,
    datePaid:
      paymentSuccessData?.datePaid ||
      rawApt.datePaid ||
      defaultCheckoutApt.datePaid,
    timeFormatted: rawApt.timeFormatted || defaultCheckoutApt.timeFormatted,
    timeRange: rawApt.timeRange || defaultCheckoutApt.timeRange,
    timeAppointment:
      rawApt.timeAppointment || defaultCheckoutApt.timeAppointment,
    patient: rawApt.patient || defaultCheckoutApt.patient,
    billingAddress: rawApt.billingAddress || defaultCheckoutApt.billingAddress,
    visitFormatted: rawApt.visitFormatted || defaultCheckoutApt.visitFormatted,
    visitType: rawApt.visitType || defaultCheckoutApt.visitType,
    description: rawApt.description || defaultCheckoutApt.description,
    fee: paymentSuccessData?.amount || rawApt.fee || defaultCheckoutApt.fee,
    cardLast4: rawApt.cardLast4 || defaultCheckoutApt.cardLast4,
    transactionId:
      paymentSuccessData?.transactionId ||
      rawApt.transactionId ||
      defaultCheckoutApt.transactionId,
    status: rawApt.status || defaultCheckoutApt.status,
  };

  // Checkout form states
  const [useDifferentCard, setUseDifferentCard] = useState(false);
  const [securityCode, setSecurityCode] = useState("424");
  const [billingZip, setBillingZip] = useState("94115");
  const [receiptEmail, setReceiptEmail] = useState("emma.mitchell@example.com");
  const [saveForFuture, setSaveForFuture] = useState(true);
  const [agreeCancellation, setAgreeCancellation] = useState(true);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // Billing tab states
  const [activeBillingTab, setActiveBillingTab] = useState("transactions");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [showManageCard, setShowManageCard] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");

  const filteredTransactions = activeTransactions.filter((item) => {
    if (statusFilter === "All") return true;
    return item.status.toLowerCase() === statusFilter.toLowerCase();
  });

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage,
  );

  const handleProcessPayment = async () => {
    setIsProcessingPayment(true);
    setPaymentError("");
    try {
      const initiated = await paymentApi.initiate(checkoutApt.id);
      const isScriptLoaded = await loadRazorpayScript();

      if (
        isScriptLoaded &&
        window.Razorpay &&
        initiated.razorpay_key_id &&
        !initiated.razorpay_key_id.includes("placeholder")
      ) {
        const rzp = new window.Razorpay({
          key: initiated.razorpay_key_id,
          amount: initiated.amount_paise,
          currency: initiated.currency || "INR",
          name: "Kaizentrix Care",
          description: checkoutApt.visitType || "Doctor Consultation",
          order_id: initiated.order_id,
          prefill: {
            name: checkoutApt.patient || "Emma Mitchell",
            email: receiptEmail || "emma.mitchell@example.com",
            contact: "+14155550142",
          },
          theme: { color: "#295255" },
          handler: async (resp) => {
            try {
              await paymentApi.verify(
                initiated.id,
                resp.razorpay_payment_id,
                resp.razorpay_order_id,
                resp.razorpay_signature,
              );
              setPaymentSuccessData({
                receiptId: `KC-RC-${initiated.id.slice(0, 4).toUpperCase()}`,
                transactionId: resp.razorpay_payment_id,
                amount: `$${(initiated.amount_paise / 100).toFixed(2)}`,
                datePaid: new Date().toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                }),
              });
              setView("receipt");
            } catch (vErr) {
              setPaymentError(vErr.message || "Payment verification failed");
            } finally {
              setIsProcessingPayment(false);
            }
          },
          modal: {
            ondismiss: () => {
              setIsProcessingPayment(false);
            },
          },
        });
        rzp.open();
      } else {
        throw new Error(
          "Razorpay checkout is unavailable. Configure Razorpay test credentials first.",
        );
      }
    } catch (err) {
      setPaymentError(err.message || "Payment processing failed");
      setIsProcessingPayment(false);
    }
  };

  const handleDownloadReceiptPdf = () => {
    window.print();
  };

  const handleDownloadStatement = () => {
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
    link.setAttribute("download", "Kaizentrix-Annual-Statement-2026.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToastMessage(
      "Annual Financial Statement (2026) downloaded successfully.",
    );
    setTimeout(() => setToastMessage(""), 4000);
  };

  // ========================================================
  // VIEW 1: PAYMENT RECEIPT VIEW (Matches User Screenshot 10)
  // ========================================================
  if (view === "receipt") {
    return (
      <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="p-3.5 rounded-xl bg-white border border-[#295255]/30 shadow-sm flex items-center justify-between text-xs text-[#295255] font-semibold">
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

          {/* Header Row: Title & Download PDF Button matching Screenshot */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
                Payment received
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-[#577877]">
                Your appointment is paid and confirmed. A copy of this receipt
                is in your inbox.
              </p>
            </div>

            <button
              type="button"
              onClick={handleDownloadReceiptPdf}
              className="btn-primary !px-5 !py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs shrink-0"
            >
              <span className="material-symbols-outlined !text-white text-base">
                download
              </span>
              <span>Download PDF</span>
            </button>
          </div>

          {/* Main 2-Column Content Area */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column (8 cols): Formal Printable Receipt Card */}
            <div className="lg:col-span-8 care-card p-6 sm:p-9 space-y-7 border border-[#577877]/15 shadow-sm bg-white rounded-2xl">
              {/* Receipt Header: Brand + Receipt ID */}
              <div className="flex items-center justify-between pb-2 border-b border-[#577877]/15">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#295255] flex items-center justify-center text-white shadow-2xs shrink-0">
                    <span className="material-symbols-outlined text-2xl">
                      vital_signs
                    </span>
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-[#162623] tracking-tight">
                      Kaizentrix Care
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
                  Billing address
                </span>
                <span className="font-bold text-sm text-[#162623] mt-1 block">
                  {checkoutApt.billingAddress}
                </span>
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
                  Appointment
                </span>
                <p className="font-bold text-[#162623]">
                  {checkoutApt.dateShort} · {checkoutApt.timeAppointment} ·{" "}
                  {checkoutApt.id}
                </p>
              </div>

              {/* Paid With & Total Paid Block */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pt-3 border-t border-[#577877]/15">
                <div className="text-xs space-y-0.5">
                  <span className="text-[#577877] block text-[11px]">
                    Paid with
                  </span>
                  <p className="font-semibold text-sm text-[#162623]">
                    Visa ending {checkoutApt.cardLast4}
                  </p>
                  <p className="text-[11px] text-[#577877]">
                    Transaction · {checkoutApt.transactionId}
                  </p>
                </div>

                <div className="text-left sm:text-right space-y-1">
                  <span className="text-[11px] text-[#577877] block">
                    Total paid · USD
                  </span>
                  <p className="text-3xl font-bold text-[#162623] tracking-tight">
                    {checkoutApt.fee}
                  </p>
                  <div>
                    <span className="inline-flex items-center text-[11px] font-semibold px-3 py-1 rounded-full bg-[#E6F4EA] text-[#1E7E34]">
                      Payment successful
                    </span>
                  </div>
                </div>
              </div>

              {/* Footer Note */}
              <div className="pt-4 border-t border-[#577877]/15 text-[11px] text-[#577877] leading-relaxed">
                Thank you for choosing Kaizentrix Care. This receipt confirms
                payment and is not a statement of insurance benefits. Keep it
                for your records.
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
                  You're booked with {checkoutApt.doctor.name}. Visit details
                  and preparation tips are ready in My appointments.
                </p>

                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate("appointments", {
                        view: "confirmation",
                        appointment: {
                          id: checkoutApt.id,
                          doctor: checkoutApt.doctor,
                          dateFormatted: checkoutApt.dateFormatted,
                          timeFormatted: checkoutApt.timeFormatted,
                          patient: checkoutApt.patient,
                          visitFormatted: checkoutApt.visitFormatted,
                          fee: checkoutApt.fee,
                          cardLast4: checkoutApt.cardLast4,
                        },
                      })
                    }
                    className="btn-primary w-full !py-2.5 rounded-xl font-semibold text-xs shadow-2xs"
                  >
                    View appointment
                  </button>

                  <button
                    type="button"
                    onClick={() => setView("billing")}
                    className="btn-secondary w-full !py-2.5 rounded-xl font-semibold text-xs text-[#162623] shadow-2xs"
                  >
                    Back to payments
                  </button>
                </div>
              </div>

              {/* Card 2: Need a billing correction? */}
              <div className="p-5 rounded-2xl bg-[#E8F3F3] border border-[#577877]/20 flex items-start gap-3">
                <span className="material-symbols-outlined !text-[#295255] text-lg shrink-0 mt-0.5">
                  info
                </span>
                <div className="text-xs space-y-1">
                  <h4 className="font-bold text-[#162623]">
                    Need a billing correction?
                  </h4>
                  <p className="text-[#577877] leading-relaxed">
                    <span
                      onClick={() => onNavigate("support")}
                      className="text-[#295255] font-semibold hover:underline cursor-pointer"
                    >
                      Contact billing support
                    </span>{" "}
                    and include receipt {checkoutApt.receiptId}. Never send full
                    card details.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Global Footer */}
          <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
            <p>© 2026 Kaizentrix Care · Your health, thoughtfully connected.</p>
            <div className="flex items-center gap-4">
              <span className="hover:text-[#162623] cursor-pointer">
                Privacy
              </span>
              <span>·</span>
              <span className="hover:text-[#162623] cursor-pointer">Terms</span>
              <span>·</span>
              <span
                className="hover:text-[#162623] cursor-pointer"
                onClick={() => onNavigate("support")}
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
  // VIEW 2: PAYMENT CHECKOUT VIEW (Matches Screenshot 9)
  // ========================================================
  if (view === "checkout") {
    return (
      <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Top affordance row */}
          <div className="flex items-center justify-between pb-1">
            <button
              type="button"
              onClick={() => onNavigate("find-doctors")}
              className="btn-secondary !px-3.5 !py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-2xs"
            >
              <span className="material-symbols-outlined !text-[#295255] text-sm">
                arrow_back
              </span>
              <span>Back to appointment booking</span>
            </button>

            <button
              type="button"
              onClick={() => setView("billing")}
              className="text-xs font-semibold text-[#295255] hover:underline"
            >
              View past statements &amp; billing history →
            </button>
          </div>

          {/* Heading & Subtitle matching Screenshot */}
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
              Review &amp; pay
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#577877]">
              One final step. Confirm your payment to reserve your appointment.
            </p>
          </div>

          {/* Two-Column Grid matching Screenshot */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column (8 cols): Payment method + Billing contact + Policy */}
            <div className="lg:col-span-8 space-y-5">
              {/* Card 1: Payment method matching Screenshot */}
              <div className="care-card p-6 sm:p-7 space-y-4">
                <h2 className="text-base font-bold text-[#162623]">
                  Payment method
                </h2>

                {/* Selected Default Card Container */}
                <div className="rounded-2xl border-2 border-[#2563EB] bg-[#F4F8FD] p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3.5">
                    {/* Selected Radio Indicator */}
                    <div className="w-4 h-4 rounded-full border-2 border-[#2563EB] flex items-center justify-center shrink-0">
                      <div className="w-2 h-2 rounded-full bg-[#2563EB]" />
                    </div>

                    <span className="px-2 py-0.5 rounded bg-white font-bold text-xs text-[#2563EB] border border-[#2563EB]/20 tracking-wider">
                      VISA
                    </span>

                    <div>
                      <p className="text-xs font-semibold text-[#162623]">
                        Visa ending in 4242
                      </p>
                      <p className="text-[11px] text-[#577877]">
                        Emma Mitchell · Expires 08/2028
                      </p>
                    </div>
                  </div>

                  <span className="text-xs font-semibold text-[#2563EB]">
                    Default
                  </span>
                </div>

                {/* Use a different card toggle */}
                <label className="flex items-center gap-2.5 pt-1 text-xs text-[#162623] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={useDifferentCard}
                    onChange={(e) => setUseDifferentCard(e.target.checked)}
                    className="w-4 h-4 rounded border-[#577877]/40 text-[#295255] focus:ring-[#295255] accent-[#295255]"
                  />
                  <span>Use a different card</span>
                </label>

                {/* Security Code & Billing ZIP Code Inputs matching Screenshot */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                      Security code
                    </label>
                    <div className="relative">
                      <span className="material-symbols-outlined !text-[#577877] text-base absolute left-3 top-1/2 -translate-y-1/2">
                        lock
                      </span>
                      <input
                        type="password"
                        maxLength={4}
                        value={securityCode}
                        onChange={(e) => setSecurityCode(e.target.value)}
                        placeholder="•••"
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] tracking-widest focus:outline-none focus:border-[#2563EB]"
                      />
                    </div>
                    <span className="text-[11px] text-[#577877] block mt-1">
                      3 digits on the back of your card
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                      Billing ZIP code
                    </label>
                    <input
                      type="text"
                      value={billingZip}
                      onChange={(e) => setBillingZip(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Billing contact matching Screenshot */}
              <div className="care-card p-6 sm:p-7 space-y-4">
                <h2 className="text-base font-bold text-[#162623]">
                  Billing contact
                </h2>

                <div>
                  <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                    Receipt email
                  </label>
                  <div className="relative">
                    <span className="material-symbols-outlined !text-[#577877] text-base absolute left-3 top-1/2 -translate-y-1/2">
                      mail
                    </span>
                    <input
                      type="email"
                      value={receiptEmail}
                      onChange={(e) => setReceiptEmail(e.target.value)}
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#2563EB]"
                    />
                  </div>
                </div>

                <label className="flex items-center gap-2.5 pt-1 text-xs text-[#162623] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveForFuture}
                    onChange={(e) => setSaveForFuture(e.target.checked)}
                    className="w-4 h-4 rounded border-[#577877]/40 text-[#295255] focus:ring-[#295255] accent-[#295255]"
                  />
                  <span className="font-semibold">
                    Save this payment method for future appointments
                  </span>
                </label>

                <p className="text-[11px] text-[#577877] pt-1 leading-relaxed">
                  Your card details are handled by our payment provider. We do
                  not display your full card number.
                </p>
              </div>

              {/* Card 3: No surprise charges callout matching Screenshot */}
              <div className="p-5 rounded-2xl bg-[#E8F3F3] border border-[#577877]/20 flex items-start gap-3">
                <span className="material-symbols-outlined !text-[#295255] text-xl shrink-0 mt-0.5">
                  credit_card
                </span>
                <div className="text-xs space-y-1">
                  <h3 className="font-bold text-[#162623]">
                    No surprise charges
                  </h3>
                  <p className="text-[#577877] leading-relaxed">
                    You'll only be charged the amount shown. This payment is for
                    the consultation, not prescriptions or tests.
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column (4 cols): Appointment summary Card */}
            <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-24">
              {/* Card 4: Appointment summary matching Screenshot */}
              <div className="care-card p-6 sm:p-7 space-y-4">
                <h3 className="text-base font-bold text-[#162623]">
                  Appointment summary
                </h3>

                {/* Doctor Row */}
                <div className="flex items-center gap-3.5">
                  <div className="w-11 h-11 rounded-full bg-[#E0F0EC] text-[#295255] font-bold text-sm flex items-center justify-center shrink-0">
                    {checkoutApt.doctor.initials || "SC"}
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-[#162623]">
                      {checkoutApt.doctor.name}
                    </h4>
                    <p className="text-xs font-semibold text-[#295255]">
                      {checkoutApt.doctor.specialty}
                    </p>
                    <p className="text-[11px] text-[#577877]">
                      {checkoutApt.doctor.experienceShort ||
                        "12 years of experience"}
                    </p>
                  </div>
                </div>

                <div className="border-t border-[#577877]/15 my-3" />

                {/* Metadata List */}
                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-[#577877] block text-[11px]">
                      Patient
                    </span>
                    <span className="font-semibold text-xs text-[#162623]">
                      {checkoutApt.patient}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#577877] block text-[11px]">
                      When
                    </span>
                    <span className="font-semibold text-xs text-[#162623]">
                      {checkoutApt.dateShort} · {checkoutApt.timeRange}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#577877] block text-[11px]">
                      Visit type
                    </span>
                    <span className="font-semibold text-xs text-[#162623]">
                      {checkoutApt.visitType}
                    </span>
                  </div>
                </div>

                <div className="border-t border-[#577877]/15 my-3" />

                {/* Line Item Fees */}
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-[#577877]">Consultation fee</span>
                    <span className="font-semibold text-[#162623]">
                      {checkoutApt.fee}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#577877]">Platform fee</span>
                    <span className="font-semibold text-[#162623]">$0.00</span>
                  </div>
                </div>

                <div className="border-t border-[#577877]/15 my-3" />

                {/* Total due today */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-[#162623]">
                    Total due today
                  </span>
                  <span className="text-2xl font-bold text-[#162623]">
                    {checkoutApt.fee}
                  </span>
                </div>

                {/* Cancellation Policy Checkbox */}
                <div className="pt-2">
                  <label className="flex items-start gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={agreeCancellation}
                      onChange={(e) => setAgreeCancellation(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-[#577877]/40 text-[#295255] focus:ring-[#295255] accent-[#295255]"
                    />
                    <div className="text-xs">
                      <span className="font-semibold text-[#162623]">
                        I agree to the cancellation policy.
                      </span>
                      <span className="text-[11px] text-[#577877] block mt-0.5 leading-normal">
                        Full refund if cancelled at least 24 hours before the
                        visit.
                      </span>
                    </div>
                  </label>
                </div>

                {paymentError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm">
                      error
                    </span>
                    <span>{paymentError}</span>
                  </div>
                )}

                {/* Pay Button matching Screenshot */}
                <div className="pt-2">
                  <button
                    type="button"
                    disabled={!agreeCancellation || isProcessingPayment}
                    onClick={handleProcessPayment}
                    className={`btn-primary w-full !py-3 rounded-xl font-semibold text-xs shadow-sm flex items-center justify-center gap-2 ${
                      !agreeCancellation ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">
                      lock
                    </span>
                    <span>
                      {isProcessingPayment
                        ? "Processing..."
                        : `Pay ${checkoutApt.fee} & confirm`}
                    </span>
                  </button>

                  <p className="text-[11px] text-[#577877] text-center mt-2.5">
                    USD · Your payment is submitted once.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Global Footer matching Screenshot */}
          <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
            <p>© 2026 Kaizentrix Care · Your health, thoughtfully connected.</p>
            <div className="flex items-center gap-4">
              <span className="hover:text-[#162623] cursor-pointer">
                Privacy
              </span>
              <span>·</span>
              <span className="hover:text-[#162623] cursor-pointer">Terms</span>
              <span>·</span>
              <span
                className="hover:text-[#162623] cursor-pointer"
                onClick={() => onNavigate("support")}
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
  // VIEW 3: PAYMENTS & BILLING OVERVIEW (Matches Screenshot 8)
  // ========================================================
  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Toast Notification */}
        {toastMessage && (
          <div className="p-3.5 rounded-xl bg-white border border-[#295255]/30 shadow-sm flex items-center justify-between text-xs text-[#295255] font-semibold">
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

        {/* Page Heading & Top Action Row matching Screenshot */}
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
            <button
              type="button"
              onClick={() => setView("receipt")}
              className="btn-primary !px-4 !py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs"
            >
              <span className="material-symbols-outlined !text-white text-base">
                receipt_long
              </span>
              <span>Latest receipt</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadStatement}
              className="btn-secondary !px-4 !py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs shrink-0"
            >
              <span className="material-symbols-outlined !text-[#295255] text-base">
                download
              </span>
              <span>Download statement</span>
            </button>
          </div>
        </div>

        {/* 3 Metric Stat Cards matching Screenshot 8 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Card 1: Outstanding balance */}
          <div className="care-card p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#577877] font-medium">
                Outstanding balance
              </span>
              <span className="material-symbols-outlined !text-[#295255] text-lg">
                check_circle
              </span>
            </div>
            <p className="text-3xl font-bold text-[#162623] tracking-tight">
              $0.00
            </p>
            <p className="text-xs text-[#577877]">You're all up to date</p>
          </div>

          {/* Card 2: Paid this year */}
          <div className="care-card p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#577877] font-medium">
                Paid this year
              </span>
              <span className="material-symbols-outlined !text-[#295255] text-lg">
                account_balance_wallet
              </span>
            </div>
            <p className="text-3xl font-bold text-[#162623] tracking-tight">
              $630.00
            </p>
            <p className="text-xs text-[#577877]">8 consultations in 2026</p>
          </div>

          {/* Card 3: Refunds in progress */}
          <div className="care-card p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#577877] font-medium">
                Refunds in progress
              </span>
              <span className="material-symbols-outlined !text-[#295255] text-lg">
                sync
              </span>
            </div>
            <p className="text-3xl font-bold text-[#162623] tracking-tight">
              $0.00
            </p>
            <p className="text-xs text-[#577877]">No pending refunds</p>
          </div>
        </div>

        {/* Main Card: Tabs + Table matching Screenshot 8 */}
        <div className="care-card p-6 sm:p-7 space-y-5">
          {/* Tabs: Transactions | Payment methods | Billing details */}
          <div className="flex items-center gap-8 border-b border-[#577877]/20 pt-1 text-sm font-medium">
            {[
              { id: "transactions", label: "Transactions" },
              { id: "methods", label: "Payment methods" },
              { id: "details", label: "Billing details" },
            ].map((tab) => {
              const isActive = activeBillingTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveBillingTab(tab.id)}
                  className={`pb-3 font-semibold transition-all relative ${
                    isActive
                      ? "text-[#295255]"
                      : "text-[#577877] hover:text-[#162623]"
                  }`}
                >
                  <span>{tab.label}</span>
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#295255] rounded-full" />
                  )}
                </button>
              );
            })}
          </div>

          {/* TAB 1: Transactions Table */}
          {activeBillingTab === "transactions" && (
            <div className="space-y-4">
              {/* Subheader: All transactions · 2026 + Filter pill */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#577877]">All transactions · 2026</span>
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
                  </select>
                  <span className="material-symbols-outlined !text-[#577877] text-xs absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    expand_more
                  </span>
                </div>
              </div>

              {/* Transactions Table matching Screenshot */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-[#F0F5F7]/80 text-[#577877] font-semibold uppercase text-[11px] tracking-wider border-y border-[#577877]/15">
                      <th className="py-3 px-4">Receipt</th>
                      <th className="py-3 px-4">Appointment</th>
                      <th className="py-3 px-4">Doctor</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#577877]/15">
                    {paginatedTransactions.map((item) => (
                      <tr
                        key={item.receiptId}
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
                          <span className="font-semibold text-[#1E7E34]">
                            {item.status}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedReceipt(item);
                            }}
                            className="font-medium text-[#162623] hover:text-[#295255] inline-flex items-center gap-1 cursor-pointer transition"
                          >
                            <span>View receipt</span>
                            <span className="material-symbols-outlined text-xs">
                              open_in_new
                            </span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Row matching Screenshot */}
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
            </div>
          )}

          {/* TAB 2: Payment Methods */}
          {activeBillingTab === "methods" && (
            <div className="space-y-4 pt-2">
              <h3 className="text-sm font-bold text-[#162623]">
                Cards on File
              </h3>
              <div className="p-4 rounded-xl border border-[#577877]/20 bg-[#F0F5F7]/30 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="px-2.5 py-1 rounded bg-[#EBF5F5] text-[#295255] font-bold text-xs tracking-wider border border-[#295255]/20">
                    VISA
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-[#162623]">
                      •••• 4242 (Default)
                    </p>
                    <p className="text-[11px] text-[#577877]">
                      Expires 08/2028 · Emma Mitchell
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowManageCard(true)}
                  className="btn-secondary !px-3.5 !py-1 text-xs font-semibold rounded-xl"
                >
                  Edit
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowManageCard(true)}
                className="btn-secondary !px-4 !py-2 text-xs font-semibold rounded-xl flex items-center gap-2"
              >
                <span className="material-symbols-outlined !text-[#295255] text-base">
                  add
                </span>
                <span>Add payment method</span>
              </button>
            </div>
          )}

          {/* TAB 3: Billing Details */}
          {activeBillingTab === "details" && (
            <div className="space-y-4 pt-2 text-xs">
              <h3 className="text-sm font-bold text-[#162623]">
                Patient Billing Profile
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-[#F0F5F7] space-y-1">
                  <span className="text-[#577877] block text-[11px]">
                    Legal Name
                  </span>
                  <p className="font-semibold text-[#162623]">Emma Mitchell</p>
                </div>
                <div className="p-4 rounded-xl bg-[#F0F5F7] space-y-1">
                  <span className="text-[#577877] block text-[11px]">
                    Billing Address
                  </span>
                  <p className="font-semibold text-[#162623]">
                    2148 Pine Street, Apt 3, San Francisco, CA 94115
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[#F0F5F7] space-y-1">
                  <span className="text-[#577877] block text-[11px]">
                    HSA / FSA Eligibility
                  </span>
                  <p className="font-semibold text-[#1E7E34]">
                    Eligible for Medical Reimbursement
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[#F0F5F7] space-y-1">
                  <span className="text-[#577877] block text-[11px]">
                    Currency
                  </span>
                  <p className="font-semibold text-[#162623]">
                    USD ($) · Self-pay
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom 2-Column Row matching Screenshot 8 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          {/* Left Card: Your preferred payment method */}
          <div className="care-card p-6 sm:p-7 flex flex-col justify-between space-y-4">
            <div>
              <h3 className="text-base font-bold text-[#162623]">
                Your preferred payment method
              </h3>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center">
                <span className="px-2.5 py-1 rounded bg-[#EBF5F5] text-[#295255] font-bold text-xs tracking-wider border border-[#295255]/20">
                  VISA
                </span>
                <span className="text-xs font-medium text-[#162623] ml-3">
                  •••• 4242 · Expires 08/2028
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowManageCard(true)}
                className="btn-secondary !px-4 !py-1.5 rounded-xl text-xs font-semibold shadow-2xs"
              >
                Manage
              </button>
            </div>
          </div>

          {/* Right Card: A question about a charge? */}
          <div className="care-card p-6 sm:p-7 flex flex-col justify-between space-y-3">
            <div className="space-y-1">
              <h3 className="text-base font-bold text-[#162623]">
                A question about a charge?
              </h3>
              <p className="text-xs text-[#577877] leading-relaxed">
                Our billing team can help with receipts, refunds, and payment
                questions.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => onNavigate("support")}
                className="text-xs font-semibold text-[#295255] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Contact billing support</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>

        {/* Global Footer matching Screenshot */}
        <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
          <p>© 2026 Kaizentrix Care · Your health, thoughtfully connected.</p>
          <div className="flex items-center gap-4">
            <span className="hover:text-[#162623] cursor-pointer">Privacy</span>
            <span>·</span>
            <span className="hover:text-[#162623] cursor-pointer">Terms</span>
            <span>·</span>
            <span
              className="hover:text-[#162623] cursor-pointer"
              onClick={() => onNavigate("support")}
            >
              Need help?
            </span>
          </div>
        </div>
      </div>

      {/* View Receipt Modal */}
      {selectedReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined !text-[#295255] text-xl">
                  receipt_long
                </span>
                <h3 className="text-base font-bold text-[#162623]">
                  Receipt {selectedReceipt.receiptId}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7]"
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
                <span className="font-bold text-base text-[#295255]">
                  {selectedReceipt.amount}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-[#577877]">
              Healthcare Teleconsultation services are exempt from sales tax.
              Suitable for HSA/FSA claims.
            </p>

            <div className="pt-2 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setSelectedReceipt(null)}
                className="btn-secondary !py-2 !px-4 text-xs"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="btn-primary !py-2 !px-4 text-xs flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">print</span>
                <span>Print Receipt</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Payment Card Modal */}
      {showManageCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined !text-[#295255] text-xl">
                  credit_card
                </span>
                <h3 className="text-base font-bold text-[#162623]">
                  Payment Method
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowManageCard(false)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7]"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3.5 rounded-xl border-2 border-[#295255] bg-[#E8F3F3] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="px-2 py-0.5 rounded bg-white text-[#295255] font-bold text-xs tracking-wider">
                    VISA
                  </span>
                  <div>
                    <p className="font-bold text-[#162623]">•••• 4242</p>
                    <p className="text-[11px] text-[#577877]">
                      Expires 08/2028 · Default method
                    </p>
                  </div>
                </div>
                <span className="text-[#295255] font-bold">✓</span>
              </div>

              <div className="space-y-2 pt-1">
                <label className="font-semibold text-[#162623] block">
                  Billing ZIP Code
                </label>
                <input
                  type="text"
                  defaultValue="94115"
                  className="w-full px-3 py-2 rounded-xl border border-[#577877]/25 text-xs text-[#162623] focus:outline-none focus:border-[#295255]"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowManageCard(false)}
                className="btn-secondary !py-2 !px-4 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowManageCard(false);
                  setToastMessage("Payment preferences saved.");
                  setTimeout(() => setToastMessage(""), 3500);
                }}
                className="btn-primary !py-2 !px-4 text-xs"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
