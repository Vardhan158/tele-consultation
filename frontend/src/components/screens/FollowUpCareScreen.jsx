import { useState, useEffect } from "react";
import { supportApi } from "../../lib/api";

const getDefaultLocalDateTime = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export default function FollowUpCareScreen({ onNavigate }) {
  const [tasks, setTasks] = useState([]);
  const [followUpPlan, setFollowUpPlan] = useState(null);
  const [readings, setReadings] = useState([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [dateTime, setDateTime] = useState(getDefaultLocalDateTime());
  const [systolic, setSystolic] = useState("120");
  const [diastolic, setDiastolic] = useState("80");
  const [pulse, setPulse] = useState("72");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const loadFollowUpData = async () => {
    try {
      const data = await supportApi.followUp().catch(() => []);
      if (Array.isArray(data) && data.length > 0) {
        setFollowUpPlan(data[0]);
        setTasks(
          data.map((t) => ({
            id: t.id,
            title: t.advice || "Follow-up care task",
            subtitle: t.created_at
              ? `Assigned ${new Date(t.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`
              : "Assigned by clinician",
            dueBadge: null,
            completed: t.status === "completed",
            completedNote: t.status === "completed" ? "Completed" : "",
          })),
        );
      } else {
        setFollowUpPlan(null);
        setTasks([]);
      }
    } catch {
      // Handled
    }
  };

  const loadBpReadings = async () => {
    try {
      const items = await supportApi.bpReadings().catch(() => []);
      if (Array.isArray(items)) {
        setReadings(
          items.map((r) => {
            const dt = r.reading_at ? new Date(r.reading_at) : new Date();
            return {
              id: r.id,
              date: dt.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
              time: dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
              systolic: r.systolic,
              diastolic: r.diastolic,
              pulse: r.pulse,
              notes: r.notes || "",
              rawDate: dt,
            };
          }),
        );
      }
    } catch {
      // Handled
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([loadFollowUpData(), loadBpReadings()]).finally(() =>
      setLoading(false),
    );
  }, []);

  const handleSaveReading = async (e) => {
    e.preventDefault();
    if (!systolic || !diastolic || isSaving) return;

    setIsSaving(true);
    try {
      const readingDate = dateTime ? new Date(dateTime) : new Date();
      await supportApi.saveBpReading({
        systolic: parseInt(systolic, 10),
        diastolic: parseInt(diastolic, 10),
        pulse: pulse ? parseInt(pulse, 10) : null,
        reading_at: readingDate.toISOString(),
        notes: notes.trim(),
      });

      setSaveSuccess(true);
      setNotes("");
      setDateTime(getDefaultLocalDateTime());
      await loadBpReadings();
    } catch (err) {
      setToastMessage(err.message || "Failed to log blood pressure reading.");
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveSuccess(false), 3500);
    }
  };

  const completedCount = tasks.filter((t) => t.completed).length;
  const remainingCount = tasks.length - completedCount;
  const progressPercent = tasks.length
    ? Math.round((completedCount / tasks.length) * 100)
    : 0;

  const latestReading = readings.length > 0 ? readings[readings.length - 1] : null;

  // Chart SVG coordinates computation for readings
  const getChartPoints = () => {
    if (readings.length < 2) return "";
    const minSys = 90;
    const maxSys = 180;
    const width = 500;
    const height = 120;

    return readings
      .map((r, idx) => {
        const x = (idx / (readings.length - 1)) * (width - 20) + 10;
        const normalized = (r.systolic - minSys) / (maxSys - minSys);
        const y = height - Math.max(0, Math.min(1, normalized)) * (height - 20) - 10;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" L ");
  };

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Toast */}
        {toastMessage && (
          <div className="p-3.5 rounded-xl bg-white border border-[#25836F]/30 shadow-sm flex items-center justify-between text-xs text-[#25836F] font-semibold">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base">info</span>
              {toastMessage}
            </span>
            <button
              type="button"
              onClick={() => setToastMessage("")}
              className="text-[#577877] hover:text-[#162623]"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#162623] tracking-tight">
              Small steps. Steadier care.
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#577877]">
              {followUpPlan
                ? `Your follow-up plan from ${followUpPlan.doctor_name || "your clinician"}`
                : "Your personalized care log and vitals history."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => onNavigate && onNavigate("summaries")}
              className="border border-[#577877]/30 bg-white hover:bg-[#F0F5F7] text-[#162623] px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm shadow-2xs transition cursor-pointer"
            >
              View consultation summary
            </button>
            <button
              type="button"
              onClick={() => onNavigate && onNavigate("find-doctors")}
              className="btn-primary text-xs sm:text-sm cursor-pointer"
            >
              Book follow-up appointment
            </button>
          </div>
        </div>

        {/* Doctor's Follow-up Plan Banner - Displayed ONLY when a genuine plan exists */}
        {followUpPlan && followUpPlan.advice && (
          <div className="rounded-2xl p-4 sm:p-5 bg-[#E8F3F3] border border-[#25836F]/20 flex items-start gap-3.5 shadow-2xs">
            <div className="w-8 h-8 rounded-full bg-[#25836F]/10 flex items-center justify-center shrink-0 mt-0.5">
              <span className="material-symbols-outlined text-[#25836F] text-lg">
                health_and_safety
              </span>
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#162623]">
                Doctor's Follow-up Advice
              </h3>
              <p className="text-xs text-[#577877] mt-0.5 leading-relaxed">
                {followUpPlan.advice}
              </p>
            </div>
          </div>
        )}

        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (7 cols): Next steps & BP log */}
          <div className="lg:col-span-7 space-y-6">
            {/* CARD 1: Your next steps */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-xs space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[#162623]">
                    Your next steps
                  </h2>
                  <p className="text-xs text-[#577877] mt-0.5">
                    {tasks.length === 0
                      ? "No follow-up tasks assigned yet"
                      : `${completedCount} of ${tasks.length} tasks complete`}
                  </p>
                </div>

                {tasks.length === 0 ? (
                  <span className="bg-[#F0F5F7] text-[#577877] font-medium text-xs px-3 py-1 rounded-full">
                    No follow-up tasks assigned yet
                  </span>
                ) : remainingCount > 0 ? (
                  <span className="bg-[#FEF3C7] text-[#92400E] font-medium text-xs px-3 py-1 rounded-full">
                    {remainingCount} tasks remaining
                  </span>
                ) : (
                  <span className="bg-[#E6F4EA] text-[#137333] font-medium text-xs px-3 py-1 rounded-full">
                    All tasks completed
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
                <div className="py-8 text-center text-[#577877] text-xs font-medium">
                  No follow-up tasks assigned yet.
                </div>
              ) : (
                <div className="divide-y divide-[#577877]/10 pt-1">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3.5 flex-1">
                        <span
                          className={`w-5 h-5 rounded mt-0.5 flex items-center justify-center shrink-0 ${
                            task.completed
                              ? "bg-[#25836F] text-white"
                              : "border border-[#577877]/40 bg-white"
                          }`}
                        >
                          {task.completed && (
                            <span className="material-symbols-outlined text-sm font-bold">
                              check
                            </span>
                          )}
                        </span>

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
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CARD 2: Blood pressure log & Trend chart */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-xs space-y-6">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#162623]">
                  Blood pressure log
                </h2>
              </div>

              {/* Stats strip */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[11px] text-[#577877] block">
                    Latest reading {latestReading ? `· ${latestReading.date}` : ""}
                  </span>
                  <span className="text-base sm:text-lg font-bold text-[#162623] mt-0.5 block">
                    {latestReading
                      ? `${latestReading.systolic} / ${latestReading.diastolic} mmHg`
                      : "-- / -- mmHg"}
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-[#577877] block">
                    Recorded history
                  </span>
                  <span className="text-base sm:text-lg font-bold text-[#162623] mt-0.5 block">
                    {readings.length} {readings.length === 1 ? "reading" : "readings"} recorded
                  </span>
                </div>
              </div>

              {/* Trend Chart Area */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#25836F]">
                    Systolic Trend · mmHg
                  </span>
                  <span className="text-[#577877]">
                    {readings.length > 0
                      ? `${readings[0].systolic} → ${latestReading.systolic}`
                      : "No readings recorded"}
                  </span>
                </div>

                {readings.length === 0 ? (
                  <div className="p-8 text-center text-[#577877] text-xs font-medium bg-[#F8FAFB] rounded-xl border border-dashed border-[#577877]/20">
                    No blood pressure readings recorded yet. Log your first reading below.
                  </div>
                ) : readings.length === 1 ? (
                  <div className="p-6 text-center text-[#162623] text-xs font-semibold bg-[#F0F5F7] rounded-xl">
                    1 reading recorded ({readings[0].systolic}/{readings[0].diastolic} mmHg on {readings[0].date} at {readings[0].time}). Log additional readings to generate trend graphs.
                  </div>
                ) : (
                  <div className="w-full pt-4 pb-2">
                    <svg
                      viewBox="0 0 500 120"
                      className="w-full h-28 sm:h-32 overflow-visible"
                      preserveAspectRatio="none"
                    >
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

                      <path
                        d={`M ${getChartPoints()}`}
                        fill="none"
                        stroke="#25836F"
                        strokeWidth="2.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {readings.map((r, idx) => {
                        const x = (idx / (readings.length - 1)) * 480 + 10;
                        const minSys = 90;
                        const maxSys = 180;
                        const normalized = (r.systolic - minSys) / (maxSys - minSys);
                        const y = 120 - Math.max(0, Math.min(1, normalized)) * 100 - 10;
                        return (
                          <circle
                            key={r.id || idx}
                            cx={x.toFixed(1)}
                            cy={y.toFixed(1)}
                            r="3.5"
                            fill="#25836F"
                          />
                        );
                      })}
                    </svg>

                    <div className="flex items-center justify-between text-xs text-[#577877] mt-2">
                      <span>{readings[0].date}</span>
                      <span>{latestReading.date}</span>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-[#577877] pt-2">
                  Trend calculated from your entered database records. This is not an automated medical diagnosis.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column (5 cols): Add BP reading */}
          <div className="lg:col-span-5 space-y-6">
            {/* CARD 1: Add a blood pressure reading form */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-xs space-y-4">
              <h2 className="text-base sm:text-lg font-bold text-[#162623]">
                Add a blood pressure reading
              </h2>

              {saveSuccess && (
                <div className="p-3 bg-[#E6F4EA] border border-[#137333]/20 rounded-xl text-xs text-[#137333] font-medium flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm">
                    check_circle
                  </span>
                  <span>Reading saved to database &amp; updated!</span>
                </div>
              )}

              <form onSubmit={handleSaveReading} className="space-y-4">
                {/* Date & time - Defaulted to local date/time */}
                <div>
                  <label className="text-xs font-semibold text-[#162623] block mb-1.5">
                    Date &amp; time
                  </label>
                  <input
                    type="datetime-local"
                    value={dateTime}
                    onChange={(e) => setDateTime(e.target.value)}
                    max={getDefaultLocalDateTime()}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#25836F] bg-white transition"
                  />
                </div>

                {/* Systolic & Diastolic */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-[#162623] block mb-1.5">
                      Systolic · mmHg
                    </label>
                    <input
                      type="number"
                      required
                      min="40"
                      max="260"
                      value={systolic}
                      onChange={(e) => setSystolic(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#25836F] bg-white transition"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#162623] block mb-1.5">
                      Diastolic · mmHg
                    </label>
                    <input
                      type="number"
                      required
                      min="20"
                      max="180"
                      value={diastolic}
                      onChange={(e) => setDiastolic(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#25836F] bg-white transition"
                    />
                  </div>
                </div>

                {/* Pulse bpm */}
                <div>
                  <label className="text-xs font-semibold text-[#162623] block mb-1.5">
                    Pulse · bpm (optional)
                  </label>
                  <input
                    type="number"
                    min="30"
                    max="220"
                    value={pulse}
                    onChange={(e) => setPulse(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#25836F] bg-white transition"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-semibold text-[#162623] block mb-1.5">
                    Notes (optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Morning, before breakfast"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#25836F] bg-white transition"
                  />
                </div>

                {/* Save reading button */}
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium py-3 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition text-xs sm:text-sm cursor-pointer mt-2 disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-base">
                    add
                  </span>
                  <span>{isSaving ? "Saving..." : "Save reading"}</span>
                </button>
              </form>

              <p className="text-[11px] text-[#577877] leading-relaxed pt-1">
                Entries are recorded in your patient health record and not monitored in real time.
              </p>
            </div>

            {/* Feeling unwell card */}
            <div className="bg-[#FEF3C7]/40 border border-[#FDE68A] rounded-2xl p-4 sm:p-5 flex items-start gap-3">
              <span className="material-symbols-outlined !text-[#92400E] text-lg shrink-0 mt-0.5">
                info
              </span>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#92400E]">
                  Feeling unwell?
                </h3>
                <p className="text-xs text-[#92400E]/90 mt-1 leading-relaxed">
                  Don&apos;t wait for a portal response. Seek urgent help for
                  severe or sudden symptoms.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
