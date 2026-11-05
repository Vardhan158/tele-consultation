from typing import Any

from pymongo import ASCENDING, DESCENDING

from teleconsult.kernel.mongodb.client import mongo_database

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
    "user_sessions": {"bsonType": "object", "required": ["tenant_id", "user_id", "token_hash"]},
    "mfa_credentials": {"bsonType": "object", "required": ["tenant_id", "user_id"]},
    "user_settings": {"bsonType": "object", "required": ["tenant_id", "user_id"]},
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
}


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
    return {"collections": len(COLLECTIONS), "created": created, "indexed": len(INDEXES)}
