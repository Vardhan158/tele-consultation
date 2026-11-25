from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status



from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.consultation.video_schemas import VideoJoinResponse, VideoStatusResponse
from teleconsult.modules.patient_portal.appointment_access import (
    SETTLED_STATUSES,
    join_eligible,
    latest_payment,
    patient_identity_ids,
)

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
    session_id: UUID | str,
    principal: Principal = Depends(require("consultation:join")),
) -> VideoStatusResponse:
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    video = await db["video_sessions"].find_one({
        "id": str(session_id),
        "tenant_id": str(principal.tenant_id),
        "patient_id": str(principal.user_id),
    })
    if not video:
        video = await db["video_sessions"].find_one({
            "appointment_id": str(session_id),
            "tenant_id": str(principal.tenant_id),
            "patient_id": str(principal.user_id),
        })
    if not video:
        raise HTTPException(status_code=404, detail="Video session not found")
    v_id = UUID(int=hash(str(video["id"])) & 0xffffffffffffffffffffffffffffffff) if len(str(video["id"])) != 36 else UUID(str(video["id"]))
    return VideoStatusResponse(session_id=v_id, status=video.get("status", "waiting"))


@router.post("/{appointment_id}/join", response_model=VideoJoinResponse)
async def join_waiting_room(
    appointment_id: str,
    session: Any | None = None,
    principal: Principal = Depends(require("consultation:join")),
) -> VideoJoinResponse:
    now = datetime.now(UTC)
    settings = get_settings()

    if not settings.mongodb_enabled and not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    patient_ids = await patient_identity_ids(db, principal)
    apt_doc = await db["appointments"].find_one({
        "tenant_id": str(principal.tenant_id),
        "id": str(appointment_id),
        "patient_id": {"$in": patient_ids},
    })
    if not apt_doc:
        raise HTTPException(status_code=404, detail="Appointment not found")

    payment_doc = await latest_payment(db, principal.tenant_id, appointment_id)
    pay_status = str((payment_doc or {}).get("status") or apt_doc.get("payment_status") or "").lower()
    if pay_status not in SETTLED_STATUSES:
        raise HTTPException(status_code=402, detail="Payment is required before joining the consultation room.")
    if not join_eligible(apt_doc, pay_status, now, settings.video_join_window_minutes):
        raise HTTPException(status_code=409, detail="Consultation is not eligible or its joining window is closed.")

    raw_token = secrets.token_urlsafe(24)
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
            "patient_token_hash": hashlib.sha256(raw_token.encode()).hexdigest(),
            "created_at": now.isoformat(),
        }
        await db["video_sessions"].insert_one(dict(video_doc))

    await db["video_sessions"].update_one(
        {"id": video_doc["id"], "tenant_id": str(principal.tenant_id)},
        {"$set": {"patient_token_hash": hashlib.sha256(raw_token.encode()).hexdigest(), "status": "waiting"}},
    )
    await db["appointments"].update_one(
        {"id": str(appointment_id), "tenant_id": str(principal.tenant_id)},
        {"$set": {"status": "checked_in"}}
    )

    v_id = UUID(int=hash(str(video_doc["id"])) & 0xffffffffffffffffffffffffffffffff) if len(str(video_doc["id"])) != 36 else UUID(str(video_doc["id"]))
    return VideoJoinResponse(
        session_id=v_id,
        room_id=video_doc.get("room_id", f"teleconsult-{appointment_id}"),
        room_url=None,
        token=raw_token,
        token_expires_at=now + timedelta(minutes=15),
        status=video_doc.get("status", "waiting"),
    )


@router.post("/{session_id}/connected", response_model=VideoStatusResponse)
async def mark_connected(
    session_id: UUID | str,
    principal: Principal = Depends(require("consultation:join")),
) -> VideoStatusResponse:
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    video = await db["video_sessions"].find_one({
        "$or": [{"id": str(session_id)}, {"appointment_id": str(session_id)}],
        "tenant_id": str(principal.tenant_id),
    })
    if not video:
        raise HTTPException(status_code=404, detail="Video session not found")
    if video.get("status") not in {"waiting", "disconnected"}:
        raise HTTPException(status_code=409, detail="Video session is not ready to connect")
    now_iso = datetime.now(UTC).isoformat()
    await db["video_sessions"].update_one(
        {"_id": video["_id"]},
        {"$set": {"status": "connecting", "connected_at": now_iso}}
    )
    v_id = UUID(int=hash(str(video["id"])) & 0xffffffffffffffffffffffffffffffff) if len(str(video["id"])) != 36 else UUID(str(video["id"]))
    return VideoStatusResponse(session_id=v_id, status="connecting")


@router.post("/{session_id}/admit", response_model=VideoStatusResponse)
async def admit_patient(
    session_id: UUID | str,
    principal: Principal = Depends(require("consultation:admit")),
) -> VideoStatusResponse:
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    video = await db["video_sessions"].find_one({
        "$or": [{"id": str(session_id)}, {"appointment_id": str(session_id)}],
        "tenant_id": str(principal.tenant_id),
    })
    if not video:
        raise HTTPException(status_code=404, detail="Video session not found")
    if video.get("status") not in {"connecting", "waiting"}:
        raise HTTPException(status_code=409, detail="Patient is not waiting for admission")
    await db["video_sessions"].update_one(
        {"_id": video["_id"]},
        {"$set": {"status": "in_progress"}}
    )
    if video.get("appointment_id"):
        await db["appointments"].update_one(
            {"id": str(video["appointment_id"]), "tenant_id": str(principal.tenant_id)},
            {"$set": {"status": "in_progress"}}
        )
    v_id = UUID(int=hash(str(video["id"])) & 0xffffffffffffffffffffffffffffffff) if len(str(video["id"])) != 36 else UUID(str(video["id"]))
    return VideoStatusResponse(session_id=v_id, status="in_progress")


@router.post("/{session_id}/complete", response_model=VideoStatusResponse)
async def complete_consultation(
    session_id: UUID | str,
    principal: Principal = Depends(require("consultation:complete")),
) -> VideoStatusResponse:
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    video = await db["video_sessions"].find_one({
        "$or": [{"id": str(session_id)}, {"appointment_id": str(session_id)}],
        "tenant_id": str(principal.tenant_id),
    })
    if not video:
        raise HTTPException(status_code=404, detail="Video session not found")
    if video.get("status") != "in_progress":
        raise HTTPException(status_code=409, detail="Consultation is not in progress")
    now_iso = datetime.now(UTC).isoformat()
    await db["video_sessions"].update_one(
        {"_id": video["_id"]},
        {"$set": {"status": "completed", "ended_at": now_iso}}
    )
    if video.get("appointment_id"):
        await db["appointments"].update_one(
            {"id": str(video["appointment_id"]), "tenant_id": str(principal.tenant_id)},
            {"$set": {"status": "completed"}}
        )
    v_id = UUID(int=hash(str(video["id"])) & 0xffffffffffffffffffffffffffffffff) if len(str(video["id"])) != 36 else UUID(str(video["id"]))
    return VideoStatusResponse(session_id=v_id, status="completed")


@router.post("/{session_id}/disconnected", response_model=VideoStatusResponse)
async def mark_disconnected(
    session_id: UUID | str,
    principal: Principal = Depends(require("consultation:join")),
) -> VideoStatusResponse:
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()
    video = await db["video_sessions"].find_one({
        "$or": [{"id": str(session_id)}, {"appointment_id": str(session_id)}],
        "tenant_id": str(principal.tenant_id),
    })
    if not video:
        raise HTTPException(status_code=404, detail="Video session not found")
    now_iso = datetime.now(UTC).isoformat()
    await db["video_sessions"].update_one(
        {"_id": video["_id"]},
        {"$set": {"status": "disconnected", "disconnected_at": now_iso}}
    )
    v_id = UUID(int=hash(str(video["id"])) & 0xffffffffffffffffffffffffffffffff) if len(str(video["id"])) != 36 else UUID(str(video["id"]))
    return VideoStatusResponse(session_id=v_id, status="disconnected")
