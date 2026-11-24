import { useEffect, useState } from "react";
import { doctorApi } from "../../lib/api";
import WebRtcConsultation from "../consultation/WebRtcConsultation";
import PrescriptionComposer from "../consultation/PrescriptionComposer";

export default function DoctorConsultationScreen({ appointment, onBack }) {
  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("video"); // "video" | "prescription"

  useEffect(() => {
    if (appointment?.id)
      doctorApi
        .joinConsultation(appointment.id)
        .then(setRoom)
        .catch((err) =>
          setError(err.message || "Unable to authorize consultation."),
        );
  }, [appointment]);

  return (
    <div className="min-h-screen bg-[#F0F5F7] p-6 text-[#162623]">
      <div className="mx-auto max-w-4xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#577877]/30 bg-white px-4 py-2 text-sm font-semibold text-[#25836F] shadow-sm hover:bg-[#F0F5F7] transition-colors cursor-pointer"
          >
            ← Back to Appointments
          </button>

          <div className="flex items-center gap-2 rounded-xl bg-white p-1 border border-[#577877]/20 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveTab("video")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === "video"
                  ? "bg-[#25836F] text-white shadow-xs"
                  : "text-[#577877] hover:text-[#162623]"
              }`}
            >
              <span className="material-symbols-outlined text-sm">videocam</span>
              Video Call
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("prescription")}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                activeTab === "prescription"
                  ? "bg-[#25836F] text-white shadow-xs"
                  : "text-[#577877] hover:text-[#162623]"
              }`}
            >
              <span className="material-symbols-outlined text-sm">
                prescriptions
              </span>
              Write Prescription
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Consultation Room</h1>
          <div className="text-sm font-semibold text-[#577877]">
            Patient: {appointment?.patient_name || "Patient"}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        )}

        {/* Video Consultation Tab */}
        <div className={activeTab === "video" ? "block" : "hidden"}>
          <div className="rounded-2xl bg-white border border-[#577877]/15 p-4 shadow-xl">
            {room ? (
              <WebRtcConsultation
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
        </div>

        {/* Prescription Composer Tab / Section */}
        <div className={activeTab === "prescription" ? "block" : "hidden"}>
          <PrescriptionComposer
            appointmentId={appointment?.id}
            patientName={appointment?.patient_name || "Patient"}
            onPublished={() => {
              // Prescription successfully published
            }}
          />
        </div>
      </div>
    </div>
  );
}
