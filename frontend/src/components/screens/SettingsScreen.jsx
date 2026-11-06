import { useEffect, useState } from 'react';
import { settingsApi } from '../../lib/api';

export default function SettingsScreen({ onNavigate }) {
  const [activeTab, setActiveTab] = useState('account'); // 'account' | 'notifications' | 'accessibility' | 'privacy'

  // Form State
  const [email, setEmail] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [twoStepEnabled, setTwoStepEnabled] = useState(false);
  const [emailReminders, setEmailReminders] = useState(true);
  const [smsReminders, setSmsReminders] = useState(true);
  const [wellnessUpdates, setWellnessUpdates] = useState(false);
  const [language, setLanguage] = useState('English (US)');
  const [timeZone, setTimeZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Modals & Feedback
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showClosureModal, setShowClosureModal] = useState(false);
  const [tempEmail, setTempEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [sessionSignedOut, setSessionSignedOut] = useState(false);
  const [closureStatus, setClosureStatus] = useState('');
  const [closureSubmitting, setClosureSubmitting] = useState(false);
  const [savedPreferences, setSavedPreferences] = useState(null);

  useEffect(() => {
    settingsApi.get()
      .then((settings) => {
        setEmail(settings.email || '');
        setEmailVerified(Boolean(settings.email_verified));
        setTempEmail(settings.email || '');
        setEmailReminders(settings.email_reminders);
        setSmsReminders(settings.sms_reminders);
        setWellnessUpdates(settings.wellness_updates);
        setLanguage(settings.language === 'en' ? 'English (US)' : settings.language || 'English (US)');
        setTimeZone(settings.time_zone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
        setClosureStatus(settings.privacy?.closure_request?.status || '');
        setSavedPreferences({ emailReminders: settings.email_reminders, smsReminders: settings.sms_reminders, wellnessUpdates: settings.wellness_updates, language: settings.language === 'en' ? 'English (US)' : settings.language || 'English (US)', timeZone: settings.time_zone || 'UTC' });
      })
      .catch((err) => setError(err.message || 'Unable to load your settings.'))
      .finally(() => setLoading(false));
  }, []);

  const handleSavePreferences = async () => {
    setError('');
    setSaving(true);
    try {
      await settingsApi.update({ email_reminders: emailReminders, sms_reminders: smsReminders, wellness_updates: wellnessUpdates, language, time_zone: timeZone });
      setSavedPreferences({ emailReminders, smsReminders, wellnessUpdates, language, timeZone });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err.message || 'Unable to save your preferences.');
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateEmail = (e) => {
    e.preventDefault();
    if (tempEmail.trim()) {
      setEmail(tempEmail.trim());
      setShowEmailModal(false);
    }
  };

  const handleUpdatePassword = (e) => {
    e.preventDefault();
    if (!currentPassword || newPassword.length < 8 || newPassword !== confirmPassword) return;
    settingsApi.changePassword({ current_password: currentPassword, new_password: newPassword })
      .then(() => { setShowPasswordModal(false); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000); })
      .catch((err) => setError(err.message || 'Unable to change your password.'));
  };

  const handleSignOutOtherDevices = async () => {
    try {
      const sessions = await settingsApi.sessions();
      await Promise.all((sessions || []).slice(1).map((session) => settingsApi.revokeSession(session.id)));
      setSessionSignedOut(true);
    } catch (err) {
      setError(err.message || 'Unable to sign out other devices.');
    }
  };

  const preferencesChanged = !savedPreferences || emailReminders !== savedPreferences.emailReminders || smsReminders !== savedPreferences.smsReminders || wellnessUpdates !== savedPreferences.wellnessUpdates || language !== savedPreferences.language || timeZone !== savedPreferences.timeZone;

  const handleClosureRequest = async () => {
    if (closureStatus === 'pending' || closureSubmitting) return;
    setClosureSubmitting(true);
    setError('');
    try {
      const updated = await settingsApi.requestDeletion();
      setClosureStatus(updated?.status || 'pending');
      setShowClosureModal(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 4000);
    } catch (err) {
      setError(err.message || 'Unable to submit your closure request.');
    } finally {
      setClosureSubmitting(false);
    }
  };

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        {loading && <div className="text-sm text-[#577877]">Loading your settings…</div>}
        {error && <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">{error}</div>}

        {/* Header matching Screenshot 1:1 */}
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
            onClick={handleSavePreferences}
            disabled={!preferencesChanged || saving || loading}
            className="self-start sm:self-auto bg-[#295255] hover:bg-[#1f4143] disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-xl font-medium text-xs sm:text-sm shadow-sm transition flex items-center gap-2 cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">check</span>
            <span>Save changes</span>
          </button>
        </div>

        {/* Success toast notification */}
        {saveSuccess && (
          <div className="p-3.5 bg-[#E6F4EA] border border-[#137333]/20 rounded-xl text-xs sm:text-sm text-[#137333] font-medium flex items-center gap-2 animate-in fade-in">
            <span className="material-symbols-outlined text-lg">check_circle</span>
            <span>Changes saved successfully!</span>
          </div>
        )}
        {closureStatus === 'pending' && (
          <div className="p-3.5 bg-[#E8F3F3] border border-[#295255]/20 rounded-xl text-xs sm:text-sm text-[#295255] font-medium">
            <span className="font-bold">Account closure request submitted.</span> Your request has been received and is pending review. You can continue accessing your account until the closure process is completed, subject to your account status.
          </div>
        )}

        {/* Navigation Tabs matching Screenshot */}
        <div className="flex items-center gap-6 border-b border-[#577877]/15 overflow-x-auto text-xs sm:text-sm">
          <button
            type="button"
            onClick={() => setActiveTab('account')}
            className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'account'
                ? 'text-[#295255] border-b-2 border-[#295255]'
                : 'text-[#577877] hover:text-[#162623]'
            }`}
          >
            Account & security
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('accessibility')}
            className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'accessibility'
                ? 'text-[#295255] border-b-2 border-[#295255]'
                : 'text-[#577877] hover:text-[#162623]'
            }`}
          >
            Accessibility
          </button>

          <button
            type="button"
            onClick={() => (onNavigate ? onNavigate('consent') : setActiveTab('privacy'))}
            className={`pb-3 -mb-px font-semibold transition cursor-pointer whitespace-nowrap ${
              activeTab === 'privacy'
                ? 'text-[#295255] border-b-2 border-[#295255]'
                : 'text-[#577877] hover:text-[#162623]'
            }`}
          >
            Privacy
          </button>
        </div>

        {/* Main 2-Column Content Layout matching Screenshot */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">

          {/* Left Column (8 cols): Security, Communication & Regional Cards */}
          <div className="lg:col-span-8 space-y-6">

            {/* CARD 1: Account security matching Screenshot */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-5">
              <h2 className="text-base sm:text-lg font-bold text-[#162623]">
                Account security
              </h2>

              <div className="space-y-4">
                {/* Row 1: Account email */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                  <div>
                    <span className="text-xs text-[#577877] block">Account email</span>
                    <span className="text-sm font-semibold text-[#162623] mt-0.5 block">
                      {email}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <span className="bg-[#E6F4EA] text-[#137333] text-xs font-medium px-2.5 py-0.5 rounded-full">
                      {emailVerified ? 'Email verified' : 'Email not verified'}
                    </span>
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
                    <span className="text-xs text-[#577877] block">Password</span>
                    <span className="text-sm font-semibold text-[#162623] mt-0.5 block">
                      Password protected
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
                      Add a one-time code at login for another layer of protection.
                    </p>
                    <span className="bg-[#E8F3F3] text-[#295255] text-xs font-medium px-2.5 py-0.5 rounded-full mt-2 inline-block">
                      {twoStepEnabled ? 'Enabled' : 'Not enabled'}
                    </span>
                  </div>

                  {/* Switch Toggle */}
                  <button
                    type="button"
                    onClick={() => setTwoStepEnabled(!twoStepEnabled)}
                    aria-label="Toggle two-step verification"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none mt-1 ${
                      twoStepEnabled ? 'bg-[#295255]' : 'bg-[#E5E7EB]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        twoStepEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>

            {/* CARD 2: Communication preferences matching Screenshot */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-5">
              <h2 className="text-base sm:text-lg font-bold text-[#162623]">
                Communication preferences
              </h2>

              <div className="space-y-4">
                {/* Email reminders */}
                <div className="flex items-start justify-between gap-4 pt-1">
                  <div>
                    <h3 className="text-sm font-semibold text-[#162623]">
                      Email reminders
                    </h3>
                    <p className="text-xs text-[#577877] mt-0.5">
                      Upcoming appointments, visit preparation, and follow-up reminders.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setEmailReminders(!emailReminders)}
                    aria-label="Toggle email reminders"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      emailReminders ? 'bg-[#295255]' : 'bg-[#E5E7EB]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        emailReminders ? 'translate-x-5' : 'translate-x-0'
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
                      Time-sensitive appointment updates to your verified phone number.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSmsReminders(!smsReminders)}
                    aria-label="Toggle SMS reminders"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      smsReminders ? 'bg-[#295255]' : 'bg-[#E5E7EB]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        smsReminders ? 'translate-x-5' : 'translate-x-0'
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
                    onClick={() => setWellnessUpdates(!wellnessUpdates)}
                    aria-label="Toggle optional wellness updates"
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      wellnessUpdates ? 'bg-[#295255]' : 'bg-[#E5E7EB]'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                        wellnessUpdates ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <p className="text-[11px] text-[#577877] pt-2">
                  Essential service and safety messages are sent regardless of optional preferences.
                </p>
              </div>
            </div>

            {/* CARD 3: Regional preferences matching Screenshot */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-4">
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
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] bg-white focus:outline-none focus:border-[#295255] cursor-pointer"
                    >
                      <option value="English (US)">English (US)</option>
                      <option value="Spanish (Español)">Spanish (Español)</option>
                      <option value="French (Français)">French (Français)</option>
                      <option value="Mandarin (中文)">Mandarin (中文)</option>
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
                      onChange={(e) => setTimeZone(e.target.value)}
                      className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] bg-white focus:outline-none focus:border-[#295255] cursor-pointer"
                    >
                      <option value="Pacific Time (US & Canada)">Pacific Time (US & Canada)</option>
                      <option value="Mountain Time (US & Canada)">Mountain Time (US & Canada)</option>
                      <option value="Central Time (US & Canada)">Central Time (US & Canada)</option>
                      <option value="Eastern Time (US & Canada)">Eastern Time (US & Canada)</option>
                      <option value="UTC / Greenwich Mean Time">UTC / Greenwich Mean Time</option>
                      <option value="Asia/Kolkata">Asia/Kolkata</option>
                    </select>
                    <span className="material-symbols-outlined absolute right-3 top-3 text-[#577877] text-base pointer-events-none">
                      expand_more
                    </span>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column (4 cols): Active session, Control information, Account management */}
          <div className="lg:col-span-4 space-y-6">

            {/* CARD 1: Your active session matching Screenshot */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-4">
              <h2 className="text-base font-bold text-[#162623]">
                Your active session
              </h2>

              <div>
                <span className="bg-[#EFF6FF] text-[#2563EB] text-xs font-semibold px-2.5 py-0.5 rounded-full inline-block">
                  This device
                </span>
              </div>

              <div className="space-y-3 pt-1">
                <div>
                  <span className="text-xs text-[#577877] block">Browser</span>
                  <span className="text-xs sm:text-sm font-semibold text-[#162623] mt-0.5 block">
                    Current browser session
                  </span>
                </div>

                <div>
                  <span className="text-xs text-[#577877] block">Approximate location</span>
                  <span className="text-xs sm:text-sm font-semibold text-[#162623] mt-0.5 block">
                    Location unavailable
                  </span>
                </div>

                <div>
                  <span className="text-xs text-[#577877] block">Signed in</span>
                  <span className="text-xs sm:text-sm font-semibold text-[#162623] mt-0.5 block">
                    Current session
                  </span>
                </div>
              </div>

              {sessionSignedOut && (
                <div className="p-2.5 bg-[#E6F4EA] border border-[#137333]/20 rounded-xl text-xs text-[#137333] font-medium flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">check</span>
                  <span>Signed out of 2 other active sessions.</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSignOutOtherDevices}
                className="w-full border border-[#577877]/30 bg-white text-[#162623] hover:bg-[#F0F5F7] font-semibold text-xs sm:text-sm py-2.5 rounded-xl transition cursor-pointer shadow-2xs mt-1"
              >
                Sign out other devices
              </button>
            </div>

            {/* CARD 2: Control your information matching Screenshot */}
            <div className="rounded-2xl p-5 bg-[#E8F3F3] border border-[#295255]/20 flex items-start gap-3.5 shadow-2xs">
              <span className="material-symbols-outlined !text-[#295255] text-lg shrink-0 mt-0.5">
                verified_user
              </span>
              <div>
                <h3 className="text-xs sm:text-sm font-bold text-[#295255]">
                  Control your information
                </h3>
                <p className="text-xs text-[#577877] mt-1 leading-relaxed">
                  Review data-sharing choices, request your records, or contact our privacy team from Consent management.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate('consent')}
                  className="mt-2 text-xs font-semibold text-[#295255] hover:underline cursor-pointer inline-flex items-center gap-1"
                >
                  <span>Open consent settings →</span>
                </button>
              </div>
            </div>

            {/* CARD 3: Account management matching Screenshot */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 shadow-[0_4px_20px_-2px_rgba(22,38,35,0.05)] space-y-3">
              <h2 className="text-base font-bold text-[#162623]">
                Account management
              </h2>

              <p className="text-xs text-[#577877] leading-relaxed">
                Closing your account does not automatically delete records that must be retained.
              </p>

              <div>
                <button
                  type="button"
                  onClick={() => setShowClosureModal(true)}
                  className="text-xs font-semibold text-[#DC2626] hover:underline cursor-pointer inline-flex items-center gap-1"
                >
                  <span>Request account closure →</span>
                </button>
              </div>
            </div>

          </div>

        </div>

      </div>

      {/* Change Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl border border-[#577877]/20 shadow-xl p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <h3 className="text-base font-bold text-[#162623]">Change account email</h3>
              <button
                type="button"
                onClick={() => setShowEmailModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#577877] hover:bg-[#F0F5F7] transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <form onSubmit={handleUpdateEmail} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#162623] block mb-1">
                  New email address
                </label>
                <input
                  type="email"
                  required
                  value={tempEmail}
                  onChange={(e) => setTempEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#295255]"
                />
              </div>
              <p className="text-[11px] text-[#577877]">
                A verification link will be sent to confirm your new email address.
              </p>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 border border-[#577877]/30 rounded-xl text-xs font-semibold text-[#162623] hover:bg-[#F0F5F7]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary !px-5 !py-2 rounded-xl text-xs font-semibold"
                >
                  Update email
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl border border-[#577877]/20 shadow-xl p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <h3 className="text-base font-bold text-[#162623]">Change password</h3>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#577877] hover:bg-[#F0F5F7] transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <form onSubmit={handleUpdatePassword} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-[#162623] block mb-1">Current password</label>
                <input type="password" required minLength={8} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#295255]" />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#162623] block mb-1">
                  New password
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#295255]"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[#162623] block mb-1">
                  Confirm new password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#577877]/25 text-xs sm:text-sm text-[#162623] focus:outline-none focus:border-[#295255]"
                />
              </div>
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowPasswordModal(false)}
                  className="px-4 py-2 border border-[#577877]/30 rounded-xl text-xs font-semibold text-[#162623] hover:bg-[#F0F5F7]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary !px-5 !py-2 rounded-xl text-xs font-semibold"
                >
                  Update password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Account Closure Modal */}
      {showClosureModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/40 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-2xl border border-[#577877]/20 shadow-xl p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <h3 className="text-base font-bold text-[#DC2626]">Request account closure</h3>
              <button
                type="button"
                onClick={() => setShowClosureModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-[#577877] hover:bg-[#F0F5F7] transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
            <p className="text-xs text-[#577877] leading-relaxed">
              Your request will be reviewed under Kaizentrix Care’s applicable records-retention and privacy policy. Your account and medical records will not be deleted immediately, and you can continue accessing your account while the request is pending.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowClosureModal(false)}
                className="px-4 py-2 border border-[#577877]/30 rounded-xl text-xs font-semibold text-[#162623] hover:bg-[#F0F5F7]"
              >
                Keep account
              </button>
              <button
                type="button"
                onClick={handleClosureRequest}
                disabled={closureStatus === 'pending' || closureSubmitting}
                className="bg-[#DC2626] hover:bg-[#B91C1C] disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                {closureSubmitting ? 'Submitting…' : closureStatus === 'pending' ? 'Request pending' : 'Submit closure request'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
