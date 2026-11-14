import { useState, useEffect } from "react";
import { clinicalApi, patientApi, supportApi } from "../../lib/api";

export default function PrescriptionsScreen({
  onNavigate,
  initialTab = "active",
}) {
  const [currentMode, setCurrentMode] = useState(
    initialTab === "summaries" ? "summaries" : "prescriptions",
  );
  const [activeSubTab, setActiveSubTab] = useState(
    initialTab === "summaries" ? "summaries" : "active",
  );

  const [patientProfile, setPatientProfile] = useState(null);
  const [dbPrescriptions, setDbPrescriptions] = useState([]);
  const [refillTickets, setRefillTickets] = useState([]);
  const [summariesList, setSummariesList] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedRx, setSelectedRx] = useState(null);
  const [refillModalRx, setRefillModalRx] = useState(null);
  const [showPharmacyModal, setShowPharmacyModal] = useState(false);

  const [pharmacyForm, setPharmacyForm] = useState({
    name: "",
    address: "",
    phone: "",
  });

  const [toastMessage, setToastMessage] = useState("");

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Load patient profile
      const profile = await patientApi.profile().catch(() => null);
      if (profile) {
        setPatientProfile(profile);
        if (profile.preferred_pharmacy) {
          setPharmacyForm({
            name: profile.preferred_pharmacy || "",
            address: profile.pharmacy_address || "",
            phone: profile.pharmacy_phone || "",
          });
        }
      }

      // 2. Load prescriptions
      const rxItems = await clinicalApi.prescriptions().catch(() => []);
      if (Array.isArray(rxItems)) {
        setDbPrescriptions(
          rxItems.map((rx) => {
            const isCompletedOrExpired =
              rx.status === "completed" ||
              rx.status === "expired" ||
              rx.status === "inactive";
            return {
              id: rx.id,
              name: rx.medication_name || rx.title || "Prescription",
              strength: rx.dosage || "As directed",
              instructions: rx.instructions || "Follow prescription guidelines.",
              prescriber: rx.prescriber_name || rx.doctor_name || "Authorized Clinician",
              issuedDate: rx.released_at
                ? new Date(rx.released_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Published date unavailable",
              refills: rx.refills != null ? `${rx.refills} refills remaining` : "Requires clinician review",
              statusBadge: rx.status ? rx.status.charAt(0).toUpperCase() + rx.status.slice(1) : "Active",
              statusType: isCompletedOrExpired ? "neutral" : "active",
              isCompleted: isCompletedOrExpired,
              quantity:
                rx.medicines
                  ?.map((m) => m.quantity)
                  .filter(Boolean)
                  .join(", ") || "See details",
              daysSupply:
                rx.medicines
                  ?.map((m) => m.duration)
                  .filter(Boolean)
                  .join(", ") || "See details",
              medicines: rx.medicines || [],
            };
          }),
        );
      }

      // 3. Load refill requests / support tickets
      const tickets = await supportApi.tickets().catch(() => []);
      if (Array.isArray(tickets)) {
        setRefillTickets(
          tickets.filter((t) => t.category === "refill_request"),
        );
      }

      // 4. Load consultation summaries
      const summaries = await clinicalApi.summaries().catch(() => []);
      if (Array.isArray(summaries)) {
        setSummariesList(summaries);
      }
    } catch {
      // Handled
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const activeMedicationsList = dbPrescriptions.filter((rx) => !rx.isCompleted);
  const pastMedicationsList = dbPrescriptions.filter((rx) => rx.isCompleted);

  const pharmacy = {
    name: patientProfile?.preferred_pharmacy || "",
    address: patientProfile?.pharmacy_address || "",
    phone: patientProfile?.pharmacy_phone || "",
  };

  const handleSavePharmacy = async (e) => {
    e.preventDefault();
    if (!pharmacyForm.name.trim()) return;
    try {
      await patientApi.updateProfile({
        preferred_pharmacy: pharmacyForm.name.trim(),
        pharmacy_address: pharmacyForm.address.trim(),
        pharmacy_phone: pharmacyForm.phone.trim(),
      });
      setToastMessage(`Preferred pharmacy updated to ${pharmacyForm.name.trim()}.`);
      setShowPharmacyModal(false);
      await fetchData();
    } catch (err) {
      setToastMessage(err.message || "Failed to update preferred pharmacy.");
    }
    setTimeout(() => setToastMessage(""), 3500);
  };

  const handleConfirmRefill = async () => {
    if (!refillModalRx) return;
    try {
      const pharmName = pharmacy.name || "preferred pharmacy";
      await supportApi.createTicket({
        category: "refill_request",
        subject: `Refill Request: ${refillModalRx.name}`,
        description: `Patient requested refill for ${refillModalRx.name} (${refillModalRx.strength}) to be sent to ${pharmName}. Prescriber: ${refillModalRx.prescriber}. Prescription ID: ${refillModalRx.id}`,
      });
      setToastMessage(
        `Refill request for ${refillModalRx.name} submitted for clinician review.`,
      );
      setRefillModalRx(null);
      await fetchData();
    } catch (err) {
      setToastMessage(err.message || "Failed to submit refill request.");
    }
    setTimeout(() => setToastMessage(""), 4500);
  };

  const handleDownloadMedList = () => {
    const patName = patientProfile?.full_name || "Patient";
    const patId = patientProfile?.id
      ? `KC-${String(patientProfile.id).slice(-5).toUpperCase()}`
      : "KC-PORTAL";
    const pharmText = pharmacy.name
      ? `${pharmacy.name}${pharmacy.phone ? " (" + pharmacy.phone + ")" : ""}${pharmacy.address ? " - " + pharmacy.address : ""}`
      : "No preferred pharmacy selected";

    const allergyText = patientProfile?.allergies
      ? `Allergy Notice: ${patientProfile.allergies}`
      : "Allergy Notice: Allergy information not recorded.";

    const dateStr = new Date().toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });

    const medLines =
      activeMedicationsList.length > 0
        ? activeMedicationsList.map(
            (med) =>
              `• ${med.name} (${med.strength})\n  Sig: ${med.instructions}\n  Prescriber: ${med.prescriber} | Issued: ${med.issuedDate}\n`,
          )
        : ["No active prescriptions currently recorded."];

    const listText = [
      "Kaizen Care - Active Medication List",
      `Patient: ${patName} (ID: ${patId})`,
      `Generated: ${dateStr}`,
      `Pharmacy: ${pharmText}`,
      "--------------------------------------------------",
      ...medLines,
      "--------------------------------------------------",
      allergyText,
    ].join("\n");

    const safeFilename = `${patName.replace(/\s+/g, "_")}-Medications.txt`;
    const blob = new Blob([listText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", safeFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToastMessage("Medication list downloaded successfully.");
    setTimeout(() => setToastMessage(""), 3500);
  };

  const handleDownloadPrescription = async (prescription) => {
    try {
      const blob = await clinicalApi.downloadPrescription(prescription.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `prescription-${prescription.id}.txt`;
      link.click();
      URL.revokeObjectURL(url);
      setToastMessage(`Prescription for ${prescription.name} downloaded.`);
    } catch (err) {
      setToastMessage(err.message);
    }
    setTimeout(() => setToastMessage(""), 3500);
  };

  const handleDownloadSummary = async (summary) => {
    if (!summary) return;
    try {
      const blob = await clinicalApi.downloadSummary(summary.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `consultation-summary-${summary.id}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setToastMessage("Consultation summary downloaded.");
    } catch (err) {
      setToastMessage(err.message || "Consultation summary downloaded.");
    }
    setTimeout(() => setToastMessage(""), 3500);
  };

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
              {currentMode === "summaries"
                ? "Consultation summaries"
                : "Your prescriptions"}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#577877]">
              {currentMode === "summaries"
                ? "Clinical notes and care plans from your past visits."
                : "A clear view of your medications, instructions, and refill information."}
            </p>
          </div>

          {currentMode === "prescriptions" ? (
            <button
              type="button"
              onClick={handleDownloadMedList}
              className="bg-white border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs transition cursor-pointer self-start sm:self-auto"
            >
              <span className="material-symbols-outlined !text-[#25836F] text-base">
                download
              </span>
              <span>Download medication list</span>
            </button>
          ) : summariesList.length > 0 ? (
            <button
              type="button"
              onClick={() => handleDownloadSummary(summariesList[0])}
              className="bg-white border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs transition cursor-pointer self-start sm:self-auto"
            >
              <span className="material-symbols-outlined !text-[#25836F] text-base">
                download
              </span>
              <span>Download summary</span>
            </button>
          ) : null}
        </div>

        {/* Top Safety Banner - Prescriptions Mode Only */}
        {currentMode === "prescriptions" && (
          <div className="p-4 sm:p-5 rounded-2xl bg-[#E8F3F3] border border-[#577877]/20 flex items-start gap-3.5">
            <span className="material-symbols-outlined !text-[#25836F] text-xl shrink-0 mt-0.5">
              health_and_safety
            </span>
            <div className="text-xs space-y-0.5">
              <h2 className="font-bold text-[#162623]">
                Take medicines only as prescribed
              </h2>
              <p className="text-[#577877] leading-relaxed">
                Don't change or stop medication without speaking to your
                clinician. If your list looks wrong, contact your care team.
              </p>
            </div>
          </div>
        )}

        {/* Status Tabs Row */}
        <div className="flex items-center gap-8 border-b border-[#577877]/20 pt-1 text-sm font-semibold">
          {[
            { id: "active", label: `Active (${activeMedicationsList.length})` },
            { id: "past", label: "Past medications" },
            { id: "refills", label: `Refill requests (${refillTickets.length})` },
            { id: "summaries", label: "Consultation summaries" },
          ].map((tab) => {
            const isTabActive =
              currentMode === "summaries"
                ? tab.id === "summaries"
                : activeSubTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === "summaries") {
                    setCurrentMode("summaries");
                    setActiveSubTab("summaries");
                  } else {
                    setCurrentMode("prescriptions");
                    setActiveSubTab(tab.id);
                  }
                }}
                className={`transition pb-3 relative cursor-pointer ${
                  isTabActive
                    ? "text-[#25836F] font-bold"
                    : "text-[#577877] hover:text-[#162623]"
                }`}
              >
                <span>{tab.label}</span>
                {isTabActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#25836F] rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* Main 2-Column Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (8 cols): Prescription Cards Feed */}
          <div className="lg:col-span-8 space-y-5">
            {/* TAB: ACTIVE MEDICATIONS */}
            {currentMode === "prescriptions" && activeSubTab === "active" && (
              <>
                {activeMedicationsList.length === 0 ? (
                  <div className="care-card p-12 text-center text-[#577877] space-y-3">
                    <span className="w-12 h-12 rounded-full bg-[#E0F0EC] text-[#25836F] flex items-center justify-center mx-auto">
                      <span className="material-symbols-outlined !text-[#25836F] text-2xl">
                        pill
                      </span>
                    </span>
                    <h3 className="text-base font-bold text-[#162623]">
                      No active prescriptions yet.
                    </h3>
                    <p className="text-xs max-w-md mx-auto leading-relaxed">
                      When your clinician issues new prescriptions during your consultations, they will appear here along with instructions and refill options.
                    </p>
                  </div>
                ) : (
                  activeMedicationsList.map((med) => (
                    <div
                      key={med.id}
                      className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-4 hover:shadow-md transition"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          <div className="w-10 h-10 rounded-xl bg-[#E0F0EC] text-[#25836F] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined !text-[#25836F] text-xl">
                              pill
                            </span>
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-[#162623]">
                              {med.name}
                            </h3>
                            <p className="text-xs text-[#577877] mt-0.5">
                              {med.strength}
                            </p>
                          </div>
                        </div>

                        <div>
                          <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full bg-[#E8F3F3] text-[#25836F]">
                            {med.statusBadge}
                          </span>
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-[#162623]">
                          {med.instructions}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-y-3 gap-x-4 text-xs pt-1">
                        <div>
                          <span className="text-[#577877] block text-[11px]">
                            Prescriber
                          </span>
                          <span className="font-semibold text-xs text-[#162623] mt-0.5 block">
                            {med.prescriber}
                          </span>
                        </div>

                        <div>
                          <span className="text-[#577877] block text-[11px]">
                            Issued
                          </span>
                          <span className="font-semibold text-xs text-[#162623] mt-0.5 block">
                            {med.issuedDate}
                          </span>
                        </div>

                        <div>
                          <span className="text-[#577877] block text-[11px]">
                            Refills
                          </span>
                          <span className="font-semibold text-xs text-[#162623] mt-0.5 block">
                            {med.refills}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[#577877]/15">
                        <button
                          type="button"
                          onClick={() => setSelectedRx(med)}
                          className="border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-4 py-2 rounded-xl font-semibold text-xs shadow-2xs transition cursor-pointer"
                        >
                          View prescription
                        </button>

                        <button
                          type="button"
                          onClick={() => setRefillModalRx(med)}
                          className="border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-4 py-2 rounded-xl font-semibold text-xs shadow-2xs transition cursor-pointer"
                        >
                          Request refill
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            {/* TAB: PAST MEDICATIONS */}
            {currentMode === "prescriptions" && activeSubTab === "past" && (
              <div className="space-y-4">
                {pastMedicationsList.length === 0 ? (
                  <div className="care-card p-12 text-center text-[#577877]">
                    No past prescription history found.
                  </div>
                ) : (
                  pastMedicationsList.map((med) => (
                    <div
                      key={med.id}
                      className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-3.5">
                          <div className="w-10 h-10 rounded-xl bg-[#F0F5F7] text-[#577877] flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-xl">
                              medication
                            </span>
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-[#162623]">
                              {med.name}
                            </h3>
                            <p className="text-xs text-[#577877]">
                              {med.strength}
                            </p>
                          </div>
                        </div>
                        <span className="px-3 py-1 rounded-full bg-[#F0F5F7] text-[#577877] font-semibold text-xs">
                          {med.statusBadge}
                        </span>
                      </div>
                      <p className="text-xs text-[#577877]">{med.instructions}</p>
                      <div className="grid grid-cols-2 gap-4 text-xs pt-1 border-t border-[#577877]/15">
                        <div>
                          <span className="text-[#577877] block text-[11px]">
                            Prescribed by
                          </span>
                          <span className="font-semibold text-[#162623]">
                            {med.prescriber}
                          </span>
                        </div>
                        <div>
                          <span className="text-[#577877] block text-[11px]">
                            Date Issued
                          </span>
                          <span className="font-semibold text-[#162623]">
                            {med.issuedDate}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB: REFILL REQUESTS */}
            {currentMode === "prescriptions" && activeSubTab === "refills" && (
              <div className="space-y-4">
                {refillTickets.length === 0 ? (
                  <div className="care-card p-8 rounded-2xl bg-white border border-[#577877]/15 text-center space-y-3">
                    <span className="w-12 h-12 rounded-full bg-[#E0F0EC] text-[#25836F] flex items-center justify-center mx-auto">
                      <span className="material-symbols-outlined !text-[#25836F] text-2xl">
                        autorenew
                      </span>
                    </span>
                    <h3 className="text-base font-bold text-[#162623]">
                      No pending refill requests
                    </h3>
                    <p className="text-xs text-[#577877] max-w-md mx-auto leading-relaxed">
                      When you request a refill for your active prescriptions, you
                      can track its authorization status and pharmacy pickup
                      timeline here.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveSubTab("active")}
                      className="btn-primary !px-5 !py-2 text-xs rounded-xl font-semibold shadow-2xs mt-2 cursor-pointer"
                    >
                      View active medications
                    </button>
                  </div>
                ) : (
                  refillTickets.map((t) => (
                    <div
                      key={t.id}
                      className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-3"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-[#162623]">{t.subject}</span>
                        <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-bold uppercase text-[10px]">
                          {t.status || "Pending Review"}
                        </span>
                      </div>
                      <p className="text-xs text-[#577877] leading-relaxed">{t.description}</p>
                      <p className="text-[11px] text-[#577877]">
                        Submitted on {new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · Requires clinician authorization
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB: CONSULTATION SUMMARIES */}
            {currentMode === "summaries" && (
              <div className="space-y-5">
                {summariesList.length === 0 ? (
                  <div className="care-card p-12 text-center text-[#577877]">
                    No consultation summaries found.
                  </div>
                ) : (
                  summariesList.map((sum) => (
                    <div
                      key={sum.id}
                      className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-4 hover:shadow-md transition"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#577877]/15">
                        <div>
                          <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
                            Clinical Encounter Note · {sum.id}
                          </span>
                          <h3 className="text-base font-bold text-[#162623] mt-0.5">
                            {sum.doctor_name || "Authorized Clinician"}
                          </h3>
                        </div>
                        <span className="text-xs text-[#577877] font-medium">
                          {sum.released_at ? new Date(sum.released_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : ""}
                        </span>
                      </div>

                      <div className="space-y-1 text-xs">
                        <span className="text-[#577877] block text-[11px]">
                          Diagnosis
                        </span>
                        <p className="font-semibold text-[#162623]">
                          {sum.diagnosis || "Consultation Summary"}
                        </p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-[#F0F5F7] text-xs text-[#162623] leading-relaxed space-y-1">
                        <span className="font-bold text-[#25836F]">
                          Clinical Assessment:
                        </span>
                        <p className="text-[#577877]">{sum.notes || sum.summary_notes || "Clinical notes recorded during encounter."}</p>
                      </div>

                      <div className="space-y-1 text-xs">
                        <span className="text-[#577877] block text-[11px]">
                          Recommended Plan
                        </span>
                        <p className="text-[#162623]">{sum.care_plan || sum.plan || "Follow clinician recommendations."}</p>
                      </div>

                      <div className="flex justify-end pt-2 border-t border-[#577877]/15">
                        <button
                          type="button"
                          onClick={() => handleDownloadSummary(sum)}
                          className="btn-secondary !px-4 !py-2 text-xs rounded-xl font-semibold flex items-center gap-1.5 cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">
                            download
                          </span>
                          <span>Download Summary</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Right Column (4 cols): Your pharmacy + Allergy card + Need a refill? */}
          <div className="lg:col-span-4 space-y-5">
            {/* CARD 1: Your pharmacy */}
            <div className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-4">
              <h3 className="text-base font-bold text-[#162623]">
                Your pharmacy
              </h3>

              {pharmacy.name ? (
                <div className="space-y-1.5 pt-1">
                  <span className="material-symbols-outlined !text-[#25836F] text-xl block">
                    location_on
                  </span>
                  <h4 className="font-bold text-sm text-[#162623] pt-1">
                    {pharmacy.name}
                  </h4>
                  {pharmacy.address && (
                    <p className="text-xs text-[#577877] leading-relaxed">
                      {pharmacy.address}
                    </p>
                  )}
                  {pharmacy.phone && (
                    <p className="text-xs text-[#577877] pt-1">{pharmacy.phone}</p>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5 pt-1 text-xs text-[#577877]">
                  <span className="material-symbols-outlined text-amber-600 text-xl block">
                    location_off
                  </span>
                  <h4 className="font-bold text-sm text-[#162623] pt-1">
                    No preferred pharmacy selected
                  </h4>
                  <p className="leading-relaxed">
                    Select a preferred pharmacy so your clinician can route e-prescriptions directly.
                  </p>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setPharmacyForm({
                      name: pharmacy.name || "",
                      address: pharmacy.address || "",
                      phone: pharmacy.phone || "",
                    });
                    setShowPharmacyModal(true);
                  }}
                  className="w-full border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] py-2.5 rounded-xl font-semibold text-xs text-center block shadow-2xs transition cursor-pointer"
                >
                  {pharmacy.name ? "Update pharmacy" : "Select preferred pharmacy"}
                </button>
              </div>
            </div>

            {/* CARD 2: Allergy Notice Box */}
            <div
              className={`p-5 rounded-2xl border flex items-start gap-3 ${
                patientProfile?.allergies
                  ? "bg-[#FFFBEB] border-[#FDE68A]"
                  : "bg-[#F0F5F7] border-[#577877]/20"
              }`}
            >
              <span
                className={`material-symbols-outlined text-lg shrink-0 mt-0.5 ${
                  patientProfile?.allergies ? "!text-[#D97706]" : "text-[#577877]"
                }`}
              >
                info
              </span>
              <div className="text-xs space-y-1">
                <h4
                  className={`font-bold ${
                    patientProfile?.allergies ? "text-[#92400E]" : "text-[#162623]"
                  }`}
                >
                  {patientProfile?.allergies ? "Allergy on record" : "Allergy status"}
                </h4>
                <p
                  className={`leading-relaxed ${
                    patientProfile?.allergies ? "text-[#B45309]" : "text-[#577877]"
                  }`}
                >
                  {patientProfile?.allergies
                    ? `${patientProfile.allergies}. Tell your clinician if your allergies or reactions have changed.`
                    : "Allergy information not recorded. Please review with your care team before starting new medications."}
                </p>
              </div>
            </div>

            {/* CARD 3: Need a refill? */}
            <div className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-2">
              <h3 className="text-base font-bold text-[#162623]">
                Need a refill?
              </h3>
              <p className="text-xs text-[#577877] leading-relaxed">
                Allow 2 business days for care team review. Requests are not
                automatically approved and require clinician authorization.
              </p>
            </div>
          </div>
        </div>

        {/* Global Footer */}
        <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
          <p>© 2026 Kaizen Care · Your health, thoughtfully connected.</p>
          <div className="flex items-center gap-4">
            <span className="hover:text-[#162623] cursor-pointer">Privacy</span>
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

      {/* Prescription Detail Modal */}
      {selectedRx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined !text-[#25836F] text-2xl">
                  medication
                </span>
                <div>
                  <h3 className="text-base font-bold text-[#162623]">
                    {selectedRx.name}
                  </h3>
                  <p className="text-xs text-[#577877]">
                    {selectedRx.strength}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRx(null)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#F0F5F7] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#577877]">Rx ID:</span>
                <span className="font-semibold text-[#162623]">
                  {selectedRx.id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Prescriber:</span>
                <span className="font-semibold text-[#162623]">
                  {selectedRx.prescriber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Date Prescribed:</span>
                <span className="font-semibold text-[#162623]">
                  {selectedRx.issuedDate}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Instructions:</span>
                <span className="font-semibold text-[#162623]">
                  {selectedRx.instructions}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Pharmacy:</span>
                <span className="font-semibold text-[#25836F]">
                  {pharmacy.name || "No preferred pharmacy selected"}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-[#577877]/15">
                <span className="text-[#577877]">Refills Status:</span>
                <span className="font-bold text-[#162623]">
                  {selectedRx.refills}
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setSelectedRx(null)}
                className="btn-secondary !py-2 !px-4 text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDownloadPrescription(selectedRx);
                  setSelectedRx(null);
                  setTimeout(() => setToastMessage(""), 3500);
                }}
                className="btn-primary !py-2 !px-4 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">
                  download
                </span>
                <span>Download e-Rx</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Request Refill Modal */}
      {refillModalRx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined !text-[#25836F] text-2xl">
                  autorenew
                </span>
                <h3 className="text-base font-bold text-[#162623]">
                  Request Refill
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRefillModalRx(null)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#F0F5F7] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#577877]">Medication:</span>
                <span className="font-bold text-[#162623]">
                  {refillModalRx.name} ({refillModalRx.strength})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Clinician:</span>
                <span className="font-semibold text-[#162623]">
                  {refillModalRx.prescriber}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Fulfillment Pharmacy:</span>
                <span className="font-semibold text-[#25836F]">
                  {pharmacy.name || "No preferred pharmacy selected"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Expected Review:</span>
                <span className="font-semibold text-[#162623]">
                  1–2 business days
                </span>
              </div>
            </div>

            <p className="text-[11px] text-[#577877] leading-relaxed">
              Your care team will review your clinical record and history before authorizing this renewal.
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRefillModalRx(null)}
                className="btn-secondary !py-2 !px-4 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRefill}
                className="btn-primary !py-2 !px-4 text-xs font-semibold cursor-pointer"
              >
                Submit refill request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Preferred Pharmacy Modal */}
      {showPharmacyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined !text-[#25836F] text-2xl">
                  local_pharmacy
                </span>
                <h3 className="text-base font-bold text-[#162623]">
                  Preferred Pharmacy
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPharmacyModal(false)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleSavePharmacy} className="space-y-3 text-xs">
              <div>
                <label className="block text-xs font-semibold text-[#162623] mb-1">
                  Pharmacy Name <span className="text-rose-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pine Street Pharmacy"
                  value={pharmacyForm.name}
                  onChange={(e) =>
                    setPharmacyForm({ ...pharmacyForm, name: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#162623] mb-1">
                  Address
                </label>
                <input
                  type="text"
                  placeholder="e.g. 2100 Pine Street, San Francisco, CA"
                  value={pharmacyForm.address}
                  onChange={(e) =>
                    setPharmacyForm({ ...pharmacyForm, address: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#162623] mb-1">
                  Phone Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. (415) 555-0198"
                  value={pharmacyForm.phone}
                  onChange={(e) =>
                    setPharmacyForm({ ...pharmacyForm, phone: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPharmacyModal(false)}
                  className="btn-secondary !py-2 !px-4 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary !py-2 !px-4 text-xs font-semibold cursor-pointer"
                >
                  Save Pharmacy
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
