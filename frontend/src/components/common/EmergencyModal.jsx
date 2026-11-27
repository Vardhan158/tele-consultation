import { useState, useEffect } from "react";
import { patientApi } from "../../lib/api";

export default function EmergencyModal({ isOpen, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [userCoords, setUserCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError("");
    patientApi
      .getEmergencyCard()
      .then((res) => setData(res))
      .catch((err) => setError(err.message || "Failed to load Emergency Card"))
      .finally(() => setLoading(false));

    // Try auto-resolving approximate GPS location
    if ("geolocation" in navigator) {
      setLocating(true);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserCoords({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
          });
          setLocating(false);
        },
        () => {
          setLocating(false);
        },
        { timeout: 8000 }
      );
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOpenMaps = () => {
    if (userCoords) {
      window.open(
        `https://www.google.com/maps/search/emergency+hospital+emergency+room/@${userCoords.lat},${userCoords.lng},14z`,
        "_blank"
      );
    } else {
      window.open(
        "https://www.google.com/maps/search/nearest+emergency+hospital+emergency+room",
        "_blank"
      );
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-red-200 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="bg-red-700 text-white p-4 sm:p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
              <span className="material-symbols-outlined text-2xl">medical_services</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded text-white">
                  First Responder &amp; Paramedic Card
                </span>
                <span className="text-[11px] font-semibold text-red-200">24/7 Rapid Access</span>
              </div>
              <h3 className="text-lg font-bold text-white mt-0.5">
                Emergency Medical &amp; Hospital Locator
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition cursor-pointer"
            title="Close"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 text-zinc-900">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-zinc-500 space-y-2">
              <div className="w-8 h-8 border-3 border-red-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs font-medium">Loading Paramedic Emergency Card...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs space-y-2">
              <p className="font-semibold">Unable to load emergency card details.</p>
              <p className="text-[11px]">{error}</p>
              <div className="pt-2">
                <a
                  href="tel:112"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white font-bold text-xs"
                >
                  <span className="material-symbols-outlined text-sm">call</span>
                  Call 112 National Emergency
                </a>
              </div>
            </div>
          ) : data ? (
            <>
              {/* Top Banner: Blood Group & Vital Identity */}
              <div className="p-4 rounded-xl bg-red-50 border-2 border-red-300 flex items-center justify-between flex-wrap gap-4">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-red-800">
                    Patient Full Legal Name
                  </span>
                  <h4 className="text-xl font-black text-zinc-900">{data.full_name}</h4>
                  <p className="text-xs text-zinc-600">
                    {data.gender || "Gender N/A"} &bull; DOB: {data.date_of_birth || "N/A"}
                  </p>
                </div>

                <div className="bg-red-600 text-white px-4 py-2.5 rounded-xl text-center shadow-md shrink-0">
                  <span className="text-[10px] uppercase font-bold tracking-wider block opacity-90">
                    Blood Group
                  </span>
                  <span className="text-2xl font-black tracking-tight">{data.blood_group}</span>
                </div>
              </div>

              {/* CRITICAL ALLERGIES & ALERTS */}
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-700 text-lg">warning</span>
                  <h5 className="font-bold text-xs text-amber-950 uppercase tracking-wider">
                    Known Drug Allergies &amp; Severe Reactions
                  </h5>
                </div>
                {data.allergies && data.allergies.length > 0 ? (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {data.allergies.map((allergy, idx) => (
                      <span
                        key={idx}
                        className="px-3 py-1 rounded-lg text-xs font-bold bg-amber-200/80 text-amber-950 border border-amber-400 flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-xs text-amber-800">do_not_disturb</span>
                        {allergy}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-zinc-600 font-medium italic">
                    No known drug allergies reported on patient profile.
                  </p>
                )}
              </div>

              {/* ACTIVE MEDICATIONS & CHRONIC CONDITIONS */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Active Rx */}
                <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-teal-700 text-base">medication</span>
                    <h6 className="font-bold text-xs text-zinc-800 uppercase tracking-wider">
                      Current Active Medications
                    </h6>
                  </div>
                  {data.active_medications && data.active_medications.length > 0 ? (
                    <ul className="text-xs space-y-1 text-zinc-700 font-medium">
                      {data.active_medications.map((med, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="material-symbols-outlined text-xs text-teal-600 mt-0.5">check</span>
                          <span>{med}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-zinc-500 italic">No recent active prescriptions on chart.</p>
                  )}
                </div>

                {/* Chronic Conditions */}
                <div className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sky-700 text-base">history</span>
                    <h6 className="font-bold text-xs text-zinc-800 uppercase tracking-wider">
                      Underlying Chronic Conditions
                    </h6>
                  </div>
                  {data.chronic_conditions && data.chronic_conditions.length > 0 ? (
                    <ul className="text-xs space-y-1 text-zinc-700 font-medium">
                      {data.chronic_conditions.map((cond, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="material-symbols-outlined text-xs text-sky-600 mt-0.5">fiber_manual_record</span>
                          <span>{cond}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-zinc-500 italic">No chronic medical history recorded.</p>
                  )}
                </div>
              </div>

              {/* EMERGENCY CONTACT & NEXT OF KIN */}
              <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-between flex-wrap gap-3">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500">
                    Primary Emergency Contact / Next of Kin
                  </span>
                  <div className="font-bold text-sm text-zinc-900">
                    {data.emergency_contact?.name || "Not Configured"}{" "}
                    <span className="text-xs text-zinc-500 font-normal">
                      ({data.emergency_contact?.relationship || "Contact"})
                    </span>
                  </div>
                  <div className="text-xs font-mono text-zinc-700 font-semibold">
                    {data.emergency_contact?.phone || "No phone number available"}
                  </div>
                </div>

                {data.emergency_contact?.phone && (
                  <a
                    href={`tel:${data.emergency_contact.phone}`}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-sm transition"
                  >
                    <span className="material-symbols-outlined text-base">call</span>
                    Call Emergency Contact
                  </a>
                )}
              </div>

              {/* NEAREST EMERGENCY HOSPITAL LOCATOR (GPS) */}
              <div className="p-4 rounded-xl bg-teal-50 border border-teal-200 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-teal-700 text-lg">near_me</span>
                    <div>
                      <h5 className="font-bold text-xs text-teal-950 uppercase tracking-wider">
                        Nearest 24/7 Emergency Hospital Locator (GPS)
                      </h5>
                      <p className="text-[11px] text-teal-700">
                        {userCoords
                          ? `GPS Active: Lat ${userCoords.lat.toFixed(4)}, Lng ${userCoords.lng.toFixed(4)}`
                          : locating
                          ? "Detecting nearest hospitals via GPS..."
                          : "Tap below to find the closest 24/7 emergency room & trauma center"}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenMaps}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-800 hover:bg-teal-900 text-white font-bold text-xs shadow-sm transition cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-base">map</span>
                    Open in Google Maps
                  </button>
                </div>
              </div>

              {/* NATIONAL EMERGENCY HOTLINES SPEED-DIAL */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-zinc-500 block">
                  National Emergency Speed-Dial (India &amp; Global)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(data.emergency_hotlines || []).map((h, idx) => (
                    <a
                      key={idx}
                      href={`tel:${h.number}`}
                      className="p-2.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 text-center transition flex flex-col items-center justify-center space-y-0.5 group"
                    >
                      <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider">
                        {h.name}
                      </span>
                      <span className="text-base font-black text-red-700 font-mono group-hover:scale-105 transition-transform">
                        {h.number}
                      </span>
                      <span className="text-[9px] text-zinc-500 leading-tight">
                        {h.description}
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-300 text-zinc-700 hover:bg-zinc-100 text-xs font-bold transition cursor-pointer"
          >
            <span className="material-symbols-outlined text-base">print</span>
            Print Paramedic Card
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-900 text-white text-xs font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
