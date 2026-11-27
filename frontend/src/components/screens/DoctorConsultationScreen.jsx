import { useEffect, useState, useRef } from "react";
import { doctorApi } from "../../lib/api";
import WebRtcConsultation from "../consultation/WebRtcConsultation";
import PrescriptionComposer from "../consultation/PrescriptionComposer";

export default function DoctorConsultationScreen({ appointment, onBack }) {
  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const webrtcRef = useRef(null);

  // Phase 3 (F-09): Specialty Multi-Disciplinary Virtual Board State
  const [showVirtualBoard, setShowVirtualBoard] = useState(false);
  const [boardMembers, setBoardMembers] = useState([]);
  const [boardNotes, setBoardNotes] = useState([]);
  const [inviteSpecialistId, setInviteSpecialistId] = useState("");
  const [inviteSpecialty, setInviteSpecialty] = useState("Cardiology");
  const [inviteRationale, setInviteRationale] = useState("");
  const [inviteUrgency, setInviteUrgency] = useState("urgent");
  const [sendingInvite, setSendingInvite] = useState(false);
  const [newObservation, setNewObservation] = useState("");
  const [newRecommendation, setNewRecommendation] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [boardMessage, setBoardMessage] = useState("");

  const loadBoardData = async () => {
    if (!appointment?.id) return;
    try {
      const [members, notes] = await Promise.all([
        doctorApi.getBoardMembers(appointment.id).catch(() => []),
        doctorApi.getBoardNotes(appointment.id).catch(() => []),
      ]);
      setBoardMembers(Array.isArray(members) ? members : []);
      setBoardNotes(Array.isArray(notes) ? notes : []);
    } catch {
      // Handled
    }
  };

  useEffect(() => {
    if (appointment?.id) {
      doctorApi
        .joinConsultation(appointment.id)
        .then(setRoom)
        .catch((err) =>
          setError(err.message || "Unable to authorize consultation."),
        );
      loadBoardData();
    }
  }, [appointment]);

  const handleSendInvite = async (e) => {
    e.preventDefault();
    if (!inviteSpecialistId.trim() || !inviteRationale.trim() || !appointment?.id) return;
    setSendingInvite(true);
    setBoardMessage("");
    try {
      await doctorApi.inviteBoardSpecialist(appointment.id, {
        specialist_doctor_id: inviteSpecialistId.trim(),
        specialty: inviteSpecialty,
        clinical_rationale: inviteRationale.trim(),
        urgency: inviteUrgency,
      });
      setBoardMessage(`Virtual board invite sent to Dr. ${inviteSpecialistId}.`);
      setInviteSpecialistId("");
      setInviteRationale("");
      await loadBoardData();
    } catch (err) {
      setBoardMessage(err.message || "Unable to dispatch virtual board invite.");
    } finally {
      setSendingInvite(false);
      setTimeout(() => setBoardMessage(""), 4000);
    }
  };

  const handleSaveBoardNote = async (e) => {
    e.preventDefault();
    if (!newObservation.trim() || !newRecommendation.trim() || !appointment?.id) return;
    setSavingNote(true);
    try {
      await doctorApi.addBoardNote(appointment.id, {
        clinical_observation: newObservation.trim(),
        specialty_recommendation: newRecommendation.trim(),
      });
      setBoardMessage("Specialist observation recorded into consultation board record.");
      setNewObservation("");
      setNewRecommendation("");
      await loadBoardData();
    } catch (err) {
      setBoardMessage(err.message || "Failed to record board note.");
    } finally {
      setSavingNote(false);
      setTimeout(() => setBoardMessage(""), 4000);
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F5F7] px-6 lg:px-10 py-3 lg:py-4 text-[#162623]">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#577877]/30 bg-white px-4 py-2 text-sm font-semibold text-[#25836F] shadow-sm hover:bg-[#F0F5F7] transition-colors cursor-pointer"
          >
            ← Back to Appointments
          </button>

          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#162623]">
              Patient: <span className="text-[#25836F]">{appointment?.patient_name || "Patient"}</span>
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Consultation Room</h1>

          {/* Phase 3 (F-09): Virtual Board Launcher */}
          <button
            type="button"
            onClick={() => setShowVirtualBoard(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-purple-50 hover:bg-purple-100 border border-purple-200 px-4 py-2 text-xs font-bold text-purple-900 shadow-xs transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-base text-purple-700">groups</span>
            <span>Multi-Disciplinary Virtual Board</span>
            {boardMembers.length > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-purple-200 text-purple-950 font-black">
                {boardMembers.length}
              </span>
            )}
          </button>
        </div>

        {boardMessage && (
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-3 text-xs font-semibold text-purple-900 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">info</span>
              {boardMessage}
            </span>
            <button type="button" onClick={() => setBoardMessage("")} className="cursor-pointer">✕</button>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        )}

        {/* Two-Column Split Layout: Left Video, Right Prescription Composer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Side: Video Call & Streaming */}
          <div className="lg:col-span-6 rounded-2xl bg-white border border-[#577877]/15 p-4 shadow-xl lg:sticky lg:top-4">
            <h3 className="text-sm font-bold text-[#162623] mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#25836F]">videocam</span>
              Video Streaming
            </h3>
            {room ? (
              <WebRtcConsultation
                ref={webrtcRef}
                appointmentId={appointment?.id}
                authorization={room}
                role="doctor"
                onEnded={onBack}
              />
            ) : !error ? (
              <div className="p-12 text-center text-[#577877] space-y-3">
                <span className="material-symbols-outlined animate-spin text-4xl text-[#25836F]">
                  sync
                </span>
                <p className="text-sm font-bold text-[#162623]">
                  Authorizing video consultation room…
                </p>
              </div>
            ) : null}
          </div>

          {/* Right Side: Write Prescription & Send */}
          <div className="lg:col-span-6 rounded-2xl bg-white border border-[#577877]/15 p-6 shadow-xl overflow-y-auto max-h-[calc(100vh-120px)]">
            <h3 className="text-sm font-bold text-[#162623] mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#25836F]">prescriptions</span>
              Write Prescription &amp; Send
            </h3>
            <PrescriptionComposer
              appointmentId={appointment?.id}
              patientName={appointment?.patient_name || "Patient"}
              onPublished={(result, payloadContent) => {
                webrtcRef.current?.emitPrescriptionPublished(result, payloadContent);
              }}
            />
          </div>
        </div>
      </div>

      {/* Phase 3 (F-09): Specialty Multi-Disciplinary Virtual Board Modal */}
      {showVirtualBoard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-3xl rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-xl">groups</span>
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#162623] flex items-center gap-2">
                    <span>Multi-Disciplinary Virtual Board</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-900">
                      Cross-Specialty Deliberation
                    </span>
                  </h3>
                  <p className="text-[11px] text-[#577877]">
                    Collaborative multi-specialist join, shared findings, and attributed recommendations
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowVirtualBoard(false)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Section 1: Invite Consulting Specialist */}
            <div className="bg-[#FAFDFD] p-4 rounded-xl border border-[#25836F]/20 space-y-3">
              <h4 className="text-xs font-bold text-[#162623] uppercase tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#25836F]">person_add</span>
                <span>Invite Consulting Specialist</span>
              </h4>
              <form onSubmit={handleSendInvite} className="space-y-3 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="font-semibold block mb-1 text-[11px]">Specialty *</label>
                    <select
                      value={inviteSpecialty}
                      onChange={(e) => setInviteSpecialty(e.target.value)}
                      className="w-full p-2 rounded-lg border border-[#577877]/25 bg-white text-xs"
                    >
                      <option value="Cardiology">Cardiology</option>
                      <option value="Medical Oncology">Medical Oncology</option>
                      <option value="Endocrinology">Endocrinology</option>
                      <option value="Nephrology">Nephrology</option>
                      <option value="Neurology">Neurology</option>
                      <option value="Pulmonology">Pulmonology</option>
                      <option value="Psychiatry">Psychiatry</option>
                      <option value="Rheumatology">Rheumatology</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold block mb-1 text-[11px]">Specialist Doctor / User ID *</label>
                    <input
                      type="text"
                      required
                      value={inviteSpecialistId}
                      onChange={(e) => setInviteSpecialistId(e.target.value)}
                      placeholder="e.g. doc-oncologist, doc-car-02"
                      className="w-full p-2 rounded-lg border border-[#577877]/25 bg-white text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold block mb-1 text-[11px]">Urgency Tier</label>
                    <select
                      value={inviteUrgency}
                      onChange={(e) => setInviteUrgency(e.target.value)}
                      className="w-full p-2 rounded-lg border border-[#577877]/25 bg-white text-xs font-semibold"
                    >
                      <option value="routine">Routine Consult</option>
                      <option value="urgent">Urgent (&lt; 15 min)</option>
                      <option value="stat">STAT / Immediate Join</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-semibold block mb-1 text-[11px]">Clinical Rationale &amp; Questions *</label>
                  <input
                    type="text"
                    required
                    value={inviteRationale}
                    onChange={(e) => setInviteRationale(e.target.value)}
                    placeholder="e.g. Seeking secondary oncology opinion regarding persistent lymphadenopathy and biopsy indication"
                    className="w-full p-2 rounded-lg border border-[#577877]/25 bg-white text-xs"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={sendingInvite || !inviteSpecialistId.trim() || !inviteRationale.trim()}
                    className="btn-primary !py-1.5 !px-4 text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {sendingInvite ? "Sending Invite…" : "Send Virtual Board Invite"}
                  </button>
                </div>
              </form>
            </div>

            {/* Section 2: Board Members */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[#162623] uppercase tracking-wider flex items-center justify-between">
                <span>Participating Board Members ({boardMembers.length})</span>
                <span className="text-[11px] text-[#577877] font-normal">Active multi-party session</span>
              </h4>

              {boardMembers.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#577877] bg-[#F8FAFB] rounded-xl border border-dashed border-[#577877]/20">
                  No secondary specialists invited yet. Use the invite form above to summon consulting physicians.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {boardMembers.map((m) => (
                    <div key={m.id} className="p-3 rounded-xl border border-[#577877]/15 bg-white text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[#162623]">{m.specialist_name}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          m.status === "contributed"
                            ? "bg-emerald-100 text-emerald-800"
                            : m.status === "joined"
                            ? "bg-purple-100 text-purple-800"
                            : "bg-amber-100 text-amber-800"
                        }`}>
                          {m.status.toUpperCase()}
                        </span>
                      </div>
                      <p className="text-[#577877] text-[11px]">Specialty: {m.specialty} · Urgency: {m.urgency}</p>
                      <p className="text-[11px] text-slate-700 italic">&ldquo;{m.clinical_rationale}&rdquo;</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Section 3: Attributed Board Notes */}
            <div className="space-y-3 pt-2 border-t border-[#577877]/15">
              <h4 className="text-xs font-bold text-[#162623] uppercase tracking-wider">
                Attributed Specialist Observations &amp; Recommendations ({boardNotes.length})
              </h4>

              {/* Add Note Form */}
              <form onSubmit={handleSaveBoardNote} className="p-3 rounded-xl bg-purple-50/50 border border-purple-200/60 space-y-2 text-xs">
                <span className="font-bold text-purple-900 block text-[11px]">Add Attributed Specialty Finding:</span>
                <input
                  type="text"
                  required
                  value={newObservation}
                  onChange={(e) => setNewObservation(e.target.value)}
                  placeholder="Clinical observation / diagnostic interpretation"
                  className="w-full p-2 rounded-lg border border-purple-200 bg-white text-xs focus:outline-none"
                />
                <input
                  type="text"
                  required
                  value={newRecommendation}
                  onChange={(e) => setNewRecommendation(e.target.value)}
                  placeholder="Recommended therapeutic plan / further investigative tests"
                  className="w-full p-2 rounded-lg border border-purple-200 bg-white text-xs focus:outline-none"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={savingNote || !newObservation.trim() || !newRecommendation.trim()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                  >
                    <span>{savingNote ? "Recording…" : "Record Board Note"}</span>
                  </button>
                </div>
              </form>

              {/* Notes List */}
              {boardNotes.length > 0 && (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {boardNotes.map((note) => (
                    <div key={note.id} className="p-3 rounded-xl border border-[#577877]/15 bg-white text-xs space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-[#162623] flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs text-purple-700">verified</span>
                          {note.author_name} ({note.author_specialty})
                        </span>
                        <span className="text-[#577877] font-mono text-[10px]">
                          {note.created_at ? new Date(note.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                        </span>
                      </div>
                      <p className="text-slate-800 font-medium">{note.clinical_observation}</p>
                      <p className="text-[#25836F] font-semibold text-[11px]">
                        Recommendation: <span className="font-normal text-slate-700">{note.specialty_recommendation}</span>
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowVirtualBoard(false)}
                className="btn-secondary text-xs !py-1.5 !px-4 cursor-pointer"
              >
                Close Virtual Board
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
