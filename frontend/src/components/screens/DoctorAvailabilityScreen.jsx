import { useEffect, useState } from "react";
import { doctorApi } from "../../lib/api";

export default function DoctorAvailabilityScreen() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ starts_at: "", ends_at: "" });
  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = () => {
    setLoading(true);
    doctorApi
      .availability()
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        setErrorMsg(err.message || "Failed to load availability slots.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setMessage("");
    setErrorMsg("");

    if (!form.starts_at || !form.ends_at) {
      setErrorMsg("Please select both start and end times.");
      return;
    }
    const startDate = new Date(form.starts_at);
    const endDate = new Date(form.ends_at);
    if (endDate <= startDate) {
      setErrorMsg("Slot end time must be after slot start time.");
      return;
    }

    setSubmitting(true);
    try {
      await doctorApi.createAvailability({
        starts_at: startDate.toISOString(),
        ends_at: endDate.toISOString(),
      });
      setForm({ starts_at: "", ends_at: "" });
      setMessage("Availability slot created successfully.");
      load();
    } catch (err) {
      setErrorMsg(err.message || "Unable to save availability slot.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (slotId) => {
    setMessage("");
    setErrorMsg("");
    try {
      await doctorApi.deleteAvailability(slotId);
      setMessage("Slot removed successfully.");
      load();
    } catch (err) {
      setErrorMsg(err.message || "Failed to remove slot.");
    }
  };

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto space-y-6 font-sans text-[#162623]">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#577877]/15 pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
            Consultation Availability
          </h1>
          <p className="text-xs sm:text-sm text-[#577877] mt-1">
            Configure your open consultation hours for real-time patient appointment booking.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EEF6F3] text-[#185A4D] text-xs font-bold shrink-0 self-start sm:self-center">
          <span className="material-symbols-outlined text-base">schedule</span>
          <span>{items.length} Configured Slot{items.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      {/* Add Slot Form Card */}
      <div className="rounded-2xl bg-white p-6 border border-[#577877]/15 shadow-xs space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-[#185A4D] flex items-center gap-1.5">
          <span className="material-symbols-outlined text-base">add_circle</span>
          Add New Availability Slot
        </h2>

        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-end">
          <div className="sm:col-span-5 space-y-1">
            <label className="text-xs font-semibold text-[#577877]">
              Start Time (Date &amp; Time)
            </label>
            <input
              required
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
              className="w-full rounded-xl border border-[#577877]/25 px-3.5 py-2.5 text-xs text-[#162623] bg-[#F9FBFA] focus:bg-white focus:border-[#185A4D] focus:ring-2 focus:ring-[#185A4D]/15 focus:outline-none transition"
            />
          </div>

          <div className="sm:col-span-5 space-y-1">
            <label className="text-xs font-semibold text-[#577877]">
              End Time (Date &amp; Time)
            </label>
            <input
              required
              type="datetime-local"
              value={form.ends_at}
              onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              className="w-full rounded-xl border border-[#577877]/25 px-3.5 py-2.5 text-xs text-[#162623] bg-[#F9FBFA] focus:bg-white focus:border-[#185A4D] focus:ring-2 focus:ring-[#185A4D]/15 focus:outline-none transition"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              disabled={submitting}
              type="submit"
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#185A4D] hover:bg-[#124B3E] text-white text-xs font-bold shadow-xs hover:shadow-md transition cursor-pointer disabled:opacity-60"
            >
              <span className="material-symbols-outlined text-base">add</span>
              <span>{submitting ? "Saving…" : "Add Slot"}</span>
            </button>
          </div>
        </form>

        {/* Status Feedback Banners */}
        {message && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-emerald-600">check_circle</span>
            <span>{message}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-rose-600">error</span>
            <span>{errorMsg}</span>
          </div>
        )}
      </div>

      {/* Configured Slots List */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-[#162623] flex items-center gap-2">
          <span>Configured Slots</span>
          <span className="text-xs text-[#577877] font-normal">({items.length} total)</span>
        </h3>

        {loading ? (
          <div className="rounded-2xl bg-white p-10 text-center text-[#577877] text-xs font-medium space-y-2 border border-[#577877]/15">
            <span className="material-symbols-outlined animate-spin text-2xl text-[#185A4D]">sync</span>
            <p>Loading schedule availability…</p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-[#577877] text-xs font-medium space-y-2 border border-[#577877]/15">
            <span className="material-symbols-outlined text-3xl text-[#185A4D]">event_busy</span>
            <p className="font-bold text-[#162623]">No Availability Slots Configured</p>
            <p className="text-[#577877]">Add your available consultation hours above so patients can book appointments with you.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {items.map((item) => {
              const startObj = new Date(item.starts_at);
              const endObj = new Date(item.ends_at);
              const normalizedStatus = String(item.status || "available").toLowerCase();
              const isAvailable = normalizedStatus === "available";
              const isExpired = normalizedStatus === "expired";

              return (
                <div
                  key={item.id}
                  className="rounded-xl bg-white p-4 border border-[#577877]/15 shadow-2xs hover:shadow-xs transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isAvailable ? "bg-[#EEF6F3] text-[#185A4D]" : isExpired ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-800"}`}>
                      <span className="material-symbols-outlined text-xl">
                        {isAvailable ? "event_available" : isExpired ? "event_busy" : "event_seat"}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#162623]">
                        {isNaN(startObj.getTime()) ? String(item.starts_at) : startObj.toLocaleDateString([], { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
                      </p>
                      <p className="text-xs text-[#577877] mt-0.5">
                        {isNaN(startObj.getTime()) ? "" : startObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} – {isNaN(endObj.getTime()) ? "" : endObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        {item.timezone && <span className="ml-2 text-[10px] text-[#577877]/80">({item.timezone})</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-[#577877]/10">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${isAvailable ? "bg-emerald-50 text-emerald-800 border border-emerald-200/60" : isExpired ? "bg-rose-50 text-rose-800 border border-rose-200/60" : "bg-amber-50 text-amber-800 border border-amber-200/60"}`}>
                      {normalizedStatus.toUpperCase()}
                    </span>

                    {isAvailable && (
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        className="p-1.5 rounded-lg text-[#577877] hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                        title="Delete slot"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
