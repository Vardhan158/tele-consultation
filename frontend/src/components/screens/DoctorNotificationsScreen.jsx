import { useEffect, useState } from "react";
import { doctorApi } from "../../lib/api";

const formatDate = (value) => (value ? new Date(value).toLocaleString() : "");

export default function DoctorNotificationsScreen() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    doctorApi.notifications()
      .then((items) => setNotifications(Array.isArray(items) ? items : []))
      .catch(() => setError("Unable to load notifications."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const markRead = async (id) => {
    await doctorApi.markNotificationRead(id);
    setNotifications((items) => items.map((item) => item.id === id ? { ...item, read_at: new Date().toISOString(), status: "read" } : item));
  };

  const markAll = async () => {
    await doctorApi.markAllNotificationsRead();
    setNotifications((items) => items.map((item) => ({ ...item, read_at: new Date().toISOString(), status: "read" })));
  };

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div><h1 className="text-2xl sm:text-3xl font-bold text-[#162623]">Notifications</h1><p className="mt-1 text-sm text-[#577877]">Appointment and consultation updates</p></div>
          <button type="button" onClick={markAll} disabled={!notifications.some((item) => !item.read_at && item.status !== "read")} className="border border-[#577877]/30 bg-white px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50">Mark all as read</button>
        </div>
        {error && <div className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {loading ? <div className="rounded-2xl bg-white p-8 text-sm text-[#577877]">Loading notifications…</div> : notifications.length === 0 ? <div className="rounded-2xl bg-white border border-[#577877]/15 p-12 text-center"><span className="material-symbols-outlined text-4xl text-[#577877]">notifications_off</span><p className="mt-3 font-semibold text-[#162623]">No notifications yet</p><p className="mt-1 text-sm text-[#577877]">Appointment updates and reminders will appear here.</p></div> : <div className="space-y-3">{notifications.map((item) => { const unread = !item.read_at && item.status !== "read"; return <article key={item.id} className={`rounded-2xl border p-5 ${unread ? "bg-[#EEF5FC] border-[#BFDBFE]" : "bg-white border-[#577877]/15"}`}><div className="flex items-start justify-between gap-4"><div><h2 className="font-bold text-[#162623]">{item.subject || item.title || "Appointment notification"}</h2><p className="mt-1 text-sm text-[#577877]">{item.body || item.description || ""}</p><p className="mt-2 text-xs text-[#577877]">{formatDate(item.created_at)}</p></div>{unread && <button type="button" onClick={() => markRead(item.id)} className="shrink-0 text-xs font-semibold text-[#25836F] hover:underline">Mark as read</button>}</div></article>; })}</div>}
      </div>
    </div>
  );
}
