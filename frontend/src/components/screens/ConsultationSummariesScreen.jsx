import { useState, useEffect } from "react";
import { clinicalApi } from "../../lib/api";

// Legacy fixture retained only for backwards-compatible layout data.
// eslint-disable-next-line no-unused-vars
const defaultConsultationsList = [
  {
    id: "KC-APT-1038",
    summaryId: "SUM-2026-1038",
    dateDisplay: "Oct 29, 2026",
    dateFull: "Oct 29, 2026 · Video consultation · 30 minutes",
    title: "Blood pressure review",
    doctor: {
      name: "Dr. Sarah Chen",
      fullName: "Dr. Sarah Chen, MD",
      initials: "SC",
      specialty: "Internal medicine",
    },
    status: "Completed",
    signedStatus: "Signed by doctor",
    signedDate: "Signed Oct 29, 2026 at 11:20 AM PT · Dr. Sarah Chen, MD",
    patient: "Emma Mitchell · KC-20481",
    appointmentRef: "KC-APT-1038",
    whatWeDiscussed:
      "Reviewed home blood pressure readings and medication tolerance. Emma reported taking medication consistently with no new concerns. Discussed activity, sleep, and a lower-sodium eating pattern.",
    vitals: {
      bp: "134 / 84 mmHg",
      pulse: "72 bpm",
      medication: "No change today",
    },
    carePlan: [
      "Continue medication as prescribed.",
      "Record morning and evening blood pressure readings.",
      "Complete the ordered metabolic panel before the next review.",
      "Follow up with Dr. Chen on November 12.",
    ],
  },
  {
    id: "KC-APT-1011",
    summaryId: "SUM-2026-1011",
    dateDisplay: "Sep 24, 2026",
    dateFull: "Sep 24, 2026 · Video consultation · 25 minutes",
    title: "Routine follow-up",
    doctor: {
      name: "Dr. Sarah Chen",
      fullName: "Dr. Sarah Chen, MD",
      initials: "SC",
      specialty: "Internal medicine",
    },
    status: "Completed",
    signedStatus: "Signed by doctor",
    signedDate: "Signed Sep 24, 2026 at 3:45 PM PT · Dr. Sarah Chen, MD",
    patient: "Emma Mitchell · KC-20481",
    appointmentRef: "KC-APT-1011",
    whatWeDiscussed:
      "Routine review of comprehensive metabolic panel and fasting lipid profile. Discussed seasonal allergies and overall energy levels.",
    vitals: {
      bp: "128 / 80 mmHg",
      pulse: "70 bpm",
      medication: "Added Vitamin D3",
    },
    carePlan: [
      "Start Vitamin D3 1,000 IU softgel daily with food.",
      "Maintain daily 30-minute brisk walk.",
      "Log blood pressure readings twice weekly.",
    ],
  },
  {
    id: "KC-APT-0987",
    summaryId: "SUM-2026-0987",
    dateDisplay: "Aug 19, 2026",
    dateFull: "Aug 19, 2026 · Video consultation · 30 minutes",
    title: "Annual wellness",
    doctor: {
      name: "Dr. Michael Patel",
      fullName: "Dr. Michael Patel, MD",
      initials: "MP",
      specialty: "Internal medicine",
    },
    status: "Completed",
    signedStatus: "Signed by doctor",
    signedDate: "Signed Aug 19, 2026 at 10:15 AM PT · Dr. Michael Patel, MD",
    patient: "Emma Mitchell · KC-20481",
    appointmentRef: "KC-APT-0987",
    whatWeDiscussed:
      "Comprehensive preventive health exam and screening review. Evaluated cardiovascular risk factors, diet, and immunization history.",
    vitals: {
      bp: "130 / 82 mmHg",
      pulse: "74 bpm",
      medication: "Cetirizine 10mg as needed",
    },
    carePlan: [
      "Annual bloodwork ordered (CBC, CMP, Lipid panel).",
      "Continue Cetirizine 10mg PRN for allergy flare-ups.",
      "Follow up on lab report findings.",
    ],
  },
  {
    id: "KC-APT-0920",
    summaryId: "SUM-2026-0920",
    dateDisplay: "Jun 18, 2026",
    dateFull: "Jun 18, 2026 · Video consultation · 20 minutes",
    title: "Medication review",
    doctor: {
      name: "Dr. Sarah Chen",
      fullName: "Dr. Sarah Chen, MD",
      initials: "SC",
      specialty: "Internal medicine",
    },
    status: "Completed",
    signedStatus: "Signed by doctor",
    signedDate: "Signed Jun 18, 2026 at 2:00 PM PT · Dr. Sarah Chen, MD",
    patient: "Emma Mitchell · KC-20481",
    appointmentRef: "KC-APT-0920",
    whatWeDiscussed:
      "Medication tolerance evaluation for Lisinopril 10mg. No reported dry cough, dizziness, or peripheral edema.",
    vitals: {
      bp: "126 / 82 mmHg",
      pulse: "68 bpm",
      medication: "Lisinopril 10mg renewal",
    },
    carePlan: [
      "Renewed Lisinopril prescription for 90 days.",
      "Maintain home blood pressure monitoring.",
    ],
  },
];

export default function ConsultationSummariesScreen({ onNavigate }) {
  const [dbSummaries, setDbSummaries] = useState([]);

  useEffect(() => {
    clinicalApi
      .summaries()
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          setDbSummaries(
            items.map((s) => ({
              id: s.appointment_id || s.id,
              summaryId: s.id,
              dateDisplay: s.created_at
                ? new Date(s.created_at).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "Oct 29, 2026",
              dateFull: s.created_at
                ? `${new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · Video consultation · 30 minutes`
                : "Oct 29, 2026 · Video consultation",
              title: s.title || "Consultation summary",
              doctor: {
                name: s.doctor?.name || "Authorized clinician",
                fullName:
                  s.doctor?.full_name ||
                  s.doctor?.name ||
                  "Authorized clinician",
                initials: (s.doctor?.name || "AC")
                  .split(" ")
                  .map((part) => part[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase(),
                specialty: s.doctor?.specialty || "Specialty unavailable",
              },
              status: "Completed",
              signedStatus: "Signed by doctor",
              signedDate: s.created_at
                ? `Signed ${new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · Dr. Sarah Chen, MD`
                : "Signed by Dr. Sarah Chen, MD",
              patient: "Emma Mitchell · KC-20481",
              appointmentRef: s.appointment_id
                ? `KC-APT-${s.appointment_id.slice(0, 4).toUpperCase()}`
                : "KC-APT-1038",
              whatWeDiscussed:
                s.discussion || "No discussion details published.",
              vitals: s.structured_data?.vitals || {
                bp: "134 / 84 mmHg",
                pulse: "72 bpm",
                medication: "No change today",
              },
              carePlan: [...(s.recommendations || []), ...(s.follow_up || [])],
            })),
          );
        }
      })
      .catch(() => {});
  }, []);

  const consultationsList = dbSummaries;

  const [selectedConsultationId, setSelectedConsultationId] = useState(
    consultationsList[0]?.id || "KC-APT-1038",
  );
  const [toastMessage, setToastMessage] = useState("");
  const [showPlanModal, setShowPlanModal] = useState(false);

  const activeConsultation =
    consultationsList.find((c) => c.id === selectedConsultationId) ||
    consultationsList[0];

  if (!activeConsultation) {
    return (
      <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
        <div className="mx-auto max-w-7xl rounded-2xl bg-white border border-[#577877]/15 p-8 text-center">
          <h1 className="text-2xl font-bold">No consultation summaries yet</h1>
          <p className="mt-2 text-sm text-[#577877]">
            Completed consultation notes will appear here when they are
            available.
          </p>
        </div>
      </div>
    );
  }

  const handleAuthorizedDownload = async () => {
    try {
      const blob = await clinicalApi.downloadSummary(
        activeConsultation.summaryId,
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${activeConsultation.appointmentRef}-Summary.txt`;
      link.click();
      URL.revokeObjectURL(url);
      setToastMessage(`Downloaded summary for ${activeConsultation.title}.`);
    } catch (err) {
      setToastMessage(err.message);
    }
    setTimeout(() => setToastMessage(""), 3500);
  };

  // Legacy local-export implementation retained for compatibility; the UI uses the authorized API export above.
  // eslint-disable-next-line no-unused-vars
  const handleDownloadSummary = () => {
    const summaryText = [
      "Kaizentrix Care - Clinical Consultation Summary",
      `Title: ${activeConsultation.title}`,
      `Date: ${activeConsultation.dateFull}`,
      `Clinician: ${activeConsultation.doctor.fullName} (${activeConsultation.doctor.specialty})`,
      `Patient: ${activeConsultation.patient}`,
      `Appointment ID: ${activeConsultation.appointmentRef}`,
      "--------------------------------------------------",
      "WHAT WAS DISCUSSED:",
      activeConsultation.whatWeDiscussed,
      "",
      "RECORDED VITALS & STATUS:",
      `• Home BP: ${activeConsultation.vitals.bp}`,
      `• Pulse: ${activeConsultation.vitals.pulse}`,
      `• Medication Status: ${activeConsultation.vitals.medication}`,
      "",
      "AGREED CARE PLAN:",
      ...activeConsultation.carePlan.map((step, idx) => `${idx + 1}. ${step}`),
      "--------------------------------------------------",
      activeConsultation.signedDate,
    ].join("\n");

    const blob = new Blob([summaryText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `${activeConsultation.appointmentRef}-Summary.txt`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToastMessage(`Downloaded summary for ${activeConsultation.title}.`);
    setTimeout(() => setToastMessage(""), 3500);
  };

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Toast */}
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

        {/* Header & Top Action Row matching Screenshot */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
              The next steps, made clear
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#577877]">
              Review your doctor's notes and care plan after every consultation.
            </p>
          </div>

          <button
            type="button"
            onClick={handleAuthorizedDownload}
            className="bg-white border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs transition cursor-pointer self-start sm:self-auto"
          >
            <span className="material-symbols-outlined !text-[#295255] text-base">
              download
            </span>
            <span>Download summary</span>
          </button>
        </div>

        {/* Main 2-Column Content Layout matching Screenshot */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (4 cols): Consultations Navigation List matching Screenshot */}
          <div className="lg:col-span-4 space-y-3">
            <span className="text-[10px] font-bold text-[#577877] uppercase tracking-wider block">
              YOUR CONSULTATIONS
            </span>

            <div className="space-y-3">
              {consultationsList.map((item) => {
                const isSelected = item.id === selectedConsultationId;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedConsultationId(item.id)}
                    className={`rounded-2xl p-5 transition cursor-pointer ${
                      isSelected
                        ? "border-2 border-[#295255] bg-white shadow-sm"
                        : "border border-[#577877]/20 bg-white hover:border-[#295255]/50 hover:shadow-2xs"
                    }`}
                  >
                    <span
                      className={`text-xs block ${isSelected ? "text-[#295255] font-semibold" : "text-[#577877]"}`}
                    >
                      {item.dateDisplay}
                    </span>
                    <h3 className="text-sm font-bold text-[#162623] mt-1">
                      {item.title}
                    </h3>
                    <p className="text-xs text-[#577877] mt-0.5">
                      {item.doctor.name}
                    </p>
                    <div className="pt-2">
                      <span className="inline-block text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#E6F4EA] text-[#1E7E34]">
                        {item.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column (8 cols): Consultation Detail Card + Callout matching Screenshot */}
          <div className="lg:col-span-8 space-y-5">
            {/* CARD 1: Main Summary Detail Card matching Screenshot */}
            <div className="care-card p-6 sm:p-8 rounded-2xl bg-white border border-[#577877]/15 space-y-6">
              {/* Title & Signed Badge Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h2 className="text-xl sm:text-2xl font-bold text-[#162623]">
                  {activeConsultation.title}
                </h2>
                <span className="inline-block text-xs font-semibold px-3.5 py-1 rounded-full bg-[#E8F3F3] text-[#295255] self-start sm:self-auto">
                  {activeConsultation.signedStatus}
                </span>
              </div>

              {/* Doctor Row matching Screenshot */}
              <div className="flex items-center gap-3.5 pt-1">
                <div className="w-11 h-11 rounded-full bg-[#E0F0EC] text-[#295255] font-bold text-sm flex items-center justify-center shrink-0">
                  {activeConsultation.doctor.initials}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#162623]">
                    {activeConsultation.doctor.name}
                  </h3>
                  <p className="text-xs font-semibold text-[#295255]">
                    {activeConsultation.doctor.specialty}
                  </p>
                  <p className="text-[11px] text-[#577877]">
                    {activeConsultation.dateFull}
                  </p>
                </div>
              </div>

              {/* Patient & Appointment Metadata Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs pt-1">
                <div>
                  <span className="text-[#577877] block text-[11px]">
                    Patient
                  </span>
                  <span className="font-semibold text-xs text-[#162623] mt-0.5 block">
                    {activeConsultation.patient}
                  </span>
                </div>
                <div>
                  <span className="text-[#577877] block text-[11px]">
                    Appointment
                  </span>
                  <span className="font-semibold text-xs text-[#162623] mt-0.5 block">
                    {activeConsultation.appointmentRef}
                  </span>
                </div>
              </div>

              {/* Section 1: What we discussed matching Screenshot */}
              <div className="space-y-1.5 pt-1">
                <h4 className="text-xs sm:text-sm font-bold text-[#162623]">
                  What we discussed
                </h4>
                <p className="text-xs text-[#577877] leading-relaxed">
                  {activeConsultation.whatWeDiscussed}
                </p>
              </div>

              {/* Vitals Strip (3 columns in light box) matching Screenshot */}
              <div className="p-4 rounded-xl bg-[#F0F5F7] grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[#577877] block text-[11px]">
                    Home BP reported
                  </span>
                  <span className="font-bold text-xs text-[#162623] mt-0.5 block">
                    {activeConsultation.vitals.bp}
                  </span>
                </div>

                <div>
                  <span className="text-[#577877] block text-[11px]">
                    Pulse reported
                  </span>
                  <span className="font-bold text-xs text-[#162623] mt-0.5 block">
                    {activeConsultation.vitals.pulse}
                  </span>
                </div>

                <div>
                  <span className="text-[#577877] block text-[11px]">
                    Medication
                  </span>
                  <span className="font-bold text-xs text-[#162623] mt-0.5 block">
                    {activeConsultation.vitals.medication}
                  </span>
                </div>
              </div>

              {/* Section 2: Your agreed care plan matching Screenshot */}
              <div className="space-y-2 pt-1">
                <h4 className="text-xs sm:text-sm font-bold text-[#162623]">
                  Your agreed care plan
                </h4>
                <ol className="list-decimal list-inside space-y-1.5 text-xs text-[#577877] leading-relaxed pl-1">
                  {activeConsultation.carePlan.map((step, idx) => (
                    <li key={idx} className="text-[#577877]">
                      <span className="text-[#162623] font-medium">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Action Buttons Row matching Screenshot */}
              <div className="flex flex-wrap items-center gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate("prescriptions")}
                  className="border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-4 py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs transition cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[#295255] text-base">
                    pill
                  </span>
                  <span>View prescription</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onNavigate
                      ? onNavigate("follow-up")
                      : setShowPlanModal(true)
                  }
                  className="btn-primary !px-5 !py-2.5 rounded-xl font-semibold text-xs flex items-center gap-2 shadow-2xs cursor-pointer"
                >
                  <span className="material-symbols-outlined text-base">
                    assignment_turned_in
                  </span>
                  <span>Open follow-up plan</span>
                </button>
              </div>

              {/* Sign-off note matching Screenshot */}
              <div className="pt-2 border-t border-[#577877]/15">
                <p className="text-[11px] text-[#577877]">
                  {activeConsultation.signedDate}
                </p>
              </div>
            </div>

            {/* CARD 2: Questions about your care plan? matching Screenshot */}
            <div className="p-5 rounded-2xl bg-[#E8F3F3] border border-[#577877]/20 flex items-start gap-3">
              <span className="material-symbols-outlined !text-[#295255] text-lg shrink-0 mt-0.5">
                info
              </span>
              <div className="text-xs space-y-1">
                <h4 className="font-bold text-[#162623]">
                  Questions about your care plan?
                </h4>
                <p className="text-[#577877] leading-relaxed">
                  Contact your care team for clarification. For severe or sudden
                  symptoms, seek urgent medical attention rather than waiting
                  for a portal reply.
                </p>
              </div>
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

      {/* Follow-up Plan Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined !text-[#295255] text-2xl">
                  assignment_turned_in
                </span>
                <h3 className="text-base font-bold text-[#162623]">
                  Agreed Care Plan
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPlanModal(false)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7]"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-[#577877]">
                Tasks assigned by {activeConsultation.doctor.name} for your
                hypertension follow-up:
              </p>
              <div className="space-y-2">
                {activeConsultation.carePlan.map((task, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl bg-[#F0F5F7] flex items-start gap-2.5"
                  >
                    <span className="text-[#295255] font-bold mt-0.5">✓</span>
                    <span className="text-[#162623] font-medium leading-relaxed">
                      {task}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowPlanModal(false)}
                className="btn-primary !py-2 !px-4 text-xs font-semibold"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
