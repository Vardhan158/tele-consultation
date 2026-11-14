import { useState, useEffect } from "react";
import { patientApi } from "../../lib/api";

const basePermissionsList = [
  {
    id: "telehealth",
    title: "Telehealth care consent",
    description:
      "Consent to receive care through video appointments. Required for video visits.",
    required: true,
  },
  {
    id: "medical_record_sharing",
    title: "Share records with your care team",
    description:
      "Allow your treating providers to access records relevant to your care.",
    required: false,
  },
  {
    id: "reminders",
    title: "Appointment reminders",
    description:
      "Receive optional appointment and follow-up care reminders by email and SMS.",
    required: false,
  },
  {
    id: "communication_preferences",
    title: "Communication preferences & updates",
    description:
      "Receive optional care updates, health portal notices, and wellness recommendations.",
    required: false,
  },
  {
    id: "research",
    title: "Optional health research",
    description:
      "Allow contact regarding optional clinical research opportunities. This does not affect your care.",
    required: false,
  },
];

export default function ConsentScreen({ onNavigate }) {
  const [permissions, setPermissions] = useState([]);
  const [activity, setActivity] = useState([]);
  const [lastSaved, setLastSaved] = useState("Checking saved directives...");
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [toastMessage, setToastMessage] = useState("");

  const fetchConsents = async () => {
    try {
      const items = await patientApi.consents();
      if (Array.isArray(items)) {
        const mappedPermissions = basePermissionsList.map((perm) => {
          const found = items.find(
            (c) =>
              c.consent_type === perm.id ||
              (c.consent_type === "treatment" && perm.id === "telehealth") ||
              (c.consent_type === "news" && perm.id === "communication_preferences"),
          );
          if (found) {
            const isGranted = found.status === "granted" || found.status === "active";
            const dt = found.granted_at ? new Date(found.granted_at) : new Date();
            const dateStr = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            return {
              ...perm,
              dbId: found.id,
              granted: isGranted,
              statusText: isGranted ? `Granted · ${dateStr}` : `Withdrawn · ${dateStr}`,
            };
          }
          return {
            ...perm,
            dbId: null,
            granted: perm.required || perm.id === "medical_record_sharing" || perm.id === "reminders",
            statusText: perm.required || perm.id === "medical_record_sharing" || perm.id === "reminders" ? "Granted" : "Not granted",
          };
        });
        setPermissions(mappedPermissions);

        // Update Last Saved Date Banner from latest consent record
        if (items.length > 0) {
          const latest = items[0];
          const latestDt = new Date(latest.granted_at || Date.now());
          const dateFormatted = latestDt.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          });
          const timeFormatted = latestDt.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          });
          setLastSaved(`${dateFormatted} at ${timeFormatted}`);
        } else {
          setLastSaved("Default Preferences");
        }

        // Map Audit History Table
        const auditItems = items.map((c, idx) => {
          const dt = new Date(c.granted_at || Date.now());
          const matchPerm = basePermissionsList.find(p => p.id === c.consent_type || (p.id === "telehealth" && c.consent_type === "treatment"));
          const title = matchPerm ? matchPerm.title : c.consent_type;
          return {
            id: c.id || `act-${idx}`,
            permission: title,
            change: c.status === "granted" || c.status === "active" ? "Granted" : "Withdrawn",
            datetime: `${dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
            source: "Patient portal",
          };
        });
        setActivity(auditItems);
      }
    } catch {
      // Handled
    }
  };

  useEffect(() => {
    fetchConsents();
  }, []);

  const handleToggle = async (id) => {
    const target = permissions.find((p) => p.id === id);
    if (!target) return;

    if (target.required && target.granted) {
      if (
        !window.confirm(
          "Telehealth care consent is required for video consultations. Withdrawing will prevent upcoming teleconsultation sessions. Continue?",
        )
      ) {
        return;
      }
    }

    const nextGranted = !target.granted;
    const consentType = target.id === "telehealth" ? "treatment" : target.id;

    try {
      if (nextGranted) {
        await patientApi.grantConsent({
          consent_type: consentType,
          version: "v1.0",
        });
        setToastMessage(`Consent for "${target.title}" granted.`);
      } else if (target.dbId) {
        await patientApi.withdrawConsent(target.dbId);
        setToastMessage(`Consent for "${target.title}" withdrawn.`);
      } else {
        await patientApi.grantConsent({
          consent_type: consentType,
          version: "v1.0",
        });
        if (target.dbId) await patientApi.withdrawConsent(target.dbId);
        setToastMessage(`Consent for "${target.title}" updated.`);
      }
      await fetchConsents();
    } catch (err) {
      setToastMessage(err.message || "Failed to update consent preference.");
    }
    setTimeout(() => setToastMessage(""), 3500);
  };

  const handleDownloadRecord = () => {
    const text = [
      "KAIZEN CARE - PATIENT CONSENT & PRIVACY DIRECTIVES AUDIT RECORD",
      `Generated: ${new Date().toLocaleString()}`,
      `Last Verified: ${lastSaved}`,
      "--------------------------------------------------",
      ...permissions.map((p) => `• ${p.title}: ${p.granted ? "Granted" : "Withdrawn"} (${p.statusText})`),
      "--------------------------------------------------",
      "Consent directives are logged in the immutable security audit store.",
    ].join("\n");

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "KaizenCare_Consent_Audit_Record.txt";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToastMessage("Consent audit record downloaded successfully.");
    setTimeout(() => setToastMessage(""), 3500);
  };

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Toast */}
        {toastMessage && (
          <div className="p-3.5 rounded-xl bg-white border border-[#25836F]/30 shadow-sm flex items-center justify-between text-xs text-[#25836F] font-semibold">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base">check_circle</span>
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

        {/* Top Header Row with Title and Action Button */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#162623]">
              Your data. Your choices.
            </h1>
            <p className="mt-1.5 text-sm text-[#577877]">
              Understand and manage how your health information is used and
              shared.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownloadRecord}
            className="btn-secondary !px-5 !py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-2xs shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined !text-[#25836F] text-base">
              download
            </span>
            <span>Download consent record</span>
          </button>
        </div>

        {/* Up-to-date Status Banner */}
        <div className="p-4 rounded-2xl bg-[#E8F3F3] border border-[#577877]/20 flex items-start sm:items-center gap-3">
          <span className="material-symbols-outlined !text-[#25836F] text-xl shrink-0 mt-0.5 sm:mt-0">
            check_circle
          </span>
          <div className="text-xs">
            <p className="font-bold text-[#162623]">
              Your preferences are up to date
            </p>
            <p className="text-[#577877] mt-0.5">
              Last saved {lastSaved}. You can change optional choices at any
              time.
            </p>
          </div>
        </div>

        {/* Main 2-Column Split View */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Care & communication permissions */}
          <div className="lg:col-span-8 care-card p-7 sm:p-8 space-y-6 bg-white rounded-2xl border border-[#577877]/15">
            <h2 className="text-lg font-bold text-[#162623]">
              Care &amp; communication permissions
            </h2>

            <div className="space-y-6 divide-y divide-[#577877]/15">
              {permissions.map((perm, idx) => (
                <div
                  key={perm.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    idx > 0 ? "pt-6" : ""
                  }`}
                >
                  <div className="space-y-1.5 max-w-xl">
                    <h3 className="text-sm font-bold text-[#162623]">
                      {perm.title}
                    </h3>
                    <p className="text-xs text-[#577877] leading-relaxed">
                      {perm.description}
                    </p>
                    <div className="pt-1">
                      <span
                        className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                          perm.granted
                            ? "bg-[#E7F3F1] text-[#25836F]"
                            : "bg-[#F0F5F7] text-[#577877]"
                        }`}
                      >
                        {perm.statusText}
                      </span>
                    </div>
                  </div>

                  {/* Accessible Switch */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={perm.granted}
                    onClick={() => handleToggle(perm.id)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#25836F]/20 ${
                      perm.granted ? "bg-[#25836F]" : "bg-[#C5D5D7]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                        perm.granted ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Informative Panels */}
          <div className="lg:col-span-4 space-y-5">
            <div className="care-card p-6 sm:p-7 space-y-4 bg-white rounded-2xl border border-[#577877]/15">
              <h3 className="text-base font-bold text-[#162623]">
                Informed, not overwhelmed
              </h3>

              <div>
                <span className="inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-[#E7F3F1] text-[#25836F]">
                  You are in control
                </span>
              </div>

              <p className="text-xs text-[#577877] leading-relaxed">
                Withdrawing optional consent does not affect access to your
                existing care or records.
              </p>

              <p className="text-xs text-[#577877] leading-relaxed">
                Some information may need to be retained for clinical or legal
                reasons.
              </p>

              <div className="pt-2 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowPrivacyModal(true)}
                  className="btn-secondary w-full text-xs font-semibold py-2.5 rounded-xl cursor-pointer"
                >
                  Read privacy policy
                </button>

                <button
                  type="button"
                  onClick={() => onNavigate && onNavigate("support")}
                  className="text-xs font-semibold text-[#25836F] hover:underline block mx-auto text-center cursor-pointer"
                >
                  Ask a privacy question
                </button>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-[#E8F3F3] border border-[#577877]/20 flex items-start gap-3">
              <span className="material-symbols-outlined !text-[#25836F] text-lg shrink-0 mt-0.5">
                info
              </span>
              <div className="text-xs space-y-1">
                <p className="font-bold text-[#162623]">
                  Before your next video visit
                </p>
                <p className="text-[#577877] leading-relaxed">
                  Your telehealth consent is active. You can review the full
                  consent document before joining.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Card: Consent Activity Table */}
        <div className="care-card p-7 sm:p-8 space-y-5 bg-white rounded-2xl border border-[#577877]/15">
          <h2 className="text-lg font-bold text-[#162623]">Consent activity</h2>

          {activity.length === 0 ? (
            <p className="text-xs text-[#577877]">No recent consent activity recorded.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#577877]/15 text-[#577877] font-medium">
                    <th className="pb-3 font-semibold">Permission</th>
                    <th className="pb-3 font-semibold">Change</th>
                    <th className="pb-3 font-semibold">Date &amp; time</th>
                    <th className="pb-3 font-semibold">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#577877]/10">
                  {activity.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-[#F0F5F7]/50 transition"
                    >
                      <td className="py-3.5 font-medium text-[#162623]">
                        {item.permission}
                      </td>
                      <td className="py-3.5 text-[#577877]">{item.change}</td>
                      <td className="py-3.5 text-[#577877]">{item.datetime}</td>
                      <td className="py-3.5 text-[#577877]">{item.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Global Footer */}
        <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
          <p>© 2026 Kaizen Care · Your health, thoughtfully connected.</p>
          <div className="flex items-center gap-4">
            <span
              className="hover:text-[#162623] cursor-pointer"
              onClick={() => setShowPrivacyModal(true)}
            >
              Privacy
            </span>
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

      {/* Privacy Policy Modal */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-8 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined !text-[#25836F] text-2xl">
                  policy
                </span>
                <h3 className="text-base font-bold text-[#162623]">
                  Kaizen Care Privacy Notice
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7]"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#577877] leading-relaxed max-h-72 overflow-y-auto pr-1">
              <p>
                <strong>1. Data Encryption &amp; Security:</strong> All patient
                personal identifiable information (PII) and protected health
                information (PHI) are transmitted over TLS 1.3 and encrypted at
                rest with AES-256 in strict accordance with DISHA and HIPAA
                frameworks.
              </p>
              <p>
                <strong>2. Telehealth Consultations:</strong> Video appointments
                are conducted through private, peer-to-peer or server-tokenized
                WebRTC rooms. Audio and video streams are never stored without
                explicit multi-party clinical consent.
              </p>
              <p>
                <strong>3. Right to Revoke:</strong> Patients maintain the
                continuous right to grant or withdraw consent for non-essential
                communications and diagnostic sharing at any time via this
                portal.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPrivacyModal(false)}
                className="btn-primary text-xs !py-2 !px-5 cursor-pointer"
              >
                Understood &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
