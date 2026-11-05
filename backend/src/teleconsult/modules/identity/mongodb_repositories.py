"""Inactive MongoDB identity repositories for the staged migration."""
from datetime import datetime
from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.collection import AsyncCollection

from teleconsult.kernel.mongodb.repository import MongoRepository, serialize_document


class UserMongoRepository(MongoRepository):
    def __init__(self, collection: AsyncCollection) -> None:
        super().__init__(collection)

    async def find_by_email(self, *, tenant_id: str, email: str) -> dict | None:
        return await self.collection.find_one({"tenant_id": tenant_id, "email": email.strip().lower()})

    async def create_user(self, document: dict[str, Any]) -> dict:
        value = serialize_document(document)
        value["email"] = value["email"].strip().lower()
        await self.collection.insert_one(value)
        return value

    async def set_account_status(self, *, tenant_id: str, user_id: str, restricted_until: datetime | None) -> bool:
        result = await self.collection.update_one(
            {"tenant_id": tenant_id, "id": user_id},
            {"$set": {"restricted_until": restricted_until.isoformat() if restricted_until else None}},
        )
        return result.modified_count == 1


class AuthSessionMongoRepository(MongoRepository):
    async def find_active(self, *, token_hash: str, now: datetime) -> dict | None:
        return await self.collection.find_one({
            "token_hash": token_hash,
            "revoked_at": None,
            "expires_at": {"$gt": now.isoformat()},
        })

    async def revoke(self, *, tenant_id: str, session_id: str, revoked_at: datetime) -> bool:
        result = await self.collection.update_one(
            {"tenant_id": tenant_id, "id": session_id, "revoked_at": None},
            {"$set": {"revoked_at": revoked_at.isoformat()}},
        )
        return result.modified_count == 1


class DoctorMongoRepository(MongoRepository):
    async def approve(self, *, tenant_id: str, doctor_id: str) -> dict | None:
        return await self.collection.find_one_and_update(
            {"tenant_id": tenant_id, "id": doctor_id, "approval_status": "pending"},
            {"$set": {"approval_status": "approved", "active": True, "approved_for_consultation": True}},
            return_document=ReturnDocument.AFTER,
        )

    async def reject(self, *, tenant_id: str, doctor_id: str) -> dict | None:
        return await self.collection.find_one_and_update(
            {"tenant_id": tenant_id, "id": doctor_id, "approval_status": "pending"},
            {"$set": {"approval_status": "rejected", "active": False, "approved_for_consultation": False}},
            return_document=ReturnDocument.AFTER,
        )


class PatientMongoRepository(MongoRepository):
    async def get_owned(self, *, tenant_id: str, patient_id: str, actor_id: str) -> dict | None:
        if patient_id != actor_id:
            return None
        return await self.collection.find_one({"tenant_id": tenant_id, "id": patient_id, "user_id": actor_id})
