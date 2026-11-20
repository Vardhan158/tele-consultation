import asyncio
import hashlib
import secrets
import socket
from datetime import UTC, datetime

import pytest
import socketio
import uvicorn

from teleconsult.config.settings import get_settings
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.main import app
from teleconsult.modules.consultation.signaling import _rooms


@pytest.mark.asyncio
@pytest.mark.mongodb_integration
async def test_webrtc_socketio_signaling_lifecycle(mongodb_test_database) -> None:
    settings = get_settings()
    assert "teleconsult_test" in settings.mongodb_database
    assert "kaizentrix_care_dev" not in settings.mongodb_uri

    if settings.mongodb_enabled:
        await mongo_database.connect()

    db = mongo_database.database()
    assert db.name == "teleconsult_test"

    # Allocate ephemeral local port for test server
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]

    config = uvicorn.Config(app=app, host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    server_task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.05)

    patient_id = f"pat-{secrets.token_hex(4)}"
    doc_user_id = f"doc-u-{secrets.token_hex(4)}"
    doc_id = f"doc-{secrets.token_hex(4)}"
    apt_id = f"apt-sig-{secrets.token_hex(4)}"
    vses_id = f"vses-{secrets.token_hex(6)}"

    pat_session_raw = f"sess-pat-{secrets.token_hex(16)}"
    doc_session_raw = f"sess-doc-{secrets.token_hex(16)}"
    pat_token = f"token-pat-{secrets.token_hex(16)}"
    doc_token = f"token-doc-{secrets.token_hex(16)}"

    now_iso = datetime.now(UTC).isoformat()

    try:
        # Seed test participants, credentials, and consultation records
        await db["users"].insert_many([
            {"id": patient_id, "tenant_id": settings.default_tenant_id, "role": "patient", "email": f"{patient_id}@test.local"},
            {"id": doc_user_id, "tenant_id": settings.default_tenant_id, "role": "doctor", "email": f"{doc_user_id}@test.local"},
        ])
        await db["doctors"].insert_one({
            "id": doc_id, "user_id": doc_user_id, "tenant_id": settings.default_tenant_id, "full_name": "Dr Test Signaling"
        })
        await db["user_sessions"].insert_many([
            {
                "id": f"usess-{secrets.token_hex(4)}",
                "tenant_id": settings.default_tenant_id,
                "user_id": patient_id,
                "token_hash": hashlib.sha256(pat_session_raw.encode()).hexdigest(),
                "created_at": now_iso,
            },
            {
                "id": f"usess-{secrets.token_hex(4)}",
                "tenant_id": settings.default_tenant_id,
                "user_id": doc_user_id,
                "token_hash": hashlib.sha256(doc_session_raw.encode()).hexdigest(),
                "created_at": now_iso,
            },
        ])
        await db["appointments"].insert_one({
            "id": apt_id,
            "tenant_id": settings.default_tenant_id,
            "patient_id": patient_id,
            "doctor_id": doc_id,
            "status": "confirmed",
            "starts_at": now_iso,
            "duration_minutes": 30,
            "idempotency_key": f"idemp-{apt_id}",
        })
        await db["video_sessions"].insert_one({
            "id": vses_id,
            "tenant_id": settings.default_tenant_id,
            "appointment_id": apt_id,
            "patient_token_hash": hashlib.sha256(pat_token.encode()).hexdigest(),
            "doctor_token_hash": hashlib.sha256(doc_token.encode()).hexdigest(),
            "status": "waiting",
        })

        sio_patient = socketio.AsyncClient()
        sio_doctor = socketio.AsyncClient()

        received_statuses: list[str] = []
        admitted = asyncio.Event()

        @sio_patient.on("status")
        def on_status(data: dict) -> None:
            status_val = data.get("status")
            received_statuses.append(status_val)
            if status_val == "in_progress":
                admitted.set()

        # 1. Connect patient with valid consultation token and session cookie
        await sio_patient.connect(
            f"http://127.0.0.1:{port}",
            socketio_path="/socket.io",
            auth={"consultationToken": pat_token, "appointmentId": apt_id, "role": "patient"},
            headers={"Cookie": f"teleconsult_session={pat_session_raw}"},
            wait_timeout=10,
        )
        await sio_patient.emit("join_room", {"appointmentId": apt_id, "role": "patient"})
        await sio_patient.emit("signaling_ready")

        # 2. Connect doctor with valid consultation token and session cookie
        await sio_doctor.connect(
            f"http://127.0.0.1:{port}",
            socketio_path="/socket.io",
            auth={"consultationToken": doc_token, "appointmentId": apt_id, "role": "doctor"},
            headers={"Cookie": f"teleconsult_session={doc_session_raw}"},
            wait_timeout=10,
        )
        await sio_doctor.emit("join_room", {"appointmentId": apt_id, "role": "doctor"})
        await sio_doctor.emit("signaling_ready")

        await asyncio.sleep(0.3)
        assert "waiting" in received_statuses

        # 3. Test SDP offer and answer relaying
        offer_received = asyncio.Event()
        offer_payload: dict = {}

        @sio_doctor.on("offer")
        def on_offer(data: dict) -> None:
            offer_payload.update(data)
            offer_received.set()

        await sio_patient.emit("offer", {"sdp": "v=0...mock_patient_offer"})
        await asyncio.wait_for(offer_received.wait(), timeout=3.0)
        assert offer_payload.get("sdp") == "v=0...mock_patient_offer"

        answer_received = asyncio.Event()
        answer_payload: dict = {}

        @sio_patient.on("answer")
        def on_answer(data: dict) -> None:
            answer_payload.update(data)
            answer_received.set()

        await sio_doctor.emit("answer", {"sdp": "v=0...mock_doctor_answer"})
        await asyncio.wait_for(answer_received.wait(), timeout=3.0)
        assert answer_payload.get("sdp") == "v=0...mock_doctor_answer"

        # 4. Test ICE candidate relaying
        ice_received = asyncio.Event()
        ice_payload: dict = {}

        @sio_patient.on("ice_candidate")
        def on_ice(data: dict) -> None:
            ice_payload.update(data)
            ice_received.set()

        await sio_doctor.emit("ice_candidate", {"candidate": "candidate:mock 1 UDP ..."})
        await asyncio.wait_for(ice_received.wait(), timeout=3.0)
        assert "candidate" in ice_payload

        # 5. Test Doctor admitting patient
        await sio_doctor.emit("admit_patient")
        await asyncio.wait_for(admitted.wait(), timeout=3.0)
        assert "in_progress" in received_statuses

        # 6. Disconnect both clients and verify signaling cleanup
        await sio_patient.disconnect()
        await sio_doctor.disconnect()
        await asyncio.sleep(0.2)

        room_name = f"consultation:{apt_id}"
        assert room_name not in _rooms
    finally:
        # 7. Clean up database records and terminate server
        await db["users"].delete_many({"id": {"$in": [patient_id, doc_user_id]}})
        await db["doctors"].delete_one({"id": doc_id})
        await db["user_sessions"].delete_many({"user_id": {"$in": [patient_id, doc_user_id]}})
        await db["appointments"].delete_one({"id": apt_id})
        await db["video_sessions"].delete_one({"id": vses_id})
        await db["video_session_events"].delete_many({"appointment_id": apt_id})

        server.should_exit = True
        await server_task

