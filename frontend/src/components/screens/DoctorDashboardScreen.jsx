import { useEffect, useState } from 'react';
import { doctorApi } from '../../lib/api';

export default function DoctorDashboardScreen({ onNavigate }) {
  const [state, setState] = useState('loading');
  const [dashboard, setDashboard] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([doctorApi.dashboard(), doctorApi.appointments()])
      .then(([summary, items]) => { setDashboard(summary); setAppointments(Array.isArray(items) ? items : []); setState('ready'); })
      .catch((err) => { setError(err.message || 'Unable to load doctor dashboard.'); setState('error'); });
  }, []);

  if (state === 'loading') return <div className="min-h-[70vh] flex items-center justify-center text-[#577877]">Loading clinician workspace…</div>;
  if (state === 'error') return <div className="m-8 rounded-2xl bg-white border border-red-200 p-6 text-red-700">{error}</div>;

  const cards = [
    ['Today', dashboard?.today ?? 0], ['Upcoming', dashboard?.upcoming ?? 0],
    ['Completed', dashboard?.completed ?? 0], ['Pending notes', dashboard?.pending_notes ?? 0],
  ];
  return <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10">
    <div className="mx-auto max-w-7xl space-y-6">
      <div><p className="text-xs uppercase tracking-wider text-[#577877]">Clinician workspace</p><h1 className="text-3xl font-bold text-[#162623]">Doctor dashboard</h1></div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{cards.map(([label, value]) => <div key={label} className="rounded-2xl bg-white border border-[#577877]/15 p-5"><p className="text-3xl font-bold text-[#162623]">{value}</p><p className="text-xs text-[#577877]">{label}</p></div>)}</div>
      <div className="rounded-2xl bg-white border border-[#577877]/15 p-6"><div className="flex items-center justify-between mb-4"><h2 className="font-bold text-[#162623]">Appointments</h2><button type="button" onClick={() => onNavigate('doctor-appointments')} className="text-xs font-semibold text-[#295255]">View all</button></div>
        {appointments.length === 0 ? <p className="text-sm text-[#577877]">No appointments assigned.</p> : <div className="space-y-3">{appointments.slice(0, 8).map((item) => <div key={item.id} className="flex justify-between border-t border-[#577877]/10 pt-3 text-sm"><span className="text-[#162623]">{new Date(item.starts_at).toLocaleString()}</span><span className="text-[#577877]">{item.status}</span></div>)}</div>}
      </div>
    </div>
  </div>;
}
