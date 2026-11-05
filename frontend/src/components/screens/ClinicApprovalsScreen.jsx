import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';

export default function ClinicApprovalsScreen() {
  const [items, setItems] = useState(null); const [error, setError] = useState('');
  const load = () => apiRequest('/doctor/pending').then(setItems).catch((err) => setError(err.message));
  useEffect(() => { load(); }, []);
  const decide = async (id, action) => { try { await apiRequest(`/doctor/${id}/${action}`, { method: 'POST' }); load(); } catch (err) { setError(err.message); } };
  return <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-5"><h1 className="text-3xl font-bold">Doctor approvals</h1><p className="text-sm text-[#577877]">Review credential submissions before enabling clinical access.</p>{error && <div className="rounded-xl bg-white border border-red-200 p-4 text-red-700">{error}</div>}{items?.length === 0 && <div className="rounded-2xl bg-white p-8 text-[#577877]">No pending doctor applications.</div>}<div className="space-y-3">{items?.map((item) => <div key={item.id} className="rounded-2xl bg-white border border-[#577877]/15 p-5 flex flex-wrap items-center justify-between gap-4"><div><p className="font-semibold">{item.full_name}</p><p className="text-sm text-[#577877]">{item.specialty} · {item.clinic_name}</p><p className="text-xs text-[#577877]">Registration: {item.registration_number}</p></div><div className="flex gap-2"><button className="btn-primary text-xs" type="button" onClick={() => decide(item.id, 'approve')}>Approve</button><button className="btn-secondary text-xs" type="button" onClick={() => decide(item.id, 'reject')}>Reject</button></div></div>)}</div></div>;
}
