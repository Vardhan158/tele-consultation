"""Appointment-scoped Socket.IO signaling; media never traverses this server."""
import hashlib
import logging
import secrets
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import socketio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from teleconsult.config.settings import get_settings
from teleconsult.kernel.db.session import get_engine
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.consultation.video_models import VideoSession, VideoSessionEvent
from teleconsult.modules.identity.models import AuthSession, UserAccount
from teleconsult.modules.patient_portal.models import Appointment, Doctor

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=get_settings().allowed_frontend_origins,
    logger=False,
    engineio_logger=False,
)
_rooms: dict[str, set[str]] = {}
_ready: set[str] = set()
_negotiation_started: set[str] = set()
logger = logging.getLogger("teleconsult.signaling")


def _trace(event: str, sid: str, ctx: dict[str, Any] | None = None, **extra: Any) -> None:
    details = {"event": event, "sid": sid, **(ctx or {}), **extra}
    logger.info("socket-signaling %s", details)


async def _maybe_peer_ready(room: str) -> None:
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
        doctor_sid = next(
            sid for sid, ctx in participants if sid in _ready and ctx.get("role") == "doctor"
        )
        _negotiation_started.add(room)
        delivered = await sio.emit("peer_ready", to=doctor_sid)
        logger.info(
            "socket-signaling peer_ready %s",
            {"room": room, "doctor_sid": doctor_sid, "delivered": delivered is not False},
        )


async def _principal(environ: dict[str, Any]) -> str:
    headers = dict(environ.get("asgi.scope", {}).get("headers", []))
    cookie = headers.get(b"cookie", b"").decode()
    raw = next(
        (
            part.split("=", 1)[1]
            for part in cookie.split("; ")
            if part.startswith("teleconsult_session=")
        ),
        "",
    )
    return raw


class SessionObj:
    def __init__(self, s_id: str, a_id: str, t_id: str) -> None:
        self.id = s_id
        self.appointment_id = a_id
        self.tenant_id = t_id


class AptObj:
    def __init__(self, a_id: str, status: str) -> None:
        self.id = a_id
        self.status = status


async def _load_context(environ: dict[str, Any], data: dict[str, Any]) -> tuple[Any, Any, str, str]:
    token = (data or {}).get("consultationToken") or (data or {}).get("sessionId")
    if not token:
        raise ValueError("Consultation token is required")

    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        token_digest = hashlib.sha256(str(token).encode()).hexdigest()

        # Query video session in MongoDB
        video_session = await db["video_sessions"].find_one({
            "$or": [
                {"token_hash": token_digest},
                {"patient_token_hash": token_digest},
                {"doctor_token_hash": token_digest},
                {"token": str(token)},
                {"id": str(token)},
            ]
        })

        if not video_session:
            raise ValueError("Consultation token is invalid")

        req_apt_id = (data or {}).get("appointmentId") or (data or {}).get("appointment_id")
        appointment_id = str(video_session.get("appointment_id"))
        if req_apt_id and str(req_apt_id).lower() != appointment_id.lower():
            raise ValueError("Appointment does not match consultation token")
        session_id = video_session.get("id") or str(video_session.get("_id"))
        tenant_id = video_session.get("tenant_id", get_settings().default_tenant_id)

        # Query appointment in MongoDB
        apt_doc = await db["appointments"].find_one({
            "tenant_id": tenant_id,
            "$or": [{"id": str(appointment_id)}, {"id": str(appointment_id).lower()}],
        })
        if not apt_doc:
            raise ValueError("Appointment not found")

        token_role = "doctor" if video_session.get("doctor_token_hash") == token_digest else "patient"
        raw_session = await _principal(environ)
        if not raw_session:
            raise ValueError("Authentication session is missing")
        user_id = ""
        role = token_role

        if raw_session:
            session_token_digest = hashlib.sha256(raw_session.encode()).hexdigest()
            auth_session = await db["user_sessions"].find_one({
                "tenant_id": tenant_id,
                "token_hash": session_token_digest,
                "revoked_at": {"$exists": False},
            })
            if not auth_session:
                raise ValueError("Authentication session is invalid or expired")
            user_id = str(auth_session.get("user_id", ""))
            user_doc = await db["users"].find_one({"id": user_id})
            if not user_doc:
                raise ValueError("Authenticated user was not found")
            role = user_doc.get("role", role)

        if role != token_role:
            raise ValueError("Consultation token role does not match authenticated user")
        if role == "patient" and str(apt_doc.get("patient_id")) != str(user_id):
            raise ValueError("Patient is not assigned to this appointment")
        if role == "doctor":
            doctor_doc = await db["doctors"].find_one({"tenant_id": tenant_id, "$or": [{"id": str(user_id)}, {"user_id": str(user_id)}, {"user_account_id": str(user_id)}]})
            if not doctor_doc or str(apt_doc.get("doctor_id")) != str(doctor_doc.get("id")):
                raise ValueError("Doctor is not assigned to this appointment")

        if role not in {"patient", "doctor"}:
            raise ValueError("Consultation role is not authorized")

        return SessionObj(session_id, appointment_id, tenant_id), AptObj(appointment_id, apt_doc.get("status", "confirmed")), role, user_id

    # SQL Mode
    raw_session = await _principal(environ)
    maker = async_sessionmaker(get_engine(), expire_on_commit=False)
    async with maker() as db_sql:
        token_digest = hashlib.sha256(str(token).encode()).hexdigest()
        session = await db_sql.scalar(
            select(VideoSession).where(
                (VideoSession.patient_token_hash == token_digest)
                | (VideoSession.doctor_token_hash == token_digest)
                | (VideoSession.token_hash == token_digest)
            )
        )
        if session is None or (
            session.token_expires_at and session.token_expires_at < datetime.now(UTC)
        ):
            raise ValueError("Consultation token is invalid or expired")
        appointment = await db_sql.get(Appointment, session.appointment_id)
        if appointment is None or appointment.status not in {
            "confirmed",
            "checked_in",
            "in_progress",
        }:
            raise ValueError("Appointment is not eligible")
        user = None
        if raw_session:
            auth = await db_sql.scalar(
                select(AuthSession).where(
                    AuthSession.token_hash == hashlib.sha256(raw_session.encode()).hexdigest(),
                    AuthSession.revoked_at.is_(None),
                    AuthSession.expires_at > datetime.now(UTC),
                )
            )
            if auth:
                user = await db_sql.get(UserAccount, auth.user_id)
        if user is None:
            raise ValueError("Authentication is required")
        doctor = await db_sql.scalar(
            select(Doctor).where(
                Doctor.user_account_id == user.id, Doctor.id == appointment.doctor_id
            )
        )
        if user.id != appointment.patient_id and doctor is None:
            raise ValueError("You are not a participant in this appointment")
        return (
            session,
            appointment,
            ("doctor" if doctor else "patient"),
            str(user.id),
        )


@sio.event
async def connect(sid: str, environ: dict[str, Any], auth: dict[str, Any] | None) -> bool:
    try:
        session, appointment, role, user_id = await _load_context(environ, auth or {})
        await sio.save_session(
            sid,
            {
                "session_id": str(session.id),
                "appointment_id": str(appointment.id),
                "role": role,
                "user_id": str(user_id),
                "tenant_id": str(session.tenant_id),
            },
        )
        _trace("connect", sid, {"appointment_id": str(appointment.id), "role": role})
        return True
    except ValueError as err:
        reason = str(err)
        code = {
            "Authentication session is missing": "missing_session",
            "Authentication session is invalid or expired": "invalid_session",
            "Authenticated user was not found": "user_not_found",
            "Consultation token is invalid": "invalid_consultation_token",
            "Appointment not found": "appointment_not_found",
            "Patient is not assigned to this appointment": "patient_appointment_mismatch",
            "Doctor is not assigned to this appointment": "doctor_appointment_mismatch",
            "Consultation token role does not match authenticated user": "role_mismatch",
        }.get(reason, "authorization_failed")
        logger.warning("socket-signaling rejected connection sid=%s code=%s", sid, code)
        raise ConnectionRefusedError("Consultation connection rejected", {"code": code}) from err


@sio.on("join_room")
async def join_room(sid: str, data: dict[str, Any], ack: Any = None) -> None:
    ctx = await sio.get_session(sid)
    req_apt = str(data.get("appointmentId") or "").strip()
    ctx_apt = str(ctx.get("appointment_id") or "").strip()

    if req_apt and ctx_apt and req_apt.lower() != ctx_apt.lower():
        _trace("join_room_rejected", sid, ctx, requested_appointment_id=req_apt)
        await sio.emit("signaling_error", {"code": "appointment_mismatch"}, to=sid)
        if ack:
            ack({"ok": False, "code": "appointment_mismatch"})
        return

    room = f"consultation:{ctx['appointment_id']}"
    await sio.enter_room(sid, room)
    _rooms.setdefault(room, set()).add(sid)
    _trace("join_room", sid, ctx, room=room, members=len(_rooms[room]))

    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        await db["video_session_events"].insert_one({
            "id": f"event-{secrets.token_hex(6)}",
            "tenant_id": ctx["tenant_id"],
            "session_id": ctx["session_id"],
            "appointment_id": ctx["appointment_id"],
            "actor_id": ctx["user_id"],
            "event_type": "room_joined",
            "metadata_json": {"role": ctx["role"]},
            "created_at": datetime.now(UTC).isoformat(),
        })
    else:
        maker = async_sessionmaker(get_engine(), expire_on_commit=False)
        async with maker() as db_sql:
            db_sql.add(
                VideoSessionEvent(
                    tenant_id=UUID(ctx["tenant_id"]),
                    session_id=UUID(ctx["session_id"]),
                    appointment_id=UUID(ctx["appointment_id"]),
                    actor_id=UUID(ctx["user_id"]),
                    event_type="room_joined",
                    metadata_json={"role": ctx["role"]},
                )
            )
            await db_sql.commit()

    await sio.emit("status", {"status": "waiting"}, room=room)
    await sio.emit("room_joined", {"appointment_id": ctx["appointment_id"], "room": room, "role": ctx["role"], "members": len(_rooms[room])}, to=sid)
    await sio.emit("peer_presence", {"role": ctx["role"], "members": len(_rooms[room])}, room=room, skip_sid=sid)
    if ack:
        ack({"ok": True, "appointment_id": ctx["appointment_id"], "room": room, "role": ctx["role"], "members": len(_rooms[room])})
    await _maybe_peer_ready(room)


@sio.on("signaling_ready")
async def signaling_ready(sid: str) -> None:
    ctx = await sio.get_session(sid)
    _ready.add(sid)
    room = f"consultation:{ctx['appointment_id']}"
    _trace("signaling_ready", sid, ctx, room=room, members=len(_rooms.get(room, set())))
    await _maybe_peer_ready(room)


async def _relay(sid: str, event: str, data: dict[str, Any]) -> None:
    ctx = await sio.get_session(sid)
    await sio.emit(
        event, data, room=f"consultation:{ctx['appointment_id']}", skip_sid=sid
    )


@sio.on("offer")
async def relay_offer(sid: str, data: dict[str, Any]) -> None:
    ctx = await sio.get_session(sid)
    _trace("offer", sid, ctx, room=f"consultation:{ctx['appointment_id']}")
    await _relay(sid, "offer", data)


@sio.on("answer")
async def relay_answer(sid: str, data: dict[str, Any]) -> None:
    ctx = await sio.get_session(sid)
    _trace("answer", sid, ctx, room=f"consultation:{ctx['appointment_id']}")
    await _relay(sid, "answer", data)


@sio.on("ice_candidate")
async def relay_ice_candidate(sid: str, data: dict[str, Any]) -> None:
    ctx = await sio.get_session(sid)
    _trace("ice_candidate", sid, ctx, room=f"consultation:{ctx['appointment_id']}")
    await _relay(sid, "ice_candidate", data)


@sio.on("admit_patient")
async def admit_patient(sid: str) -> None:
    ctx = await sio.get_session(sid)
    if ctx["role"] != "doctor":
        return

    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        await db["video_sessions"].update_one(
            {"id": ctx["session_id"]},
            {"$set": {"status": "in_progress", "connected_at": datetime.now(UTC).isoformat()}},
        )
        await db["video_session_events"].insert_one({
            "id": f"event-{secrets.token_hex(6)}",
            "tenant_id": ctx["tenant_id"],
            "session_id": ctx["session_id"],
            "appointment_id": ctx["appointment_id"],
            "actor_id": ctx["user_id"],
            "event_type": "patient_admitted",
            "created_at": datetime.now(UTC).isoformat(),
        })
    else:
        maker = async_sessionmaker(get_engine(), expire_on_commit=False)
        async with maker() as db_sql:
            video = await db_sql.get(VideoSession, UUID(ctx["session_id"]))
            if video and video.status in {"waiting", "connecting"}:
                video.status = "in_progress"
                video.connected_at = datetime.now(UTC)
                await db_sql.commit()
                db_sql.add(
                    VideoSessionEvent(
                        tenant_id=video.tenant_id,
                        session_id=video.id,
                        appointment_id=video.appointment_id,
                        actor_id=UUID(ctx["user_id"]),
                        event_type="patient_admitted",
                        metadata_json={},
                    )
                )
                await db_sql.commit()

    await sio.emit("status", {"status": "in_progress"}, room=f"consultation:{ctx['appointment_id']}")


@sio.on("leave_room")
async def leave_room(sid: str) -> None:
    ctx = await sio.get_session(sid)
    room = f"consultation:{ctx['appointment_id']}"
    await sio.leave_room(sid, room)
    _rooms.get(room, set()).discard(sid)
    _ready.discard(sid)
    _negotiation_started.discard(room)
    _trace("leave_room", sid, ctx, room=room, members=len(_rooms.get(room, set())))

    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        await db["video_session_events"].insert_one({
            "id": f"event-{secrets.token_hex(6)}",
            "tenant_id": ctx["tenant_id"],
            "session_id": ctx["session_id"],
            "appointment_id": ctx["appointment_id"],
            "actor_id": ctx["user_id"],
            "event_type": "room_left",
            "metadata_json": {"role": ctx["role"]},
            "created_at": datetime.now(UTC).isoformat(),
        })
    else:
        maker = async_sessionmaker(get_engine(), expire_on_commit=False)
        async with maker() as db_sql:
            db_sql.add(
                VideoSessionEvent(
                    tenant_id=UUID(ctx["tenant_id"]),
                    session_id=UUID(ctx["session_id"]),
                    appointment_id=UUID(ctx["appointment_id"]),
                    actor_id=UUID(ctx["user_id"]),
                    event_type="room_left",
                    metadata_json={"role": ctx["role"]},
                )
            )
            await db_sql.commit()

    await sio.emit("peer_left", room=room, skip_sid=sid)


@sio.event
async def disconnect(sid: str) -> None:
    _ready.discard(sid)
    for room, members in list(_rooms.items()):
        if sid in members:
            members.discard(sid)
            logger.info("socket-signaling disconnect %s", {"sid": sid, "room": room, "members": len(members)})
        if not members:
            _rooms.pop(room, None)
            _negotiation_started.discard(room)


@sio.on("end_consultation")
async def end_consultation(sid: str) -> None:
    ctx = await sio.get_session(sid)
    if ctx["role"] != "doctor":
        return

    if get_settings().mongodb_enabled:
        db = mongo_database.database()
        now_iso = datetime.now(UTC).isoformat()
        await db["video_sessions"].update_one(
            {"id": ctx["session_id"]},
            {"$set": {"status": "completed", "ended_at": now_iso}},
        )
        await db["appointments"].update_one(
            {"id": ctx["appointment_id"]},
            {"$set": {"status": "completed"}},
        )
        await db["video_session_events"].insert_one({
            "id": f"event-{secrets.token_hex(6)}",
            "tenant_id": ctx["tenant_id"],
            "session_id": ctx["session_id"],
            "appointment_id": ctx["appointment_id"],
            "actor_id": ctx["user_id"],
            "event_type": "consultation_ended",
            "metadata_json": {"role": "doctor"},
            "created_at": now_iso,
        })
    else:
        maker = async_sessionmaker(get_engine(), expire_on_commit=False)
        async with maker() as db_sql:
            video = await db_sql.get(VideoSession, UUID(ctx["session_id"]))
            if video and video.status in {"waiting", "connecting", "in_progress"}:
                video.status = "completed"
                video.ended_at = datetime.now(UTC)
                appointment = await db_sql.get(Appointment, video.appointment_id)
                if appointment:
                    appointment.status = "completed"
                db_sql.add(
                    VideoSessionEvent(
                        tenant_id=video.tenant_id,
                        session_id=video.id,
                        appointment_id=video.appointment_id,
                        actor_id=UUID(ctx["user_id"]),
                        event_type="consultation_ended",
                        metadata_json={"role": "doctor"},
                    )
                )
                await db_sql.commit()

    await sio.emit("status", {"status": "completed"}, room=f"consultation:{ctx['appointment_id']}")


socket_app = socketio.ASGIApp(sio)
