import pytest
from datetime import UTC, datetime
from teleconsult.modules.admin.routes import get_overview
from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal


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

            def limit(self, lim):
                return self

            async def to_list(self, limit):
                return self.items[:limit]

            def __aiter__(self):
                self._iter = iter(self.items)
                return self

            async def __anext__(self):
                try:
                    return next(self._iter)
                except StopIteration:
                    raise StopAsyncIteration

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
        self.cookies = {"teleconsult_session": "test_session_token"}
        self.headers = {}


@pytest.mark.asyncio
async def test_clinic_overview_net_revenue_and_booking_count():
    tenant_id = get_settings().default_tenant_id
    admin_user_id = "admin_user_1"

    # 10 captured payments of 40,000 paise (₹400 each) = ₹4,000
    captured_payments = [
        {"id": f"pay-cap-{i}", "tenant_id": tenant_id, "amount_paise": 40000, "status": "captured"}
        for i in range(10)
    ]
    # 1 refunded payment of 40,000 paise (₹400) = ₹400
    refunded_payments = [
        {"id": "pay-ref-1", "tenant_id": tenant_id, "amount_paise": 40000, "status": "refunded"}
    ]

    payments_col = MockMongoCollection(captured_payments + refunded_payments)
    appointments_col = MockMongoCollection([
        {"id": "apt-101", "tenant_id": tenant_id, "status": "confirmed"}
    ])
    doctors_col = MockMongoCollection([
        {"id": "doc-1", "tenant_id": tenant_id, "approval_status": "approved", "active": True}
    ])

    db = MockDatabase({
        "payments": payments_col,
        "appointments": appointments_col,
        "doctors": doctors_col,
        "audit_logs": MockMongoCollection([]),
        "support_tickets": MockMongoCollection([]),
        "doctor_availability": MockMongoCollection([]),
    })

    import teleconsult.kernel.mongodb.client as mongo_client
    import teleconsult.modules.admin.routes as admin_routes_mod

    original_database = mongo_client.mongo_database.database

    try:
        mongo_client.mongo_database.database = lambda: db

        async def mock_verify_admin(request):
            return Principal(
                user_id=admin_user_id,
                tenant_id=tenant_id,
                roles=frozenset({"clinic_admin"}),
                permissions=frozenset({"clinic:admin"}),
            )

        admin_routes_mod._verify_admin = mock_verify_admin

        req = MockRequest()
        res = await get_overview(request=req, session=None)

        kpis = res["kpis"]
        # Net revenue = ₹4,000 captured - ₹400 refunded = ₹3,600.00
        assert kpis["total_revenue"] == 3600.0
        # Total appointments = 1
        assert kpis["total_appointments"] == 1
        assert kpis["active_doctors"] == 1

    finally:
        mongo_client.mongo_database.database = original_database
