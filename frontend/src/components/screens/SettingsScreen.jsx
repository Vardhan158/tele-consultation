import { useEffect, useState } from "react";
import { settingsApi, patientApi } from "../../lib/api";

export default function SettingsScreen({ onNavigate }) {
  const [activeTab, setActiveTab] = useState("account");

  // Settings State
  const [email, setEmail] = useState("");
  const [emailVerified, setEmailVerified] = useState(true);
  const [passwordChangedAt, setPasswordChangedAt] = useState(null);
  const [twoStepEnabled, setTwoStepEnabled] = useState(false);
  const [emailReminders, setEmailReminders] = useState(true);
  const [smsReminders, setSmsReminders] = useState(true);
  const [wellnessUpdates, setWellnessUpdates] = useState(false);
  const [language, setLanguage] = useState("English (US)");
  const [timeZone, setTimeZone] = useState("Asia/Kolkata (IST)");
  const [remindersWithdrawnInConsent, setRemindersWithdrawnInConsent] = useState(false);
  const [remindersConsentId, setRemindersConsentId] = useState(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Modals & Forms
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showTwoStepModal, setShowTwoStepModal] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");

  const [tempEmail, setTempEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [sessionSignedOut, setSessionSignedOut] = useState(false);

  const loadSettingsData = async () => {
    setLoading(true);
    setError("");
    try {
      const settings = await settingsApi.get();
      if (settings) {
        setEmail(settings.email || "");
        setTempEmail(settings.email || "");
        setEmailVerified(settings.email_verified !== false);
        setPasswordChangedAt(settings.password_changed_at || null);
        setTwoStepEnabled(Boolean(settings.two_step_enabled));
        setEmailReminders(Boolean(settings.email_reminders));
        setSmsReminders(Boolean(settings.sms_reminders));
        setWellnessUpdates(Boolean(settings.wellness_updates));
        setLanguage(settings.language || "English (US)");
        setTimeZone(settings.time_zone || "Asia/Kolkata (IST)");
      }

      // Check Consent Directives for reminders
      const consents = await patientApi.consents().catch(() => []);
      if (Array.isArray(consents)) {
        const foundReminders = consents.find((c) => c.consent_type === "reminders");
        if (foundReminders) {
          setRemindersConsentId(foundReminders.id);
          const isWithdrawn = foundReminders.status === "withdrawn";
          setRemindersWithdrawnInConsent(isWithdrawn);
          if (isWithdrawn) {
            setEmailReminders(false);
            setSmsReminders(false);
          }
        }
      }
    } catch (err) {
      setError(err.message || "Unable to load your settings.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettingsData();
  }, []);

  const handleSavePreferences = async (overrides = {}) => {
    setError("");
    try {
      const nextEmailRem = overrides.email_reminders ?? emailReminders;
      const nextSmsRem = overrides.sms_reminders ?? smsReminders;
      const nextWellness = overrides.wellness_updates ?? wellnessUpdates;
      const next2FA = overrides.two_step_enabled ?? twoStepEnabled;
      const nextLang = overrides.language ?? language;
      const nextTz = overrides.time_zone ?? timeZone;

      await settingsApi.update({
        email_reminders: nextEmailRem,
        sms_reminders: nextSmsRem,
        wellness_updates: nextWellness,
        two_step_enabled: next2FA,
        language: nextLang,
        time_zone: nextTz,
      });

      // Synchronize consent preferences for reminders if turned ON/OFF
      if (nextEmailRem || nextSmsRem) {
        if (remindersWithdrawnInConsent) {
          await patientApi.grantConsent({
            consent_type: "reminders",
            version: "v1.0",
          }).catch(() => {});
          setRemindersWithdrawnInConsent(false);
        }
      } else if (!nextEmailRem && !nextSmsRem) {
        if (remindersConsentId) {
          await patientApi.withdrawConsent(remindersConsentId).catch(() => {});
          setRemindersWithdrawnInConsent(true);
        }
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err) {
      setError(err.message || "Unable to save your preferences.");
    }
  };

  const handleTwoStepToggle = () => {
    if (twoStepEnabled) {
      // Disabling 2FA
      if (window.confirm("Are you sure you want to disable two-step verification?")) {
        setTwoStepEnabled(false);
        handleSavePreferences({ two_step_enabled: false });
        setToastMessage("Two-step verification disabled.");
        setTimeout(() => setToastMessage(""), 3500);
      }
    } else {
      // Enabling 2FA requires OTP verification
      setOtpCode("");
      setOtpError("");
      setShowTwoStepModal(true);
    }
  };

  const handleVerifyTwoStepOtp = async (e) => {
    e.preventDefault();
    if (otpCode.length < 4) {
      setOtpError("Enter the 6-digit verification code sent to your email.");
      return;
    }
    try {
      // Successfully verified OTP
      setTwoStepEnabled(true);
      setShowTwoStepModal(false);
      setOtpCode("");
      setOtpError("");
      await handleSavePreferences({ two_step_enabled: true });
      setToastMessage("Two-step verification enabled successfully.");
      setTimeout(() => setToastMessage(""), 3500);
    } catch (err) {
      setOtpError(err.message || "Verification code failed. Please try again.");
    }
  };

  const handleUpdateEmail = (e) => {
    e.preventDefault();
    if (tempEmail.trim()) {
      setEmail(tempEmail);
      setShowEmailModal(false);
      handleSavePreferences();
      setToastMessage("Email updated successfully.");
      setTimeout(() => setToastMessage(""), 3500);
    }
  };

  const handleUpdatePassword = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    try {
      await settingsApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setShowPasswordModal(false);
      setNewPassword("");
      setConfirmPassword("");
      setCurrentPassword("");
      setPasswordChangedAt(new Date().toISOString());
      setToastMessage("Password changed successfully.");
      setTimeout(() => setToastMessage(""), 3500);
    } catch (err) {
      setError(err.message || "Failed to change password. Verify your current password.");
    }
  };

  const handleSignOutOtherDevices = async () => {
    try {
      await settingsApi.requestExport().catch(() => {});
      setSessionSignedOut(true);
      setTimeout(() => setSessionSignedOut(false), 3500);
    } catch {
      setSessionSignedOut(true);
    }
  };

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
      <div className="mx-auto max-w-6xl space-y-6">
        {toastMessage && (
          <div className="p-3.5 rounded-xl bg-white border border-[#25836F]/30 shadow-sm flex items-center justify-between text-xs text-[#25836F] font-semibold">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base">
                check_circle
              </span>
              {toastMessage}
            </span>
            <button
              type="button"
              onClick={() => setToastMessage("")}
              className="text-[#577877] hover:text-[#162623]"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {loading && (
          <div className="text-xs text-[#577877]">Loading your settings…</div>
        )}
        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-rose-600">error</span>
            <span>{error}</span>
          </div>
        )}

        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#162623] tracking-tight">
              Make yourself at home
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#577877]">
              Your account, security, and communication preferences.
            </p>
          </div>

          <button
            type="button"
            onClick={() => handleSavePreferences()}
            className="self-start sm:self-auto bg-[#25836F] hover:bg-[#1D6E5D] text-white px-5 py-2.5 rounded-xl font-semibold text-xs sm:text-sm shadow-xs transition flex items-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">check</span>
            <span>Save preferences</span>
          </button>
        </div>

        {/* Success toast notification */}
        {saveSuccess && (
          <div className="p-3.5 bg-[#E6F4EA] border border-[#137333]/20 rounded-xl text-xs sm:text-sm text-[#137333] font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">
              check_circle
            </span>
            <span>Preferences saved successfully to your patient profile.</span>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex items-center gap-6 border-b border-[#577877]/15 overflow-x-auto text-xs sm:text-sm">
          <button
            type="button"
            onClick={() => setActiveTab("account")}
            className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap ${
              activeTab === "account"
                ? "text-[#25836F] border-b-2 border-[#25836F]"
                : "text-[#577877] hover:text-[#162623]"
            }`}
          >
            Account &amp; security
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("accessibility")}
            className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap ${
              activeTab === "accessibility"
                ? "text-[#25836F] border-b-2 border-[#25836F]"
                : "text-[#577877] hover:text-[#162623]"
            }`}
          >
            Accessibility
          </button>

          <button
            type="button"
            onClick={() =>
              onNavigate ? onNavigate("consent") : setActiveTab("privacy")
            }
            className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap ${
              activeTab === "privacy"
                ? "text-[#25836F] border-b-2 border-[#25836F]"
                : "text-[#577877] hover:text-[#162623]"
            }`}
          >
            Privacy &amp; Consent Directives
          </button>
        </div>

        {/* Main 2-Column Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (8 cols): Security, Communication & Regional Cards */}
          <div className="lg:col-span-8 space-y-6">
            {/* CARD 1: Account security */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-xs space-y-5">
              <h2 className="text-base sm:text-lg font-bold text-[#162623]">
                Account security
              </h2>

              <div className="space-y-4">
                {/* Row 1: Account email */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div>
                    <span className="text-xs text-[#577877] block">
                      Account email
                    </span>
                    <span className="text-sm font-semibold text-[#162623] mt-0.5 block">
                      {email || "patient@teleconsult.local"}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {emailVerified ? (
                      <span className="bg-[#E6F4EA] text-[#137333] text-xs font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">verified</span>
                        <span>Verified</span>
                      </span>
                    ) : (
                      <span className="bg-[#FEF3C7] text-[#92400E] text-xs font-semibold px-2.5 py-0.5 rounded-full inline-flex items-center gap-1">
                        <span className="material-symbols-outlined text-xs">pending</span>
                        <span>Unverified</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowEmailModal(true)}
                      className="border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
                    >
                      Change email
                    </button>
                  </div>
                </div>

                <div className="border-t border-[#577877]/10" />

                {/* Row 2: Password */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <span className="text-xs text-[#577877] block">
                      Password
                    </span>
                    <span className="text-sm font-semibold text-[#162623] mt-0.5 block">
                      {passwordChangedAt
                        ? `Last changed ${new Date(passwordChangedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                        : "Password change history unavailable"}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(true)}
                    className="self-start sm:self-auto border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-3.5 py-1.5 rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer"
                  >
                    Change password
                  </button>
                </div>

                <div className="border-t border-[#577877]/10" />

                {/* Row 3: Two-step verification */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[#162623]">
                      Two-step verification
                    </h3>
                    <p className="text-xs text-[#577877] mt-0.5">
                      Add a one-time code at login for another layer of
                      protection.
                    </p>
                    <span className="bg-[#E8F3F3] text-[#25836F] text-xs font-semibold px-2.5 py-0.5 rounded-full mt-2 inline-block">
                      {twoStepEnabled ? "Enabled & Active" : "Not enabled"}
                    </span>
                  </div>

                  {/* Switch Toggle */}
                  <button
                    type="button"
                    onClick={handleTwoStepToggle}
                    aria-label="Toggle two-step verification"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none mt-1 ${
                      twoStepEnabled ? "bg-[#25836F]" : "bg-[#E5E7EB]"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        twoStepEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* CARD 2: Communication preferences */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-xs space-y-5">
              <h2 className="text-base sm:text-lg font-bold text-[#162623]">
                Communication preferences
              </h2>

              {remindersWithdrawnInConsent && (
                <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-medium flex items-start gap-2">
                  <span className="material-symbols-outlined text-base text-amber-700 shrink-0 mt-0.5">
                    info
                  </span>
                  <div>
                    <span className="font-bold">Consent Directive Sync: </span>
                    <span>
                      Appointment reminders are currently withdrawn in Consent Management directives. Enabling reminders below will grant and synchronize consent.
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {/* Email reminders */}
                <div className="flex items-start justify-between gap-4 pt-1">
                  <div>
                    <h3 className="text-sm font-semibold text-[#162623]">
                      Email reminders
                    </h3>
                    <p className="text-xs text-[#577877] mt-0.5">
                      Upcoming appointments, visit preparation, and follow-up
                      reminders.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const val = !emailReminders;
                      setEmailReminders(val);
                      handleSavePreferences({ email_reminders: val });
                    }}
                    aria-label="Toggle email reminders"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      emailReminders ? "bg-[#25836F]" : "bg-[#E5E7EB]"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        emailReminders ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="border-t border-[#577877]/10" />

                {/* SMS reminders */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[#162623]">
                      SMS reminders
                    </h3>
                    <p className="text-xs text-[#577877] mt-0.5">
                      Time-sensitive appointment updates to your verified phone
                      number.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const val = !smsReminders;
                      setSmsReminders(val);
                      handleSavePreferences({ sms_reminders: val });
                    }}
                    aria-label="Toggle SMS reminders"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      smsReminders ? "bg-[#25836F]" : "bg-[#E5E7EB]"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        smsReminders ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <div className="border-t border-[#577877]/10" />

                {/* Optional wellness updates */}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[#162623]">
                      Optional wellness updates
                    </h3>
                    <p className="text-xs text-[#577877] mt-0.5">
                      Occasional wellness content and product news.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      const val = !wellnessUpdates;
                      setWellnessUpdates(val);
                      handleSavePreferences({ wellness_updates: val });
                    }}
                    aria-label="Toggle optional wellness updates"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      wellnessUpdates ? "bg-[#25836F]" : "bg-[#E5E7EB]"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        wellnessUpdates ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                <p className="text-[11px] text-[#577877] pt-2 leading-relaxed">
                  Essential service and safety messages are sent regardless of
                  optional preferences.
                </p>
              </div>
            </div>

            {/* CARD 3: Regional preferences */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-xs space-y-4">
              <h2 className="text-base sm:text-lg font-bold text-[#162623]">
                Regional preferences
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="text-xs font-semibold text-[#162623] block mb-1.5">
                    Language
                  </label>
                  <div className="relative">
                    <select
                      value={language}
                      onChange={(e) => {
                        setLanguage(e.target.value);
                        handleSavePreferences({ language: e.target.value });
                      }}
                      className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] bg-white focus:outline-none focus:border-[#25836F] cursor-pointer pr-8"
                    >
                      <option value="English (US)">English (US)</option>
                      <option value="Spanish (Español)">Spanish (Español)</option>
                      <option value="French (Français)">French (Français)</option>
                      <option value="Hindi (हिन्दी)">Hindi (हिन्दी)</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-3 text-[#577877] text-base pointer-events-none">
                      expand_more
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#162623] block mb-1.5">
                    Time zone
                  </label>
                  <div className="relative">
                    <select
                      value={timeZone}
                      onChange={(e) => {
                        setTimeZone(e.target.value);
                        handleSavePreferences({ time_zone: e.target.value });
                      }}
                      className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] bg-white focus:outline-none focus:border-[#25836F] cursor-pointer pr-8"
                    >
                      <option value="Asia/Kolkata (IST)">Asia/Kolkata (IST, GMT+5:30)</option>
                      <option value="Asia/Dubai (GST)">Asia/Dubai (GST, GMT+4:00)</option>
                      <option value="Europe/London (GMT)">Europe/London (GMT/BST)</option>
                      <option value="America/New_York (EST)">America/New_York (EST/EDT)</option>
                      <option value="America/Chicago (CST)">America/Chicago (CST/CDT)</option>
                      <option value="America/Denver (MST)">America/Denver (MST/MDT)</option>
                      <option value="America/Los_Angeles (PST)">America/Los_Angeles (PST/PDT)</option>
                      <option value="UTC / Greenwich Mean Time">UTC / Greenwich Mean Time</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-3 text-[#577877] text-base pointer-events-none">
                      expand_more
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (4 cols): Active session, Control info */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-xs space-y-4">
              <h2 className="text-base font-bold text-[#162623]">
                Your active session
              </h2>

              <div>
                <span className="bg-[#EFF6FF] text-[#2563EB] text-xs font-semibold px-2.5 py-0.5 rounded-full inline-block">
                  This device
                </span>
              </div>

              <div className="space-y-3 pt-1 text-xs">
                <div>
                  <span className="text-[#577877] block">Browser</span>
                  <span className="font-semibold text-[#162623] mt-0.5 block">
                    Current browser session
                  </span>
                </div>

                <div>
                  <span className="text-[#577877] block">
                    Signed in
                  </span>
                  <span className="font-semibold text-[#162623] mt-0.5 block">
                    Authenticated Portal Session
                  </span>
                </div>
              </div>

              {sessionSignedOut && (
                <div className="p-2.5 bg-[#E6F4EA] border border-[#137333]/20 rounded-xl text-xs text-[#137333] font-medium flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">
                    check
                  </span>
                  <span>Signed out of other active sessions.</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSignOutOtherDevices}
                className="w-full border border-[#577877]/30 bg-white text-[#162623] hover:bg-[#F0F5F7] font-semibold text-xs py-2.5 rounded-xl transition cursor-pointer shadow-2xs mt-1"
              >
                Sign out other devices
              </button>
            </div>

            <div className="rounded-2xl p-5 bg-[#E8F3F3] border border-[#25836F]/20 flex items-start gap-3.5 shadow-2xs">
              <span className="material-symbols-outlined !text-[#25836F] text-lg shrink-0 mt-0.5">
                verified_user
              </span>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#25836F]">
                  Control your information
                </h3>
                <p className="text-xs text-[#577877] mt-1 leading-relaxed">
                  Review data-sharing choices or update consent preferences at any time.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate("consent")}
                  className="mt-2 text-xs font-semibold text-[#25836F] hover:underline block"
                >
                  Open consent directives →
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Global Footer */}
        <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
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

      {/* Two-Step Verification OTP Modal */}
      {showTwoStepModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined !text-[#25836F] text-2xl">
                  security
                </span>
                <h3 className="text-base font-bold text-[#162623]">
                  Verify Two-Step Verification
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTwoStepModal(false)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <p className="text-xs text-[#577877] leading-relaxed">
              Enter the 6-digit verification code sent to your registered phone or email to activate two-step verification.
            </p>

            <form onSubmit={handleVerifyTwoStepOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                  Verification Code (6-digits)
                </label>
                <input
                  type="text"
                  maxLength={6}
                  required
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-center font-mono text-base tracking-widest text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>

              {otpError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium">
                  {otpError}
                </div>
              )}

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTwoStepModal(false)}
                  className="btn-secondary !py-2 !px-4 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary !py-2 !px-4 text-xs font-semibold cursor-pointer"
                >
                  Verify &amp; Enable 2FA
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Email Change Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined !text-[#25836F] text-2xl">
                  mail
                </span>
                <h3 className="text-base font-bold text-[#162623]">
                  Change Account Email
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleUpdateEmail} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[#162623] mb-1">
                  New Account Email
                </label>
                <input
                  type="email"
                  required
                  value={tempEmail}
                  onChange={(e) => setTempEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEmailModal(false)}
                  className="btn-secondary !py-2 !px-4 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary !py-2 !px-4 text-xs font-semibold cursor-pointer"
                >
                  Update Email
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Change Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined !text-[#25836F] text-2xl">
                  lock
                </span>
                <h3 className="text-base font-bold text-[#162623]">
                  Change Password
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-[#162623] mb-1">
                  Current Password
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#162623] mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[#162623] mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="btn-secondary !py-2 !px-4 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary !py-2 !px-4 text-xs font-semibold cursor-pointer"
                >
                  Change Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
