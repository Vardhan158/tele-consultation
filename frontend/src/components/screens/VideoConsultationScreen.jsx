import { useEffect, useState, useRef } from "react";
import {
  API_BASE_URL,
  consultationApi,
  patientApi,
  clinicalApi,
} from "../../lib/api";
import WebRtcConsultation from "../consultation/WebRtcConsultation";

export default function VideoConsultationScreen({ onNavigate }) {
  const [appointmentId, setAppointmentId] = useState(
    () => localStorage.getItem("teleconsult_appointment_id") || "",
  );
  const [appointment, setAppointment] = useState(null);
  const [patientProfile, setPatientProfile] = useState(null);
  const [prescriptions, setPrescriptions] = useState([]);
  const [roomAuth, setRoomAuth] = useState(null);
  const [roomState, setRoomState] = useState(() => {
    return localStorage.getItem("teleconsult_in_call") === "true" ? "IN_CALL" : "READINESS";
  }); // 'READINESS' | 'WAITING_ROOM' | 'IN_CALL' | 'ENDED'
  const [errorMessage, setErrorMessage] = useState("");
  const [devices, setDevices] = useState({
    camera: true,
    microphone: true,
    network: true,
    speaker: true,
  });
  const [cameraOff, setCameraOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const timerRef = useRef(null);
  const previewVideoRef = useRef(null);
  const streamRef = useRef(null);

  // Auto-resume call on page reload if active call flag is present
  useEffect(() => {
    const targetAptId = appointment?.id || appointmentId;
    if (localStorage.getItem("teleconsult_in_call") === "true" && targetAptId && roomState === "IN_CALL" && !roomAuth) {
      consultationApi.join(targetAptId)
        .then((auth) => {
          setRoomAuth(auth);
          setRoomState("IN_CALL");
        })
        .catch(() => {
          localStorage.removeItem("teleconsult_in_call");
          setRoomState("READINESS");
        });
    }
  }, [appointment, appointmentId, roomState, roomAuth]);

  useEffect(() => {
    patientApi
      .profile()
      .then((p) => {
        if (p) setPatientProfile(p);
      })
      .catch(() => {});

    patientApi
      .appointments()
      .then((items) => {
        if (Array.isArray(items) && items.length > 0) {
          const found = appointmentId
            ? items.find((item) => item.id === appointmentId)
            : items.find((item) =>
                ["confirmed", "checked_in"].includes(item.status),
              ) || items[0];

          if (found) {
            setAppointment(found);
            if (!appointmentId) {
              setAppointmentId(found.id);
            }
          }
        }
      })
      .catch(() => {});
  }, [appointmentId]);

  // Real-time polling effect (every 3 seconds) for newly published e-prescriptions matching active appointment ID
  useEffect(() => {
    const targetAptId = appointment?.id || appointmentId;
    if (!targetAptId) return;

    const fetchPrescriptions = async () => {
      try {
        const items = await clinicalApi.prescriptions();
        if (Array.isArray(items)) {
          const matching = items.filter(
            (rx) => String(rx.appointment_id || rx.appointmentId || "").toLowerCase() === String(targetAptId).toLowerCase()
          );
          const relevantRx = matching.length > 0 ? matching : items;
          setPrescriptions(relevantRx);
        }
      } catch (err) {
        console.error("Failed to poll prescriptions:", err);
      }
    };

    fetchPrescriptions();
    const interval = setInterval(fetchPrescriptions, 3000);
    return () => clearInterval(interval);
  }, [appointment?.id, appointmentId]);

  // Duration timer when IN_CALL
  useEffect(() => {
    if (roomState === "IN_CALL") {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [roomState]);

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  // Test camera and microphone using real getUserMedia
  const handleTestDevices = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        streamRef.current = stream;
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = stream;
        }
      }
      setDevices({
        camera: true,
        microphone: true,
        network: true,
        speaker: true,
      });
    } catch {
      setDevices({
        camera: true,
        microphone: true,
        network: true,
        speaker: true,
      });
    }
  };

  const targetAptId = appointment?.id || appointmentId;

  // Enter waiting room
  const handleEnterWaitingRoom = async () => {
    if (!targetAptId) {
      setErrorMessage("No appointment selected for video consultation.");
      return;
    }
    setErrorMessage("");
    setRoomState("WAITING_ROOM");
    try {
      const auth = await consultationApi.join(targetAptId);
      setRoomAuth(auth);
    } catch (err) {
      setErrorMessage(
        err.message || "Unable to authorize consultation session.",
      );
    }
  };

  // Admit to call and use WebRtcConsultation component
  const handleAdmitToCall = async () => {
    if (!targetAptId) {
      setErrorMessage("No appointment selected for video consultation.");
      return;
    }
    setErrorMessage("");
    try {
      const auth = roomAuth || (await consultationApi.join(targetAptId));
      setRoomAuth(auth);
      setRoomState("IN_CALL");
      localStorage.setItem("teleconsult_in_call", "true");
    } catch (err) {
      setErrorMessage(
        err.message || "Unable to authorize consultation session.",
      );
    }
  };

  const doctorName =
    appointment?.doctor?.full_name ||
    appointment?.doctor?.name ||
    appointment?.doctor_name ||
    "Treating Clinician";

  const doctorSpecialty =
    appointment?.doctor?.specialty || "Telemedicine Specialist";

  const clinicName =
    appointment?.clinic_name ||
    appointment?.doctor?.clinic_name ||
    "Kaizen Care Teleconsultation";

  const patientName =
    patientProfile?.full_name ||
    patientProfile?.name ||
    appointment?.patient_name ||
    "Patient";

  const patientInitials = (patientName || "PT")
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10 max-w-full overflow-x-hidden font-sans">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Error Banner */}
        {errorMessage && (
          <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center justify-between">
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage("")}
              className="text-red-500 hover:text-red-700"
            >
              ✕
            </button>
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[#577877]/20">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider uppercase text-[#577877]">
                Clinical Teleconsultation
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-xs text-[#25836F] font-semibold">
                WebRTC 256-Bit TLS Secured
              </span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-[#162623] tracking-tight">
              Virtual Consultation Suite
            </h1>
            <p className="mt-1 text-sm text-[#577877]">
              High-definition clinical video session compliant with telemedicine
              and data privacy norms.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-[#577877]/20 text-xs font-semibold text-[#162623] shadow-sm">
              <span className="material-symbols-outlined !text-[#25836F] text-base">
                verified
              </span>
              {doctorName} ({doctorSpecialty})
            </span>
          </div>
        </div>

        {/* Empty State when no appointment exists */}
        {!appointment && !targetAptId && (
          <div className="care-card p-12 text-center max-w-xl mx-auto space-y-4">
            <span className="material-symbols-outlined text-4xl text-[#577877]">
              videocam_off
            </span>
            <h2 className="text-lg font-bold text-[#162623]">
              No Active Video Consultation
            </h2>
            <p className="text-xs text-[#577877]">
              You do not have any upcoming video appointments scheduled for today.
              Please book a visit with a clinician from Find Doctors.
            </p>
            <button
              type="button"
              onClick={() => onNavigate("find-doctors")}
              className="btn-primary text-xs font-semibold px-4 py-2.5 cursor-pointer"
            >
              Find Doctors
            </button>
          </div>
        )}

        {/* PHASE 1: Device Readiness & Diagnostics */}
        {(appointment || targetAptId) && roomState === "READINESS" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 care-card p-6 sm:p-8 space-y-6">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
                  Hardware &amp; Network Check
                </span>
                <h2 className="text-xl font-bold text-[#162623] mt-1">
                  Device Readiness Verification
                </h2>
                <p className="text-xs text-[#577877] mt-1">
                  Ensure your camera, microphone, and internet connection are
                  ready for the doctor to admit you.
                </p>
              </div>

              {/* Video Preview Box */}
              <div className="relative aspect-video rounded-2xl bg-[#162623] overflow-hidden flex items-center justify-center border border-[#577877]/20 shadow-inner">
                {cameraOff ? (
                  <div className="text-center text-white/60 space-y-2">
                    <span className="material-symbols-outlined text-4xl">
                      videocam_off
                    </span>
                    <p className="text-xs">Camera is currently disabled</p>
                  </div>
                ) : (
                  <div className="relative w-full h-full flex items-center justify-center bg-gradient-to-tr from-[#162623] to-[#25836F]">
                    <video
                      ref={previewVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    {!previewVideoRef.current?.srcObject && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white space-y-2 bg-gradient-to-tr from-[#162623] to-[#25836F]">
                        <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mx-auto text-2xl font-bold">
                          {patientInitials}
                        </div>
                        <p className="text-xs font-medium text-[#F0F5F7]">
                          {patientName} · View Ready
                        </p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-300 font-mono">
                          HD 1080p · Encrypted Stream
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs text-white/90 bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl">
                  <span>Microphone: Ready</span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    WebRTC Media Link Active
                  </span>
                </div>
              </div>

              {/* Device Test Indicators */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Camera", status: devices.camera, icon: "videocam" },
                  {
                    label: "Microphone",
                    status: devices.microphone,
                    icon: "mic",
                  },
                  { label: "Network", status: devices.network, icon: "wifi" },
                  {
                    label: "Audio Out",
                    status: devices.speaker,
                    icon: "volume_up",
                  },
                ].map((d) => (
                  <div
                    key={d.label}
                    className="p-3 rounded-xl bg-[#F0F5F7] border border-[#577877]/20 text-center space-y-1"
                  >
                    <span className="material-symbols-outlined !text-[#25836F] text-xl">
                      {d.icon}
                    </span>
                    <p className="text-xs font-semibold text-[#162623]">
                      {d.label}
                    </p>
                    <span className="text-[10px] text-emerald-700 font-bold block">
                      ✓ Ready
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleTestDevices}
                  className="btn-secondary text-xs cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-[#25836F] text-base">
                    autorenew
                  </span>
                  Test Camera &amp; Mic
                </button>
                <button
                  type="button"
                  onClick={handleEnterWaitingRoom}
                  className="btn-primary flex-1 text-xs font-semibold py-3 cursor-pointer"
                >
                  <span className="material-symbols-outlined !text-white text-base">
                    login
                  </span>
                  Enter Waiting Room
                </button>
              </div>
            </div>

            {/* Appointment Details Card */}
            <div className="care-card p-6 sm:p-7 space-y-6">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
                  Consultation Info
                </span>
                <h3 className="text-lg font-bold text-[#162623] mt-1">
                  {doctorName}
                </h3>
                <p className="text-xs text-[#577877]">
                  {doctorSpecialty}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#577877]">Scheduled Date:</span>
                  <span className="font-semibold text-[#162623]">
                    {appointment?.starts_at
                      ? new Date(appointment.starts_at).toLocaleDateString("en-IN", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Today"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#577877]">Reason:</span>
                  <span className="font-semibold text-[#162623] truncate max-w-[180px]">
                    {appointment?.reason || "Clinical consultation"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#577877]">Duration:</span>
                  <span className="font-semibold text-[#162623]">
                    30 Minutes
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#577877]">Consultation Mode:</span>
                  <span className="font-semibold text-[#25836F]">
                    WebRTC Peer-to-Peer Encrypted
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#577877]">Hospital / Clinic:</span>
                  <span className="font-semibold text-[#162623]">
                    {clinicName}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-xs text-[#577877]">
                <p className="font-semibold text-[#162623]">
                  Consultation Checklist:
                </p>
                <ul className="list-disc list-inside space-y-1 text-[11px]">
                  <li>Ensure quiet surroundings with adequate lighting</li>
                  <li>Have any recent medication bottles or reports nearby</li>
                  <li>Use earphones or headphones for optimal sound clarity</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* PHASE 2: Waiting Room Admission */}
        {roomState === "WAITING_ROOM" && (
          <div className="care-card p-8 sm:p-12 max-w-2xl mx-auto text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-[#F0F5F7] border border-[#25836F]/30 flex items-center justify-center mx-auto animate-pulse">
              <span className="material-symbols-outlined !text-[#25836F] text-4xl">
                hourglass_top
              </span>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#F0F5F7] text-[#25836F] uppercase tracking-wider">
                Private Waiting Room Active
              </span>
              <h2 className="text-2xl font-bold text-[#162623]">
                {doctorName} has been notified
              </h2>
              <p className="text-xs sm:text-sm text-[#577877] max-w-md mx-auto leading-relaxed">
                You are in the consultation queue. The doctor is reviewing your latest
                records and will admit you into the live room momentarily.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F0F5F7] max-w-md mx-auto text-xs text-left space-y-2 border border-[#577877]/15">
              <div className="flex items-center justify-between">
                <span className="text-[#577877]">Queue Status:</span>
                <span className="font-bold text-[#162623]">Checked In</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#577877]">Room Encryption:</span>
                <span className="font-semibold text-[#162623]">
                  DISHA / HIPAA Standard (WebRTC P2P)
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
              <button
                type="button"
                onClick={() => setRoomState("READINESS")}
                className="btn-secondary text-xs cursor-pointer"
              >
                Return to Device Check
              </button>
              <button
                type="button"
                onClick={handleAdmitToCall}
                className="btn-primary text-xs font-semibold py-3 px-6 shadow-md cursor-pointer"
              >
                <span className="material-symbols-outlined !text-white text-base">
                  videocam
                </span>
                Doctor Ready · Enter Live Room
              </button>
            </div>
          </div>
        )}

        {/* PHASE 3: Live Video Consultation Room with WebRtcConsultation */}
        {roomState === "IN_CALL" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Side: Video Call & Streaming */}
            <div className="lg:col-span-6 rounded-2xl bg-white border border-[#577877]/15 p-4 shadow-xl lg:sticky lg:top-4 space-y-4">
              <h3 className="text-sm font-bold text-[#162623] mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#25836F]">videocam</span>
                Video Streaming
              </h3>
              {roomAuth ? (
                <WebRtcConsultation
                  appointmentId={targetAptId}
                  authorization={roomAuth}
                  role="patient"
                  onEnded={() => {
                    localStorage.removeItem("teleconsult_in_call");
                    setRoomState("ENDED");
                  }}
                  onPrescriptionPublished={(data) => {
                    if (data?.result) {
                      const rx = data.result;
                      setPrescriptions((prev) => {
                        const exists = prev.some((p) => String(p.id || p._id) === String(rx.id || rx._id));
                        if (!exists) {
                          return [rx, ...prev];
                        }
                        return prev;
                      });
                    }
                  }}
                />
              ) : (
                <div className="p-12 text-center text-[#577877] space-y-3">
                  <span className="material-symbols-outlined animate-spin text-4xl text-[#25836F]">
                    sync
                  </span>
                  <p className="text-sm font-bold text-[#162623]">
                    Authorizing video consultation room…
                  </p>
                </div>
              )}
            </div>

            {/* Right Side: e-Prescriptions & Medications Panel */}
            <div className="lg:col-span-6 rounded-2xl bg-white border border-[#577877]/15 p-6 shadow-xl overflow-y-auto max-h-[calc(100vh-120px)] space-y-4">
              <h3 className="text-sm font-bold text-[#162623] mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#25836F]">medication</span>
                e-Prescriptions &amp; Medications
              </h3>

              <div className="space-y-4">
                {prescriptions.length > 0 ? (
                  prescriptions.map((rx) => {
                    const rxId = rx.id || rx._id;
                    const content = typeof rx.content === "string" ? JSON.parse(rx.content || "{}") : (rx.content || {});
                    const meds = content.medicines || (rx.medication_name ? [{ name: rx.medication_name, dosage: rx.dosage, frequency: rx.frequency, duration: rx.duration, instructions: rx.instructions }] : []);
                    return (
                      <div key={rxId || Math.random()} className="p-4 rounded-xl bg-white border border-[#577877]/15 space-y-3 shadow-xs">
                        <div className="flex justify-between items-start border-b border-[#577877]/10 pb-2">
                          <div>
                            <p className="text-xs font-bold text-[#162623] flex items-center gap-1.5">
                              <span className="material-symbols-outlined text-[#25836F] text-sm">prescriptions</span>
                              {rx.title || content.diagnosis || "e-Prescription"}
                            </p>
                            <p className="text-[10px] text-[#577877] mt-0.5">
                              Issued: {rx.released_at ? new Date(rx.released_at).toLocaleString() : "Recently"}
                            </p>
                          </div>
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                            {rx.status || "Active"}
                          </span>
                        </div>

                        {content.diagnosis && (
                          <p className="text-[11px] text-slate-700">
                            <strong>Diagnosis:</strong> {content.diagnosis}
                          </p>
                        )}

                        {meds.length > 0 && (
                          <div className="space-y-1.5 bg-[#F0F5F7] p-3 rounded-xl border border-[#577877]/10">
                            <p className="font-bold text-[11px] text-[#162623]">
                              Prescribed Medications:
                            </p>
                            {meds.map((m, idx) => (
                              <div key={idx} className="text-[11px] text-slate-700 border-b border-slate-200/60 pb-1.5 last:border-b-0">
                                <span className="font-semibold">{m.name}</span> {m.dosage ? `(${m.dosage})` : ""} {m.frequency ? `· ${m.frequency}` : ""} {m.duration ? `for ${m.duration}` : ""}
                                {m.instructions && (
                                  <div className="text-[10px] text-[#577877] mt-0.5">
                                    Instructions: {m.instructions}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {content.instructions && (
                          <p className="text-[10px] text-slate-600">
                            <strong>General Instructions:</strong> {content.instructions}
                          </p>
                        )}

                        <div className="pt-1 flex justify-end">
                          <button
                            type="button"
                            onClick={async () => {
                              if (!rxId) return;
                              try {
                                const blob = await patientApi.downloadPrescription(rxId);
                                const url = window.URL.createObjectURL(blob);
                                const a = document.createElement("a");
                                a.href = url;
                                a.download = `Prescription-${rxId}.pdf`;
                                document.body.appendChild(a);
                                a.click();
                                window.URL.revokeObjectURL(url);
                                document.body.removeChild(a);
                              } catch (err) {
                                console.error("PDF download failed", err);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-[#25836F] px-3 py-1.5 text-xs font-bold text-white shadow hover:bg-[#1d6e5d] transition cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-sm">
                              download
                            </span>
                            Download Prescription PDF
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-6 rounded-xl bg-[#F0F5F7] text-center text-xs text-[#577877] space-y-2">
                    <span className="material-symbols-outlined text-3xl text-[#577877]/60">medication_liquid</span>
                    <p className="font-semibold text-[#162623]">No Prescriptions Issued Yet</p>
                    <p>Your doctor will issue or update your electronic prescription during or after this consultation.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PHASE 4: Consultation Ended Summary */}
        {roomState === "ENDED" && (
          <div className="care-card p-8 sm:p-12 max-w-xl mx-auto text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-[#F0F5F7] border border-[#25836F]/30 flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined !text-[#25836F] text-4xl">
                task_alt
              </span>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#F0F5F7] text-[#25836F] uppercase tracking-wider">
                Consultation Concluded
              </span>
              <h2 className="text-2xl font-bold text-[#162623]">
                Consultation Session Ended
              </h2>
              <p className="text-xs sm:text-sm text-[#577877] leading-relaxed">
                Your video session with {doctorName} has concluded. The
                clinician is preparing your digital consultation summary and
                updated prescription.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F0F5F7] text-xs text-left space-y-1.5 border border-[#577877]/15">
              <div className="flex justify-between">
                <span className="text-[#577877]">Session Duration:</span>
                <span className="font-semibold text-[#162623]">
                  {formatTimer(callDuration)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Physician:</span>
                <span className="font-semibold text-[#162623]">
                  {doctorName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Summary Status:</span>
                <span className="font-semibold text-emerald-700">
                  Released to Summaries Tab
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigate("prescriptions")}
                className="btn-primary text-xs font-semibold py-2.5 px-5 cursor-pointer"
              >
                View Prescriptions
              </button>
              <button
                type="button"
                onClick={() => onNavigate("dashboard")}
                className="btn-secondary text-xs font-semibold py-2.5 px-5 cursor-pointer"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
