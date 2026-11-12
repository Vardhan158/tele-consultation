import { useEffect, useState } from "react";
import { adminApi } from "../../../lib/api";
import { useToast } from "../../common/Toast";

const dateKeyInTimezone = (value, timeZone) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const fields = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${fields.year}-${fields.month}-${fields.day}`;
};

const formatTimeInTimezone = (value, timeZone) =>
  new Intl.DateTimeFormat(undefined, { timeZone, hour: "2-digit", minute: "2-digit" }).format(new Date(value));

const formatDateTimeInTimezone = (value, timeZone) =>
  new Intl.DateTimeFormat(undefined, {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export default function ScheduleManagementTab() {
  const { showToast } = useToast();
  const [data, setData] = useState({ slots: [], blocked_dates: [], doctors: [] });
  const [clinicTimezone, setClinicTimezone] = useState("Asia/Kolkata");
  const [loading, setLoading] = useState(true);
  const [selectedDoctorId, setSelectedDoctorId] = useState("all");
  const [calendarView, setCalendarView] = useState("weekly"); // 'weekly' | 'monthly' | 'list'

  // Modals & Forms
  const [blockModal, setBlockModal] = useState(false);
  const [blockForm, setBlockForm] = useState({ date: "", reason: "Clinic Holiday / Emergency Maintenance" });
  const [blocking, setBlocking] = useState(false);
  const [unblockTarget, setUnblockTarget] = useState(null);
  const [unblocking, setUnblocking] = useState(false);

  const [shiftModal, setShiftModal] = useState(false);
  const [shiftForm, setShiftForm] = useState({
    doctor_id: "",
    date: new Date().toISOString().split("T")[0],
    start_time: "09:00",
    end_time: "17:00",
    slot_duration_minutes: 30,
    break_start_time: "13:00",
    break_duration_minutes: 60,
    recurrence: "none",
  });
  const [scheduling, setScheduling] = useState(false);

  const loadSchedules = () => {
    setLoading(true);
    adminApi
      .schedules(selectedDoctorId === "all" ? null : selectedDoctorId)
      .then((res) => {
        if (res) {
          setData(res);
          setClinicTimezone(res.timezone || "Asia/Kolkata");
        }
      })
      .catch((err) => {
        showToast(err.message || "Failed to load schedules.", "error");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSchedules();
  }, [selectedDoctorId]);

  const handleBlockDate = async (e) => {
    e.preventDefault();
    if (!blockForm.date || blocking) return;
    setBlocking(true);
    try {
      await adminApi.blockDate(blockForm);
      showToast(`Clinic date ${blockForm.date} blocked successfully.`, "warning");
      setBlockModal(false);
      setBlockForm({ date: "", reason: "Clinic Holiday / Emergency Maintenance" });
      loadSchedules();
    } catch (err) {
      showToast(err.message || "Failed to block date.", "error");
    } finally {
      setBlocking(false);
    }
  };

  const handleAddShift = async (e) => {
    e.preventDefault();
    if (!shiftForm.doctor_id) {
      showToast("Please select a clinician for this shift.", "warning");
      return;
    }
    setScheduling(true);
    try {
      const res = await adminApi.addShift({
        ...shiftForm,
        slot_duration_minutes: Number(shiftForm.slot_duration_minutes),
        break_duration_minutes: Number(shiftForm.break_duration_minutes),
      });
      showToast(
        `Generated ${res.total_slots_count ?? res.created_slots_count ?? 0} consultation slots for the shift schedule.`,
        "success",
      );
      setShiftModal(false);
      loadSchedules();
    } catch (err) {
      showToast(err.message || "Failed to create doctor shift schedule.", "error");
    } finally {
      setScheduling(false);
    }
  };

  const handleUnblockDate = async () => {
    if (!unblockTarget || unblocking) return;
    setUnblocking(true);
    try {
      await adminApi.unblockDate(unblockTarget.date);
      showToast(`${unblockTarget.date} was unblocked successfully.`, "success");
      setUnblockTarget(null);
      await loadSchedules();
    } catch (err) {
      showToast(err.message || "Failed to unblock clinic date.", "error");
    } finally {
      setUnblocking(false);
    }
  };

  const handleDeleteSlot = async (slotId) => {
    try {
      await adminApi.deleteSlot(slotId);
      showToast("Shift slot cancelled successfully.", "info");
      loadSchedules();
    } catch (err) {
      showToast(err.message || "Cannot delete slot with an active booking.", "error");
    }
  };

  const slots = [...(data.slots || [])].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
  );
  const blockedDates = data.blocked_dates || [];
  const doctors = data.doctors || [];

  // Generate 7 days for Weekly Calendar View
  const today = new Date();
  const weekDays = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - today.getDay() + 1 + i);
    return dateKeyInTimezone(d, clinicTimezone);
  });

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#577877]/15 pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
            Schedule Management
          </span>
          <h1 className="text-2xl font-bold text-[#162623]">
            Doctor Shifts, Calendar & Blocked Dates
          </h1>
          <p className="text-xs text-[#577877]">
            Monitor clinician working hours, break windows, leave status, and block clinic operating dates.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              if (doctors.length > 0) {
                setShiftForm((f) => ({ ...f, doctor_id: doctors[0][0] }));
              }
              setShiftModal(true);
            }}
            className="rounded-xl bg-[#25836F] px-4 py-2.5 text-xs font-semibold text-white shadow transition hover:bg-[#1d6e5d] cursor-pointer flex items-center gap-1.5"
          >
            <span className="text-sm font-bold">+</span> Add Doctor Shift
          </button>

          <button
            onClick={() => setBlockModal(true)}
            className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 cursor-pointer"
          >
            🚫 Block Clinic Date
          </button>
        </div>
      </div>

      {/* Filter & View Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between care-card p-4">
        <div className="flex items-center gap-3">
          <label className="text-xs font-bold text-[#162623]">Filter Doctor Schedule:</label>
          <select
            value={selectedDoctorId}
            onChange={(e) => setSelectedDoctorId(e.target.value)}
            className="rounded-xl border border-[#577877]/25 px-3 py-1.5 text-xs bg-white focus:border-[#25836F] focus:outline-none"
          >
            <option value="all">All Clinicians Overview</option>
            {doctors.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {/* View Switcher Pills */}
        <div className="flex rounded-xl bg-[#F0F5F7] p-1 border border-[#577877]/15">
          <button
            onClick={() => setCalendarView("weekly")}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition cursor-pointer ${
              calendarView === "weekly" ? "bg-[#25836F] text-white" : "text-[#577877]"
            }`}
          >
            Weekly Calendar
          </button>
          <button
            onClick={() => setCalendarView("monthly")}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition cursor-pointer ${
              calendarView === "monthly" ? "bg-[#25836F] text-white" : "text-[#577877]"
            }`}
          >
            Monthly Grid
          </button>
          <button
            onClick={() => setCalendarView("list")}
            className={`rounded-lg px-3 py-1 text-xs font-semibold transition cursor-pointer ${
              calendarView === "list" ? "bg-[#25836F] text-white" : "text-[#577877]"
            }`}
          >
            Slots Table
          </button>
        </div>
      </div>

      {/* Add Doctor Shift Modal Dialog */}
      {shiftModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162623]/60 backdrop-blur-xs p-4">
          <div className="care-card max-w-lg w-full p-6 space-y-4 shadow-2xl border border-[#25836F]/30">
            <div className="flex items-center justify-between border-b border-[#577877]/15 pb-3">
              <h3 className="text-base font-bold text-[#162623]">Add Doctor Working Shift</h3>
              <button
                onClick={() => setShiftModal(false)}
                className="text-xs font-semibold text-[#577877] hover:underline cursor-pointer"
              >
                Close ✕
              </button>
            </div>

            <form onSubmit={handleAddShift} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#162623]">Select Clinician</label>
                <select
                  required
                  value={shiftForm.doctor_id}
                  onChange={(e) => setShiftForm({ ...shiftForm, doctor_id: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs bg-white"
                >
                  <option value="" disabled>Select Doctor</option>
                  {doctors.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[#162623]">Shift Date</label>
                  <input
                    required
                    type="date"
                    value={shiftForm.date}
                    onChange={(e) => setShiftForm({ ...shiftForm, date: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#162623]">Slot Duration</label>
                  <select
                    value={shiftForm.slot_duration_minutes}
                    onChange={(e) => setShiftForm({ ...shiftForm, slot_duration_minutes: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs bg-white"
                  >
                    <option value={30}>30 Minutes</option>
                    <option value={45}>45 Minutes</option>
                    <option value={60}>60 Minutes</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#162623]">Shift Start Time</label>
                  <input
                    required
                    type="time"
                    value={shiftForm.start_time}
                    onChange={(e) => setShiftForm({ ...shiftForm, start_time: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#162623]">Shift End Time</label>
                  <input
                    required
                    type="time"
                    value={shiftForm.end_time}
                    onChange={(e) => setShiftForm({ ...shiftForm, end_time: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#162623]">Break Window Start</label>
                  <input
                    type="time"
                    value={shiftForm.break_start_time}
                    onChange={(e) => setShiftForm({ ...shiftForm, break_start_time: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#162623]">Break Duration</label>
                  <select
                    value={shiftForm.break_duration_minutes}
                    onChange={(e) => setShiftForm({ ...shiftForm, break_duration_minutes: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs bg-white"
                  >
                    <option value={60}>60 Minutes (Lunch)</option>
                    <option value={30}>30 Minutes</option>
                    <option value={0}>No Break</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#162623]">Recurrence Schedule</label>
                <select
                  value={shiftForm.recurrence}
                  onChange={(e) => setShiftForm({ ...shiftForm, recurrence: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs bg-white"
                >
                  <option value="none">Single Day Only</option>
                  <option value="daily_5d">Daily (Next 5 Days Mon-Fri)</option>
                  <option value="weekly_4w">Weekly (Next 4 Weeks)</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#577877]/15">
                <button
                  type="button"
                  onClick={() => setShiftModal(false)}
                  className="rounded-xl border border-[#577877]/30 px-4 py-2 text-xs font-semibold text-[#577877]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={scheduling}
                  className="rounded-xl bg-[#25836F] px-5 py-2 text-xs font-semibold text-white shadow hover:bg-[#1d6e5d] disabled:opacity-50 cursor-pointer"
                >
                  {scheduling ? "Generating Slots…" : "Create Doctor Shift"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {unblockTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162623]/60 backdrop-blur-xs p-4" role="dialog" aria-modal="true" aria-labelledby="unblock-date-title">
          <div className="care-card w-full max-w-md space-y-4 border border-amber-300 p-6 shadow-2xl">
            <div>
              <h3 id="unblock-date-title" className="text-base font-bold text-[#162623]">Unblock clinic date?</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#577877]">
                This will restore only eligible previously blocked, unbooked slots for <strong>{unblockTarget.date}</strong>. Booked and reserved appointments will not be changed.
              </p>
              <p className="mt-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                Reason: {unblockTarget.reason || "No reason provided"}
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#577877]/15 pt-3">
              <button type="button" onClick={() => setUnblockTarget(null)} disabled={unblocking} className="rounded-xl border border-[#577877]/30 px-4 py-2 text-xs font-semibold text-[#577877]">Cancel</button>
              <button type="button" onClick={handleUnblockDate} disabled={unblocking} className="rounded-xl bg-[#25836F] px-4 py-2 text-xs font-semibold text-white shadow hover:bg-[#1d6e5d] disabled:cursor-not-allowed disabled:opacity-50">{unblocking ? "Unblocking…" : "Confirm Unblock"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Block Date Modal */}
      {blockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162623]/50 backdrop-blur-xs p-4">
          <div className="care-card max-w-md w-full p-6 space-y-4 border-2 border-amber-300">
            <h3 className="text-sm font-bold text-[#162623]">Block Clinic Operating Date</h3>
            <p className="text-xs text-[#577877]">
              Prevent all patient bookings across all doctors for a specific clinic holiday or emergency maintenance date.
            </p>

            <form onSubmit={handleBlockDate} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#162623]">Select Date</label>
                <input
                  required
                  type="date"
                  value={blockForm.date}
                  onChange={(e) => setBlockForm({ ...blockForm, date: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#162623]">Reason for Blocking</label>
                <input
                  required
                  type="text"
                  value={blockForm.reason}
                  onChange={(e) => setBlockForm({ ...blockForm, reason: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setBlockModal(false)}
                  className="rounded-xl border border-[#577877]/30 px-3 py-2 text-xs font-semibold text-[#577877]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={blocking || !blockForm.date}
                  className="rounded-xl bg-amber-700 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-amber-800 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                >
                  {blocking ? "Blocking…" : "Confirm Block Date"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Calendar Views & Side Blocked Dates */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Blocked Dates Sidebar List */}
        <div className="care-card p-6 space-y-4">
          <h2 className="text-sm font-bold text-[#162623] flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-700 text-lg">block</span>
            Blocked Clinic Dates ({blockedDates.length})
          </h2>
          <div className="space-y-2 text-xs">
            {blockedDates.length === 0 ? (
              <div className="text-[#577877]">No blocked clinic dates currently active.</div>
            ) : (
              blockedDates.map((b) => (
                <div key={b.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-1">
                  <div className="font-bold text-amber-950 flex items-center justify-between">
                    <span>{b.date}</span>
                    <span className="text-[10px] uppercase bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-bold">Blocked</span>
                  </div>
                  <div className="text-[#577877] text-[11px]">{b.reason}</div>
                  <button type="button" onClick={() => setUnblockTarget(b)} className="mt-2 rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-amber-800 hover:bg-amber-100">Unblock Date</button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Weekly / Monthly / Table View Container */}
        <div className="care-card p-6 space-y-4 lg:col-span-2">
          {calendarView === "weekly" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#577877]/15 pb-3">
                <h2 className="text-sm font-bold text-[#162623] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#25836F] text-lg">view_week</span>
                  Weekly Doctor Schedules & Shift Slots
                </h2>
                <span className="text-xs text-[#577877] font-semibold">
                  {weekDays[0]} — {weekDays[6]}
                </span>
              </div>

              {/* 7-Day Columns */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-2 overflow-x-auto">
                {weekDays.map((dayStr) => {
                  const dayObj = new Date(dayStr);
                  const isBlocked = blockedDates.some((b) => b.date === dayStr);
                  const daySlots = slots.filter((s) => s.starts_at && dateKeyInTimezone(s.starts_at, clinicTimezone) === dayStr);

                  return (
                    <div
                      key={dayStr}
                      className={`rounded-xl p-2 text-xs space-y-2 border ${
                        isBlocked ? "bg-amber-50/70 border-amber-200" : "bg-[#F0F5F7]/70 border-[#577877]/15"
                      }`}
                    >
                      <div className="text-center border-b border-[#577877]/15 pb-1">
                        <div className="font-bold text-[#162623] text-[11px]">
                          {dayObj.toLocaleDateString("en-US", { weekday: "short" })}
                        </div>
                        <div className="text-[10px] text-[#577877]">{dayStr.slice(5)}</div>
                      </div>

                      {isBlocked ? (
                        <div className="p-2 text-center text-[10px] font-bold text-amber-800 bg-amber-100 rounded-lg">
                          🚫 Clinic Holiday
                        </div>
                      ) : daySlots.length === 0 ? (
                        <div className="p-2 text-center text-[10px] text-[#577877]">No slots</div>
                      ) : (
                        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-0.5">
                          {daySlots.map((slot) => (
                            <div
                              key={slot.id}
                              className={`p-1.5 rounded-lg border text-[10px] flex items-center justify-between ${
                                slot.booked
                                  ? "bg-[#25836F] text-white border-[#162623]"
                                  : slot.blocked
                                  ? "bg-amber-50 text-amber-900 border-amber-300"
                                  : "bg-white text-[#162623] border-[#577877]/20 hover:border-[#25836F]"
                              }`}
                            >
                              <div>
                                <div className="font-bold">
                                  {formatTimeInTimezone(slot.starts_at, clinicTimezone)}
                                </div>
                                <div className="text-[9px] opacity-80 truncate max-w-[80px]">
                                  {slot.doctor_name}
                                </div>
                              </div>

                              {slot.booked ? (
                                <span className="bg-amber-300 text-amber-950 px-1 py-0.5 rounded text-[8px] font-bold">
                                  Booked
                                </span>
                              ) : slot.blocked ? (
                                <span className="bg-amber-200 text-amber-900 px-1 py-0.5 rounded text-[8px] font-bold">
                                  Blocked
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleDeleteSlot(slot.id)}
                                  className="text-[#577877] hover:text-red-600 p-0.5 cursor-pointer"
                                  title="Cancel shift slot"
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {calendarView === "monthly" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-[#577877]/15 pb-3">
                <h2 className="text-sm font-bold text-[#162623] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#25836F] text-lg">calendar_month</span>
                  Monthly Schedule Grid Overview
                </h2>
                <span className="text-xs text-[#577877] font-semibold">Current Month</span>
              </div>

              <div className="grid grid-cols-7 gap-2 text-center text-xs">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                  <div key={d} className="font-bold text-[#577877] p-1 border-b border-[#577877]/15">
                    {d}
                  </div>
                ))}

                {Array.from({ length: 30 }).map((_, i) => {
                  const dayNum = i + 1;
                  const monthStart = new Date();
                  monthStart.setDate(1);
                  const dateStr = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                  const isBlocked = blockedDates.some((b) => b.date === dateStr);
                  const daySlots = slots.filter((s) => s.starts_at && dateKeyInTimezone(s.starts_at, clinicTimezone) === dateStr);
                  const bookedCount = daySlots.filter((s) => s.booked).length;

                  return (
                    <div
                      key={dayNum}
                      className={`min-h-[60px] p-1.5 rounded-xl border text-left flex flex-col justify-between ${
                        isBlocked
                          ? "bg-amber-50 border-amber-200"
                          : daySlots.length > 0
                          ? "bg-white border-[#577877]/20"
                          : "bg-[#F0F5F7]/60 border-transparent"
                      }`}
                    >
                      <div className="font-bold text-[#162623] text-[11px]">{dayNum}</div>
                      {isBlocked ? (
                        <div className="text-[9px] font-bold text-amber-800">🚫 Blocked</div>
                      ) : daySlots.length > 0 ? (
                        <div className="text-[9px] text-[#577877]">
                          <span className="font-bold text-[#25836F]">{daySlots.length}</span> slots
                          {bookedCount > 0 && <span className="text-amber-700 block font-bold">({bookedCount} booked)</span>}
                        </div>
                      ) : (
                        <div className="text-[9px] text-[#577877]/60">Off</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {calendarView === "list" && (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-[#162623] flex items-center gap-2 border-b border-[#577877]/15 pb-3">
                <span className="material-symbols-outlined text-[#25836F] text-lg">list</span>
                Shift Slots Ledger ({slots.length})
              </h2>

              {loading ? (
                <div className="flex h-32 items-center justify-center text-[#577877]">
                  <span className="material-symbols-outlined animate-spin text-2xl">sync</span>
                </div>
              ) : slots.length === 0 ? (
                <div className="text-xs text-[#577877] p-4 text-center">
                  No shift slots configured for the selected filter.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F0F5F7] text-[#577877] font-semibold border-b border-[#577877]/15">
                      <tr>
                        <th className="p-2.5">Doctor</th>
                        <th className="p-2.5">Start Time</th>
                        <th className="p-2.5">End Time</th>
                        <th className="p-2.5">Slot Status</th>
                        <th className="p-2.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#577877]/15">
                      {slots.map((s) => (
                        <tr key={s.id} className="hover:bg-[#F0F5F7]/50">
                          <td className="p-2.5 font-bold text-[#162623]">{s.doctor_name}</td>
                          <td className="p-2.5 text-[#577877]">{formatDateTimeInTimezone(s.starts_at, clinicTimezone)}</td>
                          <td className="p-2.5 text-[#577877]">
                            {formatTimeInTimezone(s.ends_at, clinicTimezone)}
                          </td>
                          <td className="p-2.5">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                s.booked ? "bg-amber-100 text-amber-800" : s.blocked ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                              }`}
                            >
                              {s.booked ? "Booked" : s.blocked ? "Blocked" : "Available"}
                            </span>
                          </td>
                          <td className="p-2.5 text-right">
                            {!s.booked && !s.blocked && (
                              <button
                                onClick={() => handleDeleteSlot(s.id)}
                                className="text-red-600 hover:underline text-[11px] font-semibold cursor-pointer"
                              >
                                Cancel Slot
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
