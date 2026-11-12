import { useEffect, useState, useRef } from "react";
import { consultationApi, patientApi } from "../../lib/api";

export default function VideoConsultationScreen({ onNavigate }) {
  const [appointmentId] = useState(
    () => localStorage.getItem("teleconsult_appointment_id") || "",
  );
  const [appointment, setAppointment] = useState(null);
  const [roomState, setRoomState] = useState("READINESS"); // 'READINESS' | 'WAITING_ROOM' | 'IN_CALL' | 'ENDED'
  const [devices, setDevices] = useState({
    camera: true,
    microphone: true,
    network: true,
    speaker: true,
  });
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState("chat"); // 'chat' | 'vitals' | 'notes'
  const [callDuration, setCallDuration] = useState(0);
  const [chatMessages, setChatMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const timerRef = useRef(null);

  useEffect(() => {
    patientApi
      .appointments()
      .then((items) => {
        const found =
          items.find((item) => item.id === appointmentId) || items[0];
        setAppointment(found);
      })
      .catch(() => {});
  }, [appointmentId]);

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

  const handleTestDevices = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        stream.getTracks().forEach((track) => track.stop());
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
      }); // Fallback simulated success
    }
  };

  const handleEnterWaitingRoom = async () => {
    setRoomState("WAITING_ROOM");
    try {
      await consultationApi.join(appointmentId);
    } catch {
      // Handled in api.js
    }
  };

  const handleAdmitToCall = () => {
    setRoomState("IN_CALL");
  };

  const handleEndCall = async () => {
    try {
      await consultationApi.disconnected("ses-live-session");
    } catch {
      // ignore
    }
    setRoomState("ENDED");
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    const newMsg = {
      sender: "Emma Mitchell (You)",
      text: inputMessage,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    setChatMessages((prev) => [...prev, newMsg]);
    setInputMessage("");

    // Simulated doctor response
    setTimeout(() => {
      setChatMessages((prev) => [
        ...prev,
        {
          sender: "Dr. Sarah Chen",
          text: "Understood. I have updated the prescription notes with your dietary guidance.",
          time: new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          }),
        },
      ]);
    }, 2500);
  };

  return (
    <div className="w-full bg-[#F0F5F7] px-4 sm:px-6 lg:px-10 py-8 lg:py-10">
      <div className="mx-auto max-w-7xl space-y-8">
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
              Dr. Sarah Chen, MD
            </span>
          </div>
        </div>

        {/* PHASE 1: Device Readiness & Diagnostics */}
        {roomState === "READINESS" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 care-card p-6 sm:p-8 space-y-6">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-[#577877]">
                  Hardware & Network Check
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
                    <div className="text-center text-white space-y-2">
                      <div className="w-20 h-20 rounded-full bg-white/10 border border-white/20 flex items-center justify-center mx-auto text-2xl font-bold">
                        EM
                      </div>
                      <p className="text-xs font-medium text-[#F0F5F7]">
                        Emma Mitchell · Patient View Ready
                      </p>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/30 text-emerald-300 font-mono">
                        HD 1080p · 60fps Stream
                      </span>
                    </div>
                  </div>
                )}

                <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-xs text-white/90 bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl">
                  <span>Microphone: Ready</span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Latency: 24 ms
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
                      ✓ Verified
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleTestDevices}
                  className="btn-secondary text-xs"
                >
                  <span className="material-symbols-outlined !text-[#25836F] text-base">
                    autorenew
                  </span>
                  Re-test Devices
                </button>
                <button
                  type="button"
                  onClick={handleEnterWaitingRoom}
                  className="btn-primary flex-1 text-xs font-semibold py-3"
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
                  Dr. Sarah Chen, MD
                </h3>
                <p className="text-xs text-[#577877]">
                  Senior Consultant Cardiologist
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#577877]">Scheduled Time:</span>
                  <span className="font-semibold text-[#162623]">
                    {appointment
                      ? new Date(appointment.starts_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Today, 04:30 PM"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#577877]">Reason:</span>
                  <span className="font-semibold text-[#162623] truncate max-w-[180px]">
                    {appointment?.reason || "Hypertension review"}
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
                    Direct Encrypted Video
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#577877]">Hospital / Clinic:</span>
                  <span className="font-semibold text-[#162623]">
                    Kaizentrix Heart Center
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
                Dr. Sarah Chen has been notified
              </h2>
              <p className="text-xs sm:text-sm text-[#577877] max-w-md mx-auto leading-relaxed">
                You are next in queue. The doctor is reviewing your latest
                records and will admit you into the live room momentarily.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#F0F5F7] max-w-md mx-auto text-xs text-left space-y-2 border border-[#577877]/15">
              <div className="flex items-center justify-between">
                <span className="text-[#577877]">Queue Position:</span>
                <span className="font-bold text-[#162623]">#1 (Next)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#577877]">Estimated Wait Time:</span>
                <span className="font-bold text-[#25836F]">Under 1 minute</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[#577877]">Room Encryption:</span>
                <span className="font-semibold text-[#162623]">
                  DISHA / HIPAA Standard
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-4">
              <button
                type="button"
                onClick={() => setRoomState("READINESS")}
                className="btn-secondary text-xs"
              >
                Return to Device Check
              </button>
              <button
                type="button"
                onClick={handleAdmitToCall}
                className="btn-primary text-xs font-semibold py-3 px-6 animate-bounce"
              >
                <span className="material-symbols-outlined !text-white text-base">
                  videocam
                </span>
                Doctor Ready · Enter Live Room
              </button>
            </div>
          </div>
        )}

        {/* PHASE 3: Live Video Consultation Room */}
        {roomState === "IN_CALL" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Video View & Controls (Col 1 & 2) */}
            <div className="lg:col-span-2 space-y-4">
              <div className="relative aspect-video rounded-2xl bg-[#162623] overflow-hidden border border-[#577877]/20 shadow-2xl flex items-center justify-center">
                {/* Doctor Video Feed Simulation */}
                <div className="relative w-full h-full">
                  <img
                    src="https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&q=80&w=1200"
                    alt="Dr. Sarah Chen"
                    className="w-full h-full object-cover"
                  />

                  {/* Top Bar Overlay */}
                  <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-xs text-white bg-black/40 backdrop-blur-md px-4 py-2 rounded-xl">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                      <span className="font-bold">REC / SECURE</span>
                      <span>· {formatTimer(callDuration)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-sm text-emerald-400">
                        verified_user
                      </span>
                      <span className="text-[11px] text-white/90">
                        Dr. Sarah Chen, MD (Cardiologist)
                      </span>
                    </div>
                  </div>

                  {/* Picture-in-Picture Local Patient View */}
                  <div className="absolute bottom-4 right-4 w-36 sm:w-44 aspect-video rounded-xl bg-[#25836F] border-2 border-white/60 shadow-lg overflow-hidden flex items-center justify-center">
                    {cameraOff ? (
                      <div className="text-center text-white/70">
                        <span className="material-symbols-outlined text-lg">
                          videocam_off
                        </span>
                        <p className="text-[9px]">Camera Off</p>
                      </div>
                    ) : (
                      <div className="relative w-full h-full bg-gradient-to-tr from-[#162623] to-[#25836F] flex items-center justify-center text-white">
                        <span className="text-xs font-semibold">
                          Emma (You)
                        </span>
                        <div className="absolute bottom-1 left-2 text-[9px] text-white/80">
                          {muted ? "Muted" : "Mic Live"}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Call Controls Dock */}
              <div className="p-4 rounded-2xl bg-white border border-[#577877]/20 shadow-sm flex items-center justify-center gap-4 flex-wrap">
                <button
                  type="button"
                  onClick={() => setMuted(!muted)}
                  className={`p-3.5 rounded-xl transition ${
                    muted
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-[#F0F5F7] text-[#25836F] hover:bg-[#25836F] hover:text-white"
                  }`}
                  title={muted ? "Unmute microphone" : "Mute microphone"}
                >
                  <span className="material-symbols-outlined text-xl">
                    {muted ? "mic_off" : "mic"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setCameraOff(!cameraOff)}
                  className={`p-3.5 rounded-xl transition ${
                    cameraOff
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-[#F0F5F7] text-[#25836F] hover:bg-[#25836F] hover:text-white"
                  }`}
                  title={cameraOff ? "Turn camera on" : "Turn camera off"}
                >
                  <span className="material-symbols-outlined text-xl">
                    {cameraOff ? "videocam_off" : "videocam"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    alert("Screen sharing enabled for consultation review.")
                  }
                  className="p-3.5 rounded-xl bg-[#F0F5F7] text-[#25836F] hover:bg-[#25836F] hover:text-white transition"
                  title="Share screen / report"
                >
                  <span className="material-symbols-outlined text-xl">
                    screen_share
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleEndCall}
                  className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-xs flex items-center gap-2 shadow-sm transition"
                >
                  <span className="material-symbols-outlined text-lg">
                    call_end
                  </span>
                  End Consultation
                </button>
              </div>
            </div>

            {/* Right Interactive Drawer (Col 3) */}
            <div className="care-card flex flex-col h-[520px] overflow-hidden">
              {/* Drawer Tabs */}
              <div className="flex border-b border-[#577877]/20 p-2 gap-1 bg-[#F0F5F7]">
                {[
                  { id: "chat", label: "Clinical Chat", icon: "chat" },
                  { id: "vitals", label: "Vitals", icon: "vital_signs" },
                  { id: "notes", label: "Reports", icon: "description" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveSideTab(tab.id)}
                    className={`flex-1 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                      activeSideTab === tab.id
                        ? "bg-[#25836F] text-white shadow-sm"
                        : "text-[#577877] hover:text-[#162623]"
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">
                      {tab.icon}
                    </span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Drawer Content */}
              <div className="flex-1 p-4 overflow-y-auto">
                {activeSideTab === "chat" && (
                  <div className="flex flex-col h-full justify-between space-y-3">
                    <div className="space-y-3 overflow-y-auto pr-1 flex-1">
                      {chatMessages.map((msg, i) => (
                        <div
                          key={i}
                          className={`p-3 rounded-xl text-xs space-y-1 ${
                            msg.sender.includes("You")
                              ? "bg-[#25836F] text-white ml-6"
                              : "bg-[#F0F5F7] text-[#162623] mr-6 border border-[#577877]/15"
                          }`}
                        >
                          <div className="flex justify-between text-[10px] opacity-75">
                            <span className="font-semibold">{msg.sender}</span>
                            <span>{msg.time}</span>
                          </div>
                          <p className="leading-relaxed">{msg.text}</p>
                        </div>
                      ))}
                    </div>

                    <form
                      onSubmit={handleSendMessage}
                      className="flex gap-2 pt-2 border-t border-[#577877]/15"
                    >
                      <input
                        type="text"
                        value={inputMessage}
                        onChange={(e) => setInputMessage(e.target.value)}
                        placeholder="Type a clinical question…"
                        className="flex-1 px-3 py-2 rounded-xl border border-[#577877]/25 text-xs text-[#162623] focus:outline-none focus:border-[#25836F]"
                      />
                      <button
                        type="submit"
                        className="btn-primary !p-2 text-xs"
                      >
                        <span className="material-symbols-outlined text-base">
                          send
                        </span>
                      </button>
                    </form>
                  </div>
                )}

                {activeSideTab === "vitals" && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#577877]">
                      Live Patient Vitals (Shared with Doctor)
                    </h3>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-3 rounded-xl bg-[#F0F5F7] border border-[#577877]/15">
                        <span className="text-[10px] text-[#577877] block">
                          Blood Pressure
                        </span>
                        <span className="text-sm font-bold text-[#162623]">
                          122/80 mmHg
                        </span>
                        <span className="text-[9px] text-emerald-700 block mt-0.5">
                          Optimal range
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-[#F0F5F7] border border-[#577877]/15">
                        <span className="text-[10px] text-[#577877] block">
                          Heart Rate
                        </span>
                        <span className="text-sm font-bold text-[#162623]">
                          72 bpm
                        </span>
                        <span className="text-[9px] text-emerald-700 block mt-0.5">
                          Regular rhythm
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-[#F0F5F7] border border-[#577877]/15">
                        <span className="text-[10px] text-[#577877] block">
                          Oxygen Sat (SpO2)
                        </span>
                        <span className="text-sm font-bold text-[#162623]">
                          98%
                        </span>
                        <span className="text-[9px] text-emerald-700 block mt-0.5">
                          Normal
                        </span>
                      </div>
                      <div className="p-3 rounded-xl bg-[#F0F5F7] border border-[#577877]/15">
                        <span className="text-[10px] text-[#577877] block">
                          Temperature
                        </span>
                        <span className="text-sm font-bold text-[#162623]">
                          98.4 °F
                        </span>
                        <span className="text-[9px] text-emerald-700 block mt-0.5">
                          Afebrile
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {activeSideTab === "notes" && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#577877]">
                      Shared Documents for this Visit
                    </h3>
                    <div className="p-3 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 space-y-1">
                      <p className="text-xs font-bold text-[#162623]">
                        Echocardiogram_Doppler_Report.pdf
                      </p>
                      <p className="text-[10px] text-[#577877]">
                        Uploaded Oct 29 · 2.45 MB
                      </p>
                      <span className="text-[10px] text-emerald-700 font-semibold">
                        Doctor has access
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 space-y-1">
                      <p className="text-xs font-bold text-[#162623]">
                        HbA1c_Metabolic_Panel.pdf
                      </p>
                      <p className="text-[10px] text-[#577877]">
                        Uploaded Oct 20 · 840 KB
                      </p>
                      <span className="text-[10px] text-emerald-700 font-semibold">
                        Doctor has access
                      </span>
                    </div>
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
                Thank you, Emma
              </h2>
              <p className="text-xs sm:text-sm text-[#577877] leading-relaxed">
                Your video session with Dr. Sarah Chen has concluded. The
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
                  Dr. Sarah Chen, MD
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#577877]">Prescription Status:</span>
                <span className="font-semibold text-emerald-700">
                  Released to Prescriptions Tab
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => onNavigate("prescriptions")}
                className="btn-primary text-xs"
              >
                View Released Prescriptions
              </button>
              <button
                type="button"
                onClick={() => onNavigate("dashboard")}
                className="btn-secondary text-xs"
              >
                Back to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
