import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { doctorApi } from "../../lib/api";

function ClinicianHeader({ onBack, isModal = false, onClose }) {
  return (
    <header className="bg-[#25836F] text-white px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between shrink-0 shadow-sm rounded-t-[24px]">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#F0F5F7] text-[#125747] flex items-center justify-center font-bold shadow-sm">
          <svg
            width="20"
            height="24"
            viewBox="0 0 35 42"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="h-4.5 w-auto text-[#125747]"
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
          <p className="text-base font-bold tracking-tight text-white leading-tight">
            Kaizen Care
          </p>
          <p className="text-[10px] tracking-[.18em] uppercase text-[#F0F5F7]/80 font-semibold">
            Clinician Workspace
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        {isModal && onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Doctor Registration"
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl text-white hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        ) : onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white hover:text-white bg-white/10 hover:bg-white/20 px-4 py-2 rounded-xl border border-white/20 transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">
              arrow_back
            </span>
            Back to Home
          </button>
        ) : null}
      </div>
    </header>
  );
}

const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi (NCT)",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

export default function DoctorRegistrationScreen({
  onBack,
  onSuccess,
  onSwitchToPatientAuth,
  isModal = false,
  onClose,
}) {
  const inModal = isModal || Boolean(onClose);

  useEffect(() => {
    if (!inModal) return;

    // Save and lock body/html scroll
    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    // Stop Lenis smooth scroll on the background page
    if (typeof window !== "undefined" && window.__lenis) {
      window.__lenis.stop();
    }

    const handleKeyDown = (e) => {
      if (e.key === "Escape" && onClose) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      if (typeof window !== "undefined" && window.__lenis) {
        window.__lenis.start();
      }
    };
  }, [inModal, onClose]);

  const [currentStep, setCurrentStep] = useState(1);
  const [form, setForm] = useState({
    // Personal Information
    full_name: "",
    email: "",
    mobile_number: "",
    date_of_birth: "",
    gender: "",
    state: "",

    // Professional Information
    specialty: "",
    registration_number: "",
    medical_council: "",
    hpr_id: "",
    qualifications: "",
    experience_years: "",
    languages: "",

    // Mandatory Document Uploads
    credential_document: null,
    qualification_certificate: null,
    identity_proof: null,

    // Additional Documents (Optional)
    specialty_certificate: null,
    renewal_proof: null,
    clinic_authorization: null,
    indemnity_insurance: null,

    // Account Security
    password: "",
    confirm_password: "",

    // Consents & Declarations
    terms_consent: false,
    declaration_consent: false,
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showAdditionalDocs, setShowAdditionalDocs] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");
  const [submittedData, setSubmittedData] = useState(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [licenseCheck, setLicenseCheck] = useState({
    checking: false,
    verified: false,
    result: null,
    error: null,
  });

  const handleVerifyLicense = async () => {
    if (!form.registration_number?.trim() || !form.medical_council?.trim()) {
      setLicenseCheck((prev) => ({
        ...prev,
        error: "Please enter your Registration Number and Medical Council to verify.",
      }));
      return;
    }
    setLicenseCheck({ checking: true, verified: false, result: null, error: null });
    try {
      const res = await doctorApi.verifyLicensePrecheck({
        registration_number: form.registration_number.trim(),
        medical_council: form.medical_council.trim(),
        hpr_id: form.hpr_id?.trim() || null,
        full_name: form.full_name?.trim() || "Doctor",
        state_of_practice: form.state,
        specialty: form.specialty,
        hpr_id: form.hpr_id?.trim() || null,
      });
      setLicenseCheck({
        checking: false,
        verified: res.is_valid,
        result: res,
        error: res.is_valid ? null : res.remarks,
      });
      if (res.is_valid && res.qualifications?.length && !form.qualifications) {
        setForm((prev) => ({ ...prev, qualifications: res.qualifications.join(", ") }));
      }
    } catch (err) {
      setLicenseCheck({
        checking: false,
        verified: false,
        result: null,
        error: err.message || "License pre-check failed. Our compliance team will review your certificate manually.",
      });
    }
  };

  const validateField = (name, value, allValues = form) => {
    switch (name) {
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

      case "date_of_birth": {
        if (!value || !value.trim()) return "";
        const dob = new Date(value);
        if (isNaN(dob.getTime())) return "Please enter a valid date of birth.";
        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const m = today.getMonth() - dob.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
          age--;
        }
        if (age < 21) return "Doctor must be at least 21 years of age.";
        if (age > 100) return "Please enter a valid date of birth.";
        return "";
      }

      case "gender":
        return "";

      case "state":
        if (!value || !value.trim()) return "Please select your state of practice.";
        return "";

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
        if (value === "" || value === null || value === undefined) return "";
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

      case "qualification_certificate":
      case "identity_proof":
      case "specialty_certificate":
      case "renewal_proof":
      case "clinic_authorization":
      case "indemnity_insurance": {
        if (!value) return "";
        const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
        if (!allowedTypes.includes(value.type)) {
          return "Document must be a PDF, JPG, or PNG file.";
        }
        if (value.size > 10 * 1024 * 1024) {
          return "File size cannot exceed 10 MB.";
        }
        return "";
      }

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

    if (name === "mobile_number") {
      val = val.replace(/\D/g, "").slice(0, 10);
    }

    const nextForm = { ...form, [name]: val };
    setForm(nextForm);

    if (touched[name] || type === "file") {
      if (type === "file") {
        setTouched((prev) => ({ ...prev, [name]: true }));
      }
      const err = validateField(name, val, nextForm);
      setErrors((prev) => ({ ...prev, [name]: err }));

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

  const validateStep1 = () => {
    const step1Fields = ["full_name", "email", "mobile_number", "state", "date_of_birth"];
    const stepErrors = {};
    const newTouched = { ...touched };
    step1Fields.forEach((field) => {
      newTouched[field] = true;
      const err = validateField(field, form[field], form);
      if (err) stepErrors[field] = err;
    });
    setTouched(newTouched);
    setErrors((prev) => ({ ...prev, ...stepErrors }));
    return Object.keys(stepErrors).length === 0;
  };

  const handleNextFromStep1 = () => {
    if (validateStep1()) {
      setMessage("");
      setState("idle");
      setCurrentStep(2);
    } else {
      setState("error");
      setMessage("Please complete all required personal details correctly.");
    }
  };

  const validateStep2 = () => {
    const step2Fields = ["specialty", "registration_number", "medical_council", "qualifications", "experience_years", "languages"];
    const stepErrors = {};
    const newTouched = { ...touched };
    step2Fields.forEach((field) => {
      newTouched[field] = true;
      const err = validateField(field, form[field], form);
      if (err) stepErrors[field] = err;
    });
    setTouched(newTouched);
    setErrors((prev) => ({ ...prev, ...stepErrors }));
    return Object.keys(stepErrors).length === 0;
  };

  const handleNextFromStep2 = () => {
    if (validateStep2()) {
      setMessage("");
      setState("idle");
      setCurrentStep(3);
    } else {
      setState("error");
      setMessage("Please complete all required professional credentials correctly.");
    }
  };

  const submit = async (event) => {
    event.preventDefault();

    const allTouched = Object.keys(form).reduce((acc, key) => ({ ...acc, [key]: true }), {});
    setTouched(allTouched);

    const validationErrors = validateAll();
    setErrors(validationErrors);

    const errorKeys = Object.keys(validationErrors);
    if (errorKeys.length > 0) {
      setState("error");
      setMessage(validationErrors[errorKeys[0]]);

      const step1Keys = ["full_name", "email", "mobile_number", "state", "date_of_birth", "gender"];
      const step2Keys = ["specialty", "registration_number", "medical_council", "qualifications", "experience_years", "languages"];
      if (errorKeys.some((k) => step1Keys.includes(k))) {
        setCurrentStep(1);
      } else if (errorKeys.some((k) => step2Keys.includes(k))) {
        setCurrentStep(2);
      } else {
        setCurrentStep(3);
      }
      return;
    }

    const experience = form.experience_years !== "" ? Number(form.experience_years) : 0;
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
        date_of_birth: form.date_of_birth ? form.date_of_birth.trim() : null,
        gender: form.gender ? form.gender.trim() : null,
        state: form.state.trim(),
        state_of_practice: form.state.trim(),
        specialty: form.specialty.trim(),
        registration_number: form.registration_number.trim(),
        medical_council: form.medical_council.trim(),
        hpr_id: form.hpr_id?.trim() || null,
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
        payload.medical_council_certificate = form.credential_document;
      }
      if (form.qualification_certificate) {
        payload.qualification_certificate = form.qualification_certificate;
      }
      if (form.identity_proof) {
        payload.identity_proof = form.identity_proof;
      }
      if (form.specialty_certificate) {
        payload.specialty_certificate = form.specialty_certificate;
      }
      if (form.renewal_proof) {
        payload.renewal_proof = form.renewal_proof;
      }
      if (form.clinic_authorization) {
        payload.clinic_authorization = form.clinic_authorization;
      }
      if (form.indemnity_insurance) {
        payload.indemnity_insurance = form.indemnity_insurance;
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

  const optionalDocsCount = [
    form.specialty_certificate,
    form.renewal_proof,
    form.clinic_authorization,
    form.indemnity_insurance,
  ].filter(Boolean).length;

  const content = (
    <div
      data-lenis-prevent="true"
      className={`font-sans flex flex-col text-[#162623] bg-[#F0F5F7] ${
        inModal
          ? "w-full max-h-[90vh] rounded-[24px] shadow-2xl overflow-hidden border border-[#577877]/20 flex flex-col"
          : "min-h-screen lg:h-screen lg:max-h-screen lg:overflow-hidden"
      }`}
    >
      {/* Top Header with Logo and Back/Close Button */}
      <ClinicianHeader onBack={onBack} isModal={inModal} onClose={onClose} />

      <main
        data-lenis-prevent="true"
        className={`flex-1 flex flex-col justify-between p-6 sm:p-8 w-full mx-auto overflow-y-auto overscroll-contain ${
          inModal ? "max-h-[calc(90vh-64px)]" : "max-w-4xl lg:overflow-hidden"
        }`}
      >
        {/* Title */}
        <div className="w-full pb-3 border-b border-[#577877]/10 flex flex-col gap-1 shrink-0">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#162623] leading-none">
              Doctor Registration
            </h2>
          </div>
        </div>

        {state === "success" && submittedData ? (
          <div className="my-auto rounded-[24px] border border-[#25836F]/30 bg-white p-6 sm:p-8 shadow-sm space-y-4 animate-in fade-in duration-300 max-w-lg mx-auto w-full">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-[#EEF6F3] text-[#25836F] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-3xl font-bold">check_circle</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300/60 uppercase tracking-wider">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                    PENDING_VERIFICATION
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-[#162623] mt-1">
                  Registration Submitted Successfully
                </h3>
              </div>
            </div>

            <div className="space-y-2 text-xs text-[#577877] leading-relaxed">
              <p>
                Thank you, <strong>{submittedData.full_name}</strong>. Your clinician profile and credentials have been securely recorded.
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
                  <strong className="text-amber-900 block font-semibold text-xs">
                    Consultation Access Restriction:
                  </strong>
                  <span className="text-amber-900/90 text-xs leading-relaxed">
                    Under Indian Telemedicine Practice Guidelines, your account remains in{" "}
                    <span className="font-bold underline">PENDING_VERIFICATION</span>. Access to consultation rooms and e-prescriptions is enabled once an administrator verifies credentials.
                  </span>
                </div>
              </div>
              <div className="pt-2 border-t border-amber-200/60 grid grid-cols-2 gap-2 text-xs text-zinc-600">
                <div>
                  <span className="text-zinc-500 block text-[11px]">Registration No:</span>
                  <span className="font-semibold text-zinc-800">{submittedData.registration_number}</span>
                </div>
                <div>
                  <span className="text-zinc-500 block text-[11px]">Account Status:</span>
                  <span className="font-semibold text-amber-700">Pending Review</span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => {
                  if (onSuccess) {
                    onSuccess(submittedData.email);
                  }
                }}
                className="w-full py-3 text-sm font-bold bg-[#25836F] text-white rounded-xl shadow-md hover:bg-[#1d6e5d] transition cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Proceed to Email Verification</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="w-full py-3 text-sm font-semibold border border-[#577877]/30 bg-white text-[#577877] hover:border-[#25836F] hover:text-[#162623] rounded-xl transition cursor-pointer"
                >
                  Return Home
                </button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-4 pt-3 flex-1 flex flex-col justify-between">
            {/* STEP 1: Personal Information */}
            {currentStep === 1 && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 pb-2 border-b border-[#577877]/15">
                  <span className="material-symbols-outlined text-[#25836F] text-base">person</span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#162623]">
                    Personal Information &amp; Contact Details
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Full Name */}
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                      <span>Full Name <span className="text-red-600">*</span></span>
                    </label>
                    <input
                      name="full_name"
                      type="text"
                      value={form.full_name}
                      onChange={update}
                      onBlur={handleBlur}
                      placeholder="Dr. Harshavardhan M V"
                      className={`w-full h-11 px-4 rounded-xl border bg-white text-sm text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                        touched.full_name && errors.full_name
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.full_name && errors.full_name && (
                      <p className="text-xs text-red-600 font-medium leading-none mt-1 truncate">{errors.full_name}</p>
                    )}
                  </div>

                  {/* Email Address */}
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                      <span>Email Address <span className="text-red-600">*</span></span>
                    </label>
                    <input
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={update}
                      onBlur={handleBlur}
                      placeholder="doctor@clinic.com"
                      className={`w-full h-11 px-4 rounded-xl border bg-white text-sm text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                        touched.email && errors.email
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.email && errors.email && (
                      <p className="text-xs text-red-600 font-medium leading-none mt-1 truncate">{errors.email}</p>
                    )}
                  </div>

                  {/* Mobile Number */}
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                      <span>Mobile Number <span className="text-red-600">*</span></span>
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
                      placeholder="10 digit mobile number"
                      className={`w-full h-11 px-4 rounded-xl border bg-white text-sm text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                        touched.mobile_number && errors.mobile_number
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.mobile_number && errors.mobile_number && (
                      <p className="text-xs text-red-600 font-medium leading-none mt-1 truncate">{errors.mobile_number}</p>
                    )}
                  </div>

                  {/* State of Practice */}
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                      <span>State of Practice <span className="text-red-600">*</span></span>
                    </label>
                    <select
                      name="state"
                      value={form.state}
                      onChange={update}
                      onBlur={handleBlur}
                      className={`w-full h-11 px-4 rounded-xl border bg-white text-sm text-[#162623] focus:outline-none transition shadow-2xs box-border ${
                        touched.state && errors.state
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    >
                      <option value="">Select State of Practice</option>
                      {INDIAN_STATES.map((st) => (
                        <option key={st} value={st}>
                          {st}
                        </option>
                      ))}
                    </select>
                    {touched.state && errors.state && (
                      <p className="text-xs text-red-600 font-medium leading-none mt-1 truncate">{errors.state}</p>
                    )}
                  </div>

                  {/* Date of Birth */}
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                      <span>Date of Birth</span>
                      <span className="font-normal text-[11px] text-[#577877]">(Age 21+)</span>
                    </label>
                    <input
                      name="date_of_birth"
                      type="date"
                      value={form.date_of_birth}
                      onChange={update}
                      onBlur={handleBlur}
                      className={`w-full h-11 px-4 rounded-xl border bg-white text-sm text-[#162623] focus:outline-none transition shadow-2xs box-border ${
                        touched.date_of_birth && errors.date_of_birth
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.date_of_birth && errors.date_of_birth && (
                      <p className="text-xs text-red-600 font-medium leading-none mt-1 truncate">{errors.date_of_birth}</p>
                    )}
                  </div>

                  {/* Gender (Optional) */}
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                      <span>Gender</span>
                      <span className="font-normal text-[11px] text-[#577877]">(optional)</span>
                    </label>
                    <select
                      name="gender"
                      value={form.gender}
                      onChange={update}
                      onBlur={handleBlur}
                      className="w-full h-11 px-4 rounded-xl border border-[#577877]/25 bg-white text-sm text-[#162623] focus:border-[#25836F] focus:outline-none transition shadow-2xs box-border"
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Professional Information & Credentials */}
            {currentStep === 2 && (
              <div className="space-y-3 animate-in fade-in duration-200">
                <div className="flex items-center gap-2 pb-2 border-b border-[#577877]/15">
                  <span className="material-symbols-outlined text-[#25836F] text-base">medical_services</span>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#162623]">
                    Professional Information &amp; Credentials
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Medical Specialization */}
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                      <span>Medical Specialization <span className="text-red-600">*</span></span>
                    </label>
                    <select
                      name="specialty"
                      value={form.specialty}
                      onChange={update}
                      onBlur={handleBlur}
                      className={`w-full h-11 px-4 rounded-xl border bg-white text-sm text-[#162623] focus:outline-none transition shadow-2xs box-border ${
                        touched.specialty && errors.specialty
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
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
                      <p className="text-xs text-red-600 font-medium leading-none mt-1 truncate">{errors.specialty}</p>
                    )}
                  </div>

                  {/* Medical Registration Number */}
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                      <span>Registration Number <span className="text-red-600">*</span></span>
                    </label>
                    <input
                      name="registration_number"
                      type="text"
                      value={form.registration_number}
                      onChange={update}
                      onBlur={handleBlur}
                      placeholder="e.g. KMC-123456"
                      className={`w-full h-11 px-4 rounded-xl border bg-white text-sm text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                        touched.registration_number && errors.registration_number
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.registration_number && errors.registration_number && (
                      <p className="text-xs text-red-600 font-medium leading-none mt-1 truncate">{errors.registration_number}</p>
                    )}
                  </div>

                  {/* Medical Council / Authority */}
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                      <span>Medical Council / Authority <span className="text-red-600">*</span></span>
                    </label>
                    <input
                      name="medical_council"
                      type="text"
                      value={form.medical_council}
                      onChange={update}
                      onBlur={handleBlur}
                      placeholder="e.g. Karnataka Medical Council, NMC"
                      className={`w-full h-11 px-4 rounded-xl border bg-white text-sm text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                        touched.medical_council && errors.medical_council
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.medical_council && errors.medical_council && (
                      <p className="text-xs text-red-600 font-medium leading-none mt-1 truncate">{errors.medical_council}</p>
                    )}
                  </div>

                  {/* Real-Time NMC / SMC License Pre-Check Trigger & Badge */}
                  <div className="rounded-xl border border-[#25836F]/20 bg-[#F0F5F7]/60 p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-[#162623]">
                        <span className="material-symbols-outlined text-sm text-[#25836F]">verified_user</span>
                        <span>Official Medical Council Verification</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleVerifyLicense}
                        disabled={licenseCheck.checking || !form.registration_number.trim() || !form.medical_council.trim()}
                        className="inline-flex items-center gap-1 text-xs font-bold text-white bg-[#25836F] hover:bg-[#1f6d5c] disabled:opacity-50 px-2.5 py-1 rounded-lg transition cursor-pointer"
                      >
                        {licenseCheck.checking ? (
                          <>
                            <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>
                            <span>Verifying…</span>
                          </>
                        ) : (
                          <>
                            <span className="material-symbols-outlined text-xs">search_check</span>
                            <span>Verify with NMC / SMC</span>
                          </>
                        )}
                      </button>
                    </div>

                    {licenseCheck.verified && licenseCheck.result && (
                      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-900 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-emerald-800">
                          <span className="material-symbols-outlined text-sm text-emerald-600">check_circle</span>
                          <span>{licenseCheck.result.status_label}</span>
                        </div>
                        <p className="text-[11px] text-emerald-700 leading-relaxed">
                          {licenseCheck.result.remarks}
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1 text-[10px] text-emerald-800 font-medium">
                          <span className="bg-emerald-100 px-1.5 py-0.5 rounded">Source: {licenseCheck.result.verification_source}</span>
                          <span className="bg-emerald-100 px-1.5 py-0.5 rounded">Match: {Math.round(licenseCheck.result.confidence_score * 100)}%</span>
                          <span className="bg-emerald-100 px-1.5 py-0.5 rounded">Receipt: {licenseCheck.result.verification_receipt_id}</span>
                        </div>
                      </div>
                    )}

                    {licenseCheck.result && !licenseCheck.verified && licenseCheck.result.status === "REGISTRY_NOT_FOUND" && (
                      <div className="rounded-lg bg-amber-50 border border-amber-300 p-2.5 text-xs text-amber-900 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-amber-900">
                          <span className="material-symbols-outlined text-sm text-amber-600">warning</span>
                          <span>{licenseCheck.result.status_label}</span>
                        </div>
                        <p className="text-[11px] text-amber-800 leading-relaxed">
                          {licenseCheck.result.remarks}
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1 text-[10px] font-medium">
                          <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded border border-amber-300">Status: Unverified</span>
                          <span className="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded border border-amber-300">Action: Certificate Upload Required</span>
                        </div>
                      </div>
                    )}

                    {licenseCheck.result && !licenseCheck.verified && licenseCheck.result.status === "NAME_MISMATCH" && (
                      <div className="rounded-lg bg-red-50 border border-red-300 p-2.5 text-xs text-red-900 space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-red-900">
                          <span className="material-symbols-outlined text-sm text-red-600">gavel</span>
                          <span>{licenseCheck.result.status_label}</span>
                        </div>
                        <p className="text-[11px] text-red-800 leading-relaxed">
                          {licenseCheck.result.remarks}
                        </p>
                        <div className="flex flex-wrap gap-2 pt-1 text-[10px] font-medium">
                          <span className="bg-red-100 text-red-900 px-1.5 py-0.5 rounded border border-red-300">Fraud Alert: Identity Mismatch</span>
                          <span className="bg-red-100 text-red-900 px-1.5 py-0.5 rounded border border-red-300">Status: Rejected</span>
                        </div>
                      </div>
                    )}

                    {licenseCheck.error && !licenseCheck.result && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900 flex items-start gap-1.5">
                        <span className="material-symbols-outlined text-sm text-amber-600 shrink-0 mt-0.5">warning</span>
                        <p className="text-[11px] text-amber-800">{licenseCheck.error}</p>
                      </div>
                    )}

                    {/* Ayushman Bharat HP-ID (Optional) */}
                    <div className="pt-1 border-t border-[#577877]/10">
                      <label className="flex items-center justify-between text-[11px] font-medium text-[#577877] mb-1">
                        <span>Ayushman Bharat HP-ID (Optional ABDM Health ID)</span>
                        <span className="text-[10px] text-[#25836F]">e.g. 14-digit or alias@hpr</span>
                      </label>
                      <input
                        name="hpr_id"
                        type="text"
                        value={form.hpr_id || ""}
                        onChange={update}
                        placeholder="e.g. 12-3456-7890-1234 or dr.name@hpr"
                        className={`w-full h-9 px-3 rounded-lg border bg-white text-xs text-[#162623] placeholder:text-[#577877]/40 focus:outline-none transition ${
                          form.hpr_id && !(/^(\d{2}-\d{4}-\d{4}-\d{4}|\d{14}|[a-zA-Z0-9._-]+@(hpr|abdm|hpr\.abdm))$/i.test(form.hpr_id.trim()))
                            ? "border-red-400 focus:border-red-500"
                            : "border-[#577877]/20 focus:border-[#25836F]"
                        }`}
                      />
                      {form.hpr_id && !(/^(\d{2}-\d{4}-\d{4}-\d{4}|\d{14}|[a-zA-Z0-9._-]+@(hpr|abdm|hpr\.abdm))$/i.test(form.hpr_id.trim())) && (
                        <p className="text-[10px] text-red-600 mt-1">
                          ⚠️ Invalid ABDM HP-ID format. Must be 14 digits (e.g. 12-3456-7890-1234) or valid @hpr handle.
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Qualifications */}
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                      <span>Qualifications <span className="text-red-600">*</span></span>
                    </label>
                    <input
                      name="qualifications"
                      type="text"
                      value={form.qualifications}
                      onChange={update}
                      onBlur={handleBlur}
                      placeholder="MBBS, MD, DNB (comma separated)"
                      className={`w-full h-11 px-4 rounded-xl border bg-white text-sm text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                        touched.qualifications && errors.qualifications
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.qualifications && errors.qualifications && (
                      <p className="text-xs text-red-600 font-medium leading-none mt-1 truncate">{errors.qualifications}</p>
                    )}
                  </div>

                  {/* Experience (Years) */}
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                      <span>Experience (Years)</span>
                      <span className="font-normal text-[11px] text-[#577877]">(optional)</span>
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
                      className={`w-full h-11 px-4 rounded-xl border bg-white text-sm text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                        touched.experience_years && errors.experience_years
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.experience_years && errors.experience_years && (
                      <p className="text-xs text-red-600 font-medium leading-none mt-1 truncate">{errors.experience_years}</p>
                    )}
                  </div>

                  {/* Supported Languages */}
                  <div className="space-y-1">
                    <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                      <span>Supported Languages <span className="text-red-600">*</span></span>
                    </label>
                    <input
                      name="languages"
                      type="text"
                      value={form.languages}
                      onChange={update}
                      onBlur={handleBlur}
                      placeholder="English, Hindi (comma separated)"
                      className={`w-full h-11 px-4 rounded-xl border bg-white text-sm text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                        touched.languages && errors.languages
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.languages && errors.languages && (
                      <p className="text-xs text-red-600 font-medium leading-none mt-1 truncate">{errors.languages}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Mandatory Document Uploads & Account Security */}
            {currentStep === 3 && (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* 3A. Mandatory Document Uploads & Optional Attachments */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between pb-2 border-b border-[#577877]/15">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#25836F] text-base">attachment</span>
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#162623]">
                        Documents (PDF, JPG, PNG · Max 10 MB)
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAdditionalDocs(true)}
                      className="text-xs font-semibold text-[#25836F] hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">add_circle</span>
                      <span>Documents</span>
                      {optionalDocsCount > 0 && (
                        <span className="px-2 py-0.5 rounded-lg bg-[#25836F] text-white text-[10px] font-bold">
                          {optionalDocsCount}
                        </span>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* 1. Medical Council Registration Certificate */}
                    <div className="space-y-1">
                      <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                        <span>1. Council Certificate <span className="text-red-600">*</span></span>
                      </label>
                      <input
                        name="credential_document"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        onChange={update}
                        onBlur={handleBlur}
                        className={`w-full h-11 px-3 py-2 rounded-xl border bg-white text-xs text-[#162623] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#F0F5F7] file:text-[#25836F] hover:file:bg-[#25836F]/10 focus:outline-none transition cursor-pointer box-border ${
                          touched.credential_document && errors.credential_document
                            ? "border-red-500 focus:border-red-500"
                            : "border-[#577877]/25 focus:border-[#25836F]"
                        }`}
                      />
                      {touched.credential_document && errors.credential_document && (
                        <p className="text-xs text-red-600 font-medium leading-none mt-1 truncate">{errors.credential_document}</p>
                      )}
                    </div>

                    {/* 2. Recognized Medical Qualification Certificate */}
                    <div className="space-y-1">
                      <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                        <span>2. Qualification Certificate</span>
                      </label>
                      <input
                        name="qualification_certificate"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        onChange={update}
                        onBlur={handleBlur}
                        className={`w-full h-11 px-3 py-2 rounded-xl border bg-white text-xs text-[#162623] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#F0F5F7] file:text-[#25836F] hover:file:bg-[#25836F]/10 focus:outline-none transition cursor-pointer box-border ${
                          touched.qualification_certificate && errors.qualification_certificate
                            ? "border-red-500 focus:border-red-500"
                            : "border-[#577877]/25 focus:border-[#25836F]"
                        }`}
                      />
                      {touched.qualification_certificate && errors.qualification_certificate && (
                        <p className="text-xs text-red-600 font-medium leading-none mt-1 truncate">{errors.qualification_certificate}</p>
                      )}
                    </div>

                    {/* 3. Government-Issued Identity Proof (Spans full width in 2-col grid) */}
                    <div className="space-y-1 sm:col-span-2">
                      <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                        <span>3. Government Identity Proof</span>
                        <span className="font-normal text-[11px] text-[#577877]">(Aadhaar / Passport / DL / PAN)</span>
                      </label>
                      <input
                        name="identity_proof"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        onChange={update}
                        onBlur={handleBlur}
                        className={`w-full h-11 px-3 py-2 rounded-xl border bg-white text-xs text-[#162623] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#F0F5F7] file:text-[#25836F] hover:file:bg-[#25836F]/10 focus:outline-none transition cursor-pointer box-border ${
                          touched.identity_proof && errors.identity_proof
                            ? "border-red-500 focus:border-red-500"
                            : "border-[#577877]/25 focus:border-[#25836F]"
                        }`}
                      />
                      {touched.identity_proof && errors.identity_proof && (
                        <p className="text-xs text-red-600 font-medium leading-none mt-1 truncate">{errors.identity_proof}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3B. Account Security & Consents */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 pb-2 border-b border-[#577877]/15">
                    <span className="material-symbols-outlined text-[#25836F] text-base">lock</span>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#162623]">
                      Account Security &amp; Consents
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Password */}
                    <div className="space-y-1">
                      <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                        <span>Password <span className="text-red-600">*</span></span>
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
                          className={`w-full h-11 pl-4 pr-10 rounded-xl border bg-white text-sm text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                            touched.password && errors.password
                              ? "border-red-500 focus:border-red-500"
                              : "border-[#577877]/25 focus:border-[#25836F]"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#577877] hover:text-[#162623] cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-base">
                            {showPassword ? "visibility_off" : "visibility"}
                          </span>
                        </button>
                      </div>
                      {touched.password && errors.password && (
                        <p className="text-xs text-red-600 font-medium leading-none mt-1 truncate">{errors.password}</p>
                      )}
                    </div>

                    {/* Confirm Password */}
                    <div className="space-y-1">
                      <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                        <span>Confirm Password <span className="text-red-600">*</span></span>
                      </label>
                      <div className="relative">
                        <input
                          name="confirm_password"
                          type={showPassword ? "text" : "password"}
                          autoComplete="new-password"
                          value={form.confirm_password}
                          onChange={update}
                          onBlur={handleBlur}
                          placeholder="Re-enter password"
                          className={`w-full h-11 px-4 rounded-xl border bg-white text-sm text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                            touched.confirm_password && errors.confirm_password
                              ? "border-red-500 focus:border-red-500"
                              : "border-[#577877]/25 focus:border-[#25836F]"
                          }`}
                        />
                      </div>
                      {touched.confirm_password && errors.confirm_password && (
                        <p className="text-xs text-red-600 font-medium leading-none mt-1 truncate">{errors.confirm_password}</p>
                      )}
                    </div>

                    {/* Consents (Spans full width) */}
                    <div className="space-y-1 sm:col-span-2">
                      <label className="flex items-center justify-between text-xs font-semibold text-[#162623]">
                        <span>Declarations &amp; Privacy <span className="text-red-600">*</span></span>
                      </label>
                      <div className="h-11 flex flex-col justify-center space-y-1.5 px-1">
                        <label className="flex items-center gap-2 text-[#162623] cursor-pointer leading-tight">
                          <input
                            type="checkbox"
                            name="terms_consent"
                            checked={form.terms_consent}
                            onChange={update}
                            onBlur={handleBlur}
                            className="h-4 w-4 rounded-lg border-[#577877]/30 text-[#25836F] accent-[#25836F] shrink-0 cursor-pointer"
                          />
                          <span className="text-[#577877] text-xs truncate">
                            Agree to{" "}
                            <button
                              type="button"
                              onClick={() => setShowTermsModal(true)}
                              className="font-semibold text-[#25836F] hover:underline cursor-pointer"
                            >
                              Terms
                            </button>{" "}
                            &amp;{" "}
                            <button
                              type="button"
                              onClick={() => setShowPrivacyModal(true)}
                              className="font-semibold text-[#25836F] hover:underline cursor-pointer"
                            >
                              Privacy Policy
                            </button>{" "}
                            <span className="text-red-600">*</span>
                          </span>
                        </label>

                        <label className="flex items-center gap-2 text-[#162623] cursor-pointer leading-tight">
                          <input
                            type="checkbox"
                            name="declaration_consent"
                            checked={form.declaration_consent}
                            onChange={update}
                            onBlur={handleBlur}
                            className="h-4 w-4 rounded-lg border-[#577877]/30 text-[#25836F] accent-[#25836F] shrink-0 cursor-pointer"
                          />
                          <span className="text-[#577877] text-xs truncate">
                            Declare credentials authentic under Telehealth Guidelines <span className="text-red-600">*</span>
                          </span>
                        </label>
                      </div>
                      {(touched.terms_consent && errors.terms_consent) || (touched.declaration_consent && errors.declaration_consent) ? (
                        <p className="text-xs text-red-600 font-medium leading-none mt-1 truncate">
                          {errors.terms_consent || errors.declaration_consent}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message if present */}
            {message && (
              <div
                className={`py-2 px-4 rounded-xl border text-xs font-medium leading-tight ${
                  state === "error"
                    ? "bg-red-50 text-red-600 border-red-200"
                    : "bg-teal-50 text-[#25836F] border-teal-200"
                }`}
              >
                {state === "error" ? "⚠️ " : "✅ "}
                {message}
              </div>
            )}

            {/* Step Action Navigation Controls with Full-Width Continue Button */}
            <div className="flex flex-col gap-3 pt-3 border-t border-[#577877]/10 shrink-0">
              {currentStep === 1 && (
                <>
                  <button
                    type="button"
                    onClick={handleNextFromStep1}
                    className="w-full py-3 text-sm font-bold bg-[#25836F] text-white rounded-xl shadow-md hover:bg-[#1d6e5d] transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Continue to Professional Details</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                  <div className="text-center text-xs text-[#577877]">
                    Already registered?{" "}
                    <button
                      type="button"
                      onClick={onSwitchToPatientAuth || onBack}
                      className="font-bold text-[#25836F] hover:underline cursor-pointer"
                    >
                      Sign in
                    </button>
                  </div>
                </>
              )}

              {currentStep === 2 && (
                <>
                  <button
                    type="button"
                    onClick={handleNextFromStep2}
                    className="w-full py-3 text-sm font-bold bg-[#25836F] text-white rounded-xl shadow-md hover:bg-[#1d6e5d] transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    <span>Continue to Verification &amp; Security</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentStep(1);
                      setMessage("");
                    }}
                    className="text-xs font-semibold text-[#577877] hover:text-[#162623] flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    <span>Back to Personal Info</span>
                  </button>
                </>
              )}

              {currentStep === 3 && (
                <>
                  <button
                    type="submit"
                    disabled={state === "loading"}
                    className="w-full py-3 text-sm font-bold bg-[#25836F] text-white rounded-xl shadow-md hover:bg-[#1d6e5d] transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2"
                  >
                    {state === "loading" ? "Submitting Registration…" : "Submit Doctor Registration"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentStep(2);
                      setMessage("");
                    }}
                    className="text-xs font-semibold text-[#577877] hover:text-[#162623] flex items-center justify-center gap-1 transition cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    <span>Back to Credentials</span>
                  </button>
                </>
              )}
            </div>
          </form>
        )}

        {/* Footer */}
        <footer className="w-full text-center text-[11px] text-[#577877] pt-2">
          © 2026 Kaizen Care · Clinician Credentialing Workspace.
        </footer>
      </main>

      {/* Additional Documents Modal */}
      {showAdditionalDocs && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#162623]/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-[24px] bg-white border border-[#577877]/20 p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#25836F] text-xl">folder_open</span>
                <h3 className="text-sm font-bold text-[#162623]">Additional Documents (Optional)</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAdditionalDocs(false)}
                className="p-1.5 rounded-xl text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <p className="text-xs text-[#577877]">
              Attach additional credentials if applicable to your clinical practice or specialization (PDF, JPG, or PNG, max 10 MB each).
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-[#162623] mb-1">
                  Postgraduate / Specialty Certificate (MD, MS, DNB, Diploma)
                </label>
                <input
                  name="specialty_certificate"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={update}
                  className="w-full h-11 px-3 py-2 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#F0F5F7] file:text-[#25836F]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#162623] mb-1">
                  Registration Renewal Proof
                </label>
                <input
                  name="renewal_proof"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={update}
                  className="w-full h-11 px-3 py-2 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#F0F5F7] file:text-[#25836F]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#162623] mb-1">
                  Clinic Authorization Letter / Hospital Affiliation
                </label>
                <input
                  name="clinic_authorization"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={update}
                  className="w-full h-11 px-3 py-2 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#F0F5F7] file:text-[#25836F]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#162623] mb-1">
                  Professional Indemnity Insurance Policy
                </label>
                <input
                  name="indemnity_insurance"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={update}
                  className="w-full h-11 px-3 py-2 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#F0F5F7] file:text-[#25836F]"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowAdditionalDocs(false)}
                className="w-full py-3 text-sm font-bold bg-[#25836F] text-white rounded-xl hover:bg-[#1d6e5d] shadow-md transition cursor-pointer"
              >
                Save &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terms of Service Modal */}
      {showTermsModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-[#162623]/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-[24px] bg-white border border-[#577877]/20 p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#25836F] text-xl">gavel</span>
                <h3 className="text-sm font-bold text-[#162623]">Kaizen Care Clinician Terms of Service</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="p-1.5 rounded-xl text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="space-y-2.5 text-xs text-[#577877] leading-relaxed max-h-60 overflow-y-auto pr-2">
              <p>
                <strong>1. Clinician Scope &amp; Eligibility:</strong> Clinicians registering on Kaizen Care must hold active, unrestricted licenses issued by an officially recognized medical council or regulatory authority (NMC/State Medical Council).
              </p>
              <p>
                <strong>2. Credential Verification &amp; Access:</strong> Submitting registration does not grant immediate access to patient consultations. Accounts are marked PENDING_VERIFICATION until an authorized Clinic Administrator validates credentials.
              </p>
              <p>
                <strong>3. Clinical Practice Standards:</strong> Clinicians agree to abide by Indian Telemedicine Practice Guidelines, maintain patient confidentiality, and ensure accurate clinical documentation.
              </p>
            </div>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="w-full py-3 text-sm font-bold bg-[#25836F] text-white rounded-xl hover:bg-[#1d6e5d] shadow-md transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4 bg-[#162623]/70 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-[24px] bg-white border border-[#577877]/20 p-6 sm:p-8 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#25836F] text-xl">policy</span>
                <h3 className="text-sm font-bold text-[#162623]">Kaizen Care Clinician Privacy Policy</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="p-1.5 rounded-xl text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="space-y-2.5 text-xs text-[#577877] leading-relaxed max-h-60 overflow-y-auto pr-2">
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
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="w-full py-3 text-sm font-bold bg-[#25836F] text-white rounded-xl hover:bg-[#1d6e5d] shadow-md transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (inModal) {
    const modalMarkup = (
      <div
        data-lenis-prevent="true"
        data-lenis-prevent-wheel="true"
        data-lenis-prevent-touch="true"
        className="fixed inset-0 z-[9999] overflow-y-auto bg-[#162623]/80 backdrop-blur-sm flex min-h-screen items-center justify-center p-3 sm:p-4 md:p-6 animate-in fade-in duration-200"
        onClick={(e) => {
          if (e.target === e.currentTarget && onClose) onClose();
        }}
      >
        <div
          data-lenis-prevent="true"
          className="relative w-full max-w-2xl my-auto animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {content}
        </div>
      </div>
    );

    return typeof document !== "undefined"
      ? createPortal(modalMarkup, document.body)
      : modalMarkup;
  }

  return content;
}
