import { useState, useRef, useEffect } from "react";
import { recordsApi } from "../../lib/api";

// Legacy fixture retained only for backwards-compatible layout data.
// eslint-disable-next-line no-unused-vars
const initialMedicalRecords = [
  {
    id: "REC-2026-001",
    name: "Blood pressure log.pdf",
    date: "Nov 4, 2026",
    addedBy: "You",
    category: "Other",
    categoryDisplay: "Clinical documents",
    size: "245 KB",
  },
  {
    id: "REC-2026-002",
    name: "Metabolic panel.pdf",
    date: "Oct 30, 2026",
    addedBy: "Dr. Sarah Chen",
    category: "Lab reports",
    categoryDisplay: "Lab report",
    size: "1.2 MB",
  },
  {
    id: "REC-2026-003",
    name: "Consultation summary.pdf",
    date: "Oct 29, 2026",
    addedBy: "Dr. Sarah Chen",
    category: "Other",
    categoryDisplay: "Clinical document",
    size: "480 KB",
  },
  {
    id: "REC-2026-004",
    name: "Annual wellness labs.pdf",
    date: "Aug 20, 2026",
    addedBy: "Dr. Michael Patel",
    category: "Lab reports",
    categoryDisplay: "Lab report",
    size: "2.1 MB",
  },
  {
    id: "REC-2026-005",
    name: "Chest X-ray report.pdf",
    date: "Jun 19, 2026",
    addedBy: "Bayview Medical",
    category: "Imaging",
    categoryDisplay: "Imaging report",
    size: "4.8 MB",
  },
  {
    id: "REC-2026-006",
    name: "Allergy history.pdf",
    date: "Mar 12, 2026",
    addedBy: "You",
    category: "Other",
    categoryDisplay: "Clinical document",
    size: "180 KB",
  },
  {
    id: "REC-2026-007",
    name: "Lipid panel breakdown.pdf",
    date: "Apr 2, 2026",
    addedBy: "Dr. Michael Patel",
    category: "Lab reports",
    categoryDisplay: "Lab report",
    size: "1.5 MB",
  },
  {
    id: "REC-2026-008",
    name: "Brain MRI scan report.pdf",
    date: "Jan 14, 2026",
    addedBy: "Bayview Radiology",
    category: "Imaging",
    categoryDisplay: "Imaging report",
    size: "8.4 MB",
  },
  {
    id: "REC-2026-009",
    name: "Complete blood count (CBC).pdf",
    date: "Dec 18, 2025",
    addedBy: "Quest Diagnostics",
    category: "Lab reports",
    categoryDisplay: "Lab report",
    size: "950 KB",
  },
  {
    id: "REC-2026-010",
    name: "Discharge summary - Surgery.pdf",
    date: "Oct 11, 2025",
    addedBy: "UCSF Medical",
    category: "Other",
    categoryDisplay: "Clinical document",
    size: "3.2 MB",
  },
  {
    id: "REC-2026-011",
    name: "Immunization history record.pdf",
    date: "Sep 05, 2025",
    addedBy: "You",
    category: "Other",
    categoryDisplay: "Clinical document",
    size: "310 KB",
  },
  {
    id: "REC-2026-012",
    name: "Cardiology follow-up note.pdf",
    date: "Jul 29, 2025",
    addedBy: "Dr. Sarah Chen",
    category: "Other",
    categoryDisplay: "Clinical document",
    size: "520 KB",
  },
];

export default function MedicalRecordsScreen({ onNavigate }) {
  const [activeCategory, setActiveCategory] = useState("All records");
  const [searchTerm, setSearchTerm] = useState("");
  const [dbRecords, setDbRecords] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [previewRecord, setPreviewRecord] = useState(null);
  const [toastMessage, setToastMessage] = useState("");

  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFileType, setSelectedFileType] = useState("Imaging report");
  const [selectedFileObj, setSelectedFileObj] = useState(null);
  const [isTooLarge, setIsTooLarge] = useState(false);
  const fileInputRef = useRef(null);

  const fetchRecords = async () => {
    try {
      const items = await recordsApi.list();
      if (Array.isArray(items)) {
        setDbRecords(
          items.map((doc) => ({
            id: doc.id,
            name: doc.file_name || doc.title || "Document.pdf",
            date: doc.created_at
              ? new Date(doc.created_at).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
              : "Nov 4, 2026",
            addedBy:
              doc.category === "imaging"
                ? "Bayview Radiology"
                : doc.file_name?.toLowerCase().includes("log") ||
                    doc.file_name?.toLowerCase().includes("history")
                  ? "You"
                  : "Dr. Sarah Chen",
            category: doc.category?.toLowerCase().includes("lab")
              ? "Lab reports"
              : doc.category?.toLowerCase().includes("imaging")
                ? "Imaging"
                : "Other",
            categoryDisplay:
              doc.category === "lab_report"
                ? "Lab report"
                : doc.category === "imaging"
                  ? "Imaging report"
                  : "Clinical document",
            size: doc.size_bytes
              ? doc.size_bytes >= 1048576
                ? `${(doc.size_bytes / 1048576).toFixed(1)} MB`
                : `${Math.round(doc.size_bytes / 1024)} KB`
              : "1.2 MB",
          })),
        );
      }
    } catch {
      // Handled
    }
  };

  useEffect(() => {
    // The async request synchronizes this screen with the API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRecords();
  }, []);

  const records = dbRecords;

  const handleUploadRecord = async () => {
    if (!selectedFileName || isTooLarge) return;
    setIsUploading(true);
    try {
      const rawName = selectedFileName.split(" · ")[0];
      const cat = selectedFileType.toLowerCase().includes("lab")
        ? "lab_report"
        : selectedFileType.toLowerCase().includes("imaging")
          ? "imaging"
          : "other";
      if (!selectedFileObj) throw new Error("Choose a file before uploading.");
      await recordsApi.upload(selectedFileObj, cat);
      setToastMessage("Medical record uploaded successfully.");
      await fetchRecords();
      setSelectedFileName("");
      setSelectedFileObj(null);
    } catch (err) {
      setToastMessage(`Upload error: ${err.message}`);
    } finally {
      setIsUploading(false);
      setTimeout(() => setToastMessage(""), 3500);
    }
  };

  // Filter records
  const filteredRecords = records.filter((rec) => {
    const matchesCategory =
      activeCategory === "All records" ||
      rec.category.toLowerCase() === activeCategory.toLowerCase();
    const matchesSearch =
      rec.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.addedBy.toLowerCase().includes(searchTerm.toLowerCase()) ||
      rec.date.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleBrowseFiles = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
        setSelectedFileObj(null);
        setSelectedFileName("");
        setToastMessage("Invalid file type. Upload a PDF, JPG, or PNG.");
        return;
      }
      setSelectedFileObj(file);
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      const nameWithMB = `${file.name} · ${sizeMB} MB`;
      setSelectedFileName(nameWithMB);
      if (file.size > 10 * 1024 * 1024) {
        setIsTooLarge(true);
      } else {
        setIsTooLarge(false);
      }
    }
  };

  const handleDownloadRecord = async (rec) => {
    try {
      const blob = await recordsApi.download(rec.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = rec.name;
      link.click();
      URL.revokeObjectURL(url);
      setToastMessage(`Downloaded ${rec.name}`);
    } catch (err) {
      setToastMessage(err.message);
    }
    setTimeout(() => setToastMessage(""), 3500);
  };

  const handleDeleteRecord = async (rec) => {
    if (!window.confirm(`Delete ${rec.name}? This cannot be undone.`)) return;
    try {
      await recordsApi.remove(rec.id);
      setDbRecords((current) => current.filter((item) => item.id !== rec.id));
      setToastMessage(`Deleted ${rec.name}`);
    } catch (err) {
      setToastMessage(err.message);
    }
    setTimeout(() => setToastMessage(""), 3500);
  };

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 font-sans text-[#162623]">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Toast */}
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

        {/* Compact Heading Banner matching Find Doctors style */}
        <div className="rounded-2xl bg-gradient-to-r from-[#25836F] via-[#1F6E5E] to-[#185A4D] text-white px-6 py-5 sm:px-8 sm:py-6 shadow-sm border border-[#185A4D]/30 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-wider uppercase text-[#F0F5F7]/85">
              <span className="w-1.5 h-1.5 rounded-full bg-[#A3E2D4]" />
              Secure Health Vault · Medical Records
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              Your health story, together
            </h1>
            <p className="text-xs sm:text-sm text-[#F0F5F7]/90 max-w-2xl leading-relaxed">
              Safely organize your documents and share relevant records with your care team.
            </p>
          </div>

          <button
            type="button"
            onClick={handleBrowseFiles}
            className="px-5 py-2.5 rounded-xl font-semibold text-xs bg-white text-[#185A4D] hover:bg-[#F0F5F7] flex items-center gap-2 shadow-xs transition cursor-pointer shrink-0 self-start sm:self-center"
          >
            <span className="material-symbols-outlined text-base !text-[#185A4D]">upload</span>
            <span>Upload a record</span>
          </button>
        </div>

        {/* 4 Metric Cards Grid matching Screenshot */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {/* Card 1: All records */}
          <div className="care-card p-5 sm:p-6 rounded-2xl bg-white border border-[#577877]/15 flex items-center gap-4">
            <span className="w-10 h-10 rounded-xl bg-[#F0F5F7] text-[#25836F] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[#25836F] text-xl">
                description
              </span>
            </span>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-[#162623] tracking-tight">
                {records.length}
              </div>
              <p className="text-xs text-[#577877]">All records</p>
            </div>
          </div>

          {/* Card 2: Lab reports */}
          <div className="care-card p-5 sm:p-6 rounded-2xl bg-white border border-[#577877]/15 flex items-center gap-4">
            <span className="w-10 h-10 rounded-xl bg-[#F0F5F7] text-[#25836F] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[#25836F] text-xl">
                science
              </span>
            </span>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-[#162623] tracking-tight">
                {records.filter((r) => r.category === "Lab reports").length}
              </div>
              <p className="text-xs text-[#577877]">Lab reports</p>
            </div>
          </div>

          {/* Card 3: Imaging */}
          <div className="care-card p-5 sm:p-6 rounded-2xl bg-white border border-[#577877]/15 flex items-center gap-4">
            <span className="w-10 h-10 rounded-xl bg-[#F0F5F7] text-[#25836F] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[#25836F] text-xl">
                filter_center_focus
              </span>
            </span>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-[#162623] tracking-tight">
                {records.filter((r) => r.category === "Imaging").length}
              </div>
              <p className="text-xs text-[#577877]">Imaging</p>
            </div>
          </div>

          {/* Card 4: Clinical documents */}
          <div className="care-card p-5 sm:p-6 rounded-2xl bg-white border border-[#577877]/15 flex items-center gap-4">
            <span className="w-10 h-10 rounded-xl bg-[#F0F5F7] text-[#25836F] flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined !text-[#25836F] text-xl">
                assignment
              </span>
            </span>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-[#162623] tracking-tight">
                {records.filter((r) => r.category === "Other").length}
              </div>
              <p className="text-xs text-[#577877]">Clinical documents</p>
            </div>
          </div>
        </div>

        {/* Main 2-Column Content Layout matching Screenshot */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column (8 cols): Records Table Card matching Screenshot */}
          <div className="lg:col-span-8 care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-5">
            {/* Category Tabs matching Screenshot */}
            <div className="flex items-center gap-6 border-b border-[#577877]/20 pb-3 text-xs font-semibold">
              {[
                { id: "All records", label: "All records" },
                { id: "Lab reports", label: "Lab reports" },
                { id: "Imaging", label: "Imaging" },
                { id: "Other", label: "Other" },
              ].map((tab) => {
                const isTabActive = activeCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveCategory(tab.id)}
                    className={`transition pb-1 relative cursor-pointer ${
                      isTabActive
                        ? "text-[#25836F] font-bold"
                        : "text-[#577877] hover:text-[#162623]"
                    }`}
                  >
                    <span>{tab.label}</span>
                    {isTabActive && (
                      <span className="absolute -bottom-3 left-0 right-0 h-0.5 bg-[#25836F] rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Search Input matching Screenshot */}
            <div>
              <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                Search records
              </label>
              <div className="relative">
                <span className="material-symbols-outlined text-base absolute left-3 top-1/2 -translate-y-1/2 !text-[#577877]">
                  search
                </span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by document, provider or date"
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] placeholder-[#577877]/70 focus:outline-none focus:border-[#25836F]"
                />
              </div>
            </div>

            {/* Records Table matching Screenshot */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#577877]/15 bg-[#F8FAFB] text-[#577877] font-medium">
                    <th className="py-3 px-4">Document</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Added by</th>
                    <th className="py-3 px-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#577877]/10">
                  {filteredRecords.slice(0, 6).map((rec) => (
                    <tr
                      key={rec.id}
                      className="hover:bg-[#F8FAFB]/70 transition"
                    >
                      <td className="py-3.5 px-4 font-medium text-[#162623] whitespace-nowrap">
                        {rec.name}
                      </td>
                      <td className="py-3.5 px-4 text-[#577877] whitespace-nowrap">
                        {rec.date}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-[#162623] whitespace-nowrap">
                        {rec.addedBy}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-xs text-[#25836F] font-medium">
                          <button
                            type="button"
                            onClick={() => setPreviewRecord(rec)}
                            className="hover:underline cursor-pointer"
                          >
                            View
                          </button>
                          <span className="text-[#577877]">·</span>
                          <button
                            type="button"
                            onClick={() => handleDeleteRecord(rec)}
                            className="hover:underline cursor-pointer text-rose-700"
                          >
                            Delete
                          </button>
                          <span className="text-[#577877]">·</span>
                          <button
                            type="button"
                            onClick={() => handleDownloadRecord(rec)}
                            className="hover:underline cursor-pointer flex items-center gap-1"
                          >
                            <span>Download</span>
                            <span className="material-symbols-outlined !text-[#25836F] text-xs">
                              open_in_new
                            </span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredRecords.length === 0 && (
                    <tr>
                      <td
                        colSpan={4}
                        className="py-8 text-center text-[#577877]"
                      >
                        No records match your criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer matching Screenshot */}
            <div className="pt-2 text-xs text-[#577877]">
              <span>
                Showing {Math.min(6, filteredRecords.length)} of{" "}
                {records.length} records · Documents are retained with your care
                history.
              </span>
            </div>
          </div>

          {/* Right Column (4 cols): Add a health record + Looking for results? */}
          <div className="lg:col-span-4 space-y-5">
            {/* CARD 1: Add a health record matching Screenshot */}
            <div className="care-card p-6 sm:p-7 rounded-2xl bg-white border border-[#577877]/15 space-y-4">
              <h3 className="text-base font-bold text-[#162623]">
                Add a health record
              </h3>

              {/* Dashed Drag & Drop Box */}
              <div className="border-2 border-dashed border-[#577877]/25 rounded-2xl p-6 text-center space-y-2 bg-[#F8FAFB]">
                <div className="w-10 h-10 rounded-full bg-[#E8F3F3] text-[#25836F] flex items-center justify-center mx-auto">
                  <span className="material-symbols-outlined text-2xl !text-[#25836F]">
                    cloud_upload
                  </span>
                </div>
                <h4 className="font-bold text-xs text-[#162623]">
                  Drop a file here
                </h4>
                <p className="text-[11px] text-[#577877]">
                  PDF, JPG, PNG · Up to 10 MB
                </p>
                <div className="pt-1">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={handleBrowseFiles}
                    className="border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7] px-4 py-2 rounded-xl font-semibold text-xs inline-block shadow-2xs transition cursor-pointer"
                  >
                    Browse files
                  </button>
                </div>
              </div>

              {/* Selected File Box with Error (Matches Screenshot 16) */}
              <div>
                <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                  Selected file
                </label>
                <div
                  className={`p-3 rounded-xl border text-xs font-medium bg-white flex items-center justify-between ${
                    isTooLarge
                      ? "border-rose-400 text-[#162623]"
                      : "border-[#577877]/25 text-[#162623]"
                  }`}
                >
                  <span>{selectedFileName}</span>
                  {isTooLarge && (
                    <span className="material-symbols-outlined text-sm text-rose-500">
                      error
                    </span>
                  )}
                </div>
                {isTooLarge && (
                  <span className="text-[11px] text-rose-600 font-medium mt-1 block">
                    File is too large. Choose a file under 10 MB.
                  </span>
                )}
              </div>

              {/* Document Type Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-[#162623] mb-1.5">
                  Document type
                </label>
                <div className="relative">
                  <select
                    value={selectedFileType}
                    onChange={(e) => setSelectedFileType(e.target.value)}
                    className="w-full appearance-none px-3.5 py-2.5 rounded-xl border border-[#577877]/25 bg-white text-xs text-[#162623] font-medium focus:outline-none focus:border-[#25836F] cursor-pointer pr-8"
                  >
                    <option value="Imaging report">Imaging report</option>
                    <option value="Lab report">Lab report</option>
                    <option value="Clinical document">Clinical document</option>
                    <option value="Other">Other</option>
                  </select>
                  <span className="material-symbols-outlined !text-[#577877] text-base absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                    expand_more
                  </span>
                </div>
              </div>

              {/* Upload record button */}
              <div className="pt-1">
                <button
                  type="button"
                  disabled={isTooLarge || !selectedFileName || isUploading}
                  onClick={handleUploadRecord}
                  className={`w-full py-2.5 rounded-xl font-semibold text-xs text-center transition select-none ${
                    isTooLarge || !selectedFileName || isUploading
                      ? "bg-[#F0F5F7] text-[#577877] cursor-not-allowed border border-[#577877]/10"
                      : "bg-[#25836F] text-white hover:bg-[#185A4D] cursor-pointer shadow-sm"
                  }`}
                >
                  {isUploading ? "Uploading..." : "Upload record"}
                </button>
              </div>

              {/* Shared with your care team Badge */}
              <div className="pt-1">
                <span className="inline-block text-xs font-semibold px-3.5 py-1.5 rounded-full bg-[#E8F3F3] text-[#25836F]">
                  Shared with your care team
                </span>
              </div>

              {/* Footnote */}
              <p className="text-[11px] text-[#577877] leading-relaxed">
                Check the file before uploading. Only include information
                relevant to your care.
              </p>
            </div>

            {/* CARD 2: Looking for results? matching Screenshot */}
            <div className="p-5 rounded-2xl bg-[#E8F3F3] border border-[#577877]/20 flex items-start gap-3">
              <span className="material-symbols-outlined !text-[#25836F] text-lg shrink-0 mt-0.5">
                info
              </span>
              <div className="text-xs space-y-1">
                <h4 className="font-bold text-[#162623]">
                  Looking for results?
                </h4>
                <p className="text-[#577877] leading-relaxed">
                  Your provider will review new results and explain what they
                  mean for your care.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Global Footer matching Screenshot */}
        <div className="pt-10 pb-6 border-t border-[#577877]/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#577877]">
          <p>© 2026 Kaizen Care · Your health, thoughtfully connected.</p>
          <div className="flex items-center gap-4">
            <span className="hover:text-[#162623] cursor-pointer">Privacy</span>
            <span>·</span>
            <span className="hover:text-[#162623] cursor-pointer">Terms</span>
            <span>·</span>
            <span
              className="hover:text-[#162623] cursor-pointer"
              onClick={() => onNavigate("support")}
            >
              Need help?
            </span>
          </div>
        </div>
      </div>

      {/* Record Preview Modal */}
      {previewRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#162623]/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white border border-[#577877]/20 p-6 sm:p-7 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#577877]/15">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined !text-[#25836F] text-2xl">
                  description
                </span>
                <h3 className="text-base font-bold text-[#162623]">
                  {previewRecord.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewRecord(null)}
                className="p-1 rounded-lg text-[#577877] hover:bg-[#F0F5F7]"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            <div className="p-4 rounded-xl bg-[#F0F5F7] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#577877]">Date Uploaded:</span>
                <span className="font-semibold text-[#162623]">
                  {previewRecord.date}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Added by:</span>
                <span className="font-semibold text-[#162623]">
                  {previewRecord.addedBy}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Category:</span>
                <span className="font-semibold text-[#25836F]">
                  {previewRecord.categoryDisplay}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">File Size:</span>
                <span className="font-semibold text-[#162623]">
                  {previewRecord.size}
                </span>
              </div>
              <div className="flex justify-between pt-1 border-t border-[#577877]/15">
                <span className="text-[#577877]">Encryption:</span>
                <span className="font-semibold text-emerald-700">
                  AES-256 Verified at rest
                </span>
              </div>
            </div>

            <div className="p-6 rounded-xl border border-dashed border-[#577877]/30 text-center space-y-2 bg-[#F8FAFB]">
              <span className="material-symbols-outlined !text-[#25836F] text-4xl">
                picture_as_pdf
              </span>
              <p className="text-xs font-semibold text-[#162623]">
                Decrypted In-Memory Stream Active
              </p>
              <p className="text-[11px] text-[#577877]">
                Encrypted with your patient vault key for clinical
                teleconsultation review.
              </p>
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setPreviewRecord(null)}
                className="btn-secondary !py-2 !px-4 text-xs font-semibold"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => {
                  handleDownloadRecord(previewRecord);
                  setPreviewRecord(null);
                }}
                className="btn-primary !py-2 !px-4 text-xs font-semibold flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">
                  download
                </span>
                <span>Download PDF</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
