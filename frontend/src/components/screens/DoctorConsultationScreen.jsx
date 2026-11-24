import { useEffect, useState } from "react";
import { doctorApi } from "../../lib/api";
import WebRtcConsultation from "../consultation/WebRtcConsultation";
import PrescriptionComposer from "../consultation/PrescriptionComposer";

export default function DoctorConsultationScreen({ appointment, onBack }) {
  const [room, setRoom] = useState(null);
  const [error, setError] = useState("");

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
    <div className="min-h-screen bg-[#F0F5F7] p-6 lg:p-10 text-[#162623]">
      <div className="mx-auto max-w-7xl space-y-6">
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

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Consultation Room</h1>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        )}

        {/* Two-Column Split Layout: Left Video, Right Prescription Composer */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Side: Video Call & Streaming */}
          <div className="lg:col-span-6 rounded-2xl bg-white border border-[#577877]/15 p-4 shadow-xl">
            <h3 className="text-sm font-bold text-[#162623] mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#25836F]">videocam</span>
              Video Streaming
            </h3>
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

          {/* Right Side: Write Prescription & Send */}
          <div className="lg:col-span-6 rounded-2xl bg-white border border-[#577877]/15 p-6 shadow-xl">
            <h3 className="text-sm font-bold text-[#162623] mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-[#25836F]">prescriptions</span>
              Write Prescription &amp; Send
            </h3>
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
    </div>
  );
}
