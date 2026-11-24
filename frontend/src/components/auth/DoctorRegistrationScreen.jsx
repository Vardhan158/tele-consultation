import { useState, useEffect } from "react";
import { doctorApi } from "../../lib/api";

function ClinicianHeader({ onBack, isModal = false, onClose }) {
  return (
    <header className="bg-[#25836F] text-white px-4 sm:px-6 py-2.5 flex items-center justify-between shrink-0 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-none bg-[#F0F5F7] text-[#125747] flex items-center justify-center font-bold shadow-sm">
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
          <p className="text-[9px] tracking-[.18em] uppercase text-[#F0F5F7]/80 font-semibold">
            Clinician Workspace
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5">
        <span className="font-semibold text-[10px] tracking-wide text-white/90 bg-white/15 px-2.5 py-0.5 rounded-none border border-white/20 uppercase hidden sm:inline-block">
          Clinician Portal
        </span>
        {isModal && onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Doctor Registration"
            className="inline-flex items-center justify-center w-8 h-8 rounded-none text-white hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        ) : onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-white hover:text-white bg-white/10 hover:bg-white/20 px-3.5 py-1.5 rounded-none border border-white/20 transition cursor-pointer"
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
    const handleKeyDown = (e) => {
      if (e.key === "Escape" && onClose) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
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
    qualifications: "",
    experience_years: "",
    languages: "",

    // Mandatory Document Uploads
    credential_document: null,        // Medical Council Registration Certificate
    qualification_certificate: null,  // Recognized Medical Qualification Certificate (MBBS / Applicable)
    identity_proof: null,             // Government-Issued Identity Proof

    // Additional Documents (Optional)
    specialty_certificate: null,      // Postgraduate / Specialty Certificate
    renewal_proof: null,              // Registration Renewal Proof
    clinic_authorization: null,       // Clinic Authorization
    indemnity_insurance: null,        // Professional Indemnity Insurance

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

      case "qualification_certificate": {
        if (!value) return "";
        const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
        if (!allowedTypes.includes(value.type)) {
          return "Certificate must be a PDF, JPG, or PNG file.";
        }
        if (value.size > 10 * 1024 * 1024) {
          return "File size cannot exceed 10 MB.";
        }
        return "";
      }

      case "identity_proof": {
        if (!value) return "";
        const allowedTypes = ["application/pdf", "image/jpeg", "image/png"];
        if (!allowedTypes.includes(value.type)) {
          return "Identity proof must be a PDF, JPG, or PNG file.";
        }
        if (value.size > 10 * 1024 * 1024) {
          return "File size cannot exceed 10 MB.";
        }
        return "";
      }

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
      className={`font-sans flex flex-col text-[#162623] ${
        inModal
          ? "relative w-full max-w-4xl max-h-[96vh] bg-[#F0F5F7] rounded-none shadow-2xl overflow-hidden border border-[#577877]/20 animate-in zoom-in-95 duration-200"
          : "min-h-screen lg:h-screen lg:max-h-screen bg-[#F0F5F7] lg:overflow-hidden"
      }`}
    >
      {/* Top Header with Logo and Back/Close Button */}
      <ClinicianHeader onBack={onBack} isModal={inModal} onClose={onClose} />

      <main
        className={`flex-1 flex flex-col justify-between p-3.5 sm:p-4 lg:p-4.5 xl:p-5 max-w-6xl w-full mx-auto overflow-y-auto ${
          inModal ? "max-h-[calc(96vh-52px)]" : "lg:overflow-hidden"
        }`}
      >
        {/* Title & 3-Step Story Stepper */}
        <div className="w-full pb-1.5 border-b border-[#577877]/10 flex flex-col md:flex-row md:items-center md:justify-between gap-2 shrink-0">
          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#162623] leading-none">
              Doctor Registration
            </h2>
            <p className="text-[11px] text-[#577877] mt-0.5">
              {currentStep === 1 && "Step 1 of 3: Personal Information & Contact Details"}
              {currentStep === 2 && "Step 2 of 3: Medical Credentials & Specialization"}
              {currentStep === 3 && "Step 3 of 3: Verification Documents & Account Security"}
            </p>
          </div>

          {/* Stepper Progress Indicator */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 bg-white px-3 py-1 rounded-none border border-[#577877]/15 shadow-2xs self-start md:self-auto">
            {/* Step 1 Pill */}
            <button
              type="button"
              onClick={() => {
                if (currentStep > 1) {
                  setCurrentStep(1);
                  setMessage("");
                }
              }}
              disabled={currentStep === 1}
              className={`flex items-center gap-1.5 text-xs font-semibold transition ${
                currentStep === 1
                  ? "text-[#25836F] font-bold"
                  : currentStep > 1
                  ? "text-[#162623] hover:text-[#25836F] cursor-pointer"
                  : "text-[#577877]/60 cursor-not-allowed"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-none flex items-center justify-center text-[10px] font-bold transition-all ${
                  currentStep > 1
                    ? "bg-[#25836F] text-white"
                    : currentStep === 1
                    ? "bg-[#25836F] text-white ring-2 ring-[#25836F]/20"
                    : "bg-[#F0F5F7] text-[#577877]"
                }`}
              >
                {currentStep > 1 ? (
                  <span className="material-symbols-outlined text-[12px]">check</span>
                ) : (
                  "1"
                )}
              </span>
              <span>1. Personal</span>
            </button>

            <span className="text-[#577877]/30 text-xs">/</span>

            {/* Step 2 Pill */}
            <button
              type="button"
              onClick={() => {
                if (currentStep > 2) {
                  setCurrentStep(2);
                  setMessage("");
                } else if (currentStep === 1) {
                  handleNextFromStep1();
                }
              }}
              className={`flex items-center gap-1.5 text-xs font-semibold transition ${
                currentStep === 2
                  ? "text-[#25836F] font-bold"
                  : currentStep > 2
                  ? "text-[#162623] hover:text-[#25836F] cursor-pointer"
                  : "text-[#577877]/60"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-none flex items-center justify-center text-[10px] font-bold transition-all ${
                  currentStep > 2
                    ? "bg-[#25836F] text-white"
                    : currentStep === 2
                    ? "bg-[#25836F] text-white ring-2 ring-[#25836F]/20"
                    : "bg-[#F0F5F7] text-[#577877]"
                }`}
              >
                {currentStep > 2 ? (
                  <span className="material-symbols-outlined text-[12px]">check</span>
                ) : (
                  "2"
                )}
              </span>
              <span>2. Credentials</span>
            </button>

            <span className="text-[#577877]/30 text-xs">/</span>

            {/* Step 3 Pill */}
            <div
              className={`flex items-center gap-1.5 text-xs font-semibold ${
                currentStep === 3
                  ? "text-[#25836F] font-bold"
                  : "text-[#577877]/60"
              }`}
            >
              <span
                className={`w-5 h-5 rounded-none flex items-center justify-center text-[10px] font-bold transition-all ${
                  currentStep === 3
                    ? "bg-[#25836F] text-white ring-2 ring-[#25836F]/20"
                    : "bg-[#F0F5F7] text-[#577877]"
                }`}
              >
                3
              </span>
              <span>3. Verification</span>
            </div>
          </div>
        </div>

        {state === "success" && submittedData ? (
          <div className="my-auto rounded-none border border-[#25836F]/30 bg-white p-5 sm:p-6 shadow-sm space-y-4 animate-in fade-in duration-300 max-w-2xl mx-auto w-full">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-none bg-[#EEF6F3] text-[#25836F] flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl font-bold">check_circle</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-none text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300/60 uppercase tracking-wider">
                    <span className="h-1.5 w-1.5 rounded-none bg-amber-500 animate-pulse"></span>
                    PENDING_VERIFICATION
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-bold text-[#162623] mt-0.5">
                  Registration Submitted Successfully
                </h3>
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-[#577877] leading-relaxed">
              <p>
                Thank you, <strong>{submittedData.full_name}</strong>. Your clinician profile and credentials have been securely recorded.
              </p>
              <p>
                A 6-digit email confirmation code has been dispatched to <strong>{submittedData.email}</strong>.
              </p>
            </div>

            <div className="rounded-none border border-amber-200/80 bg-amber-50/70 p-3 space-y-2 text-xs text-[#162623]">
              <div className="flex items-start gap-2">
                <span className="material-symbols-outlined text-amber-700 text-base shrink-0 mt-0.5">
                  lock
                </span>
                <div>
                  <strong className="text-amber-900 block font-semibold text-[11px]">
                    Consultation Access Restriction:
                  </strong>
                  <span className="text-amber-900/90 text-[11px] leading-relaxed">
                    Under Indian Telemedicine Practice Guidelines, your account remains in{" "}
                    <span className="font-bold underline">PENDING_VERIFICATION</span>. Access to consultation rooms and e-prescriptions is enabled once an administrator verifies credentials.
                  </span>
                </div>
              </div>
              <div className="pt-1.5 border-t border-amber-200/60 grid grid-cols-2 gap-2 text-[10px] text-zinc-600">
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

            <div className="pt-1 flex flex-col sm:flex-row gap-2.5">
              <button
                type="button"
                onClick={() => {
                  if (onSuccess) {
                    onSuccess(submittedData.email);
                  }
                }}
                className="flex-1 rounded-none bg-[#25836F] py-2.5 text-xs font-bold text-white shadow transition hover:bg-[#1d6e5d] cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Proceed to Email Verification</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </button>
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="rounded-none border border-[#577877]/30 bg-white px-4 py-2.5 text-xs font-semibold text-[#577877] hover:border-[#25836F] hover:text-[#162623] transition cursor-pointer"
                >
                  Return Home
                </button>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate className="space-y-2 pt-1 flex-1 flex flex-col justify-between">
            {/* STEP 1: Personal Information */}
            {currentStep === 1 && (
              <div className="space-y-1.5 animate-in fade-in duration-200">
                <div className="flex items-center gap-1.5 pb-1 border-b border-[#577877]/15">
                  <span className="material-symbols-outlined text-[#25836F] text-sm">person</span>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#162623]">
                    Personal Information &amp; Contact Details
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 xl:gap-3">
                  {/* Full Name */}
                  <div className="space-y-0.5">
                    <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1">
                      <span>Full Name <span className="text-red-600">*</span></span>
                    </label>
                    <input
                      name="full_name"
                      type="text"
                      value={form.full_name}
                      onChange={update}
                      onBlur={handleBlur}
                      placeholder="Dr. Harshavardhan M V"
                      className={`w-full h-8.5 px-3 rounded-none border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                        touched.full_name && errors.full_name
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.full_name && errors.full_name && (
                      <p className="text-[10px] text-red-600 font-medium leading-none mt-0.5 truncate">{errors.full_name}</p>
                    )}
                  </div>

                  {/* Email Address */}
                  <div className="space-y-0.5">
                    <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1">
                      <span>Email Address <span className="text-red-600">*</span></span>
                    </label>
                    <input
                      name="email"
                      type="email"
                      value={form.email}
                      onChange={update}
                      onBlur={handleBlur}
                      placeholder="doctor@clinic.com"
                      className={`w-full h-8.5 px-3 rounded-none border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                        touched.email && errors.email
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.email && errors.email && (
                      <p className="text-[10px] text-red-600 font-medium leading-none mt-0.5 truncate">{errors.email}</p>
                    )}
                  </div>

                  {/* Mobile Number */}
                  <div className="space-y-0.5">
                    <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1">
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
                      className={`w-full h-8.5 px-3 rounded-none border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                        touched.mobile_number && errors.mobile_number
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.mobile_number && errors.mobile_number && (
                      <p className="text-[10px] text-red-600 font-medium leading-none mt-0.5 truncate">{errors.mobile_number}</p>
                    )}
                  </div>

                  {/* State of Practice */}
                  <div className="space-y-0.5">
                    <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1">
                      <span>State of Practice <span className="text-red-600">*</span></span>
                    </label>
                    <select
                      name="state"
                      value={form.state}
                      onChange={update}
                      onBlur={handleBlur}
                      className={`w-full h-8.5 px-3 rounded-none border bg-white text-xs text-[#162623] focus:outline-none transition shadow-2xs box-border ${
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
                      <p className="text-[10px] text-red-600 font-medium leading-none mt-0.5 truncate">{errors.state}</p>
                    )}
                  </div>

                  {/* Date of Birth */}
                  <div className="space-y-0.5">
                    <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1">
                      <span>Date of Birth</span>
                      <span className="font-normal text-[10px] text-[#577877]">(Age 21+)</span>
                    </label>
                    <input
                      name="date_of_birth"
                      type="date"
                      value={form.date_of_birth}
                      onChange={update}
                      onBlur={handleBlur}
                      className={`w-full h-8.5 px-3 rounded-none border bg-white text-xs text-[#162623] focus:outline-none transition shadow-2xs box-border ${
                        touched.date_of_birth && errors.date_of_birth
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.date_of_birth && errors.date_of_birth && (
                      <p className="text-[10px] text-red-600 font-medium leading-none mt-0.5 truncate">{errors.date_of_birth}</p>
                    )}
                  </div>

                  {/* Gender (Optional) */}
                  <div className="space-y-0.5">
                    <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1">
                      <span>Gender</span>
                      <span className="font-normal text-[10px] text-[#577877]">(optional)</span>
                    </label>
                    <select
                      name="gender"
                      value={form.gender}
                      onChange={update}
                      onBlur={handleBlur}
                      className="w-full h-8.5 px-3 rounded-none border border-[#577877]/25 bg-white text-xs text-[#162623] focus:border-[#25836F] focus:outline-none transition shadow-2xs box-border"
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
              <div className="space-y-1.5 animate-in fade-in duration-200">
                <div className="flex items-center gap-1.5 pb-1 border-b border-[#577877]/15">
                  <span className="material-symbols-outlined text-[#25836F] text-sm">medical_services</span>
                  <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#162623]">
                    Professional Information &amp; Credentials
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 xl:gap-3">
                  {/* Medical Specialization */}
                  <div className="space-y-0.5">
                    <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1">
                      <span>Medical Specialization <span className="text-red-600">*</span></span>
                    </label>
                    <select
                      name="specialty"
                      value={form.specialty}
                      onChange={update}
                      onBlur={handleBlur}
                      className={`w-full h-8.5 px-3 rounded-none border bg-white text-xs text-[#162623] focus:outline-none transition shadow-2xs box-border ${
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
                      <p className="text-[10px] text-red-600 font-medium leading-none mt-0.5 truncate">{errors.specialty}</p>
                    )}
                  </div>

                  {/* Medical Registration Number */}
                  <div className="space-y-0.5">
                    <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1">
                      <span>Registration Number <span className="text-red-600">*</span></span>
                    </label>
                    <input
                      name="registration_number"
                      type="text"
                      value={form.registration_number}
                      onChange={update}
                      onBlur={handleBlur}
                      placeholder="e.g. KMC-123456"
                      className={`w-full h-8.5 px-3 rounded-none border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                        touched.registration_number && errors.registration_number
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.registration_number && errors.registration_number && (
                      <p className="text-[10px] text-red-600 font-medium leading-none mt-0.5 truncate">{errors.registration_number}</p>
                    )}
                  </div>

                  {/* Medical Council / Authority */}
                  <div className="space-y-0.5">
                    <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1">
                      <span>Medical Council / Authority <span className="text-red-600">*</span></span>
                    </label>
                    <input
                      name="medical_council"
                      type="text"
                      value={form.medical_council}
                      onChange={update}
                      onBlur={handleBlur}
                      placeholder="e.g. Karnataka Medical Council, NMC"
                      className={`w-full h-8.5 px-3 rounded-none border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                        touched.medical_council && errors.medical_council
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.medical_council && errors.medical_council && (
                      <p className="text-[10px] text-red-600 font-medium leading-none mt-0.5 truncate">{errors.medical_council}</p>
                    )}
                  </div>

                  {/* Qualifications */}
                  <div className="space-y-0.5">
                    <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1">
                      <span>Qualifications <span className="text-red-600">*</span></span>
                    </label>
                    <input
                      name="qualifications"
                      type="text"
                      value={form.qualifications}
                      onChange={update}
                      onBlur={handleBlur}
                      placeholder="MBBS, MD, DNB (comma separated)"
                      className={`w-full h-8.5 px-3 rounded-none border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                        touched.qualifications && errors.qualifications
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.qualifications && errors.qualifications && (
                      <p className="text-[10px] text-red-600 font-medium leading-none mt-0.5 truncate">{errors.qualifications}</p>
                    )}
                  </div>

                  {/* Experience (Years) */}
                  <div className="space-y-0.5">
                    <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1">
                      <span>Experience (Years)</span>
                      <span className="font-normal text-[10px] text-[#577877]">(optional)</span>
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
                      className={`w-full h-8.5 px-3 rounded-none border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                        touched.experience_years && errors.experience_years
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.experience_years && errors.experience_years && (
                      <p className="text-[10px] text-red-600 font-medium leading-none mt-0.5 truncate">{errors.experience_years}</p>
                    )}
                  </div>

                  {/* Supported Languages */}
                  <div className="space-y-0.5">
                    <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1">
                      <span>Supported Languages <span className="text-red-600">*</span></span>
                    </label>
                    <input
                      name="languages"
                      type="text"
                      value={form.languages}
                      onChange={update}
                      onBlur={handleBlur}
                      placeholder="English, Hindi (comma separated)"
                      className={`w-full h-8.5 px-3 rounded-none border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                        touched.languages && errors.languages
                          ? "border-red-500 focus:border-red-500"
                          : "border-[#577877]/25 focus:border-[#25836F]"
                      }`}
                    />
                    {touched.languages && errors.languages && (
                      <p className="text-[10px] text-red-600 font-medium leading-none mt-0.5 truncate">{errors.languages}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* STEP 3: Mandatory Document Uploads & Account Security */}
            {currentStep === 3 && (
              <div className="space-y-2 animate-in fade-in duration-200">
                {/* 3A. Mandatory Document Uploads & Optional Attachments */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between pb-1 border-b border-[#577877]/15">
                    <div className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[#25836F] text-sm">attachment</span>
                      <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#162623]">
                        Document Uploads (PDF, JPG, PNG · Max 10 MB)
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAdditionalDocs(true)}
                      className="text-[11px] font-semibold text-[#25836F] hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-xs">add_circle</span>
                      <span>Additional Documents (Optional)</span>
                      {optionalDocsCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-none bg-[#25836F] text-white text-[10px] font-bold">
                          {optionalDocsCount}
                        </span>
                      )}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 xl:gap-3">
                    {/* 1. Medical Council Registration Certificate */}
                    <div className="space-y-0.5">
                      <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1 truncate" title="1. Medical Council Registration Certificate *">
                        <span>1. Council Certificate <span className="text-red-600">*</span></span>
                        <span className="font-normal text-[10px] text-[#577877]">(Mandatory)</span>
                      </label>
                      <input
                        name="credential_document"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        onChange={update}
                        onBlur={handleBlur}
                        className={`w-full h-8.5 px-2 py-1 rounded-none border bg-white text-[11px] text-[#162623] file:mr-2 file:py-0.5 file:px-2 file:rounded-none file:border-0 file:text-[10px] file:font-semibold file:bg-[#F0F5F7] file:text-[#25836F] hover:file:bg-[#25836F]/10 focus:outline-none transition cursor-pointer box-border ${
                          touched.credential_document && errors.credential_document
                            ? "border-red-500 focus:border-red-500"
                            : "border-[#577877]/25 focus:border-[#25836F]"
                        }`}
                      />
                      {touched.credential_document && errors.credential_document && (
                        <p className="text-[10px] text-red-600 font-medium leading-none mt-0.5 truncate">{errors.credential_document}</p>
                      )}
                    </div>

                    {/* 2. Recognized Medical Qualification Certificate */}
                    <div className="space-y-0.5">
                      <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1 truncate" title="2. Qualification Certificate (MBBS / Primary)">
                        <span>2. Qualification Certificate</span>
                        <span className="font-normal text-[10px] text-[#577877]">(MBBS / Primary)</span>
                      </label>
                      <input
                        name="qualification_certificate"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        onChange={update}
                        onBlur={handleBlur}
                        className={`w-full h-8.5 px-2 py-1 rounded-none border bg-white text-[11px] text-[#162623] file:mr-2 file:py-0.5 file:px-2 file:rounded-none file:border-0 file:text-[10px] file:font-semibold file:bg-[#F0F5F7] file:text-[#25836F] hover:file:bg-[#25836F]/10 focus:outline-none transition cursor-pointer box-border ${
                          touched.qualification_certificate && errors.qualification_certificate
                            ? "border-red-500 focus:border-red-500"
                            : "border-[#577877]/25 focus:border-[#25836F]"
                        }`}
                      />
                      {touched.qualification_certificate && errors.qualification_certificate && (
                        <p className="text-[10px] text-red-600 font-medium leading-none mt-0.5 truncate">{errors.qualification_certificate}</p>
                      )}
                    </div>

                    {/* 3. Government-Issued Identity Proof */}
                    <div className="space-y-0.5">
                      <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1 truncate" title="3. Government ID Proof (Aadhaar / Passport / DL / PAN)">
                        <span>3. Identity Proof</span>
                        <span className="font-normal text-[10px] text-[#577877]">(Govt ID)</span>
                      </label>
                      <input
                        name="identity_proof"
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        onChange={update}
                        onBlur={handleBlur}
                        className={`w-full h-8.5 px-2 py-1 rounded-none border bg-white text-[11px] text-[#162623] file:mr-2 file:py-0.5 file:px-2 file:rounded-none file:border-0 file:text-[10px] file:font-semibold file:bg-[#F0F5F7] file:text-[#25836F] hover:file:bg-[#25836F]/10 focus:outline-none transition cursor-pointer box-border ${
                          touched.identity_proof && errors.identity_proof
                            ? "border-red-500 focus:border-red-500"
                            : "border-[#577877]/25 focus:border-[#25836F]"
                        }`}
                      />
                      {touched.identity_proof && errors.identity_proof && (
                        <p className="text-[10px] text-red-600 font-medium leading-none mt-0.5 truncate">{errors.identity_proof}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3B. Account Security & Consents */}
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 pb-1 border-b border-[#577877]/15">
                    <span className="material-symbols-outlined text-[#25836F] text-sm">lock</span>
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-[#162623]">
                      Account Security &amp; Consents
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 xl:gap-3 items-start">
                    {/* Password */}
                    <div className="space-y-0.5">
                      <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1">
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
                          className={`w-full h-8.5 pl-3 pr-8 rounded-none border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                            touched.password && errors.password
                              ? "border-red-500 focus:border-red-500"
                              : "border-[#577877]/25 focus:border-[#25836F]"
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#577877] hover:text-[#162623] cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-sm">
                            {showPassword ? "visibility_off" : "visibility"}
                          </span>
                        </button>
                      </div>
                      {touched.password && errors.password && (
                        <p className="text-[10px] text-red-600 font-medium leading-none mt-0.5 truncate">{errors.password}</p>
                      )}
                    </div>

                    {/* Confirm Password */}
                    <div className="space-y-0.5">
                      <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1">
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
                          className={`w-full h-8.5 px-3 rounded-none border bg-white text-xs text-[#162623] placeholder:text-[#577877]/50 focus:outline-none transition shadow-2xs box-border ${
                            touched.confirm_password && errors.confirm_password
                              ? "border-red-500 focus:border-red-500"
                              : "border-[#577877]/25 focus:border-[#25836F]"
                          }`}
                        />
                      </div>
                      {touched.confirm_password && errors.confirm_password && (
                        <p className="text-[10px] text-red-600 font-medium leading-none mt-0.5 truncate">{errors.confirm_password}</p>
                      )}
                    </div>

                    {/* Consents Column */}
                    <div className="space-y-0.5 col-span-1 md:col-span-2 lg:col-span-1">
                      <label className="flex items-center justify-between text-[11px] font-semibold text-[#162623] h-4 mb-1">
                        <span>Declarations &amp; Privacy <span className="text-red-600">*</span></span>
                      </label>
                      <div className="h-8.5 flex flex-col justify-center space-y-1 px-1">
                        <label className="flex items-center gap-1.5 text-[#162623] cursor-pointer leading-tight">
                          <input
                            type="checkbox"
                            name="terms_consent"
                            checked={form.terms_consent}
                            onChange={update}
                            onBlur={handleBlur}
                            className="h-3.5 w-3.5 rounded-none border-[#577877]/30 text-[#25836F] accent-[#25836F] shrink-0 cursor-pointer"
                          />
                          <span className="text-[#577877] text-[10px] truncate">
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

                        <label className="flex items-center gap-1.5 text-[#162623] cursor-pointer leading-tight">
                          <input
                            type="checkbox"
                            name="declaration_consent"
                            checked={form.declaration_consent}
                            onChange={update}
                            onBlur={handleBlur}
                            className="h-3.5 w-3.5 rounded-none border-[#577877]/30 text-[#25836F] accent-[#25836F] shrink-0 cursor-pointer"
                          />
                          <span className="text-[#577877] text-[10px] truncate">
                            Declare credentials authentic under Telehealth Guidelines <span className="text-red-600">*</span>
                          </span>
                        </label>
                      </div>
                      {(touched.terms_consent && errors.terms_consent) || (touched.declaration_consent && errors.declaration_consent) ? (
                        <p className="text-[10px] text-red-600 font-medium leading-none mt-0.5 truncate">
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
                className={`py-1.5 px-3 rounded-none border text-[11px] font-medium leading-tight ${
                  state === "error"
                    ? "bg-red-50 text-red-600 border-red-200"
                    : "bg-teal-50 text-[#25836F] border-teal-200"
                }`}
              >
                {state === "error" ? "⚠️ " : "✅ "}
                {message}
              </div>
            )}

            {/* Step Action Navigation Controls */}
            <div className="flex items-center justify-between gap-3 pt-2 border-t border-[#577877]/10 shrink-0">
              {currentStep === 1 && (
                <>
                  <div className="text-xs text-[#577877]">
                    Already registered?{" "}
                    <button
                      type="button"
                      onClick={onSwitchToPatientAuth || onBack}
                      className="font-bold text-[#25836F] hover:underline cursor-pointer"
                    >
                      Sign in
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={handleNextFromStep1}
                    className="px-5 h-9 rounded-none bg-[#25836F] text-xs font-bold text-white shadow-sm transition hover:bg-[#1d6e5d] active:scale-[0.99] cursor-pointer flex items-center gap-1.5 ml-auto"
                  >
                    <span>Continue to Professional Details</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </>
              )}

              {currentStep === 2 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentStep(1);
                      setMessage("");
                    }}
                    className="px-4 h-9 rounded-none border border-[#577877]/30 bg-white text-xs font-semibold text-[#577877] hover:border-[#25836F] hover:text-[#162623] transition cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    <span>Back to Personal Info</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleNextFromStep2}
                    className="px-5 h-9 rounded-none bg-[#25836F] text-xs font-bold text-white shadow-sm transition hover:bg-[#1d6e5d] active:scale-[0.99] cursor-pointer flex items-center gap-1.5"
                  >
                    <span>Continue to Verification &amp; Security</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </>
              )}

              {currentStep === 3 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentStep(2);
                      setMessage("");
                    }}
                    className="px-4 h-9 rounded-none border border-[#577877]/30 bg-white text-xs font-semibold text-[#577877] hover:border-[#25836F] hover:text-[#162623] transition cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    <span>Back to Credentials</span>
                  </button>
                  <button
                    type="submit"
                    disabled={state === "loading"}
                    className="px-6 h-9 rounded-none bg-[#25836F] text-xs font-bold text-white shadow-sm transition hover:bg-[#1d6e5d] active:scale-[0.99] disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {state === "loading" ? "Submitting Registration…" : "Submit Doctor Registration"}
                  </button>
                </>
              )}
            </div>
          </form>
        )}

        {/* Footer */}
        <footer className="w-full text-center text-[10px] text-[#577877] pt-1">
          © 2026 Kaizen Care · Clinician Credentialing Workspace.
        </footer>
      </main>

      {/* Additional Documents Modal (Preserves single page view without vertical scrolling) */}
      {showAdditionalDocs && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-none bg-white border border-[#577877]/20 p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#577877]/15">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#25836F] text-xl">folder_open</span>
                <h3 className="text-sm font-bold text-[#162623]">Additional Documents (Optional)</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAdditionalDocs(false)}
                className="p-1 rounded-none text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <p className="text-xs text-[#577877]">
              Attach additional credentials if applicable to your clinical practice or specialization (PDF, JPG, or PNG, max 10 MB each).
            </p>

            <div className="space-y-2">
              <div>
                <label className="block text-[11px] font-semibold text-[#162623] mb-0.5">
                  Postgraduate / Specialty Certificate (MD, MS, DNB, Diploma)
                </label>
                <input
                  name="specialty_certificate"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={update}
                  className="w-full px-2.5 py-1 rounded-none border border-[#577877]/20 text-xs file:mr-2 file:py-0.5 file:px-2 file:rounded-none file:border-0 file:text-[10px] file:bg-[#F0F5F7] file:text-[#25836F]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#162623] mb-0.5">
                  Registration Renewal Proof
                </label>
                <input
                  name="renewal_proof"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={update}
                  className="w-full px-2.5 py-1 rounded-none border border-[#577877]/20 text-xs file:mr-2 file:py-0.5 file:px-2 file:rounded-none file:border-0 file:text-[10px] file:bg-[#F0F5F7] file:text-[#25836F]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#162623] mb-0.5">
                  Clinic Authorization Letter / Hospital Affiliation
                </label>
                <input
                  name="clinic_authorization"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={update}
                  className="w-full px-2.5 py-1 rounded-none border border-[#577877]/20 text-xs file:mr-2 file:py-0.5 file:px-2 file:rounded-none file:border-0 file:text-[10px] file:bg-[#F0F5F7] file:text-[#25836F]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-[#162623] mb-0.5">
                  Professional Indemnity Insurance Policy
                </label>
                <input
                  name="indemnity_insurance"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                  onChange={update}
                  className="w-full px-2.5 py-1 rounded-none border border-[#577877]/20 text-xs file:mr-2 file:py-0.5 file:px-2 file:rounded-none file:border-0 file:text-[10px] file:bg-[#F0F5F7] file:text-[#25836F]"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAdditionalDocs(false)}
                className="rounded-none bg-[#25836F] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#1d6e5d] cursor-pointer"
              >
                Save &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Terms of Service Modal */}
      {showTermsModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-none bg-white border border-[#577877]/20 p-5 sm:p-6 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#577877]/15">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#25836F] text-xl">gavel</span>
                <h3 className="text-sm font-bold text-[#162623]">Kaizen Care Clinician Terms of Service</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="p-1 rounded-none text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="space-y-2 text-xs text-[#577877] leading-relaxed max-h-60 overflow-y-auto pr-1">
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
            <div className="pt-1 text-right">
              <button
                type="button"
                onClick={() => setShowTermsModal(false)}
                className="rounded-none bg-[#25836F] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#1d6e5d] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-none bg-white border border-[#577877]/20 p-5 sm:p-6 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#577877]/15">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#25836F] text-xl">policy</span>
                <h3 className="text-sm font-bold text-[#162623]">Kaizen Care Clinician Privacy Policy</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="p-1 rounded-none text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <div className="space-y-2 text-xs text-[#577877] leading-relaxed max-h-60 overflow-y-auto pr-1">
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
            <div className="pt-1 text-right">
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="rounded-none bg-[#25836F] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#1d6e5d] cursor-pointer"
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
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-[#162623]/70 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={(e) => {
          if (e.target === e.currentTarget && onClose) onClose();
        }}
      >
        {content}
      </div>
    );
  }

  return content;
}
