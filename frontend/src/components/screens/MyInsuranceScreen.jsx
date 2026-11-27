import { useState, useEffect, useRef } from "react";
import { insuranceApi } from "../../lib/api";

const RELATIONSHIP_OPTIONS = ["Self", "Spouse", "Child", "Parent", "Other"];
const INSURANCE_TYPE_OPTIONS = ["Individual", "Family", "Corporate", "Government"];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png"];

const getClaimStatusBadge = (status, label) => {
  switch (status) {
    case "ready_for_submission":
      return {
        cls: "bg-emerald-50 text-emerald-800 border-emerald-200",
        icon: "verified",
        label: label || "Ready for Submission",
      };
    case "submitted_to_insurer":
      return {
        cls: "bg-teal-50 text-teal-800 border-teal-200",
        icon: "send",
        label: label || "Submitted to Insurer",
      };
    case "under_insurer_review":
      return {
        cls: "bg-blue-50 text-blue-800 border-blue-200",
        icon: "hourglass_top",
        label: label || "Under Insurer Review",
      };
    case "additional_documents_required":
      return {
        cls: "bg-amber-50 text-amber-900 border-amber-300",
        icon: "upload_file",
        label: label || "Additional Documents Required",
      };
    case "approved":
      return {
        cls: "bg-emerald-100 text-emerald-900 border-emerald-300",
        icon: "check_circle",
        label: label || "Approved",
      };
    case "partially_approved":
      return {
        cls: "bg-amber-100 text-amber-900 border-amber-300",
        icon: "published_with_changes",
        label: label || "Partially Approved",
      };
    case "rejected":
      return {
        cls: "bg-rose-100 text-rose-900 border-rose-300",
        icon: "cancel",
        label: label || "Rejected",
      };
    case "correction_required":
      return {
        cls: "bg-rose-50 text-rose-900 border-rose-200",
        icon: "warning",
        label: label || "Correction Required",
      };
    case "pending_document_verification":
      return {
        cls: "bg-amber-50 text-amber-800 border-amber-200",
        icon: "fact_check",
        label: label || "Pending Verification",
      };
    case "draft":
    default:
      return {
        cls: "bg-zinc-100 text-zinc-700 border-zinc-200",
        icon: "edit_note",
        label: label || "Draft",
      };
  }
};

export default function MyInsuranceScreen({ onNavigate, patient, navParams }) {
  const [activeTab, setActiveTab] = useState(navParams?.tab || "policies"); // "policies" | "claims"
  const [policies, setPolicies] = useState([]);
  const [activeProviders, setActiveProviders] = useState([]);
  const [claims, setClaims] = useState([]);
  const [claimsLoading, setClaimsLoading] = useState(false);
  const [viewingClaim, setViewingClaim] = useState(null);
  const [claimDetailLoading, setClaimDetailLoading] = useState(false);
  const [resubmitNotes, setResubmitNotes] = useState("");
  const [resubmitting, setResubmitting] = useState(false);
  const [claimPreflight, setClaimPreflight] = useState(null);
  const [claimPreflightLoading, setClaimPreflightLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [viewingPolicy, setViewingPolicy] = useState(null);
  const [editingPolicy, setEditingPolicy] = useState(null);
  const [previewDoc, setPreviewDoc] = useState(null); // { id, name, url, type }
  const [previewLoading, setPreviewLoading] = useState(false);

  // Toast state
  const [toast, setToast] = useState({ message: "", type: "info" }); // "success" | "error" | "info"

  // Add Policy Form state
  const [addForm, setAddForm] = useState({
    provider_id: "",
    policy_number: "",
    member_id: "",
    policy_holder_name: patient?.full_name || patient?.name || "",
    relationship: "Self",
    insurance_type: "Individual",
    start_date: "",
    expiry_date: "",
  });
  const [cardFile, setCardFile] = useState(null);
  const [policyDocFile, setPolicyDocFile] = useState(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Edit Policy Form state
  const [editForm, setEditForm] = useState({
    policy_holder_name: "",
    relationship: "Self",
    insurance_type: "Individual",
    member_id: "",
    start_date: "",
    expiry_date: "",
  });
  const [editCardFile, setEditCardFile] = useState(null);
  const [editPolicyDocFile, setEditPolicyDocFile] = useState(null);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState("");

  // File input refs
  const addCardInputRef = useRef(null);
  const addDocInputRef = useRef(null);
  const editCardInputRef = useRef(null);
  const editDocInputRef = useRef(null);
  const additionalDocInputRef = useRef(null);

  // Additional requested documents state (Checkpoint 9)
  const [additionalDocFile, setAdditionalDocFile] = useState(null);
  const [additionalDocTitle, setAdditionalDocTitle] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [uploadingAdditional, setUploadingAdditional] = useState(false);
  const [submittingAdditional, setSubmittingAdditional] = useState(false);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast({ message: "", type: "info" }), 5000);
  };

  const loadInsuranceData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [policiesData, providersData, claimsData] = await Promise.all([
        insuranceApi.getPatientPolicies().catch(() => []),
        insuranceApi.getActiveProviders().catch(() => []),
        insuranceApi.getPatientClaims().catch(() => []),
      ]);
      setPolicies(Array.isArray(policiesData) ? policiesData : []);
      setActiveProviders(Array.isArray(providersData) ? providersData : []);
      setClaims(Array.isArray(claimsData) ? claimsData : []);
    } catch (err) {
      setError(err.message || "Failed to load insurance policies.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInsuranceData();
  }, []);

  useEffect(() => {
    if (navParams?.tab) {
      setActiveTab(navParams.tab);
    }
    if (navParams?.claimId) {
      setActiveTab("claims");
      setClaimDetailLoading(true);
      insuranceApi
        .getPatientClaimDetail(navParams.claimId)
        .then((detail) => {
          setViewingClaim(detail);
          setClaimPreflight(null);
          if (detail?.appointment_id) {
            handleRunPreflightAudit(detail.appointment_id, detail.policy_id);
          }
        })
        .catch(() => {})
        .finally(() => setClaimDetailLoading(false));
    }
  }, [navParams]);

  const handleRunPreflightAudit = async (appointmentId, policyId) => {
    if (!appointmentId) return;
    setClaimPreflightLoading(true);
    try {
      const res = await insuranceApi.preflightValidateClaim({
        appointment_id: appointmentId,
        policy_id: policyId || null,
      });
      setClaimPreflight(res);
    } catch (err) {
      showToast(err.message || "Unable to run pre-flight claim health check.", "error");
    } finally {
      setClaimPreflightLoading(false);
    }
  };

  const handleResubmitClaim = async (claimId) => {
    setResubmitting(true);
    try {
      const res = await insuranceApi.resubmitPatientClaim(claimId, {
        notes: resubmitNotes.trim() || null,
      });
      showToast(res.message || "Claim resubmitted successfully!", "success");
      setResubmitNotes("");
      const updated = await insuranceApi.getPatientClaimDetail(claimId);
      setViewingClaim(updated);
      loadInsuranceData();
    } catch (err) {
      showToast(err.message || "Failed to resubmit claim.", "error");
    } finally {
      setResubmitting(false);
    }
  };

  const handleUploadAdditionalDoc = async (claimId) => {
    if (!additionalDocFile) {
      showToast("Please choose a file to upload.", "error");
      return;
    }
    const valErr = validateFile(additionalDocFile);
    if (valErr) {
      showToast(valErr, "error");
      return;
    }

    setUploadingAdditional(true);
    try {
      const formData = new FormData();
      formData.append("title", additionalDocTitle.trim() || additionalDocFile.name);
      formData.append("file", additionalDocFile);

      await insuranceApi.uploadPatientAdditionalDoc(claimId, formData);
      showToast("Additional document uploaded successfully!", "success");
      setAdditionalDocFile(null);
      setAdditionalDocTitle("");
      if (additionalDocInputRef.current) additionalDocInputRef.current.value = "";
      const updated = await insuranceApi.getPatientClaimDetail(claimId);
      setViewingClaim(updated);
      loadInsuranceData();
    } catch (err) {
      showToast(err.message || "Failed to upload document.", "error");
    } finally {
      setUploadingAdditional(false);
    }
  };

  const handleSubmitAdditionalDocs = async (claimId) => {
    setSubmittingAdditional(true);
    try {
      const res = await insuranceApi.submitPatientAdditionalDocs(claimId, {
        notes: additionalNotes.trim() || null,
      });
      showToast(res.message || "Additional documents submitted to insurer!", "success");
      setAdditionalNotes("");
      const updated = await insuranceApi.getPatientClaimDetail(claimId);
      setViewingClaim(updated);
      loadInsuranceData();
    } catch (err) {
      showToast(err.message || "Failed to submit additional documents.", "error");
    } finally {
      setSubmittingAdditional(false);
    }
  };

  // Update default policyholder name if patient prop changes
  useEffect(() => {
    if (patient?.full_name || patient?.name) {
      setAddForm((prev) => ({
        ...prev,
        policy_holder_name: prev.policy_holder_name || patient.full_name || patient.name,
      }));
    }
  }, [patient]);

  // Validate file helper
  const validateFile = (file) => {
    if (!file) return null;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      return `Invalid format for "${file.name}". Only PDF, JPG, and PNG are allowed.`;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return `File "${file.name}" exceeds 10 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`;
    }
    return null;
  };

  // Open Edit Modal
  const handleOpenEdit = (policy) => {
    setEditingPolicy(policy);
    setEditForm({
      policy_holder_name: policy.policy_holder_name || "",
      relationship: policy.relationship || "Self",
      insurance_type: policy.insurance_type || "Individual",
      member_id: policy.member_id || "",
      start_date: policy.start_date || "",
      expiry_date: policy.expiry_date || "",
    });
    setEditCardFile(null);
    setEditPolicyDocFile(null);
    setEditError("");
  };

  // Handle Add Policy Submit
  const handleAddSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    // Form validation
    if (!addForm.provider_id) {
      setFormError("Please select an Insurance Provider from the master list.");
      return;
    }
    if (!addForm.policy_number.trim()) {
      setFormError("Policy Number is required.");
      return;
    }
    if (!addForm.policy_holder_name.trim()) {
      setFormError("Policyholder Name is required.");
      return;
    }
    if (!addForm.start_date || !addForm.expiry_date) {
      setFormError("Both Policy Start Date and Expiry Date are required.");
      return;
    }
    if (addForm.expiry_date < addForm.start_date) {
      setFormError("Policy Expiry Date cannot be earlier than Policy Start Date.");
      return;
    }
    if (!cardFile) {
      setFormError("Please upload an image or PDF of your Insurance Card.");
      return;
    }

    const cardErr = validateFile(cardFile);
    if (cardErr) {
      setFormError(cardErr);
      return;
    }
    const docErr = validateFile(policyDocFile);
    if (docErr) {
      setFormError(docErr);
      return;
    }

    setFormSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("provider_id", addForm.provider_id);
      formData.append("policy_number", addForm.policy_number.trim());
      if (addForm.member_id.trim()) formData.append("member_id", addForm.member_id.trim());
      formData.append("policy_holder_name", addForm.policy_holder_name.trim());
      formData.append("relationship", addForm.relationship);
      formData.append("insurance_type", addForm.insurance_type);
      formData.append("start_date", addForm.start_date);
      formData.append("expiry_date", addForm.expiry_date);
      if (cardFile) formData.append("insurance_card", cardFile);
      if (policyDocFile) formData.append("policy_document", policyDocFile);

      await insuranceApi.registerPolicy(formData);
      showToast("Insurance policy registered successfully!", "success");
      setShowAddModal(false);
      // Reset form
      setAddForm({
        provider_id: "",
        policy_number: "",
        member_id: "",
        policy_holder_name: patient?.full_name || patient?.name || "",
        relationship: "Self",
        insurance_type: "Individual",
        start_date: "",
        expiry_date: "",
      });
      setCardFile(null);
      setPolicyDocFile(null);
      await loadInsuranceData();
    } catch (err) {
      setFormError(err.message || "Failed to register insurance policy.");
    } finally {
      setFormSubmitting(false);
    }
  };

  // Handle Edit Policy Submit
  const handleEditSubmit = async (e) => {
    e.preventDefault();
    setEditError("");

    if (!editForm.policy_holder_name.trim()) {
      setEditError("Policyholder Name is required.");
      return;
    }
    if (editForm.start_date && editForm.expiry_date && editForm.expiry_date < editForm.start_date) {
      setEditError("Policy Expiry Date cannot be earlier than Policy Start Date.");
      return;
    }

    const cardErr = validateFile(editCardFile);
    if (cardErr) {
      setEditError(cardErr);
      return;
    }
    const docErr = validateFile(editPolicyDocFile);
    if (docErr) {
      setEditError(docErr);
      return;
    }

    setEditSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("policy_holder_name", editForm.policy_holder_name.trim());
      formData.append("relationship", editForm.relationship);
      formData.append("insurance_type", editForm.insurance_type);
      if (editForm.member_id.trim()) formData.append("member_id", editForm.member_id.trim());
      if (editForm.start_date) formData.append("start_date", editForm.start_date);
      if (editForm.expiry_date) formData.append("expiry_date", editForm.expiry_date);
      if (editCardFile) formData.append("insurance_card", editCardFile);
      if (editPolicyDocFile) formData.append("policy_document", editPolicyDocFile);

      const updated = await insuranceApi.updatePolicy(editingPolicy.id, formData);
      showToast("Insurance policy updated successfully!", "success");
      setEditingPolicy(null);
      if (viewingPolicy && viewingPolicy.id === editingPolicy.id) {
        setViewingPolicy(updated);
      }
      await loadInsuranceData();
    } catch (err) {
      setEditError(err.message || "Failed to update insurance policy.");
    } finally {
      setEditSubmitting(false);
    }
  };

  // Handle Status Toggle (Activate / Deactivate)
  const handleToggleStatus = async (policy) => {
    const isActivating = policy.status === "Inactive";
    const newStatus = isActivating ? "Active" : "Inactive";
    const confirmMsg = isActivating
      ? `Re-activate policy with ${policy.provider_name}?`
      : `Deactivate policy with ${policy.provider_name}? You can re-activate it anytime before it expires.`;

    if (!window.confirm(confirmMsg)) return;

    try {
      await insuranceApi.togglePolicyStatus(policy.id, newStatus);
      showToast(`Policy marked as ${newStatus}.`, "success");
      if (viewingPolicy && viewingPolicy.id === policy.id) {
        setViewingPolicy((prev) => ({ ...prev, status: newStatus }));
      }
      await loadInsuranceData();
    } catch (err) {
      showToast(err.message || `Failed to update status to ${newStatus}.`, "error");
    }
  };

  // Handle Secure Document Preview
  const handlePreviewDocument = async (doc) => {
    if (!doc || !doc.id) return;
    setPreviewLoading(true);
    try {
      const { objectUrl, contentType } = await insuranceApi.fetchDocumentPreviewBlob(doc.id);
      setPreviewDoc({
        id: doc.id,
        name: doc.file_name,
        url: objectUrl,
        contentType,
        sizeBytes: doc.size_bytes,
      });
    } catch (err) {
      showToast(err.message || "Unable to load document preview.", "error");
    } finally {
      setPreviewLoading(false);
    }
  };

  // Handle Secure Document Download
  const handleDownloadDocument = async (doc) => {
    if (!doc || !doc.id) return;
    try {
      showToast(`Downloading "${doc.file_name}"...`, "info");
      await insuranceApi.downloadDocument(doc.id, doc.file_name);
    } catch (err) {
      showToast(err.message || "Download failed. Please retry.", "error");
    }
  };

  // Close preview modal and cleanup blob URL
  const handleClosePreview = () => {
    if (previewDoc?.url) {
      window.URL.revokeObjectURL(previewDoc.url);
    }
    setPreviewDoc(null);
  };

  return (
    <div className="w-full space-y-6 font-sans text-[#162623]">
      {/* Toast Notification */}
      {toast.message && (
        <div
          className={`p-3.5 rounded-xl border shadow-sm flex items-center justify-between text-xs font-semibold animate-in fade-in duration-200 ${
            toast.type === "error"
              ? "bg-red-50 border-red-200 text-red-700"
              : toast.type === "info"
              ? "bg-sky-50 border-sky-200 text-sky-800"
              : "bg-emerald-50 border-emerald-200 text-emerald-800"
          }`}
        >
          <span className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base">
              {toast.type === "error" ? "error" : toast.type === "info" ? "info" : "check_circle"}
            </span>
            {toast.message}
          </span>
          <button
            type="button"
            onClick={() => setToast({ message: "", type: "info" })}
            className="hover:opacity-75 cursor-pointer ml-3"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Top Hero Banner matching Kaizen Care Design System */}
      <div className="rounded-2xl bg-gradient-to-r from-[#25836F] via-[#1F6E5E] to-[#185A4D] text-white px-6 py-5 sm:px-8 sm:py-6 shadow-sm border border-[#185A4D]/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase text-[#F0F5F7]/85">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A3E2D4]" />
            Health Coverage &amp; Reimbursement
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
            My Insurance
          </h1>
          <p className="text-xs sm:text-sm text-[#F0F5F7]/90 max-w-xl">
            Register and manage your health insurance policies and securely store digital cards for optional post-visit reimbursement claims.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormError("");
            setShowAddModal(true);
          }}
          className="inline-flex items-center gap-2 bg-white text-[#185A4D] hover:bg-[#F0F5F7] px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm shadow-xs transition active:scale-[0.98] cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <span className="material-symbols-outlined text-lg">add_circle</span>
          <span>Add Insurance Policy</span>
        </button>
      </div>

      {/* Approved Flow Informational Banner */}
      <div className="p-4 rounded-2xl bg-[#F0F5F7] border border-[#25836F]/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-[#162623]">
        <div className="flex items-start gap-2.5">
          <span className="material-symbols-outlined text-[#185A4D] text-xl shrink-0 mt-0.5">
            verified_user
          </span>
          <div>
            <span className="font-bold text-[#185A4D]">Approved Teleconsultation Workflow: </span>
            <span className="text-[#364947]">
              Appointments are self-paid and confirmed immediately without pre-authorization delays. You can submit an optional claim for reimbursement after receiving your consultation summary.
            </span>
          </div>
        </div>
        <div className="shrink-0 text-[11px] font-semibold text-[#185A4D] bg-white px-2.5 py-1 rounded-md border border-[#25836F]/20">
          Insurance is Optional
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-zinc-200">
        <button
          type="button"
          onClick={() => setActiveTab("policies")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition cursor-pointer ${
            activeTab === "policies"
              ? "border-[#185A4D] text-[#185A4D]"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <span className="material-symbols-outlined text-lg">shield</span>
          <span>Insurance Policies</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              activeTab === "policies"
                ? "bg-[#185A4D] text-white"
                : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {policies.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("claims")}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition cursor-pointer ${
            activeTab === "claims"
              ? "border-[#185A4D] text-[#185A4D]"
              : "border-transparent text-zinc-500 hover:text-zinc-800"
          }`}
        >
          <span className="material-symbols-outlined text-lg">receipt_long</span>
          <span>Insurance Claims</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              activeTab === "claims"
                ? "bg-[#185A4D] text-white"
                : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {claims.length}
          </span>
        </button>
      </div>

      {/* TAB 1: INSURANCE POLICIES */}
      {activeTab === "policies" && (
        <div className="space-y-4">
          {loading ? (
            <div className="p-12 text-center bg-white rounded-2xl border border-zinc-200/80 space-y-3">
              <div className="w-10 h-10 border-3 border-[#185A4D]/20 border-t-[#185A4D] rounded-full animate-spin mx-auto" />
              <p className="text-xs font-semibold text-zinc-600">Loading your insurance policies...</p>
            </div>
          ) : error ? (
            <div className="p-8 text-center bg-white rounded-2xl border border-red-200 space-y-3">
              <span className="material-symbols-outlined text-red-500 text-3xl">error</span>
              <p className="text-sm text-red-600 font-medium">{error}</p>
              <button
                type="button"
                onClick={loadInsuranceData}
                className="px-4 py-1.5 text-xs font-semibold text-[#185A4D] bg-[#F0F5F7] rounded-lg hover:bg-[#e2edf1] transition cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : policies.length === 0 ? (
            /* Empty State */
            <div className="bg-white rounded-2xl border border-zinc-200/80 p-10 sm:p-14 text-center space-y-4 shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-[#F0F5F7] text-[#185A4D] flex items-center justify-center mx-auto shadow-inner">
                <span className="material-symbols-outlined text-3xl">health_and_safety</span>
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-base font-bold text-zinc-900">
                  No Insurance Policies on File
                </h3>
                <p className="text-xs sm:text-sm text-zinc-500 leading-relaxed">
                  You haven&apos;t registered any health insurance policies yet. Consultations remain 100% self-paid and confirmed immediately. Adding a policy allows you to file for post-visit reimbursement.
                </p>
              </div>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setFormError("");
                    setShowAddModal(true);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#185A4D] px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-[#13493E] transition shadow-xs cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base">add_circle</span>
                  <span>Add Insurance Policy</span>
                </button>
              </div>
            </div>
          ) : (
            /* Populated State */
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {policies.map((policy) => {
                const isExpired = policy.status === "Expired";
                const isActive = policy.status === "Active";
                return (
                  <div
                    key={policy.id}
                    className={`bg-white p-5 rounded-2xl border shadow-xs transition space-y-4 flex flex-col justify-between ${
                      isExpired
                        ? "border-amber-200/80 hover:border-amber-300"
                        : isActive
                        ? "border-zinc-200/80 hover:border-[#185A4D]/40"
                        : "border-zinc-200 bg-zinc-50/40 opacity-80"
                    }`}
                  >
                    <div className="space-y-4">
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-zinc-900 text-sm truncate">
                              {policy.provider_name}
                            </span>
                            {policy.provider_code && (
                              <span className="font-mono text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                                {policy.provider_code}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-zinc-500">
                            {policy.insurance_type
                              ? `${policy.insurance_type} Policy`
                              : policy.policy_type || "Health Insurance"}
                            {policy.relationship && policy.relationship !== "Self" && (
                              <span className="ml-1.5 text-zinc-400">({policy.relationship})</span>
                            )}
                          </p>
                        </div>

                        {/* Status Badge */}
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${
                            isActive
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : isExpired
                              ? "bg-amber-50 text-amber-700 border border-amber-200"
                              : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isActive
                                ? "bg-emerald-500"
                                : isExpired
                                ? "bg-amber-500"
                                : "bg-zinc-400"
                            }`}
                          />
                          {policy.status}
                        </span>
                      </div>

                      {/* Policy Information Box */}
                      <div className="p-3 bg-zinc-50/80 rounded-xl space-y-2 text-xs border border-zinc-100">
                        <div className="flex items-center justify-between">
                          <span className="text-zinc-500">Policy Number:</span>
                          <span className="font-mono font-bold text-zinc-800 tracking-wider">
                            {policy.policy_number_masked}
                          </span>
                        </div>

                        {policy.member_id && (
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-500">Member ID:</span>
                            <span className="font-mono text-zinc-700 font-medium">
                              {policy.member_id}
                            </span>
                          </div>
                        )}

                        {policy.policy_holder_name && (
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-500">Policyholder:</span>
                            <span className="font-medium text-zinc-800">
                              {policy.policy_holder_name}
                            </span>
                          </div>
                        )}

                        <div className="flex items-center justify-between">
                          <span className="text-zinc-500">Validity:</span>
                          <span className="font-medium text-zinc-800 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs text-zinc-400">
                              calendar_month
                            </span>
                            {policy.expiry_date
                              ? `${policy.start_date || "Start"} to ${policy.expiry_date}`
                              : "Not specified"}
                          </span>
                        </div>

                        {/* Documents Attached Badges */}
                        <div className="pt-1.5 border-t border-zinc-200/60 flex items-center gap-2 flex-wrap text-[11px]">
                          <span className="text-zinc-400">Documents:</span>
                          {policy.card_document ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 font-medium bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                              <span className="material-symbols-outlined text-xs">badge</span>
                              Card Attached
                            </span>
                          ) : (
                            <span className="text-zinc-400 italic">No card</span>
                          )}
                          {policy.policy_document && (
                            <span className="inline-flex items-center gap-1 text-sky-700 font-medium bg-sky-50 px-2 py-0.5 rounded border border-sky-100">
                              <span className="material-symbols-outlined text-xs">description</span>
                              Policy Doc
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card Actions Footer */}
                    <div className="pt-2 border-t border-zinc-100 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setViewingPolicy(policy)}
                          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#185A4D] bg-[#F0F5F7] hover:bg-[#e1edef] transition cursor-pointer flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-sm">visibility</span>
                          <span>View Details</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(policy)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 transition cursor-pointer flex items-center gap-1"
                        >
                          <span className="material-symbols-outlined text-sm">edit</span>
                          <span>Edit</span>
                        </button>
                      </div>

                      {/* Status toggle button */}
                      {!isExpired && (
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(policy)}
                          className={`text-[11px] font-medium px-2 py-1 rounded transition cursor-pointer ${
                            isActive
                              ? "text-zinc-500 hover:text-red-600 hover:bg-red-50"
                              : "text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          {isActive ? "Deactivate" : "Activate"}
                        </button>
                      )}
                      {isExpired && (
                        <span className="text-[11px] font-medium text-amber-600 flex items-center gap-0.5">
                          <span className="material-symbols-outlined text-xs">warning</span>
                          Expired
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: INSURANCE CLAIMS (CHECKPOINT 7) */}
      {activeTab === "claims" && (
        <div className="space-y-6">
          {/* Header & count */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-zinc-900">
                Insurance Reimbursement Claims ({claims.length})
              </h3>
              <p className="text-xs text-zinc-500">
                Post-consultation claims queued for Clinic Admin document verification and settlement audit
              </p>
            </div>
            <button
              type="button"
              onClick={loadInsuranceData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 hover:bg-zinc-50 shadow-2xs cursor-pointer self-start sm:self-auto"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              <span>Refresh Claims</span>
            </button>
          </div>

          {claims.length === 0 ? (
            <div className="bg-white rounded-2xl border border-zinc-200/80 p-8 sm:p-12 text-center space-y-4 shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-3xl">receipt_long</span>
              </div>
              <div className="space-y-1.5 max-w-md mx-auto">
                <h3 className="text-base font-bold text-zinc-900">
                  No Insurance Claims Yet
                </h3>
                <p className="text-xs sm:text-sm text-zinc-500 leading-relaxed">
                  Claims can be submitted after completing an appointment and receiving your clinician&apos;s signed consultation summary and prescription.
                </p>
              </div>

              {/* Workflow steps visualization */}
              <div className="max-w-xl mx-auto pt-4 pb-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-left">
                  <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 space-y-1">
                    <span className="w-5 h-5 rounded-full bg-[#185A4D] text-white text-[11px] font-bold flex items-center justify-center">1</span>
                    <div className="font-bold text-xs text-zinc-900">Self-Payment</div>
                    <div className="text-[11px] text-zinc-500">Immediate booking confirmation</div>
                  </div>
                  <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 space-y-1">
                    <span className="w-5 h-5 rounded-full bg-[#185A4D] text-white text-[11px] font-bold flex items-center justify-center">2</span>
                    <div className="font-bold text-xs text-zinc-900">Consultation</div>
                    <div className="text-[11px] text-zinc-500">Video room session with doctor</div>
                  </div>
                  <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 space-y-1">
                    <span className="w-5 h-5 rounded-full bg-[#185A4D] text-white text-[11px] font-bold flex items-center justify-center">3</span>
                    <div className="font-bold text-xs text-zinc-900">Summary &amp; Rx</div>
                    <div className="text-[11px] text-zinc-500">Doctor-finalized clinical records</div>
                  </div>
                  <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 space-y-1">
                    <span className="w-5 h-5 rounded-full bg-[#185A4D] text-white text-[11px] font-bold flex items-center justify-center">4</span>
                    <div className="font-bold text-xs text-zinc-900">Review &amp; Submit</div>
                    <div className="text-[11px] text-zinc-500">Pending Clinic Admin review</div>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => onNavigate("find-doctors")}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#185A4D] px-5 py-2.5 text-xs sm:text-sm font-semibold text-white hover:bg-[#13493E] transition shadow-xs cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base">person_search</span>
                  <span>Find Doctors &amp; Book Visit</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {claims.map((claim) => {
                const statusBadge = getClaimStatusBadge(claim.status, claim.status_label);
                const isCorrection = claim.status === "correction_required";
                const isAddDocsRequired = claim.status === "additional_documents_required";
                const isApproved = claim.status === "approved";
                const isPartiallyApproved = claim.status === "partially_approved";
                const isRejected = claim.status === "rejected";

                return (
                  <div
                    key={claim.id}
                    className="p-5 rounded-2xl bg-white border border-zinc-200/80 shadow-xs hover:border-[#25836F]/40 transition space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-zinc-100">
                      <div className="flex items-center gap-2.5">
                        <span className="w-9 h-9 rounded-xl bg-[#F0F5F7] text-[#185A4D] flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-xl">receipt_long</span>
                        </span>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-sm text-zinc-900">
                              {claim.claim_reference}
                            </span>
                            {/* Status Badge */}
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 border ${statusBadge.cls}`}>
                              <span className="material-symbols-outlined text-xs">
                                {statusBadge.icon}
                              </span>
                              <span>{statusBadge.label}</span>
                            </span>
                          </div>
                          <p className="text-[11px] text-zinc-500">
                            Submitted on {claim.submitted_at ? new Date(claim.submitted_at).toLocaleDateString() : "Draft"} &bull; Encounter {claim.appointment_display_id}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <span className="text-xs font-bold text-[#185A4D] bg-[#F0F5F7] px-3 py-1 rounded-lg">
                          Requested: {claim.consultation_fee}
                        </span>
                        <button
                          type="button"
                          onClick={async () => {
                            setClaimDetailLoading(true);
                            try {
                              const detail = await insuranceApi.getPatientClaimDetail(claim.id);
                              setViewingClaim(detail);
                              setClaimPreflight(null);
                              if (detail?.appointment_id) {
                                handleRunPreflightAudit(detail.appointment_id, detail.policy_id);
                              }
                            } catch (err) {
                              showToast(err.message || "Failed to load claim detail.", "error");
                            } finally {
                              setClaimDetailLoading(false);
                            }
                          }}
                          className={`px-3 py-1 text-xs font-semibold rounded-lg transition flex items-center gap-1 cursor-pointer ${
                            isCorrection || isAddDocsRequired
                              ? "bg-amber-600 text-white hover:bg-amber-700 shadow-2xs"
                              : "text-[#185A4D] bg-[#F0F5F7] hover:bg-[#e0ecef]"
                          }`}
                        >
                          <span className="material-symbols-outlined text-sm">
                            {isCorrection ? "edit_note" : isAddDocsRequired ? "upload_file" : "visibility"}
                          </span>
                          <span>
                            {isCorrection ? "View & Resubmit" : isAddDocsRequired ? "Upload Requested Docs" : "Details"}
                          </span>
                        </button>
                      </div>
                    </div>

                    {/* Insurer Submission Banner if submitted */}
                    {claim.insurer_claim_reference && (
                      <div className="p-2.5 rounded-xl bg-teal-50/70 border border-teal-200/80 text-xs text-teal-950 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-base text-teal-700 shrink-0">send</span>
                          <div>
                            <span className="font-semibold text-teal-950">Insurer Reference: </span>
                            <span className="font-mono font-bold text-teal-800">{claim.insurer_claim_reference}</span>
                          </div>
                        </div>
                        {claim.insurer_submission_date && (
                          <span className="text-[11px] text-teal-700 font-medium">
                            Submitted: {new Date(claim.insurer_submission_date).toLocaleDateString()} via {claim.insurer_submission_method || "Portal"}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Additional Documents Required Banner */}
                    {isAddDocsRequired && claim.requested_documents && (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start gap-2">
                        <span className="material-symbols-outlined text-base text-amber-600 mt-0.5 shrink-0">upload_file</span>
                        <div className="min-w-0">
                          <span className="font-bold block text-[11px] text-amber-950">Insurer Query / Action Required:</span>
                          <span className="text-[11px] text-amber-900 line-clamp-2">{claim.requested_documents}</span>
                        </div>
                      </div>
                    )}

                    {/* Approved / Settlement Banner */}
                    {isApproved && (
                      <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-base text-emerald-600">check_circle</span>
                          <span className="font-bold">Claim Approved by Insurer:</span>
                          <span className="font-bold text-emerald-700">₹{claim.approved_amount}</span>
                        </div>
                        {claim.settlement_reference && (
                          <span className="text-[11px] font-mono text-emerald-800">
                            Ref: {claim.settlement_reference}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Partially Approved Banner */}
                    {isPartiallyApproved && (
                      <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-base text-amber-600">published_with_changes</span>
                          <span className="font-bold">Partially Approved:</span>
                          <span className="font-bold text-amber-800">₹{claim.approved_amount}</span>
                        </div>
                        {claim.co_pay_or_deduction_reason && (
                          <span className="text-[11px] text-amber-800 italic">
                            Deduction: {claim.co_pay_or_deduction_reason}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Rejected Banner */}
                    {isRejected && (
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-950 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-base text-rose-600">cancel</span>
                          <span className="font-bold">Claim Rejected:</span>
                          <span className="text-rose-900">{claim.rejection_reason || "Check claim details"}</span>
                        </div>
                      </div>
                    )}

                    {/* Reimbursement status badge in claim card if available (Checkpoint 10) */}
                    {claim.reimbursement_status && (
                      <div className="p-2 rounded-xl bg-teal-50/70 border border-teal-200/80 text-xs text-teal-950 flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-base text-teal-700">payments</span>
                          <span className="font-bold text-teal-900">Reimbursement:</span>
                          <span className="font-semibold text-teal-800">
                            {claim.reimbursement_status_label || claim.reimbursement_status}
                          </span>
                        </div>
                        {claim.reimbursed_amount && (
                          <span className="font-bold text-teal-900 bg-white/80 px-2 py-0.5 rounded border border-teal-200 text-[11px]">
                            ₹{claim.reimbursed_amount} settled
                          </span>
                        )}
                      </div>
                    )}

                    {isCorrection && claim.verification_remarks && (
                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2">
                        <span className="material-symbols-outlined text-sm text-rose-600 mt-0.5 shrink-0">warning</span>
                        <div className="min-w-0">
                          <span className="font-bold block text-[11px] text-rose-950">Correction Requested by Clinic Admin:</span>
                          <span className="text-[11px] text-rose-800 line-clamp-2">{claim.verification_remarks}</span>
                        </div>
                      </div>
                    )}

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div>
                        <span className="text-zinc-400 block text-[11px]">Insurance Provider</span>
                        <span className="font-semibold text-zinc-800 truncate block">{claim.provider_name}</span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block text-[11px]">Policy Number</span>
                        <span className="font-mono text-zinc-700">{claim.policy_number_masked || "On File"}</span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block text-[11px]">Doctor</span>
                        <span className="font-semibold text-zinc-800">{claim.doctor_name} ({claim.specialty})</span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block text-[11px]">Audit Queue</span>
                        <span className="font-semibold text-[#185A4D]">
                          {claim.insurer_claim_reference ? "Insurer Processing" : "Clinic Admin Review"}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: ADD INSURANCE POLICY                                             */}
      {/* ========================================================================= */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-zinc-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#F0F5F7] text-[#185A4D] flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">health_and_safety</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900">Add Insurance Policy</h3>
                  <p className="text-[11px] text-zinc-500">Link your active policy for post-visit reimbursement claims</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddSubmit} className="p-6 space-y-4 text-xs sm:text-sm">
              {formError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <span className="material-symbols-outlined text-sm mt-0.5 shrink-0">error</span>
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Insurance Provider Dropdown */}
                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Insurance Provider <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={addForm.provider_id}
                    onChange={(e) => setAddForm({ ...addForm, provider_id: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D] bg-white cursor-pointer"
                  >
                    <option value="">-- Select Active Insurance Provider --</option>
                    {activeProviders.map((prov) => (
                      <option key={prov.id} value={prov.id}>
                        {prov.provider_name} ({prov.provider_code}) - {prov.provider_type}
                      </option>
                    ))}
                  </select>
                  {activeProviders.length === 0 && (
                    <p className="text-[11px] text-amber-600">
                      No active insurance providers configured in master yet.
                    </p>
                  )}
                </div>

                {/* Policy Number */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Policy Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={addForm.policy_number}
                    onChange={(e) => setAddForm({ ...addForm, policy_number: e.target.value })}
                    placeholder="e.g. POL-99887766"
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D]"
                  />
                </div>

                {/* Member ID */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Member ID / TPA ID <span className="text-zinc-400 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={addForm.member_id}
                    onChange={(e) => setAddForm({ ...addForm, member_id: e.target.value })}
                    placeholder="e.g. MEM-12345"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D]"
                  />
                </div>

                {/* Policyholder Name */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Policyholder Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={addForm.policy_holder_name}
                    onChange={(e) => setAddForm({ ...addForm, policy_holder_name: e.target.value })}
                    placeholder="Full name as printed on card"
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D]"
                  />
                </div>

                {/* Relationship */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Relationship with Policyholder <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={addForm.relationship}
                    onChange={(e) => setAddForm({ ...addForm, relationship: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D] bg-white cursor-pointer"
                  >
                    {RELATIONSHIP_OPTIONS.map((rel) => (
                      <option key={rel} value={rel}>
                        {rel}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Insurance Type */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Insurance Type
                  </label>
                  <select
                    value={addForm.insurance_type}
                    onChange={(e) => setAddForm({ ...addForm, insurance_type: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D] bg-white cursor-pointer"
                  >
                    {INSURANCE_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Start Date */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Policy Start Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={addForm.start_date}
                    onChange={(e) => setAddForm({ ...addForm, start_date: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D] bg-white"
                  />
                </div>

                {/* Expiry Date */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Policy Expiry Date <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={addForm.expiry_date}
                    onChange={(e) => setAddForm({ ...addForm, expiry_date: e.target.value })}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D] bg-white"
                  />
                </div>
              </div>

              {/* Uploads Section */}
              <div className="pt-2 border-t border-zinc-100 space-y-3">
                <div className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
                  Document Attachments (PDF, JPG, PNG up to 10 MB)
                </div>

                {/* Insurance Card Upload (Required) */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Insurance Card (Front / Full) <span className="text-red-500">*</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      ref={addCardInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        setCardFile(file || null);
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => addCardInputRef.current?.click()}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold text-[#185A4D] bg-[#F0F5F7] border border-[#25836F]/30 hover:bg-[#e2edef] transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">upload_file</span>
                      <span>{cardFile ? "Change Card File" : "Choose Card File"}</span>
                    </button>
                    {cardFile ? (
                      <div className="flex items-center gap-2 text-xs text-zinc-800">
                        <span className="material-symbols-outlined text-emerald-600 text-sm">
                          check_circle
                        </span>
                        <span className="font-medium truncate max-w-xs">{cardFile.name}</span>
                        <span className="text-[11px] text-zinc-400">
                          ({(cardFile.size / 1024).toFixed(0)} KB)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setCardFile(null);
                            if (addCardInputRef.current) addCardInputRef.current.value = "";
                          }}
                          className="text-zinc-400 hover:text-red-500 text-xs"
                        >
                          <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400 italic">No file selected (Required)</span>
                    )}
                  </div>
                </div>

                {/* Policy Document Upload (Optional) */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Policy Schedule / Document <span className="text-zinc-400 font-normal">(Optional)</span>
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      ref={addDocInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const file = e.target.files[0];
                        setPolicyDocFile(file || null);
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => addDocInputRef.current?.click()}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-700 bg-zinc-100 border border-zinc-200 hover:bg-zinc-200 transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-base">attach_file</span>
                      <span>{policyDocFile ? "Change Document" : "Choose Document"}</span>
                    </button>
                    {policyDocFile ? (
                      <div className="flex items-center gap-2 text-xs text-zinc-800">
                        <span className="material-symbols-outlined text-emerald-600 text-sm">
                          check_circle
                        </span>
                        <span className="font-medium truncate max-w-xs">{policyDocFile.name}</span>
                        <span className="text-[11px] text-zinc-400">
                          ({(policyDocFile.size / 1024).toFixed(0)} KB)
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setPolicyDocFile(null);
                            if (addDocInputRef.current) addDocInputRef.current.value = "";
                          }}
                          className="text-zinc-400 hover:text-red-500 text-xs"
                        >
                          <span className="material-symbols-outlined text-sm">close</span>
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-zinc-400 italic">Optional</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Informational Disclaimer */}
              <div className="p-3 bg-zinc-50 rounded-xl text-[11px] text-zinc-500 border border-zinc-200/60 leading-relaxed">
                <span className="font-semibold text-zinc-700">Privacy &amp; Security: </span>
                Uploaded documents are encrypted and accessible only by you. Teleconsultation visits remain self-paid; policy details are referenced when generating post-consultation reimbursement packets.
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={formSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-800 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#185A4D] hover:bg-[#13493E] rounded-xl shadow-xs transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {formSubmitting && (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  <span>Register Policy</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: VIEW POLICY DETAILS                                              */}
      {/* ========================================================================= */}
      {viewingPolicy && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-zinc-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#F0F5F7] text-[#185A4D] flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">verified</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900">Policy Details</h3>
                  <p className="text-[11px] text-zinc-500">{viewingPolicy.provider_name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingPolicy(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4 text-xs sm:text-sm">
              {/* Status Header Bar */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-50 border border-zinc-200">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-zinc-800">{viewingPolicy.provider_name}</span>
                  {viewingPolicy.provider_code && (
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-zinc-700 border border-zinc-200">
                      {viewingPolicy.provider_code}
                    </span>
                  )}
                </div>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                    viewingPolicy.status === "Active"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : viewingPolicy.status === "Expired"
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      viewingPolicy.status === "Active"
                        ? "bg-emerald-500"
                        : viewingPolicy.status === "Expired"
                        ? "bg-amber-500"
                        : "bg-zinc-400"
                    }`}
                  />
                  {viewingPolicy.status}
                </span>
              </div>

              {/* Details Grid */}
              <div className="grid grid-cols-2 gap-3 p-3.5 rounded-xl border border-zinc-100 bg-zinc-50/50 text-xs">
                <div>
                  <span className="text-zinc-400 block text-[11px]">Policy Number</span>
                  <span className="font-mono font-bold text-zinc-800 text-sm">
                    {viewingPolicy.policy_number_masked}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[11px]">Member ID</span>
                  <span className="font-mono font-medium text-zinc-700">
                    {viewingPolicy.member_id || "Not specified"}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[11px]">Policyholder Name</span>
                  <span className="font-semibold text-zinc-800">
                    {viewingPolicy.policy_holder_name}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[11px]">Relationship</span>
                  <span className="font-medium text-zinc-700">
                    {viewingPolicy.relationship || "Self"}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[11px]">Insurance Type</span>
                  <span className="font-medium text-zinc-700">
                    {viewingPolicy.insurance_type || "Individual"}
                  </span>
                </div>
                <div>
                  <span className="text-zinc-400 block text-[11px]">Policy Validity</span>
                  <span className="font-medium text-zinc-700">
                    {viewingPolicy.start_date || "—"} to {viewingPolicy.expiry_date || "—"}
                  </span>
                </div>
              </div>

              {/* Attached Documents Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
                  Attached Documents
                </h4>

                <div className="space-y-2">
                  {/* Card Document */}
                  {viewingPolicy.card_document ? (
                    <div className="p-3 rounded-xl border border-zinc-200 bg-white flex items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="material-symbols-outlined text-emerald-600 text-xl shrink-0">
                          badge
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-xs text-zinc-800 truncate">
                            {viewingPolicy.card_document.file_name}
                          </p>
                          <p className="text-[10px] text-zinc-400">
                            Insurance Card &bull;{" "}
                            {(viewingPolicy.card_document.size_bytes / 1024).toFixed(0)} KB
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePreviewDocument(viewingPolicy.card_document)}
                          className="px-2.5 py-1 text-xs font-semibold text-[#185A4D] bg-[#F0F5F7] rounded-lg hover:bg-[#e0ecef] transition flex items-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">visibility</span>
                          <span>Preview</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadDocument(viewingPolicy.card_document)}
                          className="p-1 text-zinc-500 hover:text-zinc-800 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
                          title="Download Card"
                        >
                          <span className="material-symbols-outlined text-base">download</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400 italic">No insurance card attached.</p>
                  )}

                  {/* Policy Document */}
                  {viewingPolicy.policy_document ? (
                    <div className="p-3 rounded-xl border border-zinc-200 bg-white flex items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="material-symbols-outlined text-sky-600 text-xl shrink-0">
                          description
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-xs text-zinc-800 truncate">
                            {viewingPolicy.policy_document.file_name}
                          </p>
                          <p className="text-[10px] text-zinc-400">
                            Policy Document &bull;{" "}
                            {(viewingPolicy.policy_document.size_bytes / 1024).toFixed(0)} KB
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePreviewDocument(viewingPolicy.policy_document)}
                          className="px-2.5 py-1 text-xs font-semibold text-[#185A4D] bg-[#F0F5F7] rounded-lg hover:bg-[#e0ecef] transition flex items-center gap-1 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">visibility</span>
                          <span>Preview</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadDocument(viewingPolicy.policy_document)}
                          className="p-1 text-zinc-500 hover:text-zinc-800 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
                          title="Download Policy Document"
                        >
                          <span className="material-symbols-outlined text-base">download</span>
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 bg-zinc-50 border-t border-zinc-200">
              <button
                type="button"
                onClick={() => {
                  const policyToEdit = viewingPolicy;
                  setViewingPolicy(null);
                  handleOpenEdit(policyToEdit);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:text-zinc-900 hover:bg-zinc-200/60 rounded-xl transition cursor-pointer flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">edit</span>
                <span>Edit Policy</span>
              </button>

              <button
                type="button"
                onClick={() => setViewingPolicy(null)}
                className="px-5 py-2 text-xs font-semibold text-white bg-[#185A4D] hover:bg-[#13493E] rounded-xl shadow-xs transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: EDIT POLICY                                                      */}
      {/* ========================================================================= */}
      {editingPolicy && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-zinc-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#F0F5F7] text-[#185A4D] flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">edit</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-zinc-900">Edit Insurance Policy</h3>
                  <p className="text-[11px] text-zinc-500">
                    {editingPolicy.provider_name} ({editingPolicy.policy_number_masked})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingPolicy(null)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4 text-xs sm:text-sm">
              {editError && (
                <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2">
                  <span className="material-symbols-outlined text-sm mt-0.5 shrink-0">error</span>
                  <span>{editError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Policyholder Name */}
                <div className="sm:col-span-2 space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Policyholder Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editForm.policy_holder_name}
                    onChange={(e) =>
                      setEditForm({ ...editForm, policy_holder_name: e.target.value })
                    }
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D]"
                  />
                </div>

                {/* Relationship */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Relationship
                  </label>
                  <select
                    value={editForm.relationship}
                    onChange={(e) => setEditForm({ ...editForm, relationship: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D] bg-white cursor-pointer"
                  >
                    {RELATIONSHIP_OPTIONS.map((rel) => (
                      <option key={rel} value={rel}>
                        {rel}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Insurance Type */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Insurance Type
                  </label>
                  <select
                    value={editForm.insurance_type}
                    onChange={(e) => setEditForm({ ...editForm, insurance_type: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D] bg-white cursor-pointer"
                  >
                    {INSURANCE_TYPE_OPTIONS.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Member ID */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Member ID
                  </label>
                  <input
                    type="text"
                    value={editForm.member_id}
                    onChange={(e) => setEditForm({ ...editForm, member_id: e.target.value })}
                    placeholder="e.g. MEM-12345"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D]"
                  />
                </div>

                {/* Start Date */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={editForm.start_date}
                    onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D] bg-white"
                  />
                </div>

                {/* Expiry Date */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Expiry Date
                  </label>
                  <input
                    type="date"
                    value={editForm.expiry_date}
                    onChange={(e) => setEditForm({ ...editForm, expiry_date: e.target.value })}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-zinc-300 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D] bg-white"
                  />
                </div>
              </div>

              {/* Replace / Update Attached Documents */}
              <div className="pt-2 border-t border-zinc-100 space-y-3">
                <div className="text-xs font-bold text-zinc-800 uppercase tracking-wider">
                  Update Attached Documents (Optional)
                </div>

                {/* Replace Card */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Replace Insurance Card File
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      ref={editCardInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => setEditCardFile(e.target.files[0] || null)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => editCardInputRef.current?.click()}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-zinc-700 bg-zinc-100 border border-zinc-200 hover:bg-zinc-200 transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">upload_file</span>
                      <span>{editCardFile ? "Change File" : "Choose New File"}</span>
                    </button>
                    {editCardFile && (
                      <span className="text-xs text-zinc-700 font-medium truncate max-w-xs">
                        {editCardFile.name}
                      </span>
                    )}
                  </div>
                </div>

                {/* Replace Policy Document */}
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-zinc-700">
                    Replace / Add Policy Document
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      ref={editDocInputRef}
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => setEditPolicyDocFile(e.target.files[0] || null)}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => editDocInputRef.current?.click()}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-semibold text-zinc-700 bg-zinc-100 border border-zinc-200 hover:bg-zinc-200 transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">attach_file</span>
                      <span>{editPolicyDocFile ? "Change File" : "Choose New File"}</span>
                    </button>
                    {editPolicyDocFile && (
                      <span className="text-xs text-zinc-700 font-medium truncate max-w-xs">
                        {editPolicyDocFile.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200">
                <button
                  type="button"
                  onClick={() => setEditingPolicy(null)}
                  disabled={editSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-800 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSubmitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#185A4D] hover:bg-[#13493E] rounded-xl shadow-xs transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {editSubmitting && (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: DOCUMENT PREVIEW MODAL                                           */}
      {/* ========================================================================= */}
      {previewDoc && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-zinc-200 overflow-hidden my-6 flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50/80 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="material-symbols-outlined text-[#185A4D] text-xl shrink-0">
                  {previewDoc.contentType?.includes("pdf") ? "picture_as_pdf" : "image"}
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
                  onClick={() => handleDownloadDocument({ id: previewDoc.id, file_name: previewDoc.name })}
                  className="px-3 py-1.5 text-xs font-semibold text-[#185A4D] bg-[#F0F5F7] rounded-lg hover:bg-[#e0ecef] transition flex items-center gap-1 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">download</span>
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={handleClosePreview}
                  className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
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
                <div className="text-center p-8 space-y-3">
                  <span className="material-symbols-outlined text-zinc-400 text-4xl">
                    draft
                  </span>
                  <p className="text-xs text-zinc-600 font-medium">
                    Inline preview not supported for this format.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleDownloadDocument({ id: previewDoc.id, file_name: previewDoc.name })}
                    className="px-4 py-2 text-xs font-semibold text-white bg-[#185A4D] rounded-xl hover:bg-[#13493E] transition cursor-pointer"
                  >
                    Download to View
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 bg-zinc-50 border-t border-zinc-200 text-right shrink-0">
              <button
                type="button"
                onClick={handleClosePreview}
                className="px-4 py-1.5 text-xs font-semibold text-zinc-700 bg-zinc-200/80 hover:bg-zinc-300 rounded-xl transition cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 5: CLAIM DETAILS & STATUS TIMELINE MODAL (CHECKPOINTS 7, 8, 9)     */}
      {/* ========================================================================= */}
      {viewingClaim && (() => {
        const modalBadge = getClaimStatusBadge(viewingClaim.status, viewingClaim.status_label);
        const isAddDocsRequired = viewingClaim.status === "additional_documents_required";
        const isApproved = viewingClaim.status === "approved";
        const isPartiallyApproved = viewingClaim.status === "partially_approved";
        const isRejected = viewingClaim.status === "rejected";

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-zinc-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50/80 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-9 h-9 rounded-xl bg-[#F0F5F7] text-[#185A4D] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-xl">receipt_long</span>
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-zinc-900 font-mono">
                        {viewingClaim.claim_reference}
                      </h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${modalBadge.cls}`}>
                        <span className="material-symbols-outlined text-xs">{modalBadge.icon}</span>
                        <span>{modalBadge.label}</span>
                      </span>
                    </div>
                    <p className="text-[11px] text-zinc-500">
                      Encounter {viewingClaim.appointment_display_id} &bull; {viewingClaim.provider_name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setViewingClaim(null)}
                  className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs text-zinc-800 leading-relaxed">
                {/* Claim Overview Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#F0F5F7]/70 p-4 rounded-xl border border-[#25836F]/20">
                  <div>
                    <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Claim Amount</span>
                    <span className="font-bold text-sm text-[#185A4D]">{viewingClaim.consultation_fee}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Payment Status</span>
                    <span className="font-semibold text-emerald-800 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs text-emerald-600">verified</span>
                      Verified (Razorpay)
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Insurer Reference</span>
                    <span className="font-mono font-bold text-zinc-800">
                      {viewingClaim.insurer_claim_reference || "Pending Submission"}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Policy Number</span>
                    <span className="font-mono font-semibold text-zinc-800">{viewingClaim.policy_number_masked}</span>
                  </div>
                </div>

                {/* PHASE 1 (F-01): PRE-FLIGHT CLAIM HEALTH & AUDIT CHECKER CARD */}
                <div className="p-4 rounded-xl border border-teal-200 bg-teal-50/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-teal-700 text-lg">health_and_safety</span>
                      <div>
                        <h5 className="font-bold text-xs text-teal-950 uppercase tracking-wider">
                          Pre-Flight Claim Health Audit
                        </h5>
                        <p className="text-[11px] text-teal-700">
                          Live prerequisite audit validating documentation, fees, and policy alignment.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {claimPreflightLoading ? (
                        <span className="text-[11px] text-teal-700 animate-pulse font-medium">Auditing claim...</span>
                      ) : claimPreflight ? (
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                          claimPreflight.readiness_score === 100
                            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : claimPreflight.readiness_score >= 70
                            ? "bg-amber-100 text-amber-800 border-amber-300"
                            : "bg-rose-100 text-rose-800 border-rose-300"
                        }`}>
                          {claimPreflight.readiness_score}% Readiness
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleRunPreflightAudit(viewingClaim.appointment_id, viewingClaim.policy_id)}
                        className="p-1 rounded hover:bg-teal-100 text-teal-800 cursor-pointer"
                        title="Re-run health check"
                      >
                        <span className="material-symbols-outlined text-base">refresh</span>
                      </button>
                    </div>
                  </div>

                  {claimPreflight && (
                    <div className="space-y-1.5">
                      <div className="w-full bg-zinc-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all duration-500 ${
                            claimPreflight.readiness_score === 100
                              ? "bg-emerald-600"
                              : claimPreflight.readiness_score >= 70
                              ? "bg-amber-500"
                              : "bg-rose-500"
                          }`}
                          style={{ width: `${claimPreflight.readiness_score}%` }}
                        />
                      </div>
                      <p className="text-[11px] text-zinc-700 font-medium">
                        {claimPreflight.summary_message}
                      </p>
                    </div>
                  )}

                  {claimPreflight?.checks && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      {claimPreflight.checks.map((check) => (
                        <div
                          key={check.key}
                          className={`p-2.5 rounded-lg border text-xs flex items-start gap-2 ${
                            check.passed
                              ? "bg-white border-emerald-200 text-zinc-800"
                              : check.severity === "error"
                              ? "bg-rose-50 border-rose-200 text-rose-900"
                              : "bg-amber-50 border-amber-200 text-amber-900"
                          }`}
                        >
                          <span
                            className={`material-symbols-outlined text-base shrink-0 mt-0.5 ${
                              check.passed
                                ? "text-emerald-600"
                                : check.severity === "error"
                                ? "text-rose-600"
                                : "text-amber-600"
                            }`}
                          >
                            {check.passed ? "check_circle" : check.severity === "error" ? "cancel" : "warning"}
                          </span>
                          <div className="space-y-0.5 min-w-0">
                            <span className="font-semibold block truncate">{check.title}</span>
                            <p className="text-[11px] opacity-85 leading-tight">{check.message}</p>
                            {!check.passed && check.action_hint && (
                              <p className="text-[10px] font-medium text-teal-800 mt-1 bg-teal-100/70 px-1.5 py-0.5 rounded">
                                Tip: {check.action_hint}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Insurer Submission Card */}
                {viewingClaim.insurer_claim_reference && (
                  <div className="p-4 rounded-xl bg-teal-50/70 border border-teal-200 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-xs text-teal-950">
                      <span className="material-symbols-outlined text-lg text-teal-700">send</span>
                      <span>Insurer Transmission Record (Checkpoint 9)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white/80 p-3 rounded-lg border border-teal-100 text-xs">
                      <div>
                        <span className="text-zinc-500 block text-[10px] uppercase font-bold">Insurer Claim Ref</span>
                        <span className="font-mono font-bold text-teal-900">{viewingClaim.insurer_claim_reference}</span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] uppercase font-bold">Submission Date</span>
                        <span className="font-semibold text-zinc-800">
                          {viewingClaim.insurer_submission_date ? new Date(viewingClaim.insurer_submission_date).toLocaleString() : "Recorded"}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 block text-[10px] uppercase font-bold">Transmission Method</span>
                        <span className="font-semibold text-zinc-800">{viewingClaim.insurer_submission_method || "Insurer Portal"}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Insurer Adjudication: Approved */}
                {isApproved && (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-xs text-emerald-950">
                      <span className="material-symbols-outlined text-lg text-emerald-600">check_circle</span>
                      <span>Claim Approved by {viewingClaim.provider_name}</span>
                    </div>
                    <div className="bg-white/90 p-3 rounded-lg border border-emerald-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block">Approved Settlement Amount</span>
                        <span className="text-base font-bold text-emerald-700">₹{viewingClaim.approved_amount}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block">Settlement Reference #</span>
                        <span className="font-mono font-bold text-zinc-800">{viewingClaim.settlement_reference || "N/A"}</span>
                      </div>
                    </div>
                    {viewingClaim.adjudication_notes && (
                      <p className="text-[11px] text-emerald-900 bg-white/50 p-2 rounded">
                        <strong>Insurer Remarks: </strong>{viewingClaim.adjudication_notes}
                      </p>
                    )}
                  </div>
                )}

                {/* Insurer Adjudication: Partially Approved */}
                {isPartiallyApproved && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-xs text-amber-950">
                      <span className="material-symbols-outlined text-lg text-amber-600">published_with_changes</span>
                      <span>Claim Partially Approved by {viewingClaim.provider_name}</span>
                    </div>
                    <div className="bg-white/90 p-3 rounded-lg border border-amber-200 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block">Approved Amount</span>
                        <span className="text-base font-bold text-amber-800">₹{viewingClaim.approved_amount}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-500 block">Settlement Reference #</span>
                        <span className="font-mono font-bold text-zinc-800">{viewingClaim.settlement_reference || "N/A"}</span>
                      </div>
                    </div>
                    {viewingClaim.co_pay_or_deduction_reason && (
                      <div className="p-2.5 rounded bg-white/70 border border-amber-200 text-xs text-amber-950 space-y-0.5">
                        <span className="font-bold block text-[10px] uppercase text-amber-800">Co-Pay / Non-Covered Deduction Reason</span>
                        <p>{viewingClaim.co_pay_or_deduction_reason}</p>
                      </div>
                    )}
                    {viewingClaim.adjudication_notes && (
                      <p className="text-[11px] text-amber-900">
                        <strong>Insurer Remarks: </strong>{viewingClaim.adjudication_notes}
                      </p>
                    )}
                  </div>
                )}

                {/* Insurer Adjudication: Rejected */}
                {isRejected && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-xs text-rose-950">
                      <span className="material-symbols-outlined text-lg text-rose-600">cancel</span>
                      <span>Claim Rejected by {viewingClaim.provider_name}</span>
                    </div>
                    <div className="bg-white/90 p-3 rounded-lg border border-rose-200 space-y-2 text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-rose-700 block">Official Rejection Reason</span>
                        <p className="font-semibold text-rose-950">{viewingClaim.rejection_reason}</p>
                      </div>
                      {viewingClaim.settlement_reference && (
                        <div>
                          <span className="text-[10px] uppercase font-bold text-zinc-500 block">Insurer Reference</span>
                          <span className="font-mono text-zinc-800">{viewingClaim.settlement_reference}</span>
                        </div>
                      )}
                    </div>
                    {viewingClaim.adjudication_notes && (
                      <p className="text-[11px] text-rose-900 bg-white/50 p-2 rounded">
                        <strong>Insurer Remarks: </strong>{viewingClaim.adjudication_notes}
                      </p>
                    )}
                  </div>
                )}

                {/* Insurer Action Required: Additional Documents Panel */}
                {isAddDocsRequired && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-xs text-amber-950">
                      <span className="material-symbols-outlined text-lg text-amber-600">upload_file</span>
                      <span>Action Required: Insurer Requested Additional Documents</span>
                    </div>

                    <div className="bg-white/90 p-3 rounded-lg border border-amber-200 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-amber-800 block">Documents / Information Requested by Insurer</span>
                      <p className="text-xs text-amber-950 font-medium">
                        {viewingClaim.requested_documents}
                      </p>
                    </div>

                    {/* Interactive File Upload Area */}
                    <div className="bg-white/90 p-3.5 rounded-lg border border-amber-200 space-y-3">
                      <span className="text-xs font-bold text-zinc-900 block">Upload Requested Document:</span>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[11px] text-zinc-600 block mb-1">Document Title / Description</label>
                          <input
                            type="text"
                            value={additionalDocTitle}
                            onChange={(e) => setAdditionalDocTitle(e.target.value)}
                            placeholder="e.g., Investigation Report, Discharge Sheet"
                            className="w-full p-2 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-900 focus:outline-none focus:ring-1 focus:ring-[#185A4D]"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] text-zinc-600 block mb-1">Select File (PDF, JPG, PNG &le; 10MB)</label>
                          <input
                            type="file"
                            ref={additionalDocInputRef}
                            accept=".pdf,.jpg,.jpeg,.png"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              setAdditionalDocFile(f || null);
                              if (f && !additionalDocTitle) {
                                setAdditionalDocTitle(f.name.replace(/\.[^/.]+$/, ""));
                              }
                            }}
                            className="w-full text-xs text-zinc-700 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#F0F5F7] file:text-[#185A4D] hover:file:bg-[#e0ecef] cursor-pointer"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          disabled={!additionalDocFile || uploadingAdditional}
                          onClick={() => handleUploadAdditionalDoc(viewingClaim.id)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#185A4D] hover:bg-[#13493E] disabled:opacity-50 text-white font-semibold text-xs shadow-xs transition cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">upload</span>
                          <span>{uploadingAdditional ? "Uploading..." : "Upload Document"}</span>
                        </button>
                      </div>
                    </div>

                    {/* Resubmit to Insurer Area */}
                    <div className="space-y-1.5 pt-1">
                      <label className="font-semibold text-xs text-zinc-800 block">
                        Response Notes to Insurer (Optional):
                      </label>
                      <textarea
                        rows={2}
                        value={additionalNotes}
                        onChange={(e) => setAdditionalNotes(e.target.value)}
                        placeholder="Add any clarifying remarks for the insurer claim reviewer..."
                        className="w-full p-2.5 bg-white border border-amber-200 rounded-lg text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={submittingAdditional}
                      onClick={() => handleSubmitAdditionalDocs(viewingClaim.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-xs shadow-xs transition cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">send</span>
                      <span>{submittingAdditional ? "Submitting..." : "Submit Additional Documents to Insurer"}</span>
                    </button>
                  </div>
                )}

                {/* Correction Required Alert & Resubmission Box (Checkpoint 8) */}
                {viewingClaim.status === "correction_required" && (
                  <div className="p-4 rounded-xl bg-rose-50 border border-rose-300 space-y-3">
                    <div className="flex items-center gap-2 font-bold text-xs text-rose-900">
                      <span className="material-symbols-outlined text-lg text-rose-600">warning</span>
                      <span>Correction Requested by Clinic Administration</span>
                    </div>
                    <div className="bg-white/90 p-3 rounded-lg border border-rose-200 space-y-1">
                      <span className="text-[10px] uppercase font-bold text-rose-600 block">Clinic Admin Remarks</span>
                      <p className="text-xs text-rose-950 font-medium">
                        {viewingClaim.verification_remarks || "Please review the notes and resubmit your claim dossier."}
                      </p>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <label className="font-semibold text-xs text-zinc-800 block">
                        Patient Response Notes / Clarifications:
                      </label>
                      <textarea
                        rows={2}
                        value={resubmitNotes}
                        onChange={(e) => setResubmitNotes(e.target.value)}
                        placeholder="Explain the changes made (e.g., 'Re-uploaded clearer insurance card document and verified member ID')..."
                        className="w-full p-2.5 bg-white border border-rose-200 rounded-lg text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={resubmitting}
                      onClick={() => handleResubmitClaim(viewingClaim.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold text-xs shadow-xs transition cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-sm">autorenew</span>
                      <span>{resubmitting ? "Resubmitting..." : "Submit Corrections & Resubmit"}</span>
                    </button>
                  </div>
                )}

                {/* Reimbursement Details Section (Checkpoint 10) */}
                {(viewingClaim.approved_amount || viewingClaim.reimbursement_status || isApproved || isPartiallyApproved || (viewingClaim.reimbursements && viewingClaim.reimbursements.length > 0)) && (
                  <div className="space-y-3 p-4 rounded-xl bg-teal-50/60 border border-teal-200/90 text-xs">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="w-7 h-7 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center shrink-0">
                          <span className="material-symbols-outlined text-base">payments</span>
                        </span>
                        <div>
                          <h4 className="font-bold text-xs text-teal-950 uppercase tracking-wider">
                            Reimbursement Settlement Details
                          </h4>
                          <span className="text-[11px] text-teal-800">
                            Post-consultation insurance reimbursement tracking (Checkpoint 10)
                          </span>
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border inline-flex items-center gap-1 ${
                          viewingClaim.reimbursement_status === "fully_reimbursed"
                            ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                            : viewingClaim.reimbursement_status === "partially_reimbursed"
                            ? "bg-sky-100 text-sky-900 border-sky-300"
                            : "bg-amber-100 text-amber-900 border-amber-300"
                        }`}
                      >
                        <span className="material-symbols-outlined text-xs">
                          {viewingClaim.reimbursement_status === "fully_reimbursed"
                            ? "check_circle"
                            : viewingClaim.reimbursement_status === "partially_reimbursed"
                            ? "timelapse"
                            : "schedule"}
                        </span>
                        <span>{viewingClaim.reimbursement_status_label || "Awaiting Reimbursement"}</span>
                      </span>
                    </div>

                    {/* Financial Ledger 5-Card Strip */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 bg-white/90 p-3 rounded-lg border border-teal-100">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block">Original Paid Fee</span>
                        <span className="font-bold text-xs text-[#185A4D]">{viewingClaim.consultation_fee}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block">Claim Amount</span>
                        <span className="font-bold text-xs text-zinc-800">{viewingClaim.consultation_fee}</span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block">Insurer Approved</span>
                        <span className="font-bold text-xs text-emerald-800">
                          {viewingClaim.approved_amount ? `₹${viewingClaim.approved_amount}` : "—"}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block">Reimbursed to You</span>
                        <span className="font-bold text-xs text-teal-900">
                          {viewingClaim.reimbursed_amount ? `₹${viewingClaim.reimbursed_amount}` : "₹0.00"}
                        </span>
                      </div>
                      <div className="col-span-2 sm:col-span-1">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 block">Pending Balance</span>
                        <span
                          className={`font-bold text-xs ${
                            viewingClaim.pending_reimbursement_amount && viewingClaim.pending_reimbursement_amount !== "0.00"
                              ? "text-amber-700"
                              : "text-emerald-700"
                          }`}
                        >
                          {viewingClaim.pending_reimbursement_amount
                            ? `₹${viewingClaim.pending_reimbursement_amount}`
                            : viewingClaim.approved_amount
                            ? `₹${viewingClaim.approved_amount}`
                            : "—"}
                        </span>
                      </div>
                    </div>

                    {/* Verified Transactions List */}
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-teal-950 uppercase tracking-wider">
                          Reimbursement Transactions ({viewingClaim.reimbursements?.length || 0})
                        </span>
                        <span className="text-[10px] text-teal-800">
                          Masked for security
                        </span>
                      </div>

                      {viewingClaim.reimbursements && viewingClaim.reimbursements.length > 0 ? (
                        <div className="space-y-2">
                          {viewingClaim.reimbursements.map((tx) => (
                            <div
                              key={tx.id}
                              className="p-3 rounded-lg border border-teal-100 bg-white/95 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs"
                            >
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-xs text-emerald-800">
                                    ₹{tx.amount}
                                  </span>
                                  <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-zinc-100 text-zinc-700 font-mono">
                                    {tx.payment_method_label || tx.payment_method}
                                  </span>
                                  <span className="font-mono text-xs font-semibold text-zinc-800">
                                    Ref: {tx.payment_reference_masked || tx.payment_reference}
                                  </span>
                                </div>
                                <div className="text-[11px] text-zinc-500 flex items-center gap-1.5 flex-wrap">
                                  <span>Date: <strong>{tx.reimbursement_date}</strong></span>
                                  {tx.notes && (
                                    <>
                                      <span>&bull;</span>
                                      <span className="italic">{tx.notes}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                                {tx.evidence_doc_id && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handlePreviewDocument({
                                          id: tx.evidence_doc_id,
                                          file_name: tx.evidence_file_name || "Reimbursement_Evidence.pdf",
                                        })
                                      }
                                      className="px-2.5 py-1 text-[11px] font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200 flex items-center gap-1 transition cursor-pointer"
                                    >
                                      <span className="material-symbols-outlined text-xs">visibility</span>
                                      <span>Preview</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleDownloadDocument({
                                          id: tx.evidence_doc_id,
                                          file_name: tx.evidence_file_name || "Reimbursement_Evidence.pdf",
                                        })
                                      }
                                      className="p-1 text-teal-700 hover:text-teal-950 rounded-lg hover:bg-teal-100 transition cursor-pointer"
                                      title="Download Evidence"
                                    >
                                      <span className="material-symbols-outlined text-sm">download</span>
                                    </button>
                                  </>
                                )}
                                {!tx.evidence_doc_id && tx.evidence_url && (
                                  <a
                                    href={tx.evidence_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2.5 py-1 text-[11px] font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200 flex items-center gap-1 transition"
                                  >
                                    <span className="material-symbols-outlined text-xs">attach_file</span>
                                    <span>Evidence</span>
                                  </a>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="p-3 rounded-lg border border-dashed border-teal-200 text-center text-teal-800/80 bg-white/50 text-[11px]">
                          Claim approved by insurer. Awaiting direct reimbursement deposit from {viewingClaim.provider_name}.
                        </div>
                      )}
                    </div>

                    {/* Explanatory Patient Note */}
                    <div className="p-2.5 rounded-lg bg-white/80 border border-teal-100 text-[11px] text-teal-900 leading-relaxed">
                      <strong>Payment Clarification: </strong>
                      Reimbursements are credited directly into your registered bank account by your insurance provider or authorized TPA. Kaizen Care does not process direct payments or refunds.
                    </div>
                  </div>
                )}

                {/* Status Timeline */}
                <div className="space-y-3">
                  <h4 className="font-bold text-xs text-[#185A4D] uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">timeline</span>
                    Claim Status &amp; Verification Timeline
                  </h4>

                  <div className="p-4 rounded-xl border border-zinc-200 bg-white space-y-3">
                    {viewingClaim.timeline && viewingClaim.timeline.length > 0 ? (
                      <div className="space-y-3 relative before:absolute before:left-3.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-zinc-200">
                        {viewingClaim.timeline.map((entry, idx) => (
                          <div key={idx} className="flex items-start gap-3 relative">
                            <span className="w-7 h-7 rounded-full bg-[#185A4D] text-white flex items-center justify-center shrink-0 z-10 shadow-2xs">
                              <span className="material-symbols-outlined text-xs">
                                {entry.status === "draft"
                                  ? "edit_note"
                                  : entry.status === "pending_document_verification"
                                  ? "hourglass_top"
                                  : entry.status === "ready_for_submission"
                                  ? "task_alt"
                                  : entry.status === "submitted_to_insurer"
                                  ? "send"
                                  : entry.status === "under_insurer_review"
                                  ? "query_stats"
                                  : entry.status === "additional_documents_required"
                                  ? "upload_file"
                                  : entry.status === "approved"
                                  ? "check_circle"
                                  : entry.status === "partially_approved"
                                  ? "published_with_changes"
                                  : entry.status === "rejected"
                                  ? "cancel"
                                  : "flag"}
                              </span>
                            </span>
                            <div className="min-w-0 space-y-0.5 pt-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-xs text-zinc-900">{entry.title}</span>
                                <span className="text-[10px] text-zinc-400 font-mono">
                                  {new Date(entry.occurred_at).toLocaleString()}
                                </span>
                              </div>
                              <p className="text-[11px] text-zinc-600 leading-relaxed">
                                {entry.description}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-zinc-500 italic">Timeline record initialized.</p>
                    )}
                  </div>
                </div>

                {/* Attached Supporting Documents */}
                <div className="space-y-2">
                  <h4 className="font-bold text-xs text-[#185A4D] uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">folder_open</span>
                    Attached Supporting Documents ({viewingClaim.documents?.length || 0})
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {viewingClaim.documents?.map((doc) => (
                      <div
                        key={doc.id}
                        className="p-2.5 rounded-lg border border-zinc-200 bg-zinc-50 flex items-center justify-between gap-2"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined text-base text-[#185A4D] shrink-0">
                            description
                          </span>
                          <div className="min-w-0">
                            <span className="font-semibold text-[11px] text-zinc-900 truncate block">
                              {doc.title}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {doc.category}
                            </span>
                          </div>
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                          {doc.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Regulatory & Audit Note */}
                <div className="p-3 rounded-xl bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-600 space-y-1">
                  <p>
                    <strong>Audit Notice: </strong>
                    Claim status, adjudication amounts and external submission records are recorded directly from official insurer communications.
                  </p>
                  <p className="text-[10px] text-zinc-400 font-mono">
                    Consent Ref: {viewingClaim.consent_id} &bull; Version: {viewingClaim.consent_version}
                  </p>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-end px-6 py-3 border-t border-zinc-200 bg-zinc-50/80 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewingClaim(null)}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#185A4D] hover:bg-[#13493E] rounded-xl shadow-xs transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
