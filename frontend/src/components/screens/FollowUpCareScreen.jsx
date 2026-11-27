import { useState, useEffect, useRef } from "react";
import { patientApi, supportApi } from "../../lib/api";

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

  // 72-Hour Post-Consultation Follow-Up State
  const [activeFollowUp, setActiveFollowUp] = useState(null);
  const [followUpInput, setFollowUpInput] = useState("");
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const [followUpError, setFollowUpError] = useState("");

  // Form State
  const [dateTime, setDateTime] = useState(getDefaultLocalDateTime());
  const [systolic, setSystolic] = useState("120");
  const [diastolic, setDiastolic] = useState("80");
  const [pulse, setPulse] = useState("72");
  const [notes, setNotes] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  // Phase 2 (F-04): Chrono-Care Timeline & Longitudinal Trends States
  const [activeTab, setActiveTab] = useState("timeline"); // "timeline" | "tasks"
  const [timelineData, setTimelineData] = useState(null);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineFilter, setTimelineFilter] = useState("all");
  const [activeMetric, setActiveMetric] = useState("blood_pressure");

  const loadTimelineData = async () => {
    setTimelineLoading(true);
    try {
      const res = await patientApi.getHealthTimeline();
      setTimelineData(res);
    } catch {
      // Handled
    } finally {
      setTimelineLoading(false);
    }
  };

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

  const loadFollowUpThread = async () => {
    try {
      const apts = await patientApi.appointments().catch(() => []);
      if (!Array.isArray(apts) || apts.length === 0) return;
      const sorted = [...apts].sort(
        (a, b) => new Date(b.starts_at) - new Date(a.starts_at),
      );
      for (const apt of sorted) {
        try {
          const thread = await patientApi.getFollowUpThread(apt.id);
          if (thread) {
            setActiveFollowUp(thread);
            break;
          }
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  };

  const handleSendFollowUp = async (e) => {
    e.preventDefault();
    if (!followUpInput.trim() || !activeFollowUp?.appointment_id || sendingFollowUp) return;
    setSendingFollowUp(true);
    setFollowUpError("");
    try {
      const sent = await patientApi.sendFollowUpMessage(
        activeFollowUp.appointment_id,
        followUpInput.trim(),
      );
      setActiveFollowUp((prev) => ({
        ...prev,
        messages: [...(prev?.messages || []), sent],
      }));
      setFollowUpInput("");
    } catch (err) {
      setFollowUpError(err.message || "Unable to send follow-up message.");
    } finally {
      setSendingFollowUp(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      loadTimelineData(),
      loadFollowUpData(),
      loadBpReadings(),
      loadFollowUpThread(),
    ]).finally(() => setLoading(false));
  }, []);

  const isSavingRef = useRef(false);

  const handleSaveReading = async (e) => {
    e.preventDefault();
    if (!systolic || !diastolic || isSavingRef.current) return;

    isSavingRef.current = true;
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
      isSavingRef.current = false;
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
    <div className="w-full space-y-6 font-sans text-[#162623]">
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

     {/* Compact Heading Banner matching Portal Brand System */}
      <div className="rounded-2xl bg-gradient-to-r from-[#25836F] via-[#1F6E5E] to-[#185A4D] text-white px-6 py-5 sm:px-8 sm:py-6 shadow-sm border border-[#185A4D]/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase text-[#F0F5F7]/85">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A3E2D4]" />
            Continuous Care &amp; Health Monitoring
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Follow-up Care
          </h1>
          <p className="text-xs sm:text-sm text-[#F0F5F7]/90 max-w-2xl leading-relaxed">
            {followUpPlan
              ? `Your personalized follow-up care plan from ${followUpPlan.doctor_name || "your clinician"}.`
              : "Track your recovery milestones, vitals history, and ongoing treatment routines."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0 self-start sm:self-center">
          <button
            type="button"
            onClick={() => onNavigate && onNavigate("summaries")}
            className="px-4 py-2 rounded-xl font-semibold text-xs bg-white text-[#185A4D] hover:bg-[#F0F5F7] shadow-xs transition cursor-pointer"
          >
            View Consultation Summary
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("tasks")}
            className="px-4 py-2 rounded-xl font-semibold text-xs bg-white text-[#185A4D] hover:bg-[#F0F5F7] shadow-xs transition cursor-pointer flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base !text-[#185A4D]">add_circle</span>
            <span>Log Check-in</span>
          </button>
          <button
            type="button"
            onClick={() => onNavigate && onNavigate("find-doctors")}
            className="px-4 py-2 rounded-xl font-semibold text-xs bg-white text-[#185A4D] hover:bg-[#F0F5F7] shadow-xs transition cursor-pointer"
          >
            Book Appointment
          </button>
        </div>
      </div>

      {/* Navigation Tabs: Chrono-Care Journey vs Care Tasks */}
      <div className="flex border-b border-[#577877]/20 gap-2 sm:gap-6 text-xs sm:text-sm font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("timeline")}
          className={`pb-3.5 flex items-center gap-2 cursor-pointer transition relative ${
            activeTab === "timeline"
              ? "text-[#25836F] font-bold border-b-2 border-[#25836F]"
              : "text-[#577877] hover:text-[#162623]"
          }`}
        >
          <span className="material-symbols-outlined text-lg">timeline</span>
          <span>Chrono-Care Journey &amp; Health Trends</span>
          {timelineData?.total_events > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-[#E8F3F3] text-[#25836F] font-bold">
              {timelineData.total_events}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("tasks")}
          className={`pb-3.5 flex items-center gap-2 cursor-pointer transition relative ${
            activeTab === "tasks"
              ? "text-[#25836F] font-bold border-b-2 border-[#25836F]"
              : "text-[#577877] hover:text-[#162623]"
          }`}
        >
          <span className="material-symbols-outlined text-lg">task_alt</span>
          <span>Care Tasks, Chat &amp; BP Log</span>
          {tasks.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-100 text-slate-700 font-bold">
              {tasks.length}
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: Chrono-Care Journey & Longitudinal Health Trends (F-04) */}
      {activeTab === "timeline" && (
        <div className="space-y-6">
          {/* Top Quick Vitals & Longitudinal Metrics Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-[#577877]/15 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs text-[#577877]">
                <span className="font-medium">Total Care Events</span>
                <span className="material-symbols-outlined text-[#25836F] text-base">history_edu</span>
              </div>
              <div className="text-2xl font-bold text-[#162623]">
                {timelineLoading ? "..." : (timelineData?.total_events || 0)}
              </div>
              <p className="text-[11px] text-[#577877]">
                Across visits, prescriptions, labs &amp; summaries
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#577877]/15 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs text-[#577877]">
                <span className="font-medium">Latest Blood Pressure</span>
                <span className="material-symbols-outlined text-rose-500 text-base">cardiology</span>
              </div>
              <div className="text-2xl font-bold text-[#162623]">
                {latestReading
                  ? `${latestReading.systolic}/${latestReading.diastolic} mmHg`
                  : "-- / -- mmHg"}
              </div>
              <p className="text-[11px] text-[#577877]">
                {latestReading ? `Logged ${latestReading.date}` : "No BP entries recorded"}
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#577877]/15 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs text-[#577877]">
                <span className="font-medium">Resting Heart Rate</span>
                <span className="material-symbols-outlined text-teal-600 text-base">favorite</span>
              </div>
              <div className="text-2xl font-bold text-[#162623]">
                {latestReading?.pulse ? `${latestReading.pulse} bpm` : "72 bpm (Normal)"}
              </div>
              <p className="text-[11px] text-[#577877]">
                Normal resting reference: 60-100 bpm
              </p>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-[#577877]/15 shadow-2xs space-y-2">
              <div className="flex items-center justify-between text-xs text-[#577877]">
                <span className="font-medium">Care Continuum Status</span>
                <span className="material-symbols-outlined text-emerald-600 text-base">verified</span>
              </div>
              <div className="text-2xl font-bold text-emerald-700">
                Active
              </div>
              <p className="text-[11px] text-[#577877]">
                Continuous longitudinal tracking enabled
              </p>
            </div>
          </div>

          {/* Longitudinal Health Trend Visualizer */}
          <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-xs space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#162623] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#25836F]">monitoring</span>
                  <span>Longitudinal Health Trend Visualizer</span>
                </h2>
                <p className="text-xs text-[#577877] mt-0.5">
                  Multi-metric clinical progression analysis across time
                </p>
              </div>

              {/* Metric Selector Buttons */}
              <div className="flex flex-wrap gap-1.5 p-1 bg-[#F0F5F7] rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveMetric("blood_pressure")}
                  className={`px-3 py-1.5 rounded-lg cursor-pointer transition ${
                    activeMetric === "blood_pressure"
                      ? "bg-white text-[#25836F] shadow-xs font-bold"
                      : "text-[#577877] hover:text-[#162623]"
                  }`}
                >
                  Blood Pressure
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMetric("blood_glucose")}
                  className={`px-3 py-1.5 rounded-lg cursor-pointer transition ${
                    activeMetric === "blood_glucose"
                      ? "bg-white text-[#25836F] shadow-xs font-bold"
                      : "text-[#577877] hover:text-[#162623]"
                  }`}
                >
                  Blood Glucose
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMetric("pulse_heart_rate")}
                  className={`px-3 py-1.5 rounded-lg cursor-pointer transition ${
                    activeMetric === "pulse_heart_rate"
                      ? "bg-white text-[#25836F] shadow-xs font-bold"
                      : "text-[#577877] hover:text-[#162623]"
                  }`}
                >
                  Pulse Rate
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMetric("body_weight")}
                  className={`px-3 py-1.5 rounded-lg cursor-pointer transition ${
                    activeMetric === "body_weight"
                      ? "bg-white text-[#25836F] shadow-xs font-bold"
                      : "text-[#577877] hover:text-[#162623]"
                  }`}
                >
                  Weight
                </button>
              </div>
            </div>

            {/* Dynamic Trend Plot Area */}
            {activeMetric === "blood_pressure" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5 text-xs text-[#25836F] font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-[#25836F]" />
                      Systolic (Target &lt; 120 mmHg)
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-sky-600 font-bold">
                      <span className="w-2.5 h-2.5 rounded-full bg-sky-500" />
                      Diastolic (Target &lt; 80 mmHg)
                    </span>
                  </div>
                  <span className="text-[#577877] text-xs font-medium">
                    {readings.length} data point{readings.length !== 1 ? "s" : ""}
                  </span>
                </div>

                {readings.length < 2 ? (
                  <div className="p-8 text-center text-[#577877] text-xs font-medium bg-[#F8FAFB] rounded-xl border border-dashed border-[#577877]/20 space-y-1">
                    <p className="font-semibold text-[#162623]">
                      {readings.length === 1 ? "1 reading recorded." : "No blood pressure records available."}
                    </p>
                    <p>Log multiple BP readings in the 'Care Tasks &amp; BP Log' tab to generate multi-point progression curves.</p>
                  </div>
                ) : (
                  <div className="w-full pt-4 pb-2 bg-[#FAFDFD] rounded-xl border border-[#25836F]/10 p-4">
                    <svg viewBox="0 0 500 130" className="w-full h-36 overflow-visible" preserveAspectRatio="none">
                      {/* Normal target zone background band */}
                      <rect x="0" y="45" width="500" height="40" fill="#25836F" fillOpacity="0.06" rx="4" />
                      <line x1="0" y1="25" x2="500" y2="25" stroke="#577877" strokeOpacity="0.12" strokeDasharray="4 4" />
                      <line x1="0" y1="65" x2="500" y2="65" stroke="#577877" strokeOpacity="0.12" strokeDasharray="4 4" />
                      <line x1="0" y1="105" x2="500" y2="105" stroke="#577877" strokeOpacity="0.12" strokeDasharray="4 4" />

                      {/* Systolic curve */}
                      <path
                        d={`M ${getChartPoints()}`}
                        fill="none"
                        stroke="#25836F"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Diastolic curve */}
                      <path
                        d={`M ${readings.map((r, idx) => {
                          const x = (idx / (readings.length - 1)) * 480 + 10;
                          const minDia = 40;
                          const maxDia = 130;
                          const norm = (r.diastolic - minDia) / (maxDia - minDia);
                          const y = 130 - Math.max(0, Math.min(1, norm)) * 105 - 12;
                          return `${x.toFixed(1)},${y.toFixed(1)}`;
                        }).join(" L ")}`}
                        fill="none"
                        stroke="#38BDF8"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />

                      {readings.map((r, idx) => {
                        const x = (idx / (readings.length - 1)) * 480 + 10;
                        const minSys = 90;
                        const maxSys = 180;
                        const normSys = (r.systolic - minSys) / (maxSys - minSys);
                        const ySys = 130 - Math.max(0, Math.min(1, normSys)) * 105 - 12;
                        return (
                          <g key={`pt-${r.id || idx}`}>
                            <circle cx={x.toFixed(1)} cy={ySys.toFixed(1)} r="4" fill="#25836F" />
                          </g>
                        );
                      })}
                    </svg>
                    <div className="flex items-center justify-between text-[11px] text-[#577877] mt-3">
                      <span>Baseline: {readings[0].date} ({readings[0].systolic}/{readings[0].diastolic} mmHg)</span>
                      <span>Latest: {latestReading?.date} ({latestReading?.systolic}/{latestReading?.diastolic} mmHg)</span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeMetric === "blood_glucose" && (
              <div className="p-8 text-center text-[#577877] text-xs font-medium bg-[#F8FAFB] rounded-xl border border-dashed border-[#577877]/20 space-y-2">
                <span className="material-symbols-outlined text-3xl text-amber-500">water_drop</span>
                <p className="font-bold text-[#162623]">Blood Glucose Trajectory</p>
                <p className="max-w-md mx-auto">
                  Reference range: 70 - 99 mg/dL (Fasting), &lt; 140 mg/dL (Post-Prandial). Glucose readings captured during your consultations and diagnostic panels are aggregated here.
                </p>
              </div>
            )}

            {activeMetric === "pulse_heart_rate" && (
              <div className="p-8 text-center text-[#577877] text-xs font-medium bg-[#F8FAFB] rounded-xl border border-dashed border-[#577877]/20 space-y-2">
                <span className="material-symbols-outlined text-3xl text-rose-500">favorite</span>
                <p className="font-bold text-[#162623]">Heart Rate / Pulse Stability</p>
                <p className="max-w-md mx-auto">
                  Resting cardiac rate recorded across visits: {latestReading?.pulse ? `${latestReading.pulse} bpm` : "72 bpm"}. Healthy physiological baseline: 60 - 100 bpm.
                </p>
              </div>
            )}

            {activeMetric === "body_weight" && (
              <div className="p-8 text-center text-[#577877] text-xs font-medium bg-[#F8FAFB] rounded-xl border border-dashed border-[#577877]/20 space-y-2">
                <span className="material-symbols-outlined text-3xl text-sky-500">scale</span>
                <p className="font-bold text-[#162623]">Weight &amp; BMI Progression</p>
                <p className="max-w-md mx-auto">
                  Weight records logged in clinical intakes and check-ins plot here to monitor therapeutic response and metabolic stability.
                </p>
              </div>
            )}
          </div>

          {/* Chrono-Care Timeline Stream */}
          <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-xs space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-[#577877]/10 pb-4">
              <div>
                <h2 className="text-base sm:text-lg font-bold text-[#162623] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#25836F]">format_list_bulleted</span>
                  <span>Unified Chrono-Care Event Stream</span>
                </h2>
                <p className="text-xs text-[#577877] mt-0.5">
                  Complete chronological journey across all clinical interactions
                </p>
              </div>

              {/* Event Filter Chips */}
              <div className="flex flex-wrap gap-1.5 text-xs">
                {[
                  { key: "all", label: "All Events" },
                  { key: "appointment", label: "Consultations" },
                  { key: "prescription", label: "Prescriptions" },
                  { key: "clinical_summary", label: "Summaries" },
                  { key: "diagnostic_record", label: "Lab Records" },
                  { key: "vital_reading", label: "Vitals" },
                ].map((chip) => (
                  <button
                    key={chip.key}
                    type="button"
                    onClick={() => setTimelineFilter(chip.key)}
                    className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition ${
                      timelineFilter === chip.key
                        ? "bg-[#25836F] text-white"
                        : "bg-[#F0F5F7] text-[#577877] hover:text-[#162623]"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeline Stream Listing */}
            {timelineLoading ? (
              <div className="py-12 text-center text-xs text-[#577877] space-y-2">
                <span className="material-symbols-outlined animate-spin text-2xl text-[#25836F]">sync</span>
                <p>Loading chronological health journey…</p>
              </div>
            ) : !timelineData?.events || timelineData.events.length === 0 ? (
              <div className="py-12 text-center text-xs text-[#577877] space-y-2">
                <span className="material-symbols-outlined text-3xl text-[#25836F]">timeline</span>
                <p className="font-bold text-[#162623]">No chronological events found.</p>
                <p>As you attend appointments, receive prescriptions, and log vitals, your longitudinal care journey will appear here.</p>
              </div>
            ) : (
              <div className="space-y-4 relative before:absolute before:inset-0 before:left-5 before:w-0.5 before:bg-[#577877]/15">
                {timelineData.events
                  .filter((ev) => timelineFilter === "all" || ev.event_type === timelineFilter)
                  .map((ev) => {
                    const dt = new Date(ev.timestamp);
                    const formattedDate = dt.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });
                    const formattedTime = dt.toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    });

                    // Icon and styling mapping
                    let iconName = "event";
                    let iconBg = "bg-teal-50 text-[#25836F] border-teal-200";
                    if (ev.event_type === "prescription") {
                      iconName = "prescriptions";
                      iconBg = "bg-emerald-50 text-emerald-700 border-emerald-200";
                    } else if (ev.event_type === "clinical_summary") {
                      iconName = "clinical_notes";
                      iconBg = "bg-sky-50 text-sky-700 border-sky-200";
                    } else if (ev.event_type === "diagnostic_record") {
                      iconName = "biomedical";
                      iconBg = "bg-amber-50 text-amber-700 border-amber-200";
                    } else if (ev.event_type === "vital_reading") {
                      iconName = "cardiology";
                      iconBg = "bg-rose-50 text-rose-700 border-rose-200";
                    }

                    return (
                      <div key={ev.id} className="relative flex items-start gap-4 pl-1">
                        {/* Event marker icon */}
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 border shadow-xs z-10 ${iconBg}`}>
                          <span className="material-symbols-outlined text-lg">{iconName}</span>
                        </div>

                        {/* Event Content Card */}
                        <div className="flex-1 bg-white p-4 sm:p-5 rounded-2xl border border-[#577877]/15 shadow-2xs space-y-2.5">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-[#162623] text-sm sm:text-base">
                                {ev.title}
                              </span>
                              {ev.doctor_name && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#E8F3F3] text-[#25836F]">
                                  <span className="material-symbols-outlined text-xs">stethoscope</span>
                                  {ev.doctor_name} {ev.specialty ? `· ${ev.specialty}` : ""}
                                </span>
                              )}
                              {ev.severity_badge && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                                  {ev.severity_badge}
                                </span>
                              )}
                            </div>
                            <span className="text-[#577877] text-[11px] font-medium shrink-0">
                              {formattedDate} at {formattedTime}
                            </span>
                          </div>

                          <p className="text-xs text-[#577877] leading-relaxed">
                            {ev.subtitle}
                          </p>

                          {/* Specific metadata details */}
                          {ev.details && Object.keys(ev.details).length > 0 && (
                            <div className="p-3 bg-[#FAFDFD] rounded-xl border border-[#577877]/10 text-xs space-y-1.5">
                              {ev.details.diagnosis && (
                                <p className="text-[#162623] font-semibold">
                                  Diagnosis: <span className="font-normal text-[#577877]">{ev.details.diagnosis}</span>
                                </p>
                              )}
                              {Array.isArray(ev.details.medications) && ev.details.medications.length > 0 && (
                                <div className="space-y-1">
                                  <span className="text-[11px] font-bold text-[#162623] block">Prescribed Medicines:</span>
                                  <div className="flex flex-wrap gap-1.5">
                                    {ev.details.medications.map((m, idx) => (
                                      <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-[#25836F]/20 text-[11px] text-[#25836F] font-semibold shadow-2xs">
                                        <span className="material-symbols-outlined text-xs">medication</span>
                                        {m.name || m} ({m.dosage || "As directed"})
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {ev.details.systolic && ev.details.diastolic && (
                                <p className="text-[#162623] font-semibold">
                                  Vitals Logged: <span className="font-normal text-[#577877]">{ev.details.systolic} / {ev.details.diastolic} mmHg {ev.details.pulse ? `· ${ev.details.pulse} bpm` : ""}</span>
                                </p>
                              )}
                            </div>
                          )}

                          {/* Tags */}
                          {Array.isArray(ev.tags) && ev.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {ev.tags.map((t, idx) => (
                                <span key={idx} className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-[#F0F5F7] text-[#577877]">
                                  #{t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: Care Tasks, Follow-up Chat & BP Log (Existing Core Workflow) */}
      {activeTab === "tasks" && (
        <>
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
            {/* 72-Hour Post-Consultation Doctor Window */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-[#577877]/15 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#25836F] text-lg">forum</span>
                    <h2 className="text-base font-bold text-[#162623]">
                      72-Hour Post-Consultation Care Window
                    </h2>
                  </div>
                  <p className="text-xs text-[#577877] mt-0.5">
                    {activeFollowUp?.doctor_name
                      ? `Attending: ${activeFollowUp.doctor_name} (${activeFollowUp.doctor_specialty || "Specialist"})`
                      : "Direct query thread with your doctor following any completed visit."}
                  </p>
                </div>

                {activeFollowUp?.eligible ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                    Active · {activeFollowUp.hours_remaining} hrs left
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#F0F5F7] text-[#577877] text-xs font-semibold">
                    <span className="material-symbols-outlined text-xs">schedule</span>
                    72-Hr Policy Active
                  </span>
                )}
              </div>

              {activeFollowUp?.eligible ? (
                <div className="space-y-3">
                  <div className="max-h-60 overflow-y-auto space-y-2 p-3 rounded-xl bg-[#F0F5F7] border border-[#577877]/15">
                    {activeFollowUp.messages?.length > 0 ? (
                      activeFollowUp.messages.map((m) => (
                        <div
                          key={m.id}
                          className={`p-3 rounded-xl text-xs space-y-1 ${
                            m.sender_role === "patient"
                              ? "bg-[#25836F] text-white ml-6"
                              : "bg-white text-[#162623] mr-6 border border-[#577877]/20"
                          }`}
                        >
                          <div className="flex justify-between text-[10px] opacity-75 font-semibold">
                            <span>{m.sender_name} ({m.sender_role === "patient" ? "You" : "Doctor"})</span>
                            <span>
                              {m.created_at
                                ? new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                : ""}
                            </span>
                          </div>
                          <p className="leading-relaxed">{m.message}</p>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-6 text-xs text-[#577877] space-y-1">
                        <span className="material-symbols-outlined text-2xl text-[#25836F]">chat</span>
                        <p className="font-semibold text-[#162623]">No follow-up questions sent yet.</p>
                        <p>Have doubts about your prescription, dosage, or recovery symptoms? Message your doctor below.</p>
                      </div>
                    )}
                  </div>

                  {followUpError && (
                    <div className="text-xs text-red-600 font-semibold p-2 rounded-lg bg-red-50 border border-red-200">
                      {followUpError}
                    </div>
                  )}

                  <form onSubmit={handleSendFollowUp} className="flex gap-2">
                    <input
                      type="text"
                      value={followUpInput}
                      onChange={(e) => setFollowUpInput(e.target.value)}
                      placeholder="Ask a follow-up question about your treatment…"
                      className="flex-1 px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs text-[#162623] focus:border-[#25836F] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={sendingFollowUp || !followUpInput.trim()}
                      className="btn-primary !px-4 text-xs font-semibold cursor-pointer disabled:opacity-50 flex items-center gap-1"
                    >
                      <span>{sendingFollowUp ? "Sending..." : "Send"}</span>
                      <span className="material-symbols-outlined text-sm">send</span>
                    </button>
                  </form>
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 flex items-start gap-3 text-xs text-[#577877]">
                  <span className="material-symbols-outlined text-[#25836F] text-xl shrink-0 mt-0.5">verified_user</span>
                  <div className="space-y-1">
                    <p className="font-bold text-[#162623]">Zero-Cost Post-Consultation Window</p>
                    <p className="leading-relaxed">
                      Every completed teleconsultation automatically unlocks 72 hours of free follow-up messaging with your clinician to clarify prescriptions, discuss laboratory findings, or report mild medication reactions.
                    </p>
                  </div>
                </div>
              )}
            </div>

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
        </>
      )}
    </div>
  );
}
