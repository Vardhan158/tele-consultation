"""In-memory MongoDB implementation for development and testing environments."""
from __future__ import annotations

import re
from collections.abc import AsyncIterator, Iterable
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from teleconsult.config.settings import get_settings
from teleconsult.modules.identity.auth_routes import password_hash


class InMemoryCursor:
    def __init__(self, docs: list[dict[str, Any]]) -> None:
        self._docs = list(docs)
        self._idx = 0

    def sort(self, key_or_list: Any, direction: int = 1) -> InMemoryCursor:
        if isinstance(key_or_list, list):
            for k, d in reversed(key_or_list):
                self._docs.sort(key=lambda x: _get_nested(x, k) or "", reverse=(d == -1))
        elif isinstance(key_or_list, str):
            self._docs.sort(key=lambda x: _get_nested(x, key_or_list) or "", reverse=(direction == -1))
        return self

    def limit(self, count: int) -> InMemoryCursor:
        self._docs = self._docs[:count]
        return self

    def skip(self, count: int) -> InMemoryCursor:
        self._docs = self._docs[count:]
        return self

    async def to_list(self, length: int | None = None) -> list[dict[str, Any]]:
        if length is not None:
            return [dict(d) for d in self._docs[:length]]
        return [dict(d) for d in self._docs]

    def __iter__(self) -> InMemoryCursor:
        return self

    def __next__(self) -> dict[str, Any]:
        if self._idx < len(self._docs):
            item = dict(self._docs[self._idx])
            self._idx += 1
            return item
        raise StopIteration

    def __aiter__(self) -> InMemoryCursor:
        self._idx = 0
        return self

    async def __anext__(self) -> dict[str, Any]:
        if self._idx < len(self._docs):
            item = dict(self._docs[self._idx])
            self._idx += 1
            return item
        raise StopAsyncIteration


def _get_nested(doc: dict[str, Any], path: str) -> Any:
    parts = path.split(".")
    curr: Any = doc
    for p in parts:
        if isinstance(curr, dict) and p in curr:
            curr = curr[p]
        else:
            return None
    return curr


def _set_nested(doc: dict[str, Any], path: str, val: Any) -> None:
    parts = path.split(".")
    curr = doc
    for p in parts[:-1]:
        if p not in curr or not isinstance(curr[p], dict):
            curr[p] = {}
        curr = curr[p]
    curr[parts[-1]] = val


def _coerce_cmp(a: Any, b: Any) -> tuple[Any, Any]:
    if isinstance(a, datetime) and isinstance(b, str):
        try:
            return a, datetime.fromisoformat(b.replace("Z", "+00:00"))
        except Exception:
            return a.isoformat(), b
    if isinstance(a, str) and isinstance(b, datetime):
        try:
            return datetime.fromisoformat(a.replace("Z", "+00:00")), b
        except Exception:
            return a, b.isoformat()
    return a, b


def _match_query(doc: dict[str, Any], query: dict[str, Any]) -> bool:
    if not query:
        return True
    for key, val in query.items():
        if key == "$or":
            if not any(_match_query(doc, sub) for sub in val):
                return False
            continue
        if key == "$and":
            if not all(_match_query(doc, sub) for sub in val):
                return False
            continue

        doc_val = _get_nested(doc, key)

        if isinstance(val, dict):
            for op, exp in val.items():
                ca, cb = _coerce_cmp(doc_val, exp)
                if op == "$eq" and ca != cb:
                    return False
                if op == "$ne" and ca == cb:
                    return False
                if op == "$in" and doc_val not in exp:
                    return False
                if op == "$nin" and doc_val in exp:
                    return False
                if op == "$gt":
                    if ca is None or cb is None:
                        return False
                    try:
                        if not (ca > cb):
                            return False
                    except TypeError:
                        return False
                if op == "$gte":
                    if ca is None or cb is None:
                        return False
                    try:
                        if not (ca >= cb):
                            return False
                    except TypeError:
                        return False
                if op == "$lt":
                    if ca is None or cb is None:
                        return False
                    try:
                        if not (ca < cb):
                            return False
                    except TypeError:
                        return False
                if op == "$lte":
                    if ca is None or cb is None:
                        return False
                    try:
                        if not (ca <= cb):
                            return False
                    except TypeError:
                        return False
                if op == "$exists":
                    exists = doc_val is not None or key in doc
                    if exists != exp:
                        return False
                if op == "$regex":
                    flags = re.IGNORECASE if val.get("$options") == "i" else 0
                    if not (isinstance(doc_val, str) and re.search(exp, doc_val, flags)):
                        return False
        else:
            if doc_val != val:
                # Type-lenient matching for numbers and UUID strings
                if str(doc_val) != str(val):
                    return False
    return True


class InMemoryCollection:
    def __init__(self, name: str) -> None:
        self.name = name
        self.docs: list[dict[str, Any]] = []

    async def find_one(self, query: dict[str, Any] | None = None, *args: Any, **kwargs: Any) -> dict[str, Any] | None:
        query = query or {}
        for d in self.docs:
            if _match_query(d, query):
                return dict(d)
        return None

    async def find_one_and_update(
        self,
        query: dict[str, Any],
        update: dict[str, Any],
        sort: Any = None,
        return_document: Any = None,
        upsert: bool = False,
        *args: Any,
        **kwargs: Any,
    ) -> dict[str, Any] | None:
        matching = [d for d in self.docs if _match_query(d, query)]
        if matching:
            doc = matching[0]
            old_doc = dict(doc)
            self._apply_update(doc, update)
            if return_document:
                return dict(doc)
            return old_doc
        if upsert:
            new_doc = dict(query)
            if "id" not in new_doc:
                new_doc["id"] = str(uuid4())
            new_doc["_id"] = new_doc["id"]
            self._apply_update(new_doc, update)
            self.docs.append(new_doc)
            return dict(new_doc)
        return None

    def find(self, query: dict[str, Any] | None = None, *args: Any, **kwargs: Any) -> InMemoryCursor:
        query = query or {}
        matches = [dict(d) for d in self.docs if _match_query(d, query)]
        return InMemoryCursor(matches)

    async def insert_one(self, doc: dict[str, Any], *args: Any, **kwargs: Any) -> Any:
        d = dict(doc)
        if "id" not in d and "_id" not in d:
            d["id"] = str(uuid4())
        if "_id" not in d:
            d["_id"] = d.get("id")
        self.docs.append(d)
        return type("InsertOneResult", (), {"inserted_id": d.get("id") or d.get("_id")})()

    async def insert_many(self, docs: Iterable[dict[str, Any]], *args: Any, **kwargs: Any) -> Any:
        inserted_ids = []
        for doc in docs:
            res = await self.insert_one(doc)
            inserted_ids.append(res.inserted_id)
        return type("InsertManyResult", (), {"inserted_ids": inserted_ids})()

    async def update_one(
        self, query: dict[str, Any], update: dict[str, Any], upsert: bool = False, *args: Any, **kwargs: Any
    ) -> Any:
        for doc in self.docs:
            if _match_query(doc, query):
                self._apply_update(doc, update)
                return type("UpdateResult", (), {"matched_count": 1, "modified_count": 1, "upserted_id": None})()
        if upsert:
            new_doc = dict(query)
            if "id" not in new_doc:
                new_doc["id"] = str(uuid4())
            new_doc["_id"] = new_doc["id"]
            self._apply_update(new_doc, update)
            self.docs.append(new_doc)
            return type("UpdateResult", (), {"matched_count": 0, "modified_count": 1, "upserted_id": new_doc["id"]})()
        return type("UpdateResult", (), {"matched_count": 0, "modified_count": 0, "upserted_id": None})()

    async def update_many(
        self, query: dict[str, Any], update: dict[str, Any], upsert: bool = False, *args: Any, **kwargs: Any
    ) -> Any:
        matched = 0
        for doc in self.docs:
            if _match_query(doc, query):
                self._apply_update(doc, update)
                matched += 1
        return type("UpdateResult", (), {"matched_count": matched, "modified_count": matched, "upserted_id": None})()

    async def delete_one(self, query: dict[str, Any], *args: Any, **kwargs: Any) -> Any:
        for i, doc in enumerate(self.docs):
            if _match_query(doc, query):
                del self.docs[i]
                return type("DeleteResult", (), {"deleted_count": 1})()
        return type("DeleteResult", (), {"deleted_count": 0})()

    async def delete_many(self, query: dict[str, Any], *args: Any, **kwargs: Any) -> Any:
        orig_len = len(self.docs)
        self.docs = [d for d in self.docs if not _match_query(d, query)]
        return type("DeleteResult", (), {"deleted_count": orig_len - len(self.docs)})()

    async def count_documents(self, query: dict[str, Any], *args: Any, **kwargs: Any) -> int:
        return sum(1 for d in self.docs if _match_query(d, query))

    async def distinct(self, key: str, query: dict[str, Any] | None = None, *args: Any, **kwargs: Any) -> list[Any]:
        query = query or {}
        values = set()
        for d in self.docs:
            if _match_query(d, query):
                v = _get_nested(d, key)
                if v is not None:
                    values.add(v)
        return list(values)

    async def create_indexes(self, *args: Any, **kwargs: Any) -> list[str]:
        return ["index_created"]

    def _apply_update(self, doc: dict[str, Any], update: dict[str, Any]) -> None:
        if "$set" in update:
            for k, v in update["$set"].items():
                _set_nested(doc, k, v)
        if "$unset" in update:
            for k in update["$unset"]:
                doc.pop(k, None)
        if "$push" in update:
            for k, v in update["$push"].items():
                curr = _get_nested(doc, k) or []
                if not isinstance(curr, list):
                    curr = [curr]
                curr.append(v)
                _set_nested(doc, k, curr)
        if "$pull" in update:
            for k, v in update["$pull"].items():
                curr = _get_nested(doc, k) or []
                if isinstance(curr, list):
                    curr = [x for x in curr if x != v]
                    _set_nested(doc, k, curr)
        if "$inc" in update:
            for k, v in update["$inc"].items():
                curr = _get_nested(doc, k) or 0
                _set_nested(doc, k, curr + v)


class InMemoryDatabase:
    def __init__(self) -> None:
        self.collections: dict[str, InMemoryCollection] = {}

    def __getitem__(self, name: str) -> InMemoryCollection:
        if name not in self.collections:
            self.collections[name] = InMemoryCollection(name)
        return self.collections[name]

    def __contains__(self, name: str) -> bool:
        return True

    async def list_collection_names(self) -> list[str]:
        return list(self.collections.keys())

    async def create_collection(self, name: str, *args: Any, **kwargs: Any) -> InMemoryCollection:
        return self[name]

    async def command(self, cmd: Any, *args: Any, **kwargs: Any) -> dict[str, Any]:
        return {"ok": 1}

    async def drop_collection(self, name: str) -> bool:
        if name in self.collections:
            del self.collections[name]
            return True
        return False


async def seed_enterprise_defaults(db: InMemoryDatabase) -> None:
    """Seed comprehensive test accounts and clinical artifacts across all enterprise roles."""
    settings = get_settings()
    tenant_id = settings.default_tenant_id or "1"
    now = datetime.now(UTC)
    now_iso = now.isoformat()

    # 1. Clinic Admin Account
    admin_id = "00000000-0000-0000-0000-000000000001"
    admin_email = "clinic-admin@teleconsult.local"
    await db["users"].update_one(
        {"tenant_id": tenant_id, "email": admin_email},
        {
            "$set": {
                "id": admin_id,
                "user_id": admin_id,
                "tenant_id": tenant_id,
                "full_name": "Clinic Administrator",
                "email": admin_email,
                "mobile_number": "+918045678900",
                "password_hash": password_hash("AdminPassword123!"),
                "role": "clinic_admin",
                "verified_at": now_iso,
                "created_at": now_iso,
            }
        },
        upsert=True,
    )

    # 2. Doctor Account (Dr. Arvind Rao)
    doc_user_id = "00000000-0000-0000-0000-000000000002"
    doc_id = "51ae2a4f-3fe9-4ca0-a106-3266454e4171"
    doctor_email = "doctor@teleconsult.local"
    await db["users"].update_one(
        {"tenant_id": tenant_id, "email": doctor_email},
        {
            "$set": {
                "id": doc_user_id,
                "user_id": doc_user_id,
                "tenant_id": tenant_id,
                "full_name": "Dr. Arvind Rao",
                "email": doctor_email,
                "mobile_number": "+919876543210",
                "password_hash": password_hash("DoctorPassword123!"),
                "role": "doctor",
                "verified_at": now_iso,
                "created_at": now_iso,
            }
        },
        upsert=True,
    )
    await db["doctors"].update_one(
        {"tenant_id": tenant_id, "id": doc_id},
        {
            "$set": {
                "id": doc_id,
                "user_id": doc_user_id,
                "user_account_id": doc_user_id,
                "tenant_id": tenant_id,
                "full_name": "Dr. Arvind Rao",
                "specialty": "Cardiology",
                "qualification": "MBBS, MD - Cardiology",
                "registration_number": "KMC-2014-98745",
                "experience_years": 12,
                "bio": "Senior Consultant Cardiologist specializing in preventive cardiology and digital teleconsultation.",
                "consultation_fee": 800,
                "approval_status": "approved",
                "active": True,
                "created_at": now_iso,
            }
        },
        upsert=True,
    )
    # Doctor Availability Slots (Next 14 days, daily 09:00 - 17:00)
    for day_offset in range(1, 15):
        slot_date = (now + timedelta(days=day_offset)).strftime("%Y-%m-%d")
        slot_id = f"slot-{doc_id[:8]}-{day_offset}"
        await db["doctor_availability"].update_one(
            {"tenant_id": tenant_id, "id": slot_id},
            {
                "$set": {
                    "id": slot_id,
                    "doctor_id": doc_id,
                    "tenant_id": tenant_id,
                    "date": slot_date,
                    "starts_at": f"{slot_date}T10:00:00Z",
                    "ends_at": f"{slot_date}T10:30:00Z",
                    "slot_duration_minutes": 30,
                    "is_booked": False,
                    "status": "available",
                    "active": True,
                }
            },
            upsert=True,
        )

    # 3. Patient Account (Devika Pillai)
    patient_user_id = "00000000-0000-0000-0000-000000000003"
    patient_id = patient_user_id
    patient_email = "patient@teleconsult.local"
    await db["users"].update_one(
        {"tenant_id": tenant_id, "email": patient_email},
        {
            "$set": {
                "id": patient_user_id,
                "user_id": patient_user_id,
                "tenant_id": tenant_id,
                "full_name": "Devika Pillai",
                "email": patient_email,
                "mobile_number": "+919845012345",
                "password_hash": password_hash("PatientPassword123!"),
                "role": "patient",
                "verified_at": now_iso,
                "created_at": now_iso,
            }
        },
        upsert=True,
    )
    await db["patients"].update_one(
        {"tenant_id": tenant_id, "id": patient_id},
        {
            "$set": {
                "id": patient_id,
                "user_id": patient_user_id,
                "tenant_id": tenant_id,
                "full_name": "Devika Pillai",
                "email": patient_email,
                "mobile_number": "+919845012345",
                "dob": "1990-05-15",
                "gender": "female",
                "blood_group": "B+",
                "allergies": ["Penicillin"],
                "chronic_conditions": ["Mild Hypertension"],
                "emergency_contact": {"name": "Karthik Pillai", "relation": "Spouse", "phone": "+919845099999"},
                "created_at": now_iso,
            }
        },
        upsert=True,
    )

    # Seed Patient Insurance Policy
    policy_id = f"pol-{patient_id[:8]}-01"
    await db["insurance_policies"].update_one(
        {"tenant_id": tenant_id, "id": policy_id},
        {
            "$set": {
                "id": policy_id,
                "tenant_id": tenant_id,
                "patient_id": patient_id,
                "provider_id": "prov-star-health",
                "provider_name": "Star Health & Allied Insurance",
                "provider_code": "STAR_HEALTH",
                "policy_number": "SH-CARE-90231",
                "policy_holder_name": "Devika Pillai",
                "relationship": "self",
                "start_date": "2026-01-01",
                "expiry_date": "2027-01-01",
                "status": "verified",
                "sum_insured": 500000,
                "remaining_balance": 485000,
                "copay_percentage": 10,
                "created_at": now_iso,
            }
        },
        upsert=True,
    )

    # Seed Insurance Provider Master
    await db["insurance_providers"].update_one(
        {"tenant_id": tenant_id, "provider_code": "STAR_HEALTH"},
        {
            "$set": {
                "id": "prov-star-health",
                "tenant_id": tenant_id,
                "provider_name": "Star Health and Allied Insurance",
                "provider_code": "STAR_HEALTH",
                "country": "India",
                "provider_type": "commercial",
                "contact_email": "claims@starhealth.in",
                "status": "active",
                "created_at": now_iso,
            }
        },
        upsert=True,
    )

    # Seed Confirmed Appointment for Patient with Dr. Arvind Rao
    appt_id = f"apt-{patient_id[:8]}-001"
    appt_start = (now + timedelta(days=1)).replace(hour=10, minute=0, second=0).isoformat()
    appt_end = (now + timedelta(days=1)).replace(hour=10, minute=30, second=0).isoformat()
    await db["appointments"].update_one(
        {"tenant_id": tenant_id, "id": appt_id},
        {
            "$set": {
                "id": appt_id,
                "appointment_id": appt_id,
                "tenant_id": tenant_id,
                "patient_id": patient_id,
                "doctor_id": doc_id,
                "doctor_name": "Dr. Arvind Rao",
                "patient_name": "Devika Pillai",
                "specialty": "Cardiology",
                "starts_at": appt_start,
                "ends_at": appt_end,
                "status": "confirmed",
                "type": "video",
                "consultation_mode": "video",
                "payment_status": "captured",
                "payment_amount": 800,
                "created_at": now_iso,
            }
        },
        upsert=True,
    )

    # 4. Support Account
    support_user_id = "00000000-0000-0000-0000-000000000004"
    support_email = "support@teleconsult.local"
    await db["users"].update_one(
        {"tenant_id": tenant_id, "email": support_email},
        {
            "$set": {
                "id": support_user_id,
                "user_id": support_user_id,
                "tenant_id": tenant_id,
                "full_name": "Support Agent Anand",
                "email": support_email,
                "mobile_number": "+918045678901",
                "password_hash": password_hash("SupportPassword123!"),
                "role": "support",
                "verified_at": now_iso,
                "created_at": now_iso,
            }
        },
        upsert=True,
    )

    # 5. SecOps Account
    secops_user_id = "00000000-0000-0000-0000-000000000005"
    secops_email = "secops@teleconsult.local"
    await db["users"].update_one(
        {"tenant_id": tenant_id, "email": secops_email},
        {
            "$set": {
                "id": secops_user_id,
                "user_id": secops_user_id,
                "tenant_id": tenant_id,
                "full_name": "SecOps Officer Priya",
                "email": secops_email,
                "mobile_number": "+918045678902",
                "password_hash": password_hash("SecOpsPassword123!"),
                "role": "secops",
                "verified_at": now_iso,
                "created_at": now_iso,
            }
        },
        upsert=True,
    )

    # 6. Clinic Primary Document & Settings
    await db["clinics"].update_one(
        {"tenant_id": tenant_id},
        {
            "$set": {
                "id": "clinic-001",
                "clinic_id": "clinic-001",
                "tenant_id": tenant_id,
                "name": "Kaizen Care Telehealth Center",
                "clinic_name": "Kaizen Care Telehealth Center",
                "address": "Kaizen Care Health Tower, MG Road, Bengaluru, Karnataka 560001, India",
                "contact_email": "support@kaizencare.in",
                "contact_phone": "+91 80 4567 8900",
                "timezone": "Asia/Kolkata",
                "operating_hours": "Mon - Sat: 08:00 AM - 08:00 PM IST",
                "active": True,
                "status": "active",
                "created_at": now_iso,
            }
        },
        upsert=True,
    )
    await db["clinic_settings"].update_one(
        {"tenant_id": tenant_id},
        {
            "$set": {
                "tenant_id": tenant_id,
                "clinic_name": "Kaizen Care Telehealth Center",
                "address": "Kaizen Care Health Tower, MG Road, Bengaluru, Karnataka 560001, India",
                "contact_email": "support@kaizencare.in",
                "contact_phone": "+91 80 4567 8900",
                "timezone": "Asia/Kolkata",
                "cancellation_deadline_hours": 24,
                "intake_policy": "clinic_configured",
                "prescriptions_enabled": True,
                "operating_hours": "Mon - Sat: 08:00 AM - 08:00 PM IST",
                "authorized_administrators": [admin_email],
                "appointment_types": [{"label": "Video Consultation", "enabled": True}],
                "visit_formats": [{"label": "Video", "enabled": True}],
                "updated_at": now_iso,
            }
        },
        upsert=True,
    )
