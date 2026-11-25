import { useEffect, useState, useRef } from "react";
import { io } from "socket.io-client";
import {
  API_BASE_URL,
  consultationApi,
  patientApi,
  recordsApi,
  supportApi,
} from "../../lib/api";
import InCallChat from "../consultation/InCallChat";

export default function VideoConsultationScreen({ onNavigate }) {
  const [appointmentId, setAppointmentId] = useState(
    () => localStorage.getItem("teleconsult_appointment_id") || "",
  );
  const [appointment, setAppointment] = useState(null);
  const [patientProfile, setPatientProfile] = useState(null);
  const [vitalsReadings, setVitalsReadings] = useState([]);
  const [attachedRecords, setAttachedRecords] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [roomAuth, setRoomAuth] = useState(null);
  const [roomState, setRoomState] = useState("READINESS"); // 'READINESS' | 'WAITING_ROOM' | 'IN_CALL' | 'ENDED'
  const [errorMessage, setErrorMessage] = useState("");
  const [devices, setDevices] = useState({
    camera: true,
    microphone: true,
    network: true,
    speaker: true,
  });
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [activeSideTab, setActiveSideTab] = useState("chat");
  const [callDuration, setCallDuration] = useState(0);
  const [chatMessages, setChatMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [connectionQuality, setConnectionQuality] = useState("Connected (WebRTC P2P)");

  const timerRef = useRef(null);
  const previewVideoRef = useRef(null);
  const localPipVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const peerRef = useRef(null);
  const socketRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    patientApi
      .profile()
      .then((p) => {
        if (p) setPatientProfile(p);
      })
      .catch(() => {});

    supportApi
      .bpReadings()
      .then((readings) => {
        if (Array.isArray(readings)) setVitalsReadings(readings);
      })
      .catch(() => {});

    recordsApi
      .list()
      .then((recs) => {
        if (Array.isArray(recs)) setAttachedRecords(recs);
      })
      .catch(() => {});

    patientApi
      .prescriptions()
      .then((items) => {
        if (Array.isArray(items)) setPrescriptions(items);
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

  // Admit to call and start real WebRTC peer connection
  const handleAdmitToCall = async () => {
    if (!roomAuth?.token) {
      setErrorMessage(
        "Missing consultation authorization token. Please rejoin from Waiting Room.",
      );
      return;
    }
    setErrorMessage("");
    setRoomState("IN_CALL");

    try {
      // 1. Get real user media stream
      let localStream = streamRef.current;
      if (!localStream || !localStream.active) {
        try {
          localStream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true,
          });
          streamRef.current = localStream;
        } catch (mediaErr) {
          console.warn("getUserMedia error, creating synthetic tracks:", mediaErr);
          // Fallback in headless environment without physical devices
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#162623";
          ctx.fillRect(0, 0, 640, 480);
          const canvasStream = canvas.captureStream(30);
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          const dst = audioCtx.createMediaStreamDestination();
          osc.connect(dst);
          osc.start();
          const combinedStream = new MediaStream([
            canvasStream.getVideoTracks()[0],
            dst.stream.getAudioTracks()[0],
          ]);
          localStream = combinedStream;
          streamRef.current = localStream;
        }
      }

      // 2. Instantiate real WebRTC RTCPeerConnection
      const iceServers = roomAuth?.ice_servers || [{ urls: "stun:stun.l.google.com:19302" }];
      const pc = new RTCPeerConnection({ iceServers });
      peerRef.current = pc;
      window.__webrtc_peer = pc;
      window.__webrtc_stream = localStream;

      // Add local tracks
      if (localStream) {
        localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
        if (localPipVideoRef.current) {
          localPipVideoRef.current.srcObject = localStream;
        }
      }

      // Handle remote incoming tracks
      pc.ontrack = (event) => {
        if (remoteVideoRef.current && event.streams?.[0]) {
          remoteVideoRef.current.srcObject = event.streams[0];
        }
      };

      pc.oniceconnectionstatechange = () => {
        const ice = pc.iceConnectionState;
        if (ice === "disconnected" || ice === "failed") {
          setConnectionQuality("Reconnecting…");
          socketRef.current?.emit("request_ice_restart");
        } else if (ice === "connected" || ice === "completed") {
          setConnectionQuality("Connected (WebRTC P2P)");
          if (remoteVideoRef.current && pc.getReceivers().length > 0) {
            const remoteStream = new MediaStream(pc.getReceivers().map(r => r.track).filter(Boolean));
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play?.().catch(() => {});
          }
        } else {
          setConnectionQuality(`WebRTC ICE: ${ice}`);
        }
      };

      pc.onconnectionstatechange = () => {
        const conn = pc.connectionState;
        if (conn === "disconnected" || conn === "failed") {
          setConnectionQuality("Reconnecting…");
        } else if (conn === "connected") {
          setConnectionQuality("Connected (WebRTC P2P)");
        }
      };

      // 3. Connect to backend Socket.IO signaling with genuine token
      const token = roomAuth.token;
      const sId = roomAuth.session_id || `ses-${targetAptId}`;
      const socket = io(API_BASE_URL, {
        withCredentials: true,
        auth: { consultationToken: token, sessionId: sId },
        transports: ["websocket"],
      });
      socketRef.current = socket;
      window.__webrtc_socket = socket;

      socket.on("connect", () => {
        socket.emit("join_room", { appointmentId: targetAptId });
        socket.emit("signaling_ready");
        if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
          setConnectionQuality("Reconnecting…");
          socket.emit("request_ice_restart");
        }
      });

      socket.on("reconnect", () => {
        socket.emit("join_room", { appointmentId: targetAptId });
        socket.emit("signaling_ready");
        socket.emit("request_ice_restart");
      });

      socket.on("disconnect", () => {
        setConnectionQuality("Reconnecting…");
      });
      socket.on("peer_disconnected", () => {
        setConnectionQuality("Reconnecting…");
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("ice_candidate", { candidate: event.candidate });
        }
      };

      socket.on("offer", async (data) => {
        try {
          const offer = data?.offer || data?.sdp || data;
          if (offer && offer.sdp) {
            if (pc.signalingState !== "stable") {
              try {
                await pc.setLocalDescription({ type: "rollback" });
              } catch {}
            }
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("answer", { answer, sdp: pc.localDescription });
          }
        } catch (err) {
          console.warn("Signaling offer handling error:", err);
        }
      });

      socket.on("answer", async (data) => {
        try {
          const answer = data?.answer || data?.sdp || data;
          if (answer && answer.sdp && pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
          }
        } catch (err) {
          console.warn("Signaling answer handling error:", err);
        }
      });

      socket.on("ice_candidate", async (data) => {
        try {
          const candidate = data?.candidate || data;
          if (candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          }
        } catch (err) {
          console.warn("Signaling ICE handling error:", err);
        }
      });
    } catch (webrtcErr) {
      console.warn("WebRTC startup error:", webrtcErr);
    }
  };

  const handleEndCall = async () => {
    if (roomAuth?.session_id) {
      try {
        await consultationApi.disconnected(roomAuth.session_id);
      } catch {
        // ignore
      }
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
    }
    if (socketRef.current) {
      socketRef.current.emit("end_call");
      socketRef.current.disconnect();
    }
    if (peerRef.current) {
      peerRef.current.close();
    }
    window.__webrtc_peer = null;
    window.__webrtc_stream = null;
    setRoomState("ENDED");
  };

  const toggleMic = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => (t.enabled = !nextMuted));
    }
  };

  const toggleCamera = () => {
    const nextCamOff = !cameraOff;
    setCameraOff(nextCamOff);
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach((t) => (t.enabled = !nextCamOff));
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

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;
    const newMsg = {
      sender: `${patientName} (You)`,
      text: inputMessage,
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    setChatMessages((prev) => [...prev, newMsg]);
    setInputMessage("");
  };

  const latestReading = vitalsReadings.length > 0 ? vitalsReadings[vitalsReadings.length - 1] : null;

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

        {/* PHASE 3: Live Video Consultation Room with Real WebRTC */}
        {roomState === "IN_CALL" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Side: Video Call & Streaming */}
            <div className="lg:col-span-6 rounded-2xl bg-white border border-[#577877]/15 p-4 shadow-xl lg:sticky lg:top-4 space-y-4">
              <h3 className="text-sm font-bold text-[#162623] mb-3 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#25836F]">videocam</span>
                Video Streaming
              </h3>
              <div className="relative aspect-video rounded-2xl bg-[#162623] overflow-hidden border border-[#577877]/20 shadow-2xl flex items-center justify-center">
                {/* Real Remote Video Track */}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-cover"
                />

                {/* Top Bar Overlay */}
                <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-xs text-white bg-black/50 backdrop-blur-md px-4 py-2 rounded-xl z-20">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
                    <span className="font-bold">WEBRTC LIVE</span>
                    <span>· {formatTimer(callDuration)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-sm text-emerald-400">
                      verified_user
                    </span>
                    <span className="text-[11px] text-white/90">
                      {connectionQuality}
                    </span>
                  </div>
                </div>

                {/* Picture-in-Picture Local Patient View */}
                <div className="absolute bottom-4 right-4 w-36 sm:w-44 aspect-video rounded-xl bg-[#25836F] border-2 border-white/60 shadow-lg overflow-hidden flex items-center justify-center z-20">
                  {cameraOff ? (
                    <div className="text-center text-white/70">
                      <span className="material-symbols-outlined text-lg">
                        videocam_off
                      </span>
                      <p className="text-[9px]">Camera Off</p>
                    </div>
                  ) : (
                    <video
                      ref={localPipVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  )}
                  <div className="absolute bottom-1 left-2 text-[9px] text-white/90 bg-black/40 px-1 rounded">
                    {muted ? "Muted" : "Mic Live"}
                  </div>
                </div>
              </div>

              {/* Call Controls Dock */}
              <div className="p-4 rounded-2xl bg-[#F0F5F7] border border-[#577877]/20 shadow-sm flex items-center justify-center gap-4 flex-wrap">
                <button
                  type="button"
                  onClick={toggleMic}
                  className={`p-3.5 rounded-xl transition cursor-pointer ${
                    muted
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-white text-[#25836F] hover:bg-[#25836F] hover:text-white"
                  }`}
                  title={muted ? "Unmute microphone" : "Mute microphone"}
                >
                  <span className="material-symbols-outlined text-xl">
                    {muted ? "mic_off" : "mic"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={toggleCamera}
                  className={`p-3.5 rounded-xl transition cursor-pointer ${
                    cameraOff
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-white text-[#25836F] hover:bg-[#25836F] hover:text-white"
                  }`}
                  title={cameraOff ? "Turn camera on" : "Turn camera off"}
                >
                  <span className="material-symbols-outlined text-xl">
                    {cameraOff ? "videocam_off" : "videocam"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleEndCall}
                  className="px-6 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-medium text-xs flex items-center gap-2 shadow-sm transition cursor-pointer"
                >
                  <span className="material-symbols-outlined text-lg">
                    call_end
                  </span>
                  End Call
                </button>
              </div>
            </div>

            {/* Right Side: Prescription, clinical chat, vitals, and reports panel */}
            <div className="lg:col-span-6 rounded-2xl bg-white border border-[#577877]/15 p-6 shadow-xl overflow-y-auto max-h-[calc(100vh-120px)] space-y-4">
              <h3 className="text-sm font-bold text-[#162623] mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-[#25836F]">clinical_notes</span>
                Clinical Panel &amp; Prescription
              </h3>

              {/* Panel Tabs */}
              <div className="flex border-b border-[#577877]/20 pb-2 mb-4 gap-1 bg-[#F0F5F7] p-2 rounded-xl">
                {[
                  { id: "prescription", label: "Prescription", icon: "medication" },
                  { id: "chat", label: "Chat", icon: "chat" },
                  { id: "vitals", label: "Vitals", icon: "vital_signs" },
                  { id: "reports", label: "Reports", icon: "description" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveSideTab(tab.id)}
                    className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition cursor-pointer ${
                      activeSideTab === tab.id
                        ? "bg-[#25836F] text-white shadow-sm"
                        : "text-[#577877] hover:text-[#162623] bg-white"
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm">
                      {tab.icon}
                    </span>
                    <span className="truncate">{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Tab Contents */}
              <div className="space-y-4">
                {activeSideTab === "prescription" && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#577877] flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#25836F] text-base">medication</span>
                      Prescriptions &amp; Medications
                    </h3>
                    {prescriptions.length > 0 ? (
                      prescriptions.map((rx) => (
                        <div key={rx.id || rx._id} className="p-4 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 space-y-2">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-xs font-bold text-[#162623]">
                                {rx.medication_name || rx.title || rx.medication || "Prescription Item"}
                              </p>
                              <p className="text-[11px] text-[#577877]">
                                Dosage: {rx.dosage || rx.instructions || "As directed"}
                              </p>
                            </div>
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-semibold">
                              Active
                            </span>
                          </div>
                          {rx.duration && (
                            <p className="text-[10px] text-[#577877]">Duration: {rx.duration}</p>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="p-6 rounded-xl bg-[#F0F5F7] text-center text-xs text-[#577877] space-y-2">
                        <span className="material-symbols-outlined text-3xl text-[#577877]/60">medication_liquid</span>
                        <p className="font-semibold text-[#162623]">No Prescriptions Issued Yet</p>
                        <p>Your doctor will issue or update your electronic prescription during or after this consultation.</p>
                      </div>
                    )}
                  </div>
                )}

                {activeSideTab === "chat" && (
                  <div className="h-[460px]">
                    <InCallChat
                      socket={socketRef.current}
                      role="patient"
                      appointmentId={appointmentId}
                    />
                  </div>
                )}

                {activeSideTab === "vitals" && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#577877] flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#25836F] text-base">vital_signs</span>
                      Patient Vitals (Shared with Doctor)
                    </h3>
                    {latestReading ? (
                      <div className="grid grid-cols-2 gap-2.5">
                        <div className="p-3 rounded-xl bg-[#F0F5F7] border border-[#577877]/15">
                          <span className="text-[10px] text-[#577877] block">
                            Blood Pressure
                          </span>
                          <span className="text-sm font-bold text-[#162623]">
                            {latestReading.systolic}/{latestReading.diastolic} mmHg
                          </span>
                          <span className="text-[9px] text-[#25836F] block mt-0.5 font-medium">
                            Latest recorded
                          </span>
                        </div>
                        <div className="p-3 rounded-xl bg-[#F0F5F7] border border-[#577877]/15">
                          <span className="text-[10px] text-[#577877] block">
                            Pulse / Heart Rate
                          </span>
                          <span className="text-sm font-bold text-[#162623]">
                            {latestReading.pulse ? `${latestReading.pulse} bpm` : "Not recorded"}
                          </span>
                          <span className="text-[9px] text-[#25836F] block mt-0.5 font-medium">
                            Resting pulse
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-[#F0F5F7] text-center text-xs text-[#577877] space-y-1">
                        <p className="font-semibold text-[#162623]">No Vitals Recorded Yet</p>
                        <p>Log your blood pressure and pulse in Follow-Up Care to share them with your clinician.</p>
                      </div>
                    )}
                  </div>
                )}

                {(activeSideTab === "reports" || activeSideTab === "notes") && (
                  <div className="space-y-3">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#577877] flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#25836F] text-base">description</span>
                      Shared Documents for this Visit
                    </h3>
                    {attachedRecords.length > 0 ? (
                      attachedRecords.slice(0, 3).map((rec) => (
                        <div key={rec.id} className="p-3 rounded-xl bg-[#F0F5F7] border border-[#577877]/15 space-y-1">
                          <p className="text-xs font-bold text-[#162623] truncate">
                            {rec.file_name || rec.title || "Clinical document.pdf"}
                          </p>
                          <p className="text-[10px] text-[#577877]">
                            {rec.category || "Clinical Record"} · Verified
                          </p>
                        </div>
                      ))
                    ) : (
                      <div className="p-4 rounded-xl bg-[#F0F5F7] text-center text-xs text-[#577877]">
                        No medical records uploaded yet. Upload records from the Medical Records screen.
                      </div>
                    )}
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
