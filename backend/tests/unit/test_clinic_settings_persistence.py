import pytest
from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal
from teleconsult.modules.admin.routes import get_clinic_settings, update_clinic_settings, ClinicSettingsPayload

class MockMongoCollection:
    def __init__(self, data=None):
        self._data = data or []

    async def find_one(self, query):
        for doc in self._data:
            match = True
            for k, v in query.items():
                if doc.get(k) != v:
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
        elif upsert:
            new_doc = dict(update.get("$set", {}))
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


class MockRequest:
    def __init__(self):
        self.cookies = {"teleconsult_session": "test_session"}


@pytest.mark.asyncio
async def test_clinic_settings_cancellation_deadline_persistence():
    tenant_id = get_settings().default_tenant_id
    admin_id = "admin-user"

    db = MockDatabase({
        "clinic_settings": MockMongoCollection([
            {
                "tenant_id": tenant_id,
                "clinic_name": "Kaizen Care Telehealth Center",
                "address": "Kaizen Care Health Tower, MG Road, Bengaluru, Karnataka 560001, India",
                "contact_email": "support@kaizencare.in",
                "contact_phone": "+91 80 4567 8900",
                "timezone": "Asia/Kolkata",
                "cancellation_deadline_hours": 24,
            }
        ]),
        "audit_logs": MockMongoCollection([]),
    })

    import teleconsult.kernel.mongodb.client as mongo_client
    import teleconsult.modules.admin.routes as admin_routes_mod

    original_database = mongo_client.mongo_database.database

    try:
        mongo_client.mongo_database.database = lambda: db

        async def mock_verify_admin(request):
            return Principal(
                user_id=admin_id,
                tenant_id=tenant_id,
                roles=frozenset({"clinic_admin"}),
                permissions=frozenset({"clinic:admin"}),
            )

        admin_routes_mod._verify_admin = mock_verify_admin
        req = MockRequest()

        # 1. Fetch initial settings (24 hours)
        initial = await get_clinic_settings(request=req)
        assert initial["cancellation_deadline_hours"] == 24
        assert initial["clinic_name"] == "Kaizen Care Telehealth Center"
        assert "Bengaluru" in initial["address"]

        # 2. Update Cancellation Deadline from 24 to 12 hours
        payload_12 = ClinicSettingsPayload(
            clinic_name="Kaizen Care Telehealth Center",
            address="Kaizen Care Health Tower, MG Road, Bengaluru, Karnataka 560001, India",
            contact_email="support@kaizencare.in",
            contact_phone="+91 80 4567 8900",
            timezone="Asia/Kolkata",
            cancellation_deadline_hours=12,
            intake_policy="clinic_configured",
            prescriptions_enabled=True,
            operating_hours="Mon - Sat: 08:00 AM - 08:00 PM IST",
            authorized_administrators=["admin@kaizencare.in"],
        )
        await update_clinic_settings(payload=payload_12, request=req)

        # 3. Query settings again (Verify value remains 12)
        updated = await get_clinic_settings(request=req)
        assert updated["cancellation_deadline_hours"] == 12

        # 4. Restore Cancellation Deadline back to 24 hours
        payload_24 = ClinicSettingsPayload(
            clinic_name="Kaizen Care Telehealth Center",
            address="Kaizen Care Health Tower, MG Road, Bengaluru, Karnataka 560001, India",
            contact_email="support@kaizencare.in",
            contact_phone="+91 80 4567 8900",
            timezone="Asia/Kolkata",
            cancellation_deadline_hours=24,
            intake_policy="clinic_configured",
            prescriptions_enabled=True,
            operating_hours="Mon - Sat: 08:00 AM - 08:00 PM IST",
            authorized_administrators=["admin@kaizencare.in"],
        )
        await update_clinic_settings(payload=payload_24, request=req)

        # 5. Final query (Verify value restored to 24)
        restored = await get_clinic_settings(request=req)
        assert restored["cancellation_deadline_hours"] == 24

    finally:
        mongo_client.mongo_database.database = original_database
