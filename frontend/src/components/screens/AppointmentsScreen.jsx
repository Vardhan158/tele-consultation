import { useState, useEffect, useRef } from "react";
import { patientApi, consultationApi, insuranceApi, API_BASE_URL } from "../../lib/api";
import { appointmentCategory, canJoinAppointment } from "../../lib/appointmentRules";
import WebRtcConsultation from "../consultation/WebRtcConsultation";

const loadRazorpayScript = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true);
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};

function formatDbAppointment(apt) {
  if (!apt) return null;
  const startDate = apt.starts_at ? new Date(apt.starts_at) : new Date();
  const endDate = apt.ends_at
    ? new Date(apt.ends_at)
    : new Date(startDate.getTime() + 30 * 60000);

  const tz = apt.doctor?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const dateShort = startDate.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const dateFull = startDate.toLocaleDateString("en-US", {
    timeZone: tz,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const startTime = startDate.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
  const endTime = endDate.toLocaleTimeString("en-US", {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });

  let docName = apt.doctor?.full_name || apt.doctor?.name || apt.doctor_name || "";
  if (
    !docName ||
    docName.trim().toLowerCase().includes("patient") ||
    docName.trim().toLowerCase().includes("mitchell") ||
    docName.trim().toLowerCase().includes("emma")
  ) {
    docName = "";
  }

  const docInitials =
    docName
      .split(" ")
      .map((n) => n[0])
      .filter(Boolean)
      .slice(-2)
      .join("")
      .toUpperCase();

  const totalPaise = apt.total_payable_paise || apt.fee_paise || (apt.doctor?.fee_paise ?? null);
  const currency = apt.currency || "";

  const feeFull = totalPaise != null
    ? `${currency} ${(totalPaise / 100).toFixed(2)}`
    : "";

  const isPaid = apt.payment_status === "captured" || apt.payment_status === "success";
  const isExplicitlyFree = apt.payment_status === "not_required" || apt.payment_status === "no_payment_required";
  const isPendingPayment = totalPaise != null && (apt.status === "pending_payment" || apt.payment_status === "pending" || apt.payment_status === "pending_payment");
  const isExpiredPendingPayment = isPendingPayment && endDate.getTime() < Date.now();

  const statusLabel =
    isExpiredPendingPayment
      ? "Booking Expired"
      : apt.status === "confirmed"
      ? "Confirmed"
      : apt.status === "completed"
        ? "Completed"
        : apt.status === "cancelled"
          ? "Cancelled"
          : apt.status === "pending_payment"
            ? "Pending Payment"
            : apt.status ? apt.status.charAt(0).toUpperCase() + apt.status.slice(1) : "Confirmed";

  const paymentStatusLabel = isExpiredPendingPayment
    ? "Payment Expired"
    : isPaid
    ? "Paid"
    : isExplicitlyFree
      ? "No Payment Required"
      : totalPaise == null
        ? ""
        : apt.payment_status === "failed"
          ? "Payment Failed"
          : apt.payment_status === "refunded"
            ? "Refunded"
            : "Payment Pending";

  const rawId = strVal(apt.id);
  const displayId = rawId
    ? rawId.startsWith("KC-APT-")
      ? rawId
      : `KC-APT-${rawId.slice(-6).toUpperCase()}`
    : "KC-APT-ONLINE";

  return {
    id: apt.id,
    displayId,
    doctor: {
      id: apt.doctor?.id || apt.doctor_id,
      name: docName,
      fullName: docName,
      initials: docInitials,
      specialty: apt.doctor?.specialty || "",
      experienceShort: apt.doctor?.experience || "",
      clinic: apt.doctor?.clinic_name || "",
      feeDisplay: feeFull,
      timezone: tz,
    },
    reason: apt.type ? `${apt.type} consultation` : apt.reason || "",
    appointmentType: apt.type || apt.appointment_type || "",
    dateShort,
    dateFull,
    timeRange: `${startTime}–${endTime}`,
    timeFull: `${startTime}–${endTime} (${tz})`,
    format: apt.visit_format || "",
    status: statusLabel,
    rawStatus: apt.status,
    paymentStatus: paymentStatusLabel,
    rawPaymentStatus: apt.payment_status,
    isPaid,
    isPendingPayment,
    isExpiredPendingPayment,
    join_window_minutes: apt.join_window_minutes,
    fee: feeFull,
    feePaise: totalPaise,
    currency,
    starts_at: apt.starts_at,
    ends_at: apt.ends_at,
  };
}

function strVal(v) {
  return typeof v === "string" ? v : v ? String(v) : "";
}

export default function AppointmentsScreen({ onNavigate, navParams }) {
  const [userSelectedView, setUserSelectedView] = useState(null);
  const view = userSelectedView ?? (navParams?.view || "list");
  const setView = (v) => setUserSelectedView(v);

  const [activeTab, setActiveTab] = useState("upcoming");
  const [dbAppointments, setDbAppointments] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [loading, setLoading] = useState(true);

  const [consultationRoom, setConsultationRoom] = useState(null);
  const [consultationError, setConsultationError] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("Waiting for doctor");
  const localVideoRef = useRef(null);
  const mediaStreamRef = useRef(null);

  const fetchAppointments = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const items = await patientApi.appointments();
      if (Array.isArray(items)) {
        setDbAppointments(items.map(formatDbAppointment).filter(Boolean));
      }
    } catch (error) {
      setLoadError(error.message || "Unable to load appointments. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  const activeUpcomingList = dbAppointments.filter((a) => appointmentCategory(a, now) === "upcoming");
  const activePastList = dbAppointments.filter((a) => appointmentCategory(a, now) === "past");
  const activeCancelledList = dbAppointments.filter((a) => appointmentCategory(a, now) === "cancelled");

  // Selected appointment
  const rawTarget = navParams?.appointment || activeUpcomingList[0] || dbAppointments[0] || null;
  const targetApt = rawTarget ? (rawTarget.displayId ? rawTarget : formatDbAppointment(rawTarget)) : null;

  const [detailAppointment, setDetailAppointment] = useState(targetApt);

  useEffect(() => {
    if (navParams?.appointment) {
      setDetailAppointment(
        navParams.appointment.displayId
          ? navParams.appointment
          : formatDbAppointment(navParams.appointment),
      );
    } else if (!detailAppointment && dbAppointments.length > 0) {
      setDetailAppointment(dbAppointments[0]);
    }
  }, [navParams, dbAppointments]);

  const activeApt = detailAppointment || targetApt;

  // Active Video Call States
  const [consultationDuration, setConsultationDuration] = useState(0);
  const [consultationSideTab, setConsultationSideTab] = useState("chat");
  const [consultationChatMessages, setConsultationChatMessages] = useState([]);
  const [consultationInput, setConsultationInput] = useState("");
  const [consultationMic, setConsultationMic] = useState(true);
  const [consultationCam, setConsultationCam] = useState(true);

  // Waiting Room Media Controls
  const [micOn, setMicOn] = useState(true);
  const [cameraOn, setCameraOn] = useState(true);
  const [selectedMic, setSelectedMic] = useState("Built-in microphone");
  const [selectedSpeaker, setSelectedSpeaker] = useState("Built-in speakers");
  const [testingSpeaker, setTestingSpeaker] = useState(false);

  const [toastMessage, setToastMessage] = useState("");

  // Reschedule & Cancel Modal States
  const [rescheduleApt, setRescheduleApt] = useState(null);
  const [rescheduleSlots, setRescheduleSlots] = useState([]);
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState(null);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);
  const [rescheduleSubmitting, setRescheduleSubmitting] = useState(false);
  const [rescheduleError, setRescheduleError] = useState("");

  const [cancelApt, setCancelApt] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSubmitting, setCancelSubmitting] = useState(false);
  const [cancelError, setCancelError] = useState("");

  // Checkpoint 4: Completed Appointment Details & Insurance Claim States
  const [selectedCompletedApt, setSelectedCompletedApt] = useState(null);
  const [claimEligibility, setClaimEligibility] = useState(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [eligibilityError, setEligibilityError] = useState("");
  const [patientPolicies, setPatientPolicies] = useState([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState("");
  const [claimNotes, setClaimNotes] = useState("");
  const [claimInitiating, setClaimInitiating] = useState(false);
  const [claimInitiateError, setClaimInitiateError] = useState("");
  const [showClaimForm, setShowClaimForm] = useState(false);
  const [activeMasterProviders, setActiveMasterProviders] = useState([]);
  const [showQuickAddPolicy, setShowQuickAddPolicy] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({
    provider_id: "",
    policy_number: "",
    member_id: "",
    policy_holder_name: "",
    relationship: "Self",
    insurance_type: "Individual",
    start_date: "",
    expiry_date: "",
  });
  const [quickAddCard, setQuickAddCard] = useState(null);
  const [quickAddSubmitting, setQuickAddSubmitting] = useState(false);
  const [quickAddError, setQuickAddError] = useState("");

  // Checkpoint 5: Claim Supporting Documents & Automatic Dossier States
  const [claimDossier, setClaimDossier] = useState(null);
  const [dossierLoading, setDossierLoading] = useState(false);
  const [dossierError, setDossierError] = useState("");
  const [supportingFile, setSupportingFile] = useState(null);
  const [supportingTitle, setSupportingTitle] = useState("");
  const [supportingUploading, setSupportingUploading] = useState(false);
  const [supportingUploadError, setSupportingUploadError] = useState("");
  const [previewDoc, setPreviewDoc] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Checkpoint 6: Insurance Data Sharing Consent States
  const [claimConsent, setClaimConsent] = useState(null);
  const [consentLoading, setConsentLoading] = useState(false);
  const [consentError, setConsentError] = useState("");
  const [consentChecked, setConsentChecked] = useState(false); // STRICT: unchecked by default
  const [consentSubmitting, setConsentSubmitting] = useState(false);
  const [consentActionError, setConsentActionError] = useState("");
  const [showReviewConsentModal, setShowReviewConsentModal] = useState(false);
  const [consentLegalDoc, setConsentLegalDoc] = useState(null);
  const [consentLegalDocLoading, setConsentLegalDocLoading] = useState(false);

  const loadDossier = async (aptId, policyId = null) => {
    if (!aptId) return;
    setDossierLoading(true);
    setDossierError("");
    try {
      const res = await insuranceApi.getClaimDossier(aptId, policyId);
      setClaimDossier(res);
    } catch (err) {
      setDossierError(err.message || "Failed to load claim document dossier.");
    } finally {
      setDossierLoading(false);
    }
  };

  const loadClaimConsent = async (aptId, policyId = null) => {
    if (!aptId) return;
    setConsentLoading(true);
    setConsentError("");
    setConsentActionError("");
    try {
      const res = await insuranceApi.getClaimConsent(aptId, policyId);
      setClaimConsent(res);
      // STRICT REQUIREMENT: Checkbox must NOT be pre-selected.
      // Only set to true if an active valid consent was already explicitly recorded and does not require renewal
      setConsentChecked(Boolean(res?.is_granted && !res?.requires_renewal));
    } catch (err) {
      setConsentError(err.message || "Failed to load claim data sharing consent status.");
    } finally {
      setConsentLoading(false);
    }
  };

  const handleGrantConsent = async () => {
    if (!selectedCompletedApt) return;
    if (!consentChecked) {
      setConsentActionError("Please tick the authorization checkbox below before granting consent.");
      return;
    }
    setConsentActionError("");
    setConsentSubmitting(true);
    try {
      await insuranceApi.grantClaimConsent(selectedCompletedApt.id, {
        policy_id: selectedPolicyId || undefined,
        consent_accepted: true,
      });
      setToastMessage("Insurance data sharing consent granted successfully!");
      await loadClaimConsent(selectedCompletedApt.id, selectedPolicyId);
    } catch (err) {
      setConsentActionError(err.message || "Failed to record data sharing consent.");
    } finally {
      setConsentSubmitting(false);
    }
  };

  const handleWithdrawConsent = async () => {
    if (!selectedCompletedApt) return;
    setConsentActionError("");
    setConsentSubmitting(true);
    try {
      await insuranceApi.withdrawClaimConsent(selectedCompletedApt.id);
      setToastMessage("Insurance data sharing consent has been withdrawn.");
      setConsentChecked(false);
      await loadClaimConsent(selectedCompletedApt.id, selectedPolicyId);
    } catch (err) {
      setConsentActionError(err.message || "Failed to withdraw consent.");
    } finally {
      setConsentSubmitting(false);
    }
  };

  const handleOpenReviewConsent = async () => {
    setShowReviewConsentModal(true);
    if (!consentLegalDoc) {
      setConsentLegalDocLoading(true);
      try {
        const doc = await insuranceApi.getClaimConsentDocument();
        setConsentLegalDoc(doc);
      } catch (err) {
        setToastMessage(err.message || "Failed to load complete consent document.", "error");
      } finally {
        setConsentLegalDocLoading(false);
      }
    }
  };

  const handleOpenCompletedDetails = async (apt) => {
    setSelectedCompletedApt(apt);
    setClaimEligibility(null);
    setEligibilityError("");
    setEligibilityLoading(true);
    setShowClaimForm(false);
    setClaimInitiateError("");
    setSelectedPolicyId("");
    setClaimNotes("");
    setClaimDossier(null);
    setDossierError("");
    setSupportingFile(null);
    setSupportingTitle("");
    setSupportingUploadError("");
    setClaimConsent(null);
    setConsentError("");
    setConsentChecked(false);
    setConsentActionError("");

    try {
      const [eligibilityRes, policiesRes, providersRes] = await Promise.all([
        insuranceApi.checkClaimEligibility(apt.id).catch((err) => {
          setEligibilityError(err.message || "Failed to check claim eligibility");
          return null;
        }),
        insuranceApi.getPatientPolicies().catch(() => []),
        insuranceApi.getActiveProviders().catch(() => []),
      ]);

      if (eligibilityRes) {
        setClaimEligibility(eligibilityRes);
      }
      const activePols = Array.isArray(policiesRes)
        ? policiesRes.filter((p) => p.status === "Active")
        : [];
      setPatientPolicies(activePols);
      let initialPolId = null;
      if (activePols.length > 0) {
        initialPolId = activePols[0].id;
        setSelectedPolicyId(initialPolId);
      }
      setActiveMasterProviders(Array.isArray(providersRes) ? providersRes : []);

      // Auto-fetch Checkpoint 5 dossier and Checkpoint 6 consent status
      loadDossier(apt.id, initialPolId);
      loadClaimConsent(apt.id, initialPolId);
    } catch (err) {
      setEligibilityError(err.message || "Failed to load claim details.");
    } finally {
      setEligibilityLoading(false);
    }
  };

  const handlePolicyChange = (newPolicyId) => {
    setSelectedPolicyId(newPolicyId);
    if (selectedCompletedApt) {
      loadDossier(selectedCompletedApt.id, newPolicyId);
      loadClaimConsent(selectedCompletedApt.id, newPolicyId);
    }
  };

  const handleSupportingUpload = async (e) => {
    e.preventDefault();
    if (!supportingFile) {
      setSupportingUploadError("Please select a file to upload (PDF, JPG, or PNG up to 10 MB).");
      return;
    }
    setSupportingUploadError("");
    setSupportingUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", supportingFile);
      formData.append("title", supportingTitle.trim() || supportingFile.name);

      await insuranceApi.uploadSupportingDocument(selectedCompletedApt.id, formData);
      setToastMessage("Supporting document uploaded and attached to claim dossier!");
      setSupportingFile(null);
      setSupportingTitle("");
      await loadDossier(selectedCompletedApt.id, selectedPolicyId);
      await loadClaimConsent(selectedCompletedApt.id, selectedPolicyId);
    } catch (err) {
      setSupportingUploadError(err.message || "Failed to upload supporting document.");
    } finally {
      setSupportingUploading(false);
    }
  };

  const handleDeleteSupportingDoc = async (docId) => {
    if (!docId) return;
    try {
      await insuranceApi.deleteDocument(docId);
      setToastMessage("Document removed from claim dossier.");
      await loadDossier(selectedCompletedApt.id, selectedPolicyId);
      await loadClaimConsent(selectedCompletedApt.id, selectedPolicyId);
    } catch (err) {
      setToastMessage(err.message || "Failed to remove document.", "error");
    }
  };

  const handlePreviewDossierDoc = async (docItem) => {
    if (!docItem) return;
    setPreviewLoading(true);
    try {
      let previewResult = null;
      if (docItem.category === "consultation_invoice") {
        previewResult = await insuranceApi.fetchInvoicePreviewBlob(selectedCompletedApt.id);
      } else if (docItem.category === "payment_receipt") {
        previewResult = await insuranceApi.fetchReceiptPreviewBlob(selectedCompletedApt.id);
      } else if (docItem.category === "insurance_card" || docItem.category === "supporting_document") {
        previewResult = await insuranceApi.fetchDocumentPreviewBlob(docItem.id);
      } else if (docItem.preview_url) {
        previewResult = await insuranceApi.fetchClinicalDocBlob(docItem.preview_url);
      }

      if (previewResult) {
        setPreviewDoc({
          name: docItem.file_name || docItem.title,
          url: previewResult.objectUrl,
          contentType: previewResult.contentType,
          id: docItem.id,
          category: docItem.category,
        });
      } else {
        setToastMessage("Preview not available for this record.", "info");
      }
    } catch (err) {
      setToastMessage(err.message || "Failed to load document preview.", "error");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleDownloadDossierDoc = async (docItem) => {
    if (!docItem) return;
    try {
      setToastMessage(`Downloading "${docItem.file_name || docItem.title}"...`, "info");
      if (docItem.category === "consultation_invoice") {
        await insuranceApi.downloadClaimInvoice(selectedCompletedApt.id, docItem.file_name);
      } else if (docItem.category === "payment_receipt") {
        await insuranceApi.downloadClaimReceipt(selectedCompletedApt.id, docItem.file_name);
      } else if (docItem.category === "insurance_card" || docItem.category === "supporting_document") {
        await insuranceApi.downloadDocument(docItem.id, docItem.file_name);
      } else if (docItem.download_url) {
        const fullUrl = docItem.download_url.startsWith("http")
          ? docItem.download_url
          : `${API_BASE_URL}${docItem.download_url.replace(/^\/api/, "")}`;
        const res = await fetch(fullUrl, { credentials: "include" });
        if (!res.ok) throw new Error("Failed to download document");
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = docItem.file_name || "clinical_document";
        document.body.appendChild(link);
        link.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);
      }
    } catch (err) {
      setToastMessage(err.message || "Download failed. Please retry.", "error");
    }
  };

  const handleClosePreview = () => {
    if (previewDoc?.url) {
      window.URL.revokeObjectURL(previewDoc.url);
    }
    setPreviewDoc(null);
  };

  // Checkpoint 7: Save as Draft or Submit Claim with Double-Click Protection
  const [claimSubmittingMode, setClaimSubmittingMode] = useState(null); // 'draft' | 'submit' | null
  const [submissionSuccessData, setSubmissionSuccessData] = useState(null); // Result modal

  const handleClaimSubmitOrDraft = async (isDraft = false) => {
    if (!selectedPolicyId) {
      setClaimInitiateError("Please select an insurance policy to link to this claim.");
      return;
    }
    if (!isDraft) {
      if (!claimDossier?.mandatory_complete) {
        setClaimInitiateError("All mandatory supporting documents must be collected before submitting.");
        return;
      }
      if (!claimConsent?.is_granted || claimConsent?.requires_renewal) {
        setClaimInitiateError("Explicit Insurance Data Sharing Consent must be granted in the section above.");
        return;
      }
    }

    setClaimInitiateError("");
    setClaimSubmittingMode(isDraft ? "draft" : "submit");

    // Double-click protection token
    const submissionToken = `tok_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    try {
      const res = await insuranceApi.submitClaim(selectedCompletedApt.id, {
        policy_id: selectedPolicyId,
        notes: claimNotes.trim() || undefined,
        save_as_draft: isDraft,
        submission_token: submissionToken,
      });

      setToastMessage(res.message);
      setClaimEligibility((prev) => ({
        ...(prev || {}),
        has_active_claim: !isDraft,
        existing_claim_id: res.claim_reference,
        existing_claim_status: res.status,
        is_eligible: isDraft,
      }));

      if (!isDraft) {
        setSubmissionSuccessData(res);
      } else {
        setShowClaimForm(false);
      }
    } catch (err) {
      setClaimInitiateError(err.message || "Failed to process claim submission.");
    } finally {
      setClaimSubmittingMode(null);
    }
  };

  const handleQuickAddPolicySubmit = async (e) => {
    e.preventDefault();
    setQuickAddError("");
    if (!quickAddForm.provider_id || !quickAddForm.policy_number.trim() || !quickAddForm.policy_holder_name.trim() || !quickAddForm.start_date || !quickAddForm.expiry_date) {
      setQuickAddError("Please fill out all required fields.");
      return;
    }
    if (quickAddForm.expiry_date < quickAddForm.start_date) {
      setQuickAddError("Policy Expiry Date cannot be earlier than Policy Start Date.");
      return;
    }
    if (!quickAddCard) {
      setQuickAddError("Please attach an image or PDF of your Insurance Card.");
      return;
    }

    setQuickAddSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("provider_id", quickAddForm.provider_id);
      formData.append("policy_number", quickAddForm.policy_number.trim());
      if (quickAddForm.member_id.trim()) formData.append("member_id", quickAddForm.member_id.trim());
      formData.append("policy_holder_name", quickAddForm.policy_holder_name.trim());
      formData.append("relationship", quickAddForm.relationship);
      formData.append("insurance_type", quickAddForm.insurance_type);
      formData.append("start_date", quickAddForm.start_date);
      formData.append("expiry_date", quickAddForm.expiry_date);
      formData.append("insurance_card", quickAddCard);

      const newPolicy = await insuranceApi.registerPolicy(formData);
      setToastMessage("Insurance policy registered successfully!");
      const updatedPols = await insuranceApi.getPatientPolicies().catch(() => []);
      const activePols = Array.isArray(updatedPols) ? updatedPols.filter((p) => p.status === "Active") : [];
      setPatientPolicies(activePols);
      setSelectedPolicyId(newPolicy.id);
      if (selectedCompletedApt) {
        loadDossier(selectedCompletedApt.id, newPolicy.id);
        loadClaimConsent(selectedCompletedApt.id, newPolicy.id);
      }
      setShowQuickAddPolicy(false);
      setQuickAddCard(null);
    } catch (err) {
      setQuickAddError(err.message || "Failed to register policy.");
    } finally {
      setQuickAddSubmitting(false);
    }
  };

  const handleOpenReschedule = async (apt) => {
    setRescheduleApt(apt);
    setSelectedRescheduleSlot(null);
    setRescheduleError("");
    setRescheduleLoading(true);
    try {
      const docId = apt.doctor?.id || apt.doctor_id;
      const slots = await patientApi.doctorAvailability(docId);
      if (Array.isArray(slots)) {
        const available = slots.filter((s) => {
          const isBooked = s.booked === true || s.is_booked === true || s.status === "booked" || s.status === "occupied";
          return !isBooked;
        });
        setRescheduleSlots(available);
      } else {
        setRescheduleSlots([]);
      }
    } catch (err) {
      setRescheduleError(err.message || "Failed to load doctor availability.");
      setRescheduleSlots([]);
    } finally {
      setRescheduleLoading(false);
    }
  };

  const handleConfirmReschedule = async () => {
    if (!rescheduleApt || !selectedRescheduleSlot || rescheduleSubmitting) return;
    setRescheduleSubmitting(true);
    setRescheduleError("");
    try {
      await patientApi.rescheduleAppointment(rescheduleApt.id, {
        slot_id: selectedRescheduleSlot.id,
        starts_at: selectedRescheduleSlot.starts_at,
      });
      setToastMessage("Appointment rescheduled successfully.");
      setRescheduleApt(null);
      await fetchAppointments();
    } catch (err) {
      setRescheduleError(err.message || "Unable to reschedule appointment.");
    } finally {
      setRescheduleSubmitting(false);
    }
  };

  const handleOpenCancel = (apt) => {
    setCancelApt(apt);
    setCancelReason("Schedule conflict / Personal reasons");
    setCancelError("");
  };

  const handleConfirmCancel = async () => {
    if (!cancelApt || cancelSubmitting) return;
    setCancelSubmitting(true);
    setCancelError("");
    try {
      await patientApi.cancelAppointment(cancelApt.id, {
        reason: cancelReason || "Schedule conflict",
      });
      setToastMessage("Appointment cancelled. Refund processed where applicable.");
      setCancelApt(null);
      await fetchAppointments();
    } catch (err) {
      setCancelError(err.message || "Unable to cancel appointment.");
    } finally {
      setCancelSubmitting(false);
    }
  };


  // Setup webcam stream for waiting room
  useEffect(() => {
    if (view === "waiting-room" || view === "waiting") {
      let activeStream;
      async function startVideo() {
        try {
          if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            activeStream = await navigator.mediaDevices.getUserMedia({
              video: cameraOn,
              audio: micOn,
            });
            mediaStreamRef.current = activeStream;
            if (localVideoRef.current) {
              localVideoRef.current.srcObject = activeStream;
            }
          }
        } catch {
          // Camera permission fallback
        }
      }
      startVideo();

      return () => {
        if (activeStream) {
          activeStream.getTracks().forEach((t) => t.stop());
        }
      };
    }
  }, [view, cameraOn, micOn]);

  const handleTestSpeaker = () => {
    setTestingSpeaker(true);
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.8);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.8);
    } catch {
      // AudioContext fallback
    }
    setTimeout(() => setTestingSpeaker(false), 1200);
  };

  const handleCompletePayment = async (apt) => {
    if (!apt) return;
    try {
      setToastMessage("Initiating Razorpay Checkout...");
      const orderRes = await patientApi.createOrder({
        doctor_id: apt.doctor.id,
        appointment_type: apt.appointmentType,
        starts_at: apt.starts_at,
        visit_format: apt.format,
        visit_reason: apt.reason,
        doctor_notes: "",
      });

      const loaded = await loadRazorpayScript();
      if (!loaded || !window.Razorpay) {
        throw new Error("Payment checkout is unavailable. Please try again.");
      }

      const options = {
        key: orderRes.key_id,
        amount: orderRes.amount_paise,
        currency: "INR",
        name: "Kaizen Care Telehealth",
        description: `${apt.doctor.name} · ${apt.appointmentType || "Consultation"}`,
        order_id: orderRes.order_id,
        handler: async function (response) {
          try {
            await patientApi.verifyPayment({
              payment_id: orderRes.payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setToastMessage("Payment completed & appointment confirmed!");
            fetchAppointments();
          } catch (err) {
            setToastMessage(err.message || "Payment verification failed.");
          }
        },
        modal: {
          ondismiss: function () {
            setToastMessage("Payment checkout cancelled.");
          },
        },
        prefill: {},
        theme: {
          color: "#25836F",
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.open();
    } catch (err) {
      setToastMessage(err.message || "Unable to resume payment.");
    }
  };

  const handleJoinWaitingRoom = async (aptToJoin) => {
    if (!aptToJoin) return;
    if (
      aptToJoin.isPendingPayment ||
      aptToJoin.rawStatus === "pending_payment" ||
      aptToJoin.rawPaymentStatus === "pending"
    ) {
      setToastMessage("Payment is required before joining the consultation room.");
      setTimeout(() => setToastMessage(""), 4000);
      return;
    }

    if (!canJoinAppointment(aptToJoin)) {
      setToastMessage("Consultation joining window is closed or the appointment is not eligible.");
      return;
    }
    setConsultationRoom(null);
    setDetailAppointment(aptToJoin);
    setView("waiting-room");
    setConsultationError("");
    setConnectionStatus("Waiting for doctor");
    try {
      const room = await consultationApi.join(aptToJoin.id);
      setConsultationRoom(room);
    } catch (err) {
      setConsultationError(err.message || "Unable to join the waiting room.");
    }
  };

  const handleEnterConsultation = async () => {
    const apt = detailAppointment || activeApt;
    if (apt?.id) {
      localStorage.setItem("teleconsult_appointment_id", apt.id);
      localStorage.setItem("teleconsult_in_call", "true");
      if (onNavigate) {
        onNavigate("video-consultation");
        return;
      }
    }
    setView("consultation");
  };

  // Polling effect for prescriptions when in active consultation
  useEffect(() => {
    if (view !== "consultation" && view !== "in-call") return;
    const aptId = activeApt?.id;
    if (!aptId) return;

    const fetchPrescriptions = async () => {
      try {
        const items = await patientApi.prescriptions();
        if (Array.isArray(items)) {
          const matching = items.filter(
            (rx) => String(rx.appointment_id || rx.appointmentId || "").toLowerCase() === String(aptId).toLowerCase()
          );
          setConsultationChatMessages((prev) => {
            const existingRxIds = new Set(
              prev.filter((m) => m.type === "prescription").map((m) => m.result?.id || m.result?._id)
            );
            const newRxMessages = [];
            for (const rx of matching) {
              const rxId = rx.id || rx._id;
              if (rxId && !existingRxIds.has(rxId)) {
                const content = typeof rx.content === "string" ? JSON.parse(rx.content || "{}") : (rx.content || {});
                newRxMessages.push({
                  type: "prescription",
                  result: rx,
                  payloadContent: content,
                  time: new Date(rx.released_at || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                });
              }
            }
            if (newRxMessages.length > 0) {
              return [...prev, ...newRxMessages];
            }
            return prev;
          });
        }
      } catch (err) {
        console.error("Failed to poll prescriptions:", err);
      }
    };

    fetchPrescriptions();
    const interval = setInterval(fetchPrescriptions, 3000);
    return () => clearInterval(interval);
  }, [view, activeApt?.id]);

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!consultationInput.trim()) return;
    const newMsg = {
      sender: "You (Patient)",
      text: consultationInput.trim(),
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      type: "text",
    };
    setConsultationChatMessages((prev) => [...prev, newMsg]);
    setConsultationInput("");
  };

  // ========================================================
  // VIEW 1: ACTIVE VIDEO CONSULTATION ROOM
  // ========================================================
  if (view === "consultation" || view === "in-call") {
    const apt = activeApt;

    return (
      <div className="w-full min-h-screen bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 font-sans text-[#162623]">
        <div className="mx-auto max-w-7xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#577877]/15 pb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
                Live Teleconsultation
              </h1>
              <p className="text-xs sm:text-sm text-[#577877] mt-1">
                {apt?.doctor?.name || "Dr. Harshavardhan m v"} · {apt?.doctor?.specialty || "ENT"} · {apt?.displayId || apt?.id}
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setToastMessage("Left consultation room.");
                setView("list");
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#577877]/30 bg-white px-4 py-2 text-xs font-semibold text-[#25836F] shadow-xs hover:bg-[#F0F5F7] cursor-pointer"
            >
              ← Back to Appointments
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-6 lg:sticky lg:top-4 space-y-4">
              <div className="care-card p-4 rounded-2xl bg-white border border-[#577877]/15 shadow-lg">
                <h3 className="text-sm font-bold text-[#162623] mb-3 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#25836F]">videocam</span>
                  Video Streaming
                </h3>
                {consultationRoom?.session_id ? (
                  <WebRtcConsultation
                    appointmentId={apt?.id}
                    authorization={consultationRoom}
                    role="patient"
                    onEnded={() => {
                      setToastMessage("Consultation ended.");
                      setView("list");
                    }}
                  />
                ) : (
                  <div className="p-12 text-center text-[#577877] space-y-3">
                    <span className="material-symbols-outlined animate-spin text-4xl text-[#25836F]">
                      sync
                    </span>
                    <p className="text-sm font-bold text-[#162623]">
                      Authorizing video consultation room…
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-6 space-y-4 overflow-y-auto max-h-[calc(100vh-120px)]">
              <div className="care-card p-6 space-y-4">
                <h3 className="text-sm font-bold text-[#162623] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#25836F]">prescriptions</span>
                  Consultation Information &amp; Prescriptions
                </h3>
                <div className="text-xs space-y-2 text-[#577877]">
                  <p><strong className="text-[#162623]">Doctor:</strong> {apt?.doctor?.name}</p>
                  <p><strong className="text-[#162623]">Specialty:</strong> {apt?.doctor?.specialty}</p>
                  <p><strong className="text-[#162623]">Clinic:</strong> {apt?.doctor?.clinic}</p>
                  <p><strong className="text-[#162623]">Reason:</strong> {apt?.reason}</p>
                  <p><strong className="text-[#162623]">Status:</strong> {apt?.status}</p>
                </div>
                <div className="pt-4 border-t border-[#577877]/15 space-y-3">
                  <p className="text-xs font-bold text-[#162623] flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[#25836F] text-sm">chat</span>
                    Live Clinical Chat &amp; Notes
                  </p>

                  <div className="flex flex-col h-[360px] justify-between space-y-3">
                    <div className="space-y-3 overflow-y-auto pr-1 flex-1 p-3 rounded-xl bg-[#F0F5F7] border border-[#577877]/15">
                      {consultationChatMessages.length === 0 ? (
                        <div className="p-6 text-center text-xs text-[#577877] space-y-1">
                          <p className="font-semibold text-[#162623]">No messages or prescriptions yet.</p>
                          <p>Your clinician can share prescriptions, notes, and summaries directly during this consultation. Send a note to your doctor below.</p>
                        </div>
                      ) : (
                        consultationChatMessages.map((msg, i) => {
                          if (msg.type === "prescription") {
                            const rx = msg.result || {};
                            const content = msg.payloadContent || {};
                            const meds = content.medicines || [];
                            return (
                              <div
                                key={i}
                                className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-[#162623] space-y-3 mr-4 shadow-sm"
                              >
                                <div className="flex items-center justify-between border-b border-emerald-200/60 pb-2.5">
                                  <div className="flex items-center gap-1.5 font-bold text-emerald-900">
                                    <span className="material-symbols-outlined text-[#25836F] text-base">
                                      prescriptions
                                    </span>
                                    <span>e-Prescription Issued</span>
                                  </div>
                                  <span className="text-[10px] text-emerald-700 font-semibold">
                                    {msg.time}
                                  </span>
                                </div>
                                {content.diagnosis && (
                                  <p className="text-[11px] text-slate-700">
                                    <strong>Diagnosis:</strong> {content.diagnosis}
                                  </p>
                                )}
                                {meds.length > 0 && (
                                  <div className="space-y-1.5 bg-white/90 p-3 rounded-xl border border-emerald-100">
                                    <p className="font-bold text-[11px] text-emerald-900">
                                      Prescribed Medications:
                                    </p>
                                    {meds.map((m, idx) => (
                                      <div
                                        key={idx}
                                        className="text-[11px] text-slate-700 border-b border-slate-100 pb-1.5 last:border-b-0"
                                      >
                                        <span className="font-semibold">{m.name}</span> ({m.dosage}) · {m.frequency} for {m.duration}
                                        {m.instructions && (
                                          <div className="text-[10px] text-slate-500 mt-0.5">
                                            Instructions: {m.instructions}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {content.instructions && (
                                  <p className="text-[10px] text-slate-600">
                                    <strong>General Instructions:</strong> {content.instructions}
                                  </p>
                                )}
                                <div className="pt-1.5 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const rxId = rx.id || rx._id;
                                      if (!rxId) return;
                                      try {
                                        const blob = await patientApi.downloadPrescription(rxId);
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement("a");
                                        a.href = url;
                                        a.download = `Prescription-${rxId}.pdf`;
                                        document.body.appendChild(a);
                                        a.click();
                                        window.URL.revokeObjectURL(url);
                                        document.body.removeChild(a);
                                      } catch (err) {
                                        console.error("PDF download failed", err);
                                      }
                                    }}
                                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#25836F] px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-[#1d6e5d] transition cursor-pointer"
                                  >
                                    <span className="material-symbols-outlined text-sm">
                                      download
                                    </span>
                                    Download Prescription PDF
                                  </button>
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div
                              key={i}
                              className={`p-3 rounded-xl text-xs space-y-1 ${
                                msg.sender?.includes("You")
                                  ? "bg-[#25836F] text-white ml-6"
                                  : "bg-white text-[#162623] mr-6 border border-[#577877]/15 shadow-2xs"
                              }`}
                            >
                              <div className="flex justify-between text-[10px] opacity-75">
                                <span className="font-semibold">{msg.sender}</span>
                                <span>{msg.time}</span>
                              </div>
                              <p className="leading-relaxed">{msg.text}</p>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <form
                      onSubmit={handleSendMessage}
                      className="flex gap-2 pt-2 border-t border-[#577877]/15"
                    >
                      <input
                        type="text"
                        value={consultationInput}
                        onChange={(e) => setConsultationInput(e.target.value)}
                        placeholder="Type a clinical question or note…"
                        className="flex-1 px-3 py-2 rounded-xl border border-[#577877]/25 text-xs text-[#162623] focus:outline-none focus:border-[#25836F] bg-white"
                      />
                      <button
                        type="submit"
                        className="rounded-xl bg-[#25836F] px-4 py-2 text-xs font-bold text-white shadow hover:bg-[#1d6e5d] cursor-pointer flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-base">send</span>
                        <span>Send</span>
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================
  // VIEW 2: VIDEO CONSULTATION WAITING ROOM (NEVER BLANK SCREEN!)
  // ==========================================================
  if (view === "waiting-room" || view === "waiting") {
    const apt = activeApt;

    const nowTime = new Date().getTime();
    const startTime = apt?.starts_at ? new Date(apt.starts_at).getTime() : 0;
    const isExpired = startTime > 0 && startTime + 120 * 60000 < nowTime;

    return (
      <div className="w-full min-h-screen bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 font-sans text-[#162623]">
        <div className="mx-auto max-w-7xl space-y-6">
          {/* Header Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#577877]/15 pb-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
                Video Consultation Waiting Room
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-[#577877]">
                Check your camera, microphone, and appointment details before entering the consultation.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setView("list")}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[#577877]/30 bg-white px-4 py-2 text-xs font-semibold text-[#25836F] shadow-xs hover:bg-[#F0F5F7] cursor-pointer"
            >
              ← Back to My Appointments
            </button>
          </div>

          {/* Conditional State Cards */}
          {loading ? (
            <div className="care-card p-12 text-center text-[#577877] space-y-3">
              <span className="material-symbols-outlined animate-spin text-4xl text-[#25836F]">
                sync
              </span>
              <p className="text-sm font-bold text-[#162623]">
                Loading waiting room setup…
              </p>
            </div>
          ) : !apt ? (
            /* Missing / Invalid Appointment State */
            <div className="care-card p-10 text-center space-y-4 max-w-xl mx-auto border-2 border-amber-300">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl font-bold">
                  error
                </span>
              </div>
              <div>
                <h3 className="text-lg font-bold text-[#162623]">
                  Appointment Not Found
                </h3>
                <p className="text-xs text-[#577877] mt-1">
                  The selected appointment details could not be loaded or does not exist.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setView("list")}
                className="rounded-xl bg-[#25836F] px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-[#1d6e5d] cursor-pointer"
              >
                Back to My Appointments
              </button>
            </div>
          ) : apt.isPendingPayment ? (
            /* Unpaid / Pending Payment State */
            <div className="care-card p-10 text-center space-y-4 max-w-xl mx-auto border-2 border-amber-500">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl font-bold">
                  payments
                </span>
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#162623]">
                  Payment Required Before Consultation
                </h3>
                <p className="text-xs text-[#577877]">
                  Your consultation fee ({apt.fee}) is pending. Please complete payment to enter the waiting room.
                </p>
              </div>
              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => handleCompletePayment(apt)}
                  className="rounded-xl bg-amber-700 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-amber-800 cursor-pointer"
                >
                  Complete Payment ({apt.fee})
                </button>
                <button
                  type="button"
                  onClick={() => setView("list")}
                  className="rounded-xl border border-[#577877]/30 bg-white px-4 py-2.5 text-xs font-semibold text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
                >
                  Back to Appointments
                </button>
              </div>
            </div>
          ) : isExpired ? (
            /* Expired Appointment State */
            <div className="care-card p-10 text-center space-y-4 max-w-xl mx-auto border-2 border-rose-300">
              <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-100 text-rose-800 flex items-center justify-center">
                <span className="material-symbols-outlined text-3xl font-bold">
                  event_busy
                </span>
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-[#162623]">
                  Appointment Time Has Passed
                </h3>
                <p className="text-xs text-[#577877]">
                  This appointment slot expired on {apt.dateShort}. Please reschedule your visit to pick a new time.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setView("list")}
                className="rounded-xl bg-[#25836F] px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-[#1d6e5d] cursor-pointer"
              >
                Back to Appointments
              </button>
            </div>
          ) : (
            /* Valid Waiting Room Setup View */
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              {/* Left Column (8 cols): Camera Preview & Device Controls */}
              <div className="lg:col-span-8 space-y-6">
                {/* Camera Preview Box */}
                <div className="rounded-2xl overflow-hidden bg-[#162623] relative shadow-lg aspect-16/10 flex flex-col justify-between">
                  <div className="absolute top-4 left-4 z-20">
                    <span className="px-3.5 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white text-xs font-medium border border-white/10 shadow-xs">
                      📹 Camera Preview
                    </span>
                  </div>

                  <div className="w-full h-full relative">
                    {cameraOn ? (
                      <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-white/70 bg-[#1F2937]">
                        <span className="material-symbols-outlined text-5xl mb-2">
                          videocam_off
                        </span>
                        <p className="text-xs font-medium">Camera is turned off</p>
                      </div>
                    )}

                    <div className="absolute bottom-4 left-4 z-20">
                      <div className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm text-white text-xs flex items-center gap-2 border border-white/10">
                        <span
                          className={`material-symbols-outlined text-sm ${
                            micOn ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {micOn ? "mic" : "mic_off"}
                        </span>
                        <span className="font-medium text-[11px]">
                          Microphone: {micOn ? "Active" : "Muted"}
                        </span>
                      </div>
                    </div>

                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          const next = !micOn;
                          setMicOn(next);
                          if (mediaStreamRef.current) {
                            mediaStreamRef.current
                              .getAudioTracks()
                              .forEach((t) => (t.enabled = next));
                          }
                        }}
                        className={`px-4 py-2 rounded-full text-xs font-semibold shadow-md transition flex items-center gap-2 cursor-pointer ${
                          micOn
                            ? "bg-white text-[#162623] hover:bg-gray-100"
                            : "bg-rose-600 text-white hover:bg-rose-700"
                        }`}
                      >
                        <span className="material-symbols-outlined text-base">
                          {micOn ? "mic" : "mic_off"}
                        </span>
                        <span>{micOn ? "Mic On" : "Mic Muted"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const next = !cameraOn;
                          setCameraOn(next);
                          if (mediaStreamRef.current) {
                            mediaStreamRef.current
                              .getVideoTracks()
                              .forEach((t) => (t.enabled = next));
                          }
                        }}
                        className={`px-4 py-2 rounded-full text-xs font-semibold shadow-md transition flex items-center gap-2 cursor-pointer ${
                          cameraOn
                            ? "bg-white text-[#162623] hover:bg-gray-100"
                            : "bg-rose-600 text-white hover:bg-rose-700"
                        }`}
                      >
                        <span className="material-symbols-outlined text-base">
                          {cameraOn ? "videocam" : "videocam_off"}
                        </span>
                        <span>{cameraOn ? "Camera On" : "Camera Off"}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Device Setup Card */}
                <div className="care-card p-6 rounded-2xl bg-white border border-[#577877]/15 space-y-4">
                  <h3 className="text-base font-bold text-[#162623]">
                    Device Setup &amp; Audio Test
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block font-semibold text-[#162623] mb-1">
                        Microphone
                      </label>
                      <select
                        value={selectedMic}
                        onChange={(e) => setSelectedMic(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623]"
                      >
                        <option value="Built-in microphone">Built-in microphone</option>
                        <option value="Headset microphone">Headset microphone</option>
                      </select>
                    </div>

                    <div>
                      <label className="block font-semibold text-[#162623] mb-1">
                        Speakers
                      </label>
                      <select
                        value={selectedSpeaker}
                        onChange={(e) => setSelectedSpeaker(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623]"
                      >
                        <option value="Built-in speakers">Built-in speakers</option>
                        <option value="Headphones">Headphones</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#577877]/15">
                    <div className="flex items-center gap-2 text-xs text-[#577877]">
                      <span className="material-symbols-outlined text-emerald-600 text-base">
                        check_circle
                      </span>
                      <span className="font-semibold text-[#162623]">
                        Audio &amp; camera hardware ready
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleTestSpeaker}
                      className="border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-4 py-2 rounded-xl font-semibold text-xs cursor-pointer shadow-2xs"
                    >
                      {testingSpeaker ? "Testing Audio..." : "Test Speakers 🔊"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column (4 cols): Doctor Card & Enter Button */}
              <div className="lg:col-span-4 space-y-5">
                <div className="care-card p-6 rounded-2xl bg-white border border-[#577877]/15 space-y-4">
                  <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold uppercase tracking-wider">
                    {apt.status}
                  </span>

                  <div className="flex items-center gap-3.5 pt-1">
                    <div className="w-12 h-12 rounded-full bg-[#E0F0EC] text-[#25836F] font-bold text-base flex items-center justify-center shrink-0">
                      {apt.doctor.initials}
                    </div>
                    <div>
                      <h4 className="font-bold text-base text-[#162623]">
                        {apt.doctor.name}
                      </h4>
                      <p className="text-xs font-semibold text-[#25836F]">
                        {apt.doctor.specialty}
                      </p>
                      <p className="text-[11px] text-[#577877]">
                        {apt.doctor.clinic}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-[#F0F5F7] p-3 text-xs space-y-1.5 border border-[#577877]/15">
                    <div className="flex justify-between">
                      <span className="text-[#577877]">Date &amp; Time:</span>
                      <span className="font-bold text-[#162623]">{apt.dateShort} at {apt.timeRange}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#577877]">Visit Reason:</span>
                      <span className="font-semibold text-[#162623]">{apt.reason}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#577877]">Fee Status:</span>
                      <span className="font-bold text-emerald-800">{apt.paymentStatus} ({apt.fee})</span>
                    </div>
                  </div>

                  <div className="pt-2 space-y-2">
                    {canJoinAppointment(apt, now) && <button
                      type="button"
                      onClick={handleEnterConsultation}
                      disabled={!consultationRoom?.session_id}
                      className="w-full rounded-xl bg-[#25836F] py-3 text-xs font-bold text-white shadow hover:bg-[#1d6e5d] cursor-pointer transition"
                    >
                      Join Consultation Room
                    </button>}

                    <button
                      type="button"
                      onClick={() => setView("list")}
                      className="w-full rounded-xl border border-[#577877]/30 bg-white py-2.5 text-xs font-semibold text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
                    >
                      Back to My Appointments
                    </button>
                  </div>

                  {consultationError && (
                    <p className="text-xs font-semibold text-rose-600 text-center">
                      {consultationError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================================
  // MAIN VIEW: APPOINTMENT LIST VIEW
  // ==========================================================
  return (
    <div className="space-y-6 font-sans text-[#162623]">
      {toastMessage && (
        <div className="fixed top-20 right-4 z-50 rounded-xl bg-[#25836F] text-white p-4 shadow-xl text-xs font-semibold">
          ℹ️ {toastMessage}
        </div>
      )}
        {/* Compact Heading Banner matching Portal Brand System */}
        <div className="rounded-2xl bg-gradient-to-r from-[#25836F] via-[#1F6E5E] to-[#185A4D] text-white px-6 py-5 sm:px-8 sm:py-6 shadow-sm border border-[#185A4D]/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase text-[#F0F5F7]/85">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A3E2D4]" />
              Telehealth Consultations &amp; Schedule
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              My Appointments
            </h1>
            <p className="text-xs sm:text-sm text-[#F0F5F7]/90 max-w-2xl leading-relaxed">
              Manage your telehealth appointments, join consultation rooms, and complete payments.
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate("find-doctors")}
            className="px-5 py-2.5 rounded-xl font-semibold text-xs bg-white text-[#185A4D] hover:bg-[#F0F5F7] flex items-center gap-2 shadow-xs transition cursor-pointer shrink-0 self-start sm:self-center"
          >
            <span className="material-symbols-outlined text-base !text-[#185A4D]">add_circle</span>
            <span>Book New Appointment</span>
          </button>
        </div>

        {loadError && <div role="alert">{loadError} <button onClick={fetchAppointments}>Retry</button></div>}
        {loading && <p role="status">Loading appointments...</p>}
        {/* Status Tabs */}
        <div className="flex items-center gap-6 border-b border-[#577877]/20 pb-2 text-xs font-semibold">
          {[
            { id: "upcoming", label: `Upcoming (${activeUpcomingList.length})` },
            { id: "past", label: `Past (${activePastList.length})` },
            { id: "cancelled", label: `Cancelled (${activeCancelledList.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-2 relative transition cursor-pointer ${
                activeTab === tab.id ? "text-[#25836F] font-bold" : "text-[#577877]"
              }`}
            >
              <span>{tab.label}</span>
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#25836F] rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* List of Appointments */}
        {!loading && !loadError && activeTab === "upcoming" && (
          <div className="space-y-4">
            {activeUpcomingList.length === 0 ? (
              <div className="care-card p-12 text-center text-[#577877] space-y-2">
                <span className="material-symbols-outlined text-4xl">calendar_today</span>
                <h3 className="text-base font-bold text-[#162623]">No Upcoming Appointments</h3>
                <p className="text-xs max-w-sm mx-auto">
                  You have no upcoming teleconsultations scheduled. Book an appointment to get started.
                </p>
              </div>
            ) : (
              activeUpcomingList.map((apt, idx) => (
                <div key={`${apt.id || 'apt'}-${idx}`} className="care-card p-6 space-y-4 shadow-sm hover:border-[#25836F]/30">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono text-[#577877]">{apt.displayId}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                          apt.isPendingPayment
                            ? "bg-amber-100 text-amber-900"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {apt.status}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                          apt.isPaid
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-amber-100 text-amber-900"
                        }`}
                      >
                        {apt.paymentStatus}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h3 className="text-base font-bold text-[#162623]">{apt.doctor.name}</h3>
                      <p className="text-xs font-semibold text-[#25836F]">{apt.doctor.specialty}</p>
                      <p className="text-xs text-[#577877]">{apt.reason}</p>
                      <p className="text-xs text-[#162623] font-medium pt-1">
                        🗓️ {apt.dateShort} at {apt.timeRange}
                      </p>
                    </div>

                    <div className="text-right space-y-2">
                      <div className="text-lg font-bold text-[#25836F]">{apt.fee}</div>

                      <div className="flex items-center justify-end gap-2 pt-1 flex-wrap">
                        {apt.isPendingPayment ? (
                          <button
                            type="button"
                            onClick={() => handleCompletePayment(apt)}
                            className="rounded-xl bg-amber-700 px-4 py-2 text-xs font-bold text-white shadow hover:bg-amber-800 cursor-pointer"
                          >
                            Complete Payment ({apt.fee})
                          </button>
                        ) : canJoinAppointment(apt, now) ? (
                          <button
                            type="button"
                            onClick={() => handleJoinWaitingRoom(apt)}
                            className="rounded-xl bg-[#25836F] px-4 py-2 text-xs font-bold text-white shadow hover:bg-[#1d6e5d] cursor-pointer"
                          >
                            Join Video Room
                          </button>
                        ) : (
                          <span className="text-xs text-[#577877]">
                            {["completed", "ended"].includes(apt.rawStatus)
                              ? "Consultation completed."
                              : "Joining is available during the consultation window after payment verification."}
                          </span>
                        )}

                        {!apt.isPendingPayment && !["completed", "ended"].includes(apt.rawStatus) && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenReschedule(apt)}
                              className="btn-secondary !py-2 !px-3.5 text-xs font-semibold cursor-pointer"
                            >
                              Reschedule
                            </button>

                            <button
                              type="button"
                              onClick={() => handleOpenCancel(apt)}
                              className="rounded-xl border border-rose-300 bg-white px-3.5 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer transition"
                            >
                              Cancel Appointment
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {!loading && !loadError && activeTab === "past" && (
          <div className="space-y-4">
            {activePastList.length === 0 ? (
              <div className="care-card p-12 text-center text-[#577877]">
                No past consultation records found.
              </div>
            ) : (
              activePastList.map((apt, idx) => (
                <div
                  key={`${apt.id || 'apt'}-${idx}`}
                  className="care-card p-5 sm:p-6 transition hover:border-[#185A4D]/40 space-y-4 shadow-2xs"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[#F0F5F7] text-[#185A4D] font-bold text-sm flex items-center justify-center shrink-0">
                        {apt.doctor?.initials || "DR"}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-sm text-[#162623]">{apt.doctor?.name}</h4>
                          <span className="font-mono text-[10px] text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded border border-zinc-200">
                            {apt.displayId}
                          </span>
                        </div>
                        <p className="text-xs text-[#577877]">{apt.doctor?.specialty || "General Medicine"}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Completed
                      </span>
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-200">
                        <span className="material-symbols-outlined text-xs">verified</span>
                        {apt.isPaid ? "Paid (Razorpay)" : apt.paymentStatus || "Paid"}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <p className="text-zinc-700 font-medium flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-xs text-zinc-400">calendar_month</span>
                        <span>{apt.dateShort} &bull; {apt.timeRange}</span>
                      </p>
                      <p className="text-zinc-500 text-[11px]">
                        Consultation Fee: <span className="font-bold text-zinc-800">{apt.fee}</span>
                        {apt.reason && <span className="ml-2 text-zinc-400">&bull; {apt.reason}</span>}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenCompletedDetails(apt)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#185A4D] hover:bg-[#13493E] shadow-xs transition active:scale-[0.98] cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-base">shield</span>
                        <span>View Details &amp; Insurance Claim</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {!loading && !loadError && activeTab === "cancelled" && (
          <div className="space-y-4">
            {activeCancelledList.length === 0 ? (
              <div className="care-card p-12 text-center text-[#577877]">
                No cancelled appointments.
              </div>
            ) : (
              activeCancelledList.map((apt, idx) => (
                <div key={`${apt.id || 'apt'}-${idx}`} className="care-card p-6 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-bold text-[#162623]">{apt.doctor.name}</span>
                    <span className="text-red-700 font-bold">Cancelled</span>
                  </div>
                  <p className="text-xs text-[#577877]">{apt.dateShort} • {apt.fee}</p>
                </div>
              ))
            )}
          </div>
        )}

      {/* Reschedule Modal */}
      {rescheduleApt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/20">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-[#F0F5F7] flex items-center justify-center">
                  <span className="material-symbols-outlined !text-[#25836F] text-2xl">update</span>
                </span>
                <div>
                  <h3 className="text-base font-bold text-[#162623]">Reschedule Appointment</h3>
                  <p className="text-xs text-[#577877]">Select a replacement time with {rescheduleApt.doctor.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRescheduleApt(null)}
                className="p-1.5 rounded-lg text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="rounded-xl bg-[#F0F5F7] p-3 text-xs space-y-1 border border-[#577877]/15">
              <p className="text-[#577877]">Current Scheduled Time:</p>
              <p className="font-bold text-[#162623]">🗓️ {rescheduleApt.dateShort} at {rescheduleApt.timeRange}</p>
            </div>

            {rescheduleLoading ? (
              <div className="p-8 text-center text-[#577877] space-y-2">
                <div className="w-8 h-8 border-4 border-[#25836F]/20 border-t-[#25836F] rounded-full animate-spin mx-auto" />
                <p className="text-xs font-semibold">Loading available replacement slots…</p>
              </div>
            ) : rescheduleSlots.length === 0 ? (
              <div className="p-6 text-center text-[#577877] rounded-xl border border-dashed border-[#577877]/30 space-y-1">
                <p className="text-xs font-semibold text-[#162623]">No alternative slots available</p>
                <p className="text-[11px]">There are currently no future open slots for this doctor.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-[#162623]">Choose Available Replacement Slot:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                  {rescheduleSlots.map((slot) => {
                    const startDt = new Date(slot.starts_at);
                    const isSelected = selectedRescheduleSlot?.id === slot.id || selectedRescheduleSlot?.starts_at === slot.starts_at;
                    return (
                      <button
                        key={slot.id || slot.starts_at}
                        type="button"
                        onClick={() => setSelectedRescheduleSlot(slot)}
                        className={`p-3 rounded-xl border text-left text-xs transition cursor-pointer ${
                          isSelected
                            ? "border-[#25836F] bg-[#25836F]/10 text-[#185A4D] font-bold ring-2 ring-[#25836F]/30"
                            : "border-[#577877]/20 bg-white hover:border-[#25836F]/50"
                        }`}
                      >
                        <p className="font-semibold text-[#162623]">
                          {startDt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                        </p>
                        <p className="text-[11px] text-[#577877] mt-0.5">
                          {startDt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {selectedRescheduleSlot && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base text-emerald-700">check_circle</span>
                  Rescheduling Confirmation
                </p>
                <p className="text-[11px] text-emerald-800 leading-relaxed">
                  Your appointment will be rescheduled to{" "}
                  <strong>{new Date(selectedRescheduleSlot.starts_at).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" })} at {new Date(selectedRescheduleSlot.starts_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</strong>.
                  Your current slot will be released back to the clinic.
                </p>
              </div>
            )}

            {rescheduleError && (
              <p className="text-xs font-semibold text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                {rescheduleError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-[#577877]/20">
              <button
                type="button"
                onClick={() => setRescheduleApt(null)}
                className="btn-secondary !py-2.5 !px-4 text-xs font-semibold cursor-pointer"
                disabled={rescheduleSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReschedule}
                disabled={!selectedRescheduleSlot || rescheduleSubmitting}
                className="btn-primary !py-2.5 !px-5 text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {rescheduleSubmitting ? "Rescheduling…" : "Confirm Reschedule"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Appointment Modal */}
      {cancelApt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/20">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-2xl font-bold">cancel</span>
                </span>
                <div>
                  <h3 className="text-base font-bold text-[#162623]">Cancel Appointment</h3>
                  <p className="text-xs text-[#577877]">Review cancellation policy &amp; refund terms</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCancelApt(null)}
                className="p-1.5 rounded-lg text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="rounded-xl bg-[#F0F5F7] p-3 text-xs space-y-1.5 border border-[#577877]/15">
              <div className="flex justify-between">
                <span className="text-[#577877]">Doctor:</span>
                <span className="font-bold text-[#162623]">{cancelApt.doctor.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Scheduled For:</span>
                <span className="font-semibold text-[#162623]">{cancelApt.dateShort} at {cancelApt.timeRange}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Consultation Fee:</span>
                <span className="font-semibold text-[#162623]">{cancelApt.fee}</span>
              </div>
            </div>

            {/* Cancellation Policy Disclosure & Refund Eligibility */}
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-amber-900 text-xs space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-amber-950">
                <span className="material-symbols-outlined text-base text-amber-700">policy</span>
                Cancellation &amp; Refund Policy
              </div>
              <p className="text-[11px] leading-relaxed text-amber-900">
                Appointments cancelled at least 2 hours prior to consultation time are eligible for a 100% refund.
                Refunds are processed automatically via Razorpay to the original payment source within 5–7 business days.
              </p>
              <div className="pt-1 flex items-center gap-2 font-bold text-[11px]">
                <span className="text-[#577877]">Refund Status:</span>
                {cancelApt.isPaid ? (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px]">
                    ✓ Eligible for 100% Refund ({cancelApt.fee})
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[#577877] text-[10px]">
                    No Payment Charged
                  </span>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#162623] block">
                Reason for cancellation (optional):
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Schedule conflict, feeling better, personal reasons"
                className="w-full rounded-xl border border-[#577877]/30 px-3 py-2 text-xs text-[#162623] focus:border-[#25836F] focus:outline-none"
              />
            </div>

            {cancelError && (
              <p className="text-xs font-semibold text-rose-600 bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                {cancelError}
              </p>
            )}

            <div className="flex justify-end gap-3 pt-3 border-t border-[#577877]/20">
              <button
                type="button"
                onClick={() => setCancelApt(null)}
                className="btn-secondary !py-2.5 !px-4 text-xs font-semibold cursor-pointer"
                disabled={cancelSubmitting}
              >
                Keep Appointment
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={cancelSubmitting}
                className="rounded-xl bg-rose-600 px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-rose-700 cursor-pointer disabled:opacity-50 transition"
              >
                {cancelSubmitting ? "Cancelling…" : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CHECKPOINT 4: COMPLETED APPOINTMENT DETAILS & INSURANCE CLAIM MODAL        */}
      {/* ========================================================================= */}
      {selectedCompletedApt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-white border border-[#577877]/20 shadow-2xl my-8 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50/70 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-xl bg-[#F0F5F7] text-[#185A4D] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl">shield</span>
                </span>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-[#162623] truncate">
                    Completed Appointment Details
                  </h3>
                  <p className="text-xs text-[#577877] truncate">
                    {selectedCompletedApt.doctor?.name} &bull; {selectedCompletedApt.displayId}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCompletedApt(null)}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Modal Scrollable Content */}
            <div className="p-6 space-y-6 overflow-y-auto text-xs sm:text-sm">
              {/* Section 1: Encounter & Invoicing Summary */}
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
                    Encounter &amp; Payment Breakdown
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                    ✓ Completed Visit
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Doctor</span>
                    <span className="font-semibold text-zinc-900">{selectedCompletedApt.doctor?.name}</span>
                    <span className="text-zinc-500 block text-[11px]">{selectedCompletedApt.doctor?.specialty}</span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Date &amp; Time</span>
                    <span className="font-medium text-zinc-800">
                      {selectedCompletedApt.dateShort} at {selectedCompletedApt.timeRange}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Actual Consultation Fee</span>
                    <span className="text-base font-bold text-[#185A4D]">
                      {claimEligibility?.consultation_fee || selectedCompletedApt.fee}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-400 block text-[11px]">Payment Status</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      <span className="material-symbols-outlined text-xs">verified</span>
                      <span>Paid via Razorpay</span>
                      {claimEligibility?.razorpay_payment_id && (
                        <span className="font-mono text-[10px] text-zinc-500 ml-1">
                          ({claimEligibility.razorpay_payment_id})
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Clinical Documentation Badges */}
                <div className="pt-2 border-t border-zinc-200 flex items-center justify-between flex-wrap gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500">Summary:</span>
                    {claimEligibility?.summary_finalized ? (
                      <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 text-[11px]">
                        <span className="material-symbols-outlined text-xs">check_circle</span>
                        Finalized by Doctor
                      </span>
                    ) : (
                      <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[11px]">
                        Pending Clinician Sign-off
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500">Prescription:</span>
                    {claimEligibility?.prescription_required ? (
                      claimEligibility.prescription_verified ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 text-[11px]">
                          <span className="material-symbols-outlined text-xs">check_circle</span>
                          Released
                        </span>
                      ) : (
                        <span className="text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[11px]">
                          Pending Release
                        </span>
                      )
                    ) : (
                      <span className="text-zinc-600 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200 text-[11px]">
                        Medically Not Required
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* ================================================================= */}
              {/* CHECKPOINT 5: CLAIM SUPPORTING DOCUMENTS SECTION                   */}
              {/* ================================================================= */}
              <div className="p-4 rounded-xl border border-[#25836F]/25 bg-white space-y-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-100">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-[#F0F5F7] text-[#185A4D] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-lg">folder_shared</span>
                    </span>
                    <div>
                      <h4 className="font-bold text-sm text-[#185A4D]">
                        Claim Supporting Documents
                      </h4>
                      <p className="text-[11px] text-[#577877]">
                        Auto-collected clinical records, financial receipts, and verified policy credentials
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-[#185A4D] bg-[#F0F5F7] px-2.5 py-1 rounded-lg">
                      Paid: {claimDossier?.paid_amount || claimEligibility?.consultation_fee || selectedCompletedApt.fee}
                    </span>
                  </div>
                </div>

                {/* Dossier Loading State */}
                {dossierLoading ? (
                  <div className="p-6 text-center text-[#577877] space-y-2 bg-[#F0F5F7]/40 rounded-xl">
                    <div className="w-5 h-5 border-2 border-[#185A4D]/20 border-t-[#185A4D] rounded-full animate-spin mx-auto" />
                    <p className="text-xs font-semibold">Collecting verified documents from medical & financial records...</p>
                  </div>
                ) : dossierError ? (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex justify-between items-center">
                    <span>{dossierError}</span>
                    <button
                      type="button"
                      onClick={() => loadDossier(selectedCompletedApt.id, selectedPolicyId)}
                      className="underline font-bold hover:text-red-900 cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                ) : claimDossier ? (
                  <div className="space-y-3">
                    {/* Mandatory Documents Completeness Banner */}
                    {claimDossier.mandatory_complete ? (
                      <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center gap-2">
                        <span className="material-symbols-outlined text-emerald-600 text-lg shrink-0">check_circle</span>
                        <div className="min-w-0">
                          <span className="font-bold block">All Mandatory Documents Collected ({claimDossier.total_documents_collected} items)</span>
                          <span className="text-[11px] text-emerald-700">Clinical summaries, verified invoices, and policy records are ready.</span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-amber-600 text-lg shrink-0">warning</span>
                          <span className="font-bold">Missing Mandatory Documents ({claimDossier.missing_mandatory_count})</span>
                        </div>
                        <p className="text-[11px] text-amber-800">
                          The following required records must be resolved before filing for reimbursement:
                        </p>
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {claimDossier.missing_mandatory_titles?.map((t, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-semibold text-[10px]">
                              <span className="material-symbols-outlined text-xs">error</span>
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Auto-Collected Documents List */}
                    <div className="space-y-2">
                      {claimDossier.documents?.map((docItem) => {
                        const isAvailable = docItem.status === "Available";
                        const isMissing = docItem.status === "Missing";
                        const isNA = docItem.status === "Not Applicable";
                        const isSupporting = docItem.category === "supporting_document";

                        return (
                          <div
                            key={docItem.id}
                            className={`p-3 rounded-xl border transition-all ${
                              isAvailable
                                ? "bg-white border-zinc-200 hover:border-[#25836F]/40"
                                : isMissing
                                ? "bg-amber-50/40 border-amber-200/80"
                                : "bg-zinc-50 border-zinc-200 text-zinc-500"
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                              {/* Left icon and details */}
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                  isAvailable
                                    ? "bg-[#F0F5F7] text-[#185A4D]"
                                    : isMissing
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-zinc-100 text-zinc-400"
                                }`}>
                                  <span className="material-symbols-outlined text-lg">
                                    {docItem.category === "patient_profile"
                                      ? "person"
                                      : docItem.category === "insurance_policy"
                                      ? "verified_user"
                                      : docItem.category === "insurance_card"
                                      ? "badge"
                                      : docItem.category === "prescription"
                                      ? "prescriptions"
                                      : docItem.category === "consultation_summary"
                                      ? "clinical_notes"
                                      : docItem.category === "consultation_invoice"
                                      ? "receipt_long"
                                      : docItem.category === "payment_receipt"
                                      ? "payments"
                                      : "attach_file"}
                                  </span>
                                </span>

                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h5 className="font-bold text-xs text-zinc-900 truncate">
                                      {docItem.title}
                                    </h5>
                                    {docItem.is_mandatory ? (
                                      <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-100">
                                        Mandatory
                                      </span>
                                    ) : (
                                      <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-zinc-100 text-zinc-600">
                                        Optional
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-zinc-600 line-clamp-1">
                                    {docItem.description}
                                  </p>
                                  {docItem.details && (
                                    <p className="text-[10px] text-zinc-500 font-mono">
                                      {docItem.details}
                                    </p>
                                  )}
                                </div>
                              </div>

                              {/* Right status badge & actions */}
                              <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                                {/* Status Badge */}
                                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                                  isAvailable
                                    ? "bg-emerald-100 text-emerald-800"
                                    : isMissing
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-zinc-200 text-zinc-600"
                                }`}>
                                  <span className="material-symbols-outlined text-xs">
                                    {isAvailable ? "check_circle" : isMissing ? "cancel" : "remove_circle_outline"}
                                  </span>
                                  <span>{docItem.status}</span>
                                </span>

                                {/* Preview Button */}
                                {isAvailable && (docItem.preview_url || docItem.category === "consultation_invoice" || docItem.category === "payment_receipt" || docItem.category === "insurance_card" || isSupporting) && (
                                  <button
                                    type="button"
                                    onClick={() => handlePreviewDossierDoc(docItem)}
                                    className="px-2.5 py-1 text-[11px] font-semibold text-[#185A4D] bg-[#F0F5F7] hover:bg-[#e0ecef] rounded-lg transition inline-flex items-center gap-1 cursor-pointer"
                                    title="Inline Preview"
                                  >
                                    <span className="material-symbols-outlined text-xs">visibility</span>
                                    <span>Preview</span>
                                  </button>
                                )}

                                {/* Download Button */}
                                {isAvailable && (docItem.download_url || docItem.category === "consultation_invoice" || docItem.category === "payment_receipt" || docItem.category === "insurance_card" || isSupporting) && (
                                  <button
                                    type="button"
                                    onClick={() => handleDownloadDossierDoc(docItem)}
                                    className="px-2.5 py-1 text-[11px] font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition inline-flex items-center gap-1 cursor-pointer"
                                    title="Download Document"
                                  >
                                    <span className="material-symbols-outlined text-xs">download</span>
                                    <span>Download</span>
                                  </button>
                                )}

                                {/* Delete Supporting Doc Button */}
                                {isSupporting && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteSupportingDoc(docItem.id)}
                                    className="p-1 text-zinc-400 hover:text-red-600 rounded hover:bg-red-50 transition cursor-pointer"
                                    title="Remove supporting document"
                                  >
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Additional Supporting Document Upload Box */}
                    <div className="p-3.5 rounded-xl bg-zinc-50/80 border border-dashed border-zinc-300 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[#185A4D] text-base">upload_file</span>
                          Attach Additional Supporting Document
                        </span>
                        <span className="text-[10px] text-zinc-500 font-medium">
                          PDF, JPG, PNG &bull; Max 10 MB
                        </span>
                      </div>

                      {supportingUploadError && (
                        <div className="p-2 rounded-lg bg-red-50 text-red-700 text-xs border border-red-100">
                          {supportingUploadError}
                        </div>
                      )}

                      <form onSubmit={handleSupportingUpload} className="space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={supportingTitle}
                            onChange={(e) => setSupportingTitle(e.target.value)}
                            placeholder="Document Title (e.g. Lab Report / Scan)"
                            className="px-3 py-1.5 text-xs rounded-xl border border-zinc-300 bg-white focus:outline-none focus:ring-1 focus:ring-[#185A4D]"
                          />
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => setSupportingFile(e.target.files?.[0] || null)}
                            className="text-xs file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-[11px] file:font-bold file:bg-[#185A4D] file:text-white file:cursor-pointer text-zinc-600 cursor-pointer"
                          />
                        </div>

                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={supportingUploading || !supportingFile}
                            className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#185A4D] hover:bg-[#13493E] rounded-xl shadow-2xs transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 cursor-pointer"
                          >
                            {supportingUploading && (
                              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            )}
                            <span>+ Upload Document</span>
                          </button>
                        </div>
                      </form>
                    </div>

                    {/* Privacy & Regulatory Isolation Disclosure */}
                    <div className="p-2.5 rounded-lg bg-[#F0F5F7] border border-[#25836F]/20 text-[11px] text-[#185A4D] leading-relaxed flex items-start gap-2">
                      <span className="material-symbols-outlined text-sm mt-0.5 shrink-0 text-[#25836F]">lock</span>
                      <div>
                        <span className="font-semibold">Privacy &amp; Appointment Isolation: </span>
                        All documents in this claim dossier are strictly bound to encounter {selectedCompletedApt.displayId}. Records are neither duplicated nor transmitted to insurance third parties without your final submission confirmation.
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* ================================================================= */}
              {/* CHECKPOINT 6: INSURANCE DATA SHARING CONSENT SECTION              */}
              {/* ================================================================= */}
              <div className="p-4 rounded-xl border border-[#25836F]/25 bg-white space-y-4 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-zinc-100">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-lg bg-[#F0F5F7] text-[#185A4D] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-lg">policy</span>
                    </span>
                    <div>
                      <h4 className="font-bold text-sm text-[#185A4D]">
                        Insurance Data Sharing Consent
                      </h4>
                      <p className="text-[11px] text-[#577877]">
                        Explicit patient authorization required before transmitting health &amp; financial records
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  {claimConsent && (
                    <div className="flex items-center gap-1.5 self-start sm:self-auto">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${
                        claimConsent.is_granted && !claimConsent.requires_renewal
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : claimConsent.requires_renewal
                          ? "bg-amber-100 text-amber-800 border border-amber-200"
                          : claimConsent.status === "withdrawn"
                          ? "bg-rose-100 text-rose-800 border border-rose-200"
                          : "bg-zinc-100 text-zinc-700 border border-zinc-200"
                      }`}>
                        <span className="material-symbols-outlined text-xs">
                          {claimConsent.is_granted && !claimConsent.requires_renewal
                            ? "check_circle"
                            : claimConsent.requires_renewal
                            ? "sync_problem"
                            : claimConsent.status === "withdrawn"
                            ? "cancel"
                            : "radio_button_unchecked"}
                        </span>
                        <span>
                          {claimConsent.is_granted && !claimConsent.requires_renewal
                            ? "Consent Granted"
                            : claimConsent.requires_renewal
                            ? "Renewal Required"
                            : claimConsent.status === "withdrawn"
                            ? "Consent Withdrawn"
                            : "Consent Pending"}
                        </span>
                      </span>
                    </div>
                  )}
                </div>

                {consentLoading ? (
                  <div className="p-5 text-center text-[#577877] space-y-2 bg-[#F0F5F7]/40 rounded-xl">
                    <div className="w-5 h-5 border-2 border-[#185A4D]/20 border-t-[#185A4D] rounded-full animate-spin mx-auto" />
                    <p className="text-xs font-semibold">Verifying claim-specific consent authorization record...</p>
                  </div>
                ) : consentError ? (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex justify-between items-center">
                    <span>{consentError}</span>
                    <button
                      type="button"
                      onClick={() => loadClaimConsent(selectedCompletedApt.id, selectedPolicyId)}
                      className="underline font-bold hover:text-red-900 cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3.5">
                    {/* Renewal Alert if applicable */}
                    {claimConsent?.requires_renewal && (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2.5">
                        <span className="material-symbols-outlined text-amber-600 text-base mt-0.5 shrink-0">warning</span>
                        <div className="space-y-0.5">
                          <p className="font-bold">Consent Renewal Required</p>
                          <p className="text-[11px] text-amber-800">
                            {claimConsent.renewal_reason || "The recipient insurance provider or authorized document dossier has changed since your last consent. Please review the updated scope and re-authorize below."}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Selected Provider & Authorized Scope Card */}
                    <div className="p-3.5 rounded-xl bg-[#F0F5F7]/60 border border-[#25836F]/20 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                        <span className="font-semibold text-zinc-700">Designated Insurance Recipient:</span>
                        <span className="font-bold text-[#185A4D] bg-white px-2.5 py-0.5 rounded-md border border-[#25836F]/20 shadow-2xs">
                          {claimConsent?.provider_name || (() => {
                            const p = patientPolicies.find((pol) => pol.id === selectedPolicyId);
                            return p?.provider_name || "Select an active policy below";
                          })()}
                        </span>
                      </div>

                      {/* Documents Intended for Sharing */}
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[11px] font-semibold text-zinc-600 block">
                          Documents Included in Data Sharing Scope ({claimConsent?.authorized_documents?.length || 0}):
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {claimConsent?.authorized_documents && claimConsent.authorized_documents.length > 0 ? (
                            claimConsent.authorized_documents.map((doc) => (
                              <span
                                key={doc.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white border border-zinc-200 text-[10px] text-zinc-700 font-medium"
                              >
                                <span className="material-symbols-outlined text-xs text-[#25836F]">description</span>
                                {doc.title}
                              </span>
                            ))
                          ) : (
                            <span className="text-[11px] text-zinc-500 italic">
                              Documents from verified dossier will be attached upon policy selection.
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Purpose explanation */}
                      <p className="text-[11px] text-[#577877] leading-relaxed pt-1 border-t border-[#25836F]/10">
                        <strong className="text-zinc-700">Purpose of Disclosure: </strong>
                        To facilitate verification, adjudication, and reimbursement claim settlement by your designated insurer or Third Party Administrator (TPA). Records are strictly isolated to this encounter and are never shared without explicit consent.
                      </p>
                    </div>

                    {/* Consent Statement Box with UNCHECKED Checkbox */}
                    <div className="p-3.5 rounded-xl border border-zinc-200 bg-white space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-zinc-900 flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-[#185A4D] text-base">verified</span>
                          Patient Authorization Declaration
                        </span>
                        <button
                          type="button"
                          onClick={handleOpenReviewConsent}
                          className="text-[11px] font-semibold text-[#185A4D] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-xs">open_in_new</span>
                          Review Full Consent Document
                        </button>
                      </div>

                      {consentActionError && (
                        <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                          {consentActionError}
                        </div>
                      )}

                      {/* Explicit Consent Checkbox (Strict: NEVER preselected) */}
                      <label className="flex items-start gap-2.5 p-2 rounded-lg hover:bg-zinc-50 transition cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={consentChecked}
                          disabled={consentSubmitting || (claimConsent?.is_granted && !claimConsent?.requires_renewal)}
                          onChange={(e) => {
                            setConsentChecked(e.target.checked);
                            if (consentActionError) setConsentActionError("");
                          }}
                          className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-[#185A4D] focus:ring-[#185A4D] cursor-pointer"
                        />
                        <span className="text-xs text-zinc-800 leading-relaxed font-normal">
                          &ldquo;I authorize Kaizen Care to share the selected clinical records, insurance details and payment documents with my selected insurance provider or authorized TPA for processing this reimbursement claim. I understand that claim approval and reimbursement are subject to my insurance policy terms.&rdquo;
                        </span>
                      </label>

                      {/* Acceptance status and action buttons */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-zinc-100 text-xs">
                        {claimConsent?.is_granted && !claimConsent?.requires_renewal ? (
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <span className="text-[11px] text-emerald-800 font-medium flex items-center gap-1">
                              <span className="material-symbols-outlined text-xs text-emerald-600">event_available</span>
                              Accepted on: <strong className="font-mono">{claimConsent.accepted_at}</strong>
                            </span>
                            <span className="text-[10px] text-zinc-400 font-mono">
                              v{claimConsent.consent_version}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-amber-800 font-medium flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs text-amber-600">lock</span>
                            Consent must be granted prior to claim submission.
                          </span>
                        )}

                        <div className="flex items-center gap-2 self-end sm:self-auto">
                          {claimConsent?.is_granted && !claimConsent?.requires_renewal ? (
                            <button
                              type="button"
                              onClick={handleWithdrawConsent}
                              disabled={consentSubmitting}
                              className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition cursor-pointer flex items-center gap-1 disabled:opacity-50"
                            >
                              {consentSubmitting && (
                                <span className="w-3 h-3 border-2 border-rose-700/30 border-t-rose-700 rounded-full animate-spin" />
                              )}
                              <span className="material-symbols-outlined text-xs">cancel</span>
                              <span>Withdraw Consent</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={handleGrantConsent}
                              disabled={!consentChecked || consentSubmitting}
                              className="px-4 py-1.5 text-xs font-bold text-white bg-[#185A4D] hover:bg-[#13493E] rounded-xl shadow-2xs transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {consentSubmitting && (
                                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              )}
                              <span className="material-symbols-outlined text-xs">check_circle</span>
                              <span>{claimConsent?.requires_renewal ? "Renew & Authorize Consent" : "Grant & Authorize Consent"}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: Post-Consultation Insurance Claim */}
              <div className="p-4 rounded-xl border border-[#25836F]/25 bg-white space-y-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#185A4D] text-lg">receipt_long</span>
                    <h4 className="font-bold text-sm text-[#185A4D]">
                      Post-Consultation Insurance Claim
                    </h4>
                  </div>
                  <span className="text-[11px] font-semibold text-[#185A4D] bg-[#F0F5F7] px-2 py-0.5 rounded">
                    Optional Reimbursement
                  </span>
                </div>

                <p className="text-xs text-[#577877] leading-relaxed">
                  Appointments are self-paid and confirmed immediately without pre-authorization delays.
                  You can now submit an optional claim for reimbursement using your verified clinical records.
                </p>

                {/* Loading state for prerequisite checks */}
                {eligibilityLoading ? (
                  <div className="p-6 text-center text-[#577877] space-y-2 bg-[#F0F5F7]/50 rounded-xl">
                    <div className="w-6 h-6 border-2 border-[#185A4D]/20 border-t-[#185A4D] rounded-full animate-spin mx-auto" />
                    <p className="text-xs font-semibold">Evaluating claim prerequisites with backend...</p>
                  </div>
                ) : eligibilityError ? (
                  <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
                    <span>{eligibilityError}</span>
                    <button
                      type="button"
                      onClick={() => handleOpenCompletedDetails(selectedCompletedApt)}
                      className="underline font-bold hover:text-red-900 cursor-pointer"
                    >
                      Retry
                    </button>
                  </div>
                ) : claimEligibility && (
                  <div className="space-y-3">
                    {/* Prerequisite Checklist Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {claimEligibility.prerequisites?.map((prereq) => (
                        <div
                          key={prereq.key}
                          className={`p-2.5 rounded-xl border flex items-start gap-2 ${
                            prereq.passed
                              ? "bg-emerald-50/50 border-emerald-200 text-emerald-900"
                              : "bg-amber-50/60 border-amber-200 text-amber-900"
                          }`}
                        >
                          <span className={`material-symbols-outlined text-base shrink-0 mt-0.5 ${
                            prereq.passed ? "text-emerald-600" : "text-amber-600"
                          }`}>
                            {prereq.passed ? "check_circle" : "cancel"}
                          </span>
                          <div className="min-w-0">
                            <span className="font-bold block text-[11px]">{prereq.title}</span>
                            <span className="text-[11px] text-zinc-600">{prereq.message}</span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Duplicate Active Claim Alert */}
                    {claimEligibility.has_active_claim && (
                      <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-sky-900 text-xs flex items-start gap-2.5">
                        <span className="material-symbols-outlined text-sky-700 text-base mt-0.5">verified</span>
                        <div className="space-y-0.5">
                          <p className="font-bold">Active Claim Already Initiated</p>
                          <p className="text-[11px] text-sky-800">
                            Claim reference <span className="font-mono font-bold">{claimEligibility.existing_claim_id}</span> has already been initiated for this appointment. Duplicate active claims are prohibited.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Unmet Prerequisites Alert */}
                    {!claimEligibility.is_eligible && !claimEligibility.has_active_claim && (
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                        <p className="font-bold flex items-center gap-1.5 text-amber-950">
                          <span className="material-symbols-outlined text-sm text-amber-600">info</span>
                          Prerequisites Incomplete for Insurance Claim
                        </p>
                        <ul className="list-disc list-inside text-[11px] text-amber-800 space-y-0.5">
                          {claimEligibility.unmet_prerequisites?.map((msg, i) => (
                            <li key={i}>{msg}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Eligible Callout & Request Button */}
                    {claimEligibility.is_eligible && !showClaimForm && (
                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                        <div className="space-y-0.5">
                          <p className="font-bold text-emerald-950 flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm text-emerald-600">verified</span>
                            Consultation is Claim-Eligible
                          </p>
                          <p className="text-[11px] text-emerald-800">
                            Payment verified, consultation completed, and clinical records signed.
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => setShowClaimForm(true)}
                          className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#185A4D] hover:bg-[#13493E] transition shadow-xs cursor-pointer shrink-0 self-start sm:self-auto flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-base">receipt_long</span>
                          <span>Request Insurance Claim</span>
                        </button>
                      </div>
                    )}

                    {/* Claim Preparation & Policy Selection Form */}
                    {showClaimForm && (
                      <div className="p-4 rounded-xl bg-zinc-50 border border-[#25836F]/30 space-y-4 animate-in fade-in duration-200">
                        <div className="flex items-center justify-between pb-2 border-b border-zinc-200">
                          <h5 className="font-bold text-xs text-zinc-900 uppercase tracking-wider">
                            Select Health Insurance Policy
                          </h5>
                          <span className="font-bold text-xs text-[#185A4D]">
                            Claim Amount: {claimEligibility.consultation_fee}
                          </span>
                        </div>

                        {claimInitiateError && (
                          <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                            {claimInitiateError}
                          </div>
                        )}

                        {patientPolicies.length === 0 ? (
                          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2 text-center text-xs">
                            <p className="font-semibold text-amber-900">
                              No active health insurance policy found on your account.
                            </p>
                            <p className="text-[11px] text-amber-700">
                              Please register your insurance policy and upload your card before submitting a reimbursement claim.
                            </p>
                            <button
                              type="button"
                              onClick={() => setShowQuickAddPolicy(true)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#185A4D] rounded-xl hover:bg-[#13493E] shadow-xs cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-sm">add_circle</span>
                              <span>+ Add Insurance Policy</span>
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3">
                            <div className="space-y-1">
                              <label className="block text-xs font-semibold text-zinc-700">
                                Choose Policy <span className="text-red-500">*</span>
                              </label>
                              <select
                                value={selectedPolicyId}
                                onChange={(e) => handlePolicyChange(e.target.value)}
                                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D] bg-white cursor-pointer"
                              >
                                {patientPolicies.map((pol) => (
                                  <option key={pol.id} value={pol.id}>
                                    {pol.provider_name} ({pol.policy_number_masked}) &bull; Exp: {pol.expiry_date || "N/A"}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Selected Policy Card Preview */}
                            {selectedPolicyId && (() => {
                              const sel = patientPolicies.find((p) => p.id === selectedPolicyId);
                              if (!sel) return null;
                              return (
                                <div className="p-3 rounded-lg bg-white border border-zinc-200 text-xs space-y-1">
                                  <div className="flex justify-between font-bold text-zinc-800">
                                    <span>{sel.provider_name}</span>
                                    <span className="font-mono text-zinc-600">{sel.policy_number_masked}</span>
                                  </div>
                                  <p className="text-[11px] text-zinc-500">
                                    Policyholder: {sel.policy_holder_name} ({sel.relationship || "Self"}) &bull; Valid to {sel.expiry_date}
                                  </p>
                                </div>
                              );
                            })()}

                            <div className="space-y-1">
                              <label className="block text-xs font-semibold text-zinc-700">
                                Claim Remarks / Additional Notes <span className="text-zinc-400 font-normal">(Optional)</span>
                              </label>
                              <input
                                type="text"
                                value={claimNotes}
                                onChange={(e) => setClaimNotes(e.target.value)}
                                placeholder="e.g. Follow-up consultation fee reimbursement request"
                                className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D]"
                              />
                            </div>

                            {/* ======================================================= */}
                            {/* CHECKPOINT 7: REVIEW & SUBMIT CLAIM SECTION             */}
                            {/* ======================================================= */}
                            <div className="p-4 rounded-xl border border-zinc-200 bg-white space-y-3">
                              <h6 className="font-bold text-xs text-[#185A4D] uppercase tracking-wider flex items-center gap-1.5">
                                <span className="material-symbols-outlined text-sm">fact_check</span>
                                Review Claim Information Before Submission
                              </h6>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px] bg-zinc-50 p-3 rounded-xl border border-zinc-200">
                                <div>
                                  <span className="text-zinc-500 block">Patient / Policyholder:</span>
                                  <span className="font-semibold text-zinc-800">
                                    {selectedPolicyId ? patientPolicies.find(p => p.id === selectedPolicyId)?.policy_holder_name : "N/A"}
                                    {" "}({selectedPolicyId ? patientPolicies.find(p => p.id === selectedPolicyId)?.relationship : "Self"})
                                  </span>
                                </div>
                                <div>
                                  <span className="text-zinc-500 block">Selected Insurer:</span>
                                  <span className="font-semibold text-zinc-800">
                                    {selectedPolicyId ? patientPolicies.find(p => p.id === selectedPolicyId)?.provider_name : "None selected"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-zinc-500 block">Appointment Reference:</span>
                                  <span className="font-semibold text-zinc-800 font-mono">
                                    {selectedCompletedApt.displayId} ({selectedCompletedApt.doctor?.name})
                                  </span>
                                </div>
                                <div>
                                  <span className="text-zinc-500 block">Consultation Fee (Actual Paid):</span>
                                  <span className="font-bold text-[#185A4D]">
                                    {claimDossier?.paid_amount || claimEligibility.consultation_fee || selectedCompletedApt.fee}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-zinc-500 block">Supporting Documents:</span>
                                  <span className="font-semibold text-zinc-800 flex items-center gap-1">
                                    <span className="material-symbols-outlined text-xs text-[#185A4D]">attach_file</span>
                                    {claimDossier?.total_documents_collected || 0} collected
                                    {claimDossier?.mandatory_complete ? " (Mandatory Complete)" : " (Missing items)"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-zinc-500 block">Data Sharing Consent:</span>
                                  <span className="font-semibold text-zinc-800 flex items-center gap-1">
                                    <span className={`material-symbols-outlined text-xs ${
                                      claimConsent?.is_granted && !claimConsent?.requires_renewal ? "text-emerald-600" : "text-amber-600"
                                    }`}>
                                      {claimConsent?.is_granted && !claimConsent?.requires_renewal ? "verified" : "error"}
                                    </span>
                                    {claimConsent?.is_granted && !claimConsent?.requires_renewal ? "Explicitly Granted" : "Not Authorized / Renewal Needed"}
                                  </span>
                                </div>
                              </div>

                              <div className="p-2.5 rounded-lg bg-sky-50 text-[11px] text-sky-900 border border-sky-100 flex items-start gap-2">
                                <span className="material-symbols-outlined text-sm mt-0.5 shrink-0 text-sky-700">security</span>
                                <div>
                                  <strong>Clinic Admin Verification Workflow: </strong>
                                  Submitting this claim queues your records for review by the Kaizen Care Clinic Administration. It is not transmitted directly to the insurer until internal clinical and financial validation is finalized.
                                </div>
                              </div>
                            </div>

                            {/* Checkpoint 7 Gating Alerts */}
                            {(!claimDossier?.mandatory_complete || !claimConsent?.is_granted || claimConsent?.requires_renewal) && (
                              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                                <span className="font-bold block text-[11px] flex items-center gap-1.5">
                                  <span className="material-symbols-outlined text-sm text-amber-600">lock</span>
                                  Submission Disabled Until Prerequisites are Satisfied:
                                </span>
                                <ul className="list-disc list-inside text-[11px] text-amber-800 space-y-0.5 pl-1">
                                  {!claimDossier?.mandatory_complete && (
                                    <li>Mandatory clinical &amp; payment documents are incomplete ({claimDossier?.missing_mandatory_count || 0} missing).</li>
                                  )}
                                  {(!claimConsent?.is_granted || claimConsent?.requires_renewal) && (
                                    <li>Explicit patient Data Sharing Consent must be granted and authorized above.</li>
                                  )}
                                </ul>
                              </div>
                            )}

                            {/* Action Buttons: Save as Draft & Submit Claim */}
                            <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-2 border-t border-zinc-200">
                              <button
                                type="button"
                                onClick={() => setShowClaimForm(false)}
                                disabled={claimSubmittingMode !== null}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-600 hover:bg-zinc-200/60 cursor-pointer self-start sm:self-auto"
                              >
                                Close Form
                              </button>

                              <div className="flex items-center gap-2 self-end sm:self-auto">
                                <button
                                  type="button"
                                  onClick={() => handleClaimSubmitOrDraft(true)}
                                  disabled={claimSubmittingMode !== null}
                                  className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                                >
                                  {claimSubmittingMode === "draft" && (
                                    <span className="w-3.5 h-3.5 border-2 border-zinc-400 border-t-zinc-700 rounded-full animate-spin" />
                                  )}
                                  <span className="material-symbols-outlined text-xs">save</span>
                                  <span>Save as Draft</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleClaimSubmitOrDraft(false)}
                                  disabled={
                                    claimSubmittingMode !== null ||
                                    !claimDossier?.mandatory_complete ||
                                    !claimConsent?.is_granted ||
                                    claimConsent?.requires_renewal
                                  }
                                  className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-[#185A4D] hover:bg-[#13493E] shadow-sm transition cursor-pointer flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                                  title={
                                    !claimDossier?.mandatory_complete || !claimConsent?.is_granted || claimConsent?.requires_renewal
                                      ? "Complete mandatory records and grant consent to enable submission"
                                      : "Submit claim for Clinic Admin verification"
                                  }
                                >
                                  {claimSubmittingMode === "submit" && (
                                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                  )}
                                  <span className="material-symbols-outlined text-xs">send</span>
                                  <span>Submit Claim</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end px-6 py-4 bg-zinc-50 border-t border-zinc-200 shrink-0">
              <button
                type="button"
                onClick={() => setSelectedCompletedApt(null)}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#185A4D] hover:bg-[#13493E] rounded-xl shadow-xs transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QUICK ADD POLICY MODAL (WHEN PATIENT HAS NO POLICY ON FILE) */}
      {showQuickAddPolicy && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-[#162623]/70 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-zinc-200 shadow-2xl p-6 space-y-4 my-8">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-200">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#185A4D] text-xl">add_circle</span>
                <h4 className="font-bold text-sm text-zinc-900">Add Insurance Policy</h4>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickAddPolicy(false)}
                className="text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleQuickAddPolicySubmit} className="space-y-3 text-xs">
              {quickAddError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                  {quickAddError}
                </div>
              )}

              <div className="space-y-1">
                <label className="block font-semibold text-zinc-700">
                  Insurance Provider <span className="text-red-500">*</span>
                </label>
                <select
                  value={quickAddForm.provider_id}
                  onChange={(e) => setQuickAddForm({ ...quickAddForm, provider_id: e.target.value })}
                  required
                  className="w-full px-3 py-2 rounded-xl border border-zinc-300 focus:outline-none focus:border-[#185A4D] bg-white"
                >
                  <option value="">-- Select Active Provider --</option>
                  {activeMasterProviders.map((prov) => (
                    <option key={prov.id} value={prov.id}>
                      {prov.provider_name} ({prov.provider_code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block font-semibold text-zinc-700">Policy Number *</label>
                  <input
                    type="text"
                    value={quickAddForm.policy_number}
                    onChange={(e) => setQuickAddForm({ ...quickAddForm, policy_number: e.target.value })}
                    required
                    className="w-full px-3 py-1.5 rounded-xl border border-zinc-300 focus:border-[#185A4D]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-semibold text-zinc-700">Policyholder Name *</label>
                  <input
                    type="text"
                    value={quickAddForm.policy_holder_name}
                    onChange={(e) => setQuickAddForm({ ...quickAddForm, policy_holder_name: e.target.value })}
                    required
                    className="w-full px-3 py-1.5 rounded-xl border border-zinc-300 focus:border-[#185A4D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block font-semibold text-zinc-700">Start Date *</label>
                  <input
                    type="date"
                    value={quickAddForm.start_date}
                    onChange={(e) => setQuickAddForm({ ...quickAddForm, start_date: e.target.value })}
                    required
                    className="w-full px-3 py-1.5 rounded-xl border border-zinc-300"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block font-semibold text-zinc-700">Expiry Date *</label>
                  <input
                    type="date"
                    value={quickAddForm.expiry_date}
                    onChange={(e) => setQuickAddForm({ ...quickAddForm, expiry_date: e.target.value })}
                    required
                    className="w-full px-3 py-1.5 rounded-xl border border-zinc-300"
                  />
                </div>
              </div>

              <div className="space-y-1 pt-1">
                <label className="block font-semibold text-zinc-700">Insurance Card File (PDF/JPG/PNG) *</label>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setQuickAddCard(e.target.files[0] || null)}
                  required
                  className="w-full text-xs text-zinc-600 file:mr-2 file:py-1 file:px-2.5 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#F0F5F7] file:text-[#185A4D]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowQuickAddPolicy(false)}
                  className="px-3 py-1.5 text-xs text-zinc-600 hover:bg-zinc-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={quickAddSubmitting}
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#185A4D] hover:bg-[#13493E] rounded-xl shadow-xs cursor-pointer"
                >
                  {quickAddSubmitting ? "Registering..." : "Save Policy"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CHECKPOINT 5: DOCUMENT PREVIEW MODAL                                      */}
      {/* ========================================================================= */}
      {previewDoc && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-zinc-200 overflow-hidden my-6 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50/80 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="material-symbols-outlined text-[#185A4D] text-xl shrink-0">
                  {previewDoc.contentType?.includes("pdf")
                    ? "picture_as_pdf"
                    : previewDoc.contentType?.includes("image")
                    ? "image"
                    : "description"}
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-zinc-900 truncate">{previewDoc.name}</h3>
                  <p className="text-[11px] text-zinc-500">
                    Secure In-Memory Preview &bull; {previewDoc.contentType}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleClosePreview}
                  className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>
            </div>

            {/* Viewer Content */}
            <div className="p-4 overflow-auto flex-1 bg-zinc-900/5 flex items-center justify-center min-h-[350px]">
              {previewDoc.contentType?.includes("image") ? (
                <img
                  src={previewDoc.url}
                  alt={previewDoc.name}
                  className="max-h-[70vh] max-w-full rounded-lg object-contain shadow-md"
                />
              ) : previewDoc.contentType?.includes("pdf") ? (
                <iframe
                  src={previewDoc.url}
                  title={previewDoc.name}
                  className="w-full h-[65vh] rounded-lg border border-zinc-200 bg-white"
                />
              ) : (
                <iframe
                  src={previewDoc.url}
                  title={previewDoc.name}
                  className="w-full h-[65vh] rounded-lg border border-zinc-200 bg-white"
                />
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end px-6 py-3 border-t border-zinc-200 bg-zinc-50/80 shrink-0">
              <button
                type="button"
                onClick={handleClosePreview}
                className="px-4 py-2 text-xs font-semibold text-zinc-700 bg-white border border-zinc-300 rounded-xl hover:bg-zinc-50 transition cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CHECKPOINT 6: REVIEW CONSENT DOCUMENT MODAL                               */}
      {/* ========================================================================= */}
      {showReviewConsentModal && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-zinc-200 overflow-hidden my-6 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50/80 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-[#F0F5F7] text-[#185A4D] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-lg">gavel</span>
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-zinc-900 truncate">
                    {consentLegalDoc?.document_title || "Insurance Data Sharing Consent Agreement"}
                  </h3>
                  <p className="text-[11px] text-zinc-500">
                    Version {consentLegalDoc?.version || "1.0"} &bull; Legal and Regulatory Terms
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReviewConsentModal(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Document Content */}
            <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs text-zinc-800 leading-relaxed">
              {consentLegalDocLoading ? (
                <div className="p-8 text-center text-[#577877] space-y-2">
                  <div className="w-6 h-6 border-2 border-[#185A4D]/20 border-t-[#185A4D] rounded-full animate-spin mx-auto" />
                  <p className="text-xs font-semibold">Loading official consent agreement definition...</p>
                </div>
              ) : consentLegalDoc ? (
                <div className="space-y-4">
                  {/* Summary Statement */}
                  <div className="p-3.5 rounded-xl bg-[#F0F5F7] border border-[#25836F]/20 text-[11px] text-[#185A4D] leading-relaxed">
                    <p className="font-semibold mb-1">Standard Patient Authorization:</p>
                    <p className="italic">{consentLegalDoc.standard_consent_statement}</p>
                  </div>

                  {/* Sections */}
                  <div className="space-y-3">
                    {consentLegalDoc.sections?.map((section) => (
                      <div key={section.section_number} className="p-3.5 rounded-xl border border-zinc-200 bg-white space-y-1">
                        <h5 className="font-bold text-xs text-[#185A4D] flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-[#F0F5F7] text-[#185A4D] text-[10px] flex items-center justify-center font-mono">
                            {section.section_number}
                          </span>
                          {section.title}
                        </h5>
                        <p className="text-[11px] text-zinc-600 leading-relaxed pl-6.5">
                          {section.content}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Statutory & Privacy Notice */}
                  <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-[10px] text-zinc-500 space-y-1">
                    <p><strong>Tenant Isolation: </strong>{consentLegalDoc.tenant_isolation_notice}</p>
                    <p><strong>Statutory Compliance: </strong>{consentLegalDoc.statutory_notice}</p>
                  </div>
                </div>
              ) : (
                <p className="text-zinc-500 text-center">Unable to load consent agreement.</p>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end px-6 py-3 border-t border-zinc-200 bg-zinc-50/80 shrink-0">
              <button
                type="button"
                onClick={() => setShowReviewConsentModal(false)}
                className="px-4 py-2 text-xs font-bold text-white bg-[#185A4D] hover:bg-[#13493E] rounded-xl shadow-xs transition cursor-pointer"
              >
                I Understand &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* CHECKPOINT 7: CLAIM SUBMISSION SUCCESS MODAL                              */}
      {/* ========================================================================= */}
      {submissionSuccessData && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-zinc-200 overflow-hidden my-6 p-6 space-y-5 animate-in fade-in zoom-in-95 duration-200 text-center">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-100">
              <span className="material-symbols-outlined text-3xl">task_alt</span>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-base font-bold text-zinc-900">
                Claim Submitted Successfully
              </h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Your post-consultation reimbursement claim has been generated and dispatched to the Clinic Admin audit queue.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F0F5F7] border border-[#25836F]/20 text-left space-y-2 text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-[#25836F]/10">
                <span className="text-zinc-500">Claim Reference:</span>
                <span className="font-mono font-bold text-[#185A4D] text-sm">
                  {submissionSuccessData.claim_reference}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Initial Status:</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                  {submissionSuccessData.status_label || "Pending Document Verification"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Audit Workflow:</span>
                <span className="font-semibold text-zinc-700">Internal Clinic Admin Review</span>
              </div>
              <div className="pt-1 text-[11px] text-zinc-500 leading-relaxed border-t border-[#25836F]/10">
                {submissionSuccessData.next_step}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSubmissionSuccessData(null);
                  setSelectedCompletedApt(null);
                }}
                className="w-full sm:w-auto px-5 py-2 text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-xl transition cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  setSubmissionSuccessData(null);
                  setSelectedCompletedApt(null);
                  if (typeof onNavigate === "function") {
                    onNavigate("insurance", { tab: "claims" });
                  }
                }}
                className="w-full sm:w-auto px-5 py-2 text-xs font-bold text-white bg-[#185A4D] hover:bg-[#13493E] rounded-xl shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">receipt_long</span>
                <span>View in My Insurance</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



