import { useEffect, useState } from "react";
import { adminApi } from "../../../lib/api";
import { useToast } from "../../common/Toast";

export default function ClinicSettingsTab() {
  const { showToast } = useToast();
  const [form, setForm] = useState({
    clinic_name: "",
    address: "",
    contact_email: "",
    contact_phone: "",
    timezone: "America/New_York",
    cancellation_deadline_hours: 24,
    intake_policy: "clinic_configured",
    prescriptions_enabled: true,
    operating_hours: "",
    authorized_administrators: ["clinic-admin@teleconsult.local"],
    email_alerts_new_doctor: true,
    email_alerts_daily_summary: true,
    email_alerts_payment_failures: true,
    appointment_types: [],
    visit_formats: [],
  });
  const [newAdminEmail, setNewAdminEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newAppointmentType, setNewAppointmentType] = useState("");
  const [newVisitFormat, setNewVisitFormat] = useState("");

  const normalizeOptions = (items) => (Array.isArray(items) ? items : []).flatMap((item) => {
    const option = typeof item === "string" ? { label: item, enabled: true } : { label: item.label || "", enabled: item.enabled !== false };
    return option.label.split(",").map((label) => ({ ...option, label: label.trim() })).filter((value) => value.label);
  });

  useEffect(() => {
    adminApi
      .settings()
      .then((res) => {
        if (res) setForm((curr) => ({ ...curr, ...res, appointment_types: normalizeOptions(res.appointment_types), visit_formats: normalizeOptions(res.visit_formats) }));
      })
      .catch((err) => {
        showToast(err.message || "Failed to load clinic settings.", "error");
      })
      .finally(() => setLoading(false));
  }, []);

  const handleAddAdmin = () => {
    if (!newAdminEmail || !newAdminEmail.includes("@")) {
      showToast("Please enter a valid administrator email address.", "error");
      return;
    }
    if (form.authorized_administrators.includes(newAdminEmail.trim())) {
      showToast("Administrator email is already authorized.", "warning");
      return;
    }
    setForm((curr) => ({
      ...curr,
      authorized_administrators: [...curr.authorized_administrators, newAdminEmail.trim()],
    }));
    showToast(`Added ${newAdminEmail.trim()} as authorized administrator.`, "info");
    setNewAdminEmail("");
  };

  const handleRemoveAdmin = (emailToRemove) => {
    setForm((curr) => ({
      ...curr,
      authorized_administrators: curr.authorized_administrators.filter((e) => e !== emailToRemove),
    }));
    showToast(`Removed ${emailToRemove} from authorized administrators.`, "info");
  };

  const addBookingOption = (key, value, clear) => {
    const labels = value.split(",").map((item) => item.trim()).filter(Boolean);
    if (!labels.length) return;
    const additions = labels.filter((label) => !form[key].some((item) => item.label.toLowerCase() === label.toLowerCase())).map((label) => ({ label, enabled: true }));
    if (!additions.length) {
      showToast("These booking options already exist.", "warning");
      return;
    }
    setForm((curr) => ({ ...curr, [key]: [...curr[key], ...additions] }));
    clear("");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await adminApi.updateSettings({
        ...form,
        appointment_types: form.appointment_types,
        visit_formats: form.visit_formats,
        cancellation_deadline_hours: Number(form.cancellation_deadline_hours),
      });
      showToast("Clinic configuration & administrator preferences saved successfully.", "success");
    } catch (err) {
      showToast(err.message || "Failed to update settings.", "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-[#577877]">
        <span className="material-symbols-outlined animate-spin text-3xl">sync</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="border-b border-[#577877]/15 pb-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
          Clinic Settings & Administration
        </span>
        <h1 className="text-2xl font-bold text-[#162623]">
          Clinic Identity, Authorized Admins & Policy Settings
        </h1>
        <p className="text-xs text-[#577877]">
          Maintain clinic details, timezones, administrator access, intake rules, and automated notification alerts.
        </p>
      </div>

      <form onSubmit={handleSave} className="care-card p-6 space-y-6 max-w-4xl">
        {/* Business Identity */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-[#162623]">Clinic Identity & Operating Parameters</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-[#162623]">Clinic Name</label>
              <input
                required
                type="text"
                value={form.clinic_name}
                onChange={(e) => setForm({ ...form, clinic_name: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#162623]">Clinic Timezone</label>
              <select
                value={form.timezone}
                onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs bg-white"
              >
                <option value="America/New_York">America/New_York (EST)</option>
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="Europe/London">Europe/London (GMT/BST)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                <option value="UTC">Coordinated Universal Time (UTC)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#162623]">Contact Email</label>
              <input
                required
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#162623]">Contact Phone</label>
              <input
                required
                type="text"
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#162623]">Operating Hours Display</label>
              <input
                required
                type="text"
                value={form.operating_hours}
                onChange={(e) => setForm({ ...form, operating_hours: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#162623]">Cancellation Deadline (Hours)</label>
              <input
                required
                type="number"
                value={form.cancellation_deadline_hours}
                onChange={(e) => setForm({ ...form, cancellation_deadline_hours: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-[#162623]">Clinic Physical Address</label>
              <input
                required
                type="text"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs"
              />
            </div>
          </div>
        </div>

        <hr className="border-[#577877]/15" />

        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-[#162623]">Booking Configuration</h2>
            <p className="text-xs text-[#577877]">Enable only the appointment types and visit formats patients may select. Nothing is saved until you click Save Settings.</p>
          </div>
          {[['appointment_types', 'Appointment types', newAppointmentType, setNewAppointmentType, 'New patient consultation'], ['visit_formats', 'Visit formats', newVisitFormat, setNewVisitFormat, 'Video consultation']].map(([key, title, value, setValue, placeholder]) => (
            <div key={key} className="space-y-2">
              <label className="block text-xs font-semibold text-[#162623]">{title}</label>
              <div className="flex max-w-lg gap-2">
                <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs" />
                <button type="button" onClick={() => addBookingOption(key, value, setValue)} className="rounded-xl bg-[#25836F] px-3 py-2 text-xs font-semibold text-white">Add</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {form[key].map((option, index) => (
                  <span key={`${option.label}-${index}`} className={`inline-flex items-center gap-2 rounded-lg border px-2.5 py-1 text-xs ${option.enabled ? "border-[#25836F]/20 bg-[#E8F3F3] text-[#25836F]" : "border-[#577877]/15 bg-[#F0F5F7] text-[#577877] line-through"}`}>
                    {option.label}
                    <button type="button" onClick={() => setForm((curr) => ({ ...curr, [key]: curr[key].map((item, itemIndex) => itemIndex === index ? { ...item, enabled: !item.enabled } : item) }))} className="font-semibold no-underline">{option.enabled ? "Disable" : "Enable"}</button>
                    <button type="button" onClick={() => setForm((curr) => ({ ...curr, [key]: curr[key].filter((_, itemIndex) => itemIndex !== index) }))} className="font-bold text-rose-700">×</button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        <hr className="border-[#577877]/15" />

        {/* Authorized Administrators */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-[#162623]">Authorized Clinic Administrators</h2>
          <p className="text-xs text-[#577877]">
            Email addresses allowed to access the Clinic Administrator Workspace.
          </p>

          <div className="flex gap-2 max-w-md">
            <input
              type="email"
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              placeholder="admin@clinic.com"
              className="w-full rounded-xl border border-[#577877]/25 px-3 py-2 text-xs"
            />
            <button
              type="button"
              onClick={handleAddAdmin}
              className="rounded-xl bg-[#25836F] px-3.5 py-2 text-xs font-semibold text-white shrink-0 cursor-pointer"
            >
              Add Admin
            </button>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {form.authorized_administrators.map((email) => (
              <span
                key={email}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#F0F5F7] px-2.5 py-1 text-xs font-semibold text-[#25836F] border border-[#577877]/15"
              >
                {email}
                {form.authorized_administrators.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveAdmin(email)}
                    className="text-[#577877] hover:text-red-700 cursor-pointer"
                  >
                    ✕
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>

        <hr className="border-[#577877]/15" />

        {/* Notification Preferences */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-[#162623]">Automated Administrator Notification Alerts</h2>

          <div className="space-y-2 text-xs text-[#162623]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.email_alerts_new_doctor}
                onChange={(e) => setForm({ ...form, email_alerts_new_doctor: e.target.checked })}
                className="rounded text-[#25836F]"
              />
              Email alerts when a new clinician registers and awaits approval
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.email_alerts_daily_summary}
                onChange={(e) => setForm({ ...form, email_alerts_daily_summary: e.target.checked })}
                className="rounded text-[#25836F]"
              />
              Daily operational summary report email (booking counts & revenue)
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.email_alerts_payment_failures}
                onChange={(e) => setForm({ ...form, email_alerts_payment_failures: e.target.checked })}
                className="rounded text-[#25836F]"
              />
              Immediate notification alerts on payment gateway failures or refunds
            </label>
          </div>
        </div>

        <div className="pt-2 text-right">
          <button
            disabled={saving}
            className="rounded-xl bg-[#25836F] px-6 py-2.5 text-xs font-semibold text-white shadow transition hover:bg-[#1d6e5d] disabled:opacity-50 cursor-pointer"
          >
            {saving ? "Saving…" : "Save Clinic Settings"}
          </button>
        </div>
      </form>
    </div>
  );
}
