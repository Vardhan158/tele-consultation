import React, { useState } from "react";
import { doctorApi, patientApi } from "../../lib/api";

export default function TeleconsentModal({
  isOpen,
  onClose,
  appointmentId,
  isDoctor = false,
  doctorName = "Attending Clinician",
  patientName = "Patient",
  activeRequest = null,
  onSuccess,
}) {
  // Doctor Request Form State
  const [procedureName, setProcedureName] = useState("Informed Telehealth Assessment & Minor Clinical Protocol");
  const [procedureDesc, setProcedureDesc] = useState(
    "Clinical teleconsultation assessment, remote physical evaluation guidance, and prescribed management protocol."
  );
  const [clauses, setClauses] = useState([
    "I understand the nature, benefits, risks, and alternatives of this teleconsultation encounter.",
    "I voluntarily consent to clinical examination, medical advice, and management via encrypted communications.",
    "I confirm truthful disclosure of all ongoing medications, past medical history, and drug allergies.",
  ]);
  const [newClause, setNewClause] = useState("");
  const [risksDisclosed, setRisksDisclosed] = useState([
    "Limitations of remote visual inspection compared to in-person palpation.",
    "Potential necessity for immediate escalation to local emergency care if red flags arise.",
  ]);
  const [urgency, setUrgency] = useState("routine");

  // Patient Signature State
  const [signatureName, setSignatureName] = useState(patientName || "");
  const [declarationAccepted, setDeclarationAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [signedResult, setSignedResult] = useState(null);

  if (!isOpen) return null;

  const handleAddClause = () => {
    if (newClause.trim()) {
      setClauses([...clauses, newClause.trim()]);
      setNewClause("");
    }
  };

  const handleRemoveClause = (index) => {
    setClauses(clauses.filter((_, i) => i !== index));
  };

  // Doctor: Submit Consent Request to Patient
  const handleDoctorRequest = async (e) => {
    e.preventDefault();
    if (!procedureName.trim()) {
      setErrorMsg("Please enter a valid procedure or consultation name.");
      return;
    }
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      const res = await doctorApi.requestTeleconsent(appointmentId, {
        procedure_name: procedureName.trim(),
        procedure_description: procedureDesc.trim(),
        clauses,
        risks_disclosed: risksDisclosed,
        urgency,
      });
      if (onSuccess) onSuccess(res);
      onClose();
    } catch (err) {
      setErrorMsg(err.message || "Failed to dispatch teleconsent request.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Patient: Submit Digital Signature
  const handlePatientSign = async (e) => {
    e.preventDefault();
    if (!signatureName.trim()) {
      setErrorMsg("Please enter your full legal name to sign.");
      return;
    }
    if (!declarationAccepted) {
      setErrorMsg("Please acknowledge and accept the informed consent declaration.");
      return;
    }
    if (!activeRequest?.id) {
      setErrorMsg("No active consent request found to sign.");
      return;
    }

    setIsSubmitting(true);
    setErrorMsg("");
    try {
      const res = await patientApi.signTeleconsent(appointmentId, {
        consent_request_id: activeRequest.id,
        signature_name: signatureName.trim(),
        declaration_accepted: true,
        device_info: `${navigator.userAgent} • ${navigator.platform || "Web"}`,
      });
      setSignedResult(res);
      if (onSuccess) onSuccess(res);
    } catch (err) {
      setErrorMsg(err.message || "Failed to submit digital teleconsent signature.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-lg bg-teal-950 border border-teal-700/60 text-teal-400 text-lg">
              ✍️
            </span>
            <div>
              <h3 className="text-base font-bold text-white">
                {isDoctor ? "Request In-Call Informed Teleconsent" : "Informed Telehealth Consent Form"}
              </h3>
              <p className="text-xs text-slate-400">
                {isDoctor
                  ? "Push clinical consent terms directly to the patient's screen for live digital signing."
                  : `Issued by ${activeRequest?.doctor_name || doctorName} during active teleconsultation.`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition text-sm"
          >
            ✕
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-300 text-xs">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* Signed Success Confirmation */}
          {signedResult ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-950 border border-emerald-500/50 flex items-center justify-center text-3xl text-emerald-400">
                ✓
              </div>
              <div>
                <h4 className="text-lg font-bold text-white">Teleconsent Signed & Cryptographically Sealed</h4>
                <p className="text-xs text-slate-400 mt-1">
                  Your digital signature has been recorded and bound to this clinical consultation record.
                </p>
              </div>
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-left font-mono text-[11px] text-slate-300 space-y-1">
                <div><span className="text-slate-500">Signatory:</span> {signedResult.signature_name}</div>
                <div><span className="text-slate-500">Timestamp:</span> {signedResult.signed_at}</div>
                <div className="break-all">
                  <span className="text-slate-500">SHA-256 Seal:</span>{" "}
                  <span className="text-emerald-400">{signedResult.cryptographic_seal_sha256}</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition"
              >
                Close & Return to Consultation
              </button>
            </div>
          ) : isDoctor ? (
            /* Doctor Creation Form */
            <form onSubmit={handleDoctorRequest} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Procedure / Treatment Protocol Name:
                </label>
                <input
                  type="text"
                  value={procedureName}
                  onChange={(e) => setProcedureName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-teal-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Clinical Description & Scope:
                </label>
                <textarea
                  rows={2}
                  value={procedureDesc}
                  onChange={(e) => setProcedureDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Informed Consent Clauses ({clauses.length}):
                </label>
                <div className="space-y-2 mb-2 max-h-36 overflow-y-auto pr-1">
                  {clauses.map((clause, idx) => (
                    <div
                      key={idx}
                      className="flex items-start justify-between gap-2 p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300"
                    >
                      <span className="leading-relaxed">
                        {idx + 1}. {clause}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemoveClause(idx)}
                        className="text-slate-500 hover:text-rose-400 text-xs px-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add custom informed consent clause..."
                    value={newClause}
                    onChange={(e) => setNewClause(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-teal-500"
                  />
                  <button
                    type="button"
                    onClick={handleAddClause}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium transition"
                  >
                    Add
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Urgency:</label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:border-teal-500"
                >
                  <option value="routine">Routine Teleconsultation Consent</option>
                  <option value="urgent">Urgent Clinical Escalation Consent</option>
                  <option value="emergency_exception">Special Telehealth Protocol</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-teal-600 hover:bg-teal-500 shadow-lg shadow-teal-900/30 transition disabled:opacity-50"
                >
                  {isSubmitting ? "Dispatching..." : "Push Consent to Patient Screen"}
                </button>
              </div>
            </form>
          ) : (
            /* Patient Review & Signature Form */
            <form onSubmit={handlePatientSign} className="space-y-4">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="text-xs text-teal-400 font-semibold uppercase tracking-wider">
                  Proposed Teleconsultation Protocol
                </div>
                <h4 className="text-sm font-bold text-white">
                  {activeRequest?.procedure_name || "Clinical Telehealth Protocol"}
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {activeRequest?.procedure_description ||
                    "Informed consent agreement for clinical assessment, diagnosis, and prescription management."}
                </p>
              </div>

              {/* Clauses Checklist */}
              <div>
                <label className="block text-xs font-semibold text-slate-200 mb-2">
                  Informed Consent Terms & Acknowledgment:
                </label>
                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {(activeRequest?.clauses || clauses).map((clause, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-xs text-slate-300 flex items-start gap-2.5"
                    >
                      <span className="text-teal-400 font-bold">{idx + 1}.</span>
                      <span className="leading-relaxed">{clause}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Declaration Checkbox */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-teal-950/30 border border-teal-800/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={declarationAccepted}
                  onChange={(e) => setDeclarationAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-slate-700 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-xs text-slate-200 leading-relaxed">
                  I have read and understood the clauses above. I agree that my digital signature carries the same legal
                  validity as a physical handwritten signature under the Information Technology Act.
                </span>
              </label>

              {/* Legal Full Name Signature */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Full Legal Name (Digital Signature):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Rahul Sharma"
                  value={signatureName}
                  onChange={(e) => setSignatureName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white font-serif italic text-base focus:outline-none focus:border-teal-500"
                  required
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition"
                >
                  Decline & Close
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !declarationAccepted || !signatureName.trim()}
                  className="px-6 py-2.5 rounded-xl text-xs font-semibold text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 shadow-lg shadow-teal-900/30 transition disabled:opacity-50"
                >
                  {isSubmitting ? "Sealing Signature..." : "Cryptographically Sign Teleconsent"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
