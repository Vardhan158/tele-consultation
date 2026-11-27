import { useEffect, useState, useMemo } from "react";
import { insuranceApi } from "../../../lib/api";
import { useToast } from "../../common/Toast";

export default function InsuranceProvidersTab() {
  const { showToast } = useToast();
  const addToast = showToast;

  // Data & Pagination
  const [providers, setProviders] = useState([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, insurance_company: 0, tpa: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedType, setSelectedType] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const initialForm = {
    provider_name: "",
    provider_code: "",
    country: "India",
    provider_type: "Insurance Company",
    contact_person: "",
    contact_email: "",
    contact_number: "",
    official_website: "",
    claim_submission_email: "",
    claim_submission_portal_url: "",
    status: "Active",
  };
  const [formData, setFormData] = useState(initialForm);
  const [formErrors, setFormErrors] = useState({});

  // Fetch Providers
  const fetchProviders = async (page = currentPage) => {
    setLoading(true);
    setError(null);
    try {
      const data = await insuranceApi.listProviders({
        search: searchTerm,
        status: selectedStatus,
        provider_type: selectedType,
        page,
        limit: pageSize,
      });
      setProviders(data?.items || []);
      setTotal(data?.total || 0);
      setTotalPages(data?.total_pages || 1);
      if (data?.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      setError(err.message || "Failed to load insurance providers");
      addToast(err.message || "Failed to load insurance providers", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProviders(currentPage);
  }, [currentPage, selectedStatus, selectedType]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    fetchProviders(1);
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setSelectedStatus("all");
    setSelectedType("all");
    setCurrentPage(1);
  };

  // Validation
  const validateForm = (data) => {
    const errors = {};
    if (!data.provider_name?.trim() || data.provider_name.trim().length < 2) {
      errors.provider_name = "Provider name is required (min 2 characters)";
    }
    if (!data.provider_code?.trim() || data.provider_code.trim().length < 2) {
      errors.provider_code = "Provider code is required (min 2 characters)";
    } else if (!/^[A-Za-z0-9_\-]+$/.test(data.provider_code.trim())) {
      errors.provider_code = "Letters, numbers, hyphens, and underscores only";
    }
    if (!data.country?.trim()) {
      errors.country = "Country is required";
    }
    if (!data.provider_type) {
      errors.provider_type = "Provider type is required";
    }
    if (data.contact_email?.trim()) {
      const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
      if (!emailRegex.test(data.contact_email.trim())) {
        errors.contact_email = "Invalid email format";
      }
    }
    if (data.claim_submission_email?.trim()) {
      const emailRegex = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
      if (!emailRegex.test(data.claim_submission_email.trim())) {
        errors.claim_submission_email = "Invalid email format";
      }
    }
    return errors;
  };

  // Create
  const handleOpenAddModal = () => {
    setFormData(initialForm);
    setFormErrors({});
    setShowAddModal(true);
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      addToast("Please correct the errors in the form", "warning");
      return;
    }
    setSubmitting(true);
    try {
      await insuranceApi.createProvider({
        ...formData,
        provider_name: formData.provider_name.trim(),
        provider_code: formData.provider_code.trim().toUpperCase(),
        country: formData.country.trim(),
        contact_person: formData.contact_person?.trim() || null,
        contact_email: formData.contact_email?.trim() || null,
        contact_number: formData.contact_number?.trim() || null,
        official_website: formData.official_website?.trim() || null,
        claim_submission_email: formData.claim_submission_email?.trim() || null,
        claim_submission_portal_url: formData.claim_submission_portal_url?.trim() || null,
      });
      addToast("Insurance provider added successfully!", "success");
      setShowAddModal(false);
      setFormData(initialForm);
      fetchProviders(1);
    } catch (err) {
      addToast(err.message || "Failed to add insurance provider", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // Edit
  const handleOpenEditModal = (provider) => {
    setSelectedProvider(provider);
    setFormData({
      provider_name: provider.provider_name || "",
      provider_code: provider.provider_code || "",
      country: provider.country || "India",
      provider_type: provider.provider_type || "Insurance Company",
      contact_person: provider.contact_person || "",
      contact_email: provider.contact_email || "",
      contact_number: provider.contact_number || "",
      official_website: provider.official_website || "",
      claim_submission_email: provider.claim_submission_email || "",
      claim_submission_portal_url: provider.claim_submission_portal_url || "",
      status: provider.status || "Active",
    });
    setFormErrors({});
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!selectedProvider) return;
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      addToast("Please correct the errors in the form", "warning");
      return;
    }
    setSubmitting(true);
    try {
      await insuranceApi.updateProvider(selectedProvider.id, {
        ...formData,
        provider_name: formData.provider_name.trim(),
        provider_code: formData.provider_code.trim().toUpperCase(),
        country: formData.country.trim(),
        contact_person: formData.contact_person?.trim() || null,
        contact_email: formData.contact_email?.trim() || null,
        contact_number: formData.contact_number?.trim() || null,
        official_website: formData.official_website?.trim() || null,
        claim_submission_email: formData.claim_submission_email?.trim() || null,
        claim_submission_portal_url: formData.claim_submission_portal_url?.trim() || null,
      });
      addToast("Insurance provider updated successfully!", "success");
      setShowEditModal(false);
      fetchProviders(currentPage);
    } catch (err) {
      addToast(err.message || "Failed to update insurance provider", "error");
    } finally {
      setSubmitting(false);
    }
  };

  // View
  const handleOpenViewModal = (provider) => {
    setSelectedProvider(provider);
    setShowViewModal(true);
  };

  // Toggle Status
  const handleToggleStatus = async (provider) => {
    const newStatus = provider.status === "Active" ? "Inactive" : "Active";
    const confirmMessage = `Are you sure you want to ${newStatus === "Active" ? "activate" : "deactivate"} "${provider.provider_name}"?`;
    if (!window.confirm(confirmMessage)) return;

    try {
      await insuranceApi.toggleStatus(provider.id, newStatus);
      addToast(`Provider "${provider.provider_name}" is now ${newStatus}`, "success");
      fetchProviders(currentPage);
    } catch (err) {
      addToast(err.message || "Failed to update provider status", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-xs">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-[#F0F5F7] text-[#185A4D] mb-2">
            <span className="material-symbols-outlined text-sm">verified</span>
            Insurance Management Module
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-[#185A4D] text-3xl">health_and_safety</span>
            Insurance Providers
          </h2>
          <p className="text-sm text-zinc-500 mt-1 max-w-2xl">
            Configure health insurance companies, Third-Party Administrators (TPAs), direct billing parameters, and electronic claim submission endpoints.
          </p>
        </div>
        <button
          type="button"
          onClick={handleOpenAddModal}
          className="inline-flex items-center gap-2 rounded-xl bg-[#185A4D] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#13493E] active:scale-[0.99] transition shadow-xs cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-lg">add_circle</span>
          <span>Add Insurance Provider</span>
        </button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#F0F5F7] text-[#185A4D] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-2xl">domain</span>
          </div>
          <div>
            <div className="text-2xl font-bold text-zinc-900">{stats.total}</div>
            <div className="text-xs font-medium text-zinc-500">Total Providers</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-2xl">check_circle</span>
          </div>
          <div>
            <div className="text-2xl font-bold text-zinc-900">{stats.active}</div>
            <div className="text-xs font-medium text-zinc-500">Active Providers</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-2xl">shield_with_heart</span>
          </div>
          <div>
            <div className="text-2xl font-bold text-zinc-900">{stats.insurance_company}</div>
            <div className="text-xs font-medium text-zinc-500">Insurance Companies</div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-xs flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-2xl">corporate_fare</span>
          </div>
          <div>
            <div className="text-2xl font-bold text-zinc-900">{stats.tpa}</div>
            <div className="text-xs font-medium text-zinc-500">TPAs</div>
          </div>
        </div>
      </div>

      {/* Search & Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-zinc-200/80 shadow-xs space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400 text-lg">
              search
            </span>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by provider name, code, contact person, or email..."
              className="w-full pl-10 pr-4 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition"
            />
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
            <div className="w-full sm:w-auto">
              <select
                value={selectedType}
                onChange={(e) => {
                  setSelectedType(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] text-zinc-700"
              >
                <option value="all">All Provider Types</option>
                <option value="Insurance Company">Insurance Company</option>
                <option value="TPA">Third-Party Administrator (TPA)</option>
              </select>
            </div>

            <div className="w-full sm:w-auto">
              <select
                value={selectedStatus}
                onChange={(e) => {
                  setSelectedStatus(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full px-3 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] text-zinc-700"
              >
                <option value="all">All Statuses</option>
                <option value="Active">Active Only</option>
                <option value="Inactive">Inactive Only</option>
              </select>
            </div>

            <button
              type="submit"
              className="px-4 py-2 bg-zinc-800 hover:bg-zinc-900 text-white text-sm font-medium rounded-xl transition cursor-pointer"
            >
              Search
            </button>

            {(searchTerm || selectedStatus !== "all" || selectedType !== "all") && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3 py-2 text-zinc-600 hover:text-zinc-900 text-sm font-medium hover:bg-zinc-100 rounded-xl transition cursor-pointer"
              >
                Reset
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Main Content / Table */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-10 h-10 border-3 border-[#185A4D]/20 border-t-[#185A4D] rounded-full animate-spin mx-auto" />
            <p className="text-sm font-medium text-zinc-600">Loading insurance providers...</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center space-y-3">
            <span className="material-symbols-outlined text-red-500 text-4xl">error</span>
            <p className="text-sm text-red-600 font-medium">{error}</p>
            <button
              onClick={() => fetchProviders(currentPage)}
              className="px-4 py-1.5 text-xs font-semibold text-[#185A4D] bg-[#F0F5F7] rounded-lg hover:bg-[#e2edf1] transition cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : providers.length === 0 ? (
          <div className="p-12 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-3xl">health_and_safety</span>
            </div>
            <div>
              <h3 className="text-base font-semibold text-zinc-800">No insurance providers found</h3>
              <p className="text-sm text-zinc-500 mt-1 max-w-sm mx-auto">
                {searchTerm || selectedStatus !== "all" || selectedType !== "all"
                  ? "No providers match your search filters. Try adjusting your criteria or resetting filters."
                  : "Get started by adding your clinic's recognized insurance companies or TPAs."}
              </p>
            </div>
            <div>
              <button
                onClick={handleOpenAddModal}
                className="inline-flex items-center gap-2 rounded-xl bg-[#185A4D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#13493E] transition shadow-xs cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">add_circle</span>
                <span>Add Insurance Provider</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-zinc-50/80 border-b border-zinc-200 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    <th className="py-3.5 px-4">Provider Code</th>
                    <th className="py-3.5 px-4">Provider Name & Type</th>
                    <th className="py-3.5 px-4">Country</th>
                    <th className="py-3.5 px-4">Contact Info</th>
                    <th className="py-3.5 px-4">Claim Submission</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-zinc-700">
                  {providers.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-50/60 transition group">
                      <td className="py-3.5 px-4 font-mono font-bold text-xs text-zinc-900">
                        <span className="inline-block bg-zinc-100 px-2 py-1 rounded-md text-zinc-800 border border-zinc-200">
                          {p.provider_code}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-zinc-900">{p.provider_name}</div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span
                            className={`inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full ${
                              p.provider_type === "TPA"
                                ? "bg-purple-50 text-purple-700 border border-purple-200"
                                : "bg-blue-50 text-blue-700 border border-blue-200"
                            }`}
                          >
                            {p.provider_type}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-zinc-600">
                        <span className="inline-flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm text-zinc-400">public</span>
                          {p.country}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        {p.contact_person || p.contact_email || p.contact_number ? (
                          <div className="text-xs space-y-0.5">
                            {p.contact_person && (
                              <div className="font-medium text-zinc-800">{p.contact_person}</div>
                            )}
                            {p.contact_email && (
                              <div className="text-zinc-500 truncate max-w-[160px]">{p.contact_email}</div>
                            )}
                            {p.contact_number && (
                              <div className="text-zinc-500">{p.contact_number}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400 italic">Not provided</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {p.claim_submission_email || p.claim_submission_portal_url ? (
                          <div className="text-xs space-y-0.5">
                            {p.claim_submission_email && (
                              <div className="flex items-center gap-1 text-zinc-600">
                                <span className="material-symbols-outlined text-xs text-zinc-400">mail</span>
                                <span className="truncate max-w-[150px]">{p.claim_submission_email}</span>
                              </div>
                            )}
                            {p.claim_submission_portal_url && (
                              <a
                                href={p.claim_submission_portal_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-xs text-[#185A4D] hover:underline font-medium"
                              >
                                <span className="material-symbols-outlined text-xs">open_in_new</span>
                                Claims Portal
                              </a>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-zinc-400 italic">Direct / Manual</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(p)}
                          title={`Click to ${p.status === "Active" ? "deactivate" : "activate"}`}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-pointer transition ${
                            p.status === "Active"
                              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                              : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200 border border-zinc-200"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              p.status === "Active" ? "bg-emerald-500" : "bg-zinc-400"
                            }`}
                          />
                          {p.status}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1 justify-end">
                          <button
                            type="button"
                            onClick={() => handleOpenViewModal(p)}
                            title="View details"
                            className="p-1.5 text-zinc-500 hover:text-[#185A4D] hover:bg-[#F0F5F7] rounded-lg transition cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-lg">visibility</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditModal(p)}
                            title="Edit provider"
                            className="p-1.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-lg">edit</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-4 bg-zinc-50/60 border-t border-zinc-200 text-xs text-zinc-500">
              <div>
                Showing <span className="font-semibold text-zinc-800">{(currentPage - 1) * pageSize + 1}</span> to{" "}
                <span className="font-semibold text-zinc-800">{Math.min(currentPage * pageSize, total)}</span> of{" "}
                <span className="font-semibold text-zinc-800">{total}</span> providers
              </div>
              <div className="inline-flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 bg-white font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Previous
                </button>
                <span className="px-3 py-1.5 text-zinc-700 font-semibold">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-zinc-200 bg-white font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ADD PROVIDER MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-zinc-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#F0F5F7] text-[#185A4D] flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">add_circle</span>
                </div>
                <h3 className="text-lg font-bold text-zinc-900">Add Insurance Provider</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Provider Name* */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Insurance Provider Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.provider_name}
                    onChange={(e) => setFormData({ ...formData, provider_name: e.target.value })}
                    placeholder="e.g. Star Health and Allied Insurance"
                    className={`w-full px-3.5 py-2 text-sm bg-zinc-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition ${
                      formErrors.provider_name ? "border-red-400" : "border-zinc-200"
                    }`}
                  />
                  {formErrors.provider_name && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.provider_name}</p>
                  )}
                </div>

                {/* Provider Code* */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Provider Code (Unique) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.provider_code}
                    onChange={(e) => setFormData({ ...formData, provider_code: e.target.value.toUpperCase() })}
                    placeholder="e.g. STAR-HEALTH"
                    className={`w-full px-3.5 py-2 text-sm font-mono uppercase bg-zinc-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition ${
                      formErrors.provider_code ? "border-red-400" : "border-zinc-200"
                    }`}
                  />
                  {formErrors.provider_code && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.provider_code}</p>
                  )}
                </div>

                {/* Provider Type* */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Provider Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.provider_type}
                    onChange={(e) => setFormData({ ...formData, provider_type: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition"
                  >
                    <option value="Insurance Company">Insurance Company</option>
                    <option value="TPA">Third-Party Administrator (TPA)</option>
                  </select>
                </div>

                {/* Country* */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Country <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="e.g. India"
                    className={`w-full px-3.5 py-2 text-sm bg-zinc-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition ${
                      formErrors.country ? "border-red-400" : "border-zinc-200"
                    }`}
                  />
                  {formErrors.country && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.country}</p>
                  )}
                </div>

                {/* Contact Person */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                    placeholder="e.g. Rajesh Kumar"
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition"
                  />
                </div>

                {/* Contact Number */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Contact Number</label>
                  <input
                    type="text"
                    value={formData.contact_number}
                    onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition"
                  />
                </div>

                {/* Contact Email */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    placeholder="e.g. contact@starhealth.in"
                    className={`w-full px-3.5 py-2 text-sm bg-zinc-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition ${
                      formErrors.contact_email ? "border-red-400" : "border-zinc-200"
                    }`}
                  />
                  {formErrors.contact_email && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.contact_email}</p>
                  )}
                </div>

                {/* Official Website */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Official Website</label>
                  <input
                    type="text"
                    value={formData.official_website}
                    onChange={(e) => setFormData({ ...formData, official_website: e.target.value })}
                    placeholder="e.g. https://www.starhealth.in"
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition"
                  />
                </div>

                {/* Claim Submission Email */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Claim Submission Email</label>
                  <input
                    type="email"
                    value={formData.claim_submission_email}
                    onChange={(e) => setFormData({ ...formData, claim_submission_email: e.target.value })}
                    placeholder="e.g. claims@starhealth.in"
                    className={`w-full px-3.5 py-2 text-sm bg-zinc-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition ${
                      formErrors.claim_submission_email ? "border-red-400" : "border-zinc-200"
                    }`}
                  />
                  {formErrors.claim_submission_email && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.claim_submission_email}</p>
                  )}
                </div>

                {/* Claim Submission Portal URL */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Claim Portal URL</label>
                  <input
                    type="text"
                    value={formData.claim_submission_portal_url}
                    onChange={(e) => setFormData({ ...formData, claim_submission_portal_url: e.target.value })}
                    placeholder="e.g. https://portal.starhealth.in/claims"
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition"
                  />
                </div>

                {/* Status */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Initial Status</label>
                  <div className="flex items-center gap-4 mt-1">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="status"
                        value="Active"
                        checked={formData.status === "Active"}
                        onChange={() => setFormData({ ...formData, status: "Active" })}
                        className="text-[#185A4D] focus:ring-[#185A4D]"
                      />
                      <span className="text-sm font-medium text-emerald-700">Active</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="status"
                        value="Inactive"
                        checked={formData.status === "Inactive"}
                        onChange={() => setFormData({ ...formData, status: "Inactive" })}
                        className="text-zinc-600 focus:ring-zinc-500"
                      />
                      <span className="text-sm font-medium text-zinc-600">Inactive</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200 mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-[#185A4D] hover:bg-[#13493E] text-white text-sm font-semibold rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting && (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  )}
                  <span>Save Insurance Provider</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PROVIDER MODAL */}
      {showEditModal && selectedProvider && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-zinc-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50/50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center">
                  <span className="material-symbols-outlined text-lg">edit</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">Edit Insurance Provider</h3>
                  <p className="text-xs text-zinc-500">{selectedProvider.provider_code}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Provider Name* */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Insurance Provider Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.provider_name}
                    onChange={(e) => setFormData({ ...formData, provider_name: e.target.value })}
                    className={`w-full px-3.5 py-2 text-sm bg-zinc-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition ${
                      formErrors.provider_name ? "border-red-400" : "border-zinc-200"
                    }`}
                  />
                  {formErrors.provider_name && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.provider_name}</p>
                  )}
                </div>

                {/* Provider Code* */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Provider Code (Unique) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.provider_code}
                    onChange={(e) => setFormData({ ...formData, provider_code: e.target.value.toUpperCase() })}
                    className={`w-full px-3.5 py-2 text-sm font-mono uppercase bg-zinc-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition ${
                      formErrors.provider_code ? "border-red-400" : "border-zinc-200"
                    }`}
                  />
                  {formErrors.provider_code && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.provider_code}</p>
                  )}
                </div>

                {/* Provider Type* */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Provider Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={formData.provider_type}
                    onChange={(e) => setFormData({ ...formData, provider_type: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition"
                  >
                    <option value="Insurance Company">Insurance Company</option>
                    <option value="TPA">Third-Party Administrator (TPA)</option>
                  </select>
                </div>

                {/* Country* */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">
                    Country <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    className={`w-full px-3.5 py-2 text-sm bg-zinc-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition ${
                      formErrors.country ? "border-red-400" : "border-zinc-200"
                    }`}
                  />
                </div>

                {/* Contact Person */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={formData.contact_person}
                    onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition"
                  />
                </div>

                {/* Contact Number */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Contact Number</label>
                  <input
                    type="text"
                    value={formData.contact_number}
                    onChange={(e) => setFormData({ ...formData, contact_number: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition"
                  />
                </div>

                {/* Contact Email */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    className={`w-full px-3.5 py-2 text-sm bg-zinc-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition ${
                      formErrors.contact_email ? "border-red-400" : "border-zinc-200"
                    }`}
                  />
                  {formErrors.contact_email && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.contact_email}</p>
                  )}
                </div>

                {/* Official Website */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Official Website</label>
                  <input
                    type="text"
                    value={formData.official_website}
                    onChange={(e) => setFormData({ ...formData, official_website: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition"
                  />
                </div>

                {/* Claim Submission Email */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Claim Submission Email</label>
                  <input
                    type="email"
                    value={formData.claim_submission_email}
                    onChange={(e) => setFormData({ ...formData, claim_submission_email: e.target.value })}
                    className={`w-full px-3.5 py-2 text-sm bg-zinc-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition ${
                      formErrors.claim_submission_email ? "border-red-400" : "border-zinc-200"
                    }`}
                  />
                  {formErrors.claim_submission_email && (
                    <p className="text-xs text-red-500 mt-1">{formErrors.claim_submission_email}</p>
                  )}
                </div>

                {/* Claim Submission Portal URL */}
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Claim Portal URL</label>
                  <input
                    type="text"
                    value={formData.claim_submission_portal_url}
                    onChange={(e) => setFormData({ ...formData, claim_submission_portal_url: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#185A4D] focus:bg-white transition"
                  />
                </div>

                {/* Status */}
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-zinc-700 mb-1">Status</label>
                  <div className="flex items-center gap-4 mt-1">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="edit_status"
                        value="Active"
                        checked={formData.status === "Active"}
                        onChange={() => setFormData({ ...formData, status: "Active" })}
                        className="text-[#185A4D] focus:ring-[#185A4D]"
                      />
                      <span className="text-sm font-medium text-emerald-700">Active</span>
                    </label>
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="edit_status"
                        value="Inactive"
                        checked={formData.status === "Inactive"}
                        onChange={() => setFormData({ ...formData, status: "Inactive" })}
                        className="text-zinc-600 focus:ring-zinc-500"
                      />
                      <span className="text-sm font-medium text-zinc-600">Inactive</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200 mt-6">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-[#185A4D] hover:bg-[#13493E] text-white text-sm font-semibold rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting && (
                    <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  )}
                  <span>Save Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      {showViewModal && selectedProvider && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-zinc-200 overflow-hidden my-8 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-zinc-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#F0F5F7] text-[#185A4D] flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-2xl">health_and_safety</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-900">{selectedProvider.provider_name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-zinc-100 rounded text-zinc-700">
                      {selectedProvider.provider_code}
                    </span>
                    <span
                      className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        selectedProvider.status === "Active"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                      }`}
                    >
                      {selectedProvider.status}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowViewModal(false)}
                className="text-zinc-400 hover:text-zinc-600 p-1 rounded-lg hover:bg-zinc-100 transition cursor-pointer"
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>

            <div className="p-6 space-y-5 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">Provider Type</span>
                  <span className="font-medium text-zinc-800">{selectedProvider.provider_type}</span>
                </div>
                <div>
                  <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">Country</span>
                  <span className="font-medium text-zinc-800">{selectedProvider.country}</span>
                </div>
              </div>

              <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 space-y-3">
                <h4 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">Contact Details</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <span className="text-xs text-zinc-500 block">Contact Person</span>
                    <span className="font-medium text-zinc-800">{selectedProvider.contact_person || "—"}</span>
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 block">Phone Number</span>
                    {selectedProvider.contact_number ? (
                      <a href={`tel:${selectedProvider.contact_number}`} className="text-[#185A4D] hover:underline font-medium">
                        {selectedProvider.contact_number}
                      </a>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-xs text-zinc-500 block">Contact Email</span>
                    {selectedProvider.contact_email ? (
                      <a href={`mailto:${selectedProvider.contact_email}`} className="text-[#185A4D] hover:underline font-medium">
                        {selectedProvider.contact_email}
                      </a>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </div>
                  {selectedProvider.official_website && (
                    <div className="sm:col-span-2">
                      <span className="text-xs text-zinc-500 block">Official Website</span>
                      <a
                        href={selectedProvider.official_website}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[#185A4D] hover:underline font-medium"
                      >
                        <span className="material-symbols-outlined text-xs">link</span>
                        {selectedProvider.official_website}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-4 bg-emerald-50/50 rounded-xl border border-emerald-100/80 space-y-3">
                <h4 className="text-xs font-bold text-[#185A4D] uppercase tracking-wider">Claim Submission Endpoints</h4>
                <div className="space-y-2">
                  <div>
                    <span className="text-xs text-zinc-500 block">Claim Submission Email</span>
                    {selectedProvider.claim_submission_email ? (
                      <a href={`mailto:${selectedProvider.claim_submission_email}`} className="text-[#185A4D] hover:underline font-medium">
                        {selectedProvider.claim_submission_email}
                      </a>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </div>
                  <div>
                    <span className="text-xs text-zinc-500 block">Claims Processing Portal</span>
                    {selectedProvider.claim_submission_portal_url ? (
                      <a
                        href={selectedProvider.claim_submission_portal_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[#185A4D] hover:underline font-medium break-all"
                      >
                        <span className="material-symbols-outlined text-xs">open_in_new</span>
                        {selectedProvider.claim_submission_portal_url}
                      </a>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-2 text-xs text-zinc-400 flex items-center justify-between border-t border-zinc-100">
                <span>Created: {new Date(selectedProvider.created_at).toLocaleDateString()}</span>
                {selectedProvider.updated_at && (
                  <span>Updated: {new Date(selectedProvider.updated_at).toLocaleDateString()}</span>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 bg-zinc-50 border-t border-zinc-200">
              <button
                type="button"
                onClick={() => {
                  setShowViewModal(false);
                  handleOpenEditModal(selectedProvider);
                }}
                className="px-4 py-2 text-sm font-semibold text-[#185A4D] bg-[#F0F5F7] hover:bg-[#e0edf1] rounded-xl transition cursor-pointer"
              >
                Edit Provider
              </button>
              <button
                type="button"
                onClick={() => setShowViewModal(false)}
                className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
