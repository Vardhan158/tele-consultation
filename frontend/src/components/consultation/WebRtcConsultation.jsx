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
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <video
          ref={remoteVideo}
          autoPlay
          playsInline
          className="aspect-video w-full rounded-2xl bg-[#162623] object-cover"
        />
        <video
          ref={localVideo}
          autoPlay
          muted
          playsInline
          className="aspect-video w-full rounded-2xl bg-[#295255] object-cover"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[#577877]">
          {status === "in_progress" ? "Connected" : status}
        </span>
        {error && <span className="text-sm text-red-700">{error}</span>}
        <button
          type="button"
          className="btn-secondary"
          onClick={() => toggleTrack("audio")}
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => toggleTrack("video")}
        >
          {cameraOff ? "Camera on" : "Camera off"}
        </button>
        {role === "doctor" && status === "waiting" && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => socketRef.current?.emit("admit_patient")}
          >
            Admit patient
          </button>
        )}
        <button
          type="button"
          className="btn-secondary text-red-700"
          onClick={end}
        >
          End call
        </button>
      </div>
    </div>
  );
}
