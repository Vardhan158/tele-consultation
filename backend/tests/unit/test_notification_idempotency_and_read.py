from datetime import UTC, datetime
from uuid import uuid4
import pytest
from teleconsult.kernel.authz.policy import Principal
from teleconsult.modules.notifications.patient_routes import mark_all_read, list_notifications
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

    def find(self, query):
        filtered = []
        for doc in self._data:
            match = True
            for k, v in query.items():
                if k == "tenant_id" and doc.get("tenant_id") != v:
                    match = False
                    break
                elif k == "$or":
                    or_match = False
                    for cond in v:
                        if all(doc.get(ck) == cv or (isinstance(cv, dict) and "$in" in cv and doc.get(ck) in cv["$in"]) for ck, cv in cond.items()):
                            or_match = True
                            break
                    if not or_match:
                        match = False
                        break
            if match:
                filtered.append(doc)

        class Cursor:
            def __init__(self, items):
                self.items = items

            def sort(self, key, order):
                return self

            async def to_list(self, limit):
                return self.items[:limit]

        return Cursor(filtered)

    async def update_many(self, query, update):
        for doc in self._data:
            doc.update(update.get("$set", {}))

    async def update_one(self, query, update, upsert=False):
        doc = await self.find_one(query)
        if doc:
            doc.update(update.get("$set", {}))
        elif upsert:
            new_doc = dict(update.get("$setOnInsert", {}))
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
async def test_notification_read_all_and_no_recreation():
    tenant_id = "default_tenant"
    patient_id = "00000000-0000-0000-0000-000000000001"
    appointment_id = "KC-APT-5C330E"

    db = MockDatabase()

    import teleconsult.kernel.mongodb.client as mongo_client
    original_database = mongo_client.mongo_database.database

    try:
        mongo_client.mongo_database.database = lambda: db

        # 1. Create notification
        await ensure_patient_notification(
            tenant_id=tenant_id,
            patient_id=patient_id,
            event_type="appointment_confirmed",
            subject="Appointment Booking Confirmed",
            body="Your appointment for Nov 16, 2026, 10:00 AM IST has been confirmed.",
            appointment_id=appointment_id,
        )

        assert len(db["notifications"]._data) == 1
        assert db["notifications"]._data[0]["read_at"] is None

        # 2. Mark all as read
        principal = Principal(
            user_id=patient_id,
            tenant_id=tenant_id,
            roles=frozenset({"patient"}),
            permissions=frozenset({"notification:read"}),
        )
        await mark_all_read(session=None, principal=principal)

        assert db["notifications"]._data[0]["read_at"] is not None
        assert db["notifications"]._data[0]["status"] == "read"

        # 3. Ensure calling ensure_patient_notification again does NOT recreate an unread record
        await ensure_patient_notification(
            tenant_id=tenant_id,
            patient_id=patient_id,
            event_type="appointment_confirmed",
            subject="Appointment Booking Confirmed",
            body="Your appointment for Nov 16, 2026, 10:00 AM IST has been confirmed.",
            appointment_id=appointment_id,
        )

        # Count remains 1 and read_at remains populated!
        assert len(db["notifications"]._data) == 1
        assert db["notifications"]._data[0]["read_at"] is not None

    finally:
        mongo_client.mongo_database.database = original_database
