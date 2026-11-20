import { useState, useEffect } from "react";
import { clinicalApi, patientApi } from "../../lib/api";

export default function ConsultationSummariesScreen({ onNavigate }) {
  const [dbSummaries, setDbSummaries] = useState([]);
  const [patientName, setPatientName] = useState("");
  const [selectedConsultationId, setSelectedConsultationId] = useState("");
  const [toastMessage, setToastMessage] = useState("");
  const [showPlanModal, setShowPlanModal] = useState(false);

  useEffect(() => {
    patientApi
      .profile()
      .then((p) => setPatientName(p?.full_name || p?.name || "Patient"))
      .catch(() => setPatientName("Patient"));
  }, []);

  useEffect(() => {
    clinicalApi
      .summaries()
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          const mapped = items.map((s) => {
            const docName = s.doctor?.full_name || s.doctor?.name || "Treating Clinician";
            const dateStr = s.created_at
              ? new Date(s.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Date unavailable";
            const vitalsObj = s.structured_data?.vitals || {};

            return {
              id: s.appointment_id || s.id,
              summaryId: s.id,
              dateDisplay: dateStr,
              dateFull: s.created_at
                ? `${dateStr} · Video consultation · 30 minutes`
                : "Video consultation",
              title: s.title || "Consultation summary",
              doctor: {
                name: docName,
                fullName: docName,
                initials: docName
                  .split(" ")
                  .map((part) => part[0])
                  .filter(Boolean)
                  .join("")
                  .slice(0, 2)
                  .toUpperCase() || "MD",
                specialty: s.doctor?.specialty || "General Medicine",
              },
              status: "Completed",
              signedStatus: "Signed by doctor",
              signedDate: s.created_at
                ? `Signed ${dateStr} · ${docName}`
                : `Signed by ${docName}`,
              patient: patientName || "Patient",
              appointmentRef: s.appointment_id
                ? (s.appointment_id.startsWith("apt-")
                    ? s.appointment_id
                    : `KC-APT-${s.appointment_id.slice(0, 4).toUpperCase()}`)
                : "Appointment Summary",
              whatWeDiscussed:
                s.discussion || "No discussion details recorded.",
              vitals: {
                bp: vitalsObj.bp || "Not recorded",
                pulse: vitalsObj.pulse || "Not recorded",
                medication: vitalsObj.medication || "None documented",
              },
              carePlan: [
                ...(s.recommendations || []),
                ...(s.follow_up || []),
              ],
            };
          });
          setDbSummaries(mapped);
          setSelectedConsultationId(mapped[0]?.id || "");
        }
      })
      .catch(() => {});
  }, [patientName]);

  const consultationsList = dbSummaries;

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

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Toast */}
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
            <span className="material-symbols-outlined !text-[#25836F] text-base">
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
                        ? "border-2 border-[#25836F] bg-white shadow-sm"
                        : "border border-[#577877]/20 bg-white hover:border-[#25836F]/50 hover:shadow-2xs"
                    }`}
                  >
                    <span
                      className={`text-xs block ${isSelected ? "text-[#25836F] font-semibold" : "text-[#577877]"}`}
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
                <span className="inline-block text-xs font-semibold px-3.5 py-1 rounded-full bg-[#E8F3F3] text-[#25836F] self-start sm:self-auto">
                  {activeConsultation.signedStatus}
                </span>
              </div>

              {/* Doctor Row matching Screenshot */}
              <div className="flex items-center gap-3.5 pt-1">
                <div className="w-11 h-11 rounded-full bg-[#E0F0EC] text-[#25836F] font-bold text-sm flex items-center justify-center shrink-0">
                  {activeConsultation.doctor.initials}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#162623]">
                    {activeConsultation.doctor.name}
                  </h3>
                  <p className="text-xs font-semibold text-[#25836F]">
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
                  <span className="material-symbols-outlined !text-[#25836F] text-base">
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
              <span className="material-symbols-outlined !text-[#25836F] text-lg shrink-0 mt-0.5">
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

      {/* Follow-up Plan Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined !text-[#25836F] text-2xl">
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
                    <span className="text-[#25836F] font-bold mt-0.5">✓</span>
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
