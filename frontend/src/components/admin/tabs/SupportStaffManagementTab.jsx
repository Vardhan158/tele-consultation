import { useEffect, useState } from "react";
import { supportStaffApi } from "../../../lib/api";
import { useToast } from "../../common/Toast";

export default function SupportStaffManagementTab() {
  const { addToast } = useToast();
  const [staffList, setStaffList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    mobile_number: "",
    password: "",
  });

  const [passwordModalUser, setPasswordModalUser] = useState(null);
  const [newPassword, setNewPassword] = useState("");

  const loadStaff = async () => {
    setLoading(true);
    try {
      const data = await supportStaffApi.list();
      setStaffList(data || []);
    } catch (err) {
      addToast(err.message || "Failed to load support staff list", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaff();
  }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!formData.full_name || !formData.email || !formData.password) {
      addToast("Please fill in all required fields", "warning");
      return;
    }
    setSubmitting(true);
    try {
      await supportStaffApi.create(formData);
      addToast("Support staff account created successfully!", "success");
      setShowAddModal(false);
      setFormData({ full_name: "", email: "", mobile_number: "", password: "" });
      loadStaff();
    } catch (err) {
      addToast(err.message || "Failed to create support staff account", "error");
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggleStatus = async (user) => {
    const newActive = !user.active;
    try {
      await supportStaffApi.update(user.id, { active: newActive });
      addToast(`Support staff account ${newActive ? "activated" : "deactivated"}`, "success");
      loadStaff();
    } catch (err) {
      addToast(err.message || "Failed to update account status", "error");
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      addToast("Password must be at least 6 characters", "warning");
      return;
    }
    try {
      await supportStaffApi.update(passwordModalUser.id, { password: newPassword });
      addToast("Password reset successfully", "success");
      setPasswordModalUser(null);
      setNewPassword("");
    } catch (err) {
      addToast(err.message || "Failed to reset password", "error");
    }
  };

  const handleDelete = async (userId) => {
    if (!window.confirm("Are you sure you want to remove this support staff account?")) return;
    try {
      await supportStaffApi.delete(userId);
      addToast("Support staff account deleted", "success");
      loadStaff();
    } catch (err) {
      addToast(err.message || "Failed to delete account", "error");
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-zinc-200/80 shadow-xs">
        <div>
          <h2 className="text-xl font-bold text-zinc-900 tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-[#1A7D67]">support_agent</span>
            Support Staff Management
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Create and manage support agent credentials to allow platform support access for your clinic.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-[#1A7D67] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#156654] transition shadow-xs cursor-pointer shrink-0"
        >
          <span className="material-symbols-outlined text-lg">person_add</span>
          <span>Add Support Staff</span>
        </button>
      </div>

      {/* Staff Table */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-zinc-500 flex flex-col items-center gap-3">
            <span className="material-symbols-outlined text-3xl animate-spin text-[#1A7D67]">progress_activity</span>
            <p className="text-sm font-medium">Loading support staff list…</p>
          </div>
        ) : staffList.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="size-12 rounded-full bg-[#EEF6F3] text-[#1A7D67] flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-2xl">headset_mic</span>
            </div>
            <h3 className="text-base font-bold text-zinc-800">No Support Staff Accounts</h3>
            <p className="text-sm text-zinc-500 max-w-md mx-auto">
              You haven&apos;t created any support agent accounts yet. Click below to add staff access for your clinic.
            </p>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1A7D67] px-4 py-2 text-xs font-semibold text-white hover:bg-[#156654] transition cursor-pointer"
            >
              <span className="material-symbols-outlined text-base">add</span>
              Create First Support Account
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#F8FAF9] border-b border-zinc-200 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3.5">Staff Member</th>
                  <th className="px-6 py-3.5">Mobile</th>
                  <th className="px-6 py-3.5">Role</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5">Created</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-zinc-700">
                {staffList.map((user) => (
                  <tr key={user.id} className="hover:bg-[#F9FBFA] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-full bg-[#EEF6F3] text-[#1A7D67] font-bold flex items-center justify-center shrink-0">
                          {user.full_name?.charAt(0).toUpperCase() || "S"}
                        </div>
                        <div>
                          <p className="font-semibold text-zinc-900">{user.full_name}</p>
                          <p className="text-xs text-zinc-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-medium text-zinc-600">
                      {user.mobile_number || "—"}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                        <span className="material-symbols-outlined text-xs">support_agent</span>
                        Support Agent
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {user.active !== false ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-800">
                          <span className="size-1.5 rounded-full bg-green-600"></span>
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-600">
                          <span className="size-1.5 rounded-full bg-zinc-400"></span>
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-zinc-500">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(user)}
                          title={user.active !== false ? "Deactivate Account" : "Activate Account"}
                          className={`p-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
                            user.active !== false
                              ? "text-amber-600 hover:bg-amber-50"
                              : "text-green-600 hover:bg-green-50"
                          }`}
                        >
                          <span className="material-symbols-outlined text-lg">
                            {user.active !== false ? "block" : "check_circle"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPasswordModalUser(user)}
                          title="Reset Password"
                          className="p-1.5 rounded-lg text-zinc-600 hover:bg-zinc-100 transition cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-lg">key</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(user.id)}
                          title="Delete Account"
                          className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 transition cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-lg">delete</span>
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

      {/* Add Support Staff Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-zinc-200 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[#1A7D67] text-2xl">person_add</span>
                <h3 className="text-lg font-bold text-zinc-900">Create Support Agent</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  placeholder="e.g. Alex Morgan"
                  className="w-full rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-[#1A7D67] focus:ring-1 focus:ring-[#1A7D67]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Email Address <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="e.g. alex.support@clinic.com"
                  className="w-full rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-[#1A7D67] focus:ring-1 focus:ring-[#1A7D67]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Mobile Number
                </label>
                <input
                  type="tel"
                  value={formData.mobile_number}
                  onChange={(e) => setFormData({ ...formData, mobile_number: e.target.value })}
                  placeholder="e.g. +1 555-0192"
                  className="w-full rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-[#1A7D67] focus:ring-1 focus:ring-[#1A7D67]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  Initial Password <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  placeholder="Minimum 6 characters"
                  className="w-full rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-[#1A7D67] focus:ring-1 focus:ring-[#1A7D67]"
                />
              </div>

              <div className="pt-3 flex justify-end gap-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-xl border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-[#1A7D67] px-5 py-2 text-xs font-semibold text-white hover:bg-[#156654] disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? "Creating…" : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {passwordModalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-zinc-200 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-100">
              <h3 className="text-base font-bold text-zinc-900">
                Reset Password for {passwordModalUser.full_name}
              </h3>
              <button
                type="button"
                onClick={() => setPasswordModalUser(null)}
                className="p-1 rounded-lg text-zinc-400 hover:bg-zinc-100 cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full rounded-xl border border-zinc-300 px-3.5 py-2.5 text-sm text-zinc-900 outline-none focus:border-[#1A7D67] focus:ring-1 focus:ring-[#1A7D67]"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-zinc-100">
                <button
                  type="button"
                  onClick={() => setPasswordModalUser(null)}
                  className="rounded-xl border border-zinc-300 px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-[#1A7D67] px-5 py-2 text-xs font-semibold text-white hover:bg-[#156654] cursor-pointer"
                >
                  Update Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
