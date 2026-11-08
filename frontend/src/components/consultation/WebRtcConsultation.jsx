import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { API_BASE_URL, consultationApi } from "../../lib/api";

const fallbackIceServers = [
  ...(import.meta.env.VITE_STUN_URL
    ? [{ urls: import.meta.env.VITE_STUN_URL }]
    : []),
  ...(import.meta.env.VITE_TURN_URL
    ? [
        {
          urls: import.meta.env.VITE_TURN_URL,
          username: import.meta.env.VITE_TURN_USERNAME,
          credential: import.meta.env.VITE_TURN_CREDENTIAL,
        },
      ]
    : []),
];

export default function WebRtcConsultation({
  appointmentId,
  authorization,
  role = "patient",
  onEnded,
}) {
  const localVideo = useRef(null);
  const remoteVideo = useRef(null);
  const streamRef = useRef(null);
  const peerRef = useRef(null);
  const socketRef = useRef(null);
  const pendingIceRef = useRef([]);
  const [status, setStatus] = useState("connecting");
  const [error, setError] = useState("");
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);

  useEffect(() => {
    let active = true;
    let cleaned = false;
    const diagnostic = (event, value) => {
      if (import.meta.env.DEV)
        console.debug(`[WebRTC:${role}] ${event}`, value ?? "");
    };
    const setRemoteStream = (stream) => {
      if (!remoteVideo.current || !stream) return;
      remoteVideo.current.srcObject = stream;
      remoteVideo.current
        .play?.()
        .catch(() => diagnostic("remote-play-blocked"));
    };
    const start = async () => {
      try {
        const room =
          authorization ||
          (await (role === "doctor"
            ? import("../../lib/api").then(({ doctorApi }) =>
                doctorApi.joinConsultation(appointmentId),
              )
            : consultationApi.join(appointmentId)));
        if (!active) return;
        const ice = await consultationApi
          .config()
          .catch(() => ({ ice_servers: fallbackIceServers }));
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (!stream.getAudioTracks().length || !stream.getVideoTracks().length)
          throw new Error("Camera and microphone tracks are required.");
        streamRef.current = stream;
        if (localVideo.current) localVideo.current.srcObject = stream;
        const peer = new RTCPeerConnection({
          iceServers: ice.ice_servers || fallbackIceServers,
        });
        peerRef.current = peer;
        stream.getTracks().forEach((track) => peer.addTrack(track, stream));
        peer.ontrack = (event) => {
          diagnostic("track", event.track.kind);
          setRemoteStream(event.streams?.[0] || new MediaStream([event.track]));
        };
        peer.onicecandidate = (event) => {
          if (event.candidate)
            socketRef.current?.emit("ice_candidate", {
              candidate: event.candidate,
            });
        };
        peer.onicecandidateerror = (event) =>
          diagnostic("ice-candidate-error", event.errorCode);
        peer.oniceconnectionstatechange = () =>
          diagnostic("ice-state", peer.iceConnectionState);
        peer.onsignalingstatechange = () =>
          diagnostic("signaling-state", peer.signalingState);
        peer.onconnectionstatechange = () => {
          diagnostic("connection-state", peer.connectionState);
          if (!active) return;
          if (peer.connectionState === "connected") setStatus("in_progress");
          if (peer.connectionState === "disconnected")
            setStatus("reconnecting");
          if (["failed", "closed"].includes(peer.connectionState))
            setStatus("error");
        };
        const socket = io(API_BASE_URL, {
          withCredentials: true,
          auth: { consultationToken: room.token, sessionId: room.session_id },
          transports: ["websocket"],
        });
        socketRef.current = socket;
        const flushIce = async () => {
          while (pendingIceRef.current.length && peer.remoteDescription) {
            const candidate = pendingIceRef.current.shift();
            try {
              await peer.addIceCandidate(candidate);
            } catch (candidateError) {
              diagnostic("ice-add-error", candidateError.message);
            }
          }
        };
        socket.on("connect", () => {
          diagnostic("socket-connected");
          socket.emit("join_room", { appointmentId, role });
          if (active) setStatus("waiting");
        });
        socket.on("reconnect", () => diagnostic("socket-reconnected"));
        socket.on("disconnect", () => {
          if (active) setStatus("reconnecting");
        });
        socket.on("status", ({ status: next }) => {
          if (active) setStatus(next);
        });
        socket.on("peer_ready", async () => {
          if (role !== "doctor" || cleaned || peer.signalingState !== "stable")
            return;
          const offer = await peer.createOffer();
          await peer.setLocalDescription(offer);
          diagnostic("offer-created");
          socket.emit("offer", { offer });
        });
        socket.on("offer", async ({ offer }) => {
          if (cleaned) return;
          await peer.setRemoteDescription(offer);
          await flushIce();
          const answer = await peer.createAnswer();
          await peer.setLocalDescription(answer);
          diagnostic("answer-created");
          socket.emit("answer", { answer });
        });
        socket.on("answer", async ({ answer }) => {
          if (!cleaned) {
            await peer.setRemoteDescription(answer);
            await flushIce();
          }
        });
        socket.on("ice_candidate", async ({ candidate }) => {
          if (!candidate || cleaned) return;
          if (!peer.remoteDescription) pendingIceRef.current.push(candidate);
          else {
            try {
              await peer.addIceCandidate(candidate);
            } catch (candidateError) {
              diagnostic("ice-add-error", candidateError.message);
            }
          }
        });
        socket.on("peer_left", () => {
          if (active) setStatus("waiting");
        });
        socket.on("connect_error", (err) => {
          if (active) {
            setError(err.message);
            setStatus("error");
          }
        });
        socket.on("connect", () => socket.emit("signaling_ready"));
      } catch (err) {
        if (active) {
          setError(err.message || "Unable to access the consultation.");
          setStatus("error");
        }
      }
    };
    start();
    return () => {
      active = false;
      cleaned = true;
      pendingIceRef.current = [];
      socketRef.current?.emit("leave_room");
      socketRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      peerRef.current?.close();
      socketRef.current = null;
      peerRef.current = null;
      streamRef.current = null;
    };
  }, [appointmentId, authorization, role]);

  const toggleTrack = (kind) => {
    const track = streamRef.current
      ?.getTracks()
      .find((item) => item.kind === kind);
    if (!track) return;
    track.enabled = !track.enabled;
    if (kind === "audio") setMuted(!track.enabled);
    else setCameraOff(!track.enabled);
  };

  const end = () => {
    socketRef.current?.emit(
      role === "doctor" ? "end_consultation" : "leave_room",
    );
    streamRef.current?.getTracks().forEach((track) => track.stop());
    setStatus("ended");
    onEnded?.();
  };

  return (
    <div className="space-y-4 font-sans text-[#162623]">
      {/* Top Live Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#F0F5F7] p-3.5 rounded-xl border border-[#577877]/15 text-xs font-semibold">
        <div className="flex items-center gap-2">
          {status === "in_progress" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
              Connected · Live Consultation
            </span>
          ) : status === "waiting" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              Waiting for Doctor to Join
            </span>
          ) : status === "connecting" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-100 text-teal-800 font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-teal-600 animate-pulse" />
              Connecting to WebRTC Room…
            </span>
          ) : status === "reconnecting" ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-800 font-bold uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse" />
              Doctor Disconnected · Reconnecting…
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 text-gray-800 font-bold uppercase tracking-wider">
              Consultation Ended
            </span>
          )}
        </div>

        {error && (
          <div className="text-xs font-semibold text-rose-600">
            ⚠️ {error}
          </div>
        )}
      </div>

      {/* Main Video View Container */}
      <div className="relative rounded-2xl overflow-hidden bg-[#162623] shadow-lg aspect-16/10 flex flex-col justify-between">
        {/* Remote Doctor Stream or Waiting Overlay */}
        <div className="w-full h-full relative flex items-center justify-center bg-[#162623]">
          {status === "in_progress" ? (
            <video
              ref={remoteVideo}
              autoPlay
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-white/80 bg-[#162623] p-6 text-center space-y-2">
              <span className="material-symbols-outlined text-5xl text-teal-400 animate-pulse">
                stethoscope
              </span>
              <h4 className="text-base font-bold text-white">
                {status === "waiting"
                  ? "Waiting for Doctor to Join"
                  : status === "connecting"
                  ? "Connecting to Doctor…"
                  : "Doctor Disconnected"}
              </h4>
              <p className="text-xs text-white/70 max-w-sm">
                {role === "patient"
                  ? "Your secure video room is active. Your clinician will invite you in shortly."
                  : "Waiting for patient to connect to video room."}
              </p>
            </div>
          )}

          {/* Bottom Left Badge */}
          <div className="absolute bottom-4 left-4 z-20 px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur-sm text-white text-xs border border-white/10">
            {role === "patient" ? "Remote: Clinician Video" : "Remote: Patient Video"}
          </div>

          {/* Picture-in-Picture Local Self Camera (Bottom Right) */}
          <div className="absolute bottom-4 right-4 z-20 rounded-xl overflow-hidden shadow-2xl border-2 border-white w-32 sm:w-44 aspect-16/10 bg-[#162623]">
            {!cameraOff ? (
              <video
                ref={localVideo}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/70 text-xs bg-[#1F2937]">
                Camera Off
              </div>
            )}
            <div className="absolute bottom-1 left-1.5 px-2 py-0.5 rounded bg-black/60 text-[10px] text-white font-medium">
              You ({role === "doctor" ? "Doctor" : "Patient"})
            </div>
          </div>
        </div>
      </div>

      {/* Control Bar */}
      <div className="care-card p-4 rounded-2xl bg-white border border-[#577877]/15 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => toggleTrack("audio")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer ${
              !muted
                ? "border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7]"
                : "bg-rose-600 text-white hover:bg-rose-700"
            }`}
          >
            {!muted ? "Mic On" : "Mic Muted"}
          </button>

          <button
            type="button"
            onClick={() => toggleTrack("video")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold shadow-2xs transition cursor-pointer ${
              !cameraOff
                ? "border border-[#577877]/30 text-[#162623] hover:bg-[#F0F5F7]"
                : "bg-rose-600 text-white hover:bg-rose-700"
            }`}
          >
            {!cameraOff ? "Camera On" : "Camera Off"}
          </button>

          {role === "doctor" && status === "waiting" && (
            <button
              type="button"
              onClick={() => socketRef.current?.emit("admit_patient")}
              className="bg-[#295255] hover:bg-[#1f3f41] text-white px-4 py-2 rounded-xl text-xs font-bold shadow cursor-pointer"
            >
              Admit Patient
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={end}
          className="bg-rose-600 hover:bg-rose-700 text-white px-5 py-2 rounded-xl font-bold text-xs shadow cursor-pointer"
        >
          {role === "doctor" ? "End Consultation" : "Leave Call"}
        </button>
      </div>
    </div>
  );
}
