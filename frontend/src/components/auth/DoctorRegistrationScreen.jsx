import { useState } from "react";
import { doctorApi } from "../../lib/api";
import PublicNavbar from "../public/PublicNavbar";

export default function DoctorRegistrationScreen({ onBack, onSuccess }) {
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
  const fields = [
    ["full_name", "Full name"],
    ["email", "Email"],
    ["mobile_number", "Mobile number"],
    ["password", "Password"],
    ["specialty", "Specialty"],
    ["clinic_name", "Clinic affiliation"],
    ["registration_number", "Professional registration number"],
    ["experience_years", "Experience years"],
    ["qualifications", "Qualifications (comma separated)"],
    ["languages", "Languages (comma separated)"],
  ];
  return (
    <div className="min-h-screen bg-[#F0F5F7] font-sans text-[#162623]">
      <PublicNavbar />
      <main className="px-6 py-8 sm:py-10">
        <form
          onSubmit={submit}
          className="mx-auto max-w-2xl space-y-4 rounded-2xl border border-[rgba(87,120,119,0.15)] bg-white p-6 shadow-[0_10px_30px_-8px_rgba(22,38,35,0.12)] sm:p-8"
        >
          <button
            type="button"
            onClick={onBack}
            className="text-sm font-medium text-[#295255] hover:underline"
          >
            ← Back
          </button>
          <h1 className="text-2xl font-bold text-[#162623]">
            Clinician registration
          </h1>
          <p className="text-sm text-[#577877]">
            Credentials are reviewed by an authorized clinic administrator before
            consultation access is enabled.
          </p>
          {fields.map(([name, label]) => (
            <label key={name} className="block text-sm text-[#162623]">
              {label}
              <input
                required
                name={name}
                type={
                  name === "password"
                    ? "password"
                    : name === "experience_years"
                      ? "number"
                      : name === "email"
                        ? "email"
                        : "text"
                }
                value={form[name]}
                onChange={update}
                className="mt-1 w-full rounded-xl border border-[#577877]/25 px-3 py-2"
              />
            </label>
          ))}
          {message && (
            <p
              className={
                state === "error"
                  ? "text-red-600 text-sm font-medium"
                  : "text-[#295255] text-sm font-medium"
              }
            >
              {message}
            </p>
          )}
          <button
            disabled={state === "loading"}
            className="w-full rounded-xl bg-[#295255] px-4 py-3 font-semibold text-white transition hover:bg-[#1f3f41] disabled:opacity-50"
          >
            {state === "loading" ? "Submitting…" : "Submit registration"}
          </button>
        </form>
      </main>
    </div>
  );
}
