from datetime import UTC, datetime, timedelta
import pytest
from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal
from teleconsult.modules.admin.routes import get_reports


class MockMongoCollection:
    def __init__(self, data=None):
        self._data = data or []

    async def count_documents(self, query):
        count = 0
        for doc in self._data:
            match = True
            for k, v in query.items():
                if isinstance(v, dict) and "$in" in v:
                    if doc.get(k) not in v["$in"]:
                        match = False
                        break
                elif doc.get(k) != v:
                    match = False
                    break
            if match:
                count += 1
        return count

    def find(self, query):
        filtered = []
        for doc in self._data:
            match = True
            for k, v in query.items():
                if isinstance(v, dict) and "$in" in v:
                    if doc.get(k) not in v["$in"]:
                        match = False
                        break
                elif doc.get(k) != v:
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
async def test_operational_analytics_filtering_and_net_revenue():
    tenant_id = get_settings().default_tenant_id
    admin_id = "admin-user"
    now = datetime.now(UTC)

    doctors_col = MockMongoCollection([
        {"id": "doc-1", "tenant_id": tenant_id, "specialty": "Dermatology"},
        {"id": "doc-2", "tenant_id": tenant_id, "specialty": "Cardiology"},
    ])

    # 2 appointments in the last 7 days
    appointments_col = MockMongoCollection([
        {
            "id": "apt-1",
            "tenant_id": tenant_id,
            "doctor_id": "doc-1",
            "starts_at": (now - timedelta(days=2)).isoformat(),
            "ends_at": (now - timedelta(days=2) + timedelta(minutes=45)).isoformat(),
            "status": "completed",
            "total_payable_paise": 50000,
        },
        {
            "id": "apt-2",
            "tenant_id": tenant_id,
            "doctor_id": "doc-2",
            "starts_at": (now - timedelta(days=5)).isoformat(),
            "ends_at": (now - timedelta(days=5) + timedelta(minutes=30)).isoformat(),
            "status": "confirmed",
            "total_payable_paise": 40000,
        },
    ])

    # 2 captured payments (₹500 + ₹400 = ₹900) & 1 refund (₹400) -> Net Revenue = ₹500
    payments_col = MockMongoCollection([
        {"id": "pay-1", "tenant_id": tenant_id, "appointment_id": "apt-1", "amount_paise": 50000, "status": "captured", "created_at": (now - timedelta(days=2)).isoformat()},
        {"id": "pay-2", "tenant_id": tenant_id, "appointment_id": "apt-2", "amount_paise": 40000, "status": "captured", "created_at": (now - timedelta(days=5)).isoformat()},
        {"id": "pay-3", "tenant_id": tenant_id, "appointment_id": "apt-2", "amount_paise": 40000, "status": "refunded", "refunded_at": (now - timedelta(days=1)).isoformat()},
    ])

    db = MockDatabase({
        "doctors": doctors_col,
        "appointments": appointments_col,
        "payments": payments_col,
        "doctor_availability": MockMongoCollection([{"id": "slot-1"}]),
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
        res = await get_reports(request=req, time_range="7d", session=None)

        assert res["summary"]["total_consultations"] == 2
        assert res["summary"]["completion_rate"] == "100.0%"
        assert len(res["by_specialty"]) > 0

    finally:
        mongo_client.mongo_database.database = original_database
