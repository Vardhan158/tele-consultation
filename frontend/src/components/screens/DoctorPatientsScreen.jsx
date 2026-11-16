import { useEffect, useState } from "react";
import { doctorApi } from "../../lib/api";
import { CLINICAL_NOTE_FIELDS, parseAmendment, parseClinicalNote } from "../../lib/clinicalNotes";

export default function DoctorPatientsScreen() {
  const [items, setItems] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    doctorApi
      .patients()
      .then(setItems)
      .catch((err) => setError(err.message));
  }, []);
  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-5">
      <h1 className="text-3xl font-bold">Patient panel</h1>
      <p className="text-sm text-[#577877]">
        Only patients linked to your appointments are shown.
      </p>
      {error && <p className="rounded-xl bg-white p-4 text-red-700">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {" "}
        <div className="space-y-3">
          {items?.length === 0 && (
            <div className="rounded-2xl bg-white p-8 text-[#577877]">
              No patients are currently assigned.
            </div>
          )}
          {items?.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() =>
                doctorApi
                  .patientDetail(item.id)
                  .then(setSelected)
                  .catch((err) => setError(err.message))
              }
              className="w-full text-left rounded-2xl bg-white border border-[#577877]/15 p-5 hover:border-[#25836F]"
            >
              <p className="font-semibold">{item.full_name}</p>
              <p className="text-sm text-[#577877]">
                {item.preferred_language || "Language not provided"}
              </p>
            </button>
          ))}
        </div>
        {selected ? (
          <div className="space-y-4">
            <div className="rounded-2xl bg-white border border-[#577877]/15 p-6">
              <h2 className="text-xl font-bold">
                {selected.patient.full_name}
              </h2>
              <p className="text-sm text-[#577877]">Consultation history</p>
            </div>
            <div className="rounded-2xl bg-white border border-[#577877]/15 p-6">
              <h3 className="font-bold mb-3">Appointments</h3>
              {selected.appointments.map((item) => (
                <div key={item.id} className="border-t py-3 text-sm">
                  <p>
                    {new Date(item.starts_at).toLocaleString()} · {item.status}
                  </p>
                  {item.reason && (
                    <p className="text-[#577877]">{item.reason}</p>
                  )}
                </div>
              ))}
            </div>
            <div className="rounded-2xl bg-white border border-[#577877]/15 p-6">
              <h3 className="font-bold mb-3">Clinical notes</h3>
              {selected.notes.length === 0 ? (
                <p className="text-sm text-[#577877]">No notes recorded.</p>
              ) : (
                selected.notes.map((note) => (
                  <div key={note.id} className="border-t py-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{note.status}</p>
                      {note.appointment_date && <p className="text-xs text-[#577877]">{new Date(note.appointment_date).toLocaleString()}</p>}
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {CLINICAL_NOTE_FIELDS.map(([key, label]) => {
                        const value = parseClinicalNote(note.content_reference)[key];
                        return value ? <div key={key}><p className="text-xs font-semibold">{label}</p><p className="whitespace-pre-wrap text-[#577877]">{value}</p></div> : null;
                      })}
                    </div>
                    {note.amendments?.length > 0 && (
                      <div className="mt-3 border-t pt-2 space-y-2">
                        <p className="text-xs font-semibold">Amendment history</p>
                        {note.amendments.map((amendment) => {
                          const parsed = parseAmendment(amendment.content_reference);
                          return <div key={amendment.id} className="text-xs text-[#577877]"><p>Version {amendment.version} · {new Date(amendment.created_at).toLocaleString()}</p>{parsed.reason && <p><strong>Reason:</strong> {parsed.reason}</p>}{Object.entries(parsed.fields).map(([label, value]) => <p key={label}><strong>{label}:</strong> {value}</p>)}</div>;
                        })}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-white p-8 text-[#577877]">
            Select an authorized patient to view their consultation details.
          </div>
        )}
      </div>
    </div>
  );
}
