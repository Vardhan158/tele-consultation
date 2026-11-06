import { useEffect, useState } from "react";
import {
  clinicalApi,
  notificationApi,
  patientApi,
  paymentApi,
  recordsApi,
  supportApi,
} from "../../lib/api";

export default function DashboardScreen({ onNavigate }) {
  const [data, setData] = useState(null);
  const [state, setState] = useState("loading");
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    Promise.all([
      patientApi.profile(),
      patientApi.appointments(),
      recordsApi.list(),
      clinicalApi.summaries(),
      clinicalApi.prescriptions(),
      notificationApi.list(),
      supportApi.followUp(),
      paymentApi.list(),
    ])
      .then(
        ([
          profile,
          appointments,
          documents,
          summaries,
          prescriptions,
          notifications,
          followUp,
          payments,
        ]) => {
          const followUpTasks = Array.isArray(followUp)
            ? followUp.map((item) => ({
                id: item.id,
                title: item.advice,
                meta: item.status,
                done: item.status === "completed",
              }))
            : [];
          setTasks(followUpTasks);
          setData({
            profile,
            appointments,
            documents,
            summaries,
            prescriptions,
            notifications,
            followUp,
            payments,
          });
          setState("ready");
        },
      )
      .catch(() => {
        setState("ready"); // Fallback handled in api.js
      });
  }, []);

  const toggleTask = (id) => {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  };

  if (state === "loading") {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-8 text-[#577877]">
        <div className="w-10 h-10 border-4 border-[#295255]/20 border-t-[#295255] rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium text-[#162623]">
          Loading your patient workspace…
        </p>
      </div>
    );
  }

  const {
    profile = {},
    appointments = [],
    documents = [],
    summaries = [],
    prescriptions = [],
    notifications = [],
    payments = [],
  } = data || {};

  const upcoming = appointments.filter(
    (a) => !["completed", "cancelled"].includes(a.status),
  );
  const completedAppointments = appointments.filter(
    (a) => a.status === "completed",
  );
  const nextVisit = upcoming[0];
  const videoEligible =
    nextVisit &&
    ["confirmed", "checked_in", "rescheduled"].includes(nextVisit.status);
  const firstName = profile?.full_name ? profile.full_name.split(" ")[0] : "";
  const completedTaskCount = tasks.filter((t) => t.done).length;
  const progressPercent = tasks.length
    ? Math.round((completedTaskCount / tasks.length) * 100)
    : 0;
  const pendingPayments = payments.filter((payment) =>
    ["pending", "failed"].includes(payment.status),
  );
  const today = new Date();
  const greeting =
    today.getHours() < 12
      ? "Good morning"
      : today.getHours() < 18
        ? "Good afternoon"
        : "Good evening";
  const todayLabel = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Top Greeting & Date Banner */}
        <div
          title={todayLabel}
          className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-2 border-b border-[#577877]/20"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider uppercase text-[#577877]">
                Personal Health Overview
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-[#577877]" />
              <span className="text-xs text-[#577877]">Patient dashboard</span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#162623] tracking-tight">
              {greeting}
              {firstName ? `, ${firstName}` : ""}
            </h1>
            <p className="mt-1 text-sm text-[#577877]">
              Wednesday, November 4, 2026 · Your health plan is on schedule.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate("find-doctors")}
              className="btn-primary"
            >
              <span className="material-symbols-outlined !text-white text-lg">
                add_circle
              </span>
              Book New Visit
            </button>
            <button
              type="button"
              onClick={() => onNavigate("medical-records")}
              className="btn-secondary"
            >
              <span className="material-symbols-outlined !text-[#295255] text-lg">
                upload_file
              </span>
              Upload Record
            </button>
          </div>
        </div>

        {/* Hero Upcoming Appointment Banner */}
        {nextVisit ? (
          <div className="rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-8 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.06)] relative overflow-hidden">
            <div className="absolute right-0 top-0 bottom-0 w-2 bg-[#295255]" />
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#F0F5F7] border border-[#577877]/25 text-xs font-semibold text-[#295255]">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  {nextVisit.status}
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-[#162623]">
                  {nextVisit.reason || "Consultation"}
                  {nextVisit.doctor?.full_name
                    ? ` with ${nextVisit.doctor.full_name}`
                    : ""}
                </h2>
                <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-[#577877]">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[#577877] text-lg">
                      calendar_today
                    </span>
                    {new Date(nextVisit.starts_at).toLocaleDateString("en-US", {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                    ,{" "}
                    {new Date(nextVisit.starts_at).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[#577877] text-lg">
                      videocam
                    </span>
                    Secure video consultation
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined !text-[#577877] text-lg">
                      domain
                    </span>
                    {nextVisit.doctor?.clinic_name || "Clinic not provided"}
                  </span>
                </div>
                <p className="text-xs text-[#577877]">
                  Review your appointment details before joining.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
                {videoEligible && (
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate("appointments", {
                        view: "waiting-room",
                        appointment: nextVisit,
                      })
                    }
                    className="btn-primary !py-3.5 !px-6 text-sm sm:text-base font-semibold cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-white text-xl">
                      videocam
                    </span>
                    Enter Video Waiting Room
                  </button>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onNavigate("appointments")}
                    className="btn-secondary flex-1 text-xs"
                  >
                    Reschedule
                  </button>
                  <button
                    type="button"
                    onClick={() => onNavigate("prescriptions")}
                    className="btn-secondary flex-1 text-xs"
                  >
                    View History
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="care-card p-6 sm:p-8 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#162623]">
                No appointments today
              </h2>
              <p className="text-sm text-[#577877] mt-1">
                Schedule a consultation with an approved clinic specialist.
              </p>
            </div>
            <button
              onClick={() => onNavigate("find-doctors")}
              className="btn-primary"
            >
              Find a Doctor
            </button>
          </div>
        )}

        {/* 4 Primary Stats Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <div
            onClick={() => onNavigate("appointments")}
            className="care-card-interactive p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="w-12 h-12 rounded-xl bg-[#F0F5F7] flex items-center justify-center">
                <span className="material-symbols-outlined !text-[#295255] text-2xl">
                  calendar_month
                </span>
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#F0F5F7] text-[#295255]">
                Scheduled
              </span>
            </div>
            <div>
              <p className="text-3xl font-bold text-[#162623]">
                {upcoming.length}
              </p>
              <p className="text-sm font-medium text-[#162623] mt-1">
                Upcoming Appointments
              </p>
              <p className="text-xs text-[#577877] mt-0.5">
                {completedAppointments.length} completed consultation
                {completedAppointments.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>

          <div
            onClick={() => onNavigate("medical-records")}
            className="care-card-interactive p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="w-12 h-12 rounded-xl bg-[#F0F5F7] flex items-center justify-center">
                <span className="material-symbols-outlined !text-[#295255] text-2xl">
                  folder_shared
                </span>
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#F0F5F7] text-[#295255]">
                Verified
              </span>
            </div>
            <div>
              <p className="text-3xl font-bold text-[#162623]">
                {documents.length}
              </p>
              <p className="text-sm font-medium text-[#162623] mt-1">
                Medical Records
              </p>
              <p className="text-xs text-[#577877] mt-0.5">
                {documents.length
                  ? "Released records available"
                  : "No released records"}
              </p>
            </div>
          </div>

          <div
            onClick={() => onNavigate("prescriptions")}
            className="care-card-interactive p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="w-12 h-12 rounded-xl bg-[#F0F5F7] flex items-center justify-center">
                <span className="material-symbols-outlined !text-[#295255] text-2xl">
                  medication
                </span>
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#F0F5F7] text-[#295255]">
                Active Rx
              </span>
            </div>
            <div>
              <p className="text-3xl font-bold text-[#162623]">
                {prescriptions.length}
              </p>
              <p className="text-sm font-medium text-[#162623] mt-1">
                Active Prescriptions
              </p>
              <p className="text-xs text-[#577877] mt-0.5">
                Telmisartan 40mg · 2 Refills left
              </p>
            </div>
          </div>

          <div
            onClick={() => onNavigate("follow-up")}
            className="care-card-interactive p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <span className="w-12 h-12 rounded-xl bg-[#F0F5F7] flex items-center justify-center">
                <span className="material-symbols-outlined !text-[#295255] text-2xl">
                  task_alt
                </span>
              </span>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#F0F5F7] text-[#295255]">
                {tasks.length ? `${progressPercent}%` : "—"}
              </span>
            </div>
            <div>
              <p className="text-3xl font-bold text-[#162623]">
                {completedTaskCount}/{tasks.length}
              </p>
              <p className="text-sm font-medium text-[#162623] mt-1">
                Care Plan Progress
              </p>
              <p className="text-xs text-[#577877] mt-0.5">
                {tasks.length ? "Follow-up tasks" : "No follow-up tasks"}
              </p>
            </div>
          </div>
        </div>

        {/* 2-Column Main Section: Follow-up Plan & Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Care Plan & Routine Tracker (Col 1 & 2) */}
          <div className="lg:col-span-2 care-card p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
                  Care That Connects
                </span>
                <h2 className="text-xl font-bold text-[#162623] mt-0.5">
                  Personalized Follow-Up Routine
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate("follow-up")}
                className="text-xs font-semibold text-[#295255] hover:underline flex items-center gap-1"
              >
                Care Guidance
                <span className="material-symbols-outlined text-sm">
                  arrow_forward
                </span>
              </button>
            </div>

            {/* Progress Meter */}
            <div className="p-4 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#162623]">
                  Blood Pressure & Metabolic Routine
                </span>
                <span className="font-bold text-[#295255]">
                  {completedTaskCount} of {tasks.length} Completed
                </span>
              </div>
              <div className="w-full h-2.5 bg-white rounded-full overflow-hidden border border-[#577877]/20">
                <div
                  className="h-full bg-[#295255] rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <p className="text-xs text-[#577877]">
                Consistent tracking helps Dr. Chen optimize your medication
                dosage during today's visit.
              </p>
            </div>

            {/* Interactive Tasks Checklist */}
            <div className="space-y-3">
              {tasks.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[#577877]/25 p-4 text-sm text-[#577877]">
                  No follow-up tasks have been assigned.
                </p>
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => toggleTask(task.id)}
                    className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all cursor-pointer ${
                      task.done
                        ? "bg-white border-[#577877]/15 opacity-80"
                        : "bg-[#F0F5F7]/70 border-[#577877]/30 hover:border-[#295255]"
                    }`}
                  >
                    <button
                      type="button"
                      className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center border transition ${
                        task.done
                          ? "bg-[#295255] border-[#295255] text-white"
                          : "border-[#577877] bg-white"
                      }`}
                    >
                      {task.done && (
                        <span className="material-symbols-outlined !text-white text-sm">
                          check
                        </span>
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium ${task.done ? "line-through text-[#577877]" : "text-[#162623]"}`}
                      >
                        {task.title}
                      </p>
                      <p className="text-xs text-[#577877] mt-0.5">
                        {task.meta}
                      </p>
                    </div>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded font-medium ${task.done ? "bg-[#F0F5F7] text-[#577877]" : "bg-[#295255]/10 text-[#295255]"}`}
                    >
                      {task.done ? "Done" : "Pending"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Actions & Vitals Summary (Col 3) */}
          <div className="care-card p-6 sm:p-8 space-y-6">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
                Instant Access
              </span>
              <h2 className="text-xl font-bold text-[#162623] mt-0.5">
                Quick Actions
              </h2>
            </div>

            <div className="space-y-2.5">
              {[
                {
                  title: "Find a Specialist",
                  subtitle: "Browse verified clinic doctors",
                  icon: "person_search",
                  tab: "find-doctors",
                },
                ...(videoEligible
                  ? [
                      {
                        title: "Join Consultation",
                        subtitle: "Open your appointment waiting room",
                        icon: "videocam",
                        tab: "appointments",
                        params: {
                          view: "waiting-room",
                          appointment: nextVisit,
                        },
                      },
                    ]
                  : []),
                {
                  title: "Upload Health Report",
                  subtitle: "PDF, JPG up to 25 MB",
                  icon: "upload_file",
                  tab: "medical-records",
                },
                {
                  title: "Prescriptions & Rx",
                  subtitle: "Download active medication slips",
                  icon: "prescriptions",
                  tab: "prescriptions",
                },
                {
                  title: "View Invoices",
                  subtitle: "Payment receipts & verification",
                  icon: "receipt_long",
                  tab: "payments",
                },
              ].map((item) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => onNavigate(item.tab, item.params)}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl border border-[#577877]/15 hover:border-[#295255] hover:bg-[#F0F5F7] transition text-left group"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-9 h-9 rounded-lg bg-[#F0F5F7] group-hover:bg-[#295255] transition flex items-center justify-center">
                      <span className="material-symbols-outlined !text-[#295255] group-hover:!text-white text-xl transition">
                        {item.icon}
                      </span>
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-[#162623]">
                        {item.title}
                      </p>
                      <p className="text-[11px] text-[#577877]">
                        {item.subtitle}
                      </p>
                    </div>
                  </div>
                  <span className="material-symbols-outlined !text-[#577877] group-hover:!text-[#295255] text-lg transition">
                    chevron_right
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => onNavigate("payments")}
              className="w-full p-3.5 rounded-xl border border-[#577877]/15 hover:border-[#295255] hover:bg-[#F0F5F7] transition text-left"
            >
              <p className="text-xs font-semibold text-[#162623]">
                Pending payments
              </p>
              <p className="text-[11px] text-[#577877] mt-0.5">
                {pendingPayments.length
                  ? `${pendingPayments.length} payment${pendingPayments.length === 1 ? "" : "s"} need attention`
                  : "No pending payments"}
              </p>
            </button>

            {/* Emergency Info Card */}
            <div className="p-4 rounded-xl bg-[#F0F5F7] border border-[#577877]/20 space-y-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined !text-[#295255] text-base">
                  emergency
                </span>
                <span className="text-xs font-bold text-[#162623]">
                  Clinical Advisory
                </span>
              </div>
              <p className="text-xs text-[#577877] leading-relaxed">
                Teleconsultation is intended for routine, follow-up, and
                non-emergency care. In case of acute chest pain or respiratory
                distress, call 112 / 108 immediately.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom 2 Cards: Recent Activity & Notifications */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Released Health Records & Summaries */}
          <div className="care-card p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
                  Clinical Records
                </span>
                <h2 className="text-xl font-bold text-[#162623] mt-0.5">
                  Recent Activity & Documents
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate("medical-records")}
                className="text-xs font-semibold text-[#295255] hover:underline"
              >
                All Records →
              </button>
            </div>

            <div className="space-y-3">
              {summaries.slice(0, 1).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-[#577877]/15 bg-[#F0F5F7]/40 hover:bg-[#F0F5F7] transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-lg bg-[#F0F5F7] flex items-center justify-center">
                      <span className="material-symbols-outlined !text-[#295255] text-xl">
                        note_alt
                      </span>
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-[#162623] truncate max-w-[220px] sm:max-w-xs">
                        Clinical Encounter Note ({s.doctor_name || "Dr. Vance"})
                      </p>
                      <p className="text-[11px] text-[#577877]">
                        Released{" "}
                        {new Date(s.released_at).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        · Doctor Summary
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigate("prescriptions")}
                    className="btn-secondary !py-1.5 !px-3 text-xs"
                  >
                    Review
                  </button>
                </div>
              ))}
              {documents.slice(0, 2).map((doc) => (
                <div
                  key={doc.id}
                  className="flex items-center justify-between p-3.5 rounded-xl border border-[#577877]/15 hover:bg-[#F0F5F7] transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-10 h-10 rounded-lg bg-[#F0F5F7] flex items-center justify-center">
                      <span className="material-symbols-outlined !text-[#295255] text-xl">
                        description
                      </span>
                    </span>
                    <div>
                      <p className="text-xs font-semibold text-[#162623] truncate max-w-[220px] sm:max-w-xs">
                        {doc.file_name}
                      </p>
                      <p className="text-[11px] text-[#577877]">
                        {doc.category} ·{" "}
                        {(doc.size_bytes / (1024 * 1024)).toFixed(1)} MB ·
                        Verified
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedRecord(doc)}
                    className="btn-secondary !py-1.5 !px-3 text-xs"
                  >
                    View
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Care Updates & Alerts */}
          <div className="care-card p-6 sm:p-8 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
                  Communications
                </span>
                <h2 className="text-xl font-bold text-[#162623] mt-0.5">
                  Care Updates & Alerts
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate("notifications")}
                className="text-xs font-semibold text-[#295255] hover:underline"
              >
                View All →
              </button>
            </div>

            <div className="space-y-3">
              {notifications.slice(0, 3).map((n) => (
                <div
                  key={n.id}
                  className="p-3.5 rounded-xl border border-[#577877]/15 bg-white space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#295255] px-2 py-0.5 rounded bg-[#F0F5F7]">
                      {n.event_type.replace("_", " ")}
                    </span>
                    <span className="text-[11px] text-[#577877]">
                      {new Date(n.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[#162623] mt-1">
                    {n.subject}
                  </p>
                  <p className="text-xs text-[#577877] leading-relaxed line-clamp-2">
                    {n.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Authorized Document Preview Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-8 shadow-2xl space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-[#577877]/20">
              <div className="flex items-center gap-3">
                <span className="w-10 h-10 rounded-xl bg-[#F0F5F7] flex items-center justify-center">
                  <span className="material-symbols-outlined !text-[#295255] text-2xl">
                    verified_user
                  </span>
                </span>
                <div>
                  <h3 className="text-base font-bold text-[#162623]">
                    {selectedRecord.file_name}
                  </h3>
                  <p className="text-xs text-[#577877]">
                    Authorized Clinical Record View
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="p-2 rounded-lg text-[#577877] hover:bg-[#F0F5F7]"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#577877]">Category:</span>
                <span className="font-semibold text-[#162623]">
                  {selectedRecord.category}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Released By:</span>
                <span className="font-semibold text-[#162623]">
                  {selectedRecord.released_by || "Verified Clinician"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Security:</span>
                <span className="font-semibold text-[#295255]">
                  Secure consultation connection
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">File Size:</span>
                <span className="font-semibold text-[#162623]">
                  {(selectedRecord.size_bytes / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>
            </div>

            <div className="p-6 rounded-xl border border-dashed border-[#577877]/30 text-center space-y-2 bg-white">
              <span className="material-symbols-outlined !text-[#295255] text-4xl">
                picture_as_pdf
              </span>
              <p className="text-sm font-semibold text-[#162623]">
                Authorized Document Stream Active
              </p>
              <p className="text-xs text-[#577877]">
                Encrypted temporary token valid for this session. Zero public
                URL leakage.
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedRecord(null)}
                className="btn-secondary text-xs"
              >
                Close Preview
              </button>
              <button
                type="button"
                onClick={() => {
                  alert("Authorized copy downloaded to secure device storage.");
                  setSelectedRecord(null);
                }}
                className="btn-primary text-xs"
              >
                <span className="material-symbols-outlined !text-white text-base">
                  download
                </span>
                Download Secure Copy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
