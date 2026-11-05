"""Exercise authenticated admin/doctor/patient API contracts against local HTTPS."""
import asyncio, base64, hashlib, hmac, os, struct
from datetime import datetime, timedelta, timezone
import httpx
import socketio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker
from teleconsult.kernel.db.session import get_engine
from teleconsult.modules.consultation.video_models import VideoSessionEvent

BASE = os.getenv("VERIFY_API_BASE", "https://127.0.0.1:8443")

def totp(secret: str) -> str:
    key = base64.b32decode(secret + "=" * ((8 - len(secret) % 8) % 8), casefold=True)
    raw = struct.pack(">Q", int(datetime.now(timezone.utc).timestamp()) // 30)
    digest = hmac.new(key, raw, hashlib.sha1).digest(); offset = digest[-1] & 15
    return str((struct.unpack(">I", digest[offset:offset + 4])[0] & 0x7fffffff) % 1_000_000).zfill(6)

async def main():
    users = {role: (os.getenv(f"DEV_{role.upper()}_EMAIL"), os.getenv(f"DEV_{role.upper()}_PASSWORD")) for role in ("admin", "doctor", "patient")}
    if any(not email or not password for email, password in users.values()): raise SystemExit("Set DEV_*_EMAIL and DEV_*_PASSWORD from provision_dev_accounts.py")
    async with httpx.AsyncClient(base_url=BASE, verify=False, timeout=15) as client:
        async def login(role, code=None):
            email, password = users[role]; payload = {"email": email, "password": password};
            if code: payload["mfa_code"] = code
            response = await client.post("/auth/login", json=payload)
            if response.is_error: raise RuntimeError(f"{role} login failed: {response.status_code} {response.text}")
            return response.json()
        admin = await login("admin")
        pending = (await client.get("/doctor/pending")).json(); assert pending, "No pending doctor application"
        doctor_id = pending[0]["id"]; approval = await client.post(f"/doctor/{doctor_id}/approve"); approval.raise_for_status(); assert approval.json()["status"] == "approved"
        await login("doctor")
        enrollment_response = await client.post("/doctor/mfa/enroll"); enrollment_response.raise_for_status(); enrollment = enrollment_response.json(); code = totp(enrollment["secret"])
        verified = await client.post("/doctor/mfa/verify", json={"code": code}); verified.raise_for_status(); assert verified.json()["status"] == "enabled"
        doctor_login = await login("doctor", totp(enrollment["secret"])); assert doctor_login["role"] == "doctor"
        start = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(hours=1); end = start + timedelta(minutes=30)
        slot = await client.post("/doctor/availability", json={"starts_at": start.isoformat(), "ends_at": end.isoformat()}); slot.raise_for_status()
        await login("patient"); doctors = (await client.get("/patient/doctors")).json(); doctor = next(item for item in doctors if str(item["id"]) == str(doctor_id))
        booking = await client.post("/patient/appointments", headers={"Idempotency-Key": f"dev-integration-appointment-{start.timestamp()}"}, json={"doctor_id": str(doctor["id"]), "starts_at": start.isoformat(), "duration_minutes": 30}); booking.raise_for_status(); appointment = booking.json(); assert appointment["status"] == "confirmed"
        await login("patient"); patient_cookie = client.cookies.get("teleconsult_session"); patient_join = await client.post(f"/patient/consultations/{appointment['id']}/join"); patient_join.raise_for_status(); patient_room = patient_join.json()
        await login("doctor", totp(enrollment["secret"])); doctor_cookie = client.cookies.get("teleconsult_session"); doctor_join = await client.post(f"/doctor/consultations/{appointment['id']}/join"); doctor_join.raise_for_status(); doctor_room = doctor_join.json()
        patient_socket, doctor_socket = socketio.AsyncClient(ssl_verify=False), socketio.AsyncClient(ssl_verify=False)
        patient_status, doctor_status = [], []
        @patient_socket.on("status")
        async def patient_on_status(payload): patient_status.append(payload.get("status"))
        @doctor_socket.on("status")
        async def doctor_on_status(payload): doctor_status.append(payload.get("status"))
        await patient_socket.connect(BASE, transports=["websocket"], headers={"Cookie": f"teleconsult_session={patient_cookie}"}, auth={"consultationToken": patient_room["token"], "sessionId": patient_room["session_id"]})
        await doctor_socket.connect(BASE, transports=["websocket"], headers={"Cookie": f"teleconsult_session={doctor_cookie}"}, auth={"consultationToken": doctor_room["token"], "sessionId": doctor_room["session_id"]})
        await patient_socket.emit("join_room", {"appointmentId": str(appointment["id"]), "role": "patient"}); await doctor_socket.emit("join_room", {"appointmentId": str(appointment["id"]), "role": "doctor"})
        await asyncio.sleep(0.3); await doctor_socket.emit("admit_patient"); await asyncio.sleep(0.3)
        assert patient_socket.connected and doctor_socket.connected and "waiting" in patient_status and "in_progress" in patient_status
        await patient_socket.emit("leave_room"); await doctor_socket.emit("leave_room"); await patient_socket.disconnect(); await doctor_socket.disconnect()
        maker = async_sessionmaker(get_engine(), expire_on_commit=False)
        async with maker() as db:
            events = list(await db.scalars(select(VideoSessionEvent).where(VideoSessionEvent.appointment_id == appointment["id"])))
        event_types = {event.event_type for event in events}
        assert {"room_joined", "patient_admitted", "room_left"}.issubset(event_types)
        print({"admin_login": True, "doctor_approved": True, "doctor_mfa": True, "appointment_id": str(appointment["id"]), "doctor_appointment_visible": True, "wss_room_join": True, "doctor_admission": True, "lifecycle_events": sorted(event_types), "live_media": False})

if __name__ == "__main__": asyncio.run(main())
