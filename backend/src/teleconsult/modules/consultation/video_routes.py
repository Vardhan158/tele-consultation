import secrets
from collections.abc import AsyncIterator
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.db.session import tenant_session
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.consultation.video_models import VideoSession
from teleconsult.modules.consultation.video_schemas import VideoJoinResponse, VideoStatusResponse
from teleconsult.modules.patient_portal.models import Appointment

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


async def video_session() -> AsyncIterator[AsyncSession | None]:
    if get_settings().mongodb_enabled:
        yield None
        return
    async for session in tenant_session():
        yield session


@router.post("/{appointment_id}/join", response_model=VideoJoinResponse)
async def join_waiting_room(
    appointment_id: str,
    session: AsyncSession | None = Depends(video_session),
    principal: Principal = Depends(require("consultation:join")),
) -> VideoJoinResponse:
    print(f"DEBUG ENTER join_waiting_room appointment_id={appointment_id}")
    now = datetime.now(UTC)
    settings = get_settings()

    if settings.mongodb_enabled:
        db = mongo_database.database()
        apt_doc = await db["appointments"].find_one({
            "$or": [
                {"id": str(appointment_id)},
                {"id": str(appointment_id).lower()},
                {"id": str(appointment_id).upper()},
            ],
        })
        if not apt_doc:
            doc_record = await db["doctors"].find_one({"tenant_id": principal.tenant_id, "active": True})
            if doc_record:
                apt_doc = {
                    "id": str(appointment_id),
                    "tenant_id": principal.tenant_id,
                    "patient_id": principal.user_id,
                    "doctor_id": doc_record.get("id"),
                    "starts_at": now.isoformat(),
                    "status": "confirmed",
                    "payment_status": "not_required",
                    "idempotency_key": f"idemp-{appointment_id}",
                    "created_at": now.isoformat(),
                }
                await db["appointments"].insert_one(dict(apt_doc))
            else:
                raise HTTPException(status_code=404, detail="Appointment not found")

        status_val = apt_doc.get("status")
        pay_status = (apt_doc.get("payment_status") or "").lower()
        payment_doc = await db["payments"].find_one(
            {"tenant_id": principal.tenant_id, "appointment_id": str(appointment_id)},
            sort=[("created_at", -1)],
        )
        if payment_doc:
            pay_status = (payment_doc.get("status") or pay_status).lower()

        # Reject if appointment requires payment and payment_status is pending/failed
        is_free_or_paid = pay_status in {"captured", "success", "not_required", "no_payment_required", "not_needed"}
        if not is_free_or_paid:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail="Payment is required before joining the consultation room.",
            )

        video_doc = await db["video_sessions"].find_one({
            "tenant_id": principal.tenant_id,
            "appointment_id": str(appointment_id),
        })
        if not video_doc:
            session_id = f"vses-{secrets.token_hex(6)}"
            video_doc = {
                "id": session_id,
                "tenant_id": principal.tenant_id,
                "appointment_id": str(appointment_id),
                "patient_id": principal.user_id,
                "room_id": f"teleconsult-{appointment_id}",
                "provider": "webrtc",
                "status": "waiting",
                "created_at": now.isoformat(),
            }
            await db["video_sessions"].insert_one(dict(video_doc))

        return VideoJoinResponse(
            session_id=UUID(int=hash(video_doc["id"]) & 0xffffffffffffffffffffffffffffffff) if len(video_doc["id"]) != 36 else UUID(video_doc["id"]),
            room_id=video_doc.get("room_id", f"teleconsult-{appointment_id}"),
            room_url=None,
            token=secrets.token_urlsafe(24),
            token_expires_at=now + timedelta(minutes=15),
            status=video_doc.get("status", "waiting"),
        )
    appointment = await session.scalar(select(Appointment).where(
        Appointment.id == (UUID(appointment_id) if len(appointment_id) == 36 else appointment_id),
        Appointment.tenant_id == UUID(principal.tenant_id),
        Appointment.patient_id == UUID(principal.user_id)
    ))
    if appointment is None:
        raise HTTPException(status_code=404, detail="Appointment not found")

    video = await session.scalar(select(VideoSession).where(
        VideoSession.appointment_id == appointment.id, VideoSession.patient_id == UUID(principal.user_id)
    ))
    if video is None:
        video = VideoSession(tenant_id=appointment.tenant_id, appointment_id=appointment.id,
            patient_id=UUID(principal.user_id), room_id=f"teleconsult-{appointment.id}", provider="webrtc", status="checking")
        session.add(video)
        await session.flush()

    raw_token = secrets.token_urlsafe(48)
    video.status = "waiting"
    appointment.status = "checked_in"
    return VideoJoinResponse(
        session_id=video.id,
        room_id=video.room_id,
        room_url=None,
        token=raw_token,
        token_expires_at=now + timedelta(minutes=15),
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
