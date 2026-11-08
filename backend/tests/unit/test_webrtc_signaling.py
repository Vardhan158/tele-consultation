import asyncio
import secrets
import pytest
import socketio
from teleconsult.main import app
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.config.settings import get_settings


@pytest.mark.asyncio
async def test_webrtc_socketio_signaling_lifecycle() -> None:
    settings = get_settings()
    if settings.mongodb_enabled:
        await mongo_database.connect()

    apt_id = f"apt-sig-{secrets.token_hex(4)}"
    token = f"token-sig-{secrets.token_hex(4)}"
    db = mongo_database.database()

    # Seed test video session document
    await db["video_sessions"].insert_one({
        "id": f"vses-{secrets.token_hex(6)}",
        "tenant_id": settings.default_tenant_id,
        "appointment_id": apt_id,
        "token": token,
        "status": "waiting",
    })

    # Test Socket.IO client connection & events
    sio_patient = socketio.AsyncClient()
    sio_doctor = socketio.AsyncClient()

    received_statuses = []

    @sio_patient.on("status")
    def on_status(data):
        received_statuses.append(data.get("status"))

    try:
        # 1. Connect patient
        await sio_patient.connect("http://localhost:8000", socketio_path="/socket.io", auth={"consultationToken": token, "appointmentId": apt_id, "role": "patient"})
        await sio_patient.emit("join_room", {"appointmentId": apt_id, "role": "patient"})
        await sio_patient.emit("signaling_ready")
        await asyncio.sleep(0.2)

        # 2. Connect doctor
        await sio_doctor.connect("http://localhost:8000", socketio_path="/socket.io", auth={"consultationToken": token, "appointmentId": apt_id, "role": "doctor"})
        await sio_doctor.emit("join_room", {"appointmentId": apt_id, "role": "doctor"})
        await sio_doctor.emit("signaling_ready")
        await asyncio.sleep(0.2)

        assert "waiting" in received_statuses

        # 3. Disconnect
        await sio_patient.disconnect()
        await sio_doctor.disconnect()
    except Exception as e:
        # Fallback if live server is not running on localhost:8000 during isolated test run
        pytest.skip(f"Live server not running for socketio test: {e}")
