import { useState, useEffect } from "react";
import { clinicalApi } from "../../lib/api";

// Legacy fixture retained only for backwards-compatible layout data.
// eslint-disable-next-line no-unused-vars
const defaultActiveMedications = [
  {
    id: "RX-2026-1049",
    name: "Lisinopril",
    strength: "10 mg tablet",
    instructions: "Take 1 tablet by mouth once daily.",
    prescriber: "Dr. Sarah Chen",
    issuedDate: "Oct 29, 2026",
    refills: "1 refill remaining",
    statusBadge: "Refill due Nov 28",
    statusType: "warning",
    sig: "Oral daily",
    quantity: "30 tablets",
    daysSupply: "30 days",
  },
  {
    id: "RX-2026-0982",
    name: "Vitamin D3",
    strength: "1,000 IU softgel",
    instructions: "Take 1 softgel by mouth once daily with food.",
    prescriber: "Dr. Sarah Chen",
    issuedDate: "Sep 24, 2026",
    refills: "2 refills remaining",
    statusBadge: "Active",
    statusType: "active",
    sig: "Oral daily with food",
    quantity: "90 softgels",
    daysSupply: "90 days",
  },
  {
    id: "RX-2026-0811",
    name: "Cetirizine",
    strength: "10 mg tablet",
    instructions: "Take 1 tablet by mouth daily as needed for allergies.",
    prescriber: "Dr. Michael Patel",
    issuedDate: "Aug 19, 2026",
    refills: "No refills · Contact care team",
    statusBadge: "As needed",
    statusType: "neutral",
    sig: "Oral as needed",
    quantity: "30 tablets",
    daysSupply: "30 days",
  },
];

const pastMedicationsList = [
  {
    id: "RX-2026-0420",
    name: "Amoxicillin",
    strength: "500 mg capsule",
    instructions: "Take 1 capsule by mouth three times daily for 7 days.",
    prescriber: "Dr. Sarah Chen",
    issuedDate: "May 10, 2026",
    refills: "0 refills · Course completed",
    statusBadge: "Completed",
    statusType: "neutral",
  },
  {
    id: "RX-2025-0810",
    name: "Ibuprofen",
    strength: "600 mg tablet",
    instructions:
      "Take 1 tablet every 8 hours as needed for joint inflammation.",
    prescriber: "Dr. Michael Patel",
    issuedDate: "Nov 14, 2025",
    refills: "Expired",
    statusBadge: "Inactive",
    statusType: "neutral",
  },
];

const consultationSummariesList = [
  {
    id: "SUM-2026-1038",
    doctor: "Dr. Sarah Chen, MD",
    specialty: "Internal medicine",
    date: "Oct 29, 2026",
    appointmentId: "KC-APT-1038",
    diagnosis: "Essential Hypertension (controlled), Vitamin D deficiency",
    notes:
      "Patient reports consistent home BP readings averaging 124/82 mmHg. Well-tolerated Lisinopril 10mg. Added Vitamin D3 1,000 IU softgels for seasonal support. Return for routine check in 3 months.",
    plan: "Continue Lisinopril 10mg daily. Log home BP twice weekly.",
  },
  {
    id: "SUM-2026-1011",
    doctor: "Dr. Sarah Chen, MD",
    specialty: "Internal medicine",
    date: "Sep 24, 2026",
    appointmentId: "KC-APT-1011",
    diagnosis: "Routine follow-up",
    notes:
      "Reviewed comprehensive metabolic panel and lipid panel. All markers within target reference intervals.",
    plan: "Maintain Mediterranean-style diet and regular walking regimen.",
  },
  {
    id: "SUM-2026-0987",
    doctor: "Dr. Michael Patel, MD",
    specialty: "Internal medicine",
    date: "Aug 19, 2026",
    appointmentId: "KC-APT-0987",
    diagnosis: "Seasonal allergic rhinitis",
    notes:
      "Mild conjunctival and nasal mucosal irritation. Cetirizine 10mg prescribed for symptom control as needed.",
    plan: "Avoid high pollen outdoors during morning hours.",
  },
];

export default function PrescriptionsScreen({
  onNavigate,
  initialTab = "active",
}) {
  // If navigated with initialTab="summaries", switch directly to summaries mode
  const [currentMode, setCurrentMode] = useState(
    initialTab === "summaries" ? "summaries" : "prescriptions",
  );
  const [activeSubTab, setActiveSubTab] = useState(
    initialTab === "summaries" ? "summaries" : "active",
  ); // 'active' | 'past' | 'refills' | 'summaries'

  const [dbPrescriptions, setDbPrescriptions] = useState([]);

  useEffect(() => {
    clinicalApi
      .prescriptions()
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          setDbPrescriptions(
            items.map((rx) => ({
              id: rx.id,
              name: rx.medication_name,
              strength: rx.dosage,
              instructions: rx.instructions,
              prescriber: rx.prescriber_name || "Authorized clinician",
              issuedDate: rx.released_at
                ? new Date(rx.released_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Published date unavailable",
              refills: "See prescription instructions",
              statusBadge: "Issued",
              statusType: rx.status === "active" ? "active" : "neutral",
              sig: rx.instructions || "Follow the published instructions.",
              quantity:
                rx.medicines
                  ?.map((medicine) => medicine.quantity)
                  .filter(Boolean)
                  .join(", ") || "See prescription details",
              daysSupply:
                rx.medicines
                  ?.map((medicine) => medicine.duration)
                  .filter(Boolean)
                  .join(", ") || "See prescription details",
              medicines: rx.medicines || [],
            })),
          );
        }
      })
      .catch(() => {});
  }, []);

  const activeMedicationsList = dbPrescriptions;

  // Modals & States
  const [selectedRx, setSelectedRx] = useState(null);
  const [refillModalRx, setRefillModalRx] = useState(null);
  const [showPharmacyModal, setShowPharmacyModal] = useState(false);
  const [pharmacy, setPharmacy] = useState({
    name: "Pine Street Pharmacy",
    address: "2100 Pine Street",
    cityStateZip: "San Francisco, CA 94115",
    phone: "(415) 555-0198",
  });
  const [toastMessage, setToastMessage] = useState("");

  const handleDownloadMedList = () => {
    const listText = [
      "Kaizentrix Care - Active Medication List",
      "Patient: Emma Mitchell (ID: KC-20481)",
      `Generated: November 4, 2026`,
      "Pharmacy: " + pharmacy.name + " - " + pharmacy.phone,
      "--------------------------------------------------",
      ...activeMedicationsList.map(
        (med) =>
          `• ${med.name} (${med.strength})\n  Sig: ${med.instructions}\n  Prescriber: ${med.prescriber} | Refills: ${med.refills}\n`,
      ),
      "--------------------------------------------------",
      "Allergy Notice: Penicillin (Rash)",
    ].join("\n");

    const blob = new Blob([listText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", "Emma-Mitchell-Medications.txt");
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

  const handleConfirmRefill = () => {
    if (refillModalRx) {
      setToastMessage(
        `Refill request for ${refillModalRx.name} submitted to ${pharmacy.name}.`,
      );
      setRefillModalRx(null);
      setTimeout(() => setToastMessage(""), 4500);
    }
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

        {/* Page Heading & Top Action Row matching Screenshot */}
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
        </div>

        {/* Top Reassurance / Safety Banner matching Screenshot */}
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

        {/* Status Tabs Row matching Screenshot */}
        <div className="flex items-center gap-8 border-b border-[#577877]/20 pt-1 text-sm font-semibold">
          {[
            { id: "active", label: `Active (${activeMedicationsList.length})` },
            { id: "past", label: "Past medications" },
            { id: "refills", label: "Refill requests" },
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

        {/* Main 2-Column Content Layout matching Screenshot */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (8 cols): Prescription Cards Feed */}
          <div className="lg:col-span-8 space-y-5">
            {/* TAB: ACTIVE MEDICATIONS (Matches Screenshot 17) */}
            {currentMode === "prescriptions" && activeSubTab === "active" && (
              <>
                {activeMedicationsList.map((med) => (
                  <div
                    key={med.id}
                    className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-4 hover:shadow-md transition"
                  >
                    {/* Header Row: Pill icon + Name + Subtitle + Badge */}
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

                      {/* Status Badge matching Screenshot */}
                      <div>
                        {med.statusType === "warning" && (
                          <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full bg-[#FEF3C7] text-[#92400E]">
                            {med.statusBadge}
                          </span>
                        )}
                        {med.statusType === "active" && (
                          <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full bg-[#E8F3F3] text-[#25836F]">
                            {med.statusBadge}
                          </span>
                        )}
                        {med.statusType === "neutral" && (
                          <span className="inline-block text-xs font-semibold px-3 py-1 rounded-full bg-[#E8F3F3] text-[#25836F]">
                            {med.statusBadge}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Instruction matching Screenshot */}
                    <div>
                      <p className="text-xs font-semibold text-[#162623]">
                        {med.instructions}
                      </p>
                    </div>

                    {/* 3-Column Metadata Row matching Screenshot */}
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

                    {/* Actions Row matching Screenshot */}
                    <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-[#577877]/15">
                      <button
                        type="button"
                        onClick={() => setSelectedRx(med)}
                        className="border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-4 py-2 rounded-xl font-semibold text-xs shadow-2xs transition cursor-pointer"
                      >
                        View prescription
                      </button>

                      {med.refills.includes("No refills") ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (onNavigate) onNavigate("support");
                            else
                              setToastMessage(
                                "Redirecting to care team contact.",
                              );
                          }}
                          className="border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-4 py-2 rounded-xl font-semibold text-xs shadow-2xs transition cursor-pointer"
                        >
                          Contact care team
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRefillModalRx(med)}
                          className="border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-4 py-2 rounded-xl font-semibold text-xs shadow-2xs transition cursor-pointer"
                        >
                          Request refill
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}

            {/* TAB: PAST MEDICATIONS */}
            {currentMode === "prescriptions" && activeSubTab === "past" && (
              <div className="space-y-4">
                {pastMedicationsList.map((med) => (
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
                ))}
              </div>
            )}

            {/* TAB: REFILL REQUESTS */}
            {currentMode === "prescriptions" && activeSubTab === "refills" && (
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
                  className="btn-primary !px-5 !py-2 text-xs rounded-xl font-semibold shadow-2xs mt-2"
                >
                  View active medications
                </button>
              </div>
            )}

            {/* TAB: CONSULTATION SUMMARIES */}
            {currentMode === "summaries" && (
              <div className="space-y-5">
                {consultationSummariesList.map((sum) => (
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
                          {sum.doctor} · {sum.specialty}
                        </h3>
                      </div>
                      <span className="text-xs text-[#577877] font-medium">
                        {sum.date}
                      </span>
                    </div>

                    <div className="space-y-1 text-xs">
                      <span className="text-[#577877] block text-[11px]">
                        Diagnosis
                      </span>
                      <p className="font-semibold text-[#162623]">
                        {sum.diagnosis}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-xl bg-[#F0F5F7] text-xs text-[#162623] leading-relaxed space-y-1">
                      <span className="font-bold text-[#25836F]">
                        Clinical Assessment:
                      </span>
                      <p className="text-[#577877]">{sum.notes}</p>
                    </div>

                    <div className="space-y-1 text-xs">
                      <span className="text-[#577877] block text-[11px]">
                        Recommended Plan
                      </span>
                      <p className="text-[#162623]">{sum.plan}</p>
                    </div>

                    <div className="flex justify-end pt-2 border-t border-[#577877]/15">
                      <button
                        type="button"
                        onClick={() => {
                          setToastMessage(
                            `Downloaded clinical summary for ${sum.date}`,
                          );
                          setTimeout(() => setToastMessage(""), 3500);
                        }}
                        className="btn-secondary !px-4 !py-2 text-xs rounded-xl font-semibold flex items-center gap-1.5"
                      >
                        <span className="material-symbols-outlined text-sm">
                          download
                        </span>
                        <span>Download Summary</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Column (4 cols): Your pharmacy + Allergy card + Need a refill? */}
          <div className="lg:col-span-4 space-y-5">
            {/* CARD 1: Your pharmacy matching Screenshot */}
            <div className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-4">
              <h3 className="text-base font-bold text-[#162623]">
                Your pharmacy
              </h3>

              {/* Pin icon + Pharmacy Details */}
              <div className="space-y-1.5 pt-1">
                <span className="material-symbols-outlined !text-[#25836F] text-xl block">
                  location_on
                </span>
                <h4 className="font-bold text-sm text-[#162623] pt-1">
                  {pharmacy.name}
                </h4>
                <p className="text-xs text-[#577877] leading-relaxed">
                  {pharmacy.address}
                  <br />
                  {pharmacy.cityStateZip}
                </p>
                <p className="text-xs text-[#577877] pt-1">{pharmacy.phone}</p>
              </div>

              {/* Update pharmacy button matching Screenshot */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowPharmacyModal(true)}
                  className="w-full border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] py-2.5 rounded-xl font-semibold text-xs text-center block shadow-2xs transition cursor-pointer"
                >
                  Update pharmacy
                </button>
              </div>
            </div>

            {/* CARD 2: Allergy on record Alert Box matching Screenshot */}
            <div className="p-5 rounded-2xl bg-[#FFFBEB] border border-[#FDE68A] flex items-start gap-3">
              <span className="material-symbols-outlined !text-[#D97706] text-lg shrink-0 mt-0.5">
                info
              </span>
              <div className="text-xs space-y-1">
                <h4 className="font-bold text-[#92400E]">Allergy on record</h4>
                <p className="text-[#B45309] leading-relaxed">
                  Penicillin · Rash. Tell your clinician if your allergies or
                  reactions have changed.
                </p>
              </div>
            </div>

            {/* CARD 3: Need a refill? matching Screenshot */}
            <div className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-2">
              <h3 className="text-base font-bold text-[#162623]">
                Need a refill?
              </h3>
              <p className="text-xs text-[#577877] leading-relaxed">
                Allow 2 business days for care team review. Requests are not
                automatically approved.
              </p>
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
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7]"
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
                <span className="text-[#577877]">Dispense Quantity:</span>
                <span className="font-semibold text-[#162623]">
                  {selectedRx.quantity || "30 count"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Pharmacy:</span>
                <span className="font-semibold text-[#25836F]">
                  {pharmacy.name}
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
                className="btn-secondary !py-2 !px-4 text-xs font-semibold"
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
                className="btn-primary !py-2 !px-4 text-xs font-semibold flex items-center gap-1.5"
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
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7]"
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
                  {pharmacy.name}
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
              Your care team will review your blood pressure logs and clinical
              record before authorizing this renewal.
            </p>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setRefillModalRx(null)}
                className="btn-secondary !py-2 !px-4 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRefill}
                className="btn-primary !py-2 !px-4 text-xs font-semibold"
              >
                Submit refill request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Update Pharmacy Modal */}
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
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7]"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {[
                {
                  name: "Pine Street Pharmacy",
                  address: "2100 Pine Street",
                  cityStateZip: "San Francisco, CA 94115",
                  phone: "(415) 555-0198",
                },
                {
                  name: "Walgreens Community Pharmacy",
                  address: "2145 Market St",
                  cityStateZip: "San Francisco, CA 94114",
                  phone: "(415) 555-0240",
                },
                {
                  name: "CVS Pharmacy #9182",
                  address: "499 Haight St",
                  cityStateZip: "San Francisco, CA 94117",
                  phone: "(415) 555-0377",
                },
              ].map((p) => {
                const isSelected = pharmacy.name === p.name;
                return (
                  <div
                    key={p.name}
                    onClick={() => {
                      setPharmacy(p);
                      setShowPharmacyModal(false);
                      setToastMessage(
                        `Preferred pharmacy updated to ${p.name}.`,
                      );
                      setTimeout(() => setToastMessage(""), 3500);
                    }}
                    className={`p-3.5 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? "border-2 border-[#25836F] bg-[#E8F3F3]"
                        : "border-[#577877]/20 hover:border-[#25836F] bg-white"
                    }`}
                  >
                    <div>
                      <h4 className="font-bold text-[#162623]">{p.name}</h4>
                      <p className="text-[#577877] text-[11px]">
                        {p.address}, {p.cityStateZip}
                      </p>
                      <p className="text-[#577877] text-[11px]">{p.phone}</p>
                    </div>
                    {isSelected && (
                      <span className="material-symbols-outlined !text-[#25836F] text-lg">
                        check_circle
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowPharmacyModal(false)}
                className="btn-secondary !py-2 !px-4 text-xs font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
