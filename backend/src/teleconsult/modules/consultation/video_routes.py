from datetime import datetime, timedelta, UTC
import secrets
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.modules.consultation.video_models import VideoSession
from teleconsult.modules.consultation.video_schemas import VideoJoinResponse, VideoStatusResponse
from teleconsult.modules.patient_portal.models import Appointment
from teleconsult.config.settings import get_settings
from teleconsult.modules.notifications.models import Notification
from teleconsult.modules.patient_portal.consent_guard import require_active_consent

router = APIRouter(prefix="/patient/consultations", tags=["video-consultation"])

@router.get("/config")
async def consultation_config(principal: Principal = Depends(require("consultation:join"))) -> dict:
    settings = get_settings()
    servers = [{"urls": url.strip()} for url in settings.webrtc_stun_urls.split(",") if url.strip()]
    if settings.webrtc_turn_url:
        servers.append({"urls": settings.webrtc_turn_url, "username": settings.webrtc_turn_username, "credential": settings.webrtc_turn_credential})
    return {"ice_servers": servers}


@router.get("/{session_id}/status", response_model=VideoStatusResponse)
async def consultation_status(
    session_id: UUID,
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("consultation:join")),
) -> VideoStatusResponse:
    video = await session.scalar(select(VideoSession).where(
        VideoSession.id == session_id,
        VideoSession.tenant_id == UUID(principal.tenant_id),
        VideoSession.patient_id == UUID(principal.user_id),
    ))
    if video is None:
        raise HTTPException(status_code=404, detail="Video session not found")
    return VideoStatusResponse(session_id=video.id, status=video.status)


@router.post("/{appointment_id}/join", response_model=VideoJoinResponse)
async def join_waiting_room(
    appointment_id: UUID,
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("consultation:join")),
) -> VideoJoinResponse:
    now = datetime.now(UTC)
    settings = get_settings()
    appointment = await session.scalar(select(Appointment).where(
        Appointment.id == appointment_id, Appointment.tenant_id == UUID(principal.tenant_id),
        Appointment.patient_id == UUID(principal.user_id)
    ))
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found")
    await require_active_consent(session, UUID(principal.tenant_id), UUID(principal.user_id), {"telehealth", "treatment"})
    if appointment.status not in {"confirmed", "checked_in", "rescheduled"}:
        raise HTTPException(status_code=409, detail="Appointment is not ready for consultation")
    if settings.environment not in {"dev", "local"}:
        if now < appointment.starts_at - timedelta(minutes=30) or now > appointment.ends_at + timedelta(minutes=30):
            raise HTTPException(status_code=409, detail="Consultation join window is closed")

    video = await session.scalar(select(VideoSession).where(
        VideoSession.appointment_id == appointment.id, VideoSession.patient_id == UUID(principal.user_id)
    ))
    if video is None:
        video = VideoSession(tenant_id=appointment.tenant_id, appointment_id=appointment.id,
            patient_id=UUID(principal.user_id), room_id=f"teleconsult-{appointment.id}", provider="webrtc", status="checking")
        session.add(video)
        await session.flush()

    raw_token = secrets.token_urlsafe(48)
    import hashlib
    video.token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
    video.patient_token_hash = video.token_hash
    video.token_expires_at = now + timedelta(minutes=15)
    video.status = "waiting"
    appointment.status = "checked_in"
    existing_reminder = await session.scalar(select(Notification).where(
        Notification.tenant_id == appointment.tenant_id, Notification.patient_id == appointment.patient_id,
        Notification.event_type == "video_consultation_reminder", Notification.body.contains(str(appointment.id))))
    if existing_reminder is None:
        session.add(Notification(
            tenant_id=appointment.tenant_id, patient_id=appointment.patient_id,
            event_type="video_consultation_reminder", channel="in_app", status="queued",
            subject="Your video consultation is ready",
            body=f"Your secure waiting room is ready for appointment {appointment.id}."))
    return VideoJoinResponse(
        session_id=video.id,
        room_id=video.room_id,
        room_url=None,
        token=raw_token,
        token_expires_at=video.token_expires_at,
        status=video.status
    )


@router.post("/{session_id}/connected", response_model=VideoStatusResponse)
async def mark_connected(
    session_id: UUID,
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("consultation:join")),
) -> VideoStatusResponse:
    video = await session.scalar(select(VideoSession).where(
        VideoSession.id == session_id, VideoSession.tenant_id == UUID(principal.tenant_id), VideoSession.patient_id == UUID(principal.user_id)
    ))
    if video is None:
        raise HTTPException(status_code=404, detail="Video session not found")
    if video.status not in {"waiting", "disconnected"}:
        raise HTTPException(status_code=409, detail="Video session is not ready to connect")
    video.status, video.connected_at = "connecting", datetime.now(UTC)
    return VideoStatusResponse(session_id=video.id, status=video.status)


@router.post("/{session_id}/admit", response_model=VideoStatusResponse)
async def admit_patient(
    session_id: UUID,
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("consultation:admit")),
) -> VideoStatusResponse:
    """Doctor-only admission; patients cannot promote themselves into a call."""
    video = await session.scalar(select(VideoSession).where(
        VideoSession.id == session_id, VideoSession.tenant_id == UUID(principal.tenant_id)
    ))
    if video is None:
        raise HTTPException(status_code=404, detail="Video session not found")
    if video.status not in {"connecting", "waiting"}:
        raise HTTPException(status_code=409, detail="Patient is not waiting for admission")
    video.status = "in_progress"
    appointment = await session.get(Appointment, video.appointment_id)
    if appointment:
        appointment.status = "in_progress"
    return VideoStatusResponse(session_id=video.id, status=video.status)


@router.post("/{session_id}/complete", response_model=VideoStatusResponse)
async def complete_consultation(
    session_id: UUID,
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("consultation:complete")),
) -> VideoStatusResponse:
    video = await session.scalar(select(VideoSession).where(
        VideoSession.id == session_id, VideoSession.tenant_id == UUID(principal.tenant_id)
    ))
    if video is None:
        raise HTTPException(status_code=404, detail="Video session not found")
    if video.status != "in_progress":
        raise HTTPException(status_code=409, detail="Consultation is not in progress")
    video.status, video.ended_at = "completed", datetime.now(UTC)
    appointment = await session.get(Appointment, video.appointment_id)
    if appointment:
        appointment.status = "completed"
    return VideoStatusResponse(session_id=video.id, status=video.status)


@router.post("/{session_id}/disconnected", response_model=VideoStatusResponse)
async def mark_disconnected(
    session_id: UUID,
    session: AsyncSession = Depends(tenant_session),
    principal: Principal = Depends(require("consultation:join")),
) -> VideoStatusResponse:
    video = await session.scalar(select(VideoSession).where(
        VideoSession.id == session_id, VideoSession.tenant_id == UUID(principal.tenant_id), VideoSession.patient_id == UUID(principal.user_id)
    ))
    if video is None:
        raise HTTPException(status_code=404, detail="Video session not found")
    video.status, video.disconnected_at = "disconnected", datetime.now(UTC)
    return VideoStatusResponse(session_id=video.id, status=video.status)
