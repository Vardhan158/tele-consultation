import { useState } from "react";
import { doctorApi } from "../../lib/api";

function ClinicianBrandPanel({ onBack }) {
  return (
    <aside className="relative hidden overflow-hidden bg-[#25836F] text-white lg:flex lg:flex-col justify-between p-10 lg:p-14 xl:p-16 min-h-screen">
      <div className="space-y-8 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#F0F5F7] text-[#125747] flex items-center justify-center font-bold shadow-sm">
              <svg
                width="24"
                height="28"
                viewBox="0 0 35 42"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-auto text-[#125747]"
                aria-hidden="true"
              >
                <path
                  d="M14.451 5.223A7.466 7.466 0 0 1 24.9 15.891q-.3.293-.584.512L13.933 5.802q.22-.285.518-.579M7.093 25.239A7.466 7.466 0 0 0 17.607 35.84a7 7 0 0 0 .518-.574L7.675 24.73a6 6 0 0 0-.582.508"
                  fill="currentColor"
                />
                <rect
                  width="12.629"
                  height="32.626"
                  rx="6.315"
                  transform="rotate(-45 16.202 6.711)"
                  fill="currentColor"
                />
              </svg>
            </div>
            <div>
              <p className="text-xl font-bold tracking-tight text-white">
                Kaizen Care
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
    // Personal Information
    full_name: "",
    email: "",
    mobile_number: "",
    state: "",

    // Professional Information
    specialty: "",
    registration_number: "",
    medical_council: "",
    qualifications: "",
    experience_years: "",
    languages: "",
    credential_document: null,

    // Account Security
    password: "",
    confirm_password: "",

    // Consents & Declarations
    terms_consent: false,
    declaration_consent: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");
  const [submittedData, setSubmittedData] = useState(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  // Validation function that checks a specific field or all fields
  const validateField = (name, value, allValues = form) => {
    switch (name) {
      // 1. Personal Information
      case "full_name":
        if (!value || !value.trim()) return "Full name is required.";
        if (value.trim().length < 2) return "Full name must be at least 2 characters.";
        if (value.trim().length > 100) return "Full name cannot exceed 100 characters.";
        return "";

      case "email": {
        if (!value || !value.trim()) return "Email address is required.";
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value.trim())) return "Enter a valid email address (e.g. doctor@clinic.com).";
        return "";
      }

      case "mobile_number": {
        if (!value || !value.trim()) return "Mobile number is required.";
        const clean = value.replace(/[\s()-]/g, "");
        const digitsOnly = clean.startsWith("+91") ? clean.slice(3) : clean.startsWith("0") ? clean.slice(1) : clean.startsWith("+") ? clean.slice(1) : clean;
        if (!/^\d{10}$/.test(digitsOnly)) return "Mobile number must be exactly 10 digits.";
        return "";
      }

      case "state":
        if (!value || !value.trim()) return "State / Location is required.";
        if (value.trim().length < 2) return "State must be at least 2 characters.";
        return "";

      // 2. Professional Information
      case "specialty":
        if (!value || !value.trim()) return "Medical specialization is required.";
        return "";

      case "registration_number":
        if (!value || !value.trim()) return "Medical registration number is required.";
        if (value.trim().length < 2) return "Registration number must be at least 2 characters.";
        return "";

      case "medical_council":
        if (!value || !value.trim()) return "Medical council / authority is required.";
        return "";

      case "qualifications":
        if (!value || !value.trim()) return "Qualifications are required.";
        if (value.trim().length < 2) return "Please enter your degrees (e.g. MBBS, MD).";
        return "";

      case "experience_years": {
        if (value === "" || value === null || value === undefined) return "Experience is required.";
        const exp = Number(value);
        if (!Number.isInteger(exp) || exp < 0) return "Enter a non-negative whole number (0 or higher).";
        if (exp > 60) return "Experience years cannot exceed 60.";
        return "";
      }

      case "languages": {
        if (!value || !value.trim()) return "Supported languages are required.";
        const langs = typeof value === "string" ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
        if (langs.length === 0) return "Enter at least one language (e.g. English, Hindi).";
        return "";
      }

      case "credential_document": {
        if (!value) return "Medical registration certificate is required.";
        const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
        if (!allowedTypes.includes(value.type)) {
          return "Certificate must be a PDF, JPG, or PNG file.";
        }
        if (value.size > 10 * 1024 * 1024) {
          return "Certificate file size cannot exceed 10 MB.";
        }
        return "";
      }

      // 3. Account Security
      case "password":
        if (!value) return "Password is required.";
        if (value.length < 8) return "Password must be at least 8 characters.";
        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,128}$/.test(value)) {
          return "Password must include uppercase, lowercase, number, and special character.";
        }
        return "";

      case "confirm_password":
        if (!value) return "Please confirm your password.";
        if (value !== allValues.password) return "Passwords do not match.";
        return "";

      // 4. Consents & Declarations
      case "terms_consent":
        if (!value) return "You must agree to the Terms of Service and Privacy Policy.";
        return "";

      case "declaration_consent":
        if (!value) return "You must declare that all professional information is accurate.";
        return "";

      default:
        return "";
    }
  };

  const validateAll = () => {
    const newErrors = {};
    Object.keys(form).forEach((key) => {
      const err = validateField(key, form[key], form);
      if (err) newErrors[key] = err;
    });
    return newErrors;
  };

  const update = (event) => {
    const { name, value, type, checked, files } = event.target;
    let val = type === "checkbox" ? checked : type === "file" ? (files && files[0] ? files[0] : null) : value;

    // Enforce digits only and max 10 digits for mobile number
    if (name === "mobile_number") {
      val = val.replace(/\D/g, "").slice(0, 10);
    }

    const nextForm = { ...form, [name]: val };
    setForm(nextForm);

    // If field was already touched or has an error, re-validate live
    if (touched[name]) {
      const err = validateField(name, val, nextForm);
      setErrors((prev) => ({ ...prev, [name]: err }));

      // Also re-validate confirm_password if password changes
      if (name === "password" && touched.confirm_password) {
        const confirmErr = validateField("confirm_password", form.confirm_password, nextForm);
        setErrors((prev) => ({ ...prev, confirm_password: confirmErr }));
      }
    }
  };

  const handleBlur = (event) => {
    const { name, value, type, checked, files } = event.target;
    const val = type === "checkbox" ? checked : type === "file" ? (files && files[0] ? files[0] : null) : value;
    setTouched((prev) => ({ ...prev, [name]: true }));
    const err = validateField(name, val, form);
    setErrors((prev) => ({ ...prev, [name]: err }));
  };

  const submit = async (event) => {
    event.preventDefault();

    // Mark all touched
    const allTouched = Object.keys(form).reduce((acc, key) => ({ ...acc, [key]: true }), {});
    setTouched(allTouched);

    const validationErrors = validateAll();
    setErrors(validationErrors);

    const errorKeys = Object.keys(validationErrors);
    if (errorKeys.length > 0) {
      setState("error");
      setMessage(validationErrors[errorKeys[0]]);
      return;
    }

    const experience = Number(form.experience_years);
    const parsedLanguages = form.languages
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    setState("loading");
    setMessage("");
    try {
      const payload = {
        full_name: form.full_name.trim(),
        email: form.email.trim().toLowerCase(),
        mobile_number: form.mobile_number.trim(),
        state: form.state.trim(),
        specialty: form.specialty.trim(),
        registration_number: form.registration_number.trim(),
        medical_council: form.medical_council.trim(),
        qualifications: form.qualifications
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
        experience_years: experience,
        languages: parsedLanguages,
        password: form.password,
      };

      if (form.credential_document) {
        payload.credential_document = form.credential_document;
      }

      const response = await doctorApi.register(payload);

      setState("success");
      setSubmittedData({
        email: form.email.trim().toLowerCase(),
        full_name: form.full_name.trim(),
        registration_number: form.registration_number.trim(),
        response,
      });
    } catch (error) {
      setState("error");
      setMessage(error.message || "Unable to submit registration.");
    }
  };

  return (
    <div className="min-h-screen bg-[#F0F5F7] font-sans grid grid-cols-1 lg:grid-cols-2 text-[#162623] lg:h-screen lg:overflow-hidden">
      <ClinicianBrandPanel onBack={onBack} />

      <main className="flex flex-col justify-between p-6 pb-2 sm:p-10 sm:pb-3 lg:p-12 lg:pb-4 xl:p-14 xl:pb-4 min-h-screen overflow-y-auto lg:h-screen">
        {/* Top Header / Back button */}
        <div className="w-full max-w-xl mx-auto flex items-center justify-between text-xs text-[#577877] mb-2 lg:mb-4">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="lg:hidden inline-flex items-center gap-1 text-xs font-semibold text-[#25836F] hover:underline cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              Home
            </button>
          ) : (
            <span />
          )}
          <span className="font-semibold tracking-wide text-[#25836F]">Clinician Portal</span>
        </div>

        {/* Centered Form Content Box */}
        <div className="w-full max-w-xl mx-auto py-2 sm:py-4 space-y-4">
          {state === "success" && submittedData ? (
            /* Successful Submission Confirmation */
            <div className="rounded-2xl border border-[#25836F]/30 bg-white p-6 sm:p-8 shadow-sm space-y-5 animate-in fade-in duration-300">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-[#EEF6F3] text-[#25836F] flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-2xl font-bold">check_circle</span>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300/60 uppercase tracking-wider">
                      <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
                      PENDING_VERIFICATION
                    </span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold text-[#162623] mt-1">
                    Registration Submitted Successfully
                  </h3>
                </div>
              </div>

              <div className="space-y-2 text-xs sm:text-sm text-[#577877] leading-relaxed">
                <p>
                  Thank you, <strong>{submittedData.full_name}</strong>. Your clinician profile has been securely recorded.
                </p>
                <p>
                  A 6-digit email confirmation code has been dispatched to <strong>{submittedData.email}</strong>.
                </p>
              </div>

              <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 space-y-2 text-xs text-[#162623]">
                <div className="flex items-start gap-2">
                  <span className="material-symbols-outlined text-amber-700 text-base shrink-0 mt-0.5">
                    lock
                  </span>
                  <div>
                    <strong className="text-amber-900 block font-semibold">
                      Consultation Access Restriction:
                    </strong>
                    <span className="text-amber-900/90 leading-relaxed">
                      In compliance with clinical governance standards, your account remains in{" "}
                      <span className="font-bold underline">PENDING_VERIFICATION</span> status.
                      Clinicians cannot access teleconsultation rooms, schedule patients, or issue digital prescriptions until an authorized clinic administrator reviews and approves your registration credentials.
                    </span>
                  </div>
                </div>
                <div className="pt-2 border-t border-amber-200/60 grid grid-cols-2 gap-2 text-[11px] text-zinc-600">
                  <div>
                    <span className="text-zinc-500 block">Registration No:</span>
                    <span className="font-semibold text-zinc-800">{submittedData.registration_number}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500 block">Account Status:</span>
                    <span className="font-semibold text-amber-700">Pending Review</span>
                  </div>
                </div>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (onSuccess) {
                      onSuccess(submittedData.email);
                    }
                  }}
                  className="flex-1 rounded-xl bg-[#25836F] py-3 text-xs font-bold text-white shadow transition hover:bg-[#1d6e5d] cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>Proceed to Email Verification</span>
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </button>
                {onBack && (
                  <button
                    type="button"
                    onClick={onBack}
                    className="rounded-xl border border-[#577877]/30 bg-white px-5 py-3 text-xs font-semibold text-[#577877] hover:border-[#25836F] hover:text-[#162623] transition cursor-pointer"
                  >
                    Return Home
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#162623]">
                  Doctor Registration
                </h2>
                <p className="text-xs sm:text-sm text-[#577877]">
                  Provide your professional credentials to request telehealth clinic access.
                </p>
              </div>

              <form onSubmit={submit} noValidate className="space-y-4 pt-1">
                {/* 1. Personal Information */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-1.5 pb-1 border-b border-[#577877]/15">
                    <span className="material-symbols-outlined text-[#25836F] text-base">person</span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#162623]">
                      Personal Information
                    </h3>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* 1. Full Name */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-[#162623]">
                        Full Name <span className="text-red-600">*</span>
                      </label>
                      <input
                        name="full_name"
                        type="text"
                        value={form.full_name}
                        onChange={update}
                        onBlur={handleBlur}
                        placeholder="Dr. Harshavardhan M V"
                        className={`w-full px-3.5 py-2.5 rounded-xl border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs ${
                          touched.full_name && errors.full_name
                            ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                            : "border-[#577877]/25 focus:border-[#25836F] focus:ring-1 focus:ring-[#25836F]/20"
                        }`}
                      />
                      {touched.full_name && errors.full_name && (
                        <p className="text-[11px] text-red-600 font-medium">{errors.full_name}</p>
                      )}
                    </div>

                    {/* 2. Email Address */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-[#162623]">
                        Email Address <span className="text-red-600">*</span>
                      </label>
                      <input
                        name="email"
                        type="email"
                        value={form.email}
                        onChange={update}
                        onBlur={handleBlur}
                        placeholder="doctor@clinic.com"
                        className={`w-full px-3.5 py-2.5 rounded-xl border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs ${
                          touched.email && errors.email
                            ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                            : "border-[#577877]/25 focus:border-[#25836F] focus:ring-1 focus:ring-[#25836F]/20"
                        }`}
                      />
                      {touched.email && errors.email && (
                        <p className="text-[11px] text-red-600 font-medium">{errors.email}</p>
                      )}
                    </div>

                    {/* 3. Mobile Number */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-[#162623]">
                        Mobile Number <span className="text-red-600">*</span>
                      </label>
                      <input
                        name="mobile_number"
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={10}
                        value={form.mobile_number}
                        onChange={update}
                        onBlur={handleBlur}
                        placeholder="Enter 10 digit mobile number"
                        className={`w-full px-3.5 py-2.5 rounded-xl border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs ${
                          touched.mobile_number && errors.mobile_number
                            ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                            : "border-[#577877]/25 focus:border-[#25836F] focus:ring-1 focus:ring-[#25836F]/20"
                        }`}
                      />
                      {touched.mobile_number && errors.mobile_number && (
                        <p className="text-[11px] text-red-600 font-medium">{errors.mobile_number}</p>
                      )}
                    </div>

                    {/* 4. State / Location */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-[#162623]">
                        State / Location <span className="text-red-600">*</span>
                      </label>
                      <input
                        name="state"
                        type="text"
                        value={form.state}
                        onChange={update}
                        onBlur={handleBlur}
                        placeholder="e.g. Karnataka, India"
                        className={`w-full px-3.5 py-2.5 rounded-xl border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs ${
                          touched.state && errors.state
                            ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                            : "border-[#577877]/25 focus:border-[#25836F] focus:ring-1 focus:ring-[#25836F]/20"
                        }`}
                      />
                      {touched.state && errors.state && (
                        <p className="text-[11px] text-red-600 font-medium">{errors.state}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Professional Information */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center gap-1.5 pb-1 border-b border-[#577877]/15">
                    <span className="material-symbols-outlined text-[#25836F] text-base">medical_services</span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#162623]">
                      Professional Information
                    </h3>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* 5. Medical Specialization */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-[#162623]">
                        Medical Specialization <span className="text-red-600">*</span>
                      </label>
                      <select
                        name="specialty"
                        value={form.specialty}
                        onChange={update}
                        onBlur={handleBlur}
                        className={`w-full px-3.5 py-2.5 rounded-xl border bg-white text-xs text-[#162623] focus:outline-none transition shadow-2xs ${
                          touched.specialty && errors.specialty
                            ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                            : "border-[#577877]/25 focus:border-[#25836F] focus:ring-1 focus:ring-[#25836F]/20"
                        }`}
                      >
                        <option value="">Select Specialization</option>
                        <option value="General Medicine">General Medicine</option>
                        <option value="Cardiology">Cardiology</option>
                        <option value="Dermatology">Dermatology</option>
                        <option value="Pediatrics">Pediatrics</option>
                        <option value="Orthopedics">Orthopedics</option>
                        <option value="Neurology">Neurology</option>
                        <option value="Psychiatry">Psychiatry</option>
                        <option value="Gynecology">Gynecology</option>
                        <option value="ENT">ENT</option>
                        <option value="Ophthalmology">Ophthalmology</option>
                        <option value="Other">Other</option>
                      </select>
                      {touched.specialty && errors.specialty && (
                        <p className="text-[11px] text-red-600 font-medium">{errors.specialty}</p>
                      )}
                    </div>

                    {/* 6. Medical Registration Number */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-[#162623]">
                        Medical Registration Number <span className="text-red-600">*</span>
                      </label>
                      <input
                        name="registration_number"
                        type="text"
                        value={form.registration_number}
                        onChange={update}
                        onBlur={handleBlur}
                        placeholder="e.g. KMC-123456"
                        className={`w-full px-3.5 py-2.5 rounded-xl border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs ${
                          touched.registration_number && errors.registration_number
                            ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                            : "border-[#577877]/25 focus:border-[#25836F] focus:ring-1 focus:ring-[#25836F]/20"
                        }`}
                      />
                      {touched.registration_number && errors.registration_number && (
                        <p className="text-[11px] text-red-600 font-medium">{errors.registration_number}</p>
                      )}
                    </div>

                    {/* 7. Medical Council / Registration Authority */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-[#162623]">
                        Medical Council / Authority <span className="text-red-600">*</span>
                      </label>
                      <input
                        name="medical_council"
                        type="text"
                        value={form.medical_council}
                        onChange={update}
                        onBlur={handleBlur}
                        placeholder="e.g. Karnataka Medical Council"
                        className={`w-full px-3.5 py-2.5 rounded-xl border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs ${
                          touched.medical_council && errors.medical_council
                            ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                            : "border-[#577877]/25 focus:border-[#25836F] focus:ring-1 focus:ring-[#25836F]/20"
                        }`}
                      />
                      {touched.medical_council && errors.medical_council && (
                        <p className="text-[11px] text-red-600 font-medium">{errors.medical_council}</p>
                      )}
                    </div>

                    {/* 8. Qualifications */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-[#162623]">
                        Qualifications <span className="text-red-600">*</span>
                      </label>
                      <input
                        name="qualifications"
                        type="text"
                        value={form.qualifications}
                        onChange={update}
                        onBlur={handleBlur}
                        placeholder="MBBS, MD, DNB (comma separated)"
                        className={`w-full px-3.5 py-2.5 rounded-xl border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs ${
                          touched.qualifications && errors.qualifications
                            ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                            : "border-[#577877]/25 focus:border-[#25836F] focus:ring-1 focus:ring-[#25836F]/20"
                        }`}
                      />
                      {touched.qualifications && errors.qualifications && (
                        <p className="text-[11px] text-red-600 font-medium">{errors.qualifications}</p>
                      )}
                    </div>

                    {/* 9. Experience (Years) */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-[#162623]">
                        Experience (Years) <span className="text-red-600">*</span>
                      </label>
                      <input
                        name="experience_years"
                        type="number"
                        min="0"
                        max="60"
                        step="1"
                        value={form.experience_years}
                        onChange={update}
                        onBlur={handleBlur}
                        placeholder="e.g. 5"
                        className={`w-full px-3.5 py-2.5 rounded-xl border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs ${
                          touched.experience_years && errors.experience_years
                            ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                            : "border-[#577877]/25 focus:border-[#25836F] focus:ring-1 focus:ring-[#25836F]/20"
                        }`}
                      />
                      {touched.experience_years && errors.experience_years && (
                        <p className="text-[11px] text-red-600 font-medium">{errors.experience_years}</p>
                      )}
                    </div>

                    {/* 10. Supported Languages */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-[#162623]">
                        Supported Languages <span className="text-red-600">*</span>
                      </label>
                      <input
                        name="languages"
                        type="text"
                        value={form.languages}
                        onChange={update}
                        onBlur={handleBlur}
                        placeholder="English, Hindi, Kannada (comma separated)"
                        className={`w-full px-3.5 py-2.5 rounded-xl border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs ${
                          touched.languages && errors.languages
                            ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                            : "border-[#577877]/25 focus:border-[#25836F] focus:ring-1 focus:ring-[#25836F]/20"
                        }`}
                      />
                      {touched.languages && errors.languages && (
                        <p className="text-[11px] text-red-600 font-medium">{errors.languages}</p>
                      )}
                    </div>
                  </div>

                  {/* 11. Medical Registration Certificate */}
                  <div className="space-y-1 pt-1">
                    <label className="block text-xs font-semibold text-[#162623]">
                      Medical Registration Certificate <span className="text-red-600">*</span>
                      <span className="font-normal text-[#577877] ml-1">(PDF, JPG, PNG · Max 10 MB)</span>
                    </label>
                    <div className="relative">
                      <input
                        name="credential_document"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        onChange={update}
                        onBlur={handleBlur}
                        className={`w-full px-3.5 py-2 rounded-xl border bg-white text-xs text-[#162623] file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#F0F5F7] file:text-[#25836F] hover:file:bg-[#25836F]/10 focus:outline-none transition cursor-pointer ${
                          touched.credential_document && errors.credential_document
                            ? "border-red-500 focus:border-red-500"
                            : "border-[#577877]/25 focus:border-[#25836F]"
                        }`}
                      />
                    </div>
                    {touched.credential_document && errors.credential_document && (
                      <p className="text-[11px] text-red-600 font-medium">{errors.credential_document}</p>
                    )}
                  </div>
                </div>

                {/* 3. Account Security */}
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center gap-1.5 pb-1 border-b border-[#577877]/15">
                    <span className="material-symbols-outlined text-[#25836F] text-base">lock</span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#162623]">
                      Account Security
                    </h3>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {/* 12. Password */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-[#162623]">
                        Password <span className="text-red-600">*</span>
                      </label>
                      <div className="relative">
                        <input
                          name="password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={form.password}
                          onChange={update}
                          onBlur={handleBlur}
                          placeholder="••••••••"
                          className={`w-full pl-3.5 pr-10 py-2.5 rounded-xl border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs ${
                            touched.password && errors.password
                              ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                              : "border-[#577877]/25 focus:border-[#25836F] focus:ring-1 focus:ring-[#25836F]/20"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#577877] hover:text-[#162623] cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-base">
                            {showPassword ? "visibility_off" : "visibility"}
                          </span>
                        </button>
                      </div>
                      {touched.password && errors.password && (
                        <p className="text-[11px] text-red-600 font-medium leading-tight">{errors.password}</p>
                      )}
                    </div>

                    {/* 13. Confirm Password */}
                    <div className="space-y-1">
                      <label className="block text-xs font-semibold text-[#162623]">
                        Confirm Password <span className="text-red-600">*</span>
                      </label>
                      <div className="relative">
                        <input
                          name="confirm_password"
                          type={showConfirmPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={form.confirm_password}
                          onChange={update}
                          onBlur={handleBlur}
                          placeholder="Re-enter password"
                          className={`w-full pl-3.5 pr-10 py-2.5 rounded-xl border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs ${
                            touched.confirm_password && errors.confirm_password
                              ? "border-red-500 focus:border-red-500 focus:ring-1 focus:ring-red-500/20"
                              : "border-[#577877]/25 focus:border-[#25836F] focus:ring-1 focus:ring-[#25836F]/20"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          aria-label={showConfirmPassword ? "Hide confirm password" : "Show confirm password"}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#577877] hover:text-[#162623] cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-base">
                            {showConfirmPassword ? "visibility_off" : "visibility"}
                          </span>
                        </button>
                      </div>
                      {touched.confirm_password && errors.confirm_password && (
                        <p className="text-[11px] text-red-600 font-medium">{errors.confirm_password}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Consents & Required Declarations */}
                <div className="pt-2 space-y-2">
                  {/* Terms & Privacy Consent */}
                  <label className="flex items-start gap-2.5 text-xs text-[#162623] cursor-pointer">
                    <input
                      type="checkbox"
                      name="terms_consent"
                      checked={form.terms_consent}
                      onChange={update}
                      onBlur={handleBlur}
                      className="mt-0.5 h-4 w-4 rounded border-[#577877]/30 text-[#25836F] focus:ring-[#25836F] accent-[#25836F] shrink-0 cursor-pointer"
                    />
                    <span className="leading-snug text-[#577877]">
                      I agree to the{" "}
                      <button
                        type="button"
                        onClick={() => setShowTermsModal(true)}
                        className="font-semibold text-[#25836F] hover:underline inline cursor-pointer"
                      >
                        Terms of Service
                      </button>{" "}
                      and{" "}
                      <button
                        type="button"
                        onClick={() => setShowPrivacyModal(true)}
                        className="font-semibold text-[#25836F] hover:underline inline cursor-pointer"
                      >
                        Privacy Policy
                      </button>
                      . <span className="text-red-600">*</span>
                    </span>
                  </label>
                  {touched.terms_consent && errors.terms_consent && (
                    <p className="text-[11px] text-red-600 font-medium">{errors.terms_consent}</p>
                  )}

                  {/* Professional Declaration Consent */}
                  <label className="flex items-start gap-2.5 text-xs text-[#162623] cursor-pointer">
                    <input
                      type="checkbox"
                      name="declaration_consent"
                      checked={form.declaration_consent}
                      onChange={update}
                      onBlur={handleBlur}
                      className="mt-0.5 h-4 w-4 rounded border-[#577877]/30 text-[#25836F] focus:ring-[#25836F] accent-[#25836F] shrink-0 cursor-pointer"
                    />
                    <span className="leading-snug text-[#577877]">
                      I declare that all medical registration, qualifications, and authority information provided are accurate and authentic. <span className="text-red-600">*</span>
                    </span>
                  </label>
                  {touched.declaration_consent && errors.declaration_consent && (
                    <p className="text-[11px] text-red-600 font-medium">{errors.declaration_consent}</p>
                  )}
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

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={state === "loading"}
                    className="w-full rounded-xl bg-[#25836F] py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#1d6e5d] active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                  >
                    {state === "loading" ? "Submitting Registration…" : "Submit Doctor Registration"}
                  </button>
                </div>
              </form>

              <div className="pt-1 text-center text-xs text-[#577877]">
                Already registered?{" "}
                <button
                  type="button"
                  onClick={onSwitchToPatientAuth || onBack}
                  className="font-bold text-[#25836F] hover:underline cursor-pointer"
                >
                  Sign in to your account
                </button>
              </div>
            </>
          )}
        </div>

        {/* Footer pinned cleanly to bottom without trailing space */}
        <footer className="w-full max-w-xl mx-auto pt-2 pb-0 text-center text-xs text-[#577877]">
          © 2026 Kaizen Care · Clinician Credentialing Workspace.
        </footer>
      </main>

      {/* Terms of Service Modal */}
      {showTermsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[#25836F] text-2xl">gavel</span>
                <h3 className="text-base font-bold text-[#162623]">Kaizen Care Clinician Terms of Service</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="space-y-3 text-xs text-[#577877] leading-relaxed max-h-72 overflow-y-auto pr-1">
              <p>
                <strong>1. Clinician Scope &amp; Eligibility:</strong> Clinicians registering on Kaizen Care must hold active, unrestricted licenses issued by an officially recognized medical council or regulatory authority.
              </p>
              <p>
                <strong>2. Credential Verification &amp; Access:</strong> Submitting registration does not grant immediate access to patient consultations. Accounts are marked PENDING_VERIFICATION until an authorized Clinic Administrator validates credentials.
              </p>
              <p>
                <strong>3. Clinical Practice Standards:</strong> Clinicians agree to abide by telemedicine practice guidelines, maintain patient confidentiality, and ensure accurate clinical documentation.
              </p>
            </div>
            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="rounded-xl bg-[#25836F] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1d6e5d] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[#25836F] text-2xl">policy</span>
                <h3 className="text-base font-bold text-[#162623]">Kaizen Care Clinician Privacy Policy</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="space-y-3 text-xs text-[#577877] leading-relaxed max-h-72 overflow-y-auto pr-1">
              <p>
                <strong>1. Professional Data Protection:</strong> All clinician identity documents and contact details are encrypted at rest and in transit using industry-standard TLS 1.3 and AES-256 protocols.
              </p>
              <p>
                <strong>2. Confidential Verification:</strong> Uploaded credential details are stored securely and accessible only to authorized clinic administrators and credentialing committees.
              </p>
              <p>
                <strong>3. Teleconsultation Privacy:</strong> All video consultations take place over encrypted peer connections adhering to strict patient-doctor confidentiality.
              </p>
            </div>
            <div className="pt-2 text-right">
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="rounded-xl bg-[#25836F] px-5 py-2 text-xs font-semibold text-white hover:bg-[#1d6e5d] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
