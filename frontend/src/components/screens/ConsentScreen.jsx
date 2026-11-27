import { useState, useEffect } from "react";
import { patientApi } from "../../lib/api";

const DEFAULT_DOCUMENTS = [
  {
    id: "teleconsultation",
    consent_type: "teleconsultation",
    title: "Teleconsultation Consent",
    category: "essential",
    required: true,
    version: "v2.1",
    effective_date: "2026-01-01",
    summary:
      "Consent to receive clinical care and medical evaluation through secure real-time audio and video consultations.",
    sections: [
      {
        heading: "1. Understanding Teleconsultation",
        body: "Teleconsultation enables licensed doctors to review your medical history, discuss symptoms, assess non-urgent health conditions, formulate clinical impressions, and provide digital prescriptions or care recommendations over secure audio/video channels.",
      },
      {
        heading: "2. Clinical Limitations & In-Person Care",
        body: "Teleconsultations do not provide direct physical examinations (such as palpation, auscultation, or hands-on clinical assessment). If your physician determines that your symptoms or clinical condition require direct hands-on examination, diagnostic testing, or specialized evaluation, they will advise you to consult an in-person healthcare provider or clinic.",
      },
      {
        heading: "3. Medical Emergencies Protocol",
        body: "Teleconsultation services are strictly intended for non-emergency healthcare needs. In any acute medical emergency—such as severe chest pain, sudden difficulty breathing, profuse bleeding, symptoms of stroke, or severe trauma—you must call your local emergency services immediately or go to the nearest hospital emergency department.",
      },
      {
        heading: "4. Consultation Conduct & Privacy",
        body: "All video and audio consultations take place in private, real-time sessions. Consultations are never recorded without explicit, advance notice and consent from all participants. You are expected to join the consultation from a private, safe, and well-lit space.",
      },
      {
        heading: "5. Acceptance & Right to Withdraw",
        body: "By granting this consent, you acknowledge the nature and limitations of remote clinical consultations. You may withdraw this consent at any time; however, an active teleconsultation consent is required to participate in scheduled video appointments.",
      },
    ],
  },
  {
    id: "health_data_privacy",
    consent_type: "health_data_privacy",
    title: "Health Data Privacy Consent",
    category: "essential",
    required: true,
    version: "v2.1",
    effective_date: "2026-01-01",
    summary:
      "Consent for collection, storage, and clinical processing of personal health data strictly necessary for your diagnosis, consultations, and digital prescriptions.",
    sections: [
      {
        heading: "1. Health Information Collected",
        body: "We collect necessary identity details (full name, contact number, date of birth, gender), intake details, relevant medical history, past allergies, symptoms, consultation summaries, and issued digital prescriptions.",
      },
      {
        heading: "2. Purpose of Clinical Data Processing",
        body: "Your health information is used exclusively to facilitate accurate medical diagnosis, issue legitimate digital prescriptions, maintain treatment continuity across appointments, and fulfill clinical standards of practice.",
      },
      {
        heading: "3. Access Controls & Confidentiality",
        body: "Access to your medical records is strictly restricted to you and the licensed clinicians who directly evaluate or manage your care. We do not sell, rent, or disclose personal health data to advertising or marketing third parties.",
      },
      {
        heading: "4. Clinical Record Retention",
        body: "In compliance with health record retention regulations, medical consultation notes, doctor orders, and digital prescriptions must be retained for the statutory minimum clinical retention period to support patient safety and continuity of care.",
      },
      {
        heading: "5. Your Data Rights",
        body: "You have the right to access and review your medical records, download consultation summaries, request corrections to personal profile details, and inspect your consent audit trail at any time.",
      },
    ],
  },
  {
    id: "medical_record_sharing",
    consent_type: "medical_record_sharing",
    title: "Medical Record Sharing Consent",
    category: "optional",
    required: false,
    version: "v2.1",
    effective_date: "2026-01-01",
    summary:
      "Optional authorization allowing treating physicians and consulting specialists to access past diagnostic reports, laboratory panels, and visit records.",
    sections: [
      {
        heading: "1. Scope of Record Sharing",
        body: "When enabled, this authorization permits treating physicians and specialists within your care team to view diagnostic documents, laboratory test results, imaging reports, and previous visit records you have uploaded or authorized.",
      },
      {
        heading: "2. Independent from Essential Care",
        body: "This consent is completely optional. Choosing not to share historical diagnostic reports or previous records does not affect your ability to schedule appointments, consult with doctors, or receive valid medical prescriptions.",
      },
      {
        heading: "3. Care Team Coordination",
        body: "Enabling record sharing helps consulting specialists understand your past clinical background, avoid redundant lab tests, and provide more coordinated treatment recommendations.",
      },
      {
        heading: "4. Right of Immediate Revocation",
        body: "You may grant or withdraw this record sharing consent at any time through the patient portal. Withdrawing takes immediate effect for subsequent record access requests and does not penalize or alter your ongoing care.",
      },
    ],
  },
];

const formatConsentTitle = (consentType) => {
  if (!consentType) return "Consent Directive";
  const typeLower = String(consentType).toLowerCase();
  if (typeLower === "teleconsultation" || typeLower === "telehealth" || typeLower === "treatment") {
    return "Teleconsultation Consent";
  }
  if (typeLower === "health_data_privacy" || typeLower === "privacy_notice") {
    return "Health Data Privacy Consent";
  }
  if (typeLower === "medical_record_sharing" || typeLower === "optional_data_processing") {
    return "Medical Record Sharing Consent";
  }
  if (typeLower === "reminders") return "Appointment & Follow-up Reminders";
  if (typeLower === "communication_preferences") return "Communication Preferences & Updates";
  return consentType.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
};

const getFormattedTimestamp = (dtInput) => {
  const dt = dtInput ? new Date(dtInput) : new Date();
  const dateFormatted = dt.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeFormatted = dt.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${dateFormatted} at ${timeFormatted}`;
};

export default function ConsentScreen({ onNavigate }) {
  const [documents, setDocuments] = useState(DEFAULT_DOCUMENTS);
  const [consents, setConsents] = useState([]);
  const [activity, setActivity] = useState([]);
  const [lastSaved, setLastSaved] = useState(() => getFormattedTimestamp(new Date()));
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [withdrawalPendingTarget, setWithdrawalPendingTarget] = useState(null);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  // Phase 2 (F-06): Granular Purpose-Bound Consent Ledger (ABDM Alignment) State
  const [granularConsents, setGranularConsents] = useState([]);
  const [showNewConsentModal, setShowNewConsentModal] = useState(false);
  const [newPurposeCode, setNewPurposeCode] = useState("CARE");
  const [newGranteeName, setNewGranteeName] = useState("");
  const [newGranteeEntity, setNewGranteeEntity] = useState("");
  const [newDataScopes, setNewDataScopes] = useState([
    "OPD_CONSULT",
    "PRESCRIPTIONS",
  ]);
  const [newValidityDays, setNewValidityDays] = useState(30);
  const [isSubmittingGranular, setIsSubmittingGranular] = useState(false);

  const fetchConsents = async () => {
    try {
      const [docsRes, consentsRes, historyRes, granularRes] = await Promise.all([
        patientApi.consentDocuments().catch(() => DEFAULT_DOCUMENTS),
        patientApi.consents().catch(() => []),
        patientApi.consentHistory().catch(() => []),
        patientApi.getGranularConsents().catch(() => []),
      ]);

      if (Array.isArray(docsRes) && docsRes.length > 0) {
        setDocuments(docsRes);
      }

      const consentsList = Array.isArray(consentsRes) ? consentsRes : [];
      setConsents(consentsList);
      setGranularConsents(Array.isArray(granularRes) ? granularRes : []);

      if (consentsList.length > 0) {
        const latest = consentsList[0];
        setLastSaved(getFormattedTimestamp(latest.granted_at || latest.created_at));
      } else {
        setLastSaved(getFormattedTimestamp(new Date()));
      }

      if (Array.isArray(historyRes) && historyRes.length > 0) {
        const auditItems = historyRes.map((item, idx) => {
          const dt = new Date(item.occurred_at || Date.now());
          return {
            id: item.id || `hist-${idx}`,
            permission: item.title || formatConsentTitle(item.consent_type),
            change: item.action || "Updated",
            version: item.version || "v2.1",
            datetime: `${dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
            source: item.source || "Patient portal",
          };
        });
        setActivity(auditItems);
      } else if (consentsList.length > 0) {
        const fallbackItems = consentsList.map((c, idx) => {
          const dt = new Date(c.withdrawn_at || c.granted_at || Date.now());
          return {
            id: c.id || `act-${idx}`,
            permission: formatConsentTitle(c.consent_type),
            change: c.status === "withdrawn" ? "Withdrawn" : "Granted",
            version: c.version || "v2.1",
            datetime: `${dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`,
            source: "Patient portal",
          };
        });
        setActivity(fallbackItems);
      } else {
        setActivity([]);
      }
    } catch {
      // Handled gracefully
    }
  };

  useEffect(() => {
    fetchConsents();
  }, []);

  const getConsentStatus = (consentType) => {
    const canonical =
      consentType === "telehealth" || consentType === "treatment"
        ? "teleconsultation"
        : consentType;
    const found = consents.find((c) => {
      const cType =
        c.consent_type === "telehealth" || c.consent_type === "treatment"
          ? "teleconsultation"
          : c.consent_type;
      return cType === canonical;
    });

    if (found) {
      const isGranted = found.status === "granted" || found.status === "active";
      const dt = found.granted_at ? new Date(found.granted_at) : new Date();
      const dateStr = dt.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      return {
        isGranted,
        dbId: found.id,
        version: found.version || "v2.1",
        statusText: isGranted ? `Granted · ${dateStr}` : `Withdrawn · ${dateStr}`,
        timestamp: found.granted_at,
        withdrawnAt: found.withdrawn_at,
      };
    }

    return {
      isGranted: false,
      dbId: null,
      version: "v2.1",
      statusText: "Not granted",
      timestamp: null,
      withdrawnAt: null,
    };
  };

  const executeToggle = async (doc, nextGranted) => {
    setIsUpdating(true);
    try {
      if (nextGranted) {
        await patientApi.grantConsent({
          consent_type: doc.consent_type,
          version: doc.version || "v2.1",
        });
        setToastMessage(`Consent for "${doc.title}" accepted.`);
      } else {
        const status = getConsentStatus(doc.consent_type);
        await patientApi.withdrawConsent(status.dbId || doc.consent_type);
        setToastMessage(`Consent for "${doc.title}" withdrawn.`);
      }
      setLastSaved(getFormattedTimestamp(new Date()));
      await fetchConsents();
    } catch (err) {
      setToastMessage(err?.message || "Failed to update consent preference.");
    } finally {
      setIsUpdating(false);
      setWithdrawalPendingTarget(null);
      setTimeout(() => setToastMessage(""), 4000);
    }
  };

  const handleToggleClick = (doc) => {
    const current = getConsentStatus(doc.consent_type);
    if (current.isGranted) {
      if (doc.required) {
        // Show clinical confirmation modal for essential care consent
        setWithdrawalPendingTarget(doc);
        return;
      }
      executeToggle(doc, false);
    } else {
      executeToggle(doc, true);
    }
  };

  const handleDownloadRecord = () => {
    const text = [
      "KAIZEN CARE - PATIENT CONSENT & PRIVACY DIRECTIVES AUDIT RECORD",
      `Generated: ${new Date().toLocaleString()}`,
      `Last Verified: ${lastSaved}`,
      "----------------------------------------------------------------------",
      "CONSENT DIRECTIVES SUMMARY:",
      ...documents.map((doc) => {
        const s = getConsentStatus(doc.consent_type);
        return [
          `• ${doc.title} (${doc.category === "essential" ? "Essential Clinical Care" : "Optional Authorization"})`,
          `  Status: ${s.isGranted ? "Granted" : "Withdrawn"} (${s.statusText})`,
          `  Version: ${doc.version || "v2.1"} · Effective Date: ${doc.effective_date || "2026-01-01"}`,
          s.timestamp ? `  Granted Timestamp: ${new Date(s.timestamp).toISOString()}` : "",
          s.withdrawnAt ? `  Withdrawn Timestamp: ${new Date(s.withdrawnAt).toISOString()}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      }),
      "----------------------------------------------------------------------",
      "CONSENT ACTIVITY LOG:",
      activity.length === 0
        ? "No historical activity recorded."
        : activity
            .map((a) => `[${a.datetime}] ${a.permission} - ${a.change} (${a.version}) via ${a.source}`)
            .join("\n"),
      "----------------------------------------------------------------------",
      "All patient consent modifications are stored in the MongoDB audit ledger.",
    ].join("\n");

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `KaizenCare_Consent_Record_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setToastMessage("Consent audit record downloaded successfully.");
    setTimeout(() => setToastMessage(""), 3500);
  };

  const handleCreateGranularConsent = async (e) => {
    e.preventDefault();
    if (newDataScopes.length === 0) {
      setToastMessage("Please select at least one data scope.");
      return;
    }
    setIsSubmittingGranular(true);
    try {
      const descriptions = {
        CARE: "Direct Clinical Teleconsultation Care",
        EMERGENCY: "Emergency Paramedic & Trauma Care Access",
        CLAIM: "Insurance Claim Processing & Adjudication",
        LAB: "Diagnostic Laboratory Testing & Panels",
        RESEARCH: "Anonymized Clinical Study & Health Research",
      };
      await patientApi.createGranularConsent({
        purpose_code: newPurposeCode,
        purpose_description: descriptions[newPurposeCode] || "Clinical Data Processing",
        grantee_name: newGranteeName.trim() || "Treating Physician / Clinic Staff",
        grantee_entity: newGranteeEntity.trim() || "Kaizen Teleconsultation Network",
        data_scopes: newDataScopes,
        validity_days: parseInt(newValidityDays, 10) || 30,
      });
      setToastMessage("Purpose-bound consent directive authorized and recorded.");
      setShowNewConsentModal(false);
      setNewGranteeName("");
      setNewGranteeEntity("");
      await fetchConsents();
    } catch (err) {
      setToastMessage(err.message || "Failed to create granular consent.");
    } finally {
      setIsSubmittingGranular(false);
      setTimeout(() => setToastMessage(""), 4000);
    }
  };

  const handleRevokeGranular = async (consentId) => {
    try {
      await patientApi.revokeGranularConsent(consentId, {
        revocation_reason: "Patient digital discretion via consent portal",
      });
      setToastMessage("Consent directive revoked successfully.");
      await fetchConsents();
    } catch (err) {
      setToastMessage(err.message || "Failed to revoke consent directive.");
    } finally {
      setTimeout(() => setToastMessage(""), 4000);
    }
  };

  const toggleDataScope = (scope) => {
    setNewDataScopes((prev) =>
      prev.includes(scope)
        ? prev.filter((s) => s !== scope)
        : [...prev, scope],
    );
  };

  const essentialDocs = documents.filter((d) => d.category === "essential");
  const optionalDocs = documents.filter((d) => d.category !== "essential");

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Toast Notification */}
        {toastMessage && (
          <div className="p-3.5 rounded-xl bg-white border border-[#25836F]/30 shadow-sm flex items-center justify-between text-xs text-[#25836F] font-semibold animate-in fade-in duration-200">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-base">check_circle</span>
              {toastMessage}
            </span>
            <button
              type="button"
              onClick={() => setToastMessage("")}
              className="text-[#577877] hover:text-[#162623] cursor-pointer"
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
              Understand and manage how your health information is used and shared.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDownloadRecord}
            className="btn-secondary !px-5 !py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 shadow-2xs shrink-0 cursor-pointer hover:bg-white"
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
              Last saved {lastSaved}. You can change optional choices or review full consent documents at any time.
            </p>
          </div>
        </div>

        {/* Main 2-Column Split View */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Essential Care & Optional Permissions */}
          <div className="lg:col-span-8 space-y-6">
            {/* Section 1: Essential Clinical Care Consents */}
            <div className="care-card p-7 sm:p-8 space-y-6 bg-white rounded-2xl border border-[#577877]/15">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-[#162623]">
                    Care &amp; communication permissions
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#E7F3F1] text-[#25836F] tracking-wide uppercase">
                    Essential Care
                  </span>
                </div>
                <p className="text-xs text-[#577877] mt-1 leading-relaxed">
                  Required authorizations for conducting video appointments, clinical diagnoses, and delivering electronic prescriptions.
                </p>
              </div>

              <div className="space-y-6 divide-y divide-[#577877]/15">
                {essentialDocs.map((doc, idx) => {
                  const status = getConsentStatus(doc.consent_type);
                  return (
                    <div
                      key={doc.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        idx > 0 ? "pt-6" : ""
                      }`}
                    >
                      <div className="space-y-1.5 max-w-xl">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-[#162623]">
                            {doc.title}
                          </h3>
                          <span className="text-[10px] font-medium text-[#577877] bg-[#F0F5F7] px-2 py-0.5 rounded-md">
                            Version {doc.version || "v2.1"}
                          </span>
                        </div>
                        <p className="text-xs text-[#577877] leading-relaxed">
                          {doc.summary}
                        </p>
                        <div className="flex items-center gap-3 pt-1 flex-wrap">
                          <span
                            className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                              status.isGranted
                                ? "bg-[#E7F3F1] text-[#25836F]"
                                : "bg-[#F0F5F7] text-[#577877]"
                            }`}
                          >
                            {status.statusText}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedDoc(doc)}
                            className="text-xs font-semibold text-[#25836F] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>Read full document</span>
                            <span className="material-symbols-outlined text-xs">open_in_new</span>
                          </button>
                        </div>
                      </div>

                      {/* Accessible Switch */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={status.isGranted}
                        disabled={isUpdating}
                        onClick={() => handleToggleClick(doc)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#25836F]/20 ${
                          status.isGranted ? "bg-[#25836F]" : "bg-[#C5D5D7]"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            status.isGranted ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Section 2: Optional Medical Record Sharing & Preferences */}
            <div className="care-card p-7 sm:p-8 space-y-6 bg-white rounded-2xl border border-[#577877]/15">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-[#162623]">
                    Optional record-sharing &amp; care coordination
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#F0F5F7] text-[#577877] tracking-wide uppercase">
                    Optional
                  </span>
                </div>
                <p className="text-xs text-[#577877] mt-1 leading-relaxed">
                  Decide whether to share past diagnostic documents with your care team. Optional choices never affect your access to essential medical consultations.
                </p>
              </div>

              <div className="space-y-6 divide-y divide-[#577877]/15">
                {optionalDocs.map((doc, idx) => {
                  const status = getConsentStatus(doc.consent_type);
                  return (
                    <div
                      key={doc.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        idx > 0 ? "pt-6" : ""
                      }`}
                    >
                      <div className="space-y-1.5 max-w-xl">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-[#162623]">
                            {doc.title}
                          </h3>
                          <span className="text-[10px] font-medium text-[#577877] bg-[#F0F5F7] px-2 py-0.5 rounded-md">
                            Version {doc.version || "v2.1"}
                          </span>
                        </div>
                        <p className="text-xs text-[#577877] leading-relaxed">
                          {doc.summary}
                        </p>
                        <div className="flex items-center gap-3 pt-1 flex-wrap">
                          <span
                            className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                              status.isGranted
                                ? "bg-[#E7F3F1] text-[#25836F]"
                                : "bg-[#F0F5F7] text-[#577877]"
                            }`}
                          >
                            {status.statusText}
                          </span>
                          <button
                            type="button"
                            onClick={() => setSelectedDoc(doc)}
                            className="text-xs font-semibold text-[#25836F] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <span>Read full document</span>
                            <span className="material-symbols-outlined text-xs">open_in_new</span>
                          </button>
                        </div>
                      </div>

                      {/* Accessible Switch */}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={status.isGranted}
                        disabled={isUpdating}
                        onClick={() => handleToggleClick(doc)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#25836F]/20 ${
                          status.isGranted ? "bg-[#25836F]" : "bg-[#C5D5D7]"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                            status.isGranted ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  );
                })}
              </div>
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
                Withdrawing optional record sharing does not affect access to your
                ongoing clinical care or doctor consultations.
              </p>

              <p className="text-xs text-[#577877] leading-relaxed">
                Essential clinical consultation notes and issued prescriptions are retained in accordance with healthcare record retention guidelines.
              </p>

              <div className="pt-2 space-y-3">
                <button
                  type="button"
                  onClick={() => setShowPrivacyModal(true)}
                  className="btn-secondary w-full text-xs font-semibold py-2.5 rounded-xl cursor-pointer"
                >
                  Read privacy notice
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
                videocam
              </span>
              <div className="text-xs space-y-1">
                <p className="font-bold text-[#162623]">
                  Before your next video visit
                </p>
                <p className="text-[#577877] leading-relaxed">
                  Active teleconsultation consent is required for remote consultations. You can review the full clinical consent terms at any time.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Phase 2 (F-06): Granular Purpose-Bound Consent Ledger (ABDM / Telemedicine Guidelines Alignment) */}
        <div className="care-card p-7 sm:p-8 space-y-6 bg-white rounded-2xl border border-[#577877]/15">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-[#162623]">
                  Granular Purpose-Bound Consent Ledger
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#E7F3F1] text-[#25836F] tracking-wide uppercase">
                  ABDM &amp; MoHFW Aligned
                </span>
              </div>
              <p className="text-xs text-[#577877] mt-1 leading-relaxed">
                Purpose-specific digital consent artifacts controlling health data sharing by purpose, authorized recipient, and strict time limits.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowNewConsentModal(true)}
              className="btn-primary !px-4 !py-2.5 text-xs font-semibold flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">add_moderator</span>
              <span>+ Authorize Purpose</span>
            </button>
          </div>

          {granularConsents.length === 0 ? (
            <div className="p-8 text-center text-[#577877] text-xs font-medium bg-[#F8FAFB] rounded-xl border border-dashed border-[#577877]/20 space-y-2">
              <span className="material-symbols-outlined text-3xl text-[#25836F]">verified_user</span>
              <p className="font-bold text-[#162623]">No active purpose-bound directives.</p>
              <p className="max-w-md mx-auto">
                Authorize specific clinicians, TPA insurers, or labs to access designated health data categories under explicit validity windows.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {granularConsents.map((item) => {
                const isActive = item.status === "active";
                const dtStart = item.valid_from ? new Date(item.valid_from) : new Date();
                const dtEnd = item.valid_to ? new Date(item.valid_to) : new Date();

                let purposeBadgeClass = "bg-teal-50 text-teal-800 border-teal-200";
                if (item.purpose_code === "EMERGENCY") purposeBadgeClass = "bg-rose-50 text-rose-800 border-rose-200";
                else if (item.purpose_code === "CLAIM") purposeBadgeClass = "bg-purple-50 text-purple-800 border-purple-200";
                else if (item.purpose_code === "LAB") purposeBadgeClass = "bg-amber-50 text-amber-800 border-amber-200";
                else if (item.purpose_code === "RESEARCH") purposeBadgeClass = "bg-sky-50 text-sky-800 border-sky-200";

                return (
                  <div
                    key={item.id}
                    className={`p-5 rounded-2xl border transition space-y-3.5 ${
                      isActive
                        ? "bg-white border-[#577877]/20 shadow-2xs"
                        : "bg-slate-50/70 border-slate-200 opacity-80"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold border ${purposeBadgeClass}`}>
                            {item.purpose_code} · {item.purpose_description}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isActive
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {isActive ? "Active" : "Revoked"}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-[#162623] pt-0.5">
                          {item.grantee_name}
                        </h4>
                        <p className="text-[11px] text-[#577877]">
                          Institution: {item.grantee_entity}
                        </p>
                      </div>

                      {isActive && (
                        <button
                          type="button"
                          onClick={() => handleRevokeGranular(item.id)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-rose-700 hover:bg-rose-50 border border-rose-200 transition cursor-pointer"
                        >
                          Revoke
                        </button>
                      )}
                    </div>

                    {/* Authorized Scopes */}
                    <div className="space-y-1">
                      <span className="text-[11px] text-[#577877] font-semibold">Authorized Data Scopes:</span>
                      <div className="flex flex-wrap gap-1.5">
                        {item.data_scopes.map((scope, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-md bg-[#F0F5F7] text-[10px] font-mono text-[#162623] border border-[#577877]/10"
                          >
                            {scope}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* ABDM Artifact Hash & Validity */}
                    <div className="pt-2 border-t border-[#577877]/10 flex flex-col sm:flex-row sm:items-center sm:justify-between text-[11px] text-[#577877] gap-1">
                      <span className="font-mono text-[10px] text-[#25836F]">
                        ID: {item.abdm_artifact_id ? `${item.abdm_artifact_id.slice(0, 16)}…` : "Generated"}
                      </span>
                      <span>
                        Valid: {dtStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {dtEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </span>
                    </div>

                    {!isActive && item.revocation_reason && (
                      <p className="text-[11px] text-rose-700 italic">
                        Reason: {item.revocation_reason}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Card: Dynamic Consent Activity History Table */}
        <div className="care-card p-7 sm:p-8 space-y-5 bg-white rounded-2xl border border-[#577877]/15">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-bold text-[#162623]">Consent activity history</h2>
              <p className="text-xs text-[#577877] mt-0.5">
                Dynamically retrieved audit trail of your consent decisions from the secure database.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-[#577877] bg-[#F0F5F7] px-3 py-1 rounded-full">
              {activity.length} recorded events
            </span>
          </div>

          {activity.length === 0 ? (
            <p className="text-xs text-[#577877] py-2">
              No recent consent activity recorded in your patient profile.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-[#577877]/15 text-[#577877] font-medium">
                    <th className="pb-3 font-semibold">Consent Document</th>
                    <th className="pb-3 font-semibold">Action</th>
                    <th className="pb-3 font-semibold">Document Version</th>
                    <th className="pb-3 font-semibold">Date &amp; Time</th>
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
                      <td className="py-3.5">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            item.change === "Granted"
                              ? "bg-[#E7F3F1] text-[#25836F]"
                              : "bg-red-50 text-red-700 border border-red-200/50"
                          }`}
                        >
                          {item.change}
                        </span>
                      </td>
                      <td className="py-3.5 text-[#577877] font-mono text-[11px]">
                        {item.version}
                      </td>
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

      {/* Full Consent Document Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-2xl rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-8 shadow-2xl space-y-5 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between pb-3 border-b border-[#577877]/15">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-[#162623]">
                    {selectedDoc.title}
                  </h3>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#E7F3F1] text-[#25836F]">
                    {selectedDoc.version || "v2.1"}
                  </span>
                </div>
                <p className="text-xs text-[#577877]">
                  Effective: {selectedDoc.effective_date || "January 1, 2026"} · Category:{" "}
                  {selectedDoc.category === "essential" ? "Essential Clinical Care" : "Optional Authorization"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDoc(null)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Document Content Scroll */}
            <div className="overflow-y-auto space-y-4 pr-1 text-xs text-[#162623] leading-relaxed flex-1">
              <div className="p-3.5 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 text-[#577877]">
                <strong className="text-[#162623]">Summary:</strong> {selectedDoc.summary}
              </div>

              {selectedDoc.sections?.map((sec, idx) => (
                <div key={idx} className="space-y-1">
                  <h4 className="text-xs font-bold text-[#162623]">
                    {sec.heading}
                  </h4>
                  <p className="text-[#577877] leading-relaxed">
                    {sec.body}
                  </p>
                </div>
              ))}
            </div>

            {/* Current Status & Action Bar */}
            <div className="pt-3 border-t border-[#577877]/15 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs">
                {(() => {
                  const s = getConsentStatus(selectedDoc.consent_type);
                  return (
                    <span className="flex items-center gap-1.5 font-medium">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          s.isGranted ? "bg-emerald-600" : "bg-amber-600"
                        }`}
                      />
                      <span>Current Status: {s.statusText}</span>
                    </span>
                  );
                })()}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedDoc(null)}
                  className="btn-secondary text-xs !py-2 !px-4 cursor-pointer"
                >
                  Close
                </button>
                {(() => {
                  const s = getConsentStatus(selectedDoc.consent_type);
                  return s.isGranted ? (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => {
                        const target = selectedDoc;
                        setSelectedDoc(null);
                        handleToggleClick(target);
                      }}
                      className="px-4 py-2 rounded-xl text-xs font-semibold text-red-700 hover:bg-red-50 border border-red-200 transition cursor-pointer"
                    >
                      Withdraw Consent
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isUpdating}
                      onClick={() => {
                        const target = selectedDoc;
                        setSelectedDoc(null);
                        handleToggleClick(target);
                      }}
                      className="btn-primary text-xs !py-2 !px-4 cursor-pointer"
                    >
                      Accept &amp; Grant Consent
                    </button>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Essential Care Withdrawal Confirmation Modal */}
      {withdrawalPendingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600 pb-2 border-b border-[#577877]/15">
              <span className="material-symbols-outlined text-2xl">warning</span>
              <h3 className="text-base font-bold text-[#162623]">
                Withdraw Essential Clinical Consent?
              </h3>
            </div>

            <p className="text-xs text-[#577877] leading-relaxed">
              <strong>{withdrawalPendingTarget.title}</strong> is essential for clinical operations.
              {withdrawalPendingTarget.consent_type === "teleconsultation"
                ? " Active teleconsultation consent is required to participate in upcoming video doctor consultations. Withdrawing will prevent upcoming teleconsultations until re-enabled."
                : " Health data privacy consent is required for physicians to process diagnostic notes and issue authentic electronic prescriptions."}
            </p>

            <p className="text-xs text-[#577877] leading-relaxed">
              You may grant this consent again at any time through this portal.
            </p>

            <div className="pt-2 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setWithdrawalPendingTarget(null)}
                className="btn-secondary text-xs !py-2 !px-4 cursor-pointer"
              >
                Keep Consent Active
              </button>
              <button
                type="button"
                disabled={isUpdating}
                onClick={() => executeToggle(withdrawalPendingTarget, false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 transition cursor-pointer"
              >
                Confirm Withdrawal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Honest, Clear Privacy Notice Modal (Without Unverified Claims) */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs animate-in fade-in duration-150">
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
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#577877] leading-relaxed max-h-72 overflow-y-auto pr-1">
              <p>
                <strong>1. Data Protection &amp; Confidentiality:</strong> Your health
                information is protected using strict authentication, encrypted web transport
                (HTTPS), and access controls. Medical notes and visit summaries are accessible
                strictly to you and licensed healthcare professionals participating in your care.
              </p>
              <p>
                <strong>2. Teleconsultations &amp; Video Streams:</strong> Video appointments
                take place in private, real-time sessions. Consultation audio and video streams
                are never recorded without explicit, advance notice and mutual consent.
              </p>
              <p>
                <strong>3. Essential Care vs. Optional Sharing:</strong> Optional authorizations,
                such as sharing past diagnostic lab panels with consulting specialists, can be
                freely granted or withdrawn at any time without restricting your access to essential
                doctor consultations.
              </p>
              <p>
                <strong>4. Clinical Record Retention:</strong> In accordance with medical record
                guidelines, consultation summaries and issued electronic prescriptions are
                retained for the clinical duration required for your ongoing patient safety.
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

      {/* Phase 2 (F-06): Authorize New Purpose Modal (ABDM Alignment) */}
      {showNewConsentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-8 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined !text-[#25836F] text-2xl">
                  add_moderator
                </span>
                <div>
                  <h3 className="text-base font-bold text-[#162623]">
                    Authorize Purpose-Bound Consent
                  </h3>
                  <p className="text-[11px] text-[#577877]">
                    ABDM Consent Artifact Specification v2.0
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNewConsentModal(false)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateGranularConsent} className="space-y-4 text-xs">
              {/* Purpose Code Selection */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#162623]">
                  Authorized Purpose Category *
                </label>
                <select
                  value={newPurposeCode}
                  onChange={(e) => setNewPurposeCode(e.target.value)}
                  className="w-full rounded-xl border border-[#577877]/30 bg-white px-3 py-2 text-xs text-[#162623] focus:border-[#25836F] focus:outline-none"
                >
                  <option value="CARE">Direct Clinical Care &amp; Teleconsultation (CARE)</option>
                  <option value="EMERGENCY">Emergency Trauma &amp; Paramedic Access (EMERGENCY)</option>
                  <option value="CLAIM">TPA &amp; Insurance Claim Adjudication (CLAIM)</option>
                  <option value="LAB">Diagnostic Laboratory Testing &amp; Panels (LAB)</option>
                  <option value="RESEARCH">Anonymized Clinical Research (RESEARCH)</option>
                </select>
              </div>

              {/* Grantee Name */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#162623]">
                  Authorized Clinician / Recipient Name
                </label>
                <input
                  type="text"
                  value={newGranteeName}
                  onChange={(e) => setNewGranteeName(e.target.value)}
                  placeholder="e.g. Dr. Priya Sharma, or On-Duty Paramedic"
                  className="w-full rounded-xl border border-[#577877]/30 bg-white px-3.5 py-2 text-xs text-[#162623] focus:border-[#25836F] focus:outline-none"
                />
              </div>

              {/* Grantee Entity */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#162623]">
                  Authorized Entity / Institution
                </label>
                <input
                  type="text"
                  value={newGranteeEntity}
                  onChange={(e) => setNewGranteeEntity(e.target.value)}
                  placeholder="e.g. Apollo Tele-Clinic, Star Health TPA, SRL Diagnostics"
                  className="w-full rounded-xl border border-[#577877]/30 bg-white px-3.5 py-2 text-xs text-[#162623] focus:border-[#25836F] focus:outline-none"
                />
              </div>

              {/* Data Scopes */}
              <div className="space-y-2">
                <label className="font-bold text-[#162623] block">
                  Permitted Health Data Scopes *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "OPD_CONSULT", label: "Consultation Notes" },
                    { id: "PRESCRIPTIONS", label: "e-Prescriptions" },
                    { id: "DIAGNOSTIC_REPORTS", label: "Lab / Diagnostic Reports" },
                    { id: "VITALS_HISTORY", label: "Longitudinal Vitals" },
                  ].map((scope) => (
                    <label
                      key={scope.id}
                      className="flex items-center gap-2 p-2.5 rounded-xl border border-[#577877]/15 bg-[#FAFDFD] cursor-pointer hover:bg-[#F0F5F7] transition"
                    >
                      <input
                        type="checkbox"
                        checked={newDataScopes.includes(scope.id)}
                        onChange={() => toggleDataScope(scope.id)}
                        className="rounded text-[#25836F] focus:ring-[#25836F]"
                      />
                      <span className="text-[11px] font-medium text-[#162623]">
                        {scope.label}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Validity Window */}
              <div className="space-y-1.5">
                <label className="font-bold text-[#162623]">
                  Consent Validity Period
                </label>
                <select
                  value={newValidityDays}
                  onChange={(e) => setNewValidityDays(Number(e.target.value))}
                  className="w-full rounded-xl border border-[#577877]/30 bg-white px-3 py-2 text-xs text-[#162623] focus:border-[#25836F] focus:outline-none"
                >
                  <option value={7}>7 Days (Single Treatment Episode)</option>
                  <option value={30}>30 Days (Standard Episode Window)</option>
                  <option value={90}>90 Days (Quarterly Management)</option>
                  <option value={180}>180 Days (Semi-Annual Care Plan)</option>
                  <option value={365}>365 Days (Annual Chronic Care)</option>
                </select>
              </div>

              {/* ABDM Statutory Notice */}
              <div className="p-3 bg-[#E8F3F3] border border-[#25836F]/20 rounded-xl text-[11px] text-[#577877] space-y-1 leading-relaxed">
                <strong className="text-[#162623]">Digital Governance:</strong> A cryptographic ABDM artifact hash will be generated. You can revoke this authorization at any time with immediate effect.
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowNewConsentModal(false)}
                  className="btn-secondary text-xs !py-2 !px-4 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingGranular || newDataScopes.length === 0}
                  className="btn-primary text-xs !py-2 !px-5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingGranular ? "Authorizing…" : "Authorize & Sign Directive"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
