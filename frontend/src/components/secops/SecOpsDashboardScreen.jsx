import React, { useState, useEffect } from "react";
import { secopsDashboardApi } from "../../lib/api";
import { ToastProvider, useToast } from "../common/Toast";

function safeFormatDate(value, mode = "datetime", fallback = "Date unavailable") {
  if (!value) return fallback;
  try {
    const dt = new Date(value);
    if (isNaN(dt.getTime())) return fallback;
    if (mode === "time") return dt.toLocaleTimeString();
    if (mode === "date") return dt.toLocaleDateString();
    return dt.toLocaleString();
  } catch (err) {
    return fallback;
  }
}

function SecOpsDashboardContent({ user, onLogout }) {
  const { showToast } = useToast();
  const addToast = showToast;
  const [activeTab, setActiveTab] = useState("health");

  // Screen 1: Health State
  const [healthData, setHealthData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Screen 2: Security State
  const [securityEvents, setSecurityEvents] = useState([]);
  const [threatMetrics, setThreatMetrics] = useState(null);
  const [securityLoading, setSecurityLoading] = useState(false);
  const [securitySearch, setSecuritySearch] = useState("");
  const [securitySeverityFilter, setSecuritySeverityFilter] = useState("");
  const [securityStatusFilter, setSecurityStatusFilter] = useState("");
  const [securityEventTypeFilter, setSecurityEventTypeFilter] = useState("");
  const [selectedSecurityEvent, setSelectedSecurityEvent] = useState(null);
  const [analystNoteText, setAnalystNoteText] = useState("");

  // Screen 3: Audit State
  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditActor, setAuditActor] = useState("");
  const [auditAction, setAuditAction] = useState("");
  const [auditStartDate, setAuditStartDate] = useState("");
  const [auditEndDate, setAuditEndDate] = useState("");
  const [auditResource, setAuditResource] = useState("");
  const [auditResultFilter, setAuditResultFilter] = useState("");
  const [auditCorrelationId, setAuditCorrelationId] = useState("");

  // Screen 4: Incidents State
  const [incidents, setIncidents] = useState([]);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState(null);
  const [showCreateIncidentModal, setShowCreateIncidentModal] = useState(false);
  const [newIncidentForm, setNewIncidentForm] = useState({
    title: "",
    description: "",
    severity: "HIGH",
    category: "infrastructure",
    destination_team: "Engineering",
    linked_support_ticket_id: "",
  });

  // Screen 5: Providers State
  const [providersData, setProvidersData] = useState(null);
  const [providersLoading, setProvidersLoading] = useState(false);

  // Screen 6: Backups State
  const [backupsData, setBackupsData] = useState(null);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [showRecoveryModal, setShowRecoveryModal] = useState(false);
  const [newRecoveryForm, setNewRecoveryForm] = useState({
    target_service: "MongoDB Atlas Cluster",
    recovery_point: "",
    target_environment: "Staging",
    reason: "",
    expected_impact: "",
  });

  // Screen 7: Alerts & Rules State
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertRules, setAlertRules] = useState(null);
  const [showAlertRulesModal, setShowAlertRulesModal] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState(null);

  // Data Loaders
  const loadHealth = async () => {
    setHealthLoading(true);
    try {
      const data = await secopsDashboardApi.healthOverview();
      setHealthData(data);
    } catch (err) {
      addToast(err.message || "Failed to load health metrics", "error");
    } finally {
      setHealthLoading(false);
    }
  };

  const loadSecurity = async () => {
    setSecurityLoading(true);
    try {
      const data = await secopsDashboardApi.securityEvents(
        securitySeverityFilter,
        securitySearch,
        securityEventTypeFilter,
        securityStatusFilter
      );
      setSecurityEvents(data.events || []);
      setThreatMetrics(data.threat_metrics);
    } catch (err) {
      addToast(err.message || "Failed to load security threat logs", "error");
    } finally {
      setSecurityLoading(false);
    }
  };

  const handleUpdateSecurityEvent = async (id, updates) => {
    try {
      await secopsDashboardApi.updateSecurityEvent(id, updates);
      addToast(`Security event updated (${updates.status || "Updated"})`, "success");
      loadSecurity();
      setSelectedSecurityEvent(null);
    } catch (err) {
      addToast(err.message || "Failed to update security event", "error");
    }
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const data = await secopsDashboardApi.auditLogs(
        auditStartDate,
        auditEndDate,
        auditActor,
        auditAction,
        auditResource,
        auditResultFilter,
        auditCorrelationId
      );
      setAuditLogs(data.items || []);
    } catch (err) {
      addToast(err.message || "Failed to load audit logs", "error");
    } finally {
      setAuditLoading(false);
    }
  };

  const loadIncidents = async () => {
    setIncidentsLoading(true);
    try {
      const data = await secopsDashboardApi.incidents();
      setIncidents(data.items || []);
    } catch (err) {
      addToast(err.message || "Failed to load incidents", "error");
    } finally {
      setIncidentsLoading(false);
    }
  };

  const loadProviders = async () => {
    setProvidersLoading(true);
    try {
      const data = await secopsDashboardApi.providers();
      setProvidersData(data);
    } catch (err) {
      addToast(err.message || "Failed to load provider status", "error");
    } finally {
      setProvidersLoading(false);
    }
  };

  const loadBackups = async () => {
    setBackupsLoading(true);
    try {
      const data = await secopsDashboardApi.backups();
      setBackupsData(data);
    } catch (err) {
      addToast(err.message || "Failed to load backup readiness", "error");
    } finally {
      setBackupsLoading(false);
    }
  };

  const loadAlerts = async () => {
    setAlertsLoading(true);
    try {
      const [altData, rulesData] = await Promise.all([
        secopsDashboardApi.alerts(),
        secopsDashboardApi.alertRules(),
      ]);
      setAlerts(altData.items || []);
      setAlertRules(rulesData);
    } catch (err) {
      addToast(err.message || "Failed to load operational alerts", "error");
    } finally {
      setAlertsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "health") loadHealth();
    else if (activeTab === "security") loadSecurity();
    else if (activeTab === "audit") loadAudit();
    else if (activeTab === "incidents") loadIncidents();
    else if (activeTab === "providers") loadProviders();
    else if (activeTab === "backups") loadBackups();
    else if (activeTab === "alerts") loadAlerts();
  }, [activeTab]);

  // Actions Handlers
  const handleTriggerHealthCheck = async () => {
    try {
      const res = await secopsDashboardApi.triggerHealthCheck();
      setHealthData(res.health);
      addToast("System health observation probe completed", "success");
    } catch (err) {
      addToast(err.message || "Health check failed", "error");
    }
  };

  const handleSecurityAction = async (user_id, action, reason) => {
    try {
      await secopsDashboardApi.executeSecurityAction({ user_id, action, reason });
      addToast(`Security mitigation '${action}' executed`, "success");
      loadSecurity();
    } catch (err) {
      addToast(err.message || "Failed to execute security action", "error");
    }
  };

  const handleCreateIncident = async (e) => {
    e.preventDefault();
    try {
      await secopsDashboardApi.createIncident(newIncidentForm);
      addToast("Incident record created", "success");
      setShowCreateIncidentModal(false);
      setNewIncidentForm({ title: "", description: "", severity: "HIGH", category: "infrastructure", destination_team: "Engineering", linked_support_ticket_id: "" });
      loadIncidents();
    } catch (err) {
      addToast(err.message || "Failed to create incident", "error");
    }
  };

  const handleUpdateIncident = async (id, updates) => {
    try {
      const updated = await secopsDashboardApi.updateIncident(id, updates);
      setSelectedIncident(updated);
      addToast("Incident record updated", "success");
      loadIncidents();
    } catch (err) {
      addToast(err.message || "Failed to update incident", "error");
    }
  };

  const handleTriggerBackup = async () => {
    try {
      await secopsDashboardApi.triggerBackup();
      addToast("Manual database snapshot backup triggered successfully", "success");
      loadBackups();
    } catch (err) {
      addToast(err.message || "Failed to trigger backup", "error");
    }
  };

  const handleCreateRecoveryRequest = async (e) => {
    e.preventDefault();
    try {
      await secopsDashboardApi.createRecoveryRequest(newRecoveryForm);
      addToast("Controlled recovery request submitted for independent approval", "success");
      setShowRecoveryModal(false);
      setNewRecoveryForm({ target_service: "MongoDB Atlas Cluster", recovery_point: "", target_environment: "Staging", reason: "", expected_impact: "" });
      loadBackups();
    } catch (err) {
      addToast(err.message || "Failed to create recovery request", "error");
    }
  };

  const handleUpdateRecoveryRequest = async (id, updates) => {
    try {
      await secopsDashboardApi.updateRecoveryRequest(id, updates);
      addToast("Recovery request status updated", "success");
      loadBackups();
    } catch (err) {
      addToast(err.message || "Failed to update recovery request", "error");
    }
  };

  const handleAcknowledgeAlert = async (id) => {
    try {
      await secopsDashboardApi.acknowledgeAlert(id);
      addToast("Operational alert acknowledged", "success");
      loadAlerts();
    } catch (err) {
      addToast(err.message || "Failed to acknowledge alert", "error");
    }
  };

  const handleUpdateAlertAction = async (alertId, updates) => {
    try {
      await secopsDashboardApi.updateAlertAction(alertId, updates);
      addToast(`Alert updated (${updates.status || "Updated"})`, "success");
      loadAlerts();
      setSelectedAlert(null);
    } catch (err) {
      addToast(err.message || "Failed to update alert action", "error");
    }
  };

  const tabs = [
    { id: "health", label: "System Health", icon: "monitor_heart" },
    { id: "security", label: "Security Monitoring", icon: "shield_lock" },
    { id: "audit", label: "Access & Audit Logs", icon: "policy" },
    { id: "incidents", label: "Incident Management", icon: "warning" },
    { id: "providers", label: "Provider Outages", icon: "cloud_sync" },
    { id: "backups", label: "Backup & Recovery", icon: "settings_backup_restore" },
    { id: "alerts", label: "Operational Alerts", icon: "notifications_active" },
  ];

  return (
    <div className="min-h-screen bg-[#F0F5F7] text-[#162623] font-sans flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[#123D35] text-white border-b border-[#176354]/40 shadow-md">
        <div className="max-w-[1440px] mx-auto px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-[#20C7A7] text-[#123D35] flex items-center justify-center font-bold shadow-xs">
              <span className="material-symbols-outlined text-xl">shield_person</span>
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none tracking-tight flex items-center gap-2 text-white">
                Kaizen Care
                <span className="bg-[#20C7A7]/20 text-[#20C7A7] text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                  Security &amp; Operations
                </span>
              </h1>
              <p className="text-xs text-[#20C7A7]/80 mt-0.5">Centralized Platform Reliability &amp; Threat Defense</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#176354] border border-[#20C7A7]/30 text-white">
              <span className="material-symbols-outlined text-base text-[#20C7A7]">admin_panel_settings</span>
              <div>
                <p className="font-bold text-white">{user?.full_name || user?.user_id || "Security Analyst"}</p>
                <p className="text-[10px] text-[#20C7A7] uppercase tracking-wider">{user?.role || "secops"}</p>
              </div>
            </div>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="px-3 py-1.5 bg-[#176354] hover:bg-white/10 text-white rounded-xl transition font-medium cursor-pointer"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>

        {/* Tab Strip with responsive smooth horizontal scrolling */}
        <div className="bg-[#0d2d27] border-t border-[#176354]/40 px-4 sm:px-6">
          <div className="max-w-[1440px] mx-auto flex items-center gap-1.5 overflow-x-auto whitespace-nowrap no-scrollbar scroll-smooth py-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 sm:px-4 py-3 text-xs font-semibold border-b-2 transition cursor-pointer shrink-0 ${
                  activeTab === tab.id
                    ? "border-[#20C7A7] text-[#20C7A7] bg-white/10"
                    : "border-transparent text-white/80 hover:text-white hover:bg-white/5"
                }`}
              >
                <span className="material-symbols-outlined text-base shrink-0">{tab.icon}</span>
                <span className="whitespace-nowrap leading-none">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

        {/* SCREEN 1: SYSTEM HEALTH */}
        {activeTab === "health" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header Toolbar */}
            <div className="bg-white p-4 rounded-2xl border border-[#577877]/15 shadow-xs flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-[#162623] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#295255]">monitor_heart</span>
                  Platform System Health Observability
                </h3>
                <p className="text-xs text-[#577877]">Real-time liveness and readiness monitoring across Kaizen Care infrastructure.</p>
              </div>
              <button
                type="button"
                onClick={handleTriggerHealthCheck}
                className="px-4 py-2 bg-[#295255] hover:bg-[#1f3d3f] text-white rounded-xl text-xs font-semibold transition cursor-pointer shadow-xs"
              >
                Trigger Health Probe
              </button>
            </div>

            {/* Health Overview Cards */}
            {healthLoading ? (
              <div className="p-12 text-center text-[#577877] bg-white rounded-2xl border border-[#577877]/15 shadow-xs">Loading real-time system health metrics…</div>
            ) : healthData && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  <div className="p-5 bg-white rounded-2xl border border-[#577877]/15 shadow-xs space-y-1">
                    <p className="text-[#577877] font-medium">Overall System Status</p>
                    <p className={`text-xl font-bold uppercase ${healthData.overall_status === "Healthy" ? "text-emerald-700" : "text-amber-700"}`}>
                      {healthData.overall_status}
                    </p>
                    <p className="text-[10px] text-[#577877]">Last checked: {safeFormatDate(healthData.last_checked, "time")}</p>
                  </div>

                  <div className="p-5 bg-white rounded-2xl border border-[#577877]/15 shadow-xs space-y-1">
                    <p className="text-[#577877] font-medium">FastAPI Backend Latency</p>
                    <p className="text-xl font-bold text-[#162623]">{healthData.api_response_time_ms} ms</p>
                    <p className="text-[10px] text-emerald-700 font-semibold">Error rate: {healthData.api_error_rate_pct}%</p>
                  </div>

                  <div className="p-5 bg-white rounded-2xl border border-[#577877]/15 shadow-xs space-y-1">
                    <p className="text-[#577877] font-medium">MongoDB Atlas Latency</p>
                    <p className="text-xl font-bold text-[#162623]">{healthData.database?.latency_ms} ms</p>
                    <p className="text-[10px] text-emerald-700 font-semibold">Status: {healthData.database?.status}</p>
                  </div>

                  <div className="p-5 bg-white rounded-2xl border border-[#577877]/15 shadow-xs space-y-1">
                    <p className="text-[#577877] font-medium">Active Video Visits</p>
                    <p className="text-xl font-bold text-[#295255]">{healthData.active_consultations}</p>
                    <p className="text-[10px] text-[#577877]">WebRTC Signaling: Healthy</p>
                  </div>
                </div>

                {/* Component Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-5 bg-white rounded-2xl border border-[#577877]/15 shadow-xs space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-[#162623] text-sm">React Frontend</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold uppercase">Healthy</span>
                    </div>
                    <p className="text-xs text-[#577877]">Vite Client SPA bundle serving on port 5173 / Production dist.</p>
                  </div>

                  <div className="p-5 bg-white rounded-2xl border border-[#577877]/15 shadow-xs space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-[#162623] text-sm">FastAPI Application Server</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold uppercase">Healthy</span>
                    </div>
                    <p className="text-xs text-[#577877]">Async ASGI server, JWT/Session Auth, CORS &amp; Rate Limiter.</p>
                  </div>

                  <div className="p-5 bg-white rounded-2xl border border-[#577877]/15 shadow-xs space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-[#162623] text-sm">MongoDB Database</span>
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px] font-bold uppercase">Connected</span>
                    </div>
                    <p className="text-xs text-[#577877]">Document persistence, compound indexes &amp; replica ping 4.2ms.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SCREEN 2: SECURITY MONITORING (PRD SECTION 6) */}
        {activeTab === "security" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header Toolbar & Filters */}
            <div className="bg-white p-4 rounded-2xl border border-[#577877]/15 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-[#577877]/15">
                <div>
                  <h3 className="text-base font-bold text-[#162623] flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#295255]">shield_lock</span>
                    Security Threat Detection &amp; Monitoring (PRD Section 6)
                  </h3>
                  <p className="text-xs text-[#577877]">Detect brute force, unauthorized API access, MFA spikes, and execute security mitigations.</p>
                </div>
                <button
                  type="button"
                  onClick={loadSecurity}
                  className="px-4 py-2 bg-[#295255] hover:bg-[#1f3d3f] text-white rounded-xl text-xs font-semibold cursor-pointer shrink-0 transition"
                >
                  Refresh Security Events
                </button>
              </div>

              {/* Security Filters Toolbar (PRD Section 6.3) */}
              <div className="flex flex-wrap gap-2.5 text-xs">
                <input
                  type="text"
                  value={securitySearch}
                  onChange={(e) => setSecuritySearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadSecurity()}
                  placeholder="Search Actor ID, Action, Target, or Event ID…"
                  className="px-3.5 py-1.5 bg-white border border-[#577877]/25 rounded-xl text-[#162623] outline-none focus:border-[#295255] w-64"
                />
                <select
                  value={securitySeverityFilter}
                  onChange={(e) => setSecuritySeverityFilter(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-[#577877]/25 rounded-xl text-[#162623] outline-none"
                >
                  <option value="">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="INFORMATIONAL">Informational</option>
                </select>
                <select
                  value={securityEventTypeFilter}
                  onChange={(e) => setSecurityEventTypeFilter(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-[#577877]/25 rounded-xl text-[#162623] outline-none"
                >
                  <option value="">All Event Types</option>
                  <option value="Authentication">Authentication</option>
                  <option value="Authorization">Authorization</option>
                  <option value="Admin">Admin</option>
                  <option value="Rate Limit">Rate Limit</option>
                </select>
                <select
                  value={securityStatusFilter}
                  onChange={(e) => setSecurityStatusFilter(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-[#577877]/25 rounded-xl text-[#162623] outline-none"
                >
                  <option value="">All Detection Statuses</option>
                  <option value="New">New</option>
                  <option value="Investigating">Investigating</option>
                  <option value="Dismissed">Dismissed</option>
                  <option value="Escalated">Escalated</option>
                </select>
                <button
                  type="button"
                  onClick={loadSecurity}
                  className="px-3.5 py-1.5 bg-[#295255] text-white font-semibold rounded-xl hover:bg-[#1f3d3f] cursor-pointer"
                >
                  Apply Filters
                </button>
              </div>
            </div>

            {/* Threat Metrics Summary Banner (PRD Section 6.1) */}
            {threatMetrics && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                <div className="p-4 bg-white rounded-xl border border-[#577877]/15 shadow-xs space-y-1">
                  <p className="text-[#577877] font-medium">Active Threat Level</p>
                  <p className={`text-xl font-bold uppercase ${
                    threatMetrics.active_threat_level === "HIGH" ? "text-red-700" :
                    threatMetrics.active_threat_level === "MEDIUM" ? "text-amber-700" : "text-emerald-700"
                  }`}>
                    {threatMetrics.active_threat_level}
                  </p>
                </div>

                <div className="p-4 bg-white rounded-xl border border-[#577877]/15 shadow-xs space-y-1">
                  <p className="text-[#577877] font-medium">Failed Logins (24h)</p>
                  <p className="text-xl font-bold text-[#162623]">{threatMetrics.failed_logins_24h}</p>
                </div>

                <div className="p-4 bg-white rounded-xl border border-[#577877]/15 shadow-xs space-y-1">
                  <p className="text-[#577877] font-medium">MFA Challenge Failures</p>
                  <p className="text-xl font-bold text-[#162623]">{threatMetrics.mfa_challenge_failures}</p>
                </div>

                <div className="p-4 bg-white rounded-xl border border-[#577877]/15 shadow-xs space-y-1">
                  <p className="text-[#577877] font-medium">Blocked IP Throttles</p>
                  <p className="text-xl font-bold text-[#162623]">{threatMetrics.blocked_ips_count}</p>
                </div>
              </div>
            )}

            {/* Security Events Table (PRD Section 6.3) */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 overflow-hidden shadow-xs">
              {securityLoading ? (
                <div className="p-12 text-center text-[#577877]">Evaluating security detection rules…</div>
              ) : securityEvents.length === 0 ? (
                <div className="p-12 text-center text-[#577877]">No security threat events match specified criteria.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAF9] text-[#577877] uppercase font-semibold border-b border-[#577877]/15">
                      <tr>
                        <th className="px-6 py-3.5">Event ID</th>
                        <th className="px-6 py-3.5">Timestamp (UTC)</th>
                        <th className="px-6 py-3.5">Event Type</th>
                        <th className="px-6 py-3.5">Severity</th>
                        <th className="px-6 py-3.5">Actor</th>
                        <th className="px-6 py-3.5">Resource</th>
                        <th className="px-6 py-3.5">Detection Rule</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#577877]/15 text-[#162623]">
                      {securityEvents.map((evt) => (
                        <tr key={evt.id || evt.event_id} className="hover:bg-[#F9FBFA]">
                          <td className="px-6 py-4 font-mono font-bold text-[#295255]">{evt.event_id || evt.id?.slice(0, 14)}</td>
                          <td className="px-6 py-4 text-[#577877]">{safeFormatDate(evt.timestamp || evt.created_at)}</td>
                          <td className="px-6 py-4 font-medium text-[#162623]">{evt.event_type || "Authentication"}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                              evt.severity === "Critical" || evt.severity === "CRITICAL" ? "bg-red-100 text-red-800 border border-red-200" :
                              evt.severity === "High" || evt.severity === "HIGH" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                            }`}>
                              {evt.severity}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono text-[#162623]">{evt.actor?.name || evt.actor?.id || evt.actor_id || "System"}</td>
                          <td className="px-6 py-4 font-mono text-[#577877]">{evt.resource || evt.target_id || "User Auth"}</td>
                          <td className="px-6 py-4 text-[#577877] font-mono text-[11px]">{evt.detection_rule || "brute_force_rule"}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                              evt.status === "New" || evt.status === "NEW" ? "bg-amber-100 text-amber-800" :
                              evt.status === "Dismissed" ? "bg-zinc-100 text-zinc-600" :
                              evt.status === "Escalated" ? "bg-purple-100 text-purple-800" : "bg-blue-100 text-blue-800"
                            }`}>
                              {evt.status || "New"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedSecurityEvent(evt)}
                              className="px-3 py-1 bg-[#295255] hover:bg-[#1f3d3f] text-white font-semibold rounded-lg transition cursor-pointer"
                            >
                              Investigate
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SCREEN 3: ACCESS & AUDIT LOGS (PRD SECTION 7) */}
        {activeTab === "audit" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header & Filter Controls (PRD Section 7.4) */}
            <div className="bg-white p-4 rounded-2xl border border-[#577877]/15 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-[#577877]/15">
                <div>
                  <h3 className="text-base font-bold text-[#162623] flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#295255]">policy</span>
                    Access &amp; Audit Trail Search (PRD Section 7)
                  </h3>
                  <p className="text-xs text-[#577877]">Auditable record of who performed an action, what was affected, when it happened, and the outcome.</p>
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await secopsDashboardApi.exportAuditLogs();
                      const blob = new Blob([res.csv_data], { type: "text/csv;charset=utf-8;" });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = res.filename;
                      a.click();
                      addToast("Audit log exported to CSV and recorded in audit trail", "success");
                    } catch (err) {
                      addToast(err.message || "Failed to export audit log", "error");
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#295255] hover:bg-[#1f3d3f] text-white rounded-xl text-xs font-semibold cursor-pointer shrink-0 transition shadow-xs"
                >
                  <span className="material-symbols-outlined text-base">download</span>
                  <span>Export Authorized Audit CSV</span>
                </button>
              </div>

              {/* Filters Toolbar (PRD Section 7.4) */}
              <div className="flex flex-wrap gap-2.5 text-xs">
                <input
                  type="date"
                  value={auditStartDate}
                  onChange={(e) => setAuditStartDate(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-[#577877]/25 rounded-xl text-[#162623] outline-none"
                  title="Start Date"
                />
                <input
                  type="date"
                  value={auditEndDate}
                  onChange={(e) => setAuditEndDate(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-[#577877]/25 rounded-xl text-[#162623] outline-none"
                  title="End Date"
                />
                <input
                  type="text"
                  value={auditActor}
                  onChange={(e) => setAuditActor(e.target.value)}
                  placeholder="Actor ID / Name…"
                  className="px-3 py-1.5 bg-white border border-[#577877]/25 rounded-xl text-[#162623] outline-none w-36"
                />
                <input
                  type="text"
                  value={auditAction}
                  onChange={(e) => setAuditAction(e.target.value)}
                  placeholder="Action name…"
                  className="px-3 py-1.5 bg-white border border-[#577877]/25 rounded-xl text-[#162623] outline-none w-36"
                />
                <select
                  value={auditResource}
                  onChange={(e) => setAuditResource(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-[#577877]/25 rounded-xl text-[#162623] outline-none"
                >
                  <option value="">All Resource Types</option>
                  <option value="User">User</option>
                  <option value="Appointment">Appointment</option>
                  <option value="Payment">Payment</option>
                  <option value="Doctor">Doctor</option>
                  <option value="Ticket">Ticket</option>
                  <option value="Incident">Incident</option>
                </select>
                <select
                  value={auditResultFilter}
                  onChange={(e) => setAuditResultFilter(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-[#577877]/25 rounded-xl text-[#162623] outline-none"
                >
                  <option value="">All Outcomes</option>
                  <option value="Success">Success</option>
                  <option value="Denied">Denied</option>
                  <option value="Failed">Failed</option>
                </select>
                <input
                  type="text"
                  value={auditCorrelationId}
                  onChange={(e) => setAuditCorrelationId(e.target.value)}
                  placeholder="Correlation ID…"
                  className="px-3 py-1.5 bg-white border border-[#577877]/25 rounded-xl text-[#162623] outline-none w-32 font-mono"
                />
                <button
                  type="button"
                  onClick={loadAudit}
                  className="px-3.5 py-1.5 bg-[#295255] text-white font-semibold rounded-xl hover:bg-[#1f3d3f] cursor-pointer"
                >
                  Apply Filters
                </button>
              </div>
            </div>

            {/* Audit Rules Notice Banner (PRD Section 7.4) */}
            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-900 flex items-start gap-3">
              <span className="material-symbols-outlined text-emerald-700 text-lg shrink-0 mt-0.5">lock_clock</span>
              <div>
                <p className="font-bold">Append-Only Immutability Guarantee (PRD Section 7.4)</p>
                <p className="mt-0.5 text-emerald-800">
                  Audit records are append-only and cannot be edited or deleted by dashboard users. Sensitive fields are redacted. Every audit CSV export is itself recorded as an audit event.
                </p>
              </div>
            </div>

            {/* Audit Table (PRD Section 7.4) */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 overflow-hidden shadow-xs">
              {auditLoading ? (
                <div className="p-12 text-center text-[#577877]">Querying access &amp; audit log records…</div>
              ) : auditLogs.length === 0 ? (
                <div className="p-12 text-center text-[#577877]">No audit log records match specified criteria.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAF9] text-[#577877] uppercase font-semibold border-b border-[#577877]/15">
                      <tr>
                        <th className="px-6 py-3.5">Audit ID</th>
                        <th className="px-6 py-3.5">Timestamp (UTC)</th>
                        <th className="px-6 py-3.5">Actor &amp; Role</th>
                        <th className="px-6 py-3.5">Action</th>
                        <th className="px-6 py-3.5">Resource</th>
                        <th className="px-6 py-3.5">Result</th>
                        <th className="px-6 py-3.5">Correlation ID</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#577877]/15 text-[#162623]">
                      {auditLogs.map((log) => (
                        <tr key={log.audit_id || log.id} className="hover:bg-[#F9FBFA]">
                          <td className="px-6 py-4 font-mono font-bold text-[#295255]">{log.audit_id || log.id?.slice(0, 14)}</td>
                          <td className="px-6 py-4 text-[#577877]">{safeFormatDate(log.timestamp || log.created_at)}</td>
                          <td className="px-6 py-4">
                            <p className="font-semibold text-[#162623]">{log.actor_name || log.actor_id}</p>
                            <p className="text-[10px] text-[#577877] uppercase font-mono">{log.actor_role || "user"}</p>
                          </td>
                          <td className="px-6 py-4 font-semibold text-[#162623]">{log.action}</td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-0.5 bg-zinc-100 text-zinc-700 rounded font-semibold uppercase text-[10px]">
                              {log.resource_type || "Other"}
                            </span>
                            <p className="text-[10px] text-[#577877] font-mono mt-0.5">{log.resource_id || "—"}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                              log.result === "Success" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"
                            }`}>
                              {log.result}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <button
                              type="button"
                              onClick={() => {
                                setAuditCorrelationId(log.correlation_id);
                                loadAudit();
                              }}
                              className="font-mono text-xs text-[#295255] hover:underline font-semibold cursor-pointer"
                              title="Click to filter related request timeline"
                            >
                              {log.correlation_id}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}

        {/* SCREEN 4: INCIDENT MANAGEMENT (PRD SECTION 8) */}
        {activeTab === "incidents" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header & Controls */}
            <div className="bg-white p-4 rounded-2xl border border-[#577877]/15 shadow-xs flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-[#162623] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#295255]">warning</span>
                  Technical &amp; Security Incident Management (PRD Section 8)
                </h3>
                <p className="text-xs text-[#577877]">Manage incident lifecycle from detection through recovery and documented closure.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateIncidentModal(true)}
                className="px-4 py-2 bg-red-700 hover:bg-red-800 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0 transition shadow-xs"
              >
                + New Operational Incident
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Incident List */}
              <div className="lg:col-span-1 bg-white rounded-2xl border border-[#577877]/15 p-4 space-y-2 max-h-[650px] overflow-y-auto shadow-xs">
                {incidentsLoading ? (
                  <p className="text-xs text-[#577877] py-6 text-center">Loading incident records…</p>
                ) : incidents.length === 0 ? (
                  <p className="text-xs text-[#577877] py-6 text-center">No active incident records found.</p>
                ) : (
                  incidents.map((inc) => (
                    <div
                      key={inc.id}
                      onClick={() => setSelectedIncident(inc)}
                      className={`p-4 rounded-xl border transition cursor-pointer ${
                        selectedIncident?.id === inc.id
                          ? "border-[#295255] bg-[#EEF6F3]/80 shadow-xs"
                          : "border-[#577877]/15 hover:border-[#295255]/40 bg-white"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-xs font-bold text-[#295255]">{inc.id}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                          inc.severity === "SEV-1" || inc.severity === "CRITICAL" ? "bg-red-100 text-red-800 border border-red-200" :
                          inc.severity === "SEV-2" || inc.severity === "HIGH" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                        }`}>
                          {inc.severity}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-[#162623] mt-1">{inc.title}</h4>
                      <div className="flex justify-between items-center text-xs text-[#577877] mt-2">
                        <span className="capitalize font-semibold text-[#162623]">{inc.status}</span>
                        <span className="font-mono text-[10px]">{inc.category?.replace("_", " ")}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Incident Detail View (PRD Section 8.4) */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-[#577877]/15 p-6 space-y-6 shadow-xs">
                {!selectedIncident ? (
                  <div className="py-20 text-center text-[#577877] flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-4xl text-[#577877]/50">warning</span>
                    <p className="text-sm font-medium">Select an incident record to review investigation, recovery timeline &amp; actions</p>
                  </div>
                ) : (
                  <div className="space-y-6 text-xs">
                    {/* Header Controls */}
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-4 border-b border-[#577877]/15">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-bold text-[#295255]">{selectedIncident.id}</span>
                          <span className={`text-xs font-bold px-2.5 py-0.5 rounded uppercase ${
                            selectedIncident.severity === "SEV-1" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                          }`}>
                            {selectedIncident.severity}
                          </span>
                          <span className="text-xs bg-zinc-100 text-zinc-700 px-2.5 py-0.5 rounded font-mono uppercase">{selectedIncident.category?.replace("_", " ")}</span>
                        </div>
                        <h2 className="text-lg font-bold text-[#162623]">{selectedIncident.title}</h2>
                        <p className="text-[#577877] mt-0.5">Assigned Team: <span className="font-semibold text-[#162623]">{selectedIncident.assigned_team || "Engineering"}</span> • Owner: <span className="font-semibold text-[#162623]">{selectedIncident.assigned_owner}</span></p>
                      </div>

                      {/* Status Lifecycle Dropdown (PRD 8.2) */}
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={selectedIncident.status}
                          onChange={(e) => {
                            const newSt = e.target.value;
                            if (newSt === "CLOSED") {
                              const rc = window.prompt("Closing an incident requires root cause & resolution documentation:");
                              if (rc) handleUpdateIncident(selectedIncident.id, { status: "CLOSED", root_cause: rc, resolution_summary: rc });
                            } else {
                              handleUpdateIncident(selectedIncident.id, { status: newSt });
                            }
                          }}
                          className="px-3.5 py-2 bg-white border border-[#577877]/25 rounded-xl text-[#162623] font-bold outline-none uppercase"
                        >
                          <option value="DETECTED">DETECTED</option>
                          <option value="TRIAGED">TRIAGED</option>
                          <option value="ASSIGNED">ASSIGNED</option>
                          <option value="INVESTIGATING">INVESTIGATING</option>
                          <option value="MITIGATING">MITIGATING</option>
                          <option value="MONITORING">MONITORING</option>
                          <option value="RESOLVED">RESOLVED</option>
                          <option value="CLOSED">CLOSED</option>
                          <option value="REOPENED">REOPENED</option>
                        </select>
                      </div>
                    </div>

                    {/* Impact & Description Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 bg-[#F8FAF9] rounded-xl border border-[#577877]/15 space-y-1">
                        <p className="text-[#577877] font-medium">Incident Description</p>
                        <p className="text-[#162623] font-medium">{selectedIncident.description}</p>
                      </div>
                      <div className="p-4 bg-[#F8FAF9] rounded-xl border border-[#577877]/15 space-y-1">
                        <p className="text-[#577877] font-medium">Impact Description</p>
                        <p className="text-[#162623] font-medium">{selectedIncident.impact_description || "Operational disruption"}</p>
                      </div>
                    </div>

                    {/* Linked Tickets & Alerts Toolbar */}
                    <div className="space-y-3 pt-2 border-t border-[#577877]/15">
                      <h4 className="text-[#577877] font-semibold uppercase tracking-wider text-[10px]">Linked Support Tickets &amp; Alerts</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedIncident.linked_support_tickets?.map((t) => (
                          <span key={t} className="px-3 py-1 bg-purple-100 text-purple-800 font-mono rounded-lg border border-purple-200 flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">headset_mic</span>
                            Ticket #{t}
                          </span>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const tickId = window.prompt("Enter Support Ticket ID to link (e.g. SUP-102938):");
                            if (tickId) handleUpdateIncident(selectedIncident.id, { link_support_ticket_id: tickId });
                          }}
                          className="px-3 py-1 bg-[#EEF6F3] hover:bg-[#295255] hover:text-white text-[#295255] rounded-lg border border-[#295255]/20 font-semibold cursor-pointer transition"
                        >
                          + Link Support Ticket
                        </button>
                      </div>
                    </div>

                    {/* Mitigation & Investigation Toolbar */}
                    <div className="space-y-3 pt-2 border-t border-[#577877]/15">
                      <h4 className="text-[#577877] font-semibold uppercase tracking-wider text-[10px]">Mitigation &amp; Recovery Actions</h4>
                      <div className="flex flex-wrap gap-2.5">
                        <button
                          type="button"
                          onClick={() => {
                            const mit = window.prompt("Record mitigation action taken:");
                            if (mit) handleUpdateIncident(selectedIncident.id, { mitigation_action: mit, status: "MITIGATING" });
                          }}
                          className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-xl cursor-pointer shadow-xs"
                        >
                          Record Mitigation Action
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const sum = window.prompt("Provide resolution summary for this incident:");
                            if (sum) handleUpdateIncident(selectedIncident.id, { status: "RESOLVED", resolution_summary: sum });
                          }}
                          className="px-3.5 py-2 bg-[#295255] hover:bg-[#1f3d3f] text-white font-bold rounded-xl cursor-pointer shadow-xs"
                        >
                          Mark Incident Resolved
                        </button>
                      </div>
                    </div>

                    {/* Chronological Timeline History */}
                    <div className="space-y-3 pt-2 border-t border-[#577877]/15">
                      <h4 className="text-[#577877] font-semibold uppercase tracking-wider text-[10px]">Incident Audit Timeline History</h4>
                      {!selectedIncident.history?.length ? (
                        <p className="text-[#577877] italic">No timeline history recorded.</p>
                      ) : (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {selectedIncident.history.map((h) => (
                            <div key={h.id} className="p-2.5 bg-[#F8FAF9] rounded-lg border border-[#577877]/15 flex justify-between gap-3 text-[#162623]">
                              <div>
                                <span className="font-semibold text-[#162623]">{h.details}</span>
                                <p className="text-[10px] text-[#577877]">Actor: {h.actor_id}</p>
                              </div>
                              <span className="text-[10px] text-[#577877] shrink-0">{safeFormatDate(h.created_at, "time")}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 5: PROVIDER OUTAGE MONITORING (PRD SECTION 9) */}
        {activeTab === "providers" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header Toolbar */}
            <div className="bg-white p-4 rounded-2xl border border-[#577877]/15 shadow-xs flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-[#162623] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#295255]">cloud_sync</span>
                  External Provider Dependency Outage Monitoring (PRD Section 9)
                </h3>
                <p className="text-xs text-[#577877]">Monitor database, payment gateway, transactional email, video signaling, and hosting providers.</p>
              </div>
              <button
                type="button"
                onClick={loadProviders}
                className="px-4 py-2 bg-[#295255] hover:bg-[#1f3d3f] text-white rounded-xl text-xs font-semibold cursor-pointer shrink-0 transition shadow-xs"
              >
                Refresh Provider Probes
              </button>
            </div>

            {/* Provider Rules Notice Banner (PRD Section 9.4) */}
            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 flex items-start gap-3">
              <span className="material-symbols-outlined text-amber-700 text-lg shrink-0 mt-0.5">warning</span>
              <div>
                <p className="font-bold">Provider Monitoring Protocol (PRD Section 9.4)</p>
                <p className="mt-0.5 text-amber-800">
                  External status pages provide supplemental evidence, not proof that internal integration functions. Real OTP emails or payments are never dispatched solely for health probes. Credentials and API keys remain protected.
                </p>
              </div>
            </div>

            {/* Provider Monitoring Table (PRD Section 9.4) */}
            {providersLoading ? (
              <div className="p-12 text-center text-[#577877] bg-white rounded-2xl border border-[#577877]/15 shadow-xs">Probing external integration status…</div>
            ) : providersData && (
              <div className="bg-white rounded-2xl border border-[#577877]/15 overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAF9] text-[#577877] uppercase font-semibold border-b border-[#577877]/15">
                      <tr>
                        <th className="px-6 py-3.5">Provider Name</th>
                        <th className="px-6 py-3.5">Category</th>
                        <th className="px-6 py-3.5">Current Status</th>
                        <th className="px-6 py-3.5">Latency</th>
                        <th className="px-6 py-3.5">Failure Rate</th>
                        <th className="px-6 py-3.5">Last Checked</th>
                        <th className="px-6 py-3.5">Linked Incident</th>
                        <th className="px-6 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#577877]/15 text-[#162623]">
                      {providersData.providers.map((p) => (
                        <tr key={p.provider_key} className="hover:bg-[#F9FBFA]">
                          <td className="px-6 py-4">
                            <div className="font-bold text-[#162623] text-sm">{p.provider_name}</div>
                            {p.provider_status_url && (
                              <a
                                href={p.provider_status_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-[#295255] hover:underline inline-flex items-center gap-1 font-mono mt-0.5"
                              >
                                <span>Official Status Page</span>
                                <span className="material-symbols-outlined text-[10px]">open_in_new</span>
                              </a>
                            )}
                          </td>
                          <td className="px-6 py-4 font-medium text-[#577877]">{p.service_category}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                              p.status === "Operational" ? "bg-emerald-100 text-emerald-800" :
                              p.status === "Maintenance" ? "bg-blue-100 text-blue-800" :
                              p.status === "Degraded" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"
                            }`}>
                              {p.status}
                            </span>
                            {p.maintenance_reason && (
                              <p className="text-[10px] text-[#577877] italic mt-0.5">{p.maintenance_reason}</p>
                            )}
                          </td>
                          <td className="px-6 py-4 font-mono font-bold text-[#162623]">{p.latency_ms} ms</td>
                          <td className="px-6 py-4 font-mono text-[#577877]">{p.failure_rate_pct}%</td>
                          <td className="px-6 py-4 text-[#577877] font-mono text-[11px]">{safeFormatDate(p.last_checked, "time")}</td>
                          <td className="px-6 py-4 font-mono text-[#295255] font-bold">{p.linked_incident}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    const res = await secopsDashboardApi.probeProvider(p.provider_key);
                                    addToast(`Integration probe on '${p.provider_name}' completed (${res.latency_ms}ms)`, "success");
                                    loadProviders();
                                  } catch (err) {
                                    addToast(err.message || "Provider probe failed", "error");
                                  }
                                }}
                                className="px-2.5 py-1 bg-[#EEF6F3] text-[#295255] hover:bg-[#295255] hover:text-white transition font-semibold rounded-lg cursor-pointer"
                              >
                                Run Probe
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  const reason = window.prompt(`Reason for scheduling/recording maintenance on ${p.provider_name}:`);
                                  if (reason) {
                                    try {
                                      await secopsDashboardApi.recordProviderMaintenance({
                                        provider_key: p.provider_key,
                                        status: "Maintenance",
                                        maintenance_reason: reason,
                                      });
                                      addToast(`Recorded maintenance window for ${p.provider_name}`, "success");
                                      loadProviders();
                                    } catch (err) {
                                      addToast(err.message || "Failed to record maintenance", "error");
                                    }
                                  }
                                }}
                                className="px-2.5 py-1 bg-white hover:bg-zinc-50 text-zinc-700 font-semibold rounded-lg border border-[#577877]/25 cursor-pointer"
                              >
                                Maintenance
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SCREEN 6: BACKUP & RECOVERY READINESS (PRD SECTION 10) */}
        {activeTab === "backups" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header Toolbar */}
            <div className="bg-white p-4 rounded-2xl border border-[#577877]/15 shadow-xs flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
              <div>
                <h3 className="text-base font-bold text-[#162623] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#295255]">settings_backup_restore</span>
                  Database Backup Readiness &amp; Controlled Recovery (PRD Section 10)
                </h3>
                <p className="text-xs text-[#577877]">Monitor automated database snapshots, track recovery points, and submit controlled recovery requests.</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleTriggerBackup}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold cursor-pointer shrink-0 transition shadow-xs"
                >
                  + Trigger Manual Backup Run
                </button>
                <button
                  type="button"
                  onClick={() => setShowRecoveryModal(true)}
                  className="px-4 py-2 bg-[#295255] hover:bg-[#1f3d3f] text-white rounded-xl text-xs font-bold cursor-pointer shrink-0 transition shadow-xs"
                >
                  + New Controlled Recovery Request
                </button>
              </div>
            </div>

            {/* Security Compliance Banner (PRD Section 10) */}
            <div className="p-4 bg-purple-50 rounded-2xl border border-purple-200 text-xs text-purple-900 flex items-start gap-3">
              <span className="material-symbols-outlined text-purple-700 text-lg shrink-0 mt-0.5">lock</span>
              <div>
                <p className="font-bold">Healthcare Data Protection &amp; Controlled Restore Restrictions (PRD Section 10)</p>
                <p className="mt-0.5 text-purple-800">
                  Backup credentials are never exposed. Support agents cannot restore databases. Unrestricted one-click production restores are disabled. Independent approval is strictly required before executing recovery runbooks.
                </p>
              </div>
            </div>

            {/* Backup Overview Table (PRD Section 10.2) */}
            {backupsLoading ? (
              <div className="p-12 text-center text-[#577877] bg-white rounded-2xl border border-[#577877]/15 shadow-xs">Loading backup readiness logs…</div>
            ) : backupsData && (
              <div className="space-y-6">
                <div className="bg-white rounded-2xl border border-[#577877]/15 overflow-hidden space-y-2 p-4 shadow-xs">
                  <h4 className="font-bold text-[#162623] text-sm">Automated Snapshot &amp; Backup Overview</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F8FAF9] text-[#577877] uppercase font-semibold border-b border-[#577877]/15">
                        <tr>
                          <th className="px-6 py-3.5">Backup ID</th>
                          <th className="px-6 py-3.5">Protected Resource</th>
                          <th className="px-6 py-3.5">Backup Type</th>
                          <th className="px-6 py-3.5">Status</th>
                          <th className="px-6 py-3.5">Size (MB)</th>
                          <th className="px-6 py-3.5">Retention Until</th>
                          <th className="px-6 py-3.5">Recovery Point (RPO)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#577877]/15 text-[#162623]">
                        {backupsData.backups.map((b) => (
                          <tr key={b.id || b.backup_id} className="hover:bg-[#F9FBFA]">
                            <td className="px-6 py-4 font-mono font-bold text-[#295255]">{b.backup_id || b.id}</td>
                            <td className="px-6 py-4 font-medium text-[#162623]">{b.service || "MongoDB Atlas Cluster"}</td>
                            <td className="px-6 py-4 text-[#577877]">{b.backup_type || b.type || "Automated Snapshot"}</td>
                            <td className="px-6 py-4">
                              <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 font-bold rounded-full text-[10px] uppercase">
                                {b.status || "SUCCESS"}
                              </span>
                            </td>
                            <td className="px-6 py-4 font-mono text-[#162623]">{b.size_mb || 420.5} MB</td>
                            <td className="px-6 py-4 text-[#577877] font-mono">{b.retention_until || "30 Days"}</td>
                            <td className="px-6 py-4 font-mono font-bold text-emerald-700">
                              {safeFormatDate(b.recovery_point || b.restore_point)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Controlled Recovery Requests Table (PRD Section 10.4) */}
                <div className="bg-white rounded-2xl border border-[#577877]/15 p-4 space-y-3 shadow-xs">
                  <h4 className="font-bold text-[#162623] text-sm">Controlled Recovery Requests (PRD Section 10.4)</h4>
                  {!backupsData.recovery_requests?.length ? (
                    <p className="text-xs text-[#577877] italic py-4">No active or historical recovery requests submitted.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#F8FAF9] text-[#577877] uppercase font-semibold border-b border-[#577877]/15">
                          <tr>
                            <th className="px-6 py-3.5">Request ID</th>
                            <th className="px-6 py-3.5">Requested By</th>
                            <th className="px-6 py-3.5">Target Env</th>
                            <th className="px-6 py-3.5">Recovery Point</th>
                            <th className="px-6 py-3.5">Approval Status</th>
                            <th className="px-6 py-3.5">Execution Status</th>
                            <th className="px-6 py-3.5 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#577877]/15 text-[#162623]">
                          {backupsData.recovery_requests.map((req) => (
                            <tr key={req.id || req.request_id} className="hover:bg-[#F9FBFA]">
                              <td className="px-6 py-4 font-mono font-bold text-purple-700">{req.request_id || req.id}</td>
                              <td className="px-6 py-4 font-mono text-[#577877]">{req.requested_by}</td>
                              <td className="px-6 py-4 font-bold text-[#162623]">{req.target_environment}</td>
                              <td className="px-6 py-4 font-mono text-[#577877]">{req.recovery_point}</td>
                              <td className="px-6 py-4">
                                <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                                  req.approval_status === "APPROVED" ? "bg-emerald-100 text-emerald-800" :
                                  req.approval_status === "REJECTED" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                                }`}>
                                  {req.approval_status}
                                </span>
                              </td>
                              <td className="px-6 py-4 font-semibold text-[#162623]">{req.execution_status}</td>
                              <td className="px-6 py-4 text-right">
                                <div className="flex justify-end gap-2">
                                  {req.approval_status === "PENDING_APPROVAL" && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleUpdateRecoveryRequest(req.id, { approval_status: "APPROVED" })}
                                        className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg cursor-pointer"
                                      >
                                        Approve
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const rej = window.prompt("Reason for rejecting recovery request:");
                                          if (rej) handleUpdateRecoveryRequest(req.id, { approval_status: "REJECTED", rejection_reason: rej });
                                        }}
                                        className="px-2.5 py-1 bg-red-100 text-red-800 hover:bg-red-200 font-semibold rounded-lg cursor-pointer"
                                      >
                                        Reject
                                      </button>
                                    </>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SCREEN 7: OPERATIONAL ALERTS (PRD SECTION 11) */}
        {activeTab === "alerts" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header Toolbar */}
            <div className="bg-white p-4 rounded-2xl border border-[#577877]/15 shadow-xs flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-[#162623] flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#295255]">notifications_active</span>
                  Centralized Operational &amp; Security Alerts Queue (PRD Section 11)
                </h3>
                <p className="text-xs text-[#577877]">Monitor deduplicated alerts, acknowledge occurrences, suppress false positives, and link incidents.</p>
              </div>
              <button
                type="button"
                onClick={loadAlerts}
                className="px-4 py-2 bg-[#295255] hover:bg-[#1f3d3f] text-white rounded-xl text-xs font-semibold cursor-pointer shrink-0 transition shadow-xs"
              >
                Refresh Alerts Queue
              </button>
            </div>

            {/* Active Alerts Table (PRD Section 11.4) */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 overflow-hidden shadow-xs">
              {alertsLoading ? (
                <div className="p-12 text-center text-[#577877]">Loading active alerts queue…</div>
              ) : alerts.length === 0 ? (
                <div className="p-12 text-center text-[#577877]">No active operational alerts in queue.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#F8FAF9] text-[#577877] uppercase font-semibold border-b border-[#577877]/15">
                      <tr>
                        <th className="px-6 py-3.5">Alert ID</th>
                        <th className="px-6 py-3.5">Alert Rule</th>
                        <th className="px-6 py-3.5">Severity</th>
                        <th className="px-6 py-3.5">Source Service</th>
                        <th className="px-6 py-3.5">Count</th>
                        <th className="px-6 py-3.5">Assigned Owner</th>
                        <th className="px-6 py-3.5">Status</th>
                        <th className="px-6 py-3.5">Linked Incident</th>
                        <th className="px-6 py-3.5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#577877]/15 text-[#162623]">
                      {alerts.map((alt) => (
                        <tr key={alt.id || alt.alert_id} className="hover:bg-[#F9FBFA]">
                          <td className="px-6 py-4 font-mono font-bold text-[#295255]">{alt.alert_id || alt.id}</td>
                          <td className="px-6 py-4 font-semibold text-[#162623]">{alt.alert_rule}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                              alt.severity === "CRITICAL" ? "bg-red-100 text-red-800 border border-red-200" :
                              alt.severity === "HIGH" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                            }`}>
                              {alt.severity}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-medium text-[#577877]">{alt.source_service}</td>
                          <td className="px-6 py-4 font-mono font-bold text-[#162623]">{alt.occurrence_count || 1}</td>
                          <td className="px-6 py-4 font-mono text-[#577877]">{alt.assigned_owner || "Unassigned"}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                              alt.status === "NEW" ? "bg-amber-100 text-amber-800" :
                              alt.status === "ACKNOWLEDGED" ? "bg-blue-100 text-blue-800" :
                              alt.status === "RESOLVED" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"
                            }`}>
                              {alt.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono text-purple-700 font-bold">{alt.linked_incident}</td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2">
                              {alt.status === "NEW" && (
                                <button
                                  type="button"
                                  onClick={() => handleAcknowledgeAlert(alt.id || alt.alert_id)}
                                  className="px-2.5 py-1 bg-emerald-100 text-emerald-800 hover:bg-emerald-200 font-semibold rounded-lg cursor-pointer"
                                >
                                  Acknowledge
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setSelectedAlert(alt)}
                                className="px-2.5 py-1 bg-[#EEF6F3] text-[#295255] hover:bg-[#295255] hover:text-white font-semibold rounded-lg cursor-pointer transition"
                              >
                                Evidence
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Threshold Rules Overview */}
            <div className="bg-white rounded-2xl border border-[#577877]/15 p-6 text-xs space-y-4 shadow-xs">
              <div className="flex justify-between items-center">
                <h4 className="font-bold text-[#162623] text-sm">Configured Operational Health Threshold Rules</h4>
                <button
                  type="button"
                  onClick={async () => {
                    const lat = window.prompt("Latency Threshold (ms):", alertRules?.latency_threshold_ms || 500);
                    if (lat) {
                      await secopsDashboardApi.updateAlertRules({
                        latency_threshold_ms: parseFloat(lat),
                        error_rate_threshold_pct: alertRules?.error_rate_threshold_pct || 2.0,
                        failed_logins_threshold: alertRules?.failed_logins_threshold || 10,
                      });
                      addToast("Alert threshold rules updated", "success");
                      loadAlerts();
                    }
                  }}
                  className="px-3 py-1.5 bg-[#295255] hover:bg-[#1f3d3f] text-white rounded-xl font-semibold cursor-pointer shadow-xs transition"
                >
                  Configure Rules
                </button>
              </div>
              {alertRules && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200">
                    <p className="text-[#577877] font-medium">Latency Threshold</p>
                    <p className="text-base font-bold text-[#162623] mt-1">{alertRules.latency_threshold_ms} ms</p>
                  </div>
                  <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200">
                    <p className="text-[#577877] font-medium">Error Rate Threshold</p>
                    <p className="text-base font-bold text-[#162623] mt-1">{alertRules.error_rate_threshold_pct} %</p>
                  </div>
                  <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-200">
                    <p className="text-[#577877] font-medium">Failed Logins Threshold</p>
                    <p className="text-base font-bold text-[#162623] mt-1">{alertRules.failed_logins_threshold} Attempts</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* New Incident Modal */}
      {showCreateIncidentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-zinc-200 space-y-4 text-[#162623]">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-base font-bold flex items-center gap-2 text-[#162623]">
                <span className="material-symbols-outlined text-red-600">warning</span>
                Create Operational Incident Record
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateIncidentModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateIncident} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-700 font-bold mb-1">Incident Title</label>
                <input
                  type="text"
                  required
                  value={newIncidentForm.title}
                  onChange={(e) => setNewIncidentForm({ ...newIncidentForm, title: e.target.value })}
                  placeholder="Short operational failure summary…"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#577877]/25 text-[#162623] outline-none focus:border-[#295255]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 font-bold mb-1">Severity</label>
                  <select
                    value={newIncidentForm.severity}
                    onChange={(e) => setNewIncidentForm({ ...newIncidentForm, severity: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#577877]/25 text-[#162623] outline-none"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
                <div>
                  <label className="block text-zinc-700 font-bold mb-1">Destination Team</label>
                  <select
                    value={newIncidentForm.destination_team}
                    onChange={(e) => setNewIncidentForm({ ...newIncidentForm, destination_team: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#577877]/25 text-[#162623] outline-none"
                  >
                    <option value="Engineering">Engineering</option>
                    <option value="Security & Operations">Security &amp; Operations</option>
                    <option value="Technical Operations">Technical Operations</option>
                    <option value="Authorized Finance">Authorized Finance</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 font-bold mb-1">Detailed Description</label>
                <textarea
                  required
                  rows={4}
                  value={newIncidentForm.description}
                  onChange={(e) => setNewIncidentForm({ ...newIncidentForm, description: e.target.value })}
                  placeholder="Describe impact, affected components, and initial findings…"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#577877]/25 text-[#162623] outline-none focus:border-[#295255]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowCreateIncidentModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 border border-zinc-300 rounded-xl hover:bg-zinc-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-800 rounded-xl cursor-pointer shadow-xs"
                >
                  Create Incident
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Security Event Investigation Modal (PRD Section 6.3) */}
      {selectedSecurityEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl border border-zinc-200 space-y-5 text-[#162623]">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <div>
                <span className="font-mono text-xs font-bold text-[#295255]">{selectedSecurityEvent.event_id || selectedSecurityEvent.id}</span>
                <h3 className="text-base font-bold text-[#162623] mt-0.5 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#295255]">shield_lock</span>
                  Security Investigation Evidence &amp; Actions
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSecurityEvent(null)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                <p className="text-[#577877] font-medium">Event Type</p>
                <p className="font-bold text-[#162623] mt-0.5">{selectedSecurityEvent.event_type || "Authentication"}</p>
              </div>
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                <p className="text-[#577877] font-medium">Severity</p>
                <p className="font-bold text-amber-700 mt-0.5">{selectedSecurityEvent.severity || "High"}</p>
              </div>
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                <p className="text-[#577877] font-medium">Detection Rule</p>
                <p className="font-mono text-[#162623] mt-0.5">{selectedSecurityEvent.detection_rule || "brute_force_rule"}</p>
              </div>
              <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200">
                <p className="text-[#577877] font-medium">Sanitized Source</p>
                <p className="font-mono text-[#162623] mt-0.5">{selectedSecurityEvent.source || "Client Gateway IP"}</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <label className="block text-zinc-700 font-bold">Investigation Findings &amp; Analyst Note</label>
              <textarea
                rows={3}
                value={analystNoteText}
                onChange={(e) => setAnalystNoteText(e.target.value)}
                placeholder="Enter investigation notes, correlation references, or evidence findings…"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#577877]/25 text-[#162623] outline-none focus:border-[#295255]"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-zinc-100 text-xs">
              <p className="font-bold text-[#577877] uppercase tracking-wider text-[10px]">Permitted Security Actions</p>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => handleUpdateSecurityEvent(selectedSecurityEvent.id, {
                    status: "Investigating",
                    assigned_analyst: user?.full_name || user?.user_id,
                    investigation_note: analystNoteText,
                  })}
                  className="px-3.5 py-2 bg-[#295255] hover:bg-[#1f3d3f] font-bold text-white rounded-xl cursor-pointer shadow-xs"
                >
                  Assign to Me &amp; Mark Investigating
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const reason = window.prompt("Reason for dismissing false positive security alert:");
                    if (reason) handleUpdateSecurityEvent(selectedSecurityEvent.id, {
                      status: "Dismissed",
                      dismissal_reason: reason,
                      investigation_note: analystNoteText,
                    });
                  }}
                  className="px-3.5 py-2 bg-zinc-100 hover:bg-zinc-200 font-semibold text-zinc-700 rounded-xl cursor-pointer"
                >
                  Dismiss False Positive
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdateSecurityEvent(selectedSecurityEvent.id, {
                    status: "Escalated",
                    escalate_to_incident: true,
                    incident_title: `Escalated Security Threat: ${selectedSecurityEvent.action || selectedSecurityEvent.event_id}`,
                    investigation_note: analystNoteText,
                  })}
                  className="px-3.5 py-2 bg-purple-700 hover:bg-purple-800 font-bold text-white rounded-xl cursor-pointer shadow-xs"
                >
                  Escalate to Incident Management (INC)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Controlled Recovery Request Modal (PRD Section 10.4) */}
      {showRecoveryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl border border-zinc-200 space-y-4 text-[#162623]">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-base font-bold flex items-center gap-2 text-[#162623]">
                <span className="material-symbols-outlined text-[#295255]">settings_backup_restore</span>
                Submit Controlled Recovery Request (PRD 10.4)
              </h3>
              <button
                type="button"
                onClick={() => setShowRecoveryModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateRecoveryRequest} className="space-y-4 text-xs">
              <div>
                <label className="block text-zinc-700 font-bold mb-1">Target Service</label>
                <input
                  type="text"
                  required
                  value={newRecoveryForm.target_service}
                  onChange={(e) => setNewRecoveryForm({ ...newRecoveryForm, target_service: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#577877]/25 text-[#162623] outline-none focus:border-[#295255]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-zinc-700 font-bold mb-1">Target Environment</label>
                  <select
                    value={newRecoveryForm.target_environment}
                    onChange={(e) => setNewRecoveryForm({ ...newRecoveryForm, target_environment: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-[#577877]/25 text-[#162623] outline-none"
                  >
                    <option value="Staging">Staging</option>
                    <option value="Isolated Sandbox">Isolated Sandbox</option>
                    <option value="Production">Production (Requires Approval)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-zinc-700 font-bold mb-1">Recovery Point (RPO Timestamp)</label>
                  <input
                    type="text"
                    required
                    value={newRecoveryForm.recovery_point}
                    onChange={(e) => setNewRecoveryForm({ ...newRecoveryForm, recovery_point: e.target.value })}
                    placeholder="e.g. 2026-11-16T12:00:00Z"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#577877]/25 font-mono text-[#162623] outline-none focus:border-[#295255]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-zinc-700 font-bold mb-1">Detailed Reason for Recovery</label>
                <textarea
                  required
                  rows={3}
                  value={newRecoveryForm.reason}
                  onChange={(e) => setNewRecoveryForm({ ...newRecoveryForm, reason: e.target.value })}
                  placeholder="Explain why recovery is necessary and specify testing runbook…"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#577877]/25 text-[#162623] outline-none focus:border-[#295255]"
                />
              </div>

              <div>
                <label className="block text-zinc-700 font-bold mb-1">Expected Impact Description</label>
                <textarea
                  required
                  rows={2}
                  value={newRecoveryForm.expected_impact}
                  onChange={(e) => setNewRecoveryForm({ ...newRecoveryForm, expected_impact: e.target.value })}
                  placeholder="Describe expected system impact during restoration…"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#577877]/25 text-[#162623] outline-none focus:border-[#295255]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowRecoveryModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-600 border border-zinc-300 rounded-xl hover:bg-zinc-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-purple-600 hover:bg-purple-500 rounded-xl cursor-pointer"
                >
                  Submit for Independent Approval
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Alert Evidence & Action Modal (PRD Section 11.4) */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-xl rounded-2xl bg-[#1E293B] p-6 shadow-2xl border border-slate-700 space-y-4 text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700">
              <div>
                <span className="font-mono text-xs font-bold text-blue-400">{selectedAlert.alert_id || selectedAlert.id}</span>
                <h3 className="text-base font-bold flex items-center gap-2 mt-0.5">
                  <span className="material-symbols-outlined text-blue-400">notifications_active</span>
                  Operational Alert Evidence &amp; Actions
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAlert(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-800 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                <p className="text-slate-400">Triggering Rule</p>
                <p className="font-bold text-white font-mono mt-0.5">{selectedAlert.alert_rule}</p>
              </div>
              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                <p className="text-slate-400">Source Service</p>
                <p className="font-bold text-slate-200 mt-0.5">{selectedAlert.source_service}</p>
              </div>
              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                <p className="text-slate-400">Occurrence Count</p>
                <p className="font-bold text-emerald-400 font-mono mt-0.5">{selectedAlert.occurrence_count || 1} Deduplicated Events</p>
              </div>
              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                <p className="text-slate-400">Linked Incident</p>
                <p className="font-mono font-bold text-purple-400 mt-0.5">{selectedAlert.linked_incident || "None"}</p>
              </div>
            </div>

            <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700 text-xs space-y-1">
              <p className="text-slate-400 font-medium">Original Alert Evidence Description</p>
              <p className="text-slate-200">{selectedAlert.description}</p>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-700 text-xs">
              <p className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Permitted Alert Actions</p>
              <div className="flex flex-wrap gap-2.5">
                {selectedAlert.status !== "ACKNOWLEDGED" && (
                  <button
                    type="button"
                    onClick={() => handleAcknowledgeAlert(selectedAlert.id || selectedAlert.alert_id)}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 font-bold text-white rounded-xl cursor-pointer"
                  >
                    Acknowledge Alert
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const reason = window.prompt("Document reason for suppressing this operational alert (PRD Section 11.4):");
                    if (reason) handleUpdateAlertAction(selectedAlert.id || selectedAlert.alert_id, {
                      status: "SUPPRESSED",
                      suppression_reason: reason,
                      suppression_hours: 24,
                    });
                  }}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 font-semibold text-slate-300 border border-slate-700 rounded-xl cursor-pointer"
                >
                  Suppress Alert
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdateAlertAction(selectedAlert.id || selectedAlert.alert_id, {
                    status: "INVESTIGATING",
                    create_incident: true,
                    incident_title: `Escalated Alert Incident: ${selectedAlert.alert_rule}`,
                  })}
                  className="px-3.5 py-2 bg-red-600 hover:bg-red-500 font-bold text-white rounded-xl cursor-pointer"
                >
                  Escalate to Incident (INC)
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdateAlertAction(selectedAlert.id || selectedAlert.alert_id, { status: "RESOLVED" })}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 font-bold text-white rounded-xl cursor-pointer"
                >
                  Mark Alert Resolved
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function SecOpsDashboardScreen(props) {
  return (
    <ToastProvider>
      <SecOpsDashboardContent {...props} />
    </ToastProvider>
  );
}
