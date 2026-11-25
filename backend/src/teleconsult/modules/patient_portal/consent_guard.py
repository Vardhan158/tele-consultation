from uuid import UUID

from fastapi import HTTPException

from teleconsult.kernel.mongodb.client import mongo_database


async def require_active_consent(tenant_id: UUID | str, patient_id: UUID | str, consent_types: set[str]) -> None:
    if not mongo_database.enabled:
        raise HTTPException(status_code=503, detail="Database unavailable")
    db = mongo_database.database()

    type_aliases = {
        "teleconsultation": {"teleconsultation", "telehealth", "treatment"},
        "telehealth": {"teleconsultation", "telehealth", "treatment"},
        "treatment": {"teleconsultation", "telehealth", "treatment"},
    }
    all_query_types = set()
    for t in consent_types:
        all_query_types.update(type_aliases.get(t, {t}))

    cursor = db["consents"].find({
        "tenant_id": str(tenant_id),
        "patient_id": str(patient_id),
        "consent_type": {"$in": list(all_query_types)},
        "status": "granted",
        "withdrawn_at": {"$exists": False},
    })
    rows = await cursor.to_list(100)
    active = {row.get("consent_type") for row in rows}

    for req in consent_types:
        allowed = type_aliases.get(req, {req})
        if not (allowed & active):
            raise HTTPException(status_code=403, detail="Required consent has not been granted or has been withdrawn")
