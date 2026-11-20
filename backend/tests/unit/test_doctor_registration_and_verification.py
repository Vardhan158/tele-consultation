import base64
from datetime import UTC, datetime, timedelta
from uuid import uuid4
import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.policy import Principal
from teleconsult.modules.identity.doctor_routes import (
    DoctorRegistration,
    approve_doctor,
    download_doctor_document,
    get_doctor_credentials,
    list_doctor_documents,
    reject_doctor,
)


class MockMongoCollection:
    def __init__(self, data=None):
        self._data = [dict(d) for d in (data or [])]

    async def find_one(self, query):
        for doc in self._data:
            match = True
            for k, v in query.items():
                if k == "$or":
                    or_match = False
                    for cond in v:
                        if all(doc.get(ck) == cv if not isinstance(cv, dict) else (
                            doc.get(ck) in cv.get("$in", []) if "$in" in cv else False
                        ) for ck, cv in cond.items()):
                            or_match = True
                            break
                    if not or_match:
                        match = False
                        break
                elif isinstance(v, dict) and "$in" in v:
                    if doc.get(k) not in v["$in"]:
                        match = False
                        break
                elif doc.get(k) != v:
                    match = False
                    break
            if match:
                return dict(doc)
        return None

    def find(self, query):
        filtered = []
        for doc in self._data:
            match = True
            for k, v in query.items():
                if k == "$or":
                    or_match = False
                    for cond in v:
                        if all(doc.get(ck) == cv if not isinstance(cv, dict) else (
                            doc.get(ck) in cv.get("$in", []) if "$in" in cv else False
                        ) for ck, cv in cond.items()):
                            or_match = True
                            break
                    if not or_match:
                        match = False
                        break
                elif isinstance(v, dict) and "$in" in v:
                    if doc.get(k) not in v["$in"]:
                        match = False
                        break
                elif doc.get(k) != v:
                    match = False
                    break
            if match:
                filtered.append(dict(doc))

        class AsyncCursor:
            def __init__(self, items):
                self._items = items

            async def to_list(self, limit):
                return [dict(x) for x in self._items[:limit]]

        return AsyncCursor(filtered)

    async def update_one(self, query, update, upsert=False):
        class UpdateResult:
            def __init__(self, matched, modified):
                self.matched_count = matched
                self.modified_count = modified
                self.upserted_id = None

        doc = await self.find_one(query)
        if doc:
            for item in self._data:
                if item.get("id") == doc.get("id") or item.get("doctor_id") == doc.get("doctor_id"):
                    if "$set" in update:
                        item.update(update["$set"])
                    return UpdateResult(1, 1)
        elif upsert:
            new_doc = dict(update.get("$set", {}))
            self._data.append(new_doc)
            return UpdateResult(0, 1)
        return UpdateResult(0, 0)

    async def update_many(self, query, update):
        class UpdateResult:
            def __init__(self, count):
                self.matched_count = count
                self.modified_count = count

        matched = 0
        for doc in self._data:
            match = True
            for k, v in query.items():
                if k == "$or":
                    or_match = any(all(doc.get(ck) == cv for ck, cv in cond.items()) for cond in v)
                    if not or_match:
                        match = False
                        break
                elif doc.get(k) != v:
                    match = False
                    break
            if match:
                matched += 1
                if "$set" in update:
                    doc.update(update["$set"])
        return UpdateResult(matched)

    async def insert_one(self, doc):
        self._data.append(dict(doc))

    async def insert_many(self, docs):
        self._data.extend([dict(d) for d in docs])


class MockDatabase:
    def __init__(self, collections=None):
        self._collections = collections or {}

    def __getitem__(self, name):
        if name not in self._collections:
            self._collections[name] = MockMongoCollection()
        return self._collections[name]


class MockRequest:
    def __init__(self, query_params=None, json_body=None):
        self.query_params = query_params or {}
        self._json_body = json_body or {}
        self.headers = {"content-type": "application/json"}

    async def json(self):
        return self._json_body


def test_doctor_registration_model_indian_telemedicine_fields():
    # 1. Valid Registration with all Indian Telemedicine fields
    valid_data = {
        "full_name": "Dr. Ramesh Chandra",
        "email": "dr.ramesh@telehealth.in",
        "mobile_number": "9876543210",
        "date_of_birth": "1988-06-15",
        "gender": "Male",
        "state": "Karnataka",
        "state_of_practice": "Karnataka",
        "specialty": "Cardiology",
        "registration_number": "KMC-45678",
        "medical_council": "Karnataka Medical Council",
        "qualifications": ["MBBS", "MD", "DM"],
        "experience_years": 12,
        "languages": ["English", "Hindi", "Kannada"],
        "password": "SecurePassword123#",
    }
    doctor_reg = DoctorRegistration(**valid_data)
    assert doctor_reg.full_name == "Dr. Ramesh Chandra"
    assert doctor_reg.mobile_number == "9876543210"
    assert doctor_reg.date_of_birth == "1988-06-15"
    assert doctor_reg.gender == "Male"
    assert doctor_reg.medical_council == "Karnataka Medical Council"
    assert doctor_reg.experience_years == 12

    # 2. Date of Birth age < 21 must be rejected
    underage_dob = (datetime.now(UTC).date() - timedelta(days=20 * 365)).strftime("%Y-%m-%d")
    with pytest.raises(ValidationError) as exc_info:
        DoctorRegistration(**{**valid_data, "date_of_birth": underage_dob})
    assert "at least 21" in str(exc_info.value)

    # 3. Mobile Number must be exactly 10 digits
    with pytest.raises(ValidationError) as exc_info:
        DoctorRegistration(**{**valid_data, "mobile_number": "1234567"})
    assert "Mobile number must be exactly 10 digits" in str(exc_info.value)

    # 4. Mobile number with +91 prefix is cleaned to 10 digits
    reg_with_prefix = DoctorRegistration(**{**valid_data, "mobile_number": "+91 9876543210"})
    assert reg_with_prefix.mobile_number == "+91 9876543210"


@pytest.mark.asyncio
async def test_doctor_document_listing_and_download(monkeypatch: pytest.MonkeyPatch):
    tenant_id = get_settings().default_tenant_id
    doctor_id = "doc-telemed-202"
    admin_id = "admin-gov-1"

    mbbs_bytes = b"%PDF-1.4 MBBS Degree Certificate"
    council_bytes = b"%PDF-1.4 State Council Registration Certificate"
    id_bytes = b"%PDF-1.4 Government Aadhaar Card"

    doctors_col = MockMongoCollection([
        {
            "id": doctor_id,
            "user_id": doctor_id,
            "tenant_id": tenant_id,
            "full_name": "Dr. Priya Sharma",
            "approval_status": "pending",
            "active": False,
            "registration_number": "DMC-89012",
        }
    ])

    credentials_col = MockMongoCollection([
        {
            "id": "cred-council-1",
            "tenant_id": tenant_id,
            "doctor_id": doctor_id,
            "document_type": "medical_council_certificate",
            "document_title": "Medical Council Registration Certificate",
            "file_name": "council_cert.pdf",
            "content_type": "application/pdf",
            "size_bytes": len(council_bytes),
            "file_data_base64": base64.b64encode(council_bytes).decode(),
            "status": "pending_verification",
            "created_at": datetime.now(UTC),
        },
        {
            "id": "cred-mbbs-2",
            "tenant_id": tenant_id,
            "doctor_id": doctor_id,
            "document_type": "qualification_certificate",
            "document_title": "Recognized Medical Qualification Certificate (MBBS / Applicable)",
            "file_name": "mbbs_degree.pdf",
            "content_type": "application/pdf",
            "size_bytes": len(mbbs_bytes),
            "file_data_base64": base64.b64encode(mbbs_bytes).decode(),
            "status": "pending_verification",
            "created_at": datetime.now(UTC),
        },
        {
            "id": "cred-id-3",
            "tenant_id": tenant_id,
            "doctor_id": doctor_id,
            "document_type": "identity_proof",
            "document_title": "Government-Issued Identity Proof",
            "file_name": "aadhaar.pdf",
            "content_type": "application/pdf",
            "size_bytes": len(id_bytes),
            "file_data_base64": base64.b64encode(id_bytes).decode(),
            "status": "pending_verification",
            "created_at": datetime.now(UTC),
        },
    ])

    db = MockDatabase({
        "doctors": doctors_col,
        "doctor_credentials": credentials_col,
    })

    import teleconsult.kernel.mongodb.client as mongo_client
    import teleconsult.kernel.authz.policy as policy_mod

    monkeypatch.setattr(get_settings(), "mongodb_enabled", True)
    monkeypatch.setattr(mongo_client.mongo_database, "database", lambda: db)

    async def mock_admin_principal(request):
        return Principal(
            user_id=admin_id,
            tenant_id=tenant_id,
            roles=frozenset({"clinic_admin"}),
            permissions=frozenset({"clinic:doctor:read"}),
        )

    monkeypatch.setattr(policy_mod, "get_principal", mock_admin_principal)

    req = MockRequest()
    docs = await list_doctor_documents(doctor_id=doctor_id, request=req)
    assert len(docs) == 3
    doc_types = [d["document_type"] for d in docs]
    assert "medical_council_certificate" in doc_types
    assert "qualification_certificate" in doc_types
    assert "identity_proof" in doc_types

    # Download MBBS qualification certificate
    download_req = MockRequest(query_params={"inline": "true"})
    mbbs_resp = await download_doctor_document(
        doctor_id=doctor_id,
        document_type="qualification_certificate",
        request=download_req,
    )
    assert mbbs_resp.body == mbbs_bytes
    assert mbbs_resp.headers["content-type"] == "application/pdf"
    assert 'inline; filename="mbbs_degree.pdf"' in mbbs_resp.headers["content-disposition"]


@pytest.mark.asyncio
async def test_doctor_approval_and_rejection_flow_with_audit_logs(monkeypatch: pytest.MonkeyPatch):
    tenant_id = get_settings().default_tenant_id
    doctor_id = "doc-telemed-303"
    admin_id = "admin-gov-2"

    doctors_col = MockMongoCollection([
        {
            "id": doctor_id,
            "user_id": doctor_id,
            "tenant_id": tenant_id,
            "full_name": "Dr. Ananya Roy",
            "approval_status": "pending",
            "active": False,
            "approved_for_consultation": False,
            "registration_number": "WBMC-67890",
        }
    ])

    credentials_col = MockMongoCollection([
        {
            "id": "cred-1",
            "tenant_id": tenant_id,
            "doctor_id": doctor_id,
            "document_type": "medical_council_certificate",
            "status": "pending_verification",
            "created_at": datetime.now(UTC),
        }
    ])

    audit_logs_col = MockMongoCollection([])

    db = MockDatabase({
        "doctors": doctors_col,
        "doctor_credentials": credentials_col,
        "audit_logs": audit_logs_col,
    })

    import teleconsult.kernel.mongodb.client as mongo_client
    import teleconsult.kernel.authz.policy as policy_mod

    monkeypatch.setattr(get_settings(), "mongodb_enabled", True)
    monkeypatch.setattr(mongo_client.mongo_database, "database", lambda: db)

    async def mock_admin_principal(request):
        return Principal(
            user_id=admin_id,
            tenant_id=tenant_id,
            roles=frozenset({"clinic_admin"}),
            permissions=frozenset({"clinic:doctor:approve", "clinic:doctor:read"}),
        )

    monkeypatch.setattr(policy_mod, "get_principal", mock_admin_principal)

    # 1. Admin Approves Doctor with verification notes
    approve_req = MockRequest(json_body={"notes": "All 3 mandatory Indian telemedicine credentials verified against NMC portal."})
    approve_res = await approve_doctor(doctor_id=doctor_id, request=approve_req)
    assert approve_res["status"] == "approved"

    # Verify doctor record in DB
    updated_doc = await doctors_col.find_one({"id": doctor_id})
    assert updated_doc["approval_status"] == "approved"
    assert updated_doc["active"] is True
    assert updated_doc["approved_for_consultation"] is True
    assert updated_doc["approval_reason"] == "All 3 mandatory Indian telemedicine credentials verified against NMC portal."

    # Verify credential record in DB
    updated_cred = await credentials_col.find_one({"doctor_id": doctor_id})
    assert updated_cred["status"] == "approved"

    # Verify audit log recorded
    assert len(audit_logs_col._data) == 1
    assert audit_logs_col._data[0]["action"] == "doctor.approval"
    assert audit_logs_col._data[0]["metadata"]["decision"] == "approved"

    # 2. Admin Rejects Doctor with specific reason
    reject_req = MockRequest(json_body={"reason": "State medical council certificate is expired; renewal proof required."})
    reject_res = await reject_doctor(doctor_id=doctor_id, request=reject_req)
    assert reject_res["status"] == "rejected"
    assert reject_res["reason"] == "State medical council certificate is expired; renewal proof required."

    rejected_doc = await doctors_col.find_one({"id": doctor_id})
    assert rejected_doc["approval_status"] == "rejected"
    assert rejected_doc["active"] is False
    assert rejected_doc["approved_for_consultation"] is False
    assert rejected_doc["rejection_reason"] == "State medical council certificate is expired; renewal proof required."

    # Verify credential record updated to rejected
    updated_cred_rej = await credentials_col.find_one({"doctor_id": doctor_id})
    assert updated_cred_rej["status"] == "rejected"

    # Verify second audit log recorded
    assert len(audit_logs_col._data) == 2
    assert audit_logs_col._data[1]["action"] == "doctor.rejection"
    assert audit_logs_col._data[1]["metadata"]["decision"] == "rejected"
