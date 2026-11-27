import { useEffect, useState } from "react";
import { insuranceApi } from "../../../lib/api";
import { useToast } from "../../common/Toast";

export default function InsuranceClaimsTab({ initialClaimId = null }) {
  const { showToast } = useToast();

  // State: Claims data & KPIs
  const [claims, setClaims] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;
  const [stats, setStats] = useState({
    total: 0,
    pending_verification: 0,
    correction_required: 0,
    ready_for_submission: 0,
    submitted_to_insurer: 0,
    under_insurer_review: 0,
    additional_documents_required: 0,
    approved: 0,
    partially_approved: 0,
    rejected: 0,
    draft: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedProvider, setSelectedProvider] = useState("all");
  const [activeProviders, setActiveProviders] = useState([]);

  // Verification Modal State (Checkpoint 8)
  const [selectedClaimId, setSelectedClaimId] = useState(null);
  const [claimDetail, setClaimDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [verificationRemarks, setVerificationRemarks] = useState("");
  const [documentDecisions, setDocumentDecisions] = useState({});
  const [verifying, setVerifying] = useState(false);

  // Submit to Insurer Modal State (Checkpoint 9)
  const [submitModalClaimId, setSubmitModalClaimId] = useState(null);
  const [docPackage, setDocPackage] = useState(null);
  const [packageLoading, setPackageLoading] = useState(false);
  const [submitForm, setSubmitForm] = useState({
    insurer_claim_reference: "",
    submission_method: "portal",
    submission_date: new Date().toISOString().slice(0, 10),
    acknowledgment_document: "",
    notes: "",
  });
  const [submittingToInsurer, setSubmittingToInsurer] = useState(false);

  // Insurer Status Update Modal State (Checkpoint 9)
  const [statusModalClaim, setStatusModalClaim] = useState(null);
  const [statusUpdateForm, setStatusUpdateForm] = useState({
    status: "under_insurer_review",
    requested_documents: "",
    approved_amount: "",
    co_pay_or_deduction_reason: "",
    rejection_reason: "",
    settlement_reference: "",
    evidence_document: "",
    notes: "",
  });
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Reimbursement Modal State (Checkpoint 10)
  const [reimbursementModalClaim, setReimbursementModalClaim] = useState(null);
  const [reimbursementSummary, setReimbursementSummary] = useState(null);
  const [reimbursementLoading, setReimbursementLoading] = useState(false);
  const [reimbursementForm, setReimbursementForm] = useState({
    reimbursement_amount: "",
    reimbursement_date: new Date().toISOString().slice(0, 10),
    payment_reference: "",
    payment_method: "direct_bank_transfer",
    supporting_evidence_id: "",
    notes: "",
  });
  const [evidenceFileName, setEvidenceFileName] = useState("");
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [recordingReimbursement, setRecordingReimbursement] = useState(false);

  // Load Active Providers for Filter
  useEffect(() => {
    insuranceApi
      .getActiveProviders()
      .then((data) => setActiveProviders(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Fetch Claims Queue
  const fetchClaims = async (page = currentPage) => {
    setLoading(true);
    setError(null);
    try {
      const data = await insuranceApi.listClinicAdminClaims({
        search: searchTerm,
        status: selectedStatus,
        provider_id: selectedProvider,
        page,
        limit: pageSize,
      });
      setClaims(data?.items || []);
      setTotal(data?.total || 0);
      setTotalPages(data?.total_pages || 1);
      if (data?.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      setError(err.message || "Failed to load insurance claims queue.");
      showToast(err.message || "Failed to load claims.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClaims(currentPage);
  }, [currentPage, selectedStatus, selectedProvider]);

  useEffect(() => {
    if (initialClaimId) {
      handleOpenVerification(initialClaimId);
    }
  }, [initialClaimId]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchClaims(1);
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedStatus("all");
    setSelectedProvider("all");
    setCurrentPage(1);
  };

  // Open Claim Verification / Audit Modal
  const handleOpenVerification = async (claimId) => {
    setSelectedClaimId(claimId);
    setDetailLoading(true);
    setVerificationRemarks("");
    setDocumentDecisions({});
    try {
      const detail = await insuranceApi.getClinicAdminClaimDetail(claimId);
      setClaimDetail(detail);
      const initialDecisions = {};
      (detail.documents || []).forEach((d) => {
        initialDecisions[d.id] = {
          status: d.verification_status === "rejected" ? "rejected" : "verified",
          remarks: d.verification_remarks || "",
        };
      });
      setDocumentDecisions(initialDecisions);
      if (detail.verification_remarks) {
        setVerificationRemarks(detail.verification_remarks);
      }
    } catch (err) {
      showToast(err.message || "Failed to retrieve claim details.", "error");
      setSelectedClaimId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleCloseVerification = () => {
    setSelectedClaimId(null);
    setClaimDetail(null);
    setVerificationRemarks("");
    setDocumentDecisions({});
  };

  // Toggle Document Verification Status
  const handleToggleDocStatus = (docId, newStatus) => {
    setDocumentDecisions((prev) => ({
      ...prev,
      [docId]: {
        ...(prev[docId] || {}),
        status: newStatus,
      },
    }));
  };

  const handleDocRemarkChange = (docId, remarks) => {
    setDocumentDecisions((prev) => ({
      ...prev,
      [docId]: {
        ...(prev[docId] || {}),
        remarks,
      },
    }));
  };

  // Execute Verification Decision
  const handleExecuteVerification = async (action) => {
    if (!claimDetail) return;

    if (action === "request_correction") {
      if (!verificationRemarks.trim()) {
        showToast("Please provide mandatory correction remarks explaining the issue to the patient.", "error");
        return;
      }
    }

    if (action === "mark_ready") {
      const hasRejected = Object.values(documentDecisions).some((d) => d.status === "rejected");
      if (hasRejected) {
        showToast("Cannot mark claim as Ready for Submission while one or more documents are marked as Rejected. Please request corrections instead.", "error");
        return;
      }
    }

    setVerifying(true);
    try {
      const payloadDecisions = Object.entries(documentDecisions).map(([document_id, decision]) => ({
        document_id,
        status: decision.status,
        remarks: decision.remarks ? decision.remarks.trim() : null,
      }));

      const res = await insuranceApi.verifyClinicAdminClaim(claimDetail.id, {
        action,
        remarks: verificationRemarks.trim() || null,
        document_decisions: payloadDecisions,
      });

      showToast(res.message || "Claim verification completed successfully.", "success");
      handleCloseVerification();
      fetchClaims(currentPage);
    } catch (err) {
      showToast(err.message || "Failed to submit verification decision.", "error");
    } finally {
      setVerifying(false);
    }
  };

  // =========================================================================
  // CHECKPOINT 9: SUBMIT TO INSURER ACTIONS
  // =========================================================================
  const handleOpenSubmitToInsurer = async (claimId) => {
    setSubmitModalClaimId(claimId);
    setPackageLoading(true);
    setSubmitForm({
      insurer_claim_reference: "",
      submission_method: "portal",
      submission_date: new Date().toISOString().slice(0, 10),
      acknowledgment_document: "",
      notes: "",
    });
    try {
      const pkg = await insuranceApi.getClaimDocumentPackage(claimId);
      setDocPackage(pkg);
    } catch (err) {
      showToast(err.message || "Unable to load claim document package. Active patient consent may be missing.", "error");
      setSubmitModalClaimId(null);
    } finally {
      setPackageLoading(false);
    }
  };

  const handleCloseSubmitToInsurer = () => {
    setSubmitModalClaimId(null);
    setDocPackage(null);
  };

  const handleExecuteSubmitToInsurer = async (e) => {
    e.preventDefault();
    if (!submitForm.insurer_claim_reference.trim()) {
      showToast("Insurer Claim Reference Number is required before marking as submitted.", "error");
      return;
    }

    setSubmittingToInsurer(true);
    try {
      const res = await insuranceApi.submitClaimToInsurer(submitModalClaimId, {
        insurer_claim_reference: submitForm.insurer_claim_reference.trim(),
        submission_method: submitForm.submission_method,
        submission_date: submitForm.submission_date,
        acknowledgment_document: submitForm.acknowledgment_document.trim() || null,
        notes: submitForm.notes.trim() || null,
      });
      showToast(res.message || "Claim successfully submitted to insurer!", "success");
      handleCloseSubmitToInsurer();
      fetchClaims(currentPage);
    } catch (err) {
      showToast(err.message || "Failed to submit claim to insurer.", "error");
    } finally {
      setSubmittingToInsurer(false);
    }
  };

  // =========================================================================
  // CHECKPOINT 9: UPDATE INSURER STATUS ACTIONS
  // =========================================================================
  const handleOpenStatusModal = (claim) => {
    setStatusModalClaim(claim);
    setStatusUpdateForm({
      status: claim.status === "submitted_to_insurer" ? "under_insurer_review" : claim.status,
      requested_documents: "",
      approved_amount: claim.consultation_fee || "",
      co_pay_or_deduction_reason: "",
      rejection_reason: "",
      settlement_reference: "",
      evidence_document: "",
      notes: "",
    });
  };

  const handleCloseStatusModal = () => {
    setStatusModalClaim(null);
  };

  const handleExecuteStatusUpdate = async (e) => {
    e.preventDefault();
    if (!statusModalClaim) return;

    const { status, requested_documents, approved_amount, co_pay_or_deduction_reason, rejection_reason, settlement_reference, evidence_document, notes } = statusUpdateForm;

    if (status === "additional_documents_required" && !requested_documents.trim()) {
      showToast("Please specify the requested documents or insurer query.", "error");
      return;
    }
    if (status === "approved") {
      if (!approved_amount.trim()) {
        showToast("Approved amount is required.", "error");
        return;
      }
      if (!settlement_reference.trim()) {
        showToast("Insurer settlement letter or reference is required.", "error");
        return;
      }
    }
    if (status === "partially_approved") {
      if (!approved_amount.trim()) {
        showToast("Approved amount is required.", "error");
        return;
      }
      if (!co_pay_or_deduction_reason.trim()) {
        showToast("Co-pay or deduction reason is required for partial approvals.", "error");
        return;
      }
      if (!settlement_reference.trim()) {
        showToast("Insurer settlement reference is required.", "error");
        return;
      }
    }
    if (status === "rejected") {
      if (!rejection_reason.trim()) {
        showToast("Formal rejection reason is required.", "error");
        return;
      }
      if (!settlement_reference.trim()) {
        showToast("Insurer rejection notice reference is required.", "error");
        return;
      }
    }

    setUpdatingStatus(true);
    try {
      const res = await insuranceApi.updateInsurerClaimStatus(statusModalClaim.id, {
        status,
        requested_documents: requested_documents.trim() || null,
        approved_amount: approved_amount.trim() || null,
        co_pay_or_deduction_reason: co_pay_or_deduction_reason.trim() || null,
        rejection_reason: rejection_reason.trim() || null,
        settlement_reference: settlement_reference.trim() || null,
        evidence_document: evidence_document.trim() || null,
        notes: notes.trim() || null,
      });
      showToast(res.message || "Claim status updated successfully.", "success");
      handleCloseStatusModal();
      fetchClaims(currentPage);
    } catch (err) {
      showToast(err.message || "Failed to update claim status.", "error");
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Reimbursement Handlers (Checkpoint 10)
  const handleOpenReimbursementModal = async (claim) => {
    setReimbursementModalClaim(claim);
    setReimbursementLoading(true);
    setEvidenceFileName("");
    try {
      const summary = await insuranceApi.getClaimReimbursements(claim.id);
      setReimbursementSummary(summary);
      setReimbursementForm({
        reimbursement_amount: summary.pending_reimbursement_amount || "",
        reimbursement_date: new Date().toISOString().slice(0, 10),
        payment_reference: "",
        payment_method: "direct_bank_transfer",
        supporting_evidence_id: "",
        notes: "",
      });
    } catch (err) {
      showToast(err.message || "Failed to load reimbursement details.", "error");
    } finally {
      setReimbursementLoading(false);
    }
  };

  const handleCloseReimbursementModal = () => {
    setReimbursementModalClaim(null);
    setReimbursementSummary(null);
    setEvidenceFileName("");
  };

  const handleUploadReimbursementEvidence = async (file) => {
    if (!file || !reimbursementModalClaim) return;
    const ext = "." + file.name.split(".").pop().toLowerCase();
    if (![".pdf", ".jpg", ".jpeg", ".png"].includes(ext)) {
      showToast("Only PDF, JPG, and PNG files are allowed.", "error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast("File size exceeds the 10 MB limit.", "error");
      return;
    }

    setUploadingEvidence(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await insuranceApi.uploadReimbursementEvidence(reimbursementModalClaim.id, formData);
      setReimbursementForm((prev) => ({ ...prev, supporting_evidence_id: res.id }));
      setEvidenceFileName(res.file_name || file.name);
      showToast("Payment evidence document uploaded successfully.", "success");
    } catch (err) {
      showToast(err.message || "Failed to upload payment evidence.", "error");
    } finally {
      setUploadingEvidence(false);
    }
  };

  const handleSubmitReimbursement = async (e) => {
    e.preventDefault();
    if (!reimbursementModalClaim) return;

    const amt = parseFloat(reimbursementForm.reimbursement_amount);
    if (isNaN(amt) || amt <= 0) {
      showToast("Please enter a valid reimbursement amount greater than zero.", "error");
      return;
    }

    if (reimbursementSummary) {
      const pending = parseFloat(reimbursementSummary.pending_reimbursement_amount || "0");
      if (amt > pending) {
        showToast(`Amount exceeds remaining pending balance of ₹${pending.toFixed(2)}.`, "error");
        return;
      }
    }

    if (!reimbursementForm.payment_reference.trim()) {
      showToast("Transaction / Payment reference is mandatory.", "error");
      return;
    }
    if (!reimbursementForm.reimbursement_date) {
      showToast("Reimbursement date is required.", "error");
      return;
    }
    if (!reimbursementForm.supporting_evidence_id) {
      showToast("Supporting evidence document (bank remittance advice or insurer payment receipt) is mandatory.", "error");
      return;
    }

    setRecordingReimbursement(true);
    try {
      const res = await insuranceApi.recordClaimReimbursement(reimbursementModalClaim.id, {
        reimbursement_amount: amt.toFixed(2),
        reimbursement_date: reimbursementForm.reimbursement_date,
        payment_reference: reimbursementForm.payment_reference.trim(),
        payment_method: reimbursementForm.payment_method,
        supporting_evidence_id: reimbursementForm.supporting_evidence_id || null,
        notes: reimbursementForm.notes.trim() || null,
      });
      showToast(res.message || "Reimbursement recorded successfully!", "success");

      // Refresh modal summary and claims list
      const updatedSummary = await insuranceApi.getClaimReimbursements(reimbursementModalClaim.id);
      setReimbursementSummary(updatedSummary);
      setReimbursementForm({
        reimbursement_amount: updatedSummary.pending_reimbursement_amount || "",
        reimbursement_date: new Date().toISOString().slice(0, 10),
        payment_reference: "",
        payment_method: "direct_bank_transfer",
        supporting_evidence_id: "",
        notes: "",
      });
      setEvidenceFileName("");
      fetchClaims(currentPage);
    } catch (err) {
      showToast(err.message || "Failed to record reimbursement.", "error");
    } finally {
      setRecordingReimbursement(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-xs">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#F0F5F7] text-[#185A4D] mb-2">
            <span className="material-symbols-outlined text-sm">verified_user</span>
            Checkpoint 10 &bull; Patient Reimbursement Tracking
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-[#185A4D] text-3xl">local_hospital</span>
            Insurance Claims Management
          </h2>
          <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
            Audit clinical records, verify patient consent, transmit authorized packages to insurers, and record patient reimbursement settlements.
          </p>
        </div>

        <button
          type="button"
          onClick={() => fetchClaims(currentPage)}
          className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition shadow-2xs cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-base">refresh</span>
          <span>Refresh Queue</span>
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {/* Pending Verification */}
        <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-amber-800 uppercase">Pending Audit</span>
            <span className="material-symbols-outlined text-amber-600 text-lg">hourglass_top</span>
          </div>
          <div className="text-xl font-bold text-amber-950 mt-1">{stats.pending_verification || 0}</div>
          <div className="text-[10px] text-amber-600">Awaiting Clinic Admin</div>
        </div>

        {/* Correction Required */}
        <div className="bg-white p-4 rounded-xl border border-rose-200 bg-rose-50/20 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-rose-800 uppercase">Correction</span>
            <span className="material-symbols-outlined text-rose-600 text-lg">warning</span>
          </div>
          <div className="text-xl font-bold text-rose-950 mt-1">{stats.correction_required || 0}</div>
          <div className="text-[10px] text-rose-600">Patient Action Needed</div>
        </div>

        {/* Ready for Submission */}
        <div className="bg-white p-4 rounded-xl border border-emerald-300 bg-emerald-50/30 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-emerald-800 uppercase">Ready to Submit</span>
            <span className="material-symbols-outlined text-emerald-600 text-lg">send</span>
          </div>
          <div className="text-xl font-bold text-emerald-950 mt-1">{stats.ready_for_submission || 0}</div>
          <div className="text-[10px] text-emerald-600">Verified by Admin</div>
        </div>

        {/* Submitted / Under Review */}
        <div className="bg-white p-4 rounded-xl border border-sky-200 bg-sky-50/20 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-sky-800 uppercase">With Insurer</span>
            <span className="material-symbols-outlined text-sky-600 text-lg">published_with_changes</span>
          </div>
          <div className="text-xl font-bold text-sky-950 mt-1">
            {(stats.submitted_to_insurer || 0) + (stats.under_insurer_review || 0) + (stats.additional_documents_required || 0)}
          </div>
          <div className="text-[10px] text-sky-600">Submitted &amp; In Review</div>
        </div>

        {/* Approved Claims */}
        <div className="bg-white p-4 rounded-xl border border-teal-200 bg-teal-50/20 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-teal-800 uppercase">Approved</span>
            <span className="material-symbols-outlined text-teal-600 text-lg">task_alt</span>
          </div>
          <div className="text-xl font-bold text-teal-950 mt-1">
            {(stats.approved || 0) + (stats.partially_approved || 0)}
          </div>
          <div className="text-[10px] text-teal-600">Insurer Adjudicated</div>
        </div>

        {/* Total Active Submissions */}
        <div className="bg-white p-4 rounded-xl border border-zinc-200/80 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-zinc-500 uppercase">Total Claims</span>
            <span className="material-symbols-outlined text-zinc-500 text-lg">receipt_long</span>
          </div>
          <div className="text-xl font-bold text-zinc-900 mt-1">{stats.total || 0}</div>
          <div className="text-[10px] text-zinc-400">Claims in Lifecycle</div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 text-lg">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by Claim Ref, Insurer Ref, Patient Name, Doctor, or Policy..."
              className="w-full pl-10 pr-4 py-2 bg-zinc-50/60 border border-zinc-200 rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D] transition"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 bg-zinc-50/60 border border-zinc-200 rounded-xl text-xs text-zinc-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 cursor-pointer"
            >
              <option value="all">All Claim Statuses</option>
              <option value="pending_document_verification">Pending Verification</option>
              <option value="correction_required">Correction Required</option>
              <option value="ready_for_submission">Ready for Submission</option>
              <option value="submitted_to_insurer">Submitted to Insurer</option>
              <option value="under_insurer_review">Under Insurer Review</option>
              <option value="additional_documents_required">Additional Documents Required</option>
              <option value="approved">Approved</option>
              <option value="partially_approved">Partially Approved</option>
              <option value="rejected">Rejected</option>
            </select>

            {/* Provider Filter */}
            <select
              value={selectedProvider}
              onChange={(e) => {
                setSelectedProvider(e.target.value);
                setCurrentPage(1);
              }}
              className="px-3 py-2 bg-zinc-50/60 border border-zinc-200 rounded-xl text-xs text-zinc-700 font-medium focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 cursor-pointer max-w-[200px] truncate"
            >
              <option value="all">All Insurance Providers</option>
              {activeProviders.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.provider_name}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="px-4 py-2 bg-[#185A4D] text-white rounded-xl text-xs font-semibold hover:bg-[#13493E] transition cursor-pointer"
            >
              Filter
            </button>

            {(searchTerm || selectedStatus !== "all" || selectedProvider !== "all") && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3 py-2 border border-zinc-200 text-zinc-600 rounded-xl text-xs font-semibold hover:bg-zinc-50 transition cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Claims Data Table */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <span className="material-symbols-outlined text-4xl text-[#185A4D] animate-spin">
              progress_activity
            </span>
            <p className="text-xs font-semibold text-zinc-600">Loading claims lifecycle queue...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center space-y-3">
            <span className="material-symbols-outlined text-4xl text-rose-500">error</span>
            <p className="text-xs font-semibold text-rose-700">{error}</p>
            <button
              type="button"
              onClick={() => fetchClaims(currentPage)}
              className="px-4 py-2 bg-[#185A4D] text-white rounded-xl text-xs font-semibold"
            >
              Retry
            </button>
          </div>
        ) : claims.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">inbox</span>
            </div>
            <h3 className="text-sm font-bold text-zinc-900">No Claims Found</h3>
            <p className="text-xs text-zinc-500 max-w-sm mx-auto">
              No claims match the selected criteria. Try adjusting your search or status filter.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50/75 text-zinc-600 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="py-3 px-4">Claim Reference</th>
                  <th className="py-3 px-4">Patient</th>
                  <th className="py-3 px-4">Insurance Provider</th>
                  <th className="py-3 px-4">Insurer Ref #</th>
                  <th className="py-3 px-4">Fee / Approved</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {claims.map((claim) => {
                  const isPending = claim.status === "pending_document_verification";
                  const isCorrection = claim.status === "correction_required";
                  const isReady = claim.status === "ready_for_submission";
                  const isSubmitted = claim.status === "submitted_to_insurer";
                  const isReview = claim.status === "under_insurer_review";
                  const isAddDocs = claim.status === "additional_documents_required";
                  const isApproved = claim.status === "approved" || claim.status === "partially_approved";
                  const isRejected = claim.status === "rejected";

                  return (
                    <tr key={claim.id} className="hover:bg-zinc-50/50 transition">
                      <td className="py-3.5 px-4 font-mono font-bold text-zinc-900">
                        <div>{claim.claim_reference}</div>
                        <span className="text-[10px] text-zinc-400 font-normal block font-sans">
                          {claim.appointment_display_id} &bull; {new Date(claim.consultation_date).toLocaleDateString()}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-zinc-900">{claim.patient_name}</div>
                        <div className="text-[11px] text-zinc-500">
                          {claim.patient_phone || claim.patient_email || `ID: ${claim.patient_id.slice(-6)}`}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-zinc-800">{claim.provider_name}</div>
                        <div className="text-[11px] font-mono text-zinc-500">{claim.policy_number_masked}</div>
                      </td>

                      <td className="py-3.5 px-4 font-mono">
                        {claim.insurer_claim_reference ? (
                          <span className="font-bold text-zinc-800 bg-zinc-100 px-2 py-0.5 rounded text-[11px] border border-zinc-200">
                            {claim.insurer_claim_reference}
                          </span>
                        ) : (
                          <span className="text-zinc-400 italic">Not Submitted</span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[#185A4D]">{claim.consultation_fee}</div>
                        {claim.approved_amount && (
                          <div className="text-[10px] font-semibold text-emerald-700">
                            Appr: {claim.approved_amount}
                          </div>
                        )}
                        {claim.reimbursement_status && (
                          <div className="mt-1">
                            <span
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold border ${
                                claim.reimbursement_status === "fully_reimbursed"
                                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                  : claim.reimbursement_status === "partially_reimbursed"
                                  ? "bg-sky-50 text-sky-800 border-sky-200"
                                  : "bg-amber-50 text-amber-800 border-amber-200"
                              }`}
                            >
                              <span className="material-symbols-outlined text-[10px]">
                                {claim.reimbursement_status === "fully_reimbursed"
                                  ? "check"
                                  : claim.reimbursement_status === "partially_reimbursed"
                                  ? "timelapse"
                                  : "schedule"}
                              </span>
                              <span>{claim.reimbursement_status_label || claim.reimbursement_status}</span>
                            </span>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                            isPending
                              ? "bg-amber-100 text-amber-900 border-amber-300"
                              : isCorrection
                              ? "bg-rose-100 text-rose-900 border-rose-300"
                              : isReady
                              ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                              : isSubmitted
                              ? "bg-sky-100 text-sky-900 border-sky-300"
                              : isReview
                              ? "bg-indigo-100 text-indigo-900 border-indigo-300"
                              : isAddDocs
                              ? "bg-orange-100 text-orange-900 border-orange-300"
                              : isApproved
                              ? "bg-teal-100 text-teal-900 border-teal-300"
                              : isRejected
                              ? "bg-red-100 text-red-900 border-red-300"
                              : "bg-zinc-100 text-zinc-700 border-zinc-200"
                          }`}
                        >
                          <span className="material-symbols-outlined text-xs">
                            {isPending
                              ? "hourglass_top"
                              : isCorrection
                              ? "warning"
                              : isReady
                              ? "send"
                              : isSubmitted
                              ? "outgoing_mail"
                              : isReview
                              ? "find_in_page"
                              : isAddDocs
                              ? "help_center"
                              : isApproved
                              ? "check_circle"
                              : isRejected
                              ? "cancel"
                              : "info"}
                          </span>
                          <span>{claim.status_label || claim.status}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {/* If Ready for Submission -> Show Submit to Insurer */}
                          {isReady && (
                            <button
                              type="button"
                              onClick={() => handleOpenSubmitToInsurer(claim.id)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#185A4D] text-white hover:bg-[#13493E] font-semibold text-xs shadow-xs transition cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-sm">send</span>
                              <span>Submit to Insurer</span>
                            </button>
                          )}

                          {/* If with insurer -> Show Update Status */}
                          {(isSubmitted || isReview || isAddDocs) && (
                            <button
                              type="button"
                              onClick={() => handleOpenStatusModal(claim)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-sky-700 text-white hover:bg-sky-800 font-semibold text-xs shadow-xs transition cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-sm">edit_calendar</span>
                              <span>Update Status</span>
                            </button>
                          )}

                          {/* If Approved or Partially Approved -> Show Record Reimbursement */}
                          {isApproved && (
                            <button
                              type="button"
                              onClick={() => handleOpenReimbursementModal(claim)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-teal-700 text-white hover:bg-teal-800 font-semibold text-xs shadow-xs transition cursor-pointer"
                            >
                              <span className="material-symbols-outlined text-sm">payments</span>
                              <span>Reimbursement</span>
                            </button>
                          )}

                          {/* Verification or Details View */}
                          <button
                            type="button"
                            onClick={() => handleOpenVerification(claim.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#F0F5F7] text-[#185A4D] hover:bg-[#e0ecef] font-semibold text-xs transition cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-sm">
                              {isPending || isCorrection ? "fact_check" : "visibility"}
                            </span>
                            <span>{isPending || isCorrection ? "Verify" : "Details"}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {claims.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-zinc-200 bg-zinc-50/60 text-xs">
            <span className="text-zinc-500">
              Showing Page <strong className="text-zinc-800">{currentPage}</strong> of{" "}
              <strong className="text-zinc-800">{totalPages}</strong> ({total} total claims)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 bg-white font-semibold text-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-50 transition cursor-pointer"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 rounded-lg border border-zinc-200 bg-white font-semibold text-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-50 transition cursor-pointer"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* MODAL 1: SUBMIT TO INSURER MODAL (CHECKPOINT 9)                           */}
      {/* ========================================================================= */}
      {submitModalClaimId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-zinc-200 overflow-hidden my-6 flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
            {packageLoading || !docPackage ? (
              <div className="p-16 text-center space-y-3">
                <span className="material-symbols-outlined text-4xl text-[#185A4D] animate-spin">
                  progress_activity
                </span>
                <p className="text-xs font-semibold text-zinc-600">
                  Validating patient consent and compiling authorized claim package...
                </p>
              </div>
            ) : (
              <form onSubmit={handleExecuteSubmitToInsurer} className="flex flex-col flex-1 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50/80 shrink-0">
                  <div className="flex items-center gap-2.5">
                    <span className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-2xl">send</span>
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-zinc-900 font-mono">
                          {docPackage.claim_reference}
                        </h3>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          Ready for Submission
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Target Insurer: <strong>{docPackage.provider_name}</strong> &bull; Patient: <strong>{docPackage.patient_name}</strong>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseSubmitToInsurer}
                    className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-xl">close</span>
                  </button>
                </div>

                {/* Body */}
                <div className="p-6 overflow-y-auto flex-1 space-y-5 text-xs text-zinc-800 leading-relaxed">
                  {/* Insurer Submission Details from Master */}
                  <div className="p-4 rounded-xl border border-zinc-200 bg-zinc-50/60 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-[#185A4D] uppercase tracking-wider flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-base">domain</span>
                        Official Insurer Submission Channel
                      </h4>
                      {docPackage.provider_info.claim_submission_portal_url && (
                        <a
                          href={docPackage.provider_info.claim_submission_portal_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-3 py-1 bg-[#185A4D] text-white rounded-lg text-xs font-semibold hover:bg-[#13493E] transition"
                        >
                          <span className="material-symbols-outlined text-xs">open_in_new</span>
                          <span>Open Insurer Portal</span>
                        </a>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <span className="text-zinc-400 block text-[11px]">Submission Portal</span>
                        <span className="font-semibold text-zinc-800 truncate block">
                          {docPackage.provider_info.claim_submission_portal_url || "Manual Email / TPA"}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block text-[11px]">Official Claims Email</span>
                        <span className="font-semibold text-zinc-800 truncate block">
                          {docPackage.provider_info.claim_submission_email || "claims@insurer.com"}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block text-[11px]">Helpline Contact</span>
                        <span className="font-semibold text-zinc-800">
                          {docPackage.provider_info.contact_number || "Support Available"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Patient Consent Status & Documents Package */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-[#185A4D] uppercase tracking-wider flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-base">lock</span>
                        Authorized Clinical &amp; Payment Records ({docPackage.documents?.length || 0})
                      </h4>
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        <span className="material-symbols-outlined text-xs">check_circle</span>
                        Active Patient Consent Verified
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {docPackage.documents?.map((doc) => (
                        <div
                          key={doc.id}
                          className="p-2.5 rounded-xl border border-zinc-200 bg-white flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="material-symbols-outlined text-base text-[#185A4D] shrink-0">
                              description
                            </span>
                            <div className="min-w-0">
                              <span className="font-bold text-zinc-900 truncate block text-[11px]">
                                {doc.title}
                              </span>
                              <span className="text-[10px] text-zinc-400 font-mono">
                                {doc.file_name || doc.category}
                              </span>
                            </div>
                          </div>
                          {doc.preview_url && (
                            <a
                              href={doc.preview_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-2 py-1 rounded bg-zinc-100 text-zinc-700 hover:bg-zinc-200 text-[10px] font-semibold shrink-0"
                            >
                              Preview
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Submission Form Fields */}
                  <div className="space-y-3 pt-2 border-t border-zinc-200">
                    <h4 className="font-bold text-xs text-zinc-900 uppercase tracking-wider">
                      Insurer Transmission Details
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Insurer Claim Reference Number (Mandatory) */}
                      <div className="space-y-1">
                        <label className="font-bold text-xs text-zinc-900 block">
                          Insurer Claim Reference Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={submitForm.insurer_claim_reference}
                          onChange={(e) =>
                            setSubmitForm({ ...submitForm, insurer_claim_reference: e.target.value })
                          }
                          placeholder="e.g. HDFC-CLM-883921 or STAR-ACK-2026-99"
                          className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D]"
                        />
                        <span className="text-[10px] text-zinc-500 block">
                          Enter the official acknowledgment / docket number provided by the insurer.
                        </span>
                      </div>

                      {/* Submission Method */}
                      <div className="space-y-1">
                        <label className="font-bold text-xs text-zinc-900 block">
                          Submission Channel
                        </label>
                        <select
                          value={submitForm.submission_method}
                          onChange={(e) =>
                            setSubmitForm({ ...submitForm, submission_method: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-semibold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 cursor-pointer"
                        >
                          <option value="portal">Insurer Online Portal</option>
                          <option value="email">Official Claims Email</option>
                          <option value="tpa_portal">Third Party Administrator (TPA) Portal</option>
                          <option value="physical_dispatch">Courier / Physical Dispatch</option>
                          <option value="other">Other Official Channel</option>
                        </select>
                      </div>

                      {/* Submission Date */}
                      <div className="space-y-1">
                        <label className="font-bold text-xs text-zinc-900 block">
                          Submission Date
                        </label>
                        <input
                          type="date"
                          value={submitForm.submission_date}
                          onChange={(e) =>
                            setSubmitForm({ ...submitForm, submission_date: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20"
                        />
                      </div>

                      {/* Acknowledgment Document / Receipt */}
                      <div className="space-y-1">
                        <label className="font-bold text-xs text-zinc-900 block">
                          Acknowledgment Reference / Document Name
                        </label>
                        <input
                          type="text"
                          value={submitForm.acknowledgment_document}
                          onChange={(e) =>
                            setSubmitForm({ ...submitForm, acknowledgment_document: e.target.value })
                          }
                          placeholder="e.g. Portal_Submission_Slip_883921.pdf"
                          className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20"
                        />
                      </div>
                    </div>

                    {/* Submission Remarks */}
                    <div className="space-y-1">
                      <label className="font-semibold text-xs text-zinc-700 block">
                        Submission Notes (Optional)
                      </label>
                      <input
                        type="text"
                        value={submitForm.notes}
                        onChange={(e) => setSubmitForm({ ...submitForm, notes: e.target.value })}
                        placeholder="e.g. Submitted with digital e-sign; insurer estimated 7-10 business day turnaround."
                        className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20"
                      />
                    </div>
                  </div>

                  {/* Regulatory Strict Notice */}
                  <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-[11px] text-zinc-500 leading-relaxed">
                    <strong>Actual Insurer Submission Notice: </strong>
                    Kaizen Care connects clinic audits with external insurers. Do not submit simulated or dummy reference numbers. Recording transmission notifies the patient with the actual docket number.
                  </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-200 bg-zinc-50/80 shrink-0">
                  <button
                    type="button"
                    onClick={handleCloseSubmitToInsurer}
                    className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 border border-zinc-200 bg-white rounded-xl shadow-2xs hover:bg-zinc-50 transition cursor-pointer"
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    disabled={submittingToInsurer}
                    className="px-5 py-2 text-xs font-semibold text-white bg-[#185A4D] hover:bg-[#13493E] disabled:opacity-50 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-sm">send</span>
                    <span>{submittingToInsurer ? "Recording..." : "Confirm Insurer Submission"}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: UPDATE INSURER STATUS MODAL (CHECKPOINT 9)                       */}
      {/* ========================================================================= */}
      {statusModalClaim && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-zinc-200 overflow-hidden my-6 flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
            <form onSubmit={handleExecuteStatusUpdate} className="flex flex-col flex-1 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50/80 shrink-0">
                <div className="flex items-center gap-2.5">
                  <span className="w-10 h-10 rounded-xl bg-sky-100 text-sky-800 flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-2xl">edit_calendar</span>
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 font-mono">
                      Update Status: {statusModalClaim.claim_reference}
                    </h3>
                    <p className="text-[11px] text-zinc-500">
                      Insurer Reference: <strong>{statusModalClaim.insurer_claim_reference || "On File"}</strong> &bull; {statusModalClaim.provider_name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleCloseStatusModal}
                  className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>

              {/* Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-4 text-xs text-zinc-800 leading-relaxed">
                {/* Target Status Selector */}
                <div className="space-y-1">
                  <label className="font-bold text-xs text-zinc-900 block">
                    Official Insurer Adjudication Status <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={statusUpdateForm.status}
                    onChange={(e) =>
                      setStatusUpdateForm({ ...statusUpdateForm, status: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-xs font-semibold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 cursor-pointer"
                  >
                    <option value="under_insurer_review">Under Insurer Review</option>
                    <option value="additional_documents_required">Additional Documents Required</option>
                    <option value="approved">Approved (Full Reimbursement)</option>
                    <option value="partially_approved">Partially Approved</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                {/* Conditional Fields: Additional Documents Required */}
                {statusUpdateForm.status === "additional_documents_required" && (
                  <div className="p-4 rounded-xl bg-amber-50/50 border border-amber-200 space-y-2">
                    <label className="font-bold text-xs text-amber-950 block">
                      Requested Documents / Insurer Query <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={3}
                      required
                      value={statusUpdateForm.requested_documents}
                      onChange={(e) =>
                        setStatusUpdateForm({ ...statusUpdateForm, requested_documents: e.target.value })
                      }
                      placeholder="Specify the exact documentation requested by the insurer (e.g. 'Itemized pharmacy bills with doctor's registration stamp and test lab receipts')..."
                      className="w-full p-2.5 bg-white border border-amber-300 rounded-lg text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                    />
                    <p className="text-[10px] text-amber-700">
                      The patient will be alerted and invited to upload these specific files through their portal.
                    </p>
                  </div>
                )}

                {/* Conditional Fields: Approved */}
                {statusUpdateForm.status === "approved" && (
                  <div className="p-4 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="font-bold text-xs text-emerald-950 block">
                          Approved Amount <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={statusUpdateForm.approved_amount}
                          onChange={(e) =>
                            setStatusUpdateForm({ ...statusUpdateForm, approved_amount: e.target.value })
                          }
                          placeholder="e.g. ₹1,200.00"
                          className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-xs font-bold text-emerald-950"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-xs text-emerald-950 block">
                          Settlement Letter / Voucher Ref <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={statusUpdateForm.settlement_reference}
                          onChange={(e) =>
                            setStatusUpdateForm({ ...statusUpdateForm, settlement_reference: e.target.value })
                          }
                          placeholder="e.g. HDFC-SETTL-998822"
                          className="w-full px-3 py-2 bg-white border border-emerald-300 rounded-lg text-xs font-mono font-bold text-zinc-900"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="font-semibold text-xs text-zinc-700 block">
                        Insurer Approval Document / PDF Reference (Optional)
                      </label>
                      <input
                        type="text"
                        value={statusUpdateForm.evidence_document}
                        onChange={(e) =>
                          setStatusUpdateForm({ ...statusUpdateForm, evidence_document: e.target.value })
                        }
                        placeholder="e.g. Settlement_Voucher_998822.pdf"
                        className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-lg text-xs text-zinc-800"
                      />
                    </div>
                  </div>
                )}

                {/* Conditional Fields: Partially Approved */}
                {statusUpdateForm.status === "partially_approved" && (
                  <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-200 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <label className="font-bold text-xs text-blue-950 block">
                          Approved Amount <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={statusUpdateForm.approved_amount}
                          onChange={(e) =>
                            setStatusUpdateForm({ ...statusUpdateForm, approved_amount: e.target.value })
                          }
                          placeholder="e.g. ₹900.00"
                          className="w-full px-3 py-2 bg-white border border-blue-300 rounded-lg text-xs font-bold text-blue-950"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="font-bold text-xs text-blue-950 block">
                          Settlement Voucher Reference <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={statusUpdateForm.settlement_reference}
                          onChange={(e) =>
                            setStatusUpdateForm({ ...statusUpdateForm, settlement_reference: e.target.value })
                          }
                          placeholder="e.g. CARE-SETTL-1010"
                          className="w-full px-3 py-2 bg-white border border-blue-300 rounded-lg text-xs font-mono font-bold text-zinc-900"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-xs text-blue-950 block">
                        Co-Pay / Deduction Reason <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={statusUpdateForm.co_pay_or_deduction_reason}
                        onChange={(e) =>
                          setStatusUpdateForm({ ...statusUpdateForm, co_pay_or_deduction_reason: e.target.value })
                        }
                        placeholder="e.g. 10% co-payment deducted per policy schedule clause 4.2"
                        className="w-full px-3 py-2 bg-white border border-blue-300 rounded-lg text-xs text-zinc-900"
                      />
                    </div>
                  </div>
                )}

                {/* Conditional Fields: Rejected */}
                {statusUpdateForm.status === "rejected" && (
                  <div className="p-4 rounded-xl bg-rose-50/50 border border-rose-200 space-y-3">
                    <div className="space-y-1">
                      <label className="font-bold text-xs text-rose-950 block">
                        Formal Rejection Reason <span className="text-rose-500">*</span>
                      </label>
                      <textarea
                        rows={2}
                        required
                        value={statusUpdateForm.rejection_reason}
                        onChange={(e) =>
                          setStatusUpdateForm({ ...statusUpdateForm, rejection_reason: e.target.value })
                        }
                        placeholder="e.g. OPD consultations not covered under this specific basic indemnity policy."
                        className="w-full p-2.5 bg-white border border-rose-300 rounded-lg text-xs text-rose-950"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-xs text-rose-950 block">
                        Insurer Rejection Notice Reference <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={statusUpdateForm.settlement_reference}
                        onChange={(e) =>
                          setStatusUpdateForm({ ...statusUpdateForm, settlement_reference: e.target.value })
                        }
                        placeholder="e.g. STAR-REJ-2026-0044"
                        className="w-full px-3 py-2 bg-white border border-rose-300 rounded-lg text-xs font-mono font-bold text-zinc-900"
                      />
                    </div>
                  </div>
                )}

                {/* General Notes */}
                <div className="space-y-1">
                  <label className="font-semibold text-xs text-zinc-700 block">
                    Additional Adjudication Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={statusUpdateForm.notes}
                    onChange={(e) =>
                      setStatusUpdateForm({ ...statusUpdateForm, notes: e.target.value })
                    }
                    placeholder="e.g. Confirmed with senior claims coordinator."
                    className="w-full px-3 py-2 bg-zinc-50 border border-zinc-300 rounded-xl text-xs text-zinc-900"
                  />
                </div>

                {/* Compliance Notice */}
                <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-[11px] text-zinc-500 leading-relaxed">
                  <strong>Adjudication Evidence Notice: </strong>
                  Clinic Admin records official insurer status updates only. Kaizen Care does not approve claims or disburse reimbursement funds automatically.
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-200 bg-zinc-50/80 shrink-0">
                <button
                  type="button"
                  onClick={handleCloseStatusModal}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 border border-zinc-200 bg-white rounded-xl shadow-2xs hover:bg-zinc-50 transition cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={updatingStatus}
                  className="px-5 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-sm">save</span>
                  <span>{updatingStatus ? "Recording..." : "Save Insurer Status"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: CLAIM VERIFICATION & CLINICAL DOSSIER AUDIT (CHECKPOINT 8)       */}
      {/* ========================================================================= */}
      {selectedClaimId && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-zinc-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
            {detailLoading || !claimDetail ? (
              <div className="p-16 text-center space-y-3">
                <span className="material-symbols-outlined text-4xl text-[#185A4D] animate-spin">
                  progress_activity
                </span>
                <p className="text-xs font-semibold text-zinc-600">Retrieving claim audit records...</p>
              </div>
            ) : (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50/80 shrink-0">
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-xl bg-[#F0F5F7] text-[#185A4D] flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-2xl">verified_user</span>
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-zinc-900 font-mono">
                          {claimDetail.claim_reference}
                        </h3>
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-zinc-100 text-zinc-800 border-zinc-300">
                          {claimDetail.status_label || claimDetail.status}
                        </span>
                        {claimDetail.insurer_claim_reference && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-100 text-sky-800 border border-sky-300">
                            Insurer Ref: {claimDetail.insurer_claim_reference}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-500">
                        Patient: <strong>{claimDetail.patient_name}</strong> &bull; Provider: <strong>{claimDetail.provider_name}</strong> &bull; Encounter {claimDetail.appointment_display_id}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleCloseVerification}
                    className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-xl">close</span>
                  </button>
                </div>

                {/* Modal Content */}
                <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs text-zinc-800 leading-relaxed">
                  {/* Overview Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#F0F5F7]/60 p-4 rounded-xl border border-[#25836F]/20">
                    <div>
                      <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Claimed Fee</span>
                      <span className="font-bold text-sm text-[#185A4D]">{claimDetail.consultation_fee}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Payment ID</span>
                      <span className="font-mono font-semibold text-zinc-800 truncate block">
                        {claimDetail.payment_id || "pay_verified"}
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Payment Status</span>
                      <span className="font-semibold text-emerald-800 flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs text-emerald-600">verified</span>
                        Captured (Razorpay)
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Policyholder</span>
                      <span className="font-semibold text-zinc-800 truncate block">
                        {claimDetail.policy_holder_name} ({claimDetail.relationship})
                      </span>
                    </div>
                  </div>

                  {/* Section 1: Clinical Encounter Verification */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-[#185A4D] uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">stethoscope</span>
                      1. Clinical Encounter &amp; Payment Records
                    </h4>
                    <div className="p-4 rounded-xl border border-zinc-200 bg-white grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <span className="text-zinc-400 block text-[11px]">Attending Physician</span>
                        <span className="font-semibold text-zinc-900">{claimDetail.doctor_name}</span>
                        <span className="text-[11px] text-zinc-500 block">{claimDetail.specialty}</span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block text-[11px]">Consultation Date</span>
                        <span className="font-semibold text-zinc-900">
                          {new Date(claimDetail.consultation_date).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-400 block text-[11px]">Encounter Status</span>
                        <span className="font-semibold text-emerald-800 flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">check_circle</span>
                          Completed &amp; Released
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Supporting Documents Verification */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-[#185A4D] uppercase tracking-wider flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">folder_open</span>
                        2. Supporting Documents Checklist ({claimDetail.documents?.length || 0})
                      </h4>
                      <span className="text-[11px] text-zinc-500">
                        Audit individual documents before insurer submission
                      </span>
                    </div>

                    <div className="space-y-2.5">
                      {claimDetail.documents?.map((doc) => {
                        const decision = documentDecisions[doc.id] || { status: "verified", remarks: "" };
                        const isVerified = decision.status === "verified";
                        const isRejected = decision.status === "rejected";

                        return (
                          <div
                            key={doc.id}
                            className={`p-3.5 rounded-xl border transition ${
                              isRejected
                                ? "bg-rose-50/40 border-rose-200"
                                : isVerified
                                ? "bg-white border-zinc-200 hover:border-emerald-300"
                                : "bg-white border-zinc-200"
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span
                                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                                    isRejected
                                      ? "bg-rose-100 text-rose-700"
                                      : "bg-[#F0F5F7] text-[#185A4D]"
                                  }`}
                                >
                                  <span className="material-symbols-outlined text-base">
                                    {doc.category === "prescription"
                                      ? "medication"
                                      : doc.category === "consultation_invoice"
                                      ? "receipt"
                                      : doc.category === "insurance_card"
                                      ? "badge"
                                      : "description"}
                                  </span>
                                </span>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold text-xs text-zinc-900 truncate">
                                      {doc.title}
                                    </span>
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-zinc-100 text-zinc-700 font-mono">
                                      {doc.category}
                                    </span>
                                  </div>
                                  <span className="text-[11px] text-zinc-500 block">
                                    {doc.file_name || "Digital Database Record"} &bull; Status: {doc.status}
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                                {doc.preview_url && (
                                  <a
                                    href={doc.preview_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="px-2.5 py-1 text-[11px] font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg flex items-center gap-1 transition"
                                  >
                                    <span className="material-symbols-outlined text-xs">visibility</span>
                                    Preview
                                  </a>
                                )}

                                <div className="inline-flex rounded-lg border border-zinc-200 p-0.5 bg-zinc-100">
                                  <button
                                    type="button"
                                    onClick={() => handleToggleDocStatus(doc.id, "verified")}
                                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition cursor-pointer flex items-center gap-1 ${
                                      isVerified
                                        ? "bg-emerald-600 text-white shadow-2xs"
                                        : "text-zinc-600 hover:text-zinc-900"
                                    }`}
                                  >
                                    <span className="material-symbols-outlined text-xs">check</span>
                                    Verified
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleToggleDocStatus(doc.id, "rejected")}
                                    className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition cursor-pointer flex items-center gap-1 ${
                                      isRejected
                                        ? "bg-rose-600 text-white shadow-2xs"
                                        : "text-zinc-600 hover:text-zinc-900"
                                    }`}
                                  >
                                    <span className="material-symbols-outlined text-xs">close</span>
                                    Needs Correction
                                  </button>
                                </div>
                              </div>
                            </div>

                            {isRejected && (
                              <div className="mt-2.5 pt-2 border-t border-rose-200/80">
                                <input
                                  type="text"
                                  value={decision.remarks || ""}
                                  onChange={(e) => handleDocRemarkChange(doc.id, e.target.value)}
                                  placeholder="Specific issue with this document (e.g. illegible doctor stamp, cropped expiry date)..."
                                  className="w-full px-3 py-1.5 bg-white border border-rose-300 rounded-lg text-xs text-rose-950 placeholder:text-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-500"
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Section 3: Data Sharing Consent Verification */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-[#185A4D] uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">lock_clock</span>
                      3. Data Sharing Consent Verification
                    </h4>
                    <div className="p-3.5 rounded-xl border border-zinc-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-zinc-900">
                            Insurance Claim Data Sharing Authorization
                          </span>
                          <span className="px-2 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            Version {claimDetail.consent_version} &bull; Granted
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-0.5">
                          Signed by {claimDetail.patient_name} on {new Date(claimDetail.consent_accepted_at).toLocaleString()}
                        </p>
                      </div>
                      <span className="font-mono text-[10px] text-zinc-400 bg-zinc-50 px-2.5 py-1 rounded-md border border-zinc-200">
                        Ref: {claimDetail.consent_id}
                      </span>
                    </div>
                  </div>

                  {/* Section 4: Audit Status Timeline */}
                  <div className="space-y-2">
                    <h4 className="font-bold text-xs text-[#185A4D] uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">timeline</span>
                      4. Status Progression Timeline
                    </h4>
                    <div className="p-4 rounded-xl border border-zinc-200 bg-white max-h-48 overflow-y-auto space-y-2.5">
                      {claimDetail.timeline && claimDetail.timeline.length > 0 ? (
                        claimDetail.timeline.map((entry, idx) => (
                          <div key={idx} className="flex items-start gap-2.5 text-xs">
                            <span className="w-5 h-5 rounded-full bg-[#185A4D] text-white flex items-center justify-center shrink-0 mt-0.5 text-[10px]">
                              {idx + 1}
                            </span>
                            <div className="min-w-0">
                              <span className="font-bold text-zinc-900">{entry.title}</span>
                              <span className="text-[10px] text-zinc-400 ml-2 font-mono">
                                {new Date(entry.occurred_at).toLocaleString()}
                              </span>
                              <p className="text-[11px] text-zinc-600">{entry.description}</p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-zinc-500 italic">No timeline entries recorded.</p>
                      )}
                    </div>
                  </div>

                  {/* Section 5: Verification Decision Remarks */}
                  {(claimDetail.status === "pending_document_verification" || claimDetail.status === "correction_required") && (
                    <div className="space-y-2 pt-2 border-t border-zinc-200">
                      <div className="flex items-center justify-between">
                        <label className="font-bold text-xs text-zinc-900 flex items-center gap-1">
                          <span>Clinic Admin Verification Remarks</span>
                          <span className="text-rose-500 font-bold">* (Mandatory for Correction Requests)</span>
                        </label>
                        <span className="text-[11px] text-zinc-400">
                          {verificationRemarks.length} characters
                        </span>
                      </div>
                      <textarea
                        rows={3}
                        value={verificationRemarks}
                        onChange={(e) => setVerificationRemarks(e.target.value)}
                        placeholder="Enter verification audit notes or specific instructions for the patient..."
                        className="w-full p-3 bg-zinc-50/60 border border-zinc-200 rounded-xl text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D] transition"
                      />
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-zinc-200 bg-zinc-50/80 shrink-0">
                  <button
                    type="button"
                    onClick={handleCloseVerification}
                    className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 border border-zinc-200 bg-white rounded-xl shadow-2xs hover:bg-zinc-50 transition cursor-pointer w-full sm:w-auto"
                  >
                    Cancel / Close
                  </button>

                  <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
                    {(claimDetail.status === "pending_document_verification" || claimDetail.status === "correction_required") && (
                      <>
                        <button
                          type="button"
                          disabled={verifying}
                          onClick={() => handleExecuteVerification("request_correction")}
                          className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-sm">assignment_return</span>
                          <span>Request Corrections</span>
                        </button>

                        <button
                          type="button"
                          disabled={verifying}
                          onClick={() => handleExecuteVerification("mark_ready")}
                          className="px-5 py-2 text-xs font-semibold text-white bg-[#185A4D] hover:bg-[#13493E] disabled:opacity-50 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
                        >
                          <span className="material-symbols-outlined text-sm">verified</span>
                          <span>Mark Ready for Submission</span>
                        </button>
                      </>
                    )}

                    {claimDetail.status === "ready_for_submission" && (
                      <button
                        type="button"
                        onClick={() => {
                          const cId = claimDetail.id;
                          handleCloseVerification();
                          handleOpenSubmitToInsurer(cId);
                        }}
                        className="px-5 py-2 text-xs font-semibold text-white bg-[#185A4D] hover:bg-[#13493E] rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-sm">send</span>
                        <span>Submit to Insurer</span>
                      </button>
                    )}

                    {(claimDetail.status === "approved" || claimDetail.status === "partially_approved") && (
                      <button
                        type="button"
                        onClick={() => {
                          const cClaim = { ...claimDetail };
                          handleCloseVerification();
                          handleOpenReimbursementModal(cClaim);
                        }}
                        className="px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-sm">payments</span>
                        <span>Record Reimbursement</span>
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: RECORD PATIENT REIMBURSEMENT (CHECKPOINT 10)                     */}
      {/* ========================================================================= */}
      {reimbursementModalClaim && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-zinc-200 overflow-hidden my-6 animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[92vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50/80 shrink-0">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-teal-50 text-teal-700 border border-teal-200 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl">payments</span>
                </span>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-zinc-900 font-mono">
                      {reimbursementModalClaim.claim_reference}
                    </h3>
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-teal-100 text-teal-900 border-teal-300">
                      Record Reimbursement
                    </span>
                    {reimbursementSummary?.reimbursement_status_label && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold border bg-zinc-100 text-zinc-800 border-zinc-300">
                        {reimbursementSummary.reimbursement_status_label}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-500">
                    Patient: <strong>{reimbursementModalClaim.patient_name}</strong> &bull; Insurer: <strong>{reimbursementModalClaim.provider_name}</strong> &bull; Encounter {reimbursementModalClaim.appointment_display_id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCloseReimbursementModal}
                className="text-zinc-400 hover:text-zinc-600 p-1.5 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            {/* Modal Body */}
            {reimbursementLoading ? (
              <div className="p-16 text-center space-y-3">
                <span className="material-symbols-outlined text-4xl text-[#185A4D] animate-spin">
                  progress_activity
                </span>
                <p className="text-xs font-semibold text-zinc-600">Loading reimbursement reconciliation summary...</p>
              </div>
            ) : (
              <div className="p-6 overflow-y-auto flex-1 space-y-6 text-xs text-zinc-800 leading-relaxed">
                {/* Financial Overview Strip */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-[#F0F5F7]/80 p-4 rounded-xl border border-[#25836F]/20">
                  <div>
                    <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Original Paid</span>
                    <span className="font-bold text-sm text-[#185A4D]">{reimbursementSummary?.consultation_fee || reimbursementModalClaim.consultation_fee}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Insurer Approved</span>
                    <span className="font-bold text-sm text-emerald-800">
                      ₹{reimbursementSummary?.approved_amount || reimbursementModalClaim.approved_amount || "0.00"}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Total Reimbursed</span>
                    <span className="font-bold text-sm text-teal-900">
                      ₹{reimbursementSummary?.reimbursed_amount || "0.00"}
                    </span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block text-[10px] uppercase font-bold tracking-wider">Pending Balance</span>
                    <span className={`font-bold text-sm ${reimbursementSummary?.pending_balance_paise > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                      ₹{reimbursementSummary?.pending_reimbursement_amount || "0.00"}
                    </span>
                  </div>
                </div>

                {/* Previous Transactions List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs text-[#185A4D] uppercase tracking-wider flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">receipt_long</span>
                      Reimbursement Transactions ({reimbursementSummary?.transactions?.length || 0})
                    </h4>
                    <span className="text-[11px] text-zinc-500">
                      Verified settlement transactions credited to patient
                    </span>
                  </div>

                  {reimbursementSummary?.transactions && reimbursementSummary.transactions.length > 0 ? (
                    <div className="space-y-2">
                      {reimbursementSummary.transactions.map((tx) => (
                        <div key={tx.id} className="p-3.5 rounded-xl border border-zinc-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-xs text-emerald-800">
                                ₹{tx.amount}
                              </span>
                              <span className="px-2 py-0.2 rounded text-[10px] font-bold bg-zinc-100 text-zinc-700 border border-zinc-200 font-mono">
                                {tx.payment_method_label || tx.payment_method}
                              </span>
                              <span className="font-mono text-xs font-semibold text-zinc-800">
                                Ref: {tx.payment_reference}
                              </span>
                            </div>
                            <div className="text-[11px] text-zinc-500 flex items-center gap-2 flex-wrap">
                              <span>Date: <strong>{tx.reimbursement_date}</strong></span>
                              <span>&bull;</span>
                              <span>Recorded by: {tx.recorded_by_name || "Admin"}</span>
                              {tx.notes && (
                                <>
                                  <span>&bull;</span>
                                  <span className="italic">{tx.notes}</span>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                            {tx.evidence_url && (
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
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-0.5">
                              <span className="material-symbols-outlined text-[11px]">verified</span>
                              Recorded
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 rounded-xl border border-dashed border-zinc-300 text-center text-zinc-500 bg-zinc-50/50">
                      No reimbursement payments recorded yet. Use the form below to enter the verified settlement.
                    </div>
                  )}
                </div>

                {/* Form to Record New Reimbursement if Pending Balance > 0 */}
                {reimbursementSummary && reimbursementSummary.pending_balance_paise > 0 ? (
                  <form onSubmit={handleSubmitReimbursement} className="space-y-4 pt-4 border-t border-zinc-200">
                    <div className="flex items-center justify-between">
                      <h4 className="font-bold text-xs text-[#185A4D] uppercase tracking-wider flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">add_card</span>
                        Record New Reimbursement Transaction
                      </h4>
                      <button
                        type="button"
                        onClick={() =>
                          setReimbursementForm((prev) => ({
                            ...prev,
                            reimbursement_amount: reimbursementSummary.pending_reimbursement_amount || "",
                          }))
                        }
                        className="text-[11px] font-semibold text-teal-700 hover:text-teal-900 underline cursor-pointer"
                      >
                        Fill Full Pending (₹{reimbursementSummary.pending_reimbursement_amount})
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Amount */}
                      <div className="space-y-1">
                        <label className="font-semibold text-xs text-zinc-700 block">
                          Reimbursement Amount (₹) <span className="text-rose-500">*</span>
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-zinc-400 font-bold">₹</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={reimbursementSummary.pending_reimbursement_amount}
                            required
                            value={reimbursementForm.reimbursement_amount}
                            onChange={(e) =>
                              setReimbursementForm({ ...reimbursementForm, reimbursement_amount: e.target.value })
                            }
                            placeholder="0.00"
                            className="w-full pl-7 pr-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D]"
                          />
                        </div>
                        <span className="text-[10px] text-zinc-500 block">
                          Max remaining: ₹{reimbursementSummary.pending_reimbursement_amount}
                        </span>
                      </div>

                      {/* Payment Method */}
                      <div className="space-y-1">
                        <label className="font-semibold text-xs text-zinc-700 block">
                          Payment Method <span className="text-rose-500">*</span>
                        </label>
                        <select
                          value={reimbursementForm.payment_method}
                          onChange={(e) =>
                            setReimbursementForm({ ...reimbursementForm, payment_method: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D] cursor-pointer"
                        >
                          <option value="direct_bank_transfer">Direct Bank Transfer (NEFT / RTGS)</option>
                          <option value="imps">IMPS Instant Transfer</option>
                          <option value="upi">UPI / Virtual Payment Address</option>
                          <option value="cheque">Bank Demand Draft / Cheque</option>
                          <option value="insurer_direct_credit">Insurer Direct TPA Credit</option>
                        </select>
                      </div>

                      {/* Payment Reference */}
                      <div className="space-y-1">
                        <label className="font-semibold text-xs text-zinc-700 block">
                          Payment Reference / UTR Number <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={reimbursementForm.payment_reference}
                          onChange={(e) =>
                            setReimbursementForm({ ...reimbursementForm, payment_reference: e.target.value })
                          }
                          placeholder="e.g. UTR-20261126-8899 or CHQ-402910"
                          className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs font-mono font-bold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D]"
                        />
                        <span className="text-[10px] text-zinc-500 block">
                          Must be unique per reimbursement transaction on this claim
                        </span>
                      </div>

                      {/* Date */}
                      <div className="space-y-1">
                        <label className="font-semibold text-xs text-zinc-700 block">
                          Reimbursement Date <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="date"
                          required
                          value={reimbursementForm.reimbursement_date}
                          onChange={(e) =>
                            setReimbursementForm({ ...reimbursementForm, reimbursement_date: e.target.value })
                          }
                          className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D]"
                        />
                      </div>
                    </div>

                    {/* Supporting Evidence File Upload */}
                    <div className="space-y-1">
                      <label className="font-semibold text-xs text-zinc-700 block">
                        Reimbursement Supporting Evidence <span className="text-rose-500">* (Mandatory)</span>
                      </label>
                      <div className="flex items-center gap-3">
                        <label className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 border border-zinc-300 rounded-xl text-xs font-semibold text-zinc-700 cursor-pointer flex items-center gap-1.5 transition">
                          <span className="material-symbols-outlined text-sm">upload_file</span>
                          <span>{uploadingEvidence ? "Uploading..." : "Upload Bank / Insurer Receipt"}</span>
                          <input
                            type="file"
                            accept=".pdf,.jpg,.jpeg,.png"
                            disabled={uploadingEvidence}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadReimbursementEvidence(f);
                            }}
                            className="hidden"
                          />
                        </label>
                        {evidenceFileName && (
                          <div className="flex items-center gap-1 text-xs text-emerald-800 font-semibold bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                            <span className="material-symbols-outlined text-sm">check_circle</span>
                            <span>{evidenceFileName}</span>
                          </div>
                        )}
                        {!evidenceFileName && (
                          <span className="text-[11px] text-zinc-500">
                            Mandatory proof (PDF, JPG, PNG &le; 10MB)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Reconciliation Notes */}
                    <div className="space-y-1">
                      <label className="font-semibold text-xs text-zinc-700 block">
                        Reconciliation Notes (Optional)
                      </label>
                      <input
                        type="text"
                        value={reimbursementForm.notes}
                        onChange={(e) =>
                          setReimbursementForm({ ...reimbursementForm, notes: e.target.value })
                        }
                        placeholder="e.g. Verified against insurer remittance advice statement."
                        className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-xl text-xs text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#185A4D]/20 focus:border-[#185A4D]"
                      />
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={recordingReimbursement}
                        className="px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 disabled:opacity-50 rounded-xl shadow-xs transition cursor-pointer flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-sm">save</span>
                        <span>{recordingReimbursement ? "Recording..." : "Save Reimbursement Record"}</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 flex items-center gap-3">
                    <span className="material-symbols-outlined text-2xl text-emerald-600">check_circle</span>
                    <div>
                      <span className="font-bold block">Reimbursement Fully Reconciled</span>
                      <p className="text-[11px] text-emerald-900">
                        All approved funds (₹{reimbursementSummary?.approved_amount}) have been fully reimbursed to the patient.
                      </p>
                    </div>
                  </div>
                )}

                {/* Compliance & Financial Guardrail Notice */}
                <div className="p-3 bg-zinc-50 border border-zinc-200 rounded-xl text-[11px] text-zinc-500 leading-relaxed">
                  <strong>Financial Ledger Notice: </strong>
                  Insurance reimbursements are disbursed directly by the insurer/TPA to the patient. Recording here updates the clinic reconciliation ledger and notifies the patient in-app. Razorpay refunds are not initiated.
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-200 bg-zinc-50/80 shrink-0">
              <button
                type="button"
                onClick={handleCloseReimbursementModal}
                className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 border border-zinc-200 bg-white rounded-xl shadow-2xs hover:bg-zinc-50 transition cursor-pointer"
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
