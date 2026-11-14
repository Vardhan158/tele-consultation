import base64
from datetime import UTC, datetime
from uuid import uuid4
import pytest
from fastapi import HTTPException
from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal
from teleconsult.modules.identity.doctor_routes import get_doctor_credentials, upload_doctor_credentials


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
        elif upsert:
            new_doc = dict(update.get("$set", {}))
            if "$setOnInsert" in update:
                new_doc.update(update["$setOnInsert"])
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
    def __init__(self, query_params=None):
        self.query_params = query_params or {}


@pytest.mark.asyncio
async def test_doctor_credentials_mongo_persistence_and_access():
    tenant_id = get_settings().default_tenant_id
    doctor_id = "doc-arjun-101"
    admin_id = "admin-1"
    str_content = "PDF-SAMPLE-CREDENTIAL-BYTES"
    b64_content = base64.b64encode(str_content.encode()).decode("utf-8")

    doctors_col = MockMongoCollection([
        {"id": doctor_id, "tenant_id": tenant_id, "full_name": "Dr. Arjun Kumar"}
    ])
    credentials_col = MockMongoCollection([
        {
            "id": "cred-1",
            "tenant_id": tenant_id,
            "doctor_id": doctor_id,
            "file_name": "arjun_license.pdf",
            "content_type": "application/pdf",
            "storage_key": f"{tenant_id}/doc-arjun-101.pdf",
            "file_data_base64": b64_content,
        }
    ])

    db = MockDatabase({
        "doctors": doctors_col,
        "doctor_credentials": credentials_col,
    })

    import teleconsult.kernel.mongodb.client as mongo_client
    import teleconsult.kernel.authz.policy as policy_mod
    original_database = mongo_client.mongo_database.database

    try:
        mongo_client.mongo_database.database = lambda: db

        # 1. Test Admin Access (Allowed)
        async def mock_admin_principal(request):
            return Principal(
                user_id=admin_id,
                tenant_id=tenant_id,
                roles=frozenset({"clinic_admin"}),
                permissions=frozenset({"clinic:doctor:read"}),
            )

        policy_mod.get_principal = mock_admin_principal

        req = MockRequest(query_params={"inline": "true"})
        res = await get_doctor_credentials(doctor_id=doctor_id, request=req)

        assert res.body.decode() == str_content
        assert res.headers["content-type"] == "application/pdf"
        assert 'inline; filename="arjun_license.pdf"' in res.headers["content-disposition"]

        # 2. Test Unauthorized Access (Forbidden)
        async def mock_unauthorized_principal(request):
            return Principal(
                user_id="random_patient_99",
                tenant_id=tenant_id,
                roles=frozenset({"patient"}),
                permissions=frozenset({"patient:profile:read"}),
            )

        policy_mod.get_principal = mock_unauthorized_principal

        with pytest.raises(HTTPException) as exc_info:
            await get_doctor_credentials(doctor_id=doctor_id, request=req)
        assert exc_info.value.status_code == 403

    finally:
        mongo_client.mongo_database.database = original_database
