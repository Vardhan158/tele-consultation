import { useState } from "react";
import { doctorApi } from "../../lib/api";

function ClinicianBrandPanel({ onBack }) {
  return (
    <aside className="relative hidden overflow-hidden bg-[#25836F] text-white lg:flex lg:flex-col justify-between p-10 lg:p-14 xl:p-16 min-h-screen">
      <div className="space-y-8 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F0F5F7] text-[#25836F] flex items-center justify-center font-bold shadow-sm">
              <span className="material-symbols-outlined !text-[#25836F] text-2xl font-bold">
                stethoscope
              </span>
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight text-white">
                Kaizentrix Care
              </p>
              <p className="text-[10px] tracking-[.18em] uppercase text-[#F0F5F7]/80 font-semibold">
                Clinician Workspace
              </p>
            </div>
          </div>

          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80 hover:text-white bg-white/10 hover:bg-white/20 px-3.5 py-1.5 rounded-xl border border-white/10 transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">
                arrow_back
              </span>
              Back to Home
            </button>
          )}
        </div>

        <div className="pt-12 xl:pt-20 space-y-5">
          <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-xs font-semibold text-[#F0F5F7] tracking-wider uppercase border border-white/10">
            Care That Connects
          </span>
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight text-white">
            Join our network of
            <br />
            verified clinicians.
          </h1>
          <p className="text-sm xl:text-base text-[#F0F5F7]/85 leading-relaxed max-w-md">
            Expand your medical practice, conduct secure video teleconsultations,
            issue electronic prescriptions, and manage follow-up care plans.
          </p>
        </div>
      </div>

      <div className="relative z-10 pt-10 border-t border-white/15 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-white">
          <span className="material-symbols-outlined !text-[#F0F5F7] text-base">
            verified_user
          </span>
          <span>Verified Professional Credentialing</span>
        </div>
        <p className="text-xs text-[#F0F5F7]/75">
          Credentials are reviewed by an authorized clinic administrator before consultation access is enabled.
        </p>
      </div>

      {/* Decorative gradient overlay */}
      <div className="absolute -bottom-20 -right-20 w-96 h-96 rounded-full bg-[#577877]/25 blur-3xl pointer-events-none" />
    </aside>
  );
}

export default function DoctorRegistrationScreen({ onBack, onSuccess, onSwitchToPatientAuth }) {
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    mobile_number: "",
    password: "",
    specialty: "",
    clinic_name: "",
    registration_number: "",
    experience_years: "0",
    qualifications: "",
    languages: "",
  });
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");

  const update = (event) =>
    setForm((current) => ({
      ...current,
      [event.target.name]: event.target.value,
    }));

  const submit = async (event) => {
    event.preventDefault();
    setState("loading");
    setMessage("");
    try {
      await doctorApi.register({
        ...form,
        experience_years: Number(form.experience_years),
        qualifications: form.qualifications
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        languages: form.languages
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      });
      setState("success");
      if (onSuccess) {
        onSuccess(form.email);
      }
    } catch (error) {
      setState("error");
      setMessage(error.message || "Unable to submit registration.");
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F5F7] font-sans grid grid-cols-1 lg:grid-cols-2 text-[#162623]">
      <ClinicianBrandPanel onBack={onBack} />

      <main className="flex flex-col justify-between p-6 sm:p-10 lg:p-14 xl:p-16 min-h-screen overflow-y-auto">
        <div className="max-w-xl w-full mx-auto space-y-6">
          {/* Header Switcher Pills */}
          <div className="flex items-center justify-between">
            <div className="inline-flex rounded-xl bg-[#25836F]/10 p-1 border border-[#577877]/15">
              <button
                type="button"
                onClick={onSwitchToPatientAuth || onBack}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold text-[#577877] hover:text-[#162623] transition cursor-pointer"
              >
                Patient Auth
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#25836F] px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs cursor-default"
              >
                Clinician Registration
              </button>
            </div>

            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="lg:hidden text-xs font-semibold text-[#25836F] hover:underline cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">arrow_back</span>
                Home
              </button>
            )}
          </div>

          <div className="space-y-1">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
              Clinician Registration
            </h2>
            <p className="text-xs sm:text-sm text-[#577877]">
              Provide your professional credentials to request telehealth clinic access.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#162623]">
                  Full Name <span className="text-red-600">*</span>
                </label>
                <input
                  required
                  name="full_name"
                  type="text"
                  value={form.full_name}
                  onChange={update}
                  placeholder="Dr. Harshavardhan m v"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#162623]">
                  Email Address <span className="text-red-600">*</span>
                </label>
                <input
                  required
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={update}
                  placeholder="doctor@clinic.com"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#162623]">
                  Mobile Number <span className="text-red-600">*</span>
                </label>
                <input
                  required
                  name="mobile_number"
                  type="text"
                  value={form.mobile_number}
                  onChange={update}
                  placeholder="+91 9876543210"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#162623]">
                  Password <span className="text-red-600">*</span>
                </label>
                <input
                  required
                  name="password"
                  type="password"
                  value={form.password}
                  onChange={update}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#162623]">
                  Medical Specialty <span className="text-red-600">*</span>
                </label>
                <input
                  required
                  name="specialty"
                  type="text"
                  value={form.specialty}
                  onChange={update}
                  placeholder="e.g. ENT, Cardiology, Internal Medicine"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#162623]">
                  Clinic / Hospital Affiliation <span className="text-red-600">*</span>
                </label>
                <input
                  required
                  name="clinic_name"
                  type="text"
                  value={form.clinic_name}
                  onChange={update}
                  placeholder="Kaizentrix Care Telehealth"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#162623]">
                  Professional Registration Number <span className="text-red-600">*</span>
                </label>
                <input
                  required
                  name="registration_number"
                  type="text"
                  value={form.registration_number}
                  onChange={update}
                  placeholder="MCI-123456"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-xs font-semibold text-[#162623]">
                  Experience (Years) <span className="text-red-600">*</span>
                </label>
                <input
                  required
                  name="experience_years"
                  type="number"
                  min="0"
                  max="60"
                  value={form.experience_years}
                  onChange={update}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="block text-xs font-semibold text-[#162623]">
                  Qualifications <span className="text-red-600">*</span>
                </label>
                <input
                  required
                  name="qualifications"
                  type="text"
                  value={form.qualifications}
                  onChange={update}
                  placeholder="MBBS, MS (ENT), DNB (comma separated)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>

              <div className="sm:col-span-2 space-y-1">
                <label className="block text-xs font-semibold text-[#162623]">
                  Supported Languages <span className="text-red-600">*</span>
                </label>
                <input
                  required
                  name="languages"
                  type="text"
                  value={form.languages}
                  onChange={update}
                  placeholder="English, Hindi, Kannada (comma separated)"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>
            </div>

            {message && (
              <div
                className={`p-3 rounded-xl border text-xs font-medium ${
                  state === "error"
                    ? "bg-red-50 text-red-600 border-red-200"
                    : "bg-teal-50 text-[#25836F] border-teal-200"
                }`}
              >
                {state === "error" ? "⚠️ " : "✅ "}
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={state === "loading"}
              className="w-full rounded-xl bg-[#25836F] py-3 text-xs font-bold text-white shadow transition hover:bg-[#1d6e5d] disabled:opacity-50 cursor-pointer"
            >
              {state === "loading" ? "Submitting Registration…" : "Submit Clinician Registration"}
            </button>
          </form>

          <p className="text-center text-xs text-[#577877]">
            Already registered?{" "}
            <button
              type="button"
              onClick={onSwitchToPatientAuth || onBack}
              className="font-bold text-[#25836F] hover:underline cursor-pointer"
            >
              Sign in to your account
            </button>
          </p>
        </div>

        <footer className="pt-8 text-center text-xs text-[#577877]">
          © 2026 Kaizentrix Care · Clinician Credentialing Workspace.
        </footer>
      </main>
    </div>
  );
}
