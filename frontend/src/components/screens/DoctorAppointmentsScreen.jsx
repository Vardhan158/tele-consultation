import { useEffect, useState } from "react";
import { doctorApi } from "../../lib/api";

function formatPaymentLabel(raw) {
  const p = (raw || "").toLowerCase();
  if (p === "captured" || p === "success" || p === "paid") return "Paid";
  if (p === "not_required" || p === "no_payment_required") return "No Payment Required";
  if (p === "failed") return "Payment Failed";
  if (p === "refunded") return "Refunded";
  return "Payment Pending";
}

function formatAptDate(startsAt) {
  if (!startsAt) return "Time not set";
  const dt = new Date(startsAt);
  return dt.toLocaleDateString("en-US", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }) + ", " + dt.toLocaleTimeString("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "numeric",
    minute: "2-digit",
  }) + " IST";
}

export default function DoctorAppointmentsScreen({ onNavigate }) {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [noteText, setNoteText] = useState("");
  const [amendments, setAmendments] = useState([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const fetchAppointments = () => {
    doctorApi
      .appointments()
      .then((res) => setItems(Array.isArray(res) ? res : []))
      .catch((err) => setError(err.message || "Failed to load appointments."));
  };

  useEffect(() => {
    fetchAppointments();
  }, []);

  if (!items && !error) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-8 text-[#577877] font-sans">
        Loading appointments…
      </div>
    );
  }

  const visible =
    items?.filter((item) => filter === "all" || item.status === filter) || [];

  const saveDraft = async () => {
    try {
      const result = selected.note_id
        ? await doctorApi.updateNote(selected.note_id, noteText)
        : await doctorApi.saveNote(selected.id, noteText);
      setSelected({ ...selected, note_id: result.id, note_status: "draft" });
      setMessage("Draft saved successfully.");
    } catch (err) {
      setError(err.message || "Failed to save draft.");
    }
  };

  const finalize = async () => {
    try {
      await doctorApi.finalizeNote(selected.id, selected.note_id);
      setSelected({ ...selected, note_status: "finalized" });
      setMessage("Note finalized.");
    } catch (err) {
      setError(err.message || "Failed to finalize note.");
    }
  };

  const amend = async () => {
    try {
      await doctorApi.amendNote(selected.note_id, noteText);
      const history = await doctorApi.amendments(selected.note_id);
      setAmendments(history);
      setMessage("Amendment recorded.");
    } catch (err) {
      setError(err.message || "Failed to record amendment.");
    }
  };

  const openNote = async (item) => {
    try {
      const notes = await doctorApi.notes(item.id);
      const note = Array.isArray(notes) ? notes[0] : null;
      setSelected({ ...item, note_id: note?.id, note_status: note?.status });
      setNoteText(note?.content_reference || "");
      setAmendments(
        note?.status === "finalized" ? await doctorApi.amendments(note.id) : [],
      );
      setMessage("");
    } catch (err) {
      setError(err.message || "Unable to load clinical notes.");
    }
  };

  const nowMs = new Date().getTime();

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-6 font-sans text-[#162623]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#577877]/15 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
            Clinician Schedule
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
            Doctor Appointments
          </h1>
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-semibold">
          {["all", "confirmed", "in_progress", "completed", "cancelled"].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`px-3 py-1.5 rounded-xl transition cursor-pointer ${
                filter === value
                  ? "bg-[#295255] text-white font-bold shadow-xs"
                  : "bg-white border border-[#577877]/25 text-[#577877] hover:text-[#162623]"
              }`}
            >
              {value.replace("_", " ").toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-medium">
          ⚠️ {error}
        </div>
      )}

      {message && (
        <div className="p-4 rounded-xl border border-teal-200 bg-teal-50 text-[#295255] text-xs font-medium">
          ✅ {message}
        </div>
      )}

      {visible.length === 0 ? (
        <div className="care-card p-12 text-center text-[#577877]">
          No {filter === "all" ? "" : `${filter.replace("_", " ")} `} appointments found.
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((item, idx) => {
            const displayRef = item.id ? `KC-APT-${item.id.slice(-6).toUpperCase()}` : "KC-APT-1001";
            const patientName = item.patient_name || "Emma Mitchell";
            const visitType = item.type || "Follow-up Consultation";
            const payLabel = formatPaymentLabel(item.payment_status);

            const startTime = item.starts_at ? new Date(item.starts_at).getTime() : 0;
            const endTime = item.ends_at
              ? new Date(item.ends_at).getTime()
              : startTime ? startTime + 60 * 60000 : 0;
            const isWindowExpired = endTime > 0 && endTime < nowMs;

            return (
              <div
                key={`${item.id}-${idx}`}
                className="care-card p-5 rounded-2xl bg-white border border-[#577877]/15 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs hover:border-[#295255]/40 transition"
              >
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[#577877] text-[11px]">{displayRef}</span>
                    <h3 className="font-bold text-sm text-[#162623]">{patientName}</h3>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold uppercase text-[10px]">
                      {item.status}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 font-bold uppercase text-[10px]">
                      {payLabel}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-[#295255]">{visitType}</p>
                  <p className="text-[#577877]">🗓️ {formatAptDate(item.starts_at)}</p>

                  {isWindowExpired && (
                    <p className="text-amber-800 text-[11px] font-semibold">
                      ⚠️ Permitted joining window has expired for this past appointment.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {["confirmed", "checked_in", "in_progress"].includes(item.status) && (
                    <button
                      type="button"
                      disabled={isWindowExpired}
                      onClick={() => onNavigate("doctor-consultation", item)}
                      className={`px-4 py-2 rounded-xl text-xs font-bold shadow transition cursor-pointer ${
                        !isWindowExpired
                          ? "bg-[#295255] hover:bg-[#1f3f41] text-white"
                          : "bg-gray-200 text-gray-500 cursor-not-allowed border border-gray-300"
                      }`}
                      title={isWindowExpired ? "Permitted joining window has expired" : "Enter video consultation"}
                    >
                      {isWindowExpired ? "Joining Window Expired" : "Open Consultation"}
                    </button>
                  )}

                  {["in_progress", "completed"].includes(item.status) && (
                    <button
                      type="button"
                      onClick={() => openNote(item)}
                      className="border border-[#577877]/30 bg-white px-3.5 py-2 rounded-xl font-semibold text-[#295255] hover:bg-[#F0F5F7] cursor-pointer text-xs"
                    >
                      Clinical Note
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onNavigate("doctor-patients")}
                    className="border border-[#577877]/30 bg-white px-3.5 py-2 rounded-xl font-semibold text-[#577877] hover:bg-[#F0F5F7] cursor-pointer text-xs"
                  >
                    Patient Record
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-4 shadow-lg">
          <div className="flex items-center justify-between border-b border-[#577877]/15 pb-3">
            <h2 className="text-base font-bold text-[#162623]">
              Clinical Note — {selected.patient_name || "Patient"}
            </h2>
            <button
              type="button"
              className="text-xs font-semibold text-[#577877] hover:underline cursor-pointer"
              onClick={() => setSelected(null)}
            >
              Close ✕
            </button>
          </div>

          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            className="w-full min-h-32 rounded-xl border border-[#577877]/25 p-3 text-xs text-[#162623] focus:border-[#295255] focus:outline-none"
            placeholder="Document consultation findings, diagnosis, and prescription details..."
          />

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {selected.note_status !== "finalized" && (
              <button
                type="button"
                disabled={!noteText.trim()}
                onClick={saveDraft}
                className="rounded-xl bg-[#295255] px-4 py-2 text-xs font-bold text-white shadow hover:bg-[#1f3f41] disabled:opacity-50 cursor-pointer"
              >
                Save Draft
              </button>
            )}

            {selected.note_id && selected.note_status !== "finalized" && (
              <button
                type="button"
                onClick={finalize}
                className="rounded-xl border border-[#577877]/30 bg-white px-4 py-2 text-xs font-semibold text-[#295255] hover:bg-[#F0F5F7] cursor-pointer"
              >
                Finalize Note
              </button>
            )}

            {selected.note_id && selected.note_status === "finalized" && (
              <button
                type="button"
                onClick={amend}
                className="rounded-xl border border-[#577877]/30 bg-white px-4 py-2 text-xs font-semibold text-[#295255] hover:bg-[#F0F5F7] cursor-pointer"
              >
                Record Amendment
              </button>
            )}
          </div>

          {amendments.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-[#577877]/15">
              <h3 className="font-bold text-xs text-[#162623]">Amendment History</h3>
              {amendments.map((item) => (
                <div key={item.id} className="border-t border-[#577877]/10 py-2 text-xs space-y-0.5">
                  <div className="font-semibold text-[#295255]">
                    Version {item.version} · {new Date(item.created_at).toLocaleString()}
                  </div>
                  <p className="text-[#577877]">{item.content_reference}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
