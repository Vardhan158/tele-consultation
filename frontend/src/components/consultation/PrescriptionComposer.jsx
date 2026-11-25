import { useState } from "react";
import { doctorApi, patientApi } from "../../lib/api";

const PROHIBITED_SCHEDULE_X = [
  "amphetamine",
  "amobarbital",
  "cyclobarbital",
  "dexamphetamine",
  "ketamine",
  "meprobamate",
  "methamphetamine",
  "methaqualone",
  "methylphenidate",
  "pentobarbital",
  "phencyclidine",
  "secobarbital",
  "quinalbarbitone",
  "morphine",
  "fentanyl",
  "buprenorphine",
  "oxycodone",
  "ritalin",
  "concerta",
  "adderall",
  "ketalar",
  "mandrax",
];

const FREQUENCY_OPTIONS = [
  "1-0-1 (Twice daily, after food)",
  "1-1-1 (Thrice daily, after food)",
  "1-0-0 (Morning only, after breakfast)",
  "0-0-1 (Night only, at bedtime)",
  "1-0-0 (Empty stomach, 30 min before food)",
  "SOS / As needed for symptoms",
  "Every 8 hours",
  "Once weekly",
];

const DURATION_OPTIONS = [
  "3 days",
  "5 days",
  "7 days",
  "10 days",
  "14 days",
  "30 days (1 month)",
  "60 days",
  "90 days",
];

const initialMedicine = () => ({
  name: "",
  dosage: "1 tablet",
  frequency: "1-0-1 (Twice daily, after food)",
  duration: "5 days",
  instructions: "Take after meals with water",
});

export default function PrescriptionComposer({
  appointmentId,
  patientName = "Patient",
  onPublished,
}) {
  const [medicines, setMedicines] = useState([initialMedicine()]);
  const [diagnosis, setDiagnosis] = useState("");
  const [generalInstructions, setGeneralInstructions] = useState(
    "Maintain adequate hydration and rest. Review if symptoms worsen.",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [publishedPrescription, setPublishedPrescription] = useState(null);
  const [downloading, setDownloading] = useState(false);

  // Check if any medication contains a Schedule X prohibited substance
  const findProhibitedSubstance = () => {
    for (const med of medicines) {
      const text = `${med.name} ${med.instructions}`.toLowerCase();
      for (const prohibited of PROHIBITED_SCHEDULE_X) {
        const regex = new RegExp(`\\b${prohibited}\\b`, "i");
        if (regex.test(text)) {
          return prohibited;
        }
      }
    }
    return null;
  };

  const prohibitedSubstance = findProhibitedSubstance();

  const handleMedicineChange = (index, field, value) => {
    setMedicines((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setError("");
  };

  const addMedicine = () => {
    setMedicines((prev) => [...prev, initialMedicine()]);
  };

  const removeMedicine = (index) => {
    if (medicines.length <= 1) return;
    setMedicines((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Validate medicines
    const validMedicines = medicines.filter((m) => m.name.trim().length > 0);
    if (validMedicines.length === 0) {
      setError("Please add at least one medication name.");
      return;
    }

    if (prohibitedSubstance) {
      setError(
        `Statutory Safety Alert: '${prohibitedSubstance}' is a Schedule X / NDPS prohibited substance and cannot be prescribed via teleconsultation under Indian Telemedicine Practice Guidelines (2020).`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const payloadContent = {
        medicines: validMedicines,
        diagnosis: diagnosis.trim() || "Clinical Teleconsultation Follow-up",
        instructions: generalInstructions.trim(),
        prescribed_at: new Date().toISOString(),
      };

      const result = await doctorApi.publishPrescription({
        appointment_id: String(appointmentId),
        content: JSON.stringify(payloadContent),
      });

      setPublishedPrescription(result);
      if (onPublished) onPublished(result, payloadContent);
    } catch (err) {
      setError(
        err.message ||
          "Unable to publish prescription. Ensure consultation is active.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownload = async () => {
    if (!publishedPrescription?.id) return;
    setDownloading(true);
    try {
      const blob = await patientApi.downloadPrescription(
        publishedPrescription.id,
      );
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Prescription-${publishedPrescription.id}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError("Unable to download prescription PDF. Please retry.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#577877]/20 bg-white p-6 shadow-md space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#577877]/15 pb-4">
        <div>
          <h2 className="text-lg font-bold text-[#162623] flex items-center gap-2">
            <span className="material-symbols-outlined text-[#25836F]">
              prescriptions
            </span>
            e-Prescription & Medication Orders
          </h2>
          <p className="text-xs text-[#577877]">
            Patient: <span className="font-semibold">{patientName}</span> ·
            Compliant with Indian Telemedicine Practice Guidelines (2020)
          </p>
        </div>
        {publishedPrescription && (
          <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 border border-emerald-300">
            ✓ Released & Digitally Signed
          </span>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-medium text-rose-800 flex items-start gap-2">
          <span className="material-symbols-outlined text-rose-600 text-base">
            warning
          </span>
          <div>{error}</div>
        </div>
      )}

      {prohibitedSubstance && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-xs font-semibold text-red-900 flex items-start gap-2">
          <span className="material-symbols-outlined text-red-600 text-lg">
            block
          </span>
          <div>
            <p className="font-bold">Schedule X Drug Intercept Notice</p>
            <p className="mt-1">
              Prescription of <strong>'{prohibitedSubstance}'</strong> is
              strictly prohibited in teleconsultations under MoHFW Indian
              Telemedicine Practice Guidelines (2020) Reg 3.7.1. You must remove
              this medication before submitting.
            </p>
          </div>
        </div>
      )}

      {publishedPrescription ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-6 text-center space-y-4">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-[#25836F]">
            <span className="material-symbols-outlined text-2xl">check</span>
          </div>
          <h3 className="text-base font-bold text-[#162623]">
            Prescription Released Successfully
          </h3>
          <p className="text-xs text-[#577877] max-w-md mx-auto">
            The electronic prescription has been saved and made available in the
            patient portal. A statutory binary PDF with your credentials has
            been minted.
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-xl bg-[#25836F] px-4 py-2 text-xs font-bold text-white shadow hover:bg-[#1d6e5d] transition cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              {downloading ? "Downloading PDF…" : "Download Statutory PDF"}
            </button>
            <button
              type="button"
              onClick={() => {
                setPublishedPrescription(null);
                setMedicines([initialMedicine()]);
              }}
              className="rounded-xl border border-[#577877]/30 bg-white px-4 py-2 text-xs font-semibold text-[#162623] hover:bg-slate-50 transition cursor-pointer"
            >
              Issue Another Prescription
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Diagnosis & Findings */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#162623]">
              Clinical Diagnosis / Assessment
            </label>
            <input
              type="text"
              value={diagnosis}
              onChange={(e) => setDiagnosis(e.target.value)}
              placeholder="e.g. Essential Hypertension, Acute Upper Respiratory Infection"
              className="w-full rounded-xl border border-[#577877]/30 px-3.5 py-2 text-xs text-[#162623] focus:border-[#25836F] focus:outline-none"
            />
          </div>

          {/* Medicines List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#162623] flex items-center gap-1.5">
                <span>Prescribed Medications</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-[#577877]">
                  {medicines.length} {medicines.length === 1 ? "drug" : "drugs"}
                </span>
              </label>
              <button
                type="button"
                onClick={addMedicine}
                className="inline-flex items-center gap-1 rounded-lg border border-[#25836F] bg-emerald-50/50 px-2.5 py-1 text-xs font-bold text-[#25836F] hover:bg-emerald-100 transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                Add Drug
              </button>
            </div>

            <div className="space-y-3">
              {medicines.map((med, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-[#577877]/20 bg-slate-50/60 p-4 space-y-3 relative group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-[#577877] uppercase tracking-wide">
                      Medication #{index + 1}
                    </span>
                    {medicines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeMedicine(index)}
                        className="text-slate-400 hover:text-rose-600 transition cursor-pointer text-xs font-semibold"
                        title="Remove Drug"
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div className="md:col-span-2 space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Medication Name & Strength *
                      </label>
                      <input
                        type="text"
                        required
                        value={med.name}
                        onChange={(e) =>
                          handleMedicineChange(index, "name", e.target.value)
                        }
                        placeholder="e.g. Tab Metformin 500mg, Cap Amoxicillin 500mg"
                        className="w-full rounded-lg border border-[#577877]/30 bg-white px-3 py-1.5 text-xs text-[#162623] focus:border-[#25836F] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Dosage / Form
                      </label>
                      <input
                        type="text"
                        value={med.dosage}
                        onChange={(e) =>
                          handleMedicineChange(index, "dosage", e.target.value)
                        }
                        placeholder="e.g. 1 Tablet, 5 ml"
                        className="w-full rounded-lg border border-[#577877]/30 bg-white px-3 py-1.5 text-xs text-[#162623] focus:border-[#25836F] focus:outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Duration
                      </label>
                      <select
                        value={med.duration}
                        onChange={(e) =>
                          handleMedicineChange(index, "duration", e.target.value)
                        }
                        className="w-full rounded-lg border border-[#577877]/30 bg-white px-2.5 py-1.5 text-xs text-[#162623] focus:border-[#25836F] focus:outline-none"
                      >
                        {DURATION_OPTIONS.map((dur) => (
                          <option key={dur} value={dur}>
                            {dur}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Frequency
                      </label>
                      <select
                        value={med.frequency}
                        onChange={(e) =>
                          handleMedicineChange(index, "frequency", e.target.value)
                        }
                        className="w-full rounded-lg border border-[#577877]/30 bg-white px-2.5 py-1.5 text-xs text-[#162623] focus:border-[#25836F] focus:outline-none"
                      >
                        {FREQUENCY_OPTIONS.map((freq) => (
                          <option key={freq} value={freq}>
                            {freq}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[11px] font-semibold text-slate-700">
                        Timing & Instructions
                      </label>
                      <input
                        type="text"
                        value={med.instructions}
                        onChange={(e) =>
                          handleMedicineChange(
                            index,
                            "instructions",
                            e.target.value,
                          )
                        }
                        placeholder="e.g. Take after meals with warm water"
                        className="w-full rounded-lg border border-[#577877]/30 bg-white px-3 py-1.5 text-xs text-[#162623] focus:border-[#25836F] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* General Advice & Care Instructions */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-[#162623]">
              Dietary Advice & General Instructions
            </label>
            <textarea
              rows={2}
              value={generalInstructions}
              onChange={(e) => setGeneralInstructions(e.target.value)}
              placeholder="e.g. Drink plenty of water, avoid oily foods, review in 5 days."
              className="w-full rounded-xl border border-[#577877]/30 px-3 py-2 text-xs text-[#162623] focus:border-[#25836F] focus:outline-none"
            />
          </div>

          {/* Sign & Submit */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#577877]/15 pt-4">
            <div className="text-[11px] text-[#577877]">
              Digitally issued under registered medical council registration.
            </div>
            <button
              type="submit"
              disabled={submitting || Boolean(prohibitedSubstance)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#25836F] px-5 py-2.5 text-xs font-bold text-white shadow hover:bg-[#1d6e5d] transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-sm">
                stylus_note
              </span>
              {submitting
                ? "Signing & Publishing…"
                : "Sign & Publish Prescription"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
