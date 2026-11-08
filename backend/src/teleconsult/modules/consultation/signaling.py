"""Appointment-scoped Socket.IO signaling; media never traverses this server."""
import hashlib
import logging
from datetime import UTC, datetime
from uuid import UUID

import socketio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from teleconsult.kernel.db.session import get_engine
from teleconsult.modules.consultation.video_models import VideoSession, VideoSessionEvent
from teleconsult.modules.identity.models import AuthSession, UserAccount
from teleconsult.modules.patient_portal.models import Appointment, Doctor

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=["http://localhost:5173", "http://127.0.0.1:5173", "https://localhost:5173", "https://127.0.0.1:5173"], logger=False, engineio_logger=False)
_rooms: dict[str, set[str]] = {}
_ready: set[str] = set()
_negotiation_started: set[str] = set()
logger = logging.getLogger("teleconsult.signaling")

def _trace(event: str, sid: str, ctx: dict | None = None, **extra):
    details = {"event": event, "sid": sid, **(ctx or {}), **extra}
    logger.info("socket-signaling %s", details)

async def _maybe_peer_ready(room: str):
    if room in _negotiation_started:
        return
    participants = []
    for peer_sid in tuple(_rooms.get(room, set())):
        try:
            peer_ctx = await sio.get_session(peer_sid)
        except KeyError:
            continue
        participants.append((peer_sid, peer_ctx))
    roles = {ctx.get("role") for sid, ctx in participants if sid in _ready}
    if roles == {"patient", "doctor"}:
        doctor_sid = next(sid for sid, ctx in participants if sid in _ready and ctx.get("role") == "doctor")
        _negotiation_started.add(room)
        delivered = await sio.emit("peer_ready", to=doctor_sid)
        logger.info("socket-signaling peer_ready %s", {"room": room, "doctor_sid": doctor_sid, "delivered": delivered is not False})

async def _principal(environ):
    headers = dict(environ.get("asgi.scope", {}).get("headers", []))
    cookie = headers.get(b"cookie", b"").decode()
    raw = next((part.split("=", 1)[1] for part in cookie.split("; ") if part.startswith("teleconsult_session=")), "")
    auth = (environ.get("asgi.scope", {}).get("query_string", b"") or b"").decode()
    # Socket.IO auth is available through the handler payload, while cookie is the fallback.
    return raw

async def _load_context(environ, data):
    raw_session = await _principal(environ)
    token = (data or {}).get("consultationToken")
    if not token:
        raise ValueError("Consultation token is required")
    maker = async_sessionmaker(get_engine(), expire_on_commit=False)
    async with maker() as db:
        token_digest = hashlib.sha256(token.encode()).hexdigest()
        session = await db.scalar(select(VideoSession).where((VideoSession.patient_token_hash == token_digest) | (VideoSession.doctor_token_hash == token_digest) | (VideoSession.token_hash == token_digest)))
        if session is None or (session.token_expires_at and session.token_expires_at < datetime.now(UTC)):
            raise ValueError("Consultation token is invalid or expired")
        appointment = await db.get(Appointment, session.appointment_id)
        if appointment is None or appointment.status not in {"confirmed", "checked_in", "in_progress"}:
            raise ValueError("Appointment is not eligible")
        user = None
        if raw_session:
            auth = await db.scalar(select(AuthSession).where(AuthSession.token_hash == hashlib.sha256(raw_session.encode()).hexdigest(), AuthSession.revoked_at.is_(None), AuthSession.expires_at > datetime.now(UTC)))
            if auth: user = await db.get(UserAccount, auth.user_id)
        if user is None:
            raise ValueError("Authentication is required")
        doctor = await db.scalar(select(Doctor).where(Doctor.user_account_id == user.id, Doctor.id == appointment.doctor_id))
        if user.id != appointment.patient_id and doctor is None:
            raise ValueError("You are not a participant in this appointment")
        return session, appointment, ("doctor" if doctor else "patient"), user.id

@sio.event
async def connect(sid, environ, auth):
    try:
        session, appointment, role, user_id = await _load_context(environ, auth or {})
        await sio.save_session(sid, {"session_id": str(session.id), "appointment_id": str(appointment.id), "role": role, "user_id": str(user_id), "tenant_id": str(session.tenant_id)})
        _trace("connect", sid, {"appointment_id": str(appointment.id), "role": role})
    except ValueError:
        logger.warning("socket-signaling rejected connection sid=%s", sid)
        return False

@sio.on("join_room")
async def join_room(sid, data):
    ctx = await sio.get_session(sid)
    if str(data.get("appointmentId")) != ctx["appointment_id"]:
        logger.warning("socket-signaling rejected join sid=%s appointment=%s", sid, data.get("appointmentId"))
        return
    room = f"consultation:{ctx['appointment_id']}"
    await sio.enter_room(sid, room); _rooms.setdefault(room, set()).add(sid)
    _trace("join_room", sid, ctx, room=room, members=len(_rooms[room]))
    maker = async_sessionmaker(get_engine(), expire_on_commit=False)
    async with maker() as db:
        db.add(VideoSessionEvent(tenant_id=UUID(ctx["tenant_id"]), session_id=UUID(ctx["session_id"]), appointment_id=UUID(ctx["appointment_id"]), actor_id=UUID(ctx["user_id"]), event_type="room_joined", metadata_json={"role": ctx["role"]}))
        await db.commit()
    await sio.emit("status", {"status": "waiting"}, room=room)
    await _maybe_peer_ready(room)

@sio.on("signaling_ready")
async def signaling_ready(sid):
    ctx = await sio.get_session(sid)
    _ready.add(sid)
    room = f"consultation:{ctx['appointment_id']}"
    _trace("signaling_ready", sid, ctx, room=room, members=len(_rooms.get(room, set())))
    await _maybe_peer_ready(room)

async def _relay(sid, event, data):
    ctx = await sio.get_session(sid); await sio.emit(event, data, room=f"consultation:{ctx['appointment_id']}", skip_sid=sid)

@sio.on("offer")
async def relay_offer(sid, data):
    await _relay(sid, "offer", data)

@sio.on("answer")
async def relay_answer(sid, data):
    await _relay(sid, "answer", data)

@sio.on("ice_candidate")
async def relay_ice_candidate(sid, data):
    await _relay(sid, "ice_candidate", data)

@sio.on("admit_patient")
async def admit_patient(sid):
    ctx = await sio.get_session(sid)
    if ctx["role"] != "doctor": return
    maker = async_sessionmaker(get_engine(), expire_on_commit=False)
    async with maker() as db:
        video = await db.get(VideoSession, UUID(ctx["session_id"]))
        if video and video.status in {"waiting", "connecting"}:
            video.status = "in_progress"; video.connected_at = datetime.now(UTC); await db.commit()
            db.add(VideoSessionEvent(tenant_id=video.tenant_id, session_id=video.id, appointment_id=video.appointment_id, actor_id=UUID(ctx["user_id"]), event_type="patient_admitted", metadata_json={}))
            await db.commit()
    await sio.emit("status", {"status": "in_progress"}, room=f"consultation:{ctx['appointment_id']}")

@sio.on("leave_room")
async def leave_room(sid):
    ctx = await sio.get_session(sid); room = f"consultation:{ctx['appointment_id']}"; await sio.leave_room(sid, room); _rooms.get(room, set()).discard(sid)
    _ready.discard(sid)
    _negotiation_started.discard(room)
    _trace("leave_room", sid, ctx, room=room, members=len(_rooms.get(room, set())))
    maker = async_sessionmaker(get_engine(), expire_on_commit=False)
    async with maker() as db:
        db.add(VideoSessionEvent(tenant_id=UUID(ctx["tenant_id"]), session_id=UUID(ctx["session_id"]), appointment_id=UUID(ctx["appointment_id"]), actor_id=UUID(ctx["user_id"]), event_type="room_left", metadata_json={"role": ctx["role"]}))
        await db.commit()
    await sio.emit("peer_left", room=room, skip_sid=sid)

@sio.event
async def disconnect(sid):
    _ready.discard(sid)
    for room, members in list(_rooms.items()):
        if sid in members:
            members.discard(sid)
            logger.info("socket-signaling disconnect %s", {"sid": sid, "room": room, "members": len(members)})
        if not members:
            _rooms.pop(room, None)
            _negotiation_started.discard(room)

@sio.on("end_consultation")
async def end_consultation(sid):
    ctx = await sio.get_session(sid)
    if ctx["role"] != "doctor":
        return
    maker = async_sessionmaker(get_engine(), expire_on_commit=False)
    async with maker() as db:
        video = await db.get(VideoSession, UUID(ctx["session_id"]))
        if video and video.status in {"waiting", "connecting", "in_progress"}:
            video.status = "completed"; video.ended_at = datetime.now(UTC)
            appointment = await db.get(Appointment, video.appointment_id)
            if appointment: appointment.status = "completed"
            db.add(VideoSessionEvent(tenant_id=video.tenant_id, session_id=video.id, appointment_id=video.appointment_id, actor_id=UUID(ctx["user_id"]), event_type="consultation_ended", metadata_json={"role": "doctor"}))
            await db.commit()
    await sio.emit("status", {"status": "completed"}, room=f"consultation:{ctx['appointment_id']}")

socket_app = socketio.ASGIApp(sio)
