import { useEffect, useState } from "react";
import { doctorApi } from "../../lib/api";

export default function DoctorAvailabilityScreen() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ starts_at: "", ends_at: "" });
  const [mode, setMode] = useState("single"); // "single" | "recurring"
  const [recurringForm, setRecurringForm] = useState({
    days_of_week: [0, 1, 2, 3, 4], // Mon to Fri
    start_time: "09:00",
    end_time: "13:00",
    slot_duration_minutes: 30,
    weeks_ahead: 4,
  });
  const [message, setMessage] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");

  const toggleDay = (dayIdx) => {
    setRecurringForm((prev) => {
      const exists = prev.days_of_week.includes(dayIdx);
      const nextDays = exists
        ? prev.days_of_week.filter((d) => d !== dayIdx)
        : [...prev.days_of_week, dayIdx].sort();
      return { ...prev, days_of_week: nextDays };
    });
  };

  const submitRecurring = async (e) => {
    e.preventDefault();
    setMessage("");
    setErrorMsg("");
    if (recurringForm.days_of_week.length === 0) {
      setErrorMsg("Please select at least one day of the week.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await doctorApi.createRecurringAvailability(recurringForm);
      setMessage(res.message || "Recurring availability slots generated successfully.");
      load();
    } catch (err) {
      setErrorMsg(err.message || "Failed to generate recurring slots.");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredItems = items.filter((item) => {
    if (filterStatus === "all") return true;
    const norm = String(item.status || "available").toLowerCase();
    if (filterStatus === "available") return norm === "available";
    if (filterStatus === "booked") return norm === "booked" || norm === "reserved" || item.booked === true;
    if (filterStatus === "expired") return norm === "expired";
    return true;
  });

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
      <div className="rounded-2xl bg-white p-6 border border-[#577877]/15 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#577877]/15 pb-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-[#185A4D] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">calendar_add_on</span>
            <span>Configure Availability Hours</span>
          </h2>

          <div className="flex items-center gap-1.5 bg-[#F0F5F7] p-1 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => {
                setMode("single");
                setMessage("");
                setErrorMsg("");
              }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                mode === "single"
                  ? "bg-[#185A4D] text-white shadow-xs font-bold"
                  : "text-[#577877] hover:text-[#162623]"
              }`}
            >
              Single Slot
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("recurring");
                setMessage("");
                setErrorMsg("");
              }}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer flex items-center gap-1 ${
                mode === "recurring"
                  ? "bg-[#185A4D] text-white shadow-xs font-bold"
                  : "text-[#577877] hover:text-[#162623]"
              }`}
            >
              <span className="material-symbols-outlined text-sm">repeat</span>
              <span>Recurring Shift Template</span>
            </button>
          </div>
        </div>

        {mode === "single" ? (
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
        ) : (
          <form onSubmit={submitRecurring} className="space-y-4 text-xs">
            {/* Days of Week Selector */}
            <div className="space-y-2">
              <label className="font-bold text-[#162623] block">
                Recurring Days of the Week
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { idx: 0, label: "Monday", short: "Mon" },
                  { idx: 1, label: "Tuesday", short: "Tue" },
                  { idx: 2, label: "Wednesday", short: "Wed" },
                  { idx: 3, label: "Thursday", short: "Thu" },
                  { idx: 4, label: "Friday", short: "Fri" },
                  { idx: 5, label: "Saturday", short: "Sat" },
                  { idx: 6, label: "Sunday", short: "Sun" },
                ].map((d) => {
                  const selected = recurringForm.days_of_week.includes(d.idx);
                  return (
                    <button
                      key={d.idx}
                      type="button"
                      onClick={() => toggleDay(d.idx)}
                      className={`px-3 py-1.5 rounded-xl font-semibold border transition cursor-pointer flex items-center gap-1 ${
                        selected
                          ? "bg-[#185A4D] text-white border-[#185A4D] shadow-xs"
                          : "bg-white text-[#577877] border-[#577877]/25 hover:border-[#185A4D]"
                      }`}
                    >
                      {selected && <span className="material-symbols-outlined text-xs">check</span>}
                      <span>{d.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="font-bold text-[#162623] block">Shift Start Time</label>
                <input
                  type="time"
                  required
                  value={recurringForm.start_time}
                  onChange={(e) => setRecurringForm({ ...recurringForm, start_time: e.target.value })}
                  className="w-full rounded-xl border border-[#577877]/25 px-3 py-2 bg-white text-xs text-[#162623] focus:border-[#185A4D] focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#162623] block">Shift End Time</label>
                <input
                  type="time"
                  required
                  value={recurringForm.end_time}
                  onChange={(e) => setRecurringForm({ ...recurringForm, end_time: e.target.value })}
                  className="w-full rounded-xl border border-[#577877]/25 px-3 py-2 bg-white text-xs text-[#162623] focus:border-[#185A4D] focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#162623] block">Slot Duration</label>
                <select
                  value={recurringForm.slot_duration_minutes}
                  onChange={(e) => setRecurringForm({ ...recurringForm, slot_duration_minutes: Number(e.target.value) })}
                  className="w-full rounded-xl border border-[#577877]/25 px-3 py-2 bg-white text-xs text-[#162623] focus:border-[#185A4D] focus:outline-none"
                >
                  <option value={15}>15 Minutes</option>
                  <option value={30}>30 Minutes</option>
                  <option value={45}>45 Minutes</option>
                  <option value={60}>60 Minutes</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="font-bold text-[#162623] block">Repeat Horizon</label>
                <select
                  value={recurringForm.weeks_ahead}
                  onChange={(e) => setRecurringForm({ ...recurringForm, weeks_ahead: Number(e.target.value) })}
                  className="w-full rounded-xl border border-[#577877]/25 px-3 py-2 bg-white text-xs text-[#162623] focus:border-[#185A4D] focus:outline-none"
                >
                  <option value={1}>Next 1 Week</option>
                  <option value={2}>Next 2 Weeks</option>
                  <option value={4}>Next 4 Weeks (1 Month)</option>
                  <option value={8}>Next 8 Weeks (2 Months)</option>
                </select>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                disabled={submitting}
                type="submit"
                className="btn-primary !px-5 !py-2.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-base">auto_mode</span>
                <span>{submitting ? "Generating Shifts…" : "Generate Recurring Consultation Shifts"}</span>
              </button>
            </div>
          </form>
        )}

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
      <div className="space-y-4 pb-20 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#577877]/10 pb-3">
          <h3 className="text-sm font-bold text-[#162623] flex items-center gap-2">
            <span>Configured Slots</span>
            <span className="text-xs text-[#577877] font-normal">({filteredItems.length} displayed / {items.length} total)</span>
          </h3>

          {/* Status Filter Chips */}
          <div className="flex items-center gap-1.5 text-xs font-semibold flex-wrap">
            {["all", "available", "booked", "expired"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1 rounded-full capitalize transition cursor-pointer ${
                  filterStatus === st
                    ? "bg-[#185A4D] text-white font-bold shadow-xs"
                    : "bg-[#EEF6F3] text-[#185A4D] hover:bg-[#185A4D]/10"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl bg-white p-10 text-center text-[#577877] text-xs font-medium space-y-2 border border-[#577877]/15">
            <span className="material-symbols-outlined animate-spin text-2xl text-[#185A4D]">sync</span>
            <p>Loading schedule availability…</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl bg-white p-8 text-center text-[#577877] text-xs font-medium space-y-2 border border-[#577877]/15">
            <span className="material-symbols-outlined text-3xl text-[#185A4D]">event_busy</span>
            <p className="font-bold text-[#162623]">No Availability Slots Match Filter</p>
            <p className="text-[#577877]">
              {filterStatus === "all"
                ? "Add your available consultation hours above so patients can book appointments with you."
                : `No slots found with status '${filterStatus}'. Try selecting another filter.`}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {filteredItems.map((item) => {
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
