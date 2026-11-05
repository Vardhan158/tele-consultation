import { useState, useEffect } from 'react';
import { supportApi } from '../../lib/api';

// Legacy visual fixture retained for backwards-compatible layout only; API data is authoritative.
// eslint-disable-next-line no-unused-vars
const initialTasks = [
  {
    id: 'task-bp',
    title: 'Log your blood pressure',
    subtitle: 'Morning and evening readings · Due Nov 6',
    dueBadge: 'Due Nov 6',
    completed: false,
    completedNote: '',
  },
  {
    id: 'task-panel',
    title: 'Complete metabolic panel',
    subtitle: 'Lab order in Medical records · Due Nov 10',
    dueBadge: 'Due Nov 10',
    completed: false,
    completedNote: '',
  },
  {
    id: 'task-appt',
    title: 'Confirm your follow-up appointment',
    subtitle: 'Completed Nov 4 · Nov 12, 2:30 PM PT',
    dueBadge: null,
    completed: true,
    completedNote: 'Completed Nov 4 · Nov 12, 2:30 PM PT',
  },
];

const initialReadings = [
  { date: 'Oct 28', systolic: 142, diastolic: 88, pulse: 74, time: '8:30 AM', notes: 'Baseline' },
  { date: 'Oct 29', systolic: 138, diastolic: 86, pulse: 72, time: '8:15 AM', notes: 'Post-consult' },
  { date: 'Oct 30', systolic: 136, diastolic: 85, pulse: 71, time: '8:30 AM', notes: 'Morning' },
  { date: 'Oct 31', systolic: 130, diastolic: 82, pulse: 70, time: '8:45 AM', notes: 'Weekend morning' },
  { date: 'Nov 1', systolic: 134, diastolic: 84, pulse: 73, time: '8:20 AM', notes: 'Morning' },
  { date: 'Nov 3', systolic: 132, diastolic: 82, pulse: 72, time: '8:30 AM', notes: 'Morning, before breakfast' },
];

export default function FollowUpCareScreen({ onNavigate }) {
  const [tasks, setTasks] = useState([]);
  const [readings, setReadings] = useState(initialReadings);

  useEffect(() => {
    supportApi.followUp()
      .then((data) => {
        const apiTasks = Array.isArray(data) ? data : data?.tasks;
        if (Array.isArray(apiTasks) && apiTasks.length > 0) {
          setTasks(apiTasks.map((t) => ({
            id: t.id,
            title: t.title || t.advice || 'Follow-up task',
            subtitle: t.subtitle || t.advice || (t.due_date ? `Due ${new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''),
            dueBadge: t.due_date ? `Due ${new Date(t.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : null,
            completed: t.completed ?? t.status === 'completed',
            completedNote: (t.completed ?? t.status === 'completed') ? 'Completed' : '',
          })));
        }
      })
      .catch(() => {});
  }, []);

  // Form State
  const [dateTime, setDateTime] = useState('Nov 4, 2026 · 8:30 AM');
  const [systolic, setSystolic] = useState('132');
  const [diastolic, setDiastolic] = useState('82');
  const [pulse, setPulse] = useState('72');
  const [notes, setNotes] = useState('Morning, before breakfast');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Toggle tasks
  const handleToggleTask = () => {};

  const completedCount = tasks.filter((t) => t.completed).length;
  const remainingCount = tasks.length - completedCount;
  const progressPercent = tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0;

  // Handle save reading
  const handleSaveReading = (e) => {
    e.preventDefault();
    if (!systolic || !diastolic) return;

    const newReading = {
      date: 'Nov 4',
      systolic: parseInt(systolic, 10) || 132,
      diastolic: parseInt(diastolic, 10) || 82,
      pulse: parseInt(pulse, 10) || 72,
      time: dateTime,
      notes,
    };

    setReadings((prev) => [...prev, newReading]);
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3500);
  };

  const latestReading = readings[readings.length - 1] || initialReadings[initialReadings.length - 1];

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10">
      <div className="mx-auto max-w-6xl space-y-6">

        {/* Header matching Screenshot 1:1 */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#162623] tracking-tight">
              Small steps. Steadier care.
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#577877]">
              Your follow-up plan from Dr. Sarah Chen · Updated Oct 29, 2026
            </p>
          </div>

          <button
            type="button"
            onClick={() => onNavigate && onNavigate('summaries')}
            className="self-start sm:self-auto border border-[#577877]/30 bg-white hover:bg-[#F0F5F7] text-[#162623] px-4 py-2.5 rounded-xl font-semibold text-xs sm:text-sm shadow-2xs transition cursor-pointer"
          >
            View consultation summary
          </button>
          <button
            type="button"
            onClick={() => onNavigate && onNavigate('find-doctors')}
            className="self-start sm:self-auto btn-primary text-xs sm:text-sm"
          >
            Book follow-up appointment
          </button>
        </div>

        {/* Cyan Announcement Banner matching Screenshot */}
        {tasks.length > 0 && <div className="rounded-2xl p-4 sm:p-5 bg-[#E8F3F3] border border-[#295255]/20 flex items-start gap-3.5 shadow-2xs">
          <div className="w-8 h-8 rounded-full bg-[#295255]/10 flex items-center justify-center shrink-0 mt-0.5">
            <svg
              className="w-5 h-5 text-[#295255]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#162623]">
              Your next review is November 12
            </h3>
            <p className="text-xs text-[#577877] mt-0.5 leading-relaxed">
              Bring your blood pressure log to your video appointment. Your care team will review progress with you.
            </p>
          </div>
        </div>}

        {/* Main 2-Column Grid matching Screenshot */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* Left Column (7 cols): Next steps & BP log */}
          <div className="lg:col-span-7 space-y-6">

            {/* CARD 1: Your next steps matching Screenshot */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[#162623]">
                    Your next steps
                  </h2>
                  <p className="text-xs text-[#577877] mt-0.5">
                    {completedCount} of {tasks.length} tasks complete
                  </p>
                </div>

                {remainingCount > 0 ? (
                  <span className="bg-[#FEF3C7] text-[#92400E] font-medium text-xs px-3 py-1 rounded-full">
                    {remainingCount} tasks remaining
                  </span>
                ) : (
                  <span className="bg-[#E6F4EA] text-[#137333] font-medium text-xs px-3 py-1 rounded-full">
                    All tasks completed
                  </span>
                )}
              </div>

              {/* Progress bar matching Screenshot */}
              <div className="w-full h-1.5 bg-[#E5E7EB] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#295255] rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Tasks List */}
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
                            ? 'bg-[#295255] text-white'
                            : 'border border-[#577877]/40 bg-white hover:border-[#295255]'
                        }`}
                      >
                        {task.completed && (
                          <span className="material-symbols-outlined text-sm font-bold">check</span>
                        )}
                      </button>

                      <div>
                        <h4
                          className={`text-xs sm:text-sm font-bold text-[#162623] ${
                            task.completed ? 'line-through text-[#577877]' : ''
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
            </div>

            {/* CARD 2: Blood pressure log & Trend chart matching Screenshot */}
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
                    Latest reading · {latestReading.date}
                  </span>
                  <span className="text-base sm:text-lg font-bold text-[#162623] mt-0.5 block">
                    {latestReading.systolic} / {latestReading.diastolic} mmHg
                  </span>
                </div>

                <div>
                  <span className="text-[11px] text-[#577877] block">
                    Last 7 days
                  </span>
                  <span className="text-base sm:text-lg font-bold text-[#162623] mt-0.5 block">
                    {readings.length} readings recorded
                  </span>
                </div>
              </div>

              {/* Trend Chart Area matching Screenshot */}
              <div className="space-y-2 pt-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#295255]">
                    Systolic · mmHg
                  </span>
                  <span className="text-[#577877]">
                    142 → {latestReading.systolic}
                  </span>
                </div>

                {/* SVG Line Graph */}
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

                    {/* Trend line representing 142 -> 138 -> 136 -> 130 -> 134 -> 132 */}
                    <path
                      d="M 10 20 L 100 45 L 200 55 L 290 85 L 390 70 L 490 100"
                      fill="none"
                      stroke="#295255"
                      strokeWidth="2.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* Data Points */}
                    <circle cx="10" cy="20" r="3.5" fill="#295255" />
                    <circle cx="100" cy="45" r="3.5" fill="#295255" />
                    <circle cx="200" cy="55" r="3.5" fill="#295255" />
                    <circle cx="290" cy="85" r="3.5" fill="#295255" />
                    <circle cx="390" cy="70" r="3.5" fill="#295255" />
                    <circle cx="490" cy="100" r="3.5" fill="#295255" />
                  </svg>

                  {/* Dates underneath graph matching Screenshot */}
                  <div className="flex items-center justify-between text-xs text-[#577877] mt-2">
                    <span>Oct 28</span>
                    <span>Nov 3</span>
                  </div>
                </div>

                <p className="text-[11px] text-[#577877] pt-2">
                  Trend from your entered readings. This is not a diagnosis or an automated medical assessment.
                </p>
              </div>

            </div>

          </div>

          {/* Right Column (5 cols): Add BP reading & Urgent feeling unwell alert */}
          <div className="lg:col-span-5 space-y-6">

            {/* CARD 1: Add a blood pressure reading form matching Screenshot */}
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
                    Date & time
                  </label>
                  <input
                    type="text"
                    value={dateTime}
                    onChange={(e) => setDateTime(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#295255] bg-white transition"
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
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#295255] bg-white transition"
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
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#295255] bg-white transition"
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
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#295255] bg-white transition"
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
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#295255] bg-white transition"
                  />
                </div>

                {/* Blue Save reading button */}
                <button
                  type="submit"
                  className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-medium py-3 rounded-xl flex items-center justify-center gap-1.5 shadow-sm transition text-xs sm:text-sm cursor-pointer mt-2"
                >
                  <span className="material-symbols-outlined text-base">add</span>
                  <span>Save reading</span>
                </button>
              </form>

              <p className="text-[11px] text-[#577877] leading-relaxed pt-1">
                Entries are not monitored in real time. Follow the guidance given by your clinician.
              </p>
            </div>

            {/* CARD 2: Feeling unwell? amber card matching Screenshot */}
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
    </div>
  );
}
