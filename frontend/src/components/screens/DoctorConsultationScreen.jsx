import { useEffect, useState } from "react";
import { doctorApi } from "../../lib/api";
import WebRtcConsultation from "../consultation/WebRtcConsultation";

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
    <div className="min-h-screen bg-[#F0F5F7] p-6 text-[#162623]">
      <div className="mx-auto max-w-4xl space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-xl border border-[#577877]/30 bg-white px-4 py-2 text-sm font-semibold text-[#25836F] shadow-sm hover:bg-[#F0F5F7] transition-colors"
        >
          ← Back to Appointments
        </button>
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
        <div className="rounded-2xl bg-white border border-[#577877]/15 p-4 shadow-xl">
          {room ? (
            <WebRtcConsultation
              appointmentId={appointment.id}
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
    </div>
  );
}
