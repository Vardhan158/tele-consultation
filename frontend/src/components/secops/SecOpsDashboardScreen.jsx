import React, { useState, useEffect } from "react";
import { secopsDashboardApi } from "../../lib/api";
import { ToastProvider, useToast } from "../common/Toast";

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

  // Screen 7: Alerts & Rules State
  const [alerts, setAlerts] = useState([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertRules, setAlertRules] = useState(null);
  const [showAlertRulesModal, setShowAlertRulesModal] = useState(false);

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

  const handleAcknowledgeAlert = async (id) => {
    try {
      await secopsDashboardApi.acknowledgeAlert(id);
      addToast("Operational alert acknowledged", "success");
      loadAlerts();
    } catch (err) {
      addToast(err.message || "Failed to acknowledge alert", "error");
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
    <div className="min-h-screen bg-[#0F172A] text-slate-100 font-sans flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-30 bg-[#1E293B] text-white border-b border-slate-700 shadow-md">
        <div className="max-w-[1440px] mx-auto px-6 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-blue-500 text-slate-900 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-xl">shield_person</span>
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none tracking-tight flex items-center gap-2">
                Kaizen Care
                <span className="bg-blue-500/20 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider">
                  Security &amp; Operations
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">Centralized Platform Reliability &amp; Threat Defense</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700">
              <span className="material-symbols-outlined text-base text-blue-400">admin_panel_settings</span>
              <div>
                <p className="font-bold text-slate-200">{user?.full_name || user?.user_id || "Security Analyst"}</p>
                <p className="text-[10px] text-slate-400 uppercase tracking-wider">{user?.role || "secops"}</p>
              </div>
            </div>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition font-medium cursor-pointer"
              >
                Sign Out
              </button>
            )}
          </div>
        </div>

        {/* Tab Strip */}
        <div className="max-w-[1440px] mx-auto px-6 flex gap-1 overflow-x-auto border-t border-slate-800">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-xs font-semibold border-b-2 transition cursor-pointer shrink-0 ${
                activeTab === tab.id
                  ? "border-blue-500 text-blue-400 bg-blue-500/10"
                  : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <span className="material-symbols-outlined text-base">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Main View Area */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto p-6 space-y-6">

        {/* SCREEN 1: SYSTEM HEALTH */}
        {activeTab === "health" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header Toolbar */}
            <div className="bg-[#1E293B] p-4 rounded-2xl border border-slate-700 shadow-xs flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-400">monitor_heart</span>
                  Platform System Health Observability
                </h3>
                <p className="text-xs text-slate-400">Real-time liveness and readiness monitoring across Kaizen Care infrastructure.</p>
              </div>
              <button
                type="button"
                onClick={handleTriggerHealthCheck}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-500 transition cursor-pointer"
              >
                Trigger Health Probe
              </button>
            </div>

            {/* Health Overview Cards */}
            {healthLoading ? (
              <div className="p-12 text-center text-slate-400 bg-[#1E293B] rounded-2xl border border-slate-700">Loading real-time system health metrics…</div>
            ) : healthData && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  <div className="p-5 bg-[#1E293B] rounded-2xl border border-slate-700 space-y-1">
                    <p className="text-slate-400 font-medium">Overall System Status</p>
                    <p className={`text-xl font-bold uppercase ${healthData.overall_status === "Healthy" ? "text-emerald-400" : "text-amber-400"}`}>
                      {healthData.overall_status}
                    </p>
                    <p className="text-[10px] text-slate-500">Last checked: {new Date(healthData.last_checked).toLocaleTimeString()}</p>
                  </div>

                  <div className="p-5 bg-[#1E293B] rounded-2xl border border-slate-700 space-y-1">
                    <p className="text-slate-400 font-medium">FastAPI Backend Latency</p>
                    <p className="text-xl font-bold text-white">{healthData.api_response_time_ms} ms</p>
                    <p className="text-[10px] text-emerald-400">Error rate: {healthData.api_error_rate_pct}%</p>
                  </div>

                  <div className="p-5 bg-[#1E293B] rounded-2xl border border-slate-700 space-y-1">
                    <p className="text-slate-400 font-medium">MongoDB Atlas Latency</p>
                    <p className="text-xl font-bold text-white">{healthData.database?.latency_ms} ms</p>
                    <p className="text-[10px] text-emerald-400">Status: {healthData.database?.status}</p>
                  </div>

                  <div className="p-5 bg-[#1E293B] rounded-2xl border border-slate-700 space-y-1">
                    <p className="text-slate-400 font-medium">Active Video Visits</p>
                    <p className="text-xl font-bold text-blue-400">{healthData.active_consultations}</p>
                    <p className="text-[10px] text-slate-400">WebRTC Signaling: Healthy</p>
                  </div>
                </div>

                {/* Component Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-5 bg-[#1E293B] rounded-2xl border border-slate-700 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white text-sm">React Frontend</span>
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold uppercase">Healthy</span>
                    </div>
                    <p className="text-xs text-slate-400">Vite Client SPA bundle serving on port 5173 / Production dist.</p>
                  </div>

                  <div className="p-5 bg-[#1E293B] rounded-2xl border border-slate-700 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white text-sm">FastAPI Application Server</span>
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold uppercase">Healthy</span>
                    </div>
                    <p className="text-xs text-slate-400">Async ASGI server, JWT/Session Auth, CORS &amp; Rate Limiter.</p>
                  </div>

                  <div className="p-5 bg-[#1E293B] rounded-2xl border border-slate-700 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white text-sm">MongoDB Database</span>
                      <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold uppercase">Connected</span>
                    </div>
                    <p className="text-xs text-slate-400">Document persistence, compound indexes &amp; replica ping 4.2ms.</p>
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
            <div className="bg-[#1E293B] p-4 rounded-2xl border border-slate-700 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-700">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-400">shield_lock</span>
                    Security Threat Detection &amp; Monitoring (PRD Section 6)
                  </h3>
                  <p className="text-xs text-slate-400">Detect brute force, unauthorized API access, MFA spikes, and execute security mitigations.</p>
                </div>
                <button
                  type="button"
                  onClick={loadSecurity}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold cursor-pointer shrink-0"
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
                  className="px-3.5 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none focus:border-blue-500 w-64"
                />
                <select
                  value={securitySeverityFilter}
                  onChange={(e) => setSecuritySeverityFilter(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
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
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
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
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
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
                  className="px-3.5 py-1.5 bg-slate-700 text-white font-semibold rounded-xl hover:bg-slate-600 cursor-pointer"
                >
                  Apply Filters
                </button>
              </div>
            </div>

            {/* Threat Metrics Summary Banner (PRD Section 6.1) */}
            {threatMetrics && (
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
                <div className="p-4 bg-[#1E293B] rounded-xl border border-slate-700 space-y-1">
                  <p className="text-slate-400 font-medium">Active Threat Level</p>
                  <p className={`text-xl font-bold uppercase ${
                    threatMetrics.active_threat_level === "HIGH" ? "text-red-400" :
                    threatMetrics.active_threat_level === "MEDIUM" ? "text-amber-400" : "text-emerald-400"
                  }`}>
                    {threatMetrics.active_threat_level}
                  </p>
                </div>

                <div className="p-4 bg-[#1E293B] rounded-xl border border-slate-700 space-y-1">
                  <p className="text-slate-400 font-medium">Failed Logins (24h)</p>
                  <p className="text-xl font-bold text-white">{threatMetrics.failed_logins_24h}</p>
                </div>

                <div className="p-4 bg-[#1E293B] rounded-xl border border-slate-700 space-y-1">
                  <p className="text-slate-400 font-medium">MFA Challenge Failures</p>
                  <p className="text-xl font-bold text-white">{threatMetrics.mfa_challenge_failures}</p>
                </div>

                <div className="p-4 bg-[#1E293B] rounded-xl border border-slate-700 space-y-1">
                  <p className="text-slate-400 font-medium">Blocked IP Throttles</p>
                  <p className="text-xl font-bold text-white">{threatMetrics.blocked_ips_count}</p>
                </div>
              </div>
            )}

            {/* Security Guardrails Compliance Banner (PRD Section 6.3) */}
            <div className="p-4 bg-blue-950/40 rounded-2xl border border-blue-800/60 text-xs text-blue-200 flex items-start gap-3">
              <span className="material-symbols-outlined text-blue-400 text-lg shrink-0 mt-0.5">verified_user</span>
              <div>
                <p className="font-bold">Security &amp; Privacy Compliance Restrictions (PRD Section 6.3)</p>
                <p className="mt-0.5 text-blue-300">
                  Passwords, OTP values, session cookies, API keys or access tokens are never exposed. Security events are recorded with reliable timestamps and correlation IDs. Accounts are not automatically blocked on weak or unverified signals.
                </p>
              </div>
            </div>

            {/* Security Events Table (PRD Section 6.3) */}
            <div className="bg-[#1E293B] rounded-2xl border border-slate-700 overflow-hidden">
              {securityLoading ? (
                <div className="p-12 text-center text-slate-400">Evaluating security detection rules…</div>
              ) : securityEvents.length === 0 ? (
                <div className="p-12 text-center text-slate-400">No security threat events match specified criteria.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-800 text-slate-400 uppercase font-semibold border-b border-slate-700">
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
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {securityEvents.map((evt) => (
                        <tr key={evt.id || evt.event_id} className="hover:bg-slate-800/50">
                          <td className="px-6 py-4 font-mono font-bold text-blue-400">{evt.event_id || evt.id?.slice(0, 14)}</td>
                          <td className="px-6 py-4 text-slate-400">{evt.timestamp || evt.created_at ? new Date(evt.timestamp || evt.created_at).toLocaleString() : "—"}</td>
                          <td className="px-6 py-4 font-medium text-slate-200">{evt.event_type || "Authentication"}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                              evt.severity === "Critical" || evt.severity === "CRITICAL" ? "bg-red-500/20 text-red-400 border border-red-500/30" :
                              evt.severity === "High" || evt.severity === "HIGH" ? "bg-amber-500/20 text-amber-400" : "bg-blue-500/20 text-blue-400"
                            }`}>
                              {evt.severity}
                            </span>
                          </td>
                          <td className="px-6 py-4 font-mono text-slate-300">{evt.actor?.name || evt.actor?.id || evt.actor_id || "System"}</td>
                          <td className="px-6 py-4 font-mono text-slate-400">{evt.resource || evt.target_id || "User Auth"}</td>
                          <td className="px-6 py-4 text-slate-400 font-mono text-[11px]">{evt.detection_rule || "brute_force_rule"}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                              evt.status === "New" || evt.status === "NEW" ? "bg-amber-500/20 text-amber-400" :
                              evt.status === "Dismissed" ? "bg-slate-700 text-slate-400" :
                              evt.status === "Escalated" ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"
                            }`}>
                              {evt.status || "New"}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => setSelectedSecurityEvent(evt)}
                              className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition cursor-pointer"
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
            <div className="bg-[#1E293B] p-4 rounded-2xl border border-slate-700 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-2 border-b border-slate-700">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span className="material-symbols-outlined text-blue-400">policy</span>
                    Access &amp; Audit Trail Search (PRD Section 7)
                  </h3>
                  <p className="text-xs text-slate-400">Auditable record of who performed an action, what was affected, when it happened, and the outcome.</p>
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
                  className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold cursor-pointer shrink-0 transition"
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
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
                  title="Start Date"
                />
                <input
                  type="date"
                  value={auditEndDate}
                  onChange={(e) => setAuditEndDate(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
                  title="End Date"
                />
                <input
                  type="text"
                  value={auditActor}
                  onChange={(e) => setAuditActor(e.target.value)}
                  placeholder="Actor ID / Name…"
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none w-36"
                />
                <input
                  type="text"
                  value={auditAction}
                  onChange={(e) => setAuditAction(e.target.value)}
                  placeholder="Action name…"
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none w-36"
                />
                <select
                  value={auditResource}
                  onChange={(e) => setAuditResource(e.target.value)}
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
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
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none"
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
                  className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-xl text-white outline-none w-32 font-mono"
                />
                <button
                  type="button"
                  onClick={loadAudit}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl cursor-pointer"
                >
                  Apply Filters
                </button>
              </div>
            </div>

            {/* Audit Rules Notice Banner (PRD Section 7.4) */}
            <div className="p-4 bg-emerald-950/40 rounded-2xl border border-emerald-800/60 text-xs text-emerald-200 flex items-start gap-3">
              <span className="material-symbols-outlined text-emerald-400 text-lg shrink-0 mt-0.5">lock_clock</span>
              <div>
                <p className="font-bold">Append-Only Immutability Guarantee (PRD Section 7.4)</p>
                <p className="mt-0.5 text-emerald-300">
                  Audit records are append-only and cannot be edited or deleted by dashboard users. Sensitive fields are redacted. Every audit CSV export is itself recorded as an audit event.
                </p>
              </div>
            </div>

            {/* Audit Table (PRD Section 7.4) */}
            <div className="bg-[#1E293B] rounded-2xl border border-slate-700 overflow-hidden">
              {auditLoading ? (
                <div className="p-12 text-center text-slate-400">Querying access &amp; audit log records…</div>
              ) : auditLogs.length === 0 ? (
                <div className="p-12 text-center text-slate-400">No audit log records match specified criteria.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-800 text-slate-400 uppercase font-semibold border-b border-slate-700">
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
                    <tbody className="divide-y divide-slate-800 text-slate-300">
                      {auditLogs.map((log) => (
                        <tr key={log.audit_id || log.id} className="hover:bg-slate-800/50">
                          <td className="px-6 py-4 font-mono font-bold text-blue-400">{log.audit_id || log.id?.slice(0, 14)}</td>
                          <td className="px-6 py-4 text-slate-400">{log.timestamp ? new Date(log.timestamp).toLocaleString() : "—"}</td>
                          <td className="px-6 py-4">
                            <p className="font-semibold text-white">{log.actor_name || log.actor_id}</p>
                            <p className="text-[10px] text-slate-400 uppercase font-mono">{log.actor_role || "user"}</p>
                          </td>
                          <td className="px-6 py-4 font-semibold text-slate-200">{log.action}</td>
                          <td className="px-6 py-4">
                            <span className="px-2 py-0.5 bg-slate-800 text-slate-300 rounded font-semibold uppercase text-[10px]">
                              {log.resource_type || "Other"}
                            </span>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">{log.resource_id || "—"}</p>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-0.5 rounded-full font-bold uppercase text-[10px] ${
                              log.result === "Success" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"
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
                              className="font-mono text-xs text-blue-400 hover:underline font-semibold cursor-pointer"
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

        {/* SCREEN 4: INCIDENT MANAGEMENT */}
        {activeTab === "incidents" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-[#1E293B] p-4 rounded-2xl border border-slate-700 shadow-xs flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-400">warning</span>
                  Technical &amp; Security Incident Management
                </h3>
                <p className="text-xs text-slate-400">Manage operational incident lifecycles and link with support escalations.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateIncidentModal(true)}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                + New Operational Incident
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Incident List */}
              <div className="lg:col-span-1 bg-[#1E293B] rounded-2xl border border-slate-700 p-4 space-y-2 max-h-[600px] overflow-y-auto">
                {incidents.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">No active incident records found.</p>
                ) : (
                  incidents.map((inc) => (
                    <div
                      key={inc.id}
                      onClick={() => setSelectedIncident(inc)}
                      className={`p-4 rounded-xl border transition cursor-pointer ${
                        selectedIncident?.id === inc.id
                          ? "border-blue-500 bg-blue-500/10"
                          : "border-slate-700 hover:border-slate-600 bg-slate-800/40"
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-mono text-xs font-bold text-blue-400">{inc.id}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                          inc.severity === "CRITICAL" ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"
                        }`}>
                          {inc.severity}
                        </span>
                      </div>
                      <h4 className="font-bold text-sm text-white mt-1">{inc.title}</h4>
                      <p className="text-xs text-slate-400 mt-1">{inc.status}</p>
                    </div>
                  ))
                )}
              </div>

              {/* Incident Detail */}
              <div className="lg:col-span-2 bg-[#1E293B] rounded-2xl border border-slate-700 p-6 space-y-6">
                {!selectedIncident ? (
                  <div className="py-20 text-center text-slate-400">Select an incident record to review investigation and lifecycle</div>
                ) : (
                  <div className="space-y-4 text-xs">
                    <div className="flex justify-between items-start pb-3 border-b border-slate-700">
                      <div>
                        <span className="font-mono text-xs font-bold text-blue-400">{selectedIncident.id}</span>
                        <h2 className="text-lg font-bold text-white mt-1">{selectedIncident.title}</h2>
                      </div>
                      <select
                        value={selectedIncident.status}
                        onChange={(e) => handleUpdateIncident(selectedIncident.id, { status: e.target.value })}
                        className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white font-bold"
                      >
                        <option value="OPEN">OPEN</option>
                        <option value="INVESTIGATING">INVESTIGATING</option>
                        <option value="MITIGATED">MITIGATED</option>
                        <option value="RESOLVED">RESOLVED</option>
                        <option value="CLOSED">CLOSED</option>
                      </select>
                    </div>
                    <div className="p-4 bg-slate-800/60 rounded-xl border border-slate-700">
                      <p className="text-slate-400 font-medium">Description</p>
                      <p className="text-slate-200 mt-1">{selectedIncident.description}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 5: PROVIDER OUTAGES */}
        {activeTab === "providers" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-[#1E293B] p-4 rounded-2xl border border-slate-700 shadow-xs flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-400">cloud_sync</span>
                  External Provider Dependency Health
                </h3>
                <p className="text-xs text-slate-400">Monitor external payment gateway, transactional email, signaling, and database providers.</p>
              </div>
              <button
                type="button"
                onClick={loadProviders}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Refresh Providers
              </button>
            </div>

            {providersData && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                {providersData.providers.map((p) => (
                  <div key={p.provider_key} className="p-5 bg-[#1E293B] rounded-2xl border border-slate-700 space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-white text-sm">{p.name}</span>
                      <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 rounded-full font-bold uppercase text-[10px]">
                        {p.status}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Category: {p.category}</span>
                      <span>Latency: {p.latency_ms} ms</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SCREEN 6: BACKUP & RECOVERY */}
        {activeTab === "backups" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-[#1E293B] p-4 rounded-2xl border border-slate-700 shadow-xs flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-400">settings_backup_restore</span>
                  Database Backup &amp; Recovery Readiness
                </h3>
                <p className="text-xs text-slate-400">Monitor automated snapshot logs and trigger manual backup runs.</p>
              </div>
              <button
                type="button"
                onClick={handleTriggerBackup}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                + Trigger Manual Backup Run
              </button>
            </div>

            {backupsData && (
              <div className="bg-[#1E293B] rounded-2xl border border-slate-700 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800 text-slate-400 uppercase font-semibold border-b border-slate-700">
                    <tr>
                      <th className="px-6 py-3.5">Backup ID</th>
                      <th className="px-6 py-3.5">Type</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Size (MB)</th>
                      <th className="px-6 py-3.5">Restore Point Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {backupsData.backups.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-800/50">
                        <td className="px-6 py-4 font-mono font-bold text-blue-400">{b.backup_id}</td>
                        <td className="px-6 py-4 font-medium">{b.type}</td>
                        <td className="px-6 py-4">
                          <span className="px-2.5 py-0.5 bg-emerald-500/20 text-emerald-400 font-bold rounded-full text-[10px] uppercase">
                            {b.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">{b.size_mb} MB</td>
                        <td className="px-6 py-4 font-mono text-slate-400">{new Date(b.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* SCREEN 7: OPERATIONAL ALERTS */}
        {activeTab === "alerts" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div className="bg-[#1E293B] p-4 rounded-2xl border border-slate-700 shadow-xs flex justify-between items-center">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-400">notifications_active</span>
                  Operational Alerts Queue &amp; Threshold Rules
                </h3>
                <p className="text-xs text-slate-400">Acknowledge active alerts and configure system health threshold rules.</p>
              </div>
              <button
                type="button"
                onClick={loadAlerts}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold cursor-pointer"
              >
                Refresh Queue
              </button>
            </div>

            <div className="bg-[#1E293B] rounded-2xl border border-slate-700 p-6 text-xs space-y-4">
              <h4 className="font-bold text-white text-sm">Configured Health Threshold Rules</h4>
              {alertRules && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-slate-800 rounded-xl border border-slate-700">
                    <p className="text-slate-400">Latency Threshold</p>
                    <p className="text-base font-bold text-white mt-1">{alertRules.latency_threshold_ms} ms</p>
                  </div>
                  <div className="p-4 bg-slate-800 rounded-xl border border-slate-700">
                    <p className="text-slate-400">Error Rate Threshold</p>
                    <p className="text-base font-bold text-white mt-1">{alertRules.error_rate_threshold_pct} %</p>
                  </div>
                  <div className="p-4 bg-slate-800 rounded-xl border border-slate-700">
                    <p className="text-slate-400">Failed Logins Threshold</p>
                    <p className="text-base font-bold text-white mt-1">{alertRules.failed_logins_threshold} Attempts</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* New Incident Modal */}
      {showCreateIncidentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-2xl bg-[#1E293B] p-6 shadow-2xl border border-slate-700 space-y-4 text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700">
              <h3 className="text-base font-bold flex items-center gap-2">
                <span className="material-symbols-outlined text-red-400">warning</span>
                Create Operational Incident Record
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateIncidentModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-800 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateIncident} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Incident Title</label>
                <input
                  type="text"
                  required
                  value={newIncidentForm.title}
                  onChange={(e) => setNewIncidentForm({ ...newIncidentForm, title: e.target.value })}
                  placeholder="Short operational failure summary…"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Severity</label>
                  <select
                    value={newIncidentForm.severity}
                    onChange={(e) => setNewIncidentForm({ ...newIncidentForm, severity: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none"
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Destination Team</label>
                  <select
                    value={newIncidentForm.destination_team}
                    onChange={(e) => setNewIncidentForm({ ...newIncidentForm, destination_team: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none"
                  >
                    <option value="Engineering">Engineering</option>
                    <option value="Security & Operations">Security &amp; Operations</option>
                    <option value="Technical Operations">Technical Operations</option>
                    <option value="Authorized Finance">Authorized Finance</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">Detailed Description</label>
                <textarea
                  required
                  rows={4}
                  value={newIncidentForm.description}
                  onChange={(e) => setNewIncidentForm({ ...newIncidentForm, description: e.target.value })}
                  placeholder="Describe impact, affected components, and initial findings…"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setShowCreateIncidentModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 border border-slate-700 rounded-xl hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 rounded-xl cursor-pointer"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-xl rounded-2xl bg-[#1E293B] p-6 shadow-2xl border border-slate-700 space-y-5 text-white">
            <div className="flex items-center justify-between pb-2 border-b border-slate-700">
              <div>
                <span className="font-mono text-xs font-bold text-blue-400">{selectedSecurityEvent.event_id || selectedSecurityEvent.id}</span>
                <h3 className="text-base font-bold text-white mt-0.5 flex items-center gap-2">
                  <span className="material-symbols-outlined text-blue-400">shield_lock</span>
                  Security Investigation Evidence &amp; Actions
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSecurityEvent(null)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-800 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                <p className="text-slate-400">Event Type</p>
                <p className="font-bold text-white mt-0.5">{selectedSecurityEvent.event_type || "Authentication"}</p>
              </div>
              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                <p className="text-slate-400">Severity</p>
                <p className="font-bold text-amber-400 mt-0.5">{selectedSecurityEvent.severity || "High"}</p>
              </div>
              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                <p className="text-slate-400">Detection Rule</p>
                <p className="font-mono text-slate-300 mt-0.5">{selectedSecurityEvent.detection_rule || "brute_force_rule"}</p>
              </div>
              <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700">
                <p className="text-slate-400">Sanitized Source</p>
                <p className="font-mono text-slate-300 mt-0.5">{selectedSecurityEvent.source || "Client Gateway IP"}</p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <label className="block text-slate-300 font-semibold">Investigation Findings &amp; Analyst Note</label>
              <textarea
                rows={3}
                value={analystNoteText}
                onChange={(e) => setAnalystNoteText(e.target.value)}
                placeholder="Enter investigation notes, correlation references, or evidence findings…"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-700 text-xs">
              <p className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">Permitted Security Actions</p>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => handleUpdateSecurityEvent(selectedSecurityEvent.id, {
                    status: "Investigating",
                    assigned_analyst: user?.full_name || user?.user_id,
                    investigation_note: analystNoteText,
                  })}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 font-bold text-white rounded-xl cursor-pointer"
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
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 font-semibold text-slate-300 border border-slate-700 rounded-xl cursor-pointer"
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
                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-500 font-bold text-white rounded-xl cursor-pointer"
                >
                  Escalate to Incident Management (INC)
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
