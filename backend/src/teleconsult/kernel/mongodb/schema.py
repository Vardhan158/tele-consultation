from datetime import UTC, datetime
import os
from typing import Any

from pymongo import ASCENDING, DESCENDING

from teleconsult.config.settings import get_settings
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.identity.auth_routes import password_hash

COLLECTIONS = {
    "users": {"bsonType": "object", "required": ["tenant_id", "email", "role"]},
    "patients": {"bsonType": "object", "required": ["tenant_id", "user_id"]},
    "doctors": {"bsonType": "object", "required": ["tenant_id", "user_id"]},
    "clinics": {"bsonType": "object", "required": ["tenant_id"]},
    "doctor_credentials": {"bsonType": "object", "required": ["tenant_id", "doctor_id"]},
    "doctor_availability": {"bsonType": "object", "required": ["tenant_id", "doctor_id", "starts_at"]},
    "appointments": {"bsonType": "object", "required": ["tenant_id", "patient_id", "doctor_id", "starts_at"]},
    "consultation_sessions": {"bsonType": "object", "required": ["tenant_id", "appointment_id"]},
    "consultation_participants": {"bsonType": "object", "required": ["tenant_id", "session_id", "user_id"]},
    "video_session_events": {"bsonType": "object", "required": ["tenant_id", "session_id", "event_type"]},
    "payments": {"bsonType": "object", "required": ["tenant_id", "appointment_id"]},
    "payment_attempts": {"bsonType": "object", "required": ["tenant_id", "payment_id", "attempt_id"]},
    "payment_status_history": {"bsonType": "object", "required": ["tenant_id", "payment_id", "status"]},
    "payment_receipts": {"bsonType": "object", "required": ["tenant_id", "payment_id", "receipt_id"]},
    "refunds": {"bsonType": "object", "required": ["tenant_id", "payment_id"]},
    "refund_transactions": {"bsonType": "object", "required": ["tenant_id", "refund_id"]},
    "payment_webhooks": {"bsonType": "object", "required": ["provider", "event_id"]},
    "clinical_notes": {"bsonType": "object", "required": ["tenant_id", "appointment_id", "author_id"]},
    "clinical_note_amendments": {"bsonType": "object", "required": ["tenant_id", "note_id", "author_id"]},
    "prescriptions": {"bsonType": "object", "required": ["tenant_id", "patient_id", "author_id"]},
    "consultation_summaries": {"bsonType": "object", "required": ["tenant_id", "appointment_id"]},
    "medical_records": {"bsonType": "object", "required": ["tenant_id", "patient_id"]},
    "follow_up_plans": {"bsonType": "object", "required": ["tenant_id", "patient_id"]},
    "notifications": {"bsonType": "object", "required": ["tenant_id", "recipient_id"]},
    "notification_preferences": {"bsonType": "object", "required": ["tenant_id", "user_id"]},
    "consents": {"bsonType": "object", "required": ["tenant_id", "patient_id", "consent_type"]},
    "support_tickets": {"bsonType": "object", "required": ["tenant_id", "requester_id"]},
    "audit_logs": {"bsonType": "object", "required": ["tenant_id", "actor_id", "action"]},
    "blocked_dates": {"bsonType": "object", "required": ["tenant_id", "date"]},
    "user_sessions": {"bsonType": "object", "required": ["tenant_id", "user_id", "token_hash"]},
    "mfa_credentials": {"bsonType": "object", "required": ["tenant_id", "user_id"]},
    "user_settings": {"bsonType": "object", "required": ["tenant_id", "user_id"]},
    "recovery_tokens": {"bsonType": "object", "required": ["user_id", "token_hash"]},
    "data_requests": {"bsonType": "object", "required": ["tenant_id", "user_id", "request_type"]},
}

INDEXES: dict[str, list[tuple[list[tuple[str, int]], dict[str, Any]]]] = {
    "users": [([("tenant_id", ASCENDING), ("email", ASCENDING)], {"unique": True})],
    "doctor_credentials": [([("tenant_id", ASCENDING), ("registration_number", ASCENDING)], {"unique": True, "sparse": True})],
    "doctor_availability": [([("tenant_id", ASCENDING), ("doctor_id", ASCENDING), ("starts_at", ASCENDING)], {})],
    "appointments": [
        ([("tenant_id", ASCENDING), ("doctor_id", ASCENDING), ("starts_at", ASCENDING)], {}),
        ([("tenant_id", ASCENDING), ("patient_id", ASCENDING), ("starts_at", ASCENDING)], {}),
        ([("tenant_id", ASCENDING), ("idempotency_key", ASCENDING)], {"unique": True, "sparse": True}),
        (
            [("tenant_id", ASCENDING), ("doctor_id", ASCENDING), ("starts_at", ASCENDING)],
            {
                "name": "uq_active_doctor_slot",
                "unique": True,
                "partialFilterExpression": {
                    "status": {"$in": ["requested", "pending_payment", "confirmed", "checked_in", "in_progress", "rescheduled"]}
                },
            },
        ),
    ],
    "consultation_sessions": [([("tenant_id", ASCENDING), ("appointment_id", ASCENDING)], {"unique": True})],
    "video_session_events": [([("tenant_id", ASCENDING), ("session_id", ASCENDING), ("event_at", DESCENDING)], {})],
    "payments": [
        ([("tenant_id", ASCENDING), ("provider_order_id", ASCENDING)], {"unique": True, "sparse": True}),
        ([("tenant_id", ASCENDING), ("idempotency_key", ASCENDING)], {"unique": True}),
        ([("tenant_id", ASCENDING), ("provider_transaction_id", ASCENDING)], {"unique": True, "sparse": True}),
    ],
    "payment_attempts": [([("tenant_id", ASCENDING), ("payment_id", ASCENDING), ("attempt_id", ASCENDING)], {"unique": True})],
    "payment_status_history": [([("tenant_id", ASCENDING), ("payment_id", ASCENDING), ("occurred_at", DESCENDING)], {})],
    "payment_receipts": [([("tenant_id", ASCENDING), ("receipt_id", ASCENDING)], {"unique": True})],
    "payment_webhooks": [([("provider", ASCENDING), ("event_id", ASCENDING)], {"unique": True})],
    "refunds": [([("tenant_id", ASCENDING), ("payment_id", ASCENDING)], {"unique": True})],
    "clinical_notes": [([("tenant_id", ASCENDING), ("appointment_id", ASCENDING)], {})],
    "medical_records": [([("tenant_id", ASCENDING), ("patient_id", ASCENDING), ("created_at", DESCENDING)], {})],
    "user_sessions": [([("tenant_id", ASCENDING), ("token_hash", ASCENDING)], {"unique": True})],
    "clinics": [([("tenant_id", ASCENDING), ("clinic_id", ASCENDING)], {"unique": True, "sparse": True})],
    "audit_logs": [([("tenant_id", ASCENDING), ("created_at", DESCENDING)], {})],
    "blocked_dates": [([("tenant_id", ASCENDING), ("date", ASCENDING)], {"unique": True})],
    "notifications": [([("tenant_id", ASCENDING), ("recipient_id", ASCENDING), ("created_at", DESCENDING)], {})],
}


async def ensure_clinic_seeded(db=None) -> None:
    db = mongo_database.database() if db is None else db
    settings = get_settings()
    tenant_id = settings.default_tenant_id or "1"
    now_iso = datetime.now(UTC).isoformat()

    # 1. Seed / Upsert Clinic Settings
    admin_email = os.getenv("CLINIC_ADMIN_EMAIL", "clinic-admin@teleconsult.local")
    admin_password = os.getenv("CLINIC_ADMIN_PASSWORD", "AdminPassword123!")
    clinic_name = os.getenv("CLINIC_NAME", "Kaizentrix Care Telehealth Center")
    clinic_tz = os.getenv("CLINIC_TIMEZONE", "Asia/Kolkata")

    clinic_settings_doc = {
        "tenant_id": tenant_id,
        "clinic_name": clinic_name,
        "address": os.getenv("CLINIC_ADDRESS", "742 Medical Center Blvd, San Francisco, CA 94107"),
        "contact_email": os.getenv("CLINIC_CONTACT_EMAIL", "support@kaizentrixcare.local"),
        "contact_phone": os.getenv("CLINIC_CONTACT_PHONE", "+1 (800) 555-KAIZEN"),
        "timezone": clinic_tz,
        "cancellation_deadline_hours": 24,
        "intake_policy": "clinic_configured",
        "prescriptions_enabled": True,
        "operating_hours": os.getenv("CLINIC_OPERATING_HOURS", "Mon - Sat: 08:00 AM - 08:00 PM IST"),
        "authorized_administrators": [admin_email],
        "email_alerts_new_doctor": True,
        "email_alerts_daily_summary": True,
        "email_alerts_payment_failures": True,
        "appointment_types": [{"label": "First Consultation, Follow-up Consultation, Second Opinion, Emergency Consultation, Routine Checkup", "enabled": True}],
        "visit_formats": [{"label": "Video consultation, Audio consultation", "enabled": True}],
        "updated_at": now_iso,
    }
    # 0. Seed / Upsert Primary Clinic Document in `clinics` Collection
    clinic_id = "clinic-001"
    clinic_doc = {
        "id": clinic_id,
        "clinic_id": clinic_id,
        "tenant_id": tenant_id,
        "name": clinic_name,
        "clinic_name": clinic_name,
        "address": os.getenv("CLINIC_ADDRESS", "742 Medical Center Blvd, San Francisco, CA 94107"),
        "contact_email": os.getenv("CLINIC_CONTACT_EMAIL", "support@kaizentrixcare.local"),
        "contact_phone": os.getenv("CLINIC_CONTACT_PHONE", "+1 (800) 555-KAIZEN"),
        "timezone": clinic_tz,
        "operating_hours": os.getenv("CLINIC_OPERATING_HOURS", "Mon - Sat: 08:00 AM - 08:00 PM IST"),
        "active": True,
        "status": "active",
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await db["clinics"].update_one(
        {"tenant_id": tenant_id},
        {"$set": clinic_doc},
        upsert=True,
    )

    await db["clinic_settings"].update_one(
        {"tenant_id": tenant_id},
        {"$set": clinic_settings_doc},
        upsert=True,
    )

    # 2. Seed / Upsert Clinic Administrator User
    hashed_pwd = password_hash(admin_password)
    admin_user_id = "00000000-0000-0000-0000-000000000001"
    await db["users"].update_one(
        {"tenant_id": tenant_id, "email": admin_email},
        {
            "$set": {
                "id": admin_user_id,
                "user_id": admin_user_id,
                "tenant_id": tenant_id,
                "full_name": "Clinic Administrator",
                "email": admin_email,
                "mobile_number": "0000000000",
                "password_hash": hashed_pwd,
                "role": "clinic_admin",
                "verified_at": now_iso,
                "created_at": now_iso,
            }
        },
        upsert=True,
    )

    # 3. Seed / Upsert Default Clinician (Dr. Harshavardhan m v)
    doc_id = "51ae2a4f-3fe9-4ca0-a106-3266454e4171"
    await db["doctors"].update_one(
        {"tenant_id": tenant_id, "id": doc_id},
        {
            "$set": {
                "id": doc_id,
                "user_id": doc_id,
                "user_account_id": doc_id,
                "tenant_id": tenant_id,
                "full_name": "Harshavardhan m v",
                "specialty": "ENT",
                "clinic_name": clinic_name,
                "registration_number": "KMC-HAR3210",
                "qualifications": ["MBBS", "MS (ENT)"],
                "experience_years": 10,
                "languages": ["English", "Hindi", "Kannada"],
                "supported_languages": ["English", "Hindi", "Kannada"],
                "active": True,
                "approved_for_consultation": True,
                "approval_status": "approved",
                "timezone": clinic_tz,
                "fee_paise": 40000,
                "created_at": now_iso,
            }
        },
        upsert=True,
    )

    # 4. Seed / Upsert Default Clinical Service (ENT Follow-up Consultation)
    await db["services"].update_one(
        {"tenant_id": tenant_id, "id": "srv-4df86248"},
        {
            "$set": {
                "id": "srv-4df86248",
                "tenant_id": tenant_id,
                "name": "ENT Follow-up Consultation",
                "specialty": "ENT",
                "duration_minutes": 30,
                "currency": "INR",
                "base_fee": 400,
                "platform_fee": 75,
                "active": True,
                "effective_date": "2026-01-01",
                "assigned_doctors": [doc_id],
                "appointment_types": ["Follow-up Consultation"],
            }
        },
        upsert=True,
    )

    import logging
    logging.getLogger("uvicorn").info(
        f"Clinic credentials ({admin_email}), clinic settings ({clinic_name}), "
        f"clinician ({doc_id}), and services seeded successfully into database."
    )


async def ensure_schema(db=None) -> dict[str, Any]:
    db = mongo_database.database() if db is None else db
    existing = await db.list_collection_names()
    created = []
    for name, validator in COLLECTIONS.items():
        if name not in existing:
            await db.create_collection(name, validator={"$jsonSchema": validator}, validationLevel="strict")
            created.append(name)
        else:
            await db.command({"collMod": name, "validator": {"$jsonSchema": validator}, "validationLevel": "strict"})
        specs = INDEXES.get(name, [])
        if specs:
            await db[name].create_indexes([
                __import__("pymongo").IndexModel(keys, **options) for keys, options in specs
            ])
    await ensure_clinic_seeded(db)
    return {"collections": len(COLLECTIONS), "created": created, "indexed": len(INDEXES)}
