import { useEffect, useState } from "react";
import { adminApi } from "../../../lib/api";
import { useToast } from "../../common/Toast";

const DEFAULT_APPOINTMENT_TYPES = [
  "First Consultation",
  "Follow-up Consultation",
  "Second Opinion",
  "Emergency Consultation",
  "Routine Checkup",
];

export default function ServiceFeeConfigTab() {
  const { showToast } = useToast();
  const [services, setServices] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [appointmentTypes, setAppointmentTypes] = useState(DEFAULT_APPOINTMENT_TYPES);
  const [loading, setLoading] = useState(true);
  const [editingService, setEditingService] = useState(null);
  const [form, setForm] = useState({
    id: "",
    name: "",
    specialty: "",
    duration_minutes: 30,
    currency: "INR",
    base_fee: 500,
    platform_fee: 50,
    active: true,
    effective_date: "2026-01-01",
    assigned_doctors: [],
    appointment_types: [],
  });
  const [saving, setSaving] = useState(false);
  const [doctorSearch, setDoctorSearch] = useState("");

  const loadServices = () => {
    setLoading(true);
    Promise.all([adminApi.services(), adminApi.doctors(), adminApi.settings()])
      .then(([serviceRes, doctorRes, settingsRes]) => {
        setServices(Array.isArray(serviceRes) ? serviceRes : []);
        setDoctors(
          Array.isArray(doctorRes)
            ? doctorRes.filter(
                (doctor) =>
                  doctor.active &&
                  (doctor.approval_status === "approved" || doctor.approved_for_consultation),
              )
            : [],
        );
        if (settingsRes?.appointment_types && Array.isArray(settingsRes.appointment_types)) {
          const parsed = settingsRes.appointment_types
            .map((item) => (typeof item === "string" ? item : item?.name || item?.label))
            .filter(Boolean);
          if (parsed.length > 0) {
            setAppointmentTypes([...new Set([...DEFAULT_APPOINTMENT_TYPES, ...parsed])]);
          }
        }
      })
      .catch((err) => {
        showToast(err.message || "Failed to load services.", "error");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadServices();
  }, []);

  const openNewService = () => {
    setDoctorSearch("");
    setForm({
      id: "",
      name: "",
      specialty: "",
      duration_minutes: 30,
      currency: "INR",
      base_fee: 500,
      platform_fee: 50,
      active: true,
      effective_date: new Date().toISOString().split("T")[0],
      assigned_doctors: doctors.length > 0 ? [doctors[0].id] : [],
      appointment_types: ["Follow-up Consultation"],
    });
    setEditingService({});
  };

  const openEditService = (srv) => {
    setDoctorSearch("");
    let parsedTypes = [];
    if (Array.isArray(srv.appointment_types)) {
      parsedTypes = srv.appointment_types.flatMap((item) =>
        typeof item === "string" ? item.split(",").map((s) => s.trim()) : [],
      ).filter(Boolean);
    }

    setForm({
      id: srv.id,
      name: srv.name,
      specialty: srv.specialty,
      duration_minutes: srv.duration_minutes || 30,
      currency: srv.currency || "INR",
      base_fee: srv.base_fee,
      platform_fee: srv.platform_fee,
      active: srv.active,
      effective_date: srv.effective_date || "2026-01-01",
      assigned_doctors: Array.isArray(srv.assigned_doctors) ? srv.assigned_doctors : [],
      appointment_types: parsedTypes.length > 0 ? [...new Set(parsedTypes)] : ["Follow-up Consultation"],
    });
    setEditingService(srv);
  };

  const toggleDoctor = (docId) => {
    setForm((curr) => {
      const exists = curr.assigned_doctors.includes(docId);
      const updated = exists
        ? curr.assigned_doctors.filter((id) => id !== docId)
        : [...curr.assigned_doctors, docId];
      return { ...curr, assigned_doctors: updated };
    });
  };

  const toggleAppointmentType = (typeName) => {
    setForm((curr) => {
      const exists = curr.appointment_types.includes(typeName);
      const updated = exists
        ? curr.appointment_types.filter((t) => t !== typeName)
        : [...curr.appointment_types, typeName];
      return { ...curr, appointment_types: updated };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.assigned_doctors || form.assigned_doctors.length === 0) {
      showToast("Please assign at least one clinician to this service.", "warning");
      return;
    }
    if (!form.appointment_types || form.appointment_types.length === 0) {
      showToast("Please select at least one applicable appointment type.", "warning");
      return;
    }

    setSaving(true);
    try {
      await adminApi.saveService({
        ...form,
        duration_minutes: Number(form.duration_minutes),
        base_fee: Number(form.base_fee),
        platform_fee: Number(form.platform_fee),
        assigned_doctors: form.assigned_doctors,
        appointment_types: form.appointment_types,
      });
      showToast("Service configuration & fees updated successfully.", "success");
      setEditingService(null);
      loadServices();
    } catch (err) {
      showToast(err.message || "Failed to save service.", "error");
    } finally {
      setSaving(false);
    }
  };

  const activeServicesCount = services.filter((s) => s.active).length;

  return (
    <div className="space-y-6 font-sans">
      {/* Premium Cinematic Animated SaaS Banner */}
      <div className="relative min-h-[220px] lg:min-h-[240px] overflow-hidden rounded-2xl bg-gradient-to-r from-[#162623] via-[#25836F] to-[#1d6e5d] p-6 sm:p-8 text-white shadow-xl border border-[rgba(87,120,119,0.25)] flex flex-col justify-between">
        {/* Soft Background Illumination Glow Orbs */}
        <div className="absolute -top-24 -left-24 h-64 w-64 rounded-full bg-[#577877]/30 blur-3xl animate-glow pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-teal-400/20 blur-3xl animate-glow pointer-events-none" />

        {/* Animated Light Waves Overlay */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          <div className="cinematic-wave cinematic-wave-one" />
          <div className="cinematic-wave cinematic-wave-two" />
        </div>

        {/* Continuous Floating Glass Particles */}
        <div className="cinematic-particle cinematic-particle-one" />
        <div className="cinematic-particle cinematic-particle-two" />
        <div className="cinematic-particle cinematic-particle-three" />
        <div className="cinematic-particle cinematic-particle-four" />
        <div className="cinematic-particle cinematic-particle-five" />

        {/* Main Banner Content */}
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-teal-100 backdrop-blur-md border border-white/15 shadow-inner">
              <span className="h-2 w-2 rounded-full bg-teal-400 animate-pulse"></span>
              SERVICE CONFIGURATION WORKSPACE
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-4xl drop-shadow-sm font-sans">
              Clinical Services & Pricing
            </h1>
            <p className="text-xs text-teal-100/90 sm:text-sm leading-relaxed max-w-xl">
              Configure consultation services, appointment durations, platform fees, and pricing policies.
            </p>
          </div>

          {/* Glassmorphism Live Active Services KPI Card & CTA Action Button */}
          <div className="relative z-10 flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end gap-3 shrink-0">
            {/* Active Services Live KPI Box */}
            <div className="relative flex items-center gap-3 rounded-2xl bg-white/10 p-3.5 backdrop-blur-md border border-white/20 shadow-lg min-w-[210px]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-400/20 text-teal-300 border border-teal-300/30">
                <span className="material-symbols-outlined text-xl">medical_services</span>
              </div>
              <div>
                <div className="text-xl font-extrabold text-white leading-tight">
                  {activeServicesCount}
                </div>
                <div className="text-[11px] font-semibold text-teal-200/90 uppercase tracking-wider">
                  Active Services
                </div>
              </div>
            </div>

            {/* Add New Clinical Service Button */}
            <button
              onClick={openNewService}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-bold text-[#25836F] shadow-md transition-all hover:bg-[#F0F5F7] hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
            >
              <span className="text-sm font-bold">+</span>
              <span>Add New Clinical Service</span>
            </button>
          </div>
        </div>
      </div>

      {/* Modal Popup Dialog for Add / Edit Clinical Service */}
      {editingService && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162623]/60 backdrop-blur-xs p-4">
          <div className="care-card max-h-[90vh] max-w-2xl w-full overflow-y-auto no-scrollbar p-6 space-y-4 shadow-2xl border border-[#25836F]/30">
            <div className="flex items-center justify-between border-b border-[#577877]/15 pb-3">
              <h3 className="text-base font-bold text-[#162623]">
                {form.id ? `Edit Clinical Service #${form.id}` : "Create New Clinical Service"}
              </h3>
              <button
                onClick={() => setEditingService(null)}
                className="text-xs font-semibold text-[#577877] hover:underline cursor-pointer"
              >
                Close ✕
              </button>
            </div>

            <form onSubmit={handleSave} className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-[#162623]">Service Name</label>
                <input
                  required
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Cardiology Follow-up"
                  className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs focus:border-[#25836F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#162623]">Specialty</label>
                <input
                  required
                  type="text"
                  value={form.specialty}
                  onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                  placeholder="e.g. Cardiology"
                  className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs focus:border-[#25836F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#162623]">Duration (Minutes)</label>
                <input
                  required
                  type="number"
                  min="10"
                  max="240"
                  value={form.duration_minutes}
                  onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs focus:border-[#25836F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#162623]">Currency</label>
                <select
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs bg-white focus:border-[#25836F] focus:outline-none"
                >
                  <option value="INR">INR (₹)</option>
                  <option value="USD">USD ($)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#162623]">Base Consultation Fee</label>
                <input
                  required
                  type="number"
                  min="0"
                  value={form.base_fee}
                  onChange={(e) => setForm({ ...form, base_fee: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs focus:border-[#25836F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#162623]">Platform Fee</label>
                <input
                  required
                  type="number"
                  min="0"
                  value={form.platform_fee}
                  onChange={(e) => setForm({ ...form, platform_fee: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs focus:border-[#25836F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#162623]">Effective Date</label>
                <input
                  required
                  type="date"
                  value={form.effective_date}
                  onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs focus:border-[#25836F] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#162623]">Status</label>
                <select
                  value={form.active ? "true" : "false"}
                  onChange={(e) => setForm({ ...form, active: e.target.value === "true" })}
                  className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs bg-white focus:border-[#25836F] focus:outline-none"
                >
                  <option value="true">Active & Available</option>
                  <option value="false">Inactive / Archived</option>
                </select>
              </div>

              {/* Multi-Select Assigned Doctors Component */}
              <div className="sm:col-span-2 rounded-xl border border-[#577877]/15 bg-[#F0F5F7]/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-[#162623]">
                    Assigned Clinicians <span className="text-red-600">*</span>
                  </label>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#25836F] text-white font-bold text-[10px]">
                    {form.assigned_doctors.length} Selected
                  </span>
                </div>
                <p className="text-[11px] text-[#577877]">
                  Assign active, approved clinicians to provide this service.
                </p>

                <input
                  type="search"
                  value={doctorSearch}
                  onChange={(e) => setDoctorSearch(e.target.value)}
                  placeholder="Search doctors by name or specialty..."
                  className="w-full rounded-xl border border-[#577877]/25 bg-white px-3 py-1.5 text-xs focus:border-[#25836F] focus:outline-none"
                />

                <div className="space-y-1.5 max-h-36 overflow-y-auto no-scrollbar p-1">
                  {doctors.length === 0 ? (
                    <div className="text-xs text-[#577877] p-2 text-center">No active clinicians available.</div>
                  ) : (
                    doctors
                      .filter((doctor) =>
                        `${doctor.full_name} ${doctor.specialty}`
                          .toLowerCase()
                          .includes(doctorSearch.toLowerCase()),
                      )
                      .map((doctor) => {
                        const isSelected = form.assigned_doctors.includes(doctor.id);
                        return (
                          <div
                            key={doctor.id}
                            onClick={() => toggleDoctor(doctor.id)}
                            className={`flex items-center justify-between p-2 rounded-xl cursor-pointer text-xs transition border ${
                              isSelected
                                ? "bg-[#25836F] text-white font-semibold border-[#162623] shadow-xs"
                                : "bg-white text-[#162623] border-[#577877]/20 hover:bg-[#F0F5F7]"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-4 h-4 rounded flex items-center justify-center text-[10px] shrink-0 ${
                                  isSelected
                                    ? "bg-white text-[#25836F] font-bold"
                                    : "border border-[#577877]/40 bg-white"
                                }`}
                              >
                                {isSelected ? "✓" : ""}
                              </span>
                              <span>{doctor.full_name}</span>
                            </div>
                            <span
                              className={`text-[10px] ${
                                isSelected ? "text-teal-100" : "text-[#577877]"
                              }`}
                            >
                              {doctor.specialty}
                            </span>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>

              {/* Multi-Select Applicable Appointment Types Component */}
              <div className="sm:col-span-2 rounded-xl border border-[#577877]/15 bg-[#F0F5F7]/60 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-[#162623]">
                    Applicable Appointment Types <span className="text-red-600">*</span>
                  </label>
                  <span className="px-2.5 py-0.5 rounded-full bg-[#25836F] text-white font-bold text-[10px]">
                    {form.appointment_types.length} Selected
                  </span>
                </div>
                <p className="text-[11px] text-[#577877]">
                  Choose independent appointment booking types for this service.
                </p>

                <div className="grid gap-2 sm:grid-cols-2 max-h-36 overflow-y-auto no-scrollbar p-1">
                  {appointmentTypes.map((type) => {
                    const isSelected = form.appointment_types.includes(type);
                    return (
                      <div
                        key={type}
                        onClick={() => toggleAppointmentType(type)}
                        className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer text-xs transition border ${
                          isSelected
                            ? "bg-[#25836F] text-white font-semibold border-[#162623] shadow-xs"
                            : "bg-white text-[#162623] border-[#577877]/20 hover:bg-[#F0F5F7]"
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center text-[10px] shrink-0 ${
                            isSelected
                              ? "bg-white text-[#25836F] font-bold"
                              : "border border-[#577877]/40 bg-white"
                          }`}
                        >
                          {isSelected ? "✓" : ""}
                        </span>
                        <span>{type}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="sm:col-span-2 text-right space-x-2 pt-3 border-t border-[#577877]/15 mt-2">
                <button
                  type="button"
                  onClick={() => setEditingService(null)}
                  className="rounded-xl border border-[#577877]/30 px-4 py-2 text-xs font-semibold text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-xl bg-[#25836F] px-5 py-2 text-xs font-semibold text-white shadow hover:bg-[#1d6e5d] disabled:opacity-50 cursor-pointer"
                >
                  {saving ? "Saving…" : "Save Service Config"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Services Table */}
      {loading ? (
        <div className="flex h-48 items-center justify-center text-[#577877]">
          <span className="material-symbols-outlined animate-spin text-3xl">sync</span>
        </div>
      ) : services.length === 0 ? (
        <div className="care-card p-12 text-center text-[#577877]">
          <span className="material-symbols-outlined text-4xl mb-2">medical_services</span>
          <p className="text-sm font-medium">No clinical services configured yet.</p>
        </div>
      ) : (
        <div className="care-card overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F0F5F7] border-b border-[#577877]/15 text-[#577877] font-semibold">
              <tr>
                <th className="p-3">Service Name</th>
                <th className="p-3">Specialty</th>
                <th className="p-3">Duration</th>
                <th className="p-3">Base Fee</th>
                <th className="p-3">Platform Fee</th>
                <th className="p-3">Total Charge</th>
                <th className="p-3">Effective Date</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#577877]/15">
              {services.map((srv) => (
                <tr key={srv.id} className="hover:bg-[#F0F5F7]/50">
                  <td className="p-3 font-bold text-[#162623]">{srv.name}</td>
                  <td className="p-3 text-[#25836F] font-semibold">{srv.specialty}</td>
                  <td className="p-3 text-[#577877]">{srv.duration_minutes || 30} mins</td>
                  <td className="p-3 font-semibold text-[#162623]">
                    {srv.currency === "USD" ? "$" : "₹"}{srv.base_fee}
                  </td>
                  <td className="p-3 text-[#577877]">
                    {srv.currency === "USD" ? "$" : "₹"}{srv.platform_fee}
                  </td>
                  <td className="p-3 font-bold text-[#25836F]">
                    {srv.currency === "USD" ? "$" : "₹"}{(srv.base_fee || 0) + (srv.platform_fee || 0)}
                  </td>
                  <td className="p-3 text-[#577877]">{srv.effective_date || "2026-01-01"}</td>
                  <td className="p-3">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                        srv.active ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                      }`}
                    >
                      {srv.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => openEditService(srv)}
                      className="rounded-lg border border-[#577877]/30 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#25836F] hover:bg-[#F0F5F7] cursor-pointer"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
