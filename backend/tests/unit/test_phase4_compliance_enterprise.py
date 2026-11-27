import pytest
from datetime import UTC, datetime
from uuid import uuid4

from teleconsult.kernel.authz.policy import Principal
from teleconsult.modules.patient_portal.routes import (
    abdm_generate_otp,
    abdm_verify_otp,
    abdm_get_profile,
    abdm_unlink_profile,
    abdm_list_consents,
    abdm_revoke_consent,
    ABHAGenerateOtpRequest,
    ABHAVerifyOtpRequest,
)
from teleconsult.modules.records.clinical_routes import (
    verify_prescription_signature,
)
from teleconsult.modules.admin.routes import (
    get_clinic_audit_logs,
)


class MockCursor:
    def __init__(self, items):
        self.items = list(items)

    def sort(self, *args, **kwargs):
        return self

    def skip(self, n):
        self.items = self.items[n:]
        return self

    def limit(self, n):
        self.items = self.items[:n]
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
                        if all(str(d.get(sk, "")).lower() == str(sv).lower() for sk, sv in sub.items()):
                            or_match = True
                            break
                    if not or_match:
                        match = False
                        break
                elif k == "patient_id" and isinstance(v, dict) and "$in" in v:
                    if d.get("patient_id") not in v["$in"]:
                        match = False
                        break
                elif k == "status" and isinstance(v, dict) and "$in" in v:
                    if d.get("status") not in v["$in"]:
                        match = False
                        break
                elif d.get(k) != v:
                    match = False
                    break
            if match:
                matches.append(d)
        return MockCursor(matches)

    async def find_one(self, query=None, sort=None):
        cursor = self.find(query)
        async for doc in cursor:
            return doc
        return None

    async def count_documents(self, query=None):
        query = query or {}
        count = 0
        async for _ in self.find(query):
            count += 1
        return count

    async def update_one(self, query, update, upsert=False):
        matched = 0
        doc = await self.find_one(query)
        if doc:
            matched = 1
            if "$set" in update:
                doc.update(update["$set"])
        elif upsert:
            new_doc = {}
            for k, v in query.items():
                if not k.startswith("$"):
                    new_doc[k] = v
            if "$set" in update:
                new_doc.update(update["$set"])
            self.docs.append(new_doc)
            matched = 1
        return type("UpdateResult", (), {"matched_count": matched})()


class MockDb:
    def __init__(self):
        self.collections = {}

    def __getitem__(self, name):
        if name not in self.collections:
            self.collections[name] = MockCollection()
        return self.collections[name]


@pytest.mark.asyncio
async def test_abdm_m1_m2_m3_full_lifecycle(monkeypatch):
    """Verifies ABHA generation, OTP verification, profile management, and consent directives."""
    mock_db = MockDb()

    from teleconsult.kernel.mongodb.client import mongo_database, MongoDatabase
    monkeypatch.setattr(mongo_database, "database", lambda: mock_db)
    monkeypatch.setattr(MongoDatabase, "enabled", property(lambda self: True))

    tenant_id = "tenant-abdm"
    patient_id = "pat-abdm-01"
    principal = Principal(
        user_id=patient_id,
        tenant_id=tenant_id,
        roles=frozenset({"patient"}),
        permissions=frozenset({"patient:profile:read", "patient:profile:write"}),
    )

    # Pre-seed patient document
    await mock_db["patients"].insert_one({
        "id": patient_id,
        "tenant_id": tenant_id,
        "full_name": "Dr. Aarav Patel",
        "gender": "Male",
        "date_of_birth": "1990-05-15",
        "phone_number": "9876543210",
    })

    # 1. Generate OTP for Aadhaar
    gen_req = ABHAGenerateOtpRequest(auth_mode="aadhaar", identifier="555544443333")
    gen_resp = await abdm_generate_otp(payload=gen_req, principal=principal)
    assert gen_resp["status"] == "OTP_SENT"
    txn_id = gen_resp["transaction_id"]
    assert txn_id.startswith("txn-")

    # 2. Verify OTP and link ABHA
    verify_req = ABHAVerifyOtpRequest(
        transaction_id=txn_id,
        otp="123456",
        preferred_abha_address="aarav.patel",
    )
    verify_resp = await abdm_verify_otp(payload=verify_req, principal=principal)
    assert verify_resp["status"] == "ACTIVE"
    assert verify_resp["kyc_status"] == "VERIFIED"
    assert verify_resp["abha_address"] == "aarav.patel@abdm"
    assert len(verify_resp["abha_number"].replace("-", "")) == 14
    assert len(verify_resp["abha_number"].split("-")) == 4

    # 3. Retrieve ABHA Profile
    profile_resp = await abdm_get_profile(principal=principal)
    assert profile_resp["linked"] is True
    assert profile_resp["kyc_status"] == "VERIFIED"
    assert profile_resp["abha_address"] == "aarav.patel@abdm"
    assert "ABDM|" in profile_resp["qr_code_data"]

    # 4. List Active ABDM Consents (seeded upon verification)
    consents = await abdm_list_consents(principal=principal)
    assert len(consents) == 1
    assert consents[0]["status"] == "GRANTED"
    assert "Prescription" in consents[0]["hi_types"]
    consent_id = consents[0]["consent_id"]

    # 5. Revoke ABDM Consent
    revoke_resp = await abdm_revoke_consent(consent_id=consent_id, principal=principal)
    assert revoke_resp["status"] == "REVOKED"

    updated_consents = await abdm_list_consents(principal=principal)
    assert updated_consents[0]["status"] == "REVOKED"

    # 6. Unlink ABHA ID
    unlink_resp = await abdm_unlink_profile(principal=principal)
    assert unlink_resp["status"] == "unlinked"

    # Profile should now report not linked
    profile_after = await abdm_get_profile(principal=principal)
    assert profile_after["linked"] is False


@pytest.mark.asyncio
async def test_prescription_cryptographic_digital_signature_verification(monkeypatch):
    """Verifies §65B Indian Evidence Act & EHR Standards 2016 HMAC-SHA256 digital stamp."""
    mock_db = MockDb()

    from teleconsult.kernel.mongodb.client import mongo_database, MongoDatabase
    monkeypatch.setattr(mongo_database, "database", lambda: mock_db)
    monkeypatch.setattr(MongoDatabase, "enabled", property(lambda self: True))

    tenant_id = "tenant-legal"
    patient_id = "patient-legal-01"
    principal = Principal(
        user_id=patient_id,
        tenant_id=tenant_id,
        roles=frozenset({"patient"}),
        permissions=frozenset({"prescription:read"}),
    )

    rx_id = "rx-legal-test-777"
    await mock_db["prescriptions"].insert_one({
        "id": rx_id,
        "tenant_id": tenant_id,
        "patient_id": patient_id,
        "appointment_id": "apt-999",
        "prescriber_name": "Dr. Sunita Deshmukh",
        "released_at": "2026-11-24T12:00:00Z",
        "content": "Tab Amoxicillin 500mg PO TDS x 5 days\nTab Paracetamol 650mg SOS",
    })

    sig_report = await verify_prescription_signature(prescription_id=rx_id, principal=principal)
    assert sig_report["valid"] is True
    assert sig_report["prescription_id"] == rx_id
    assert sig_report["algorithm"] == "SHA-256"
    assert len(sig_report["sha256_fingerprint"]) == 64
    assert sig_report["prescriber_name"] == "Dr. Sunita Deshmukh"
    assert "Section 65B" in sig_report["statutory_compliance"]
    assert "Electronic Health Record" in sig_report["ehr_standards_edition"]
    assert "2016" in sig_report["ehr_standards_edition"]
    assert sig_report["digital_stamp_status"] == "VERIFIED_AUTHENTIC"


@pytest.mark.asyncio
async def test_clinic_audit_trail_explorer(monkeypatch):
    """Verifies Clinic Admin audit logs exploration, action filtering, and pagination."""
    mock_db = MockDb()

    from teleconsult.kernel.mongodb.client import mongo_database, MongoDatabase
    monkeypatch.setattr(mongo_database, "database", lambda: mock_db)
    monkeypatch.setattr(MongoDatabase, "enabled", property(lambda self: True))

    from teleconsult.modules.admin import routes as admin_routes

    tenant_id = "tenant-clinic-main"
    settings = admin_routes.get_settings()
    monkeypatch.setattr(settings, "default_tenant_id", tenant_id)
    monkeypatch.setattr(settings, "mongodb_enabled", True)

    admin_principal = Principal(
        user_id="admin-sec-01",
        tenant_id=tenant_id,
        roles=frozenset({"clinic_admin"}),
        permissions=frozenset({"clinic:admin"}),
    )

    async def mock_admin_verify(req):
        return admin_principal
    monkeypatch.setattr(admin_routes, "_verify_admin", mock_admin_verify)

    admin_req = type("Req", (), {"cookies": {}, "headers": {}})()

    # Pre-seed audit logs
    logs_to_seed = [
        {"id": "aud-1", "tenant_id": tenant_id, "action": "patient.login", "resource_type": "auth", "actor_id": "usr-1", "created_at": "2026-11-24T10:00:00Z"},
        {"id": "aud-2", "tenant_id": tenant_id, "action": "prescription.issued", "resource_type": "clinical", "actor_id": "doc-1", "created_at": "2026-11-24T10:15:00Z"},
        {"id": "aud-3", "tenant_id": tenant_id, "action": "appointment.rescheduled", "resource_type": "booking", "actor_id": "admin-1", "created_at": "2026-11-24T10:30:00Z"},
        {"id": "aud-4", "tenant_id": tenant_id, "action": "prescription.issued", "resource_type": "clinical", "actor_id": "doc-2", "created_at": "2026-11-24T11:00:00Z"},
    ]
    for l in logs_to_seed:
        await mock_db["audit_logs"].insert_one(l)

    # 1. Unfiltered query
    all_res = await get_clinic_audit_logs(request=admin_req, limit=10, skip=0)
    assert all_res["total"] == 4
    assert len(all_res["logs"]) == 4

    # 2. Action filtered query
    filtered_res = await get_clinic_audit_logs(request=admin_req, action="prescription.issued", limit=10, skip=0)
    assert filtered_res["total"] == 2
    assert len(filtered_res["logs"]) == 2
    assert all(l["action"] == "prescription.issued" for l in filtered_res["logs"])

    # 3. Pagination check
    paginated_res = await get_clinic_audit_logs(request=admin_req, limit=2, skip=0)
    assert len(paginated_res["logs"]) == 2
