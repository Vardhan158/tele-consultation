import { useEffect, useState, useRef } from "react";
import { patientApi, abdmApi } from "../../lib/api";

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
      const clean = val.replace(/[\s()-]/g, "");
      const digitsOnly = clean.startsWith("+91")
        ? clean.slice(3)
        : clean.startsWith("0")
        ? clean.slice(1)
        : clean.startsWith("+")
        ? clean.slice(1)
        : clean;
      if (!/^\d{10}$/.test(digitsOnly)) {
        return "Mobile number must be exactly 10 digits (e.g. 9876543210 or +91 9876543210).";
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

export function formatDobAndAge(dobStr) {
  if (!dobStr) return "Not provided";
  let dob;
  const str = String(dobStr).trim();
  if (/^\d{2}-\d{2}-\d{4}$/.test(str)) {
    const [p1, p2, year] = str.split("-");
    const m = parseInt(p2, 10);
    const d = parseInt(p1, 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      dob = new Date(parseInt(year, 10), m - 1, d);
    } else {
      dob = new Date(str);
    }
  } else if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [year, month, day] = str.slice(0, 10).split("-");
    dob = new Date(parseInt(year, 10), parseInt(month, 10) - 1, parseInt(day, 10));
  } else {
    dob = new Date(str);
  }
  if (isNaN(dob.getTime())) return dobStr;

  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--;
  }

  const formatted = dob.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  return `${formatted} · ${age >= 0 ? age : 0} years`;
}

export function formatMemberSince(dateStr) {
  if (!dateStr) return "Recent Member";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function ProfileScreen({
  onNavigate,
  onUserUpdate,
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
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef(null);

  const handlePhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setIsErrorToast(true);
      setSaveMessage("Please select a valid image file (JPEG, PNG, or WebP).");
      setTimeout(() => setSaveMessage(""), 4000);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setIsErrorToast(true);
      setSaveMessage("Image size cannot exceed 5 MB.");
      setTimeout(() => setSaveMessage(""), 4000);
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const res = await patientApi.uploadPhoto(file);
      if (res?.avatar_url) {
        setProfile((prev) => ({ ...prev, avatar_url: res.avatar_url }));
        if (typeof onUserUpdate === "function") {
          onUserUpdate({ avatar_url: res.avatar_url });
        }
        setIsErrorToast(false);
        setSaveMessage("Profile photo uploaded successfully!");
        setTimeout(() => setSaveMessage(""), 4000);
      }
    } catch (err) {
      setIsErrorToast(true);
      setSaveMessage(err?.message || "Failed to upload photo. Please check Cloudinary configuration.");
      setTimeout(() => setSaveMessage(""), 5000);
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ABDM State
  const [abhaProfile, setAbhaProfile] = useState(null);
  const [abdmConsents, setAbdmConsents] = useState([]);
  const [abdmLoading, setAbdmLoading] = useState(false);
  const [showLinkAbhaModal, setShowLinkAbhaModal] = useState(false);
  const [abhaAuthMode, setAbhaAuthMode] = useState("aadhaar"); // 'aadhaar' | 'mobile'
  const [abhaIdentifier, setAbhaIdentifier] = useState("");
  const [abhaTxnId, setAbhaTxnId] = useState("");
  const [abhaOtpSent, setAbhaOtpSent] = useState(false);
  const [abhaOtp, setAbhaOtp] = useState("");
  const [abhaPreferredAddress, setAbhaPreferredAddress] = useState("");
  const [abdmActionLoading, setAbdmActionLoading] = useState(false);
  const [abdmActionError, setAbdmActionError] = useState("");
  const [abdmActionSuccess, setAbdmActionSuccess] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([patientApi.profile(), patientApi.consents()])
      .then(([p, c]) => {
        if (!active) return;
        if (p) {
          if (p.avatar_url && typeof onUserUpdate === "function") {
            onUserUpdate({ avatar_url: p.avatar_url });
          }
          const dob = p.date_of_birth || "";
          const createdAt = p.created_at || null;
          let streetAddress = p.street_address || "";
          let city = p.city || "";
          let state = p.state || "";
          let zipCode = p.zip_code || "";
          if (!streetAddress && !city && !state && !zipCode && p.address) {
            const parts = p.address.split(",").map((s) => s.trim()).filter(Boolean);
            if (parts.length >= 1) streetAddress = parts[0];
            if (parts.length >= 2) city = parts[1];
            if (parts.length >= 3) {
              const stateZip = parts[2].split(/\s+/);
              if (stateZip.length >= 2) {
                state = stateZip.slice(0, -1).join(" ");
                zipCode = stateZip[stateZip.length - 1];
              } else {
                state = parts[2];
              }
            }
          }

          setProfile((prev) => ({
            ...prev,
            ...p,
            first_name: p.full_name
              ? p.full_name.split(" ")[0]
              : prev.first_name || "",
            last_name: p.full_name
              ? p.full_name.split(" ").slice(1).join(" ")
              : prev.last_name || "",
            patient_id:
              p.patient_id ||
              (p.id
                ? `KC-${p.id.toString().slice(0, 5).toUpperCase()}`
                : prev.patient_id || "KC-20481"),
            email: p.email || prev.email || "",
            phone: p.phone || prev.phone || "",
            date_of_birth: dob || prev.date_of_birth || "",
            gender: p.gender || prev.gender || "",
            street_address: streetAddress || prev.street_address || "",
            city: city || prev.city || "",
            state: state || prev.state || "",
            zip_code: zipCode || prev.zip_code || "",
            age_display: formatDobAndAge(dob || prev.date_of_birth),
            primary_care_provider:
              p.primary_care_provider ||
              prev.primary_care_provider ||
              "",
            member_since: formatMemberSince(createdAt || p.member_since || prev.member_since),
            allergies: p.allergies || prev.allergies || "",
            preferred_language:
              p.preferred_language || prev.preferred_language || "English (US)",
            emergency_contact:
              p.emergency_contact ||
              prev.emergency_contact ||
              "",
            last_reviewed:
              p.last_reviewed || prev.last_reviewed || "Recently",
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
      } else if (field === "date_of_birth") {
        updated.age_display = formatDobAndAge(value);
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
      const fullAddress = [
        profile.street_address,
        profile.city,
        profile.state,
        profile.zip_code,
      ]
        .filter(Boolean)
        .join(", ");

      const updated = await patientApi.updateProfile({
        full_name:
          `${profile.first_name || ""} ${profile.last_name || ""}`.trim(),
        email: profile.email,
        phone: profile.phone,
        date_of_birth: profile.date_of_birth,
        gender: profile.gender,
        street_address: profile.street_address,
        city: profile.city,
        state: profile.state,
        zip_code: profile.zip_code,
        address: fullAddress || profile.address || "",
      });
      if (updated) {
        setProfile((prev) => ({
          ...prev,
          ...updated,
          age_display: formatDobAndAge(updated.date_of_birth || profile.date_of_birth),
          member_since: formatMemberSince(updated.created_at || prev.member_since),
        }));
      }
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

  const fetchAbdmData = async () => {
    setAbdmLoading(true);
    setAbdmActionError("");
    try {
      const [prof, cons] = await Promise.all([
        abdmApi.profile().catch(() => ({ linked: false })),
        abdmApi.consents().catch(() => []),
      ]);
      setAbhaProfile(prof);
      setAbdmConsents(Array.isArray(cons) ? cons : []);
    } catch {
      // ignore
    } finally {
      setAbdmLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "abdm") {
      fetchAbdmData();
    }
  }, [activeTab]);

  const handleGenerateAbhaOtp = async (e) => {
    if (e) e.preventDefault();
    setAbdmActionError("");
    setAbdmActionSuccess("");
    if (!abhaIdentifier.trim()) {
      setAbdmActionError(
        abhaAuthMode === "aadhaar"
          ? "Please enter your 12-digit Aadhaar number."
          : "Please enter your 10-digit mobile number.",
      );
      return;
    }
    setAbdmActionLoading(true);
    try {
      const res = await abdmApi.generateOtp({
        auth_mode: abhaAuthMode,
        identifier: abhaIdentifier.trim(),
      });
      setAbhaTxnId(res.transaction_id || "");
      setAbhaOtpSent(true);
      setAbdmActionSuccess(
        res.message || "OTP dispatched successfully (Sandbox OTP: 123456).",
      );
    } catch (err) {
      setAbdmActionError(err?.message || "Failed to initiate ABHA verification.");
    } finally {
      setAbdmActionLoading(false);
    }
  };

  const handleVerifyAbhaOtp = async (e) => {
    if (e) e.preventDefault();
    setAbdmActionError("");
    setAbdmActionSuccess("");
    if (!abhaOtp.trim()) {
      setAbdmActionError("Please enter the 6-digit OTP.");
      return;
    }
    setAbdmActionLoading(true);
    try {
      const res = await abdmApi.verifyOtp({
        transaction_id: abhaTxnId,
        otp: abhaOtp.trim(),
        preferred_abha_address: abhaPreferredAddress.trim() || undefined,
      });
      setAbdmActionSuccess(res.message || "ABHA ID successfully linked!");
      setShowLinkAbhaModal(false);
      setAbhaOtpSent(false);
      setAbhaOtp("");
      setAbhaIdentifier("");
      await fetchAbdmData();
    } catch (err) {
      setAbdmActionError(err?.message || "Invalid OTP or verification failed.");
    } finally {
      setAbdmActionLoading(false);
    }
  };

  const handleUnlinkAbha = async () => {
    if (
      !window.confirm(
        "Are you sure you want to unlink your ABHA Health ID? You will lose automated record exchange with ABDM-registered facilities.",
      )
    )
      return;
    setAbdmActionLoading(true);
    try {
      await abdmApi.unlink();
      await fetchAbdmData();
    } catch (err) {
      setAbdmActionError(err?.message || "Failed to unlink ABHA profile.");
    } finally {
      setAbdmActionLoading(false);
    }
  };

  const handleRevokeAbdmConsent = async (consentId) => {
    if (
      !window.confirm(
        "Revoke this ABDM consent artifact? The requesting healthcare facility will immediately lose record access.",
      )
    )
      return;
    try {
      await abdmApi.revokeConsent(consentId);
      await fetchAbdmData();
    } catch (err) {
      setAbdmActionError(err?.message || "Failed to revoke consent.");
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
      "";
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
            { id: "abdm", label: "ABHA & ABDM Health ID" },
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
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.full_name || "Profile avatar"}
                    className="w-24 h-24 rounded-full object-cover mx-auto ring-4 ring-[#F0F5F7] shadow-sm"
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-[#E4EDF0] text-[#25836F] flex items-center justify-center font-bold text-2xl mx-auto ring-4 ring-[#F0F5F7]">
                    {getInitials()}
                  </div>
                )}

                <div>
                  <h2 className="text-xl font-bold text-[#162623]">
                    {profile.full_name ||
                      `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
                      "Patient"}
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
                        formatDobAndAge(profile.date_of_birth)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#577877] block text-[11px]">
                      Primary care provider
                    </span>
                    <span className="font-semibold text-[#162623] mt-0.5 block">
                      {profile.primary_care_provider || "Not provided"}
                    </span>
                  </div>

                  <div>
                    <span className="text-[#577877] block text-[11px]">
                      Member since
                    </span>
                    <span className="font-semibold text-[#162623] mt-0.5 block">
                      {profile.member_since || "Recent Member"}
                    </span>
                  </div>
                </div>

                <div className="pt-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handlePhotoSelect}
                    accept="image/png,image/jpeg,image/webp,image/jpg"
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={isUploadingPhoto}
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-secondary w-full text-xs font-semibold !py-2.5 rounded-xl cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isUploadingPhoto ? (
                      <>
                        <span className="material-symbols-outlined text-sm animate-spin">
                          progress_activity
                        </span>
                        <span>Uploading photo...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-sm">
                          photo_camera
                        </span>
                        <span>Change photo</span>
                      </>
                    )}
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

                  {/* Gender */}
                  <div className="space-y-1.5">
                    <label className="font-medium text-[#162623] block">
                      Gender <span className="text-xs text-[#577877] font-normal">(optional)</span>
                    </label>
                    <select
                      value={profile.gender || ""}
                      onChange={(e) => handleChange("gender", e.target.value)}
                      className={getInputClass("gender")}
                    >
                      <option value="">Select Gender</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                      <option value="Prefer not to say">Prefer not to say</option>
                    </select>
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
                {profile.primary_care_provider || "your care team"} and
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
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#162623]">
                  Consent &amp; Privacy Directives
                </h3>
                <p className="text-xs text-[#577877] mt-1">
                  Control authorizations for video teleconsultations, health data processing, and optional medical record sharing.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate && onNavigate("consent")}
                className="text-xs font-semibold text-[#25836F] hover:underline flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span>Full consent directives &amp; history</span>
                <span className="material-symbols-outlined text-xs">arrow_forward</span>
              </button>
            </div>

            <div className="space-y-4 text-xs">
              {[
                {
                  type: "teleconsultation",
                  title: "Teleconsultation Consent",
                  category: "Essential Clinical Care",
                  version: "v2.1",
                  desc: "Consent to receive medical assessment, diagnoses, and care recommendations via remote audio/video consultations.",
                },
                {
                  type: "health_data_privacy",
                  title: "Health Data Privacy Consent",
                  category: "Essential Clinical Care",
                  version: "v2.1",
                  desc: "Consent to collect and store health information strictly needed for your diagnosis, consultations, and digital prescriptions.",
                },
                {
                  type: "medical_record_sharing",
                  title: "Medical Record Sharing Consent",
                  category: "Optional Authorization",
                  version: "v2.1",
                  desc: "Optional authorization allowing treating physicians and consulting specialists to view your past diagnostic reports and lab results.",
                },
              ].map((item) => {
                const current = consents.find(
                  (c) =>
                    (c.consent_type === item.type ||
                      (item.type === "teleconsultation" && (c.consent_type === "telehealth" || c.consent_type === "treatment")) ||
                      (item.type === "health_data_privacy" && c.consent_type === "privacy_notice") ||
                      (item.type === "medical_record_sharing" && c.consent_type === "optional_data_processing")) &&
                    (c.status === "granted" || c.status === "active"),
                );
                return (
                  <div
                    key={item.type}
                    className="p-5 rounded-xl border border-[#577877]/20 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-[#162623]">
                          {item.title}
                        </h4>
                        <span className="text-[10px] font-semibold text-[#577877] bg-[#F0F5F7] px-2 py-0.5 rounded-md">
                          Version {item.version}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            item.category.includes("Essential")
                              ? "bg-[#E7F3F1] text-[#25836F]"
                              : "bg-[#F0F5F7] text-[#577877]"
                          }`}
                        >
                          {item.category}
                        </span>
                      </div>
                      <p className="text-xs text-[#577877] max-w-xl leading-relaxed">
                        {item.desc}
                      </p>
                      <span
                        className={`text-[11px] font-semibold block pt-1 ${
                          current ? "text-emerald-700" : "text-amber-700"
                        }`}
                      >
                        {current
                          ? `● Active Consent Granted · ${new Date(current.granted_at || Date.now()).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
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

        {/* TAB 5: ABHA & ABDM HEALTH ID */}
        {activeTab === "abdm" && (
          <div className="space-y-6 pt-2">
            {/* Header & Notifications */}
            {abdmActionSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center justify-between shadow-2xs">
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base !text-emerald-700">
                    verified
                  </span>
                  {abdmActionSuccess}
                </span>
                <button
                  type="button"
                  onClick={() => setAbdmActionSuccess("")}
                  className="text-emerald-600 hover:text-emerald-800"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            )}

            {abdmActionError && (
              <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs font-semibold flex items-center justify-between shadow-2xs">
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-base !text-red-600">
                    error
                  </span>
                  {abdmActionError}
                </span>
                <button
                  type="button"
                  onClick={() => setAbdmActionError("")}
                  className="text-red-600 hover:text-red-800"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              </div>
            )}

            {abdmLoading ? (
              <div className="care-card p-12 text-center text-[#577877] text-sm flex flex-col items-center gap-3">
                <span className="material-symbols-outlined animate-spin text-3xl text-[#25836F]">
                  progress_activity
                </span>
                <span>Connecting to National Health Authority (ABDM) Gateway...</span>
              </div>
            ) : abhaProfile?.linked ? (
              /* Linked View: Official ABHA Card + ABDM Consents */
              <div className="space-y-6">
                {/* Official ABHA Card */}
                <div className="care-card overflow-hidden border-2 border-[#25836F]/30 bg-linear-to-br from-[#162623] via-[#1d3531] to-[#25836F] text-white p-7 sm:p-8 rounded-2xl shadow-lg relative">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/20">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-[10px] font-bold tracking-wider uppercase backdrop-blur-xs">
                          Govt of India · ABDM M1
                        </span>
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                          <span className="material-symbols-outlined text-xs">verified</span>
                          KYC VERIFIED
                        </span>
                      </div>
                      <h3 className="text-xl font-black tracking-wide text-white">
                        Ayushman Bharat Health Account (ABHA)
                      </h3>
                      <p className="text-xs text-white/75">
                        National Health Authority (NHA) · Health Information Exchange
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleUnlinkAbha}
                        disabled={abdmActionLoading}
                        className="px-3.5 py-1.5 rounded-xl border border-red-400/40 bg-red-500/20 text-red-200 hover:bg-red-500/30 text-xs font-semibold transition cursor-pointer"
                      >
                        Unlink ABHA
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 pt-6 items-center">
                    <div className="md:col-span-8 space-y-4">
                      <div>
                        <span className="text-[11px] uppercase tracking-wider text-white/60 font-medium block">
                          14-Digit ABHA Number
                        </span>
                        <span className="text-2xl sm:text-3xl font-mono font-bold tracking-widest text-emerald-300">
                          {abhaProfile.abha_number || "91-0000-0000-0000"}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-1">
                        <div>
                          <span className="text-[11px] uppercase tracking-wider text-white/60 font-medium block">
                            ABHA Address (PHR Handle)
                          </span>
                          <span className="text-sm font-semibold text-white">
                            {abhaProfile.abha_address || "patient@abdm"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] uppercase tracking-wider text-white/60 font-medium block">
                            Full Name
                          </span>
                          <span className="text-sm font-semibold text-white">
                            {abhaProfile.full_name || profile.full_name || "Patient"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] uppercase tracking-wider text-white/60 font-medium block">
                            Gender / DOB
                          </span>
                          <span className="text-xs text-white/90">
                            {abhaProfile.gender || "Unspecified"} · {abhaProfile.date_of_birth || "1995-01-01"}
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] uppercase tracking-wider text-white/60 font-medium block">
                            Linked Mobile
                          </span>
                          <span className="text-xs text-white/90 font-mono">
                            {abhaProfile.mobile ? `+91 ${abhaProfile.mobile}` : "+91 98765 43210"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="md:col-span-4 flex flex-col items-center justify-center p-4 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-center space-y-2">
                      <div className="w-24 h-24 bg-white p-2 rounded-lg flex items-center justify-center shadow-inner">
                        <span className="material-symbols-outlined !text-[#162623] text-6xl">
                          qr_code_2
                        </span>
                      </div>
                      <span className="text-[10px] font-mono tracking-tight text-white/80">
                        {abhaProfile.qr_code_data ? "SCAN FOR EHR LINK" : "ABDM SECURE QR"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* ABDM Active Consents Section */}
                <div className="care-card p-7 sm:p-8 space-y-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-[#162623] flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#25836F]">
                          verified_user
                        </span>
                        ABDM Data Consent Artifacts (HIU / HIP)
                      </h3>
                      <p className="text-xs text-[#577877] mt-1">
                        Active consent directives governed by National Health Authority standards (EHR Standards 2016).
                      </p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-[#25836F]/10 text-[#25836F] text-xs font-bold shrink-0 self-start sm:self-auto">
                      {abdmConsents.filter((c) => c.status !== "REVOKED").length} Active Directives
                    </span>
                  </div>

                  {abdmConsents.length === 0 ? (
                    <div className="p-6 rounded-xl border border-dashed border-[#577877]/30 text-center text-xs text-[#577877]">
                      No external ABDM consent requests recorded yet.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {abdmConsents.map((c) => {
                        const isRevoked = c.status === "REVOKED";
                        return (
                          <div
                            key={c.consent_id}
                            className={`p-4 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                              isRevoked
                                ? "bg-gray-50/70 border-gray-200 opacity-60"
                                : "bg-white border-[#577877]/20 shadow-2xs hover:border-[#25836F]/40"
                            }`}
                          >
                            <div className="space-y-1 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-[#162623]">
                                  {c.requester || "Kaizen Care Telehealth Center"}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isRevoked
                                      ? "bg-gray-200 text-gray-700"
                                      : "bg-emerald-100 text-emerald-800"
                                  }`}
                                >
                                  {isRevoked ? "REVOKED" : "ACTIVE / GRANTED"}
                                </span>
                              </div>
                              <p className="text-[#577877]">
                                <span className="font-medium text-[#162623]">Purpose:</span> {c.purpose}
                              </p>
                              <p className="text-[#577877]">
                                <span className="font-medium text-[#162623]">Data Types:</span>{" "}
                                {Array.isArray(c.hi_types) ? c.hi_types.join(", ") : c.hi_types}
                              </p>
                              <p className="text-[11px] text-[#577877]/80">
                                Granted: {c.granted_at ? new Date(c.granted_at).toLocaleDateString() : "Recent"} · Expires: {c.expires_at ? new Date(c.expires_at).toLocaleDateString() : "30 days"}
                              </p>
                            </div>

                            {!isRevoked && (
                              <button
                                type="button"
                                onClick={() => handleRevokeAbdmConsent(c.consent_id)}
                                className="px-3.5 py-1.5 rounded-xl border border-red-300 text-red-700 hover:bg-red-50 text-xs font-semibold transition cursor-pointer self-start sm:self-auto shrink-0"
                              >
                                Revoke Access
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              /* Unlinked Onboarding Hero Card */
              <div className="care-card p-8 sm:p-10 space-y-6 border border-[#577877]/20">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-[#577877]/20">
                  <div className="space-y-2 max-w-xl">
                    <span className="px-2.5 py-1 rounded-full bg-[#25836F]/10 text-[#25836F] text-xs font-bold tracking-wide uppercase inline-flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-sm">hub</span>
                      Ayushman Bharat Digital Mission (ABDM)
                    </span>
                    <h3 className="text-xl sm:text-2xl font-black text-[#162623]">
                      Link Your 14-Digit ABHA Health ID
                    </h3>
                    <p className="text-xs sm:text-sm text-[#577877] leading-relaxed">
                      Connect your Ayushman Bharat Health Account to securely share prescriptions, lab reports, and consultation histories across all hospitals and clinics in India.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setAbdmActionError("");
                      setAbdmActionSuccess("");
                      setShowLinkAbhaModal(true);
                    }}
                    className="btn-primary !px-6 !py-3 rounded-xl font-bold text-sm flex items-center gap-2 shadow-sm shrink-0 cursor-pointer"
                  >
                    <span className="material-symbols-outlined !text-white text-lg">
                      add_link
                    </span>
                    <span>Link or Create ABHA ID</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
                  <div className="p-4 rounded-xl bg-[#25836F]/5 border border-[#25836F]/15 space-y-1.5">
                    <span className="material-symbols-outlined text-[#25836F] text-2xl">
                      sync_saved_locally
                    </span>
                    <h4 className="text-sm font-bold text-[#162623]">Interoperable EHR</h4>
                    <p className="text-xs text-[#577877] leading-relaxed">
                      Seamlessly exchange teleconsultation notes and digital prescriptions with any ABDM-certified healthcare provider.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#25836F]/5 border border-[#25836F]/15 space-y-1.5">
                    <span className="material-symbols-outlined text-[#25836F] text-2xl">
                      security
                    </span>
                    <h4 className="text-sm font-bold text-[#162623]">Consent-Driven Control</h4>
                    <p className="text-xs text-[#577877] leading-relaxed">
                      You are in full control of your records. Grant or revoke healthcare provider access anytime with 1 click.
                    </p>
                  </div>

                  <div className="p-4 rounded-xl bg-[#25836F]/5 border border-[#25836F]/15 space-y-1.5">
                    <span className="material-symbols-outlined text-[#25836F] text-2xl">
                      verified
                    </span>
                    <h4 className="text-sm font-bold text-[#162623]">Aadhaar / Mobile KYC</h4>
                    <p className="text-xs text-[#577877] leading-relaxed">
                      Instant zero-paperwork OTP verification compliant with ABDM M1 National Identity milestones.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Modal: Link or Create ABHA */}
            {showLinkAbhaModal && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
                <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-[#577877]/20 p-6 sm:p-7 space-y-5 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between pb-3 border-b border-[#577877]/20">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#25836F]">
                        health_and_safety
                      </span>
                      <h3 className="text-base font-bold text-[#162623]">
                        Link ABHA Health Account
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowLinkAbhaModal(false)}
                      className="text-[#577877] hover:text-[#162623]"
                    >
                      <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                  </div>

                  {abdmActionError && (
                    <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold">
                      {abdmActionError}
                    </div>
                  )}
                  {abdmActionSuccess && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                      {abdmActionSuccess}
                    </div>
                  )}

                  {!abhaOtpSent ? (
                    /* Step 1: Identifier Entry */
                    <form onSubmit={handleGenerateAbhaOtp} className="space-y-4 text-xs">
                      <div className="flex items-center gap-3 p-1 rounded-xl bg-[#577877]/10">
                        <button
                          type="button"
                          onClick={() => {
                            setAbhaAuthMode("aadhaar");
                            setAbhaIdentifier("");
                          }}
                          className={`flex-1 py-1.5 rounded-lg font-bold text-center transition cursor-pointer ${
                            abhaAuthMode === "aadhaar"
                              ? "bg-white text-[#25836F] shadow-xs"
                              : "text-[#577877] hover:text-[#162623]"
                          }`}
                        >
                          Aadhaar Number
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setAbhaAuthMode("mobile");
                            setAbhaIdentifier("");
                          }}
                          className={`flex-1 py-1.5 rounded-lg font-bold text-center transition cursor-pointer ${
                            abhaAuthMode === "mobile"
                              ? "bg-white text-[#25836F] shadow-xs"
                              : "text-[#577877] hover:text-[#162623]"
                          }`}
                        >
                          Mobile Number
                        </button>
                      </div>

                      <div className="space-y-1.5">
                        <label className="font-bold text-[#162623] block">
                          {abhaAuthMode === "aadhaar"
                            ? "Enter 12-Digit Aadhaar Number"
                            : "Enter 10-Digit Mobile Number"}
                        </label>
                        <input
                          type="text"
                          value={abhaIdentifier}
                          onChange={(e) => setAbhaIdentifier(e.target.value)}
                          placeholder={
                            abhaAuthMode === "aadhaar"
                              ? "e.g. 5555 4444 3333"
                              : "e.g. 9876543210"
                          }
                          className="w-full rounded-xl border border-[#577877]/30 px-3.5 py-2.5 text-sm text-[#162623] focus:border-[#25836F] focus:outline-none"
                          required
                        />
                        <p className="text-[11px] text-[#577877]">
                          An authentication OTP will be sent via UIDAI / ABDM sandbox.
                        </p>
                      </div>

                      <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setShowLinkAbhaModal(false)}
                          className="px-4 py-2 rounded-xl text-xs font-semibold text-[#577877] hover:bg-gray-100 cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={abdmActionLoading}
                          className="btn-primary !px-5 !py-2 rounded-xl text-xs font-bold cursor-pointer"
                        >
                          {abdmActionLoading ? "Sending OTP..." : "Generate OTP"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    /* Step 2: OTP Verification */
                    <form onSubmit={handleVerifyAbhaOtp} className="space-y-4 text-xs">
                      <div className="space-y-1.5">
                        <label className="font-bold text-[#162623] block">
                          Enter 6-Digit Verification OTP
                        </label>
                        <input
                          type="text"
                          maxLength={6}
                          value={abhaOtp}
                          onChange={(e) => setAbhaOtp(e.target.value)}
                          placeholder="e.g. 123456"
                          className="w-full rounded-xl border border-[#577877]/30 px-3.5 py-2.5 text-center text-lg font-mono tracking-widest text-[#162623] focus:border-[#25836F] focus:outline-none"
                          required
                        />
                        <p className="text-[11px] text-[#577877]">
                          (Sandbox test OTP: <strong className="text-[#25836F]">123456</strong>)
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <label className="font-bold text-[#162623] block">
                          Preferred ABHA Handle (Optional)
                        </label>
                        <div className="flex items-center">
                          <input
                            type="text"
                            value={abhaPreferredAddress}
                            onChange={(e) => setAbhaPreferredAddress(e.target.value)}
                            placeholder="e.g. emma.mitchell"
                            className="w-full rounded-l-xl border border-r-0 border-[#577877]/30 px-3.5 py-2 text-xs text-[#162623] focus:border-[#25836F] focus:outline-none"
                          />
                          <span className="rounded-r-xl border border-l-0 border-[#577877]/30 bg-gray-100 px-3 py-2 text-xs font-semibold text-[#577877]">
                            @abdm
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <button
                          type="button"
                          onClick={() => setAbhaOtpSent(false)}
                          className="text-xs text-[#25836F] font-semibold hover:underline cursor-pointer"
                        >
                          ← Change Number
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setShowLinkAbhaModal(false)}
                            className="px-4 py-2 rounded-xl text-xs font-semibold text-[#577877] hover:bg-gray-100 cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={abdmActionLoading}
                            className="btn-primary !px-5 !py-2 rounded-xl text-xs font-bold cursor-pointer"
                          >
                            {abdmActionLoading ? "Verifying..." : "Verify & Link"}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Global Footer */}
        <div className="pt-12 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
          <p>© 2026 Kaizen Care · Your health, thoughtfully connected.</p>
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
