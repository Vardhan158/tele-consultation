import { useState, useEffect } from "react";
import { supportApi, patientApi } from "../../lib/api";

const formatCurrentTime = () => {
  const now = new Date();
  return `${now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;
};

export default function FollowUpCareScreen({ onNavigate }) {
  const [tasks, setTasks] = useState([]);
  const [readings, setReadings] = useState(() => {
    try {
      const saved = localStorage.getItem("teleconsult_patient_bp_readings");
      if (saved) return JSON.parse(saved);
    } catch {
      // fallback
    }
    return [];
  });

  const [upcomingReview, setUpcomingReview] = useState(null);
  const [attendingDoctor, setAttendingDoctor] = useState(null);

  useEffect(() => {
    supportApi
      .followUp()
      .then((data) => {
        const apiTasks = Array.isArray(data) ? data : data?.tasks;
        if (Array.isArray(apiTasks) && apiTasks.length > 0) {
          setTasks(
            apiTasks.map((t) => ({
              id: t.id,
              title: t.title || t.advice || "Follow-up task",
              subtitle:
                t.subtitle ||
                t.advice ||
                (t.due_date
                  ? `Due ${new Date(t.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                  : ""),
              dueBadge: t.due_date
                ? `Due ${new Date(t.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
                : null,
              completed: t.completed ?? t.status === "completed",
              completedNote:
                (t.completed ?? t.status === "completed") ? "Completed" : "",
            })),
          );
        }
      })
      .catch(() => {});

    patientApi
      .appointments()
      .then((data) => {
        const apts = Array.isArray(data) ? data : data?.appointments || [];
        const upcoming = apts.find((a) =>
          ["confirmed", "requested", "pending_payment", "checked_in"].includes(a.status),
        );
        if (upcoming) {
          setUpcomingReview(upcoming);
          if (upcoming.doctor?.name) setAttendingDoctor(upcoming.doctor.name);
        } else {
          const past = apts.find((a) => a.status === "completed");
          if (past?.doctor?.name) setAttendingDoctor(past.doctor.name);
        }
      })
      .catch(() => {});
  }, []);

  // Form State - Clean placeholders with current timestamp
  const [dateTime, setDateTime] = useState(formatCurrentTime());
  const [systolic, setSystolic] = useState("");
  const [diastolic, setDiastolic] = useState("");
  const [pulse, setPulse] = useState("");
  const [notes, setNotes] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Toggle tasks dynamically
  const handleToggleTask = (taskId) => {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              completed: !t.completed,
              completedNote: !t.completed ? "Completed just now" : "",
            }
          : t,
      ),
    );
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const remainingCount = tasks.length - completedCount;
  const progressPercent = tasks.length
    ? Math.round((completedCount / tasks.length) * 100)
    : 100;

  // Handle save reading
  const handleSaveReading = (e) => {
    e.preventDefault();
    const sys = parseInt(systolic, 10);
    const dia = parseInt(diastolic, 10);
    if (!sys || !dia) return;

    const now = new Date();
    const newReading = {
      date: now.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      systolic: sys,
      diastolic: dia,
      pulse: parseInt(pulse, 10) || null,
      time: dateTime || formatCurrentTime(),
      notes: notes.trim(),
    };

    setReadings((prev) => {
      const updated = [...prev, newReading];
      try {
        localStorage.setItem("teleconsult_patient_bp_readings", JSON.stringify(updated));
      } catch {
        // ignore storage errors
      }
      return updated;
    });

    setSystolic("");
    setDiastolic("");
    setPulse("");
    setNotes("");
    setDateTime(formatCurrentTime());
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3500);
  };

  const latestReading = readings.length > 0 ? readings[readings.length - 1] : null;
  const firstReading = readings.length > 0 ? readings[0] : null;

  // SVG Chart calculation for dynamic readings
  const minSys = readings.length > 0 ? Math.min(...readings.map((r) => r.systolic), 100) : 100;
  const maxSys = readings.length > 0 ? Math.max(...readings.map((r) => r.systolic), 160) : 160;
  const sysRange = maxSys - minSys || 1;

  const chartPoints = readings.map((r, i) => {
    const x = readings.length === 1 ? 250 : Math.round(20 + (i / (readings.length - 1)) * 460);
    const normalized = (r.systolic - minSys) / sysRange;
    const y = Math.round(100 - normalized * 80);
    return { x, y, ...r };
  });

  const chartPath =
    chartPoints.length > 1
      ? chartPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
      : "";

  return (
    <div className="space-y-6 font-sans text-[#162623]">
      {/* Compact Heading Banner matching Portal Brand System */}
      <div className="rounded-2xl bg-gradient-to-r from-[#25836F] via-[#1F6E5E] to-[#185A4D] text-white px-6 py-5 sm:px-8 sm:py-6 shadow-sm border border-[#185A4D]/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase text-[#F0F5F7]/85">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A3E2D4]" />
            POST-CONSULTATION RECOVERY · CARE ROUTINE
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Small steps. Steadier care.
          </h1>
          <p className="text-xs sm:text-sm text-[#F0F5F7]/90 max-w-2xl leading-relaxed">
            {attendingDoctor
              ? `Follow-up plan coordinated with Dr. ${attendingDoctor} · Updated ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
              : "Track daily vitals, complete care plan recommendations, and monitor post-consultation recovery."}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => onNavigate && onNavigate("summaries")}
            className="px-4 py-2.5 rounded-xl font-semibold text-xs bg-white/10 hover:bg-white/20 text-white border border-white/20 flex items-center gap-2 backdrop-blur-xs transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">description</span>
            <span>Consultation summary</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate && onNavigate("find-doctors")}
            className="px-4 py-2.5 rounded-xl font-semibold text-xs bg-white text-[#185A4D] hover:bg-[#F0F5F7] flex items-center gap-2 shadow-xs transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-base !text-[#185A4D]">calendar_today</span>
            <span>Book follow-up</span>
          </button>
        </div>
      </div>

      {/* Announcement Banner */}
      <div className="rounded-2xl p-4 sm:p-5 bg-[#E8F3F3] border border-[#25836F]/20 flex items-start gap-3.5 shadow-2xs">
        <div className="w-8 h-8 rounded-full bg-[#25836F]/10 flex items-center justify-center shrink-0 mt-0.5">
          <span className="material-symbols-outlined text-[#25836F] text-lg">
            {upcomingReview ? "event_available" : "medical_services"}
          </span>
        </div>
        <div>
          <h3 className="text-sm font-bold text-[#162623]">
            {upcomingReview
              ? `Your next review is ${new Date(upcomingReview.starts_at).toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
              : "Vitals logging & care team review"}
          </h3>
          <p className="text-xs text-[#577877] mt-0.5 leading-relaxed">
            {upcomingReview
              ? `Bring your blood pressure log to your video consultation${upcomingReview.doctor?.name ? ` with ${upcomingReview.doctor.name}` : ""}. Your care team will review your recovery progress.`
              : "Record your blood pressure and pulse regularly. Your entered vitals will be available to your doctor during your next consultation."}
          </p>
        </div>
      </div>

      {/* Main 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (7 cols): Next steps & BP log */}
        <div className="lg:col-span-7 space-y-6">
          {/* CARD 1: Your next steps */}
          <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#162623]">
                  Your next steps
                </h2>
                <p className="text-xs text-[#577877] mt-0.5">
                  {tasks.length > 0
                    ? `${completedCount} of ${tasks.length} tasks complete`
                    : "No pending recovery tasks"}
                </p>
              </div>

              {tasks.length > 0 ? (
                remainingCount > 0 ? (
                  <span className="bg-[#FEF3C7] text-[#92400E] font-medium text-xs px-3 py-1 rounded-full">
                    {remainingCount} task{remainingCount === 1 ? "" : "s"} remaining
                  </span>
                ) : (
                  <span className="bg-[#E6F4EA] text-[#137333] font-medium text-xs px-3 py-1 rounded-full">
                    All tasks completed
                  </span>
                )
              ) : (
                <span className="bg-[#E6F4EA] text-[#137333] font-medium text-xs px-3 py-1 rounded-full">
                  Up to date
                </span>
              )}
            </div>

            {/* Progress bar */}
            <div className="w-full h-1.5 bg-[#E5E7EB] rounded-full overflow-hidden">
              <div
                className="h-full bg-[#25836F] rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            {/* Tasks List */}
            {tasks.length === 0 ? (
              <div className="py-6 text-center text-[#577877] space-y-1">
                <span className="material-symbols-outlined text-2xl text-[#25836F]/60">task_alt</span>
                <p className="text-xs font-semibold text-[#162623]">No follow-up action items</p>
                <p className="text-[11px]">
                  Your doctor will assign personalized recovery steps and lab tests following your consultations.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#577877]/10 pt-1">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3 group"
                  >
                    <div
                      onClick={() => handleToggleTask(task.id)}
                      className="flex items-start gap-3.5 cursor-pointer flex-1"
                    >
                      <button
                        type="button"
                        aria-label={`Toggle ${task.title}`}
                        className={`w-5 h-5 rounded mt-0.5 flex items-center justify-center transition shrink-0 ${
                          task.completed
                            ? "bg-[#25836F] text-white"
                            : "border border-[#577877]/40 bg-white hover:border-[#25836F]"
                        }`}
                      >
                        {task.completed && (
                          <span className="material-symbols-outlined text-sm font-bold">
                            check
                          </span>
                        )}
                      </button>

                      <div>
                        <h4
                          className={`text-xs sm:text-sm font-bold text-[#162623] ${
                            task.completed ? "line-through text-[#577877]" : ""
                          }`}
                        >
                          {task.title}
                        </h4>
                        <p className="text-[11px] sm:text-xs text-[#577877] mt-0.5">
                          {task.subtitle}
                        </p>
                      </div>
                    </div>

                    {task.dueBadge && !task.completed && (
                      <span className="bg-[#FEF3C7] text-[#92400E] text-xs font-medium px-3 py-1 rounded-full shrink-0">
                        {task.dueBadge}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CARD 2: Blood pressure log & Trend chart */}
          <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-6">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#162623]">
                Blood pressure log
              </h2>
            </div>

            {/* 2-column stats strip */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[11px] text-[#577877] block">
                  {latestReading ? `Latest reading · ${latestReading.date}` : "Latest reading"}
                </span>
                <span className="text-base sm:text-lg font-bold text-[#162623] mt-0.5 block">
                  {latestReading ? `${latestReading.systolic} / ${latestReading.diastolic} mmHg` : "—"}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-[#577877] block">
                  Total recorded
                </span>
                <span className="text-base sm:text-lg font-bold text-[#162623] mt-0.5 block">
                  {readings.length} reading{readings.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>

            {/* Trend Chart Area */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#25836F]">
                  Systolic · mmHg
                </span>
                <span className="text-[#577877]">
                  {latestReading
                    ? firstReading && firstReading !== latestReading
                      ? `${firstReading.systolic} → ${latestReading.systolic}`
                      : `${latestReading.systolic} mmHg`
                    : "No data"}
                </span>
              </div>

              {readings.length === 0 ? (
                <div className="py-10 text-center text-[#577877] bg-[#F0F5F7]/40 rounded-xl border border-dashed border-[#577877]/20 space-y-2">
                  <span className="material-symbols-outlined text-3xl text-[#25836F]/60">
                    monitoring
                  </span>
                  <p className="text-xs font-semibold text-[#162623]">
                    No blood pressure readings yet
                  </p>
                  <p className="text-[11px] text-[#577877] max-w-sm mx-auto">
                    Log your first systolic and diastolic reading using the form to start tracking your recovery trends.
                  </p>
                </div>
              ) : (
                <div className="w-full pt-4 pb-2">
                  <svg
                    viewBox="0 0 500 120"
                    className="w-full h-28 sm:h-32 overflow-visible"
                    preserveAspectRatio="none"
                  >
                    {/* Horizontal guide lines */}
                    <line
                      x1="0"
                      y1="20"
                      x2="500"
                      y2="20"
                      stroke="#577877"
                      strokeOpacity="0.1"
                      strokeDasharray="4 4"
                    />
                    <line
                      x1="0"
                      y1="60"
                      x2="500"
                      y2="60"
                      stroke="#577877"
                      strokeOpacity="0.1"
                      strokeDasharray="4 4"
                    />
                    <line
                      x1="0"
                      y1="100"
                      x2="500"
                      y2="100"
                      stroke="#577877"
                      strokeOpacity="0.1"
                      strokeDasharray="4 4"
                    />

                    {/* Trend line */}
                    {chartPath && (
                      <path
                        d={chartPath}
                        fill="none"
                        stroke="#25836F"
                        strokeWidth="2.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}

                    {/* Data Points */}
                    {chartPoints.map((p, idx) => (
                      <circle key={idx} cx={p.x} cy={p.y} r="3.5" fill="#25836F" />
                    ))}
                  </svg>

                  {/* Dates underneath graph */}
                  <div className="flex items-center justify-between text-xs text-[#577877] mt-2">
                    <span>{firstReading?.date || ""}</span>
                    <span>{latestReading?.date || ""}</span>
                  </div>
                </div>
              )}

              <p className="text-[11px] text-[#577877] pt-2">
                Trend from your entered readings. This is not a diagnosis or an automated medical assessment.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Add BP reading & Urgent feeling unwell alert */}
        <div className="lg:col-span-5 space-y-6">
          {/* CARD 1: Add a blood pressure reading form */}
          <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-4">
            <h2 className="text-base sm:text-lg font-bold text-[#162623]">
              Add a blood pressure reading
            </h2>

            {saveSuccess && (
              <div className="p-3 bg-[#E6F4EA] border border-[#137333]/20 rounded-xl text-xs text-[#137333] font-medium flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">check_circle</span>
                <span>Reading logged successfully!</span>
              </div>
            )}

            <form onSubmit={handleSaveReading} className="space-y-4">
              {/* Date & time */}
              <div>
                <label className="text-xs font-semibold text-[#162623] block mb-1.5">
                  Date &amp; time
                </label>
                <input
                  type="text"
                  value={dateTime}
                  onChange={(e) => setDateTime(e.target.value)}
                  placeholder="e.g., Nov 13, 2026 · 8:30 AM"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#25836F] bg-white transition"
                />
              </div>

              {/* Systolic & Diastolic 2 columns */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-[#162623] block mb-1.5">
                    Systolic · mmHg
                  </label>
                  <input
                    type="number"
                    value={systolic}
                    onChange={(e) => setSystolic(e.target.value)}
                    placeholder="e.g., 120"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#25836F] bg-white transition"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#162623] block mb-1.5">
                    Diastolic · mmHg
                  </label>
                  <input
                    type="number"
                    value={diastolic}
                    onChange={(e) => setDiastolic(e.target.value)}
                    placeholder="e.g., 80"
                    required
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#25836F] bg-white transition"
                  />
                </div>
              </div>

              {/* Pulse bpm optional */}
              <div>
                <label className="text-xs font-semibold text-[#162623] block mb-1.5">
                  Pulse · bpm (optional)
                </label>
                <input
                  type="number"
                  value={pulse}
                  onChange={(e) => setPulse(e.target.value)}
                  placeholder="e.g., 72"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#25836F] bg-white transition"
                />
              </div>

              {/* Notes optional */}
              <div>
                <label className="text-xs font-semibold text-[#162623] block mb-1.5">
                  Notes (optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g., Morning, before breakfast"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#25836F] bg-white transition"
                />
              </div>

              {/* Brand Green Save reading button (replacing royal blue) */}
              <button
                type="submit"
                className="w-full bg-[#25836F] hover:bg-[#185A4D] text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-1.5 shadow-xs transition text-xs sm:text-sm cursor-pointer mt-2"
              >
                <span className="material-symbols-outlined text-base">add</span>
                <span>Save reading</span>
              </button>
            </form>

            <p className="text-[11px] text-[#577877] leading-relaxed pt-1">
              Entries are not monitored in real time. Follow the guidance given by your clinician.
            </p>
          </div>

          {/* CARD 2: Feeling unwell? amber card */}
          <div className="bg-[#FEF3C7]/40 border border-[#FDE68A] rounded-2xl p-4 sm:p-5 flex items-start gap-3">
            <span className="material-symbols-outlined !text-[#92400E] text-lg shrink-0 mt-0.5">
              info
            </span>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#92400E]">
                Feeling unwell?
              </h3>
              <p className="text-xs text-[#92400E]/90 mt-1 leading-relaxed">
                Don&apos;t wait for a portal response. Seek urgent help for severe or sudden symptoms.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
