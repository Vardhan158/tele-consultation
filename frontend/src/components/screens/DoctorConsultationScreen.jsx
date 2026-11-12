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
      <div className="mx-auto max-w-6xl space-y-4">
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-[#25836F]"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold">Doctor consultation</h1>
        {error && (
          <div className="rounded-xl border border-red-200 bg-white p-4 text-sm text-red-700">
            {error}
          </div>
        )}
        {room && (
          <WebRtcConsultation
            appointmentId={appointment.id}
            authorization={room}
            role="doctor"
            onEnded={onBack}
          />
        )}
        {!room && !error && (
          <p className="text-sm text-[#577877]">Authorizing consultation…</p>
        )}
      </div>
    </div>
  );
}
