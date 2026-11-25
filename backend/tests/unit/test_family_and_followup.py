import pytest
from datetime import UTC, datetime, timedelta
from uuid import uuid4

from teleconsult.kernel.authz.policy import Principal
from teleconsult.modules.patient_portal.routes import (
    create_family_member,
    list_family_members,
    delete_family_member,
    get_patient_follow_up,
    send_patient_follow_up,
)
from teleconsult.modules.patient_portal.schemas import (
    FamilyMemberCreate,
    FollowUpMessageCreate,
)
from teleconsult.modules.consultation.doctor_routes import (
    doctor_get_follow_up,
    doctor_reply_follow_up,
    FollowUpReply,
)


class MockCursor:
    def __init__(self, items):
        self.items = list(items)

    def sort(self, *args, **kwargs):
        return self

    async def to_list(self, length=None):
        return list(self.items[:length] if length else self.items)

    def __aiter__(self):
        self._iter = iter(self.items)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


class MockCollection:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        self.docs.append(dict(doc))
        return type("InsertResult", (), {"inserted_id": doc.get("id")})()

    def find(self, query=None):
        query = query or {}
        matches = []
        for d in self.docs:
            match = True
            for k, v in query.items():
                if k == "$or":
                    or_match = False
                    for sub in v:
                        if all(d.get(sk) == sv for sk, sv in sub.items()):
                            or_match = True
                            break
                    if not or_match:
                        match = False
                        break
                elif k == "patient_id" and isinstance(v, dict) and "$in" in v:
                    if d.get("patient_id") not in v["$in"]:
                        match = False
                        break
                elif k == "deleted_at" and isinstance(v, dict) and "$exists" in v:
                    exists = "deleted_at" in d
                    if exists != v["$exists"]:
                        match = False
                        break
                elif d.get(k) != v:
                    match = False
                    break
            if match:
                matches.append(d)
        return MockCursor(matches)

    async def find_one(self, query=None):
        cursor = self.find(query)
        async for doc in cursor:
            return doc
        return None

    async def update_one(self, query, update, upsert=False):
        matched = 0
        doc = await self.find_one(query)
        if doc:
            matched = 1
            if "$set" in update:
                doc.update(update["$set"])
        return type("UpdateResult", (), {"matched_count": matched})()


class MockDb:
    def __init__(self):
        self.collections = {
            "family_members": MockCollection(),
            "appointments": MockCollection(),
            "followup_chats": MockCollection(),
            "doctors": MockCollection(),
            "patients": MockCollection(),
            "notifications": MockCollection(),
        }

    def __getitem__(self, name):
        if name not in self.collections:
            self.collections[name] = MockCollection()
        return self.collections[name]


@pytest.mark.asyncio
async def test_family_member_crud_lifecycle(monkeypatch):
    mock_db = MockDb()
    from teleconsult.kernel.mongodb.client import mongo_database, MongoDatabase
    monkeypatch.setattr(mongo_database, "database", lambda: mock_db)
    monkeypatch.setattr(MongoDatabase, "enabled", property(lambda self: True))

    patient_principal = Principal(
        user_id="pat-123",
        tenant_id="ten-456",
        roles=frozenset({"patient"}),
        permissions=frozenset({"patient:profile:read", "patient:profile:write"}),
    )

    # 1. Create family member
    payload = FamilyMemberCreate(
        full_name="Aarav Sharma",
        relationship="child",
        gender="male",
        date_of_birth="2018-05-14",
        blood_group="O+",
        allergies="Peanuts",
    )
    res = await create_family_member(payload, principal=patient_principal)
    assert res.full_name == "Aarav Sharma"
    assert res.relationship == "child"
    assert res.patient_id == "pat-123"
    member_id = res.id

    # 2. List family members
    members = await list_family_members(principal=patient_principal)
    assert len(members) == 1
    assert members[0].id == member_id

    # 3. Soft delete family member
    del_res = await delete_family_member(member_id, principal=patient_principal)
    assert del_res["status"] == "deleted"

    # 4. List again (should be empty due to deleted_at filter)
    members_after = await list_family_members(principal=patient_principal)
    assert len(members_after) == 0


@pytest.mark.asyncio
async def test_72_hour_follow_up_eligibility_and_messaging(monkeypatch):
    mock_db = MockDb()
    from teleconsult.kernel.mongodb.client import mongo_database, MongoDatabase
    monkeypatch.setattr(mongo_database, "database", lambda: mock_db)
    monkeypatch.setattr(MongoDatabase, "enabled", property(lambda self: True))

    now = datetime.now(UTC)
    ended_at = now - timedelta(hours=12)

    # Seed an appointment completed 12 hours ago
    apt_id = "apt-test-followup-1"
    await mock_db["appointments"].insert_one({
        "id": apt_id,
        "tenant_id": "ten-456",
        "patient_id": "pat-123",
        "doctor_id": "doc-789",
        "status": "completed",
        "starts_at": (ended_at - timedelta(minutes=30)).isoformat(),
        "ends_at": ended_at.isoformat(),
        "ended_at": ended_at.isoformat(),
    })

    await mock_db["doctors"].insert_one({
        "id": "doc-789",
        "user_id": "doc-789",
        "tenant_id": "ten-456",
        "full_name": "Dr. Priya Patel",
        "specialty": "Cardiology",
        "approval_status": "approved",
        "active": True,
        "approved_for_consultation": True,
    })

    patient_principal = Principal(
        user_id="pat-123",
        tenant_id="ten-456",
        roles=frozenset({"patient"}),
        permissions=frozenset({"appointment:read", "appointment:write"}),
    )

    doctor_principal = Principal(
        user_id="doc-789",
        tenant_id="ten-456",
        roles=frozenset({"doctor"}),
        permissions=frozenset({"doctor:appointment:read", "doctor:appointment:write"}),
    )

    # 1. Patient checks follow-up thread
    status_res = await get_patient_follow_up(apt_id, principal=patient_principal)
    assert status_res["eligible"] is True
    assert status_res["hours_remaining"] > 59.0
    assert status_res["doctor_name"] == "Dr. Priya Patel"
    assert len(status_res["messages"]) == 0

    # 2. Patient sends follow-up question
    msg_payload = FollowUpMessageCreate(message="Can I take this medication before breakfast?")
    sent = await send_patient_follow_up(apt_id, msg_payload, principal=patient_principal)
    assert sent["sender_role"] == "patient"
    assert sent["message"] == "Can I take this medication before breakfast?"

    # 3. Doctor checks follow-up thread
    doc_thread = await doctor_get_follow_up(apt_id, principal=doctor_principal)
    assert len(doc_thread["messages"]) == 1
    assert doc_thread["messages"][0]["message"] == "Can I take this medication before breakfast?"

    # 4. Doctor sends reply
    doc_reply_payload = FollowUpReply(message="Yes, take it with a glass of water 30 mins before breakfast.")
    doc_sent = await doctor_reply_follow_up(apt_id, doc_reply_payload, principal=doctor_principal)
    assert doc_sent["sender_role"] == "doctor"

    # 5. Patient checks thread again and sees both messages
    status_updated = await get_patient_follow_up(apt_id, principal=patient_principal)
    assert len(status_updated["messages"]) == 2
    assert status_updated["messages"][0]["sender_role"] == "patient"
    assert status_updated["messages"][1]["sender_role"] == "doctor"
