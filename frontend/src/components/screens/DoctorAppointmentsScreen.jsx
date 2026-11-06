import { useEffect, useState } from "react";
import { doctorApi } from "../../lib/api";

export default function DoctorAppointmentsScreen({ onNavigate }) {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [amendments, setAmendments] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    doctorApi
      .appointments()
      .then(setItems)
      .catch((err) => setError(err.message));
  }, []);
  if (!items && !error)
    return <div className="p-8 text-[#577877]">Loading appointments…</div>;
  const visible =
    items?.filter((item) => filter === "all" || item.status === filter) || [];
  const saveDraft = async () => {
    try {
      const result = selected.note_id
        ? await doctorApi.updateNote(selected.note_id, noteText)
        : await doctorApi.saveNote(selected.id, noteText);
      setSelected({ ...selected, note_id: result.id, note_status: "draft" });
      setMessage("Draft saved.");
    } catch (err) {
      setError(err.message);
    }
  };
  const finalize = async () => {
    try {
      await doctorApi.finalizeNote(selected.id, selected.note_id);
      setSelected({ ...selected, note_status: "finalized" });
      setMessage("Note finalized.");
    } catch (err) {
      setError(err.message);
    }
  };
  const amend = async () => {
    try {
      await doctorApi.amendNote(selected.note_id, noteText);
      const history = await doctorApi.amendments(selected.note_id);
      setAmendments(history);
      setMessage("Amendment recorded.");
    } catch (err) {
      setError(err.message);
    }
  };
  const openNote = async (item) => {
    try {
      const notes = await doctorApi.notes(item.id);
      const note = notes[0];
      setSelected({ ...item, note_id: note?.id, note_status: note?.status });
      setNoteText(note?.content_reference || "");
      setAmendments(
        note?.status === "finalized" ? await doctorApi.amendments(note.id) : [],
      );
      setMessage("");
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-5">
      <h1 className="text-3xl font-bold">Doctor appointments</h1>
      <div className="flex flex-wrap gap-2">
        {["all", "confirmed", "in_progress", "completed", "cancelled"].map(
          (value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={
                filter === value
                  ? "btn-primary text-xs"
                  : "btn-secondary text-xs"
              }
            >
              {value.replace("_", " ")}
            </button>
          ),
        )}
      </div>
      {error && <p className="rounded-xl bg-white p-4 text-red-700">{error}</p>}
      {message && <p className="text-sm text-[#295255]">{message}</p>}
      {visible.length === 0 && (
        <div className="rounded-2xl bg-white p-8 text-[#577877]">
          No {filter === "all" ? "" : `${filter.replace("_", " ")} `}
          appointments.
        </div>
      )}
      <div className="space-y-3">
        {visible.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl bg-white border border-[#577877]/15 p-5 flex flex-wrap gap-4 items-center justify-between"
          >
            <div>
              <p className="font-semibold">
                {new Date(item.starts_at).toLocaleString()}
              </p>
              <p className="text-sm text-[#577877]">
                Status: {item.status} · Payment:{" "}
                {item.payment_status || "not available"}
              </p>
            </div>
            <div className="flex gap-2">
              {["confirmed", "checked_in", "in_progress"].includes(
                item.status,
              ) && (
                <button
                  className="btn-primary text-xs"
                  type="button"
                  onClick={() => onNavigate("doctor-consultation", item)}
                >
                  Open consultation
                </button>
              )}
              {["in_progress", "completed"].includes(item.status) && (
                <button
                  className="btn-secondary text-xs"
                  type="button"
                  onClick={() => openNote(item)}
                >
                  Clinical note
                </button>
              )}
              <button
                className="btn-secondary text-xs"
                type="button"
                onClick={() => onNavigate("doctor-patients")}
              >
                Patient panel
              </button>
            </div>
          </div>
        ))}
      </div>
      {selected && (
        <div className="rounded-2xl bg-white border border-[#577877]/15 p-6 space-y-4">
          <div className="flex justify-between">
            <h2 className="text-xl font-bold">Clinical note</h2>
            <button
              type="button"
              className="text-sm text-[#577877]"
              onClick={() => setSelected(null)}
            >
              Close
            </button>
          </div>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="w-full min-h-32 rounded-xl border p-3"
            placeholder="Document the consultation..."
          />
          <div className="flex flex-wrap gap-2">
            {selected.note_status !== "finalized" && (
              <button
                className="btn-primary"
                type="button"
                disabled={!noteText.trim()}
                onClick={saveDraft}
              >
                Save draft
              </button>
            )}
            {selected.note_id && selected.note_status !== "finalized" && (
              <button
                className="btn-secondary"
                type="button"
                onClick={finalize}
              >
                Finalize note
              </button>
            )}
            {selected.note_id && selected.note_status === "finalized" && (
              <button className="btn-secondary" type="button" onClick={amend}>
                Record amendment
              </button>
            )}
          </div>
          {amendments.length > 0 && (
            <div>
              <h3 className="font-semibold">Amendment history</h3>
              {amendments.map((item) => (
                <p key={item.id} className="border-t py-2 text-sm">
                  Version {item.version} ·{" "}
                  {new Date(item.created_at).toLocaleString()}
                  <br />
                  {item.content_reference}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
