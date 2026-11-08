import { useEffect, useState } from "react";
import { adminApi } from "../../../lib/api";
import { useToast } from "../../common/Toast";

const ITEMS_PER_PAGE = 5;

export default function AppointmentManagementTab() {
  const { showToast } = useToast();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedApt, setSelectedApt] = useState(null);
  const [cancelModal, setCancelModal] = useState(null);
  const [cancelReason, setCancelReason] = useState("Administrative scheduling adjustment");
  const [cancelling, setCancelling] = useState(false);

  const loadAppointments = () => {
    setLoading(true);
    adminApi
      .appointments(filter, searchQuery)
      .then((res) => setAppointments(Array.isArray(res) ? res : []))
      .catch((err) => {
        showToast(err.message || "Failed to load appointments.", "error");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      loadAppointments();
    }, 300);
    return () => clearTimeout(timer);
  }, [filter, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchQuery]);

  const handleConfirmCancel = async () => {
    if (!cancelModal) return;
    setCancelling(true);
    try {
      await adminApi.cancelAppointment(cancelModal, cancelReason);
      showToast("Appointment cancelled successfully.", "warning");
      setCancelModal(null);
      loadAppointments();
    } catch (err) {
      showToast(err.message || "Failed to cancel appointment.", "error");
    } finally {
      setCancelling(false);
    }
  };

  const totalPages = Math.ceil(appointments.length / ITEMS_PER_PAGE) || 1;
  const paginatedAppointments = appointments.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  return (
    <div className="space-y-6 font-sans">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-[#577877]/15 pb-4">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
            Appointment Management
          </span>
          <h1 className="text-2xl font-bold text-[#162623]">
            Master Bookings, Search & Status Tracking
          </h1>
          <p className="text-xs text-[#577877]">
            Track patient-doctor consultation status, view full booking details, and perform admin cancellations.
          </p>
        </div>

        {/* Status Filters */}
        <div className="flex flex-wrap gap-1.5 rounded-xl bg-[#F0F5F7] p-1 border border-[#577877]/15">
          {["all", "confirmed", "checked_in", "in_progress", "completed", "cancelled"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize transition ${
                filter === f ? "bg-white text-[#295255] shadow-sm" : "text-[#577877]"
              }`}
            >
              {f.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      {/* Search Bar */}
      <div className="care-card p-4">
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#577877] text-lg">
            search
          </span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by patient name or doctor name…"
            className="w-full rounded-xl border border-[#577877]/25 pl-9 pr-3 py-2 text-xs focus:border-[#295255] focus:outline-none"
          />
        </div>
      </div>

      {/* Appointment Details Modal */}
      {selectedApt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162623]/50 backdrop-blur-xs p-4">
          <div className="care-card max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-[#577877]/15 pb-3">
              <h3 className="text-sm font-bold text-[#162623]">
                Appointment Booking Record #{selectedApt.id}
              </h3>
              <button
                onClick={() => setSelectedApt(null)}
                className="text-xs font-semibold text-[#577877] hover:underline"
              >
                Close ✕
              </button>
            </div>

            <div className="rounded-xl bg-[#F0F5F7] p-4 text-xs space-y-2">
              <div><strong>Patient Name:</strong> {selectedApt.patient_name}</div>
              <div><strong>Attending Doctor:</strong> {selectedApt.doctor_name}</div>
              <div><strong>Scheduled Date/Time:</strong> {new Date(selectedApt.starts_at).toLocaleString()}</div>
              <div><strong>Duration:</strong> {selectedApt.duration_minutes || 30} minutes</div>
              <div><strong>Consultation Type:</strong> {selectedApt.type || "Video Consultation"}</div>
              <div><strong>Status:</strong> <span className="font-bold uppercase text-[#295255]">{selectedApt.status}</span></div>
              {selectedApt.cancel_reason && (
                <div className="text-red-700"><strong>Cancellation Reason:</strong> {selectedApt.cancel_reason}</div>
              )}
            </div>

            <div className="text-right">
              <button
                onClick={() => setSelectedApt(null)}
                className="rounded-xl bg-[#295255] px-4 py-2 text-xs font-semibold text-white"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Modal */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#162623]/50 backdrop-blur-xs p-4">
          <div className="care-card max-w-md w-full p-6 space-y-4">
            <h3 className="text-sm font-bold text-[#162623]">Cancel Appointment</h3>
            <p className="text-xs text-[#577877]">
              Provide an administrative reason for cancelling this booking.
            </p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full rounded-xl border border-[#577877]/25 p-3 text-xs h-24"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setCancelModal(null)}
                className="rounded-xl border border-[#577877]/30 px-3 py-2 text-xs font-semibold text-[#577877]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmCancel}
                disabled={cancelling}
                className="rounded-xl bg-red-700 px-4 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {cancelling ? "Cancelling…" : "Confirm Cancellation"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Appointment Table & Empty State */}
      {loading ? (
        <div className="flex h-48 items-center justify-center text-[#577877]">
          <span className="material-symbols-outlined animate-spin text-3xl">sync</span>
        </div>
      ) : paginatedAppointments.length === 0 ? (
        <div className="care-card p-12 text-center text-[#577877] space-y-2">
          <span className="material-symbols-outlined text-4xl text-[#577877]/60">event_busy</span>
          <h3 className="text-base font-bold text-[#162623]">No Appointments Found</h3>
          <p className="text-xs max-w-sm mx-auto">
            No bookings match your status filter <strong>"{filter}"</strong> or search query <strong>"{searchQuery}"</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="care-card overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F0F5F7] border-b border-[#577877]/15 text-[#577877] font-semibold">
                <tr>
                  <th className="p-3">Date / Time</th>
                  <th className="p-3">Patient</th>
                  <th className="p-3">Doctor</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#577877]/15">
                {paginatedAppointments.map((apt, idx) => (
                  <tr key={`${apt.id || 'apt'}-${idx}`} className="hover:bg-[#F0F5F7]/50">
                    <td className="p-3">
                      <div className="font-bold text-[#162623]">{new Date(apt.starts_at).toLocaleDateString()}</div>
                      <div className="text-[11px] text-[#577877]">
                        {new Date(apt.starts_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>
                    <td className="p-3 font-semibold text-[#162623]">{apt.patient_name}</td>
                    <td className="p-3 font-semibold text-[#295255]">{apt.doctor_name}</td>
                    <td className="p-3 text-[#577877]">{apt.type || "Video Call"}</td>
                    <td className="p-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          apt.status === "confirmed"
                            ? "bg-teal-100 text-[#295255]"
                            : apt.status === "completed"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-red-100 text-red-800"
                        }`}
                      >
                        {apt.status}
                      </span>
                    </td>
                    <td className="p-3 text-right space-x-2">
                      <button
                        onClick={() => setSelectedApt(apt)}
                        className="rounded-lg border border-[#577877]/30 bg-white px-2.5 py-1 text-[11px] font-semibold text-[#295255] hover:bg-[#F0F5F7]"
                      >
                        Details
                      </button>

                      {apt.status === "confirmed" && (
                        <button
                          onClick={() => setCancelModal(apt.id)}
                          className="rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-[#577877]/15 pt-4 text-xs">
              <span className="text-[#577877]">
                Showing Page {currentPage} of {totalPages} ({appointments.length} appointments total)
              </span>
              <div className="flex gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-[#577877]/25 px-3 py-1.5 font-semibold text-[#295255] hover:bg-[#F0F5F7] disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-lg border border-[#577877]/25 px-3 py-1.5 font-semibold text-[#295255] hover:bg-[#F0F5F7] disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
