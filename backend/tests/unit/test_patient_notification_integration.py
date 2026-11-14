from datetime import UTC, datetime
from uuid import uuid4
import pytest
from teleconsult.kernel.authz.policy import Principal
from teleconsult.modules.notifications.schemas import NotificationResponse
from teleconsult.modules.notifications.service import ensure_patient_notification


class MockMongoCollection:
    def __init__(self, data=None):
        self._data = data or []

    async def find_one(self, query):
        for doc in self._data:
            match = True
            for k, v in query.items():
                if k == "$or":
                    or_match = False
                    for cond in v:
                        if all(doc.get(ck) == cv for ck, cv in cond.items()):
                            or_match = True
                            break
                    if not or_match:
                        match = False
                        break
                elif doc.get(k) != v:
                    match = False
                    break
            if match:
                return doc
        return None

    async def update_one(self, query, update, upsert=False):
        doc = await self.find_one(query)
        if doc:
            if "$set" in update:
                doc.update(update["$set"])
        elif upsert and "$setOnInsert" in update:
            new_doc = dict(update["$setOnInsert"])
            self._data.append(new_doc)

    async def insert_one(self, doc):
        self._data.append(dict(doc))


class MockDatabase:
    def __init__(self, collections=None):
        self._collections = collections or {}

    def __getitem__(self, name):
        if name not in self._collections:
            self._collections[name] = MockMongoCollection()
        return self._collections[name]


@pytest.mark.asyncio
async def test_ensure_patient_notification_idempotency():
    tenant_id = "default_tenant"
    patient_id = "00000000-0000-0000-0000-000000000001"
    appointment_id = "KC-APT-5C330E"

    db = MockDatabase()

    import teleconsult.kernel.mongodb.client as mongo_client
    original_database = mongo_client.mongo_database.database

    try:
        mongo_client.mongo_database.database = lambda: db

        # 1. Call ensure_patient_notification first time
        await ensure_patient_notification(
            tenant_id=tenant_id,
            patient_id=patient_id,
            event_type="appointment_confirmed",
            subject="Appointment Booking Confirmed",
            body="Your appointment for Nov 16, 2026, 10:00 AM IST has been confirmed.",
            appointment_id=appointment_id,
        )

        notifs = db["notifications"]._data
        assert len(notifs) == 1
        assert notifs[0]["event_type"] == "appointment_confirmed"
        assert notifs[0]["appointment_id"] == appointment_id

        # 2. Call ensure_patient_notification second time (duplicate event)
        await ensure_patient_notification(
            tenant_id=tenant_id,
            patient_id=patient_id,
            event_type="appointment_confirmed",
            subject="Appointment Booking Confirmed",
            body="Your appointment for Nov 16, 2026, 10:00 AM IST has been confirmed.",
            appointment_id=appointment_id,
        )

        # Idempotency prevents duplicate insertion
        assert len(db["notifications"]._data) == 1

    finally:
        mongo_client.mongo_database.database = original_database
