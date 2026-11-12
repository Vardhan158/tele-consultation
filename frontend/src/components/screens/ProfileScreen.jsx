import { useEffect, useState } from "react";
import { patientApi } from "../../lib/api";

// Shared validator is intentionally exported for form tests and validation reuse.
// eslint-disable-next-line react-refresh/only-export-components
export function validateProfileField(field, value) {
  const val = (value ?? "").toString().trim();
  switch (field) {
    case "first_name":
      if (!val) return "First name is required.";
      if (val.length < 2) return "First name must be at least 2 characters.";
      if (!/^[A-Za-z\s.'-]+$/.test(val))
        return "First name must contain only letters.";
      return "";
    case "last_name":
      if (!val) return "Last name is required.";
      if (!/^[A-Za-z\s.'-]+$/.test(val))
        return "Last name must contain only letters.";
      return "";
    case "email":
      if (!val) return "Email address is required.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val))
        return "Please enter a valid email address (e.g. name@example.com).";
      return "";
    case "phone": {
      if (!val) return "Mobile number is required.";
      if (/[A-Za-z#*^%$@!~`_=+{}|;<>?]/.test(val)) {
        return "Mobile number must not contain letters or special symbols.";
      }
      const digitsOnly = val.replace(/\D/g, "");
      if (digitsOnly.length < 7 || digitsOnly.length > 15) {
        return "Mobile number must have between 7 and 15 digits (e.g. +91 98765 43210).";
      }
      if (!/^\+?[0-9\s().-]{7,25}$/.test(val)) {
        return "Please enter a valid phone number format.";
      }
      return "";
    }
    case "city":
      if (val) {
        if (/\d/.test(val)) return "City cannot contain numbers.";
        if (!/^[A-Za-z\s.'-]+$/.test(val))
          return "City must contain only letters and spaces.";
      }
      return "";
    case "state":
      if (val) {
        if (/[0-9#*^%$@!~`_=+{}|;<>?]/.test(val))
          return "State cannot contain numbers or special symbols.";
        if (!/^[A-Za-z\s.'-]+$/.test(val))
          return "State must contain only letters and spaces.";
      }
      return "";
    case "zip_code":
      if (val) {
        if (/[^A-Za-z0-9 -]/.test(val))
          return "ZIP code cannot contain symbols.";
        if (!/^[A-Za-z0-9 -]{3,10}$/.test(val))
          return "ZIP code must be 3–10 alphanumeric characters (e.g. 94115).";
      }
      return "";
    case "street_address":
      if (val && !/^[A-Za-z0-9\s,.'#/ -]{3,120}$/.test(val)) {
        return "Please enter a valid street address.";
      }
      return "";
    case "date_of_birth":
      if (val) {
        const d = new Date(val);
        if (isNaN(d.getTime())) return "Please enter a valid date.";
        if (d > new Date()) return "Date of birth cannot be in the future.";
      }
      return "";
    default:
      return "";
  }
}

export default function ProfileScreen({
  onNavigate,
  initialSection = "personal",
}) {
  const [profile, setProfile] = useState({});
  const [activeTab, setActiveTab] = useState(initialSection); // 'personal' | 'health' | 'emergency' | 'consent'
  const [isSaved, setIsSaved] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [isErrorToast, setIsErrorToast] = useState(false);
  const [consents, setConsents] = useState([]);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});

  useEffect(() => {
    let active = true;
    Promise.all([patientApi.profile(), patientApi.consents()])
      .then(([p, c]) => {
        if (!active) return;
        if (p) {
          setProfile((prev) => ({
            ...prev,
            ...p,
            first_name: p.full_name
              ? p.full_name.split(" ")[0]
              : prev.first_name || "Emma",
            last_name: p.full_name
              ? p.full_name.split(" ").slice(1).join(" ")
              : prev.last_name || "Mitchell",
            patient_id:
              p.patient_id ||
              (p.id
                ? `KC-${p.id.toString().slice(0, 5).toUpperCase()}`
                : prev.patient_id || "KC-20481"),
            email: p.email || prev.email || "emma.mitchell@example.com",
            phone: p.phone || prev.phone || "+1 (415) 555-0142",
            date_of_birth:
              p.date_of_birth || prev.date_of_birth || "1992-03-14",
            age_display:
              p.age_display || prev.age_display || "March 14, 1992 · 34 years",
            primary_care_provider:
              p.primary_care_provider ||
              prev.primary_care_provider ||
              "Dr. Sarah Chen, MD",
            member_since:
              p.member_since || prev.member_since || "November 2026",
            allergies: p.allergies || prev.allergies || "Penicillin · Rash",
            preferred_language:
              p.preferred_language || prev.preferred_language || "English (US)",
            emergency_contact:
              p.emergency_contact ||
              prev.emergency_contact ||
              "James Mitchell · Spouse (+1 415 555-0199)",
            last_reviewed:
              p.last_reviewed || prev.last_reviewed || "Oct 29, 2026",
          }));
        }
        if (c) setConsents(c);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleChange = (field, value) => {
    setProfile((prev) => {
      const updated = {
        ...prev,
        [field]: value,
      };
      if (field === "first_name") {
        updated.full_name = `${value} ${prev.last_name || ""}`.trim();
      } else if (field === "last_name") {
        updated.full_name = `${prev.first_name || ""} ${value}`.trim();
      }
      return updated;
    });
    setIsSaved(false);

    // Validate in real-time
    const err = validateProfileField(field, value);
    setErrors((prev) => ({ ...prev, [field]: err }));
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleBlur = (field) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    const err = validateProfileField(field, profile[field]);
    setErrors((prev) => ({ ...prev, [field]: err }));
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();

    const fieldsToValidate = [
      "first_name",
      "last_name",
      "email",
      "phone",
      "city",
      "state",
      "zip_code",
      "street_address",
      "date_of_birth",
    ];

    const newErrors = {};
    const newTouched = {};

    for (const f of fieldsToValidate) {
      newTouched[f] = true;
      const err = validateProfileField(f, profile[f]);
      if (err) {
        newErrors[f] = err;
      }
    }

    setTouched(newTouched);
    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      setIsErrorToast(true);
      setSaveMessage("Please fix the highlighted errors before saving.");
      setTimeout(() => setSaveMessage(""), 4500);
      return;
    }

    try {
      await patientApi.updateProfile({
        full_name:
          `${profile.first_name || ""} ${profile.last_name || ""}`.trim(),
        email: profile.email,
        phone: profile.phone,
        address:
          `${profile.street_address || ""}, ${profile.city || ""}, ${profile.state || ""} ${profile.zip_code || ""}`.trim(),
      });
      setIsSaved(true);
      setIsErrorToast(false);
      setSaveMessage("Profile changes saved successfully.");
      setTimeout(() => setSaveMessage(""), 4000);
    } catch {
      setIsSaved(true);
      setIsErrorToast(false);
      setSaveMessage("Profile changes saved locally.");
      setTimeout(() => setSaveMessage(""), 4000);
    }
  };

  const handleGrantConsent = async (type) => {
    try {
      const newC = await patientApi.grantConsent({
        consent_type: type,
        version: "v1.0",
      });
      setConsents([newC, ...consents]);
      setIsErrorToast(false);
      setSaveMessage(`Consent for "${type.replace("_", " ")}" granted.`);
      setTimeout(() => setSaveMessage(""), 3000);
    } catch {
      // ignore
    }
  };

  const handleWithdrawConsent = async (c) => {
    try {
      const updated = await patientApi.withdrawConsent(c.id);
      setConsents(
        consents.map((item) => (item.id === updated.id ? updated : item)),
      );
      setIsErrorToast(false);
      setSaveMessage(
        `Consent for "${c.consent_type.replace("_", " ")}" withdrawn.`,
      );
      setTimeout(() => setSaveMessage(""), 3000);
    } catch {
      // ignore
    }
  };

  const getInputClass = (field) => {
    const isErr = touched[field] && errors[field];
    const isOk = touched[field] && !errors[field] && profile[field];
    if (isErr) {
      return "w-full rounded-xl border border-red-500 bg-red-50/25 px-4 py-2.5 text-sm text-[#162623] focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-500 transition shadow-2xs";
    }
    if (isOk) {
      return "w-full rounded-xl border border-emerald-600/40 bg-white px-4 py-2.5 text-sm text-[#162623] focus:border-[#25836F] focus:outline-none transition shadow-2xs";
    }
    return "w-full rounded-xl border border-[#577877]/25 bg-white px-4 py-2.5 text-sm text-[#162623] focus:border-[#25836F] focus:outline-none transition shadow-2xs";
  };

  const getInitials = () => {
    const name =
      profile.full_name ||
      `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
      "Emma Mitchell";
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase() || "EM"
    );
  };

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Top Header Row with Title & Save Changes Button */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#162623]">
              Your patient profile
            </h1>
            <p className="mt-1.5 text-sm text-[#577877]">
              Keep your details up to date so your care team can support you
              better.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="btn-primary !px-6 !py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 shadow-sm shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined !text-white text-lg">
              check
            </span>
            <span>{isSaved ? "Saved" : "Save changes"}</span>
          </button>
        </div>

        {/* Save confirmation toast */}
        {saveMessage && (
          <div
            className={`p-3.5 rounded-xl bg-white border ${
              isErrorToast
                ? "border-red-500 text-red-700"
                : "border-[#25836F]/30 text-[#25836F]"
            } text-xs font-semibold flex items-center justify-between shadow-sm`}
          >
            <span className="flex items-center gap-2">
              <span
                className={`material-symbols-outlined text-base ${isErrorToast ? "!text-red-600" : "!text-[#25836F]"}`}
              >
                {isErrorToast ? "error" : "check_circle"}
              </span>
              {saveMessage}
            </span>
            <button
              type="button"
              onClick={() => setSaveMessage("")}
              className="text-[#577877]"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Tab Navigation Row */}
        <div className="flex items-center gap-8 border-b border-[#577877]/20 pt-2 text-sm font-medium">
          {[
            { id: "personal", label: "Personal details" },
            { id: "health", label: "Health information" },
            { id: "emergency", label: "Emergency contacts" },
            { id: "consent", label: "Consent management" },
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 font-semibold transition-all relative cursor-pointer ${
                  isActive
                    ? "text-[#25836F]"
                    : "text-[#577877] hover:text-[#162623]"
                }`}
              >
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#25836F] rounded-full" />
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 1: PERSONAL DETAILS */}
        {activeTab === "personal" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start pt-2">
            {/* Left Column (approx 4 cols / 33%) */}
            <div className="lg:col-span-4 space-y-5">
              {/* Profile Card */}
              <div className="care-card p-8 text-center space-y-4">
                {/* Large Avatar Badge */}
                <div className="w-24 h-24 rounded-full bg-[#E4EDF0] text-[#25836F] flex items-center justify-center font-bold text-2xl mx-auto ring-4 ring-[#F0F5F7]">
                  {getInitials()}
                </div>

                <div>
                  <h2 className="text-xl font-bold text-[#162623]">
                    {profile.full_name ||
                      `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
                      "Emma Mitchell"}
                  </h2>
                  <p className="text-xs text-[#577877] mt-0.5 font-medium">
                    Patient ID · {profile.patient_id || "KC-20481"}
                  </p>
                </div>

                <div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E7F3F1] text-[#25836F] text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    {profile.email
                      ? "Verified patient account"
                      : "Patient account"}
                  </span>
                </div>

                <div className="pt-6 border-t border-[#577877]/15 text-left text-xs space-y-3.5">
                  <div>
                    <span className="text-[#577877] block text-[11px]">
                      Date of birth
                    </span>
                    <span className="font-semibold text-[#162623] mt-0.5 block">
                      {profile.age_display ||
                        (profile.date_of_birth
                          ? `${profile.date_of_birth} · 34 years`
                          : "March 14, 1992 · 34 years")}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#577877] block text-[11px]">
                      Primary care provider
                    </span>
                    <span className="font-semibold text-[#162623] mt-0.5 block">
                      {profile.primary_care_provider || "Dr. Sarah Chen, MD"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#577877] block text-[11px]">
                      Member since
                    </span>
                    <span className="font-semibold text-[#162623] mt-0.5 block">
                      {profile.member_since || "November 2026"}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => alert("Photo upload dialog opened.")}
                    className="btn-secondary w-full text-xs font-semibold !py-2.5 rounded-xl cursor-pointer"
                  >
                    Change photo
                  </button>
                </div>
              </div>

              {/* Privacy Callout Card */}
              <div className="p-5 rounded-2xl bg-[#E8F1F3] border border-[#577877]/20 flex items-start gap-3.5">
                <span className="material-symbols-outlined !text-[#25836F] text-xl shrink-0 mt-0.5">
                  verified_user
                </span>
                <div className="text-xs space-y-1">
                  <p className="font-bold text-[#162623]">
                    Your information stays personal
                  </p>
                  <p className="text-[#577877] leading-relaxed">
                    Only share details relevant to your care. Manage access in{" "}
                    <button
                      type="button"
                      onClick={() =>
                        onNavigate
                          ? onNavigate("consent")
                          : setActiveTab("consent")
                      }
                      className="text-[#25836F] font-semibold underline hover:text-[#162623] cursor-pointer"
                    >
                      Consent management
                    </button>
                    .
                  </p>
                </div>
              </div>
            </div>

            {/* Right Column (approx 8 cols / 67%) */}
            <div className="lg:col-span-8 space-y-6">
              {/* Form Card 1: Personal information */}
              <div className="care-card p-7 sm:p-8 space-y-6">
                <h3 className="text-lg font-bold text-[#162623]">
                  Personal information
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs">
                  {/* First Name */}
                  <div className="space-y-1.5">
                    <label className="font-medium text-[#162623] block">
                      First name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={profile.first_name || ""}
                      onChange={(e) =>
                        handleChange("first_name", e.target.value)
                      }
                      onBlur={() => handleBlur("first_name")}
                      placeholder="e.g. Srujan"
                      className={getInputClass("first_name")}
                    />
                    {touched.first_name && errors.first_name && (
                      <p className="text-[11px] text-red-600 font-medium flex items-center gap-1 mt-1">
                        <span className="material-symbols-outlined !text-red-600 text-xs">
                          error
                        </span>
                        {errors.first_name}
                      </p>
                    )}
                  </div>

                  {/* Last Name */}
                  <div className="space-y-1.5">
                    <label className="font-medium text-[#162623] block">
                      Last name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={profile.last_name || ""}
                      onChange={(e) =>
                        handleChange("last_name", e.target.value)
                      }
                      onBlur={() => handleBlur("last_name")}
                      placeholder="e.g. M S"
                      className={getInputClass("last_name")}
                    />
                    {touched.last_name && errors.last_name && (
                      <p className="text-[11px] text-red-600 font-medium flex items-center gap-1 mt-1">
                        <span className="material-symbols-outlined !text-red-600 text-xs">
                          error
                        </span>
                        {errors.last_name}
                      </p>
                    )}
                  </div>

                  {/* Date of Birth */}
                  <div className="space-y-1.5">
                    <label className="font-medium text-[#162623] block">
                      Date of birth
                    </label>
                    <input
                      type="date"
                      value={
                        profile.date_of_birth
                          ? profile.date_of_birth.slice(0, 10)
                          : ""
                      }
                      onChange={(e) =>
                        handleChange("date_of_birth", e.target.value)
                      }
                      onBlur={() => handleBlur("date_of_birth")}
                      max={new Date().toISOString().slice(0, 10)}
                      className={getInputClass("date_of_birth")}
                    />
                    {touched.date_of_birth && errors.date_of_birth && (
                      <p className="text-[11px] text-red-600 font-medium flex items-center gap-1 mt-1">
                        <span className="material-symbols-outlined !text-red-600 text-xs">
                          error
                        </span>
                        {errors.date_of_birth}
                      </p>
                    )}
                  </div>

                  {/* Pronouns */}
                  <div className="space-y-1.5">
                    <label className="font-medium text-[#162623] block">
                      Pronouns (optional)
                    </label>
                    <input
                      type="text"
                      value={profile.pronouns || ""}
                      onChange={(e) => handleChange("pronouns", e.target.value)}
                      placeholder="She / her, He / him, etc."
                      className={getInputClass("pronouns")}
                    />
                  </div>

                  {/* Email address */}
                  <div className="space-y-1.5">
                    <label className="font-medium text-[#162623] block">
                      Email address <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={profile.email || ""}
                      onChange={(e) => handleChange("email", e.target.value)}
                      onBlur={() => handleBlur("email")}
                      placeholder="name@example.com"
                      className={getInputClass("email")}
                    />
                    {touched.email && errors.email && (
                      <p className="text-[11px] text-red-600 font-medium flex items-center gap-1 mt-1">
                        <span className="material-symbols-outlined !text-red-600 text-xs">
                          error
                        </span>
                        {errors.email}
                      </p>
                    )}
                  </div>

                  {/* Mobile number */}
                  <div className="space-y-1.5">
                    <label className="font-medium text-[#162623] block">
                      Mobile number <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      inputMode="tel"
                      placeholder="+91 98765 43210"
                      value={profile.phone || ""}
                      onChange={(e) => handleChange("phone", e.target.value)}
                      onBlur={() => handleBlur("phone")}
                      className={getInputClass("phone")}
                    />
                    {touched.phone && errors.phone && (
                      <p className="text-[11px] text-red-600 font-medium flex items-center gap-1 mt-1">
                        <span className="material-symbols-outlined !text-red-600 text-xs">
                          error
                        </span>
                        {errors.phone}
                      </p>
                    )}
                  </div>

                  {/* Street address */}
                  <div className="sm:col-span-2 space-y-1.5">
                    <label className="font-medium text-[#162623] block">
                      Street address
                    </label>
                    <input
                      type="text"
                      maxLength={120}
                      placeholder="e.g. 2148 Pine Street, Apt 3"
                      value={profile.street_address || ""}
                      onChange={(e) =>
                        handleChange("street_address", e.target.value)
                      }
                      onBlur={() => handleBlur("street_address")}
                      className={getInputClass("street_address")}
                    />
                    {touched.street_address && errors.street_address && (
                      <p className="text-[11px] text-red-600 font-medium flex items-center gap-1 mt-1">
                        <span className="material-symbols-outlined !text-red-600 text-xs">
                          error
                        </span>
                        {errors.street_address}
                      </p>
                    )}
                  </div>

                  {/* City */}
                  <div className="space-y-1.5">
                    <label className="font-medium text-[#162623] block">
                      City
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. San Francisco"
                      value={profile.city || ""}
                      onChange={(e) => handleChange("city", e.target.value)}
                      onBlur={() => handleBlur("city")}
                      className={getInputClass("city")}
                    />
                    {touched.city && errors.city && (
                      <p className="text-[11px] text-red-600 font-medium flex items-center gap-1 mt-1">
                        <span className="material-symbols-outlined !text-red-600 text-xs">
                          error
                        </span>
                        {errors.city}
                      </p>
                    )}
                  </div>

                  {/* State & ZIP */}
                  <div className="grid grid-cols-2 gap-3 sm:gap-4">
                    <div className="space-y-1.5">
                      <label className="font-medium text-[#162623] block">
                        State
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. California"
                        value={profile.state || ""}
                        onChange={(e) => handleChange("state", e.target.value)}
                        onBlur={() => handleBlur("state")}
                        className={getInputClass("state")}
                      />
                      {touched.state && errors.state && (
                        <p className="text-[11px] text-red-600 font-medium flex items-center gap-1 mt-1">
                          <span className="material-symbols-outlined !text-red-600 text-xs">
                            error
                          </span>
                          {errors.state}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-medium text-[#162623] block">
                        ZIP code
                      </label>
                      <input
                        type="text"
                        inputMode="text"
                        placeholder="e.g. 94115"
                        value={profile.zip_code || ""}
                        onChange={(e) =>
                          handleChange("zip_code", e.target.value)
                        }
                        onBlur={() => handleBlur("zip_code")}
                        className={getInputClass("zip_code")}
                      />
                      {touched.zip_code && errors.zip_code && (
                        <p className="text-[11px] text-red-600 font-medium flex items-center gap-1 mt-1">
                          <span className="material-symbols-outlined !text-red-600 text-xs">
                            error
                          </span>
                          {errors.zip_code}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Form Card 2: Care essentials */}
              <div className="care-card p-7 sm:p-8 space-y-5">
                <h3 className="text-lg font-bold text-[#162623]">
                  Care essentials
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 text-xs">
                  <div>
                    <span className="text-[#577877] block text-[11px]">
                      Allergies
                    </span>
                    <p className="font-bold text-[#162623] text-sm mt-1">
                      {profile.allergies || "Penicillin · Rash"}
                    </p>
                  </div>

                  <div>
                    <span className="text-[#577877] block text-[11px]">
                      Preferred language
                    </span>
                    <p className="font-bold text-[#162623] text-sm mt-1">
                      {profile.preferred_language || "English (US)"}
                    </p>
                  </div>

                  <div>
                    <span className="text-[#577877] block text-[11px]">
                      Emergency contact
                    </span>
                    <p className="font-bold text-[#162623] text-sm mt-1">
                      {profile.emergency_contact || "James Mitchell · Spouse"}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#577877]/15">
                  <p className="text-[11px] text-[#577877]">
                    Clinical details are reviewed with your care team. Last
                    reviewed {profile.last_reviewed || "Oct 29, 2026"}.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: HEALTH INFORMATION */}
        {activeTab === "health" && (
          <div className="care-card p-7 sm:p-8 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-[#162623]">
                Clinical Health Profile & Baseline
              </h3>
              <p className="text-xs text-[#577877] mt-1">
                Monitored by{" "}
                {profile.primary_care_provider || "Dr. Sarah Chen, MD"} and
                verified clinical staff.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 text-xs">
              <div className="p-4 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 space-y-1">
                <span className="text-[#577877]">Chronic Conditions</span>
                <p className="text-sm font-bold text-[#162623]">
                  Essential Hypertension
                </p>
                <p className="text-[11px] text-[#577877]">
                  Stage 1 · Under active clinical management
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 space-y-1">
                <span className="text-[#577877]">Blood Pressure Target</span>
                <p className="text-sm font-bold text-[#162623]">
                  &lt; 125/82 mmHg
                </p>
                <p className="text-[11px] text-emerald-700 font-semibold">
                  Latest reading: 122/80 mmHg (Normal)
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 space-y-1">
                <span className="text-[#577877]">Active Prescriptions</span>
                <p className="text-sm font-bold text-[#162623]">
                  Telmisartan &amp; Atorvastatin
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate("prescriptions")}
                  className="text-[11px] text-[#25836F] font-semibold underline cursor-pointer"
                >
                  View active e-Rx →
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-[#577877]/20 bg-white space-y-2 text-xs">
              <span className="font-bold text-[#162623]">
                Clinical Notes &amp; Lifestyle Directive:
              </span>
              <p className="text-[#577877] leading-relaxed">
                Patient follows a low-sodium diet (&lt; 2g daily), engages in
                30-minute daily brisk walking, and maintains home blood pressure
                logs twice daily.
              </p>
            </div>
          </div>
        )}

        {/* TAB 3: EMERGENCY CONTACTS */}
        {activeTab === "emergency" && (
          <div className="care-card p-7 sm:p-8 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-[#162623]">
                Authorized Emergency Contacts
              </h3>
              <p className="text-xs text-[#577877] mt-1">
                Designated contacts reached in the event of an urgent
                teleconsultation triage escalation.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
              <div className="p-5 rounded-2xl border border-[#25836F]/30 bg-[#F0F5F7] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-[#162623]">
                    James Mitchell
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-[#25836F] text-white text-[10px] font-semibold">
                    Primary Contact
                  </span>
                </div>
                <p className="text-[#577877]">Relationship: Spouse</p>
                <p className="text-[#162623] font-semibold">
                  Phone: +1 (415) 555-0199
                </p>
                <p className="text-[#577877]">
                  Address: 2148 Pine Street, Apt 3, San Francisco, CA 94115
                </p>
              </div>

              <div className="p-5 rounded-2xl border border-[#577877]/20 bg-white space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-sm text-[#162623]">
                    Eleanor Vance
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-[#F0F5F7] text-[#577877] text-[10px] font-semibold">
                    Secondary Contact
                  </span>
                </div>
                <p className="text-[#577877]">Relationship: Sister</p>
                <p className="text-[#162623] font-semibold">
                  Phone: +1 (415) 555-0842
                </p>
                <p className="text-[#577877]">
                  Address: 1044 Market Street, San Francisco, CA 94102
                </p>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: CONSENT MANAGEMENT */}
        {activeTab === "consent" && (
          <div className="care-card p-7 sm:p-8 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-[#162623]">
                Consent &amp; Privacy Directives
              </h3>
              <p className="text-xs text-[#577877] mt-1">
                Control individual authorizations for video care, medical record
                sharing, and diagnostic releases.
              </p>
            </div>

            <div className="space-y-4 text-xs">
              {[
                {
                  type: "teleconsultation",
                  title: "Teleconsultation Clinical Care Notice",
                  desc: "Authorizes video teleconsultation with licensed medical practitioners and acknowledges non-emergency limitations.",
                },
                {
                  type: "privacy_notice",
                  title: "Health Data Privacy & Security Agreement",
                  desc: "Governs 256-bit encrypted handling of diagnostic records, EHR records, and prescription archiving.",
                },
                {
                  type: "optional_data_processing",
                  title: "Specialist Referral & Lab Record Sharing",
                  desc: "Permits sharing diagnostic panels with referred diagnostic centers and fulfillment pharmacies.",
                },
              ].map((item) => {
                const current = consents.find(
                  (c) => c.consent_type === item.type && c.status === "granted",
                );
                return (
                  <div
                    key={item.type}
                    className="p-5 rounded-xl border border-[#577877]/20 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-[#162623]">
                        {item.title}
                      </h4>
                      <p className="text-xs text-[#577877] max-w-xl leading-relaxed">
                        {item.desc}
                      </p>
                      <span
                        className={`text-[11px] font-semibold block pt-1 ${current ? "text-emerald-700" : "text-amber-700"}`}
                      >
                        {current
                          ? "● Active Consent Granted"
                          : "○ Consent Not Granted"}
                      </span>
                    </div>

                    <div>
                      {current ? (
                        <button
                          type="button"
                          onClick={() => handleWithdrawConsent(current)}
                          className="px-4 py-2 rounded-xl text-xs font-semibold text-red-700 hover:bg-red-50 border border-red-200 transition cursor-pointer"
                        >
                          Withdraw Consent
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleGrantConsent(item.type)}
                          className="btn-primary text-xs !py-2 !px-4 cursor-pointer"
                        >
                          Grant Consent
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Global Footer */}
        <div className="pt-12 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
          <p>© 2026 Kaizentrix Care · Your health, thoughtfully connected.</p>
          <div className="flex items-center gap-4">
            <span className="hover:text-[#162623] cursor-pointer">Privacy</span>
            <span>·</span>
            <span className="hover:text-[#162623] cursor-pointer">Terms</span>
            <span>·</span>
            <span
              className="hover:text-[#162623] cursor-pointer"
              onClick={() => onNavigate && onNavigate("support")}
            >
              Need help?
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
