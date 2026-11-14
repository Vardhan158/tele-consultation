import { useEffect, useState } from "react";
import { API_BASE_URL, adminApi } from "../../../lib/api";
import { useToast } from "../../common/Toast";

const ITEMS_PER_PAGE = 5;

export default function DoctorManagementTab() {
  const { showToast } = useToast();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [actionLoading, setActionLoading] = useState(null);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [reasonModal, setReasonModal] = useState(null);
  const [reasonText, setReasonText] = useState("");
  const [suspendModal, setSuspendModal] = useState(null); // { doctorId: string, doctorName: string }
  const [suspendReason, setSuspendReason] = useState("");

  const loadDoctors = () => {
    setLoading(true);
    adminApi
      .doctors()
      .then((res) => {
        setDoctors(Array.isArray(res) ? res : []);
      })
      .catch((err) => {
        showToast(err.message || "Failed to load clinicians directory.", "error");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDoctors();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery]);

  const submitApprovalAction = async () => {
    if (!reasonModal) return;
    const { type, doctorId } = reasonModal;
    setActionLoading(doctorId);
    try {
      if (type === "approve") {
        await adminApi.approveDoctor(doctorId);
        showToast("Doctor account verified & approved successfully.", "success");
      } else {
        await adminApi.rejectDoctor(doctorId);
        showToast("Doctor application rejected.", "info");
      }
      setReasonModal(null);
      setReasonText("");
      loadDoctors();
    } catch (err) {
      showToast(err.message || "Action failed.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleOpenSuspendModal = (doc) => {
    setSuspendModal({ doctorId: doc.id, doctorName: doc.full_name });
    setSuspendReason("");
  };

  const submitSuspensionAction = async () => {
    if (!suspendModal) return;
    setActionLoading(suspendModal.doctorId);
    try {
      await adminApi.toggleDoctorStatus(suspendModal.doctorId, false, suspendReason);
      showToast("Clinician access suspended successfully.", "warning");
      setSuspendModal(null);
      setSuspendReason("");
      loadDoctors();
    } catch (err) {
      showToast(err.message || "Failed to suspend doctor.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const handleReactivateDoctor = async (doc) => {
    setActionLoading(doc.id);
    try {
      await adminApi.toggleDoctorStatus(doc.id, true, "Administrative reactivation");
      showToast("Clinician access reactivated successfully.", "success");
      loadDoctors();
    } catch (err) {
      showToast(err.message || "Failed to reactivate doctor.", "error");
    } finally {
      setActionLoading(null);
    }
  };

  const filteredDoctors = doctors.filter((doc) => {
    if (filter === "pending" && doc.approval_status !== "pending") return false;
    if (filter === "approved" && doc.approval_status !== "approved") return false;
    if (filter === "rejected" && doc.approval_status !== "rejected") return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const nameMatch = (doc.full_name || "").toLowerCase().includes(q);
      const specMatch = (doc.specialty || "").toLowerCase().includes(q);
      const regMatch = (doc.registration_number || "").toLowerCase().includes(q);
      const emailMatch = (doc.email || "").toLowerCase().includes(q);
      return nameMatch || specMatch || regMatch || emailMatch;
    }
    return true;
  });

  const totalPages = Math.ceil(filteredDoctors.length / ITEMS_PER_PAGE) || 1;
  const paginatedDoctors = filteredDoctors.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const pendingCount = doctors.filter((d) => d.approval_status === "pending").length;

  return (
    <div className="space-y-6 font-sans">
      {/* Cinematic Animated Banner */}
      <div className="relative min-h-[220px] lg:min-h-[245px] overflow-hidden rounded-2xl bg-gradient-to-r from-[#162623] via-[#25836F] to-[#1d6e5d] p-6 sm:p-8 text-white shadow-xl border border-[rgba(87,120,119,0.25)] flex flex-col justify-between">
        {/* Soft Background Illumination Orbs */}
        <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-[#577877]/30 blur-3xl animate-glow pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-teal-400/20 blur-3xl animate-glow pointer-events-none" />

        {/* Animated Light Waves Overlay */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="cinematic-wave cinematic-wave-one" />
          <div className="cinematic-wave cinematic-wave-two" />
        </div>

        {/* Continuous Floating Glass Particles */}
        <div className="cinematic-particle cinematic-particle-one" />
        <div className="cinematic-particle cinematic-particle-two" />
        <div className="cinematic-particle cinematic-particle-three" />
        <div className="cinematic-particle cinematic-particle-four" />
        <div className="cinematic-particle cinematic-particle-five" />
        <div className="cinematic-particle cinematic-particle-six" />

        {/* Main Banner Content */}
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-teal-100 backdrop-blur-md border border-white/15 shadow-inner">
              <span className="h-2 w-2 rounded-full bg-teal-400 animate-pulse"></span>
              Doctor Approvals Workspace
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl drop-shadow-sm font-sans">
              Doctor Verification & Credential Management
            </h1>
            <p className="text-xs text-teal-100/90 sm:text-sm leading-relaxed max-w-xl">
              Review clinician credentials, manage approvals, and maintain trusted clinical access.
            </p>
          </div>

          {/* Glassmorphism Live KPI Card & Action */}
          <div className="relative z-10 flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end gap-3 shrink-0">
            {/* Live KPI Box */}
            <div className="relative flex items-center gap-3 rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/20 shadow-lg min-w-[200px]">
              <div className="pending-kpi-glow" aria-hidden="true" />
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/20 text-amber-300 border border-amber-300/30">
                <span className="material-symbols-outlined text-xl">pending_actions</span>
              </div>
              <div>
                <div className="text-xl font-extrabold text-white leading-tight">
                  {pendingCount}
                </div>
                <div className="text-[11px] font-semibold text-amber-200/90 uppercase tracking-wider">
                  Pending Approvals
                </div>
              </div>
            </div>

            {/* Review Pending Action Button */}
            <button
              onClick={() => {
                setFilter("pending");
                window.scrollTo({ top: 380, behavior: "smooth" });
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-bold text-[#25836F] shadow-md transition-all hover:bg-[#F0F5F7] hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              <span>Review Pending ({pendingCount})</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Bar & Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#577877]/15 pb-4">
        <div>
          <h2 className="text-lg font-bold text-[#162623]">
            Clinicians Directory ({filteredDoctors.length})
          </h2>
          <p className="text-xs text-[#577877]">
            Showing {filter === "all" ? "all registered" : filter} clinician records.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex gap-2 rounded-xl bg-[#F0F5F7] p-1 border border-[#577877]/15">
          <button
            onClick={() => setFilter("all")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === "all" ? "bg-white text-[#25836F] shadow-sm" : "text-[#577877]"
            }`}
          >
            All ({doctors.length})
          </button>
          <button
            onClick={() => setFilter("pending")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === "pending" ? "bg-white text-amber-700 shadow-sm" : "text-[#577877]"
            }`}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setFilter("approved")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              filter === "approved" ? "bg-white text-emerald-700 shadow-sm" : "text-[#577877]"
            }`}
          >
            Approved
          </button>
        </div>
      </div>

      {/* Searchable Bar */}
      <div className="care-card p-4">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#577877] text-lg">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search clinicians by name, registration #, specialty, or email…"
            className="w-full rounded-xl border border-[#577877]/25 pl-9 pr-3 py-2 text-xs focus:border-[#25836F] focus:outline-none"
          />
        </div>
      </div>

      {/* Doctor Profile Details Modal */}
      {selectedDoctor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162623]/50 backdrop-blur-xs p-4">
          <div className="care-card max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#577877]/15 pb-3">
              <h3 className="text-base font-bold text-[#162623]">
                Doctor Credential Profile
              </h3>
              <button
                onClick={() => setSelectedDoctor(null)}
                className="text-xs font-semibold text-[#577877] hover:underline"
              >
                Close ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-[#25836F]">{selectedDoctor.full_name}</span>
                <span className="rounded-full bg-teal-100 px-2.5 py-0.5 font-bold uppercase text-[#25836F]">
                  {selectedDoctor.approval_status}
                </span>
              </div>

              <div className="rounded-xl bg-[#F0F5F7] p-3 space-y-1.5">
                <div><strong>Specialty:</strong> {selectedDoctor.specialty}</div>
                <div><strong>Clinic Affiliation:</strong> {selectedDoctor.clinic_name}</div>
                <div><strong>Professional Registration #:</strong> {selectedDoctor.registration_number}</div>
                <div><strong>Experience:</strong> {selectedDoctor.experience_years} Years</div>
                <div><strong>Qualifications:</strong> {Array.isArray(selectedDoctor.qualifications) ? selectedDoctor.qualifications.join(", ") : selectedDoctor.qualifications}</div>
                <div><strong>Languages:</strong> {Array.isArray(selectedDoctor.languages) ? selectedDoctor.languages.join(", ") : selectedDoctor.languages}</div>
                <div><strong>Contact Email:</strong> {selectedDoctor.email || "N/A"}</div>
                <div><strong>Mobile Number:</strong> {selectedDoctor.mobile_number || "N/A"}</div>
                <div><strong>Email Verification:</strong> {selectedDoctor.email_verified ? "Verified ✅" : "Pending ⏳"}</div>
              </div>

              <div className="border-t border-[#577877]/15 pt-2">
                <div className="font-semibold text-[#162623] mb-1">Credential Document</div>
                {selectedDoctor.credential_document ? (
                  <div className="rounded-xl bg-[#EEF6F3] p-3 text-[11px] text-[#577877] space-y-2">
                    <div><strong>Filename:</strong> {selectedDoctor.credential_document.file_name}</div>
                    <div><strong>Uploaded:</strong> {selectedDoctor.credential_document.uploaded_at ? new Date(selectedDoctor.credential_document.uploaded_at).toLocaleString() : "Unknown"}</div>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => window.open(`${API_BASE_URL}/doctor/${selectedDoctor.id}/credentials`, "_blank", "noopener,noreferrer")} className="rounded-lg bg-[#25836F] px-3 py-1.5 font-semibold text-white">Preview</button>
                      <a href={`${API_BASE_URL}/doctor/${selectedDoctor.id}/credentials`} target="_blank" rel="noreferrer" className="rounded-lg border border-[#25836F]/30 bg-white px-3 py-1.5 font-semibold text-[#25836F]">Download</a>
                    </div>
                  </div>
                ) : <div className="text-[11px] text-[#577877]">Credential document not uploaded</div>}
                <label className="inline-flex cursor-pointer rounded-lg border border-[#25836F]/30 bg-white px-3 py-1.5 text-[11px] font-semibold text-[#25836F]">
                  Upload credential
                  <input type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={async (event) => { const file = event.target.files?.[0]; if (!file) return; try { const result = await adminApi.uploadDoctorCredential(selectedDoctor.id, file); setSelectedDoctor((current) => ({ ...current, credential_document: { file_name: result.file_name, uploaded_at: result.uploaded_at, status: "pending_verification" } })); showToast("Credential document uploaded for review.", "success"); } catch (error) { showToast(error.message || "Credential upload failed.", "error"); } event.target.value = ""; }} />
                </label>
                <div className="font-semibold text-[#162623] mb-1">Audit History</div>
                <div className="text-[11px] text-[#577877]">
                  Account registered on {selectedDoctor.created_at ? new Date(selectedDoctor.created_at).toLocaleString() : "System Record"}
                </div>
              </div>
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setSelectedDoctor(null)}
                className="rounded-xl bg-[#25836F] px-4 py-2 text-xs font-semibold text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approval / Rejection Reason Modal */}
      {reasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162623]/50 backdrop-blur-xs p-4">
          <div className="care-card max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-[#162623]">
              {reasonModal.type === "approve" ? "Approve Doctor Credentials" : "Reject Doctor Application"}
            </h3>
            <p className="text-xs text-[#577877]">
              Optionally provide notes or reasons for this verification decision.
            </p>
            <textarea
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
              placeholder="e.g. Verified state medical council registration certificate."
              className="w-full rounded-xl border border-[#577877]/25 p-3 text-xs h-24"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setReasonModal(null)}
                className="rounded-xl border border-[#577877]/30 px-3 py-2 text-xs font-semibold text-[#577877]"
              >
                Cancel
              </button>
              <button
                onClick={submitApprovalAction}
                className={`rounded-xl px-4 py-2 text-xs font-semibold text-white ${
                  reasonModal.type === "approve" ? "bg-emerald-700 hover:bg-emerald-800" : "bg-red-700 hover:bg-red-800"
                }`}
              >
                Confirm {reasonModal.type === "approve" ? "Approval" : "Rejection"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clinician Suspension Consequences & Confirmation Modal */}
      {suspendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162623]/60 backdrop-blur-xs p-4">
          <div className="care-card max-w-lg w-full p-6 space-y-5 border border-amber-200">
            <div className="flex items-center justify-between border-b border-[#577877]/15 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-amber-600 text-xl">warning</span>
                <h3 className="text-base font-bold text-[#162623]">
                  Confirm Clinician Access Suspension
                </h3>
              </div>
              <button
                onClick={() => setSuspendModal(null)}
                className="text-xs font-semibold text-[#577877] hover:underline"
              >
                Close ✕
              </button>
            </div>

            <p className="text-xs text-[#162623]">
              You are requesting to suspend <strong>{suspendModal.doctorName}</strong>. Please review the operational consequences of this action:
            </p>

            {/* Operational Consequences Box */}
            <div className="rounded-xl bg-amber-50 p-4 border border-amber-200 text-xs text-amber-900 space-y-2">
              <div className="font-bold text-amber-950 flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-amber-700">gavel</span>
                Consequences of Suspension:
              </div>
              <ul className="list-disc pl-4 space-y-1 text-[11px] leading-relaxed">
                <li><strong>Portal Lockout:</strong> The clinician will be immediately revoked from logging into the doctor workspace.</li>
                <li><strong>Hidden Directory Profile:</strong> The clinician's profile and schedule availability will be hidden from patient search.</li>
                <li><strong>Consultation Block:</strong> The clinician will be prevented from joining or conducting video consultations.</li>
              </ul>
            </div>

            {/* Reason Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold text-[#162623]">
                Reason for Suspension <span className="text-red-600">*</span>
              </label>
              <textarea
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="e.g. License under administrative review by state medical council."
                className="w-full rounded-xl border border-[#577877]/25 p-3 text-xs h-24 focus:border-amber-600 focus:outline-none"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#577877]/15">
              <button
                onClick={() => setSuspendModal(null)}
                className="rounded-xl border border-[#577877]/30 px-4 py-2 text-xs font-semibold text-[#577877] hover:bg-[#F0F5F7]"
              >
                Cancel
              </button>
              <button
                onClick={submitSuspensionAction}
                disabled={!suspendReason.trim() || actionLoading === suspendModal.doctorId}
                className="rounded-xl bg-amber-800 px-5 py-2 text-xs font-bold text-white shadow hover:bg-amber-900 disabled:opacity-40"
              >
                {actionLoading === suspendModal.doctorId ? "Suspending…" : "Confirm & Suspend Access"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Doctor Cards & Meaningful Empty State */}
      {loading ? (
        <div className="flex h-48 items-center justify-center text-[#577877]">
          <span className="material-symbols-outlined animate-spin text-3xl">sync</span>
        </div>
      ) : paginatedDoctors.length === 0 ? (
        <div className="care-card p-12 text-center text-[#577877] space-y-2">
          <span className="material-symbols-outlined text-4xl text-[#577877]/60">badge</span>
          <h3 className="text-base font-bold text-[#162623]">No Clinicians Found</h3>
          <p className="text-xs max-w-sm mx-auto">
            No doctors match your filter <strong>"{filter}"</strong> or query <strong>"{searchQuery}"</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4">
            {paginatedDoctors.map((doc, idx) => (
              <div key={`${doc.id || doc.user_id || 'doc'}-${idx}`} className="care-card p-5 transition hover:border-[#25836F]/40">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-[#162623]">{doc.full_name}</h3>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          doc.approval_status === "approved"
                            ? "bg-emerald-100 text-emerald-800"
                            : doc.approval_status === "rejected"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800 animate-pulse"
                        }`}
                      >
                        {doc.approval_status}
                      </span>
                      {doc.active ? (
                        <span className="rounded-full bg-teal-100 px-2.5 py-0.5 text-[10px] font-bold text-[#25836F]">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-bold text-red-800">
                          Suspended / Inactive
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#577877]">
                      <div><strong>Specialty:</strong> {doc.specialty}</div>
                      <div><strong>Reg #:</strong> {doc.registration_number}</div>
                      <div><strong>Clinic:</strong> {doc.clinic_name}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 lg:pt-0">
                    <button
                      onClick={() => setSelectedDoctor(doc)}
                      className="rounded-xl border border-[#577877]/30 bg-[#F0F5F7] px-3 py-2 text-xs font-semibold text-[#25836F] hover:bg-white"
                    >
                      View Credentials
                    </button>

                    {doc.approval_status === "pending" && (
                      <>
                        <button
                          onClick={() => setReasonModal({ type: "approve", doctorId: doc.id })}
                          disabled={actionLoading === doc.id}
                          className="rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-800 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setReasonModal({ type: "reject", doctorId: doc.id })}
                          disabled={actionLoading === doc.id}
                          className="rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}

                    {doc.approval_status === "approved" && (
                      <>
                        {doc.active ? (
                          <button
                            onClick={() => handleOpenSuspendModal(doc)}
                            disabled={actionLoading === doc.id}
                            className="rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-semibold text-amber-900 shadow transition hover:bg-amber-100 disabled:opacity-50"
                          >
                            Suspend Access
                          </button>
                        ) : (
                          <button
                            onClick={() => handleReactivateDoctor(doc)}
                            disabled={actionLoading === doc.id}
                            className="rounded-xl bg-[#25836F] px-3.5 py-2 text-xs font-semibold text-white shadow transition hover:bg-[#1d6e5d] disabled:opacity-50"
                          >
                            Reactivate Access
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[#577877]/15 pt-4 text-xs">
              <span className="text-[#577877]">
                Showing Page {currentPage} of {totalPages} ({filteredDoctors.length} clinicians total)
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
