from datetime import UTC, datetime
from typing import Any
import re
from io import BytesIO
from starlette.datastructures import UploadFile
from fastapi import HTTPException
import pytest
from teleconsult.kernel.authz.policy import Principal
from teleconsult.modules.insurance.routes import (
    list_active_insurance_providers,
    list_patient_insurance_policies,
    mask_policy_number,
    register_patient_insurance_policy,
    get_patient_insurance_policy,
    update_patient_insurance_policy,
    toggle_patient_insurance_policy_status,
    download_insurance_document,
    preview_insurance_document,
    check_appointment_claim_eligibility,
    initiate_appointment_insurance_claim,
    get_appointment_claim_dossier,
    upload_claim_supporting_document,
    delete_patient_insurance_document,
    download_claim_invoice,
    preview_claim_invoice,
    download_claim_receipt,
    preview_claim_receipt,
    get_claim_consent_document_definition,
    get_appointment_claim_consent,
    grant_appointment_claim_consent,
    withdraw_appointment_claim_consent,
    submit_or_draft_appointment_claim,
    list_patient_insurance_claims,
    get_patient_insurance_claim_detail,
    list_clinic_admin_insurance_claims,
    get_clinic_admin_insurance_claim_detail,
    verify_clinic_admin_insurance_claim,
    resubmit_patient_insurance_claim,
    get_clinic_admin_claim_document_package,
    submit_claim_to_insurer,
    update_insurer_claim_status,
    upload_patient_additional_document,
    submit_patient_additional_documents,
    upload_reimbursement_evidence,
    record_claim_reimbursement,
    get_clinic_admin_claim_reimbursements,
    get_patient_claim_reimbursements,
    mask_transaction_reference,
)
from teleconsult.kernel.authz.mongodb_policy import MongoPrincipal
from teleconsult.modules.insurance.schemas import (
    InsuranceProviderCreate,
    InsuranceProviderStatusUpdate,
    ClaimInitiateRequest,
    ClaimConsentGrantRequest,
    ClaimSubmissionRequest,
    ClinicAdminClaimVerifyRequest,
    ClaimDocumentVerificationItem,
    PatientClaimResubmitRequest,
    SubmitToInsurerRequest,
    InsurerStatusUpdateRequest,
    PatientSubmitAdditionalDocsRequest,
    RecordReimbursementRequest,
)


class MockCursor:
    def __init__(self, docs: list[dict[str, Any]]):
        self._docs = docs

    def sort(self, key: str, direction: int = 1) -> "MockCursor":
        reverse = direction < 0
        self._docs = sorted(self._docs, key=lambda x: str(x.get(key, "")), reverse=reverse)
        return self

    def __aiter__(self):
        self._iter = iter(self._docs)
        return self

    async def __anext__(self):
        try:
            return next(self._iter)
        except StopIteration:
            raise StopAsyncIteration


class InMemoryMongoCollection:
    def __init__(self):
        self.docs: list[dict[str, Any]] = []

    def _matches(self, doc: dict[str, Any], query: dict[str, Any]) -> bool:
        for k, v in query.items():
            if k == "$or":
                sub_matches = any(self._matches(doc, cond) for cond in v)
                if not sub_matches:
                    return False
                continue
            doc_val = doc.get(k)
            if isinstance(v, dict):
                if "$in" in v:
                    if doc_val not in v["$in"]:
                        return False
                if "$nin" in v:
                    if doc_val in v["$nin"]:
                        return False
                if "$ne" in v:
                    if doc_val == v["$ne"]:
                        return False
                if "$regex" in v:
                    pattern = v["$regex"]
                    flags = re.IGNORECASE if v.get("$options") == "i" else 0
                    if not re.search(pattern, str(doc_val or ""), flags):
                        return False
                if "$exists" in v:
                    exists = (k in doc and doc[k] is not None)
                    if exists != v["$exists"]:
                        return False
            else:
                if doc_val != v:
                    return False
        return True

    async def insert_one(self, doc: dict[str, Any]) -> Any:
        self.docs.append(dict(doc))
        return type("Result", (), {"inserted_id": doc.get("id")})()

    async def find_one(self, query: dict[str, Any]) -> dict[str, Any] | None:
        for doc in self.docs:
            if self._matches(doc, query):
                return dict(doc)
        return None

    def find(self, query: dict[str, Any]) -> MockCursor:
        matched = [dict(doc) for doc in self.docs if self._matches(doc, query)]
        return MockCursor(matched)

    async def update_one(self, query: dict[str, Any], update: dict[str, Any]) -> Any:
        set_vals = update.get("$set", {})
        push_vals = update.get("$push", {})
        for doc in self.docs:
            if self._matches(doc, query):
                doc.update(set_vals)
                for field, val in push_vals.items():
                    if field not in doc:
                        doc[field] = []
                    doc[field].append(val)
                return type("Result", (), {"matched_count": 1, "modified_count": 1})()
        return type("Result", (), {"matched_count": 0, "modified_count": 0})()

    async def update_many(self, query: dict[str, Any], update: dict[str, Any]) -> Any:
        set_vals = update.get("$set", {})
        count = 0
        for doc in self.docs:
            if self._matches(doc, query):
                doc.update(set_vals)
                count += 1
        return type("Result", (), {"matched_count": count, "modified_count": count})()

    async def delete_one(self, query: dict[str, Any]) -> Any:
        for idx, doc in enumerate(self.docs):
            if self._matches(doc, query):
                self.docs.pop(idx)
                return type("Result", (), {"deleted_count": 1})()
        return type("Result", (), {"deleted_count": 0})()

    async def count_documents(self, query: dict[str, Any]) -> int:
        return sum(1 for doc in self.docs if self._matches(doc, query))


class InMemoryMongoDatabase:
    def __init__(self):
        self.collections: dict[str, InMemoryMongoCollection] = {}

    def __contains__(self, name: str) -> bool:
        return True

    def __getitem__(self, name: str) -> InMemoryMongoCollection:
        if name not in self.collections:
            self.collections[name] = InMemoryMongoCollection()
        return self.collections[name]


@pytest.fixture
def mock_db(monkeypatch):
    from teleconsult.kernel.mongodb.client import mongo_database
    db = InMemoryMongoDatabase()
    monkeypatch.setattr(mongo_database, "database", lambda: db)
    return db


@pytest.fixture
def patient_principal():
    return Principal(
        user_id="patient-user-101",
        tenant_id="tenant-1",
        roles=frozenset({"patient"}),
        permissions=frozenset({"insurance:read", "insurance:write", "patient:profile:read"}),
    )


@pytest.fixture
def other_patient_principal():
    return Principal(
        user_id="patient-user-202",
        tenant_id="tenant-1",
        roles=frozenset({"patient"}),
        permissions=frozenset({"insurance:read", "insurance:write", "patient:profile:read"}),
    )


@pytest.fixture
def clinic_admin_principal():
    return MongoPrincipal(
        user_id="clinic-admin-001",
        tenant_id="tenant-1",
        role="clinic_admin",
        clinic_id="clinic-1",
    )


@pytest.fixture
def other_tenant_clinic_admin():
    return MongoPrincipal(
        user_id="clinic-admin-002",
        tenant_id="tenant-other-999",
        role="clinic_admin",
        clinic_id="clinic-other",
    )


def test_mask_policy_number_utility():
    assert mask_policy_number("1234567890") == "•••• •••• 7890"
    assert mask_policy_number("POL-STAR-4589") == "•••• •••• 4589"
    assert mask_policy_number("1234") == "•••• 1234"
    assert mask_policy_number("12") == "•••• 12"
    assert mask_policy_number("") == "•••• •••• ••••"


@pytest.mark.asyncio
async def test_patient_insurance_policies_retrieval(mock_db, patient_principal):
    # Insert test policies into mock db
    mock_db["patient_insurance_policies"].docs.append({
        "id": "policy-001",
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "provider_id": "prov-star",
        "provider_name": "Star Health Insurance",
        "provider_code": "STAR-HEALTH",
        "policy_number": "STAR-9876543210",
        "policy_holder_name": "Srujan M S",
        "policy_type": "Family Health Optima",
        "coverage_amount": 500000.0,
        "expiry_date": "2027-08-31",
        "status": "Active",
        "created_at": datetime.now(UTC).isoformat(),
    })

    policies = await list_patient_insurance_policies(principal=patient_principal)

    assert len(policies) == 1
    p = policies[0]
    assert p["provider_name"] == "Star Health Insurance"
    assert p["provider_code"] == "STAR-HEALTH"
    assert p["policy_number_masked"] == "•••• •••• 3210"
    assert "policy_number" not in p  # raw unmasked number must never be returned!
    assert p["expiry_date"] == "2027-08-31"
    assert p["status"] == "Active"


@pytest.mark.asyncio
async def test_patient_policies_ownership_and_tenant_isolation(mock_db, patient_principal, other_patient_principal):
    # Policy for patient 101 in tenant-1
    mock_db["patient_insurance_policies"].docs.append({
        "id": "policy-101",
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "provider_id": "prov-hdfc",
        "provider_name": "HDFC ERGO",
        "provider_code": "HDFC-ERGO",
        "policy_number": "HDFC-44556677",
        "policy_holder_name": "Patient One",
        "status": "Active",
        "created_at": datetime.now(UTC).isoformat(),
    })

    # Policy for patient 202 in tenant-1
    mock_db["patient_insurance_policies"].docs.append({
        "id": "policy-202",
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-202",
        "user_id": "patient-user-202",
        "provider_id": "prov-care",
        "provider_name": "Care Health",
        "provider_code": "CARE-HLTH",
        "policy_number": "CARE-99887766",
        "policy_holder_name": "Patient Two",
        "status": "Active",
        "created_at": datetime.now(UTC).isoformat(),
    })

    # Patient 101 only sees policy 101
    p1_policies = await list_patient_insurance_policies(principal=patient_principal)
    assert len(p1_policies) == 1
    assert p1_policies[0]["id"] == "policy-101"

    # Patient 202 only sees policy 202
    p2_policies = await list_patient_insurance_policies(principal=other_patient_principal)
    assert len(p2_policies) == 1
    assert p2_policies[0]["id"] == "policy-202"

    # Patient from tenant-2 sees empty list
    diff_tenant_principal = Principal(
        user_id="patient-user-101",
        tenant_id="tenant-2",
        roles=frozenset({"patient"}),
        permissions=frozenset({"insurance:read", "patient:profile:read"}),
    )
    diff_policies = await list_patient_insurance_policies(principal=diff_tenant_principal)
    assert len(diff_policies) == 0


@pytest.mark.asyncio
async def test_patient_active_providers_retrieval(mock_db, patient_principal):
    # Active provider
    mock_db["insurance_providers"].docs.append({
        "id": "prov-active",
        "tenant_id": "tenant-1",
        "provider_name": "Niva Bupa Health Insurance",
        "provider_code": "NIVA-BUPA",
        "country": "India",
        "provider_type": "Insurance Company",
        "official_website": "https://www.nivabupa.com",
        "status": "Active",
        "created_at": datetime.now(UTC).isoformat(),
    })

    # Inactive provider (should be excluded)
    mock_db["insurance_providers"].docs.append({
        "id": "prov-inactive",
        "tenant_id": "tenant-1",
        "provider_name": "Retired Insurer",
        "provider_code": "RETIRED",
        "country": "India",
        "provider_type": "Insurance Company",
        "status": "Inactive",
        "created_at": datetime.now(UTC).isoformat(),
    })

    providers = await list_active_insurance_providers(principal=patient_principal)
    assert len(providers) == 1
    assert providers[0]["provider_code"] == "NIVA-BUPA"
    assert providers[0]["status"] == "Active"


@pytest.mark.asyncio
async def test_http_patient_insurance_endpoints(monkeypatch):
    from httpx import ASGITransport, AsyncClient
    from teleconsult.main import create_app
    from teleconsult.kernel.mongodb.client import mongo_database
    from teleconsult.config.settings import get_settings

    test_db = InMemoryMongoDatabase()
    # Seed active provider
    test_db["insurance_providers"].docs.append({
        "id": "prov-bajaj",
        "tenant_id": "1",
        "provider_name": "Bajaj Allianz General Insurance",
        "provider_code": "BAJAJ-ALLIANZ",
        "country": "India",
        "provider_type": "Insurance Company",
        "official_website": "https://www.bajajallianz.com",
        "status": "Active",
        "created_at": datetime.now(UTC).isoformat(),
    })

    # Seed patient policy
    test_db["patient_insurance_policies"].docs.append({
        "id": "pol-http-1",
        "tenant_id": "1",
        "patient_id": "00000000-0000-0000-0000-000000000101",
        "user_id": "00000000-0000-0000-0000-000000000101",
        "provider_id": "prov-bajaj",
        "provider_name": "Bajaj Allianz General Insurance",
        "provider_code": "BAJAJ-ALLIANZ",
        "policy_number": "BJ-9988776655",
        "policy_holder_name": "Test Patient",
        "expiry_date": "2028-12-31",
        "status": "Active",
        "created_at": datetime.now(UTC).isoformat(),
    })

    monkeypatch.setattr(mongo_database, "database", lambda: test_db)
    monkeypatch.setattr(get_settings(), "mongodb_enabled", True)

    app = create_app()
    transport = ASGITransport(app=app)
    headers = {
        "X-Dev-Patient-Id": "00000000-0000-0000-0000-000000000101",
        "X-Dev-Tenant-Id": "1",
    }

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Fetch patient policies via HTTP GET
        res_pol = await client.get("/patient/insurance/policies", headers=headers)
        assert res_pol.status_code == 200
        policies = res_pol.json()
        assert len(policies) == 1
        assert policies[0]["provider_code"] == "BAJAJ-ALLIANZ"
        assert policies[0]["policy_number_masked"] == "•••• •••• 6655"

        # 2. Fetch active providers via HTTP GET
        res_prov = await client.get("/patient/insurance/providers", headers=headers)
        assert res_prov.status_code == 200
        providers = res_prov.json()
        assert len(providers) == 1
        assert providers[0]["provider_code"] == "BAJAJ-ALLIANZ"


# ==============================================================================
# CHECKPOINT 3 UNIT TESTS: REGISTRATION, DOCUMENTS, VALIDATION & LIFECYCLE
# ==============================================================================

@pytest.mark.asyncio
async def test_patient_register_insurance_policy_success(mock_db, patient_principal):
    # Seed active provider
    mock_db["insurance_providers"].docs.append({
        "id": "prov-star-001",
        "tenant_id": "tenant-1",
        "provider_name": "Star Health and Allied Insurance",
        "provider_code": "STAR-HLTH",
        "country": "India",
        "provider_type": "Insurance Company",
        "status": "Active",
    })

    # Prepare mock upload files
    card_file = UploadFile(
        file=BytesIO(b"%PDF-1.4 dummy card pdf content"),
        filename="health_card.pdf",
        headers={"content-type": "application/pdf"},
    )
    doc_file = UploadFile(
        file=BytesIO(b"\x89PNG\r\n\x1a\n dummy image bytes"),
        filename="policy_doc.png",
        headers={"content-type": "image/png"},
    )

    registered = await register_patient_insurance_policy(
        provider_id="prov-star-001",
        policy_number="STAR-POL-992211",
        member_id="MEM-7788",
        policy_holder_name="Srujan M S",
        relationship="Self",
        insurance_type="Individual",
        start_date="2025-01-01",
        expiry_date="2027-12-31",
        insurance_card=card_file,
        policy_document=doc_file,
        principal=patient_principal,
    )

    assert registered["provider_code"] == "STAR-HLTH"
    assert registered["policy_number_masked"] == "•••• •••• 2211"
    assert "policy_number" not in registered  # raw number never exposed
    assert registered["status"] == "Active"
    assert registered["member_id"] == "MEM-7788"
    assert registered["card_document"] is not None
    assert registered["card_document"]["file_name"] == "health_card.pdf"
    assert registered["policy_document"] is not None
    assert registered["policy_document"]["file_name"] == "policy_doc.png"

    # Verify audit log was recorded
    audit_logs = [doc for doc in mock_db["audit_logs"].docs if doc.get("action") == "insurance_policy.registered"]
    assert len(audit_logs) == 1
    assert audit_logs[0]["target_id"] == registered["id"]


@pytest.mark.asyncio
async def test_patient_register_policy_date_validation(mock_db, patient_principal):
    mock_db["insurance_providers"].docs.append({
        "id": "prov-test",
        "tenant_id": "tenant-1",
        "provider_name": "Care Health",
        "provider_code": "CARE",
        "status": "Active",
    })

    # Expiry date earlier than start date
    with pytest.raises(HTTPException) as exc:
        await register_patient_insurance_policy(
            provider_id="prov-test",
            policy_number="CARE-1122",
            member_id=None,
            policy_holder_name="Srujan",
            relationship="Self",
            insurance_type="Individual",
            start_date="2026-05-01",
            expiry_date="2026-01-01",  # earlier!
            insurance_card=None,
            policy_document=None,
            principal=patient_principal,
        )
    assert exc.value.status_code == 422
    assert "earlier than start date" in exc.value.detail


@pytest.mark.asyncio
async def test_patient_register_policy_duplicate_rejection(mock_db, patient_principal, other_patient_principal):
    mock_db["insurance_providers"].docs.append({
        "id": "prov-hdfc-01",
        "tenant_id": "tenant-1",
        "provider_name": "HDFC ERGO General",
        "provider_code": "HDFC-ERGO",
        "status": "Active",
    })

    # Patient 101 registers policy
    await register_patient_insurance_policy(
        provider_id="prov-hdfc-01",
        policy_number="HDFC-990011",
        member_id=None,
        policy_holder_name="Patient One",
        relationship="Self",
        insurance_type="Individual",
        start_date="2025-01-01",
        expiry_date="2027-01-01",
        insurance_card=None,
        policy_document=None,
        principal=patient_principal,
    )

    # Attempt duplicate registration by patient 101
    with pytest.raises(HTTPException) as exc:
        await register_patient_insurance_policy(
            provider_id="prov-hdfc-01",
            policy_number="HDFC-990011",
            member_id=None,
            policy_holder_name="Patient One",
            relationship="Self",
            insurance_type="Individual",
            start_date="2025-01-01",
            expiry_date="2027-01-01",
            insurance_card=None,
            policy_document=None,
            principal=patient_principal,
        )
    assert exc.value.status_code == 409
    assert "already registered" in exc.value.detail

    # Different patient registering the same policy number in family scenario should succeed
    p2_reg = await register_patient_insurance_policy(
        provider_id="prov-hdfc-01",
        policy_number="HDFC-990011",
        member_id=None,
        policy_holder_name="Patient Two",
        relationship="Spouse",
        insurance_type="Family",
        start_date="2025-01-01",
        expiry_date="2027-01-01",
        insurance_card=None,
        policy_document=None,
        principal=other_patient_principal,
    )
    assert p2_reg["id"] is not None


@pytest.mark.asyncio
async def test_automatic_expired_policy_identification(mock_db, patient_principal):
    mock_db["insurance_policies"].docs.append({
        "id": "policy-past",
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "provider_id": "prov-old",
        "provider_name": "Old Insurer",
        "provider_code": "OLD-INS",
        "policy_number": "OLD-887766",
        "policy_holder_name": "Srujan",
        "expiry_date": "2020-01-01",  # in the past!
        "status": "Active",
        "created_at": "2019-01-01T00:00:00Z",
    })

    pol = await get_patient_insurance_policy(policy_id="policy-past", principal=patient_principal)
    assert pol["status"] == "Expired"

    # Also list endpoint automatically detects it
    policies = await list_patient_insurance_policies(principal=patient_principal)
    assert any(p["id"] == "policy-past" and p["status"] == "Expired" for p in policies)


@pytest.mark.asyncio
async def test_patient_update_and_deactivate_policy(mock_db, patient_principal):
    mock_db["insurance_policies"].docs.append({
        "id": "policy-lifecycle",
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "provider_id": "prov-life",
        "provider_name": "Lifecycle Insurer",
        "provider_code": "LIFE-INS",
        "policy_number": "LIFE-112233",
        "policy_holder_name": "Original Name",
        "relationship": "Self",
        "insurance_type": "Individual",
        "start_date": "2025-01-01",
        "expiry_date": "2028-01-01",
        "status": "Active",
        "created_at": "2025-01-01T00:00:00Z",
    })

    # Update policy
    updated = await update_patient_insurance_policy(
        policy_id="policy-lifecycle",
        policy_holder_name="Updated Name",
        relationship="Spouse",
        insurance_type="Family",
        member_id="NEW-MEM-1",
        start_date=None,
        expiry_date=None,
        insurance_card=None,
        policy_document=None,
        principal=patient_principal,
    )
    assert updated["policy_holder_name"] == "Updated Name"
    assert updated["relationship"] == "Spouse"
    assert updated["member_id"] == "NEW-MEM-1"

    # Deactivate policy
    deact = await toggle_patient_insurance_policy_status(
        policy_id="policy-lifecycle",
        payload=InsuranceProviderStatusUpdate(status="Inactive"),
        principal=patient_principal,
    )
    assert deact["status"] == "Inactive"


@pytest.mark.asyncio
async def test_patient_document_access_isolation(mock_db, patient_principal, other_patient_principal):
    # Store document record belonging to patient 101
    mock_db["insurance_documents"].docs.append({
        "id": "doc-secret-101",
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "document_type": "insurance_card",
        "file_name": "private_card.pdf",
        "content_type": "application/pdf",
        "storage_key": "dummy_key.pdf",
        "size_bytes": 1024,
    })

    # Other patient attempting download of patient 101's document must get 404
    with pytest.raises(HTTPException) as exc:
        await download_insurance_document(document_id="doc-secret-101", principal=other_patient_principal)
    assert exc.value.status_code == 404

    # Other patient attempting preview must also get 404
    with pytest.raises(HTTPException) as exc:
        await preview_insurance_document(document_id="doc-secret-101", principal=other_patient_principal)
    assert exc.value.status_code == 404


# ==============================================================================
# CHECKPOINT 4 UNIT TESTS: POST-CONSULTATION CLAIM PREREQUISITES & INITIATION
# ==============================================================================

@pytest.mark.asyncio
async def test_claim_eligibility_all_prerequisites_met(mock_db, patient_principal):
    apt_id = "apt-comp-001"
    mock_db["appointments"].docs.append({
        "id": apt_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "doctor_name": "Dr. Aisha Sharma",
        "specialty": "Cardiology",
        "status": "completed",
        "payment_status": "captured",
        "razorpay_payment_id": "pay_RZP998877",
        "total_payable_paise": 65000,
        "currency": "INR",
        "starts_at": "2026-11-20T10:00:00Z",
    })

    # Summary released
    mock_db["consultation_summaries"].docs.append({
        "id": "sum-001",
        "tenant_id": "tenant-1",
        "appointment_id": apt_id,
        "status": "released",
    })

    # Prescription released
    mock_db["prescriptions"].docs.append({
        "id": "rx-001",
        "tenant_id": "tenant-1",
        "appointment_id": apt_id,
        "status": "released",
    })

    res = await check_appointment_claim_eligibility(appointment_id=apt_id, principal=patient_principal)

    assert res["is_eligible"] is True
    assert len(res["unmet_prerequisites"]) == 0
    assert res["consultation_fee"] == "₹650.00"
    assert res["payment_verified"] is True
    assert res["summary_finalized"] is True
    assert res["prescription_verified"] is True
    assert res["has_active_claim"] is False
    assert len(res["prerequisites"]) == 5
    assert all(p.passed for p in res["prerequisites"])


@pytest.mark.asyncio
async def test_claim_eligibility_no_prescription_still_eligible(mock_db, patient_principal):
    # Encounters where no prescription was medically necessary
    apt_id = "apt-norx-002"
    mock_db["appointments"].docs.append({
        "id": apt_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "doctor_name": "Dr. Rajiv Patel",
        "specialty": "General Medicine",
        "status": "completed",
        "payment_status": "captured",
        "razorpay_payment_id": "pay_RZP112233",
        "total_payable_paise": 50000,
        "currency": "INR",
        "starts_at": "2026-11-21T11:00:00Z",
    })

    # Summary released
    mock_db["consultation_summaries"].docs.append({
        "id": "sum-norx",
        "tenant_id": "tenant-1",
        "appointment_id": apt_id,
        "status": "released",
    })

    # No prescription in db["prescriptions"]
    res = await check_appointment_claim_eligibility(appointment_id=apt_id, principal=patient_principal)

    assert res["is_eligible"] is True
    assert res["prescription_verified"] is True
    assert res["prescription_required"] is False
    # Check that prescription prereq passed with satisfied message
    rx_prereq = next(p for p in res["prerequisites"] if p.key == "prescription")
    assert rx_prereq.passed is True
    assert "no prescription" in rx_prereq.message.lower()


@pytest.mark.asyncio
async def test_claim_eligibility_unmet_prerequisites(mock_db, patient_principal):
    # 1. Unverified Payment
    apt_unpaid = "apt-unpaid-003"
    mock_db["appointments"].docs.append({
        "id": apt_unpaid,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "status": "completed",
        "payment_status": "pending",  # Unpaid!
        "starts_at": "2026-11-22T09:00:00Z",
    })
    mock_db["consultation_summaries"].docs.append({
        "id": "sum-unpaid",
        "tenant_id": "tenant-1",
        "appointment_id": apt_unpaid,
        "status": "released",
    })
    res_unpaid = await check_appointment_claim_eligibility(appointment_id=apt_unpaid, principal=patient_principal)
    assert res_unpaid["is_eligible"] is False
    assert res_unpaid["payment_verified"] is False
    assert any("payment" in msg.lower() for msg in res_unpaid["unmet_prerequisites"])

    # 2. Appointment not Completed
    apt_pending = "apt-pending-004"
    mock_db["appointments"].docs.append({
        "id": apt_pending,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "status": "confirmed",  # Not completed!
        "payment_status": "captured",
        "razorpay_payment_id": "pay_RZP4455",
        "starts_at": "2026-11-23T09:00:00Z",
    })
    mock_db["consultation_summaries"].docs.append({
        "id": "sum-pending",
        "tenant_id": "tenant-1",
        "appointment_id": apt_pending,
        "status": "released",
    })
    res_pending = await check_appointment_claim_eligibility(appointment_id=apt_pending, principal=patient_principal)
    assert res_pending["is_eligible"] is False
    assert any("completed" in msg.lower() for msg in res_pending["unmet_prerequisites"])

    # 3. Consultation Summary Not Finalized
    apt_nosum = "apt-nosum-005"
    mock_db["appointments"].docs.append({
        "id": apt_nosum,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "status": "completed",
        "payment_status": "captured",
        "razorpay_payment_id": "pay_RZP6677",
        "starts_at": "2026-11-24T09:00:00Z",
    })
    # No summary in db
    res_nosum = await check_appointment_claim_eligibility(appointment_id=apt_nosum, principal=patient_principal)
    assert res_nosum["is_eligible"] is False
    assert res_nosum["summary_finalized"] is False
    assert any("summary" in msg.lower() for msg in res_nosum["unmet_prerequisites"])


@pytest.mark.asyncio
async def test_initiate_claim_success_and_duplicate_prevention(mock_db, patient_principal):
    apt_id = "apt-claim-init-001"
    mock_db["appointments"].docs.append({
        "id": apt_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "doctor_name": "Dr. Aisha Sharma",
        "specialty": "Cardiology",
        "status": "completed",
        "payment_status": "captured",
        "razorpay_payment_id": "pay_RZP889900",
        "total_payable_paise": 75000,
        "currency": "INR",
        "starts_at": "2026-11-20T10:00:00Z",
    })
    mock_db["consultation_summaries"].docs.append({
        "id": "sum-init-001",
        "tenant_id": "tenant-1",
        "appointment_id": apt_id,
        "status": "released",
    })

    # Active Policy for patient 101
    mock_db["insurance_policies"].docs.append({
        "id": "policy-valid-001",
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "provider_id": "prov-star",
        "provider_name": "Star Health Insurance",
        "provider_code": "STAR-HLTH",
        "policy_number": "STAR-992211",
        "policy_number_masked": "•••• •••• 2211",
        "policy_holder_name": "Srujan M S",
        "expiry_date": "2028-12-31",
        "status": "Active",
    })

    # 1. Initiate claim successfully
    initiated = await initiate_appointment_insurance_claim(
        appointment_id=apt_id,
        payload=ClaimInitiateRequest(policy_id="policy-valid-001", notes="Follow-up consultation fee claim"),
        principal=patient_principal,
    )

    assert initiated["claim_id"].startswith("CLM-")
    assert initiated["appointment_id"] == apt_id
    assert initiated["status"] == "initiated"
    assert initiated["consultation_fee"] == "₹750.00"
    assert initiated["provider_name"] == "Star Health Insurance"

    # Audit log check
    audit_logs = [d for d in mock_db["audit_logs"].docs if d.get("action") == "insurance_claim.initiated"]
    assert len(audit_logs) == 1
    assert audit_logs[0]["target_id"] == initiated["claim_id"]

    # 2. Duplicate active claim attempt must raise 409 Conflict
    with pytest.raises(HTTPException) as exc:
        await initiate_appointment_insurance_claim(
            appointment_id=apt_id,
            payload=ClaimInitiateRequest(policy_id="policy-valid-001"),
            principal=patient_principal,
        )
    assert exc.value.status_code == 409
    assert "already exists" in exc.value.detail

    # 3. Eligibility endpoint now reports duplicate active claim and is_eligible=False
    res_after = await check_appointment_claim_eligibility(appointment_id=apt_id, principal=patient_principal)
    assert res_after["is_eligible"] is False
    assert res_after["has_active_claim"] is True
    assert res_after["existing_claim_id"] == initiated["claim_id"]


@pytest.mark.asyncio
async def test_claim_patient_ownership_isolation(mock_db, patient_principal, other_patient_principal):
    apt_id = "apt-private-101"
    mock_db["appointments"].docs.append({
        "id": apt_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "status": "completed",
        "payment_status": "captured",
        "starts_at": "2026-11-20T10:00:00Z",
    })

    # Other patient attempting to check eligibility gets 404
    with pytest.raises(HTTPException) as exc:
        await check_appointment_claim_eligibility(appointment_id=apt_id, principal=other_patient_principal)
    assert exc.value.status_code == 404

    # Other patient attempting to initiate claim gets 404
    with pytest.raises(HTTPException) as exc:
        await initiate_appointment_insurance_claim(
            appointment_id=apt_id,
            payload=ClaimInitiateRequest(policy_id="policy-random"),
            principal=other_patient_principal,
        )
    assert exc.value.status_code == 404


# ==============================================================================
# CHECKPOINT 5 UNIT TESTS: AUTOMATIC CLAIM DOSSIER & DOCUMENT COLLECTION
# ==============================================================================

@pytest.mark.asyncio
async def test_get_appointment_claim_dossier_all_documents_present(mock_db, patient_principal):
    apt_id = "apt-dossier-001"
    mock_db["appointments"].docs.append({
        "id": apt_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "doctor_name": "Dr. Aisha Sharma",
        "specialty": "Cardiology",
        "status": "completed",
        "payment_status": "captured",
        "razorpay_payment_id": "pay_RZP_DOSSIER_1",
        "total_payable_paise": 50000,
        "currency": "INR",
        "starts_at": "2026-11-20T10:00:00Z",
    })
    mock_db["patients"].docs.append({
        "id": "patient-user-101",
        "tenant_id": "tenant-1",
        "full_name": "Srujan M S",
        "phone": "+91 98765 43210",
        "email": "srujan@example.com",
        "gender": "Male",
        "dob": "1994-08-15",
    })
    mock_db["consultation_summaries"].docs.append({
        "id": "sum-dossier-001",
        "tenant_id": "tenant-1",
        "appointment_id": apt_id,
        "status": "released",
    })
    mock_db["prescriptions"].docs.append({
        "id": "rx-dossier-001",
        "tenant_id": "tenant-1",
        "appointment_id": apt_id,
        "status": "released",
        "prescriber_name": "Dr. Aisha Sharma",
    })

    # Card document in storage
    card_doc_id = "doc-card-001"
    mock_db["insurance_documents"].docs.append({
        "id": card_doc_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "document_type": "insurance_card",
        "file_name": "star_card.pdf",
        "content_type": "application/pdf",
        "size_bytes": 102400,
        "storage_key": "star_card.pdf",
        "created_at": "2026-11-01T00:00:00Z",
    })

    # Active Policy with card linked
    mock_db["insurance_policies"].docs.append({
        "id": "policy-dossier-001",
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "provider_id": "prov-star",
        "provider_name": "Star Health Insurance",
        "provider_code": "STAR-HLTH",
        "policy_number": "STAR-889900",
        "policy_number_masked": "•••• •••• 8900",
        "card_document_id": card_doc_id,
        "insurance_type": "Individual",
        "start_date": "2026-01-01",
        "expiry_date": "2027-01-01",
        "status": "Active",
    })

    dossier = await get_appointment_claim_dossier(
        appointment_id=apt_id,
        policy_id="policy-dossier-001",
        principal=patient_principal,
    )

    assert dossier["appointment_id"] == apt_id
    assert dossier["paid_amount"] == "₹500.00"
    assert dossier["provider_name"] == "Star Health Insurance"
    assert dossier["policy_number_masked"] == "•••• •••• 8900"
    assert dossier["mandatory_complete"] is True
    assert dossier["dossier_ready"] is True
    assert dossier["missing_mandatory_count"] == 0

    docs_by_cat = {d.category: d for d in dossier["documents"]}
    assert "patient_profile" in docs_by_cat
    assert docs_by_cat["patient_profile"].status == "Available"
    assert "insurance_policy" in docs_by_cat
    assert docs_by_cat["insurance_policy"].status == "Available"
    assert "insurance_card" in docs_by_cat
    assert docs_by_cat["insurance_card"].status == "Available"
    assert "prescription" in docs_by_cat
    assert docs_by_cat["prescription"].status == "Available"
    assert "consultation_summary" in docs_by_cat
    assert docs_by_cat["consultation_summary"].status == "Available"
    assert "consultation_invoice" in docs_by_cat
    assert docs_by_cat["consultation_invoice"].status == "Available"
    assert "payment_receipt" in docs_by_cat
    assert docs_by_cat["payment_receipt"].status == "Available"


@pytest.mark.asyncio
async def test_get_appointment_claim_dossier_missing_card_and_optional_prescription(mock_db, patient_principal):
    apt_id = "apt-dossier-002"
    mock_db["appointments"].docs.append({
        "id": apt_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "doctor_name": "Dr. Aisha Sharma",
        "specialty": "Cardiology",
        "status": "completed",
        "payment_status": "captured",
        "razorpay_payment_id": "pay_RZP_DOSSIER_2",
        "total_payable_paise": 60000,
        "currency": "INR",
        "starts_at": "2026-11-20T10:00:00Z",
    })
    mock_db["consultation_summaries"].docs.append({
        "id": "sum-dossier-002",
        "tenant_id": "tenant-1",
        "appointment_id": apt_id,
        "status": "released",
    })
    # NO prescription in DB (e.g. routine review where no medication prescribed)

    # Policy with NO card uploaded
    mock_db["insurance_policies"].docs.append({
        "id": "policy-nocard-002",
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "provider_name": "Niva Bupa",
        "policy_number_masked": "•••• •••• 5544",
        "card_document_id": None,  # Missing card!
        "status": "Active",
    })

    dossier = await get_appointment_claim_dossier(
        appointment_id=apt_id,
        policy_id="policy-nocard-002",
        principal=patient_principal,
    )

    docs_by_cat = {d.category: d for d in dossier["documents"]}
    # Prescription must be Not Applicable and not mandatory
    assert docs_by_cat["prescription"].status == "Not Applicable"
    assert docs_by_cat["prescription"].is_mandatory is False

    # Insurance Card must be Missing and mandatory
    assert docs_by_cat["insurance_card"].status == "Missing"
    assert docs_by_cat["insurance_card"].is_mandatory is True

    # Mandatory is incomplete because card is missing
    assert dossier["mandatory_complete"] is False
    assert dossier["dossier_ready"] is False
    assert dossier["missing_mandatory_count"] == 1
    assert "Insurance Card / Member E-Card" in dossier["missing_mandatory_titles"]


@pytest.mark.asyncio
async def test_upload_claim_supporting_document_and_isolation(mock_db, patient_principal, other_patient_principal):
    apt_id = "apt-supp-001"
    mock_db["appointments"].docs.append({
        "id": apt_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "doctor_name": "Dr. Aisha Sharma",
        "specialty": "Cardiology",
        "status": "completed",
        "payment_status": "captured",
        "starts_at": "2026-11-20T10:00:00Z",
    })
    mock_db["consultation_summaries"].docs.append({
        "id": "sum-supp-001",
        "tenant_id": "tenant-1",
        "appointment_id": apt_id,
        "status": "released",
    })

    # Patient uploads blood test report
    dummy_pdf = UploadFile(
        filename="Lipid_Panel_Report.pdf",
        file=BytesIO(b"%PDF-1.4 sample lab report content for claim"),
        headers={"content-type": "application/pdf"},
    )

    upload_res = await upload_claim_supporting_document(
        appointment_id=apt_id,
        file=dummy_pdf,
        title="Diagnostic Blood Test Report",
        principal=patient_principal,
    )

    assert upload_res["id"] is not None
    assert upload_res["appointment_id"] == apt_id
    assert upload_res["title"] == "Diagnostic Blood Test Report"
    assert upload_res["document_type"] == "supporting_document"

    # Verify dossier now contains the uploaded document
    dossier = await get_appointment_claim_dossier(
        appointment_id=apt_id,
        principal=patient_principal,
    )
    supp_items = [d for d in dossier["documents"] if d.category == "supporting_document"]
    assert len(supp_items) == 1
    assert supp_items[0].title == "Diagnostic Blood Test Report"
    assert supp_items[0].id == upload_res["id"]

    # Other patient cannot upload supporting document to patient 101's appointment
    dummy_pdf2 = UploadFile(
        filename="Hacker_Doc.pdf",
        file=BytesIO(b"%PDF-1.4 hacker"),
        headers={"content-type": "application/pdf"},
    )
    with pytest.raises(HTTPException) as exc:
        await upload_claim_supporting_document(
            appointment_id=apt_id,
            file=dummy_pdf2,
            title="Unauthorized",
            principal=other_patient_principal,
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_download_and_preview_claim_invoice_and_receipt(mock_db, patient_principal, other_patient_principal):
    apt_id = "apt-inv-rcp-001"
    mock_db["appointments"].docs.append({
        "id": apt_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "doctor_name": "Dr. Aisha Sharma",
        "specialty": "Cardiology",
        "status": "completed",
        "payment_status": "captured",
        "razorpay_payment_id": "pay_RZP_OFFICIAL_1",
        "total_payable_paise": 50000,
        "currency": "INR",
        "starts_at": "2026-11-20T10:00:00Z",
    })
    mock_db["patients"].docs.append({
        "id": "patient-user-101",
        "tenant_id": "tenant-1",
        "full_name": "Srujan M S",
        "phone": "+91 98765 43210",
        "email": "srujan@example.com",
    })

    # Download Invoice
    inv_dl = await download_claim_invoice(appointment_id=apt_id, principal=patient_principal)
    assert inv_dl.media_type in {"application/pdf", "text/plain"}
    assert "attachment" in inv_dl.headers.get("content-disposition", "").lower()

    # Preview Invoice
    inv_pv = await preview_claim_invoice(appointment_id=apt_id, principal=patient_principal)
    assert inv_pv.media_type in {"application/pdf", "text/plain"}
    assert "inline" in inv_pv.headers.get("content-disposition", "").lower()

    # Download Receipt
    rcp_dl = await download_claim_receipt(appointment_id=apt_id, principal=patient_principal)
    assert rcp_dl.media_type in {"application/pdf", "text/plain"}
    assert "attachment" in rcp_dl.headers.get("content-disposition", "").lower()

    # Preview Receipt
    rcp_pv = await preview_claim_receipt(appointment_id=apt_id, principal=patient_principal)
    assert rcp_pv.media_type in {"application/pdf", "text/plain"}
    assert "inline" in rcp_pv.headers.get("content-disposition", "").lower()

    # Unauthorized patient accessing invoice or receipt gets 404
    with pytest.raises(HTTPException) as exc1:
        await download_claim_invoice(appointment_id=apt_id, principal=other_patient_principal)
    assert exc1.value.status_code == 404

    with pytest.raises(HTTPException) as exc2:
        await download_claim_receipt(appointment_id=apt_id, principal=other_patient_principal)
    assert exc2.value.status_code == 404


@pytest.mark.asyncio
async def test_delete_claim_document_and_isolation(mock_db, patient_principal, other_patient_principal):
    doc_id = "doc-to-delete-001"
    mock_db["insurance_documents"].docs.append({
        "id": doc_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "document_type": "supporting_document",
        "file_name": "lab_doc.pdf",
        "content_type": "application/pdf",
        "storage_key": "lab_doc_dummy.pdf",
        "size_bytes": 1024,
    })

    # Other patient attempting delete gets 404
    with pytest.raises(HTTPException) as exc:
        await delete_patient_insurance_document(document_id=doc_id, principal=other_patient_principal)
    assert exc.value.status_code == 404

    # Owner deletes successfully
    del_res = await delete_patient_insurance_document(document_id=doc_id, principal=patient_principal)
    assert del_res["id"] == doc_id
    assert "deleted" in del_res["message"].lower()
    assert not any(d["id"] == doc_id for d in mock_db["insurance_documents"].docs)


# =============================================================================
# CHECKPOINT 6: INSURANCE DATA SHARING CONSENT TESTS
# =============================================================================

@pytest.mark.asyncio
async def test_claim_consent_document_definition():
    doc = await get_claim_consent_document_definition()
    assert "Authorization" in doc["title"]
    assert doc["version"] == "1.0"
    assert len(doc["sections"]) == 5
    assert "I authorize Kaizen Care" in doc["consent_text"]
    assert doc["sections"][0]["heading"] == "1. Purpose of Data Disclosure"


@pytest.mark.asyncio
async def test_claim_consent_grant_and_audit_workflow(mock_db, patient_principal):
    apt_id = "apt-consent-001"
    provider_id = "prov-hls-001"
    pol_id = "pol-consent-001"

    # Seed master provider
    mock_db["insurance_providers"].docs.append({
        "id": provider_id,
        "tenant_id": "tenant-1",
        "provider_name": "Star Health and Allied Insurance",
        "status": "Active",
    })
    # Seed policy
    mock_db["insurance_policies"].docs.append({
        "id": pol_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "provider_id": provider_id,
        "provider_name": "Star Health and Allied Insurance",
        "policy_number": "POL-STAR-778899",
        "policy_holder_name": "Srujan M S",
        "status": "Active",
        "expiry_date": "2027-12-31",
    })
    # Seed appointment
    mock_db["appointments"].docs.append({
        "id": apt_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "status": "completed",
        "payment_status": "captured",
        "total_payable_paise": 65000,
        "starts_at": "2026-11-20T10:00:00Z",
    })

    # Initial state: no consent granted
    initial_status = await get_appointment_claim_consent(
        appointment_id=apt_id,
        policy_id=pol_id,
        principal=patient_principal,
    )
    assert initial_status["is_granted"] is False
    assert initial_status["status"] == "not_granted"
    assert initial_status["requires_renewal"] is False
    assert initial_status["provider_id"] == provider_id

    # Reject grant if consent_accepted is False
    with pytest.raises(HTTPException) as exc:
        await grant_appointment_claim_consent(
            appointment_id=apt_id,
            payload=ClaimConsentGrantRequest(policy_id=pol_id, consent_accepted=False),
            principal=patient_principal,
        )
    assert exc.value.status_code == 422
    assert "acceptance" in exc.value.detail.lower()

    # Grant consent with consent_accepted = True
    grant_res = await grant_appointment_claim_consent(
        appointment_id=apt_id,
        payload=ClaimConsentGrantRequest(policy_id=pol_id, consent_accepted=True),
        principal=patient_principal,
    )
    assert grant_res["is_granted"] is True
    assert grant_res["status"] == "granted"
    assert grant_res["consent_version"] == "1.0"
    assert grant_res["requires_renewal"] is False
    assert grant_res["accepted_at"] is not None

    # Verify persistence in `consents` collection
    stored_consents = [c for c in mock_db["consents"].docs if c.get("appointment_id") == apt_id and c.get("status") == "granted"]
    assert len(stored_consents) == 1
    consent_doc = stored_consents[0]
    assert consent_doc["patient_id"] == "patient-user-101"
    assert consent_doc["provider_id"] == provider_id
    assert consent_doc["consent_type"] == "insurance_claim_data_sharing"
    assert consent_doc["status"] == "granted"
    assert consent_doc["consent_version"] == "1.0"
    assert "documents_footprint" in consent_doc

    # Verify audit log entry
    audit_entries = [a for a in mock_db["audit_logs"].docs if a.get("action") == "insurance_claim_consent.granted"]
    assert len(audit_entries) >= 1
    last_audit = audit_entries[-1]
    assert last_audit["actor_id"] == "patient-user-101"
    assert last_audit["metadata"]["appointment_id"] == apt_id
    assert last_audit["metadata"]["provider_id"] == provider_id


@pytest.mark.asyncio
async def test_claim_consent_withdrawal_and_audit(mock_db, patient_principal):
    apt_id = "apt-consent-002"
    provider_id = "prov-hls-002"
    pol_id = "pol-consent-002"

    mock_db["insurance_providers"].docs.append({
        "id": provider_id,
        "tenant_id": "tenant-1",
        "provider_name": "HDFC ERGO General Insurance",
        "status": "Active",
    })
    mock_db["insurance_policies"].docs.append({
        "id": pol_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "provider_id": provider_id,
        "provider_name": "HDFC ERGO General Insurance",
        "policy_number": "POL-HDFC-998877",
        "policy_holder_name": "Srujan M S",
        "status": "Active",
    })
    mock_db["appointments"].docs.append({
        "id": apt_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "status": "completed",
        "payment_status": "captured",
    })

    # Grant first
    await grant_appointment_claim_consent(
        appointment_id=apt_id,
        payload=ClaimConsentGrantRequest(policy_id=pol_id, consent_accepted=True),
        principal=patient_principal,
    )

    # Withdraw consent
    withdraw_res = await withdraw_appointment_claim_consent(
        appointment_id=apt_id,
        principal=patient_principal,
    )
    assert withdraw_res["status"] == "withdrawn"
    assert "withdrawn" in withdraw_res["message"].lower()

    # Query status confirms withdrawn
    status_res = await get_appointment_claim_consent(
        appointment_id=apt_id,
        policy_id=pol_id,
        principal=patient_principal,
    )
    assert status_res["is_granted"] is False
    assert status_res["status"] == "withdrawn"

    # Verify audit log recorded withdrawal
    audit_entries = [a for a in mock_db["audit_logs"].docs if a.get("action") == "insurance_claim_consent.withdrawn"]
    assert len(audit_entries) >= 1
    assert audit_entries[-1]["actor_id"] == "patient-user-101"
    assert audit_entries[-1]["metadata"]["appointment_id"] == apt_id


@pytest.mark.asyncio
async def test_claim_consent_renewal_on_recipient_or_documents_change(mock_db, patient_principal):
    apt_id = "apt-consent-003"
    provider_1 = "prov-001"
    provider_2 = "prov-002"
    pol_1 = "pol-001"
    pol_2 = "pol-002"

    mock_db["insurance_providers"].docs.extend([
        {"id": provider_1, "tenant_id": "tenant-1", "provider_name": "Provider One", "status": "Active"},
        {"id": provider_2, "tenant_id": "tenant-1", "provider_name": "Provider Two", "status": "Active"},
    ])
    mock_db["insurance_policies"].docs.extend([
        {
            "id": pol_1,
            "tenant_id": "tenant-1",
            "patient_id": "patient-user-101",
            "user_id": "patient-user-101",
            "provider_id": provider_1,
            "provider_name": "Provider One",
            "policy_number": "POL-111",
            "policy_holder_name": "Srujan",
            "status": "Active",
        },
        {
            "id": pol_2,
            "tenant_id": "tenant-1",
            "patient_id": "patient-user-101",
            "user_id": "patient-user-101",
            "provider_id": provider_2,
            "provider_name": "Provider Two",
            "policy_number": "POL-222",
            "policy_holder_name": "Srujan",
            "status": "Active",
        },
    ])
    mock_db["appointments"].docs.append({
        "id": apt_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "status": "completed",
        "payment_status": "captured",
    })

    # Grant consent for Policy 1
    grant_res = await grant_appointment_claim_consent(
        appointment_id=apt_id,
        payload=ClaimConsentGrantRequest(policy_id=pol_1, consent_accepted=True),
        principal=patient_principal,
    )
    assert grant_res["is_granted"] is True
    assert grant_res["requires_renewal"] is False

    # Check status for Policy 2 (recipient changed!) -> requires_renewal
    changed_policy_status = await get_appointment_claim_consent(
        appointment_id=apt_id,
        policy_id=pol_2,
        principal=patient_principal,
    )
    assert changed_policy_status["is_granted"] is False
    assert changed_policy_status["status"] == "renewal_required"
    assert changed_policy_status["requires_renewal"] is True
    assert "provider" in changed_policy_status["renewal_reason"].lower()

    # Re-grant for Policy 2
    regrant_res = await grant_appointment_claim_consent(
        appointment_id=apt_id,
        payload=ClaimConsentGrantRequest(policy_id=pol_2, consent_accepted=True),
        principal=patient_principal,
    )
    assert regrant_res["is_granted"] is True
    assert regrant_res["requires_renewal"] is False

    # Now add an additional supporting document to the encounter
    mock_db["insurance_documents"].docs.append({
        "id": "doc-supp-new-001",
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "appointment_id": apt_id,
        "document_type": "supporting_document",
        "file_name": "new_scan.pdf",
        "storage_key": "new_scan.pdf",
    })

    # Checking status now detects that document footprint changed -> requires_renewal
    doc_changed_status = await get_appointment_claim_consent(
        appointment_id=apt_id,
        policy_id=pol_2,
        principal=patient_principal,
    )
    assert doc_changed_status["is_granted"] is False
    assert doc_changed_status["status"] == "renewal_required"
    assert doc_changed_status["requires_renewal"] is True
    assert "document" in doc_changed_status["renewal_reason"].lower()


@pytest.mark.asyncio
async def test_claim_consent_tenant_and_patient_isolation(mock_db, patient_principal, other_patient_principal):
    apt_id = "apt-consent-iso-001"
    mock_db["appointments"].docs.append({
        "id": apt_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "status": "completed",
        "payment_status": "captured",
    })

    # Other patient cannot view consent for apt-consent-iso-001
    with pytest.raises(HTTPException) as exc1:
        await get_appointment_claim_consent(
            appointment_id=apt_id,
            principal=other_patient_principal,
        )
    assert exc1.value.status_code == 404

    # Other patient cannot grant consent for apt-consent-iso-001
    with pytest.raises(HTTPException) as exc2:
        await grant_appointment_claim_consent(
            appointment_id=apt_id,
            payload=ClaimConsentGrantRequest(policy_id="any-pol", consent_accepted=True),
            principal=other_patient_principal,
        )
    assert exc2.value.status_code == 404

    # Other patient cannot withdraw consent for apt-consent-iso-001
    with pytest.raises(HTTPException) as exc3:
        await withdraw_appointment_claim_consent(
            appointment_id=apt_id,
            principal=other_patient_principal,
        )
    assert exc3.value.status_code == 404


# =============================================================================
# CHECKPOINT 7: PATIENT INSURANCE CLAIM SUBMISSION & LIFECYCLE TESTS
# =============================================================================

@pytest.mark.asyncio
async def test_claim_submission_full_workflow_and_audit(mock_db, patient_principal):
    apt_id = "apt-submit-001"
    provider_id = "prov-icici-001"
    pol_id = "pol-icici-001"

    # Master Provider
    mock_db["insurance_providers"].docs.append({
        "id": provider_id,
        "tenant_id": "tenant-1",
        "provider_name": "ICICI Lombard General Insurance",
        "provider_code": "ICICI_LOMBARD",
        "status": "Active",
    })
    # Patient Policy
    mock_db["insurance_policies"].docs.append({
        "id": pol_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "provider_id": provider_id,
        "provider_name": "ICICI Lombard General Insurance",
        "policy_number": "POL-ICICI-999888",
        "policy_holder_name": "Srujan M S",
        "relationship": "Self",
        "card_document_id": "doc-card-001",
        "status": "Active",
        "expiry_date": "2028-12-31",
    })
    # Appointment (Completed + Verified Payment)
    mock_db["appointments"].docs.append({
        "id": apt_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "status": "completed",
        "payment_status": "captured",
        "razorpay_payment_id": "pay_TEST_RZP_001",
        "total_payable_paise": 75000,
        "currency": "INR",
        "doctor_name": "Dr. Aisha Sharma",
        "specialty": "Cardiology",
        "starts_at": "2026-11-25T11:00:00Z",
    })
    # Consultation Summary (finalized)
    mock_db["clinical_notes"].docs.append({
        "id": "sum-001",
        "tenant_id": "tenant-1",
        "appointment_id": apt_id,
        "status": "finalized",
    })
    # Patient Profile
    mock_db["patients"].docs.append({
        "id": "patient-user-101",
        "tenant_id": "tenant-1",
        "full_name": "Srujan M S",
        "phone": "+91 98765 43210",
        "email": "srujan@example.com",
    })
    # Insurance Card document (so mandatory documents are complete)
    mock_db["insurance_documents"].docs.append({
        "id": "doc-card-001",
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "policy_id": pol_id,
        "document_type": "insurance_card",
        "file_name": "icici_card.pdf",
        "storage_key": "icici_card.pdf",
        "status": "active",
    })

    # 1. Reject submission when consent is missing
    with pytest.raises(HTTPException) as exc1:
        await submit_or_draft_appointment_claim(
            appointment_id=apt_id,
            payload=ClaimSubmissionRequest(policy_id=pol_id, save_as_draft=False),
            principal=patient_principal,
        )
    assert exc1.value.status_code == 422
    assert "consent" in exc1.value.detail.lower()

    # 2. Grant explicit consent
    await grant_appointment_claim_consent(
        appointment_id=apt_id,
        payload=ClaimConsentGrantRequest(policy_id=pol_id, consent_accepted=True),
        principal=patient_principal,
    )

    # 3. Save as Draft successfully
    draft_res = await submit_or_draft_appointment_claim(
        appointment_id=apt_id,
        payload=ClaimSubmissionRequest(policy_id=pol_id, save_as_draft=True, notes="Preliminary draft"),
        principal=patient_principal,
    )
    assert draft_res["is_draft"] is True
    assert draft_res["status"] == "draft"
    assert "draft" in draft_res["message"].lower()

    # 4. Submit finalized claim for Clinic Admin verification
    submit_res = await submit_or_draft_appointment_claim(
        appointment_id=apt_id,
        payload=ClaimSubmissionRequest(policy_id=pol_id, save_as_draft=False, notes="Final submission request"),
        principal=patient_principal,
    )
    assert submit_res["is_draft"] is False
    assert submit_res["status"] == "pending_document_verification"
    assert submit_res["status_label"] == "Pending Document Verification"
    assert submit_res["claim_reference"].startswith("KC-CLM-")
    assert submit_res["submitted_at"] is not None

    # 5. Verify database persistence in `insurance_claims`
    stored_claims = [c for c in mock_db["insurance_claims"].docs if c.get("appointment_id") == apt_id]
    assert len(stored_claims) == 1
    c_doc = stored_claims[0]
    assert c_doc["patient_id"] == "patient-user-101"
    assert c_doc["status"] == "pending_document_verification"
    assert c_doc["claim_reference"] == submit_res["claim_reference"]
    assert "750" in c_doc["consultation_fee"]
    assert len(c_doc["documents"]) >= 3  # patient profile, summary, invoice, etc.
    assert len(c_doc["timeline"]) >= 2   # draft stage + submission stage

    # 6. Verify notification dispatched to patient and clinic admin
    patient_notifs = [n for n in mock_db["notifications"].docs if n.get("recipient_id") == "patient-user-101"]
    assert any(n.get("type") == "insurance_claim_submitted" for n in patient_notifs)

    admin_notifs = [n for n in mock_db["notifications"].docs if n.get("recipient_role") == "clinic_admin"]
    assert any(n.get("type") == "insurance_claim_admin_action_required" for n in admin_notifs)

    # 7. Verify audit log entry
    audit_entries = [a for a in mock_db["audit_logs"].docs if a.get("action") == "insurance_claim.submitted"]
    assert len(audit_entries) >= 1
    assert audit_entries[-1]["actor_id"] == "patient-user-101"
    assert audit_entries[-1]["metadata"]["claim_reference"] == submit_res["claim_reference"]


@pytest.mark.asyncio
async def test_claim_submission_duplicate_prevention(mock_db, patient_principal):
    apt_id = "apt-dup-submit-001"
    provider_id = "prov-001"
    pol_id = "pol-001"

    mock_db["insurance_providers"].docs.append({
        "id": provider_id,
        "tenant_id": "tenant-1",
        "provider_name": "Star Health",
        "status": "Active",
    })
    mock_db["insurance_policies"].docs.append({
        "id": pol_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "provider_id": provider_id,
        "provider_name": "Star Health",
        "policy_number": "POL-12345",
        "card_document_id": "doc-card-002",
        "status": "Active",
    })
    mock_db["appointments"].docs.append({
        "id": apt_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "status": "completed",
        "payment_status": "captured",
        "total_payable_paise": 50000,
    })
    mock_db["clinical_notes"].docs.append({
        "id": "sum-002",
        "tenant_id": "tenant-1",
        "appointment_id": apt_id,
        "status": "finalized",
    })
    # Insurance Card document
    mock_db["insurance_documents"].docs.append({
        "id": "doc-card-002",
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "policy_id": pol_id,
        "document_type": "insurance_card",
        "file_name": "star_card.pdf",
        "storage_key": "star_card.pdf",
        "status": "active",
    })

    # Grant consent
    await grant_appointment_claim_consent(
        appointment_id=apt_id,
        payload=ClaimConsentGrantRequest(policy_id=pol_id, consent_accepted=True),
        principal=patient_principal,
    )

    # Submit claim once
    first_res = await submit_or_draft_appointment_claim(
        appointment_id=apt_id,
        payload=ClaimSubmissionRequest(policy_id=pol_id, save_as_draft=False),
        principal=patient_principal,
    )
    assert first_res["status"] == "pending_document_verification"

    # Second submission attempt for same appointment must be rejected with 409 Conflict
    with pytest.raises(HTTPException) as exc:
        await submit_or_draft_appointment_claim(
            appointment_id=apt_id,
            payload=ClaimSubmissionRequest(policy_id=pol_id, save_as_draft=False),
            principal=patient_principal,
        )
    assert exc.value.status_code == 409
    assert "already submitted" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_patient_claim_listing_and_detail(mock_db, patient_principal, other_patient_principal):
    claim_id = "clm-test-view-001"
    claim_ref = "KC-CLM-202611-VIEW01"
    apt_id = "apt-view-001"

    mock_db["insurance_claims"].docs.append({
        "id": claim_id,
        "claim_reference": claim_ref,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "appointment_id": apt_id,
        "appointment_display_id": "KC-APT-VIEW01",
        "clinic_id": "clinic-1",
        "doctor_name": "Dr. Aisha Sharma",
        "specialty": "Cardiology",
        "consultation_date": "2026-11-20T10:00:00Z",
        "patient_name": "Srujan M S",
        "policy_id": "pol-view-001",
        "provider_id": "prov-view-001",
        "provider_name": "Care Health Insurance",
        "policy_number_masked": "POL-****-8899",
        "consultation_fee": "INR 500.00",
        "fee_paise": 50000,
        "currency": "INR",
        "payment_status": "captured",
        "consent_id": "cst-view-001",
        "consent_version": "1.0",
        "consent_accepted_at": "2026-11-20T10:05:00Z",
        "status": "pending_document_verification",
        "status_label": "Pending Document Verification",
        "documents": [
            {"id": "doc-1", "category": "patient_profile", "title": "Patient Profile Details", "status": "Available"},
            {"id": "doc-2", "category": "consultation_invoice", "title": "Official Consultation Tax Invoice", "status": "Available"},
        ],
        "timeline": [
            {
                "stage": "submission",
                "status": "pending_document_verification",
                "title": "Submitted for Clinic Admin Verification",
                "description": "Queued for audit.",
                "occurred_at": "2026-11-20T10:05:00Z",
                "actor_role": "patient",
            }
        ],
        "submitted_at": "2026-11-20T10:05:00Z",
        "created_at": "2026-11-20T10:05:00Z",
        "updated_at": "2026-11-20T10:05:00Z",
    })

    # 1. Patient lists their claims
    claims_list = await list_patient_insurance_claims(principal=patient_principal)
    assert len(claims_list) >= 1
    found = next((c for c in claims_list if c["claim_reference"] == claim_ref), None)
    assert found is not None
    assert found["provider_name"] == "Care Health Insurance"
    assert found["consultation_fee"] == "INR 500.00"
    assert found["status"] == "pending_document_verification"

    # 2. Patient retrieves detail
    detail = await get_patient_insurance_claim_detail(claim_id=claim_ref, principal=patient_principal)
    assert detail["claim_reference"] == claim_ref
    assert detail["patient_name"] == "Srujan M S"
    assert len(detail["documents"]) == 2
    assert len(detail["timeline"]) == 1
    assert detail["timeline"][0].title == "Submitted for Clinic Admin Verification"

    # 3. Other patient gets 404 (isolation enforced)
    with pytest.raises(HTTPException) as exc:
        await get_patient_insurance_claim_detail(claim_id=claim_ref, principal=other_patient_principal)
    assert exc.value.status_code == 404


# =============================================================================
# CHECKPOINT 8: CLINIC ADMIN INSURANCE CLAIM VERIFICATION TESTS
# =============================================================================

@pytest.mark.asyncio
async def test_clinic_admin_list_claims_and_kpis(mock_db, clinic_admin_principal, other_tenant_clinic_admin):
    # Seed claims in tenant-1 with distinct statuses
    mock_db["insurance_claims"].docs.extend([
        {
            "id": "clm-kpi-001",
            "claim_reference": "KC-CLM-202611-KPI001",
            "tenant_id": "tenant-1",
            "patient_id": "patient-1",
            "patient_name": "Srujan M S",
            "doctor_name": "Dr. Aisha",
            "specialty": "Cardiology",
            "consultation_date": "2026-11-20T10:00:00Z",
            "provider_name": "Star Health",
            "policy_number_masked": "•••• 1111",
            "consultation_fee": "₹500.00",
            "fee_paise": 50000,
            "currency": "INR",
            "status": "pending_document_verification",
            "status_label": "Pending Document Verification",
            "submitted_at": "2026-11-20T10:05:00Z",
            "created_at": "2026-11-20T10:05:00Z",
        },
        {
            "id": "clm-kpi-002",
            "claim_reference": "KC-CLM-202611-KPI002",
            "tenant_id": "tenant-1",
            "patient_id": "patient-2",
            "patient_name": "Rahul Verma",
            "doctor_name": "Dr. Aisha",
            "specialty": "Cardiology",
            "consultation_date": "2026-11-21T10:00:00Z",
            "provider_name": "Care Health",
            "policy_number_masked": "•••• 2222",
            "consultation_fee": "₹600.00",
            "fee_paise": 60000,
            "currency": "INR",
            "status": "correction_required",
            "status_label": "Correction Required",
            "submitted_at": "2026-11-21T10:05:00Z",
            "created_at": "2026-11-21T10:05:00Z",
        },
        {
            "id": "clm-kpi-003",
            "claim_reference": "KC-CLM-202611-KPI003",
            "tenant_id": "tenant-1",
            "patient_id": "patient-3",
            "patient_name": "Ananya Roy",
            "doctor_name": "Dr. Aisha",
            "specialty": "Cardiology",
            "consultation_date": "2026-11-22T10:00:00Z",
            "provider_name": "HDFC ERGO",
            "policy_number_masked": "•••• 3333",
            "consultation_fee": "₹700.00",
            "fee_paise": 70000,
            "currency": "INR",
            "status": "ready_for_submission",
            "status_label": "Ready for Submission",
            "submitted_at": "2026-11-22T10:05:00Z",
            "created_at": "2026-11-22T10:05:00Z",
        },
        {
            "id": "clm-kpi-004",
            "claim_reference": "KC-CLM-202611-KPI004",
            "tenant_id": "tenant-1",
            "patient_id": "patient-4",
            "patient_name": "Draft User",
            "doctor_name": "Dr. Aisha",
            "consultation_date": "2026-11-23T10:00:00Z",
            "provider_name": "Star Health",
            "policy_number_masked": "•••• 4444",
            "consultation_fee": "₹500.00",
            "fee_paise": 50000,
            "currency": "INR",
            "status": "draft",
            "status_label": "Draft",
            "created_at": "2026-11-23T10:05:00Z",
        },
        # Claim in other tenant (tenant-other-999)
        {
            "id": "clm-kpi-other",
            "claim_reference": "KC-CLM-202611-OTHER",
            "tenant_id": "tenant-other-999",
            "patient_id": "patient-other",
            "patient_name": "Other Patient",
            "doctor_name": "Dr. Other",
            "consultation_date": "2026-11-20T10:00:00Z",
            "provider_name": "Star Health",
            "policy_number_masked": "•••• 9999",
            "consultation_fee": "₹900.00",
            "fee_paise": 90000,
            "currency": "INR",
            "status": "pending_document_verification",
            "status_label": "Pending Document Verification",
            "submitted_at": "2026-11-20T10:05:00Z",
            "created_at": "2026-11-20T10:05:00Z",
        },
    ])

    # 1. Fetch claims list and KPI stats
    res = await list_clinic_admin_insurance_claims(principal=clinic_admin_principal)
    assert res["stats"]["pending_verification"] == 1
    assert res["stats"]["correction_required"] == 1
    assert res["stats"]["ready_for_submission"] == 1
    assert res["stats"]["total"] == 3  # Non-draft claims in tenant-1
    assert res["total"] == 3
    assert len(res["items"]) == 3
    # Check tenant isolation: other tenant claim is not present
    assert not any(item["claim_reference"] == "KC-CLM-202611-OTHER" for item in res["items"])

    # 2. Filter by status: correction_required
    corr_res = await list_clinic_admin_insurance_claims(status="correction_required", principal=clinic_admin_principal)
    assert corr_res["total"] == 1
    assert corr_res["items"][0]["claim_reference"] == "KC-CLM-202611-KPI002"

    # 3. Search by patient name
    search_res = await list_clinic_admin_insurance_claims(search="Srujan", principal=clinic_admin_principal)
    assert search_res["total"] == 1
    assert search_res["items"][0]["patient_name"] == "Srujan M S"


@pytest.mark.asyncio
async def test_clinic_admin_get_claim_detail_and_isolation(mock_db, clinic_admin_principal, other_tenant_clinic_admin):
    claim_id = "clm-detail-001"
    mock_db["insurance_claims"].docs.append({
        "id": claim_id,
        "claim_reference": "KC-CLM-202611-DET001",
        "tenant_id": "tenant-1",
        "patient_id": "patient-101",
        "patient_name": "Srujan M S",
        "patient_phone": "+91 98765 43210",
        "appointment_id": "apt-detail-001",
        "appointment_display_id": "KC-APT-DET001",
        "doctor_name": "Dr. Aisha Sharma",
        "specialty": "Cardiology",
        "consultation_date": "2026-11-20T10:00:00Z",
        "policy_id": "pol-001",
        "provider_id": "prov-001",
        "provider_name": "Care Health",
        "policy_number_masked": "•••• 5566",
        "policy_holder_name": "Srujan M S",
        "relationship": "Self",
        "consultation_fee": "₹500.00",
        "fee_paise": 50000,
        "currency": "INR",
        "payment_id": "pay_TEST_001",
        "consent_id": "cst-001",
        "consent_version": "1.0",
        "consent_accepted_at": "2026-11-20T10:05:00Z",
        "status": "pending_document_verification",
        "status_label": "Pending Document Verification",
        "documents": [
            {"id": "doc-prof", "category": "patient_profile", "title": "Patient Demographic Record", "status": "Available"},
            {"id": "doc-card", "category": "insurance_card", "title": "Member Card", "status": "Available"},
        ],
        "timeline": [
            {
                "stage": "submission",
                "status": "pending_document_verification",
                "title": "Submitted for Clinic Admin Verification",
                "description": "Queued for audit.",
                "occurred_at": "2026-11-20T10:05:00Z",
                "actor_role": "patient",
            }
        ],
        "submitted_at": "2026-11-20T10:05:00Z",
        "created_at": "2026-11-20T10:05:00Z",
    })

    # Authorized admin gets details
    detail = await get_clinic_admin_insurance_claim_detail(claim_id=claim_id, principal=clinic_admin_principal)
    assert detail["claim_reference"] == "KC-CLM-202611-DET001"
    assert detail["patient_name"] == "Srujan M S"
    assert len(detail["documents"]) == 2
    assert len(detail["timeline"]) == 1

    # Other tenant admin gets 404
    with pytest.raises(HTTPException) as exc:
        await get_clinic_admin_insurance_claim_detail(claim_id=claim_id, principal=other_tenant_clinic_admin)
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_clinic_admin_verify_claim_mark_ready(mock_db, clinic_admin_principal):
    claim_id = "clm-ready-001"
    mock_db["insurance_claims"].docs.append({
        "id": claim_id,
        "claim_reference": "KC-CLM-202611-RDY001",
        "tenant_id": "tenant-1",
        "patient_id": "patient-101",
        "user_id": "patient-101",
        "patient_name": "Srujan M S",
        "appointment_id": "apt-001",
        "status": "pending_document_verification",
        "status_label": "Pending Document Verification",
        "documents": [
            {"id": "doc-inv", "category": "consultation_invoice", "title": "Tax Invoice", "status": "Available"},
            {"id": "doc-card", "category": "insurance_card", "title": "Member Card", "status": "Available"},
        ],
        "timeline": [
            {
                "stage": "submission",
                "status": "pending_document_verification",
                "title": "Submitted for Clinic Admin Verification",
                "description": "Audit initiated.",
                "occurred_at": "2026-11-20T10:05:00Z",
                "actor_role": "patient",
            }
        ],
    })

    # 1. Cannot mark ready if any document is rejected in payload
    with pytest.raises(HTTPException) as exc:
        await verify_clinic_admin_insurance_claim(
            claim_id=claim_id,
            payload=ClinicAdminClaimVerifyRequest(
                action="mark_ready",
                document_decisions=[
                    ClaimDocumentVerificationItem(document_id="doc-card", status="rejected", remarks="Illegible"),
                ],
            ),
            principal=clinic_admin_principal,
        )
    assert exc.value.status_code == 422
    assert "rejected" in exc.value.detail.lower()

    # 2. Mark Ready for Submission successfully
    res = await verify_clinic_admin_insurance_claim(
        claim_id=claim_id,
        payload=ClinicAdminClaimVerifyRequest(
            action="mark_ready",
            remarks="All clinical records and payment receipts verified.",
        ),
        principal=clinic_admin_principal,
    )
    assert res["status"] == "ready_for_submission"
    assert res["status_label"] == "Ready for Submission"

    # Verify database update
    updated_claim = await mock_db["insurance_claims"].find_one({"id": claim_id})
    assert updated_claim["status"] == "ready_for_submission"
    assert updated_claim["reviewer_id"] == "clinic-admin-001"
    assert len(updated_claim["timeline"]) == 2
    assert updated_claim["timeline"][-1]["status"] == "ready_for_submission"

    # Verify notification sent to patient
    notifs = [n for n in mock_db["notifications"].docs if n.get("recipient_id") == "patient-101"]
    assert any(n.get("type") == "insurance_claim_verified" for n in notifs)

    # Verify audit log
    audits = [a for a in mock_db["audit_logs"].docs if a.get("action") == "insurance_claim.verified"]
    assert len(audits) >= 1
    assert audits[-1]["resource_id"] == claim_id


@pytest.mark.asyncio
async def test_clinic_admin_verify_claim_request_correction(mock_db, clinic_admin_principal):
    claim_id = "clm-corr-001"
    mock_db["insurance_claims"].docs.append({
        "id": claim_id,
        "claim_reference": "KC-CLM-202611-COR001",
        "tenant_id": "tenant-1",
        "patient_id": "patient-101",
        "user_id": "patient-101",
        "patient_name": "Srujan M S",
        "appointment_id": "apt-001",
        "status": "pending_document_verification",
        "status_label": "Pending Document Verification",
        "documents": [
            {"id": "doc-inv", "category": "consultation_invoice", "title": "Tax Invoice", "status": "Available"},
            {"id": "doc-card", "category": "insurance_card", "title": "Member Card", "status": "Available"},
        ],
        "timeline": [
            {
                "stage": "submission",
                "status": "pending_document_verification",
                "title": "Submitted",
                "description": "Queued.",
                "occurred_at": "2026-11-20T10:05:00Z",
                "actor_role": "patient",
            }
        ],
    })

    # 1. Reject if remarks is empty
    with pytest.raises(HTTPException) as exc:
        await verify_clinic_admin_insurance_claim(
            claim_id=claim_id,
            payload=ClinicAdminClaimVerifyRequest(action="request_correction", remarks="   "),
            principal=clinic_admin_principal,
        )
    assert exc.value.status_code == 422
    assert "mandatory" in exc.value.detail.lower()

    # 2. Request corrections with remarks and doc decision
    res = await verify_clinic_admin_insurance_claim(
        claim_id=claim_id,
        payload=ClinicAdminClaimVerifyRequest(
            action="request_correction",
            remarks="Insurance card copy is cut off at the bottom. Please upload a full copy with member ID visible.",
            document_decisions=[
                ClaimDocumentVerificationItem(
                    document_id="doc-card",
                    status="rejected",
                    remarks="Cropped photo. Member ID is illegible.",
                ),
            ],
        ),
        principal=clinic_admin_principal,
    )
    assert res["status"] == "correction_required"
    assert res["status_label"] == "Correction Required"

    # Verify database update
    updated_claim = await mock_db["insurance_claims"].find_one({"id": claim_id})
    assert updated_claim["status"] == "correction_required"
    assert updated_claim["verification_remarks"] == "Insurance card copy is cut off at the bottom. Please upload a full copy with member ID visible."
    doc_card = next(d for d in updated_claim["documents"] if d["id"] == "doc-card")
    assert doc_card["verification_status"] == "rejected"

    # Verify patient notification
    notifs = [n for n in mock_db["notifications"].docs if n.get("recipient_id") == "patient-101"]
    assert any(n.get("type") == "insurance_claim_correction_required" for n in notifs)

    # Verify audit log
    audits = [a for a in mock_db["audit_logs"].docs if a.get("action") == "insurance_claim.correction_requested"]
    assert len(audits) >= 1


@pytest.mark.asyncio
async def test_patient_resubmit_claim_workflow_and_isolation(mock_db, patient_principal, other_patient_principal):
    claim_id = "clm-resub-001"
    mock_db["insurance_claims"].docs.append({
        "id": claim_id,
        "claim_reference": "KC-CLM-202611-RSB001",
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "patient_name": "Srujan M S",
        "appointment_id": "apt-001",
        "status": "correction_required",
        "status_label": "Correction Required",
        "verification_remarks": "Please provide clearer card.",
        "documents": [
            {"id": "doc-card", "category": "insurance_card", "title": "Card", "verification_status": "rejected"},
        ],
        "timeline": [
            {
                "stage": "correction_requested",
                "status": "correction_required",
                "title": "Correction Requested",
                "description": "Please provide clearer card.",
                "occurred_at": "2026-11-20T10:05:00Z",
                "actor_role": "clinic_admin",
            }
        ],
    })

    # 1. Other patient cannot resubmit (isolation enforced)
    with pytest.raises(HTTPException) as exc1:
        await resubmit_patient_insurance_claim(
            claim_id=claim_id,
            payload=PatientClaimResubmitRequest(notes="Unauthorized attempt"),
            principal=other_patient_principal,
        )
    assert exc1.value.status_code == 404

    # 2. Patient resubmits successfully
    res = await resubmit_patient_insurance_claim(
        claim_id=claim_id,
        payload=PatientClaimResubmitRequest(notes="Re-uploaded high resolution card scan showing full member ID."),
        principal=patient_principal,
    )
    assert res["status"] == "pending_document_verification"
    assert "resubmitted" in res["message"].lower()

    # Verify DB update
    updated_claim = await mock_db["insurance_claims"].find_one({"id": claim_id})
    assert updated_claim["status"] == "pending_document_verification"
    doc_card = updated_claim["documents"][0]
    assert doc_card["verification_status"] == "pending"  # Reset from rejected to pending
    assert len(updated_claim["timeline"]) == 2
    assert updated_claim["timeline"][-1]["stage"] == "resubmission"

    # Verify Clinic Admin notification dispatched
    admin_notifs = [n for n in mock_db["notifications"].docs if n.get("recipient_role") == "clinic_admin"]
    assert any(n.get("type") == "insurance_claim_resubmitted" for n in admin_notifs)

    # Verify audit log
    audits = [a for a in mock_db["audit_logs"].docs if a.get("action") == "insurance_claim.resubmitted"]
    assert len(audits) >= 1


# =============================================================================
# CHECKPOINT 9: INSURER SUBMISSION & CLAIM STATUS TRACKING TESTS
# =============================================================================

@pytest.mark.asyncio
async def test_clinic_admin_get_claim_document_package(mock_db, clinic_admin_principal):
    claim_id = "clm-pkg-001"
    provider_id = "prov-pkg-001"

    mock_db["insurance_providers"].docs.append({
        "id": provider_id,
        "tenant_id": "tenant-1",
        "provider_name": "HDFC ERGO General Insurance",
        "provider_code": "HDFC_ERGO",
        "provider_type": "Insurance Company",
        "country": "India",
        "claim_submission_portal_url": "https://claims.hdfcergo.com/submit",
        "claim_submission_email": "claims@hdfcergo.com",
        "contact_number": "+91 22 6234 6234",
        "status": "Active",
    })

    mock_db["insurance_claims"].docs.append({
        "id": claim_id,
        "claim_reference": "KC-CLM-202611-PKG001",
        "tenant_id": "tenant-1",
        "patient_id": "patient-101",
        "patient_name": "Srujan M S",
        "appointment_id": "apt-pkg-001",
        "appointment_display_id": "KC-APT-PKG001",
        "policy_id": "pol-001",
        "provider_id": provider_id,
        "provider_name": "HDFC ERGO General Insurance",
        "policy_number_masked": "•••• 8821",
        "consent_id": "cst-001",
        "consent_status": "granted",
        "patient_consented": True,
        "status": "ready_for_submission",
        "status_label": "Ready for Submission",
        "documents": [
            {"id": "doc-inv", "category": "consultation_invoice", "title": "Invoice", "status": "Available", "verification_status": "verified"},
            {"id": "doc-rx", "category": "prescription", "title": "Prescription", "status": "Available", "verification_status": "verified"},
        ],
    })

    # 1. Retrieve document package successfully
    pkg = await get_clinic_admin_claim_document_package(claim_id=claim_id, principal=clinic_admin_principal)
    assert pkg["claim_reference"] == "KC-CLM-202611-PKG001"
    assert pkg["consent_verified"] is True
    assert pkg["total_documents"] == 2
    assert pkg["provider_info"]["claim_submission_portal_url"] == "https://claims.hdfcergo.com/submit"
    assert pkg["provider_info"]["claim_submission_email"] == "claims@hdfcergo.com"

    # 2. Block document release if patient consent was withdrawn
    mock_db["insurance_claims"].docs[-1]["consent_status"] = "withdrawn"
    with pytest.raises(HTTPException) as exc:
        await get_clinic_admin_claim_document_package(claim_id=claim_id, principal=clinic_admin_principal)
    assert exc.value.status_code == 403
    assert "consent" in exc.value.detail.lower()


@pytest.mark.asyncio
async def test_clinic_admin_submit_to_insurer_workflow(mock_db, clinic_admin_principal):
    claim_id = "clm-sub-ins-001"
    mock_db["insurance_claims"].docs.append({
        "id": claim_id,
        "claim_reference": "KC-CLM-202611-INS001",
        "tenant_id": "tenant-1",
        "patient_id": "patient-101",
        "user_id": "patient-101",
        "patient_name": "Srujan M S",
        "provider_name": "Care Health",
        "status": "ready_for_submission",
        "status_label": "Ready for Submission",
        "consent_status": "granted",
        "patient_consented": True,
        "timeline": [
            {
                "stage": "verification",
                "status": "ready_for_submission",
                "title": "Verified & Ready for Submission",
                "description": "All records audited.",
                "occurred_at": "2026-11-20T10:00:00Z",
                "actor_role": "clinic_admin",
            }
        ],
    })

    res = await submit_claim_to_insurer(
        claim_id=claim_id,
        payload=SubmitToInsurerRequest(
            insurer_claim_reference="CARE-CLM-883921",
            submission_method="portal",
            submission_date="2026-11-26",
            acknowledgment_document="Care_Portal_Receipt_883921.pdf",
            notes="Uploaded via Care Health Partner Portal with e-signature.",
        ),
        principal=clinic_admin_principal,
    )

    assert res["status"] == "submitted_to_insurer"
    assert res["status_label"] == "Submitted to Insurer"
    assert res["insurer_claim_reference"] == "CARE-CLM-883921"
    assert res["submission_method"] == "portal"

    # Verify database state
    updated_claim = await mock_db["insurance_claims"].find_one({"id": claim_id})
    assert updated_claim["status"] == "submitted_to_insurer"
    assert updated_claim["insurer_claim_reference"] == "CARE-CLM-883921"
    assert len(updated_claim["timeline"]) == 2
    assert updated_claim["timeline"][-1]["status"] == "submitted_to_insurer"

    # Verify patient notification
    notifs = [n for n in mock_db["notifications"].docs if n.get("recipient_id") == "patient-101"]
    assert any(n.get("type") == "insurance_claim_submitted_to_insurer" for n in notifs)

    # Verify audit log
    audits = [a for a in mock_db["audit_logs"].docs if a.get("action") == "insurance_claim.submitted_to_insurer"]
    assert len(audits) >= 1
    assert audits[-1]["metadata"]["insurer_claim_reference"] == "CARE-CLM-883921"


@pytest.mark.asyncio
async def test_clinic_admin_submit_to_insurer_validations_and_duplicate_prevention(mock_db, clinic_admin_principal):
    claim_id = "clm-dup-001"
    mock_db["insurance_claims"].docs.append({
        "id": claim_id,
        "claim_reference": "KC-CLM-202611-DUP001",
        "tenant_id": "tenant-1",
        "patient_id": "patient-101",
        "provider_name": "Star Health",
        "status": "pending_document_verification",  # NOT ready yet
        "consent_status": "granted",
        "patient_consented": True,
    })

    # 1. Block submission if claim is not ready_for_submission
    with pytest.raises(HTTPException) as exc1:
        await submit_claim_to_insurer(
            claim_id=claim_id,
            payload=SubmitToInsurerRequest(insurer_claim_reference="STAR-111"),
            principal=clinic_admin_principal,
        )
    assert exc1.value.status_code == 400
    assert "ready for submission" in exc1.value.detail.lower()

    # Change to ready_for_submission, but withdraw consent
    mock_db["insurance_claims"].docs[-1]["status"] = "ready_for_submission"
    mock_db["insurance_claims"].docs[-1]["consent_status"] = "withdrawn"

    # 2. Block submission if patient consent is withdrawn
    with pytest.raises(HTTPException) as exc2:
        await submit_claim_to_insurer(
            claim_id=claim_id,
            payload=SubmitToInsurerRequest(insurer_claim_reference="STAR-111"),
            principal=clinic_admin_principal,
        )
    assert exc2.value.status_code == 403
    assert "consent" in exc2.value.detail.lower()

    # Re-grant consent and submit once
    mock_db["insurance_claims"].docs[-1]["consent_status"] = "granted"
    await submit_claim_to_insurer(
        claim_id=claim_id,
        payload=SubmitToInsurerRequest(insurer_claim_reference="STAR-111"),
        principal=clinic_admin_principal,
    )

    # 3. Duplicate submission prevention
    with pytest.raises(HTTPException) as exc3:
        await submit_claim_to_insurer(
            claim_id=claim_id,
            payload=SubmitToInsurerRequest(insurer_claim_reference="STAR-222"),
            principal=clinic_admin_principal,
        )
    assert exc3.value.status_code == 400
    assert "already been submitted" in exc3.value.detail.lower()


@pytest.mark.asyncio
async def test_clinic_admin_update_insurer_status_review_and_queries(mock_db, clinic_admin_principal):
    claim_id = "clm-status-001"
    mock_db["insurance_claims"].docs.append({
        "id": claim_id,
        "claim_reference": "KC-CLM-202611-STAT001",
        "tenant_id": "tenant-1",
        "patient_id": "patient-101",
        "user_id": "patient-101",
        "provider_name": "Niva Bupa Health",
        "insurer_claim_reference": "NB-CLM-9090",
        "status": "submitted_to_insurer",
        "status_label": "Submitted to Insurer",
        "timeline": [],
    })

    # 1. Update to under_insurer_review
    res1 = await update_insurer_claim_status(
        claim_id=claim_id,
        payload=InsurerStatusUpdateRequest(
            status="under_insurer_review",
            notes="Insurer technical team assigned senior adjudicator.",
        ),
        principal=clinic_admin_principal,
    )
    assert res1["status"] == "under_insurer_review"
    assert res1["status_label"] == "Under Insurer Review"

    # 2. Reject transition to additional_documents_required without mandatory requested_documents
    with pytest.raises(HTTPException) as exc:
        await update_insurer_claim_status(
            claim_id=claim_id,
            payload=InsurerStatusUpdateRequest(
                status="additional_documents_required",
                requested_documents="   ",
            ),
            principal=clinic_admin_principal,
        )
    assert exc.value.status_code == 422
    assert "mandatory" in exc.value.detail.lower()

    # 3. Successfully update to additional_documents_required
    res2 = await update_insurer_claim_status(
        claim_id=claim_id,
        payload=InsurerStatusUpdateRequest(
            status="additional_documents_required",
            requested_documents="Itemized pharmacy bill with GSTIN and doctor's prescription batch number.",
        ),
        principal=clinic_admin_principal,
    )
    assert res2["status"] == "additional_documents_required"
    assert res2["status_label"] == "Additional Documents Required"

    # Verify notification dispatched to patient
    notifs = [n for n in mock_db["notifications"].docs if n.get("recipient_id") == "patient-101"]
    assert any(n.get("type") == "insurance_claim_additional_documents_required" for n in notifs)


@pytest.mark.asyncio
async def test_patient_upload_and_submit_additional_documents(mock_db, patient_principal, other_patient_principal):
    claim_id = "clm-add-docs-001"
    mock_db["insurance_claims"].docs.append({
        "id": claim_id,
        "claim_reference": "KC-CLM-202611-ADD001",
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "user_id": "patient-user-101",
        "provider_name": "Care Health",
        "status": "additional_documents_required",
        "status_label": "Additional Documents Required",
        "documents": [],
        "timeline": [],
    })

    # 1. Other patient cannot upload
    dummy_pdf = UploadFile(
        filename="Itemized_Pharmacy_Bill.pdf",
        file=BytesIO(b"%PDF-1.4 sample bill content"),
        headers={"content-type": "application/pdf"},
    )
    with pytest.raises(HTTPException) as exc1:
        await upload_patient_additional_document(
            claim_id=claim_id,
            title="Itemized Pharmacy Bill",
            file=dummy_pdf,
            principal=other_patient_principal,
        )
    assert exc1.value.status_code == 404

    # 2. Patient uploads additional document
    dummy_pdf2 = UploadFile(
        filename="Itemized_Pharmacy_Bill.pdf",
        file=BytesIO(b"%PDF-1.4 sample bill content"),
        headers={"content-type": "application/pdf"},
    )
    upload_res = await upload_patient_additional_document(
        claim_id=claim_id,
        title="Itemized Pharmacy Bill",
        file=dummy_pdf2,
        principal=patient_principal,
    )
    assert upload_res["id"] is not None
    assert upload_res["document_type"] == "additional_requested_document"

    # Verify claim now has document
    claim = await mock_db["insurance_claims"].find_one({"id": claim_id})
    assert len(claim["documents"]) == 1
    assert claim["documents"][0]["category"] == "additional_requested_document"

    # 3. Patient submits additional documents
    submit_res = await submit_patient_additional_documents(
        claim_id=claim_id,
        payload=PatientSubmitAdditionalDocsRequest(notes="Attached GST invoice from hospital pharmacy."),
        principal=patient_principal,
    )
    assert submit_res["status"] == "under_insurer_review"
    assert submit_res["status_label"] == "Under Insurer Review"

    # Verify clinic admin notification
    admin_notifs = [n for n in mock_db["notifications"].docs if n.get("recipient_role") == "clinic_admin"]
    assert any(n.get("type") == "insurance_claim_additional_docs_submitted" for n in admin_notifs)


@pytest.mark.asyncio
async def test_clinic_admin_insurer_adjudication_settlement(mock_db, clinic_admin_principal, other_tenant_clinic_admin):
    claim_id = "clm-adj-001"
    mock_db["insurance_claims"].docs.append({
        "id": claim_id,
        "claim_reference": "KC-CLM-202611-ADJ001",
        "tenant_id": "tenant-1",
        "patient_id": "patient-101",
        "user_id": "patient-101",
        "provider_name": "Bajaj Allianz",
        "insurer_claim_reference": "BA-CLM-1002",
        "consultation_fee": "₹1,000.00",
        "status": "under_insurer_review",
        "status_label": "Under Insurer Review",
        "timeline": [],
    })

    # 1. Other tenant admin cannot update status (tenant isolation)
    with pytest.raises(HTTPException) as exc1:
        await update_insurer_claim_status(
            claim_id=claim_id,
            payload=InsurerStatusUpdateRequest(
                status="approved",
                approved_amount="₹1,000.00",
                settlement_reference="BA-SETTL-01",
            ),
            principal=other_tenant_clinic_admin,
        )
    assert exc1.value.status_code == 404

    # 2. Approval requires approved_amount and settlement_reference
    with pytest.raises(HTTPException) as exc2:
        await update_insurer_claim_status(
            claim_id=claim_id,
            payload=InsurerStatusUpdateRequest(
                status="approved",
                approved_amount="",
                settlement_reference="BA-SETTL-01",
            ),
            principal=clinic_admin_principal,
        )
    assert exc2.value.status_code == 422

    # 3. Partially approved requires co_pay_or_deduction_reason
    with pytest.raises(HTTPException) as exc3:
        await update_insurer_claim_status(
            claim_id=claim_id,
            payload=InsurerStatusUpdateRequest(
                status="partially_approved",
                approved_amount="₹800.00",
                co_pay_or_deduction_reason="   ",
                settlement_reference="BA-SETTL-01",
            ),
            principal=clinic_admin_principal,
        )
    assert exc3.value.status_code == 422

    # 4. Rejection requires rejection_reason and settlement_reference
    with pytest.raises(HTTPException) as exc4:
        await update_insurer_claim_status(
            claim_id=claim_id,
            payload=InsurerStatusUpdateRequest(
                status="rejected",
                rejection_reason="",
                settlement_reference="BA-REJ-01",
            ),
            principal=clinic_admin_principal,
        )
    assert exc4.value.status_code == 422

    # 5. Execute Approved status successfully
    appr_res = await update_insurer_claim_status(
        claim_id=claim_id,
        payload=InsurerStatusUpdateRequest(
            status="approved",
            approved_amount="₹1,000.00",
            approved_amount_paise=100000,
            settlement_reference="BA-SETTL-998822",
            evidence_document="Settlement_Voucher_998822.pdf",
            notes="Full amount approved by Bajaj Allianz medical team.",
        ),
        principal=clinic_admin_principal,
    )
    assert appr_res["status"] == "approved"
    assert appr_res["status_label"] == "Approved"
    assert appr_res["approved_amount"] == "₹1,000.00"

    # Verify claim state in database
    claim = await mock_db["insurance_claims"].find_one({"id": claim_id})
    assert claim["status"] == "approved"
    assert claim["approved_amount"] == "₹1,000.00"
    assert claim["settlement_reference"] == "BA-SETTL-998822"
    assert claim["timeline"][-1]["status"] == "approved"
    assert "approved" in claim["timeline"][-1]["title"].lower()

    # Verify patient notification dispatched
    notifs = [n for n in mock_db["notifications"].docs if n.get("recipient_id") == "patient-101"]
    assert any(n.get("type") == "insurance_claim_approved" for n in notifs)


# ==============================================================================
# CHECKPOINT 10: PATIENT REIMBURSEMENT TRACKING TESTS
# ==============================================================================

@pytest.mark.asyncio
async def test_clinic_admin_record_reimbursement_success_and_cumulative_balance(
    mock_db, clinic_admin_principal, patient_principal
):
    claim_id = "claim-reimb-001"
    now_iso = datetime.now(UTC).isoformat()

    mock_db["insurance_claims"].docs.append({
        "id": claim_id,
        "claim_reference": "CLM-2026-REIMB-001",
        "tenant_id": "tenant-1",
        "clinic_id": "clinic-1",
        "patient_id": "patient-user-101",
        "appointment_id": "apt-reimb-001",
        "provider_name": "Star Health and Allied Insurance",
        "status": "approved",
        "status_label": "Approved",
        "consultation_fee": "₹1,000.00",
        "fee_paise": 100000,
        "approved_amount": "₹1,000.00",
        "approved_amount_paise": 100000,
        "settlement_reference": "STAR-SETTL-991122",
        "timeline": [],
        "created_at": now_iso,
    })

    # 1. Record first partial reimbursement: ₹400.00
    res1 = await record_claim_reimbursement(
        claim_id=claim_id,
        payload=RecordReimbursementRequest(
            reimbursement_amount="400.00",
            reimbursement_date="2026-11-20",
            payment_reference="UTR-HDFC-001",
            payment_method="neft_rtgs",
            supporting_evidence_id="evid-doc-01",
            notes="First installment of approved consultation claim.",
        ),
        principal=clinic_admin_principal,
    )

    assert res1["reimbursement_status"] == "partially_reimbursed"
    assert res1["reimbursement_status_label"] == "Partially Reimbursed"
    assert res1["reimbursement_amount"] == "400.00"
    assert res1["total_reimbursed_amount"] == "400.00"
    assert res1["pending_reimbursement_amount"] == "600.00"
    assert res1["is_fully_reimbursed"] is False
    assert res1["transaction"].payment_reference == "UTR-HDFC-001"
    assert "••••" in res1["transaction"].payment_reference_masked

    # Verify claim updated in DB
    claim = await mock_db["insurance_claims"].find_one({"id": claim_id})
    assert claim["reimbursement_status"] == "partially_reimbursed"
    assert claim["reimbursed_amount"] == "400.00"
    assert claim["pending_reimbursement_amount"] == "600.00"
    assert len(claim["timeline"]) == 1
    assert "400.00" in claim["timeline"][0]["description"]

    # 2. Record second reimbursement for remaining ₹600.00
    res2 = await record_claim_reimbursement(
        claim_id=claim_id,
        payload=RecordReimbursementRequest(
            reimbursement_amount="600.00",
            reimbursement_date="2026-11-22",
            payment_reference="UTR-HDFC-002",
            payment_method="direct_bank_transfer",
            supporting_evidence_id="evid-doc-02",
            notes="Final balance settlement.",
        ),
        principal=clinic_admin_principal,
    )

    assert res2["reimbursement_status"] == "fully_reimbursed"
    assert res2["reimbursement_status_label"] == "Fully Reimbursed"
    assert res2["reimbursement_amount"] == "600.00"
    assert res2["total_reimbursed_amount"] == "1000.00"
    assert res2["pending_reimbursement_amount"] == "0.00"
    assert res2["is_fully_reimbursed"] is True

    # Verify claim state and transactions collection
    claim = await mock_db["insurance_claims"].find_one({"id": claim_id})
    assert claim["reimbursement_status"] == "fully_reimbursed"
    assert claim["reimbursed_amount"] == "1000.00"
    assert claim["pending_reimbursement_amount"] == "0.00"
    assert len(claim["timeline"]) == 2

    # Verify 2 records in insurance_reimbursements
    reimb_docs = mock_db["insurance_reimbursements"].docs
    matching_txs = [t for t in reimb_docs if t["claim_id"] == claim_id]
    assert len(matching_txs) == 2
    assert matching_txs[0]["amount_paise"] == 40000
    assert matching_txs[1]["amount_paise"] == 60000

    # Verify in-app notifications dispatched to patient
    notifs = [n for n in mock_db["notifications"].docs if n.get("recipient_id") == "patient-user-101"]
    assert len(notifs) >= 2
    assert any("Fully Reimbursed" in n.get("title", "") for n in notifs)

    # Verify audit logs created
    audit_logs = [a for a in mock_db["audit_logs"].docs if a.get("action") == "insurance_reimbursement.recorded"]
    assert len(audit_logs) >= 2


@pytest.mark.asyncio
async def test_clinic_admin_record_reimbursement_validations_and_duplicate_prevention(
    mock_db, clinic_admin_principal
):
    claim_id = "claim-reimb-validations"
    now_iso = datetime.now(UTC).isoformat()

    # 1. Reject if claim status is not approved or partially_approved
    mock_db["insurance_claims"].docs.append({
        "id": claim_id,
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "status": "submitted_to_insurer",
        "consultation_fee": "₹1,000.00",
        "approved_amount": "₹1,000.00",
        "approved_amount_paise": 100000,
    })

    with pytest.raises(HTTPException) as exc1:
        await record_claim_reimbursement(
            claim_id=claim_id,
            payload=RecordReimbursementRequest(
                reimbursement_amount="500.00",
                reimbursement_date="2026-11-20",
                payment_reference="TXN-001",
                supporting_evidence_id="evid-doc-01",
            ),
            principal=clinic_admin_principal,
        )
    assert exc1.value.status_code == 400
    assert "approved or partially approved" in exc1.value.detail.lower()

    # Switch to partially_approved with approved amount ₹800.00
    await mock_db["insurance_claims"].update_one(
        {"id": claim_id},
        {"$set": {"status": "partially_approved", "approved_amount": "₹800.00", "approved_amount_paise": 80000}}
    )

    # 2. Reject zero or negative amount
    with pytest.raises(HTTPException) as exc2:
        await record_claim_reimbursement(
            claim_id=claim_id,
            payload=RecordReimbursementRequest(
                reimbursement_amount="0.00",
                reimbursement_date="2026-11-20",
                payment_reference="TXN-002",
                supporting_evidence_id="evid-doc-01",
            ),
            principal=clinic_admin_principal,
        )
    assert exc2.value.status_code == 400
    assert "greater than zero" in exc2.value.detail.lower()

    # 3. Reject amount exceeding approved balance (attempt ₹900 on ₹800 approved)
    with pytest.raises(HTTPException) as exc3:
        await record_claim_reimbursement(
            claim_id=claim_id,
            payload=RecordReimbursementRequest(
                reimbursement_amount="900.00",
                reimbursement_date="2026-11-20",
                payment_reference="TXN-003",
                supporting_evidence_id="evid-doc-01",
            ),
            principal=clinic_admin_principal,
        )
    assert exc3.value.status_code == 400
    assert "exceeds" in exc3.value.detail.lower()

    # 4. Reject if supporting evidence is missing or blank
    with pytest.raises(ValueError) as exc_evid:
        RecordReimbursementRequest(
            reimbursement_amount="500.00",
            reimbursement_date="2026-11-20",
            payment_reference="TXN-NO-EVID",
            supporting_evidence_id="",
        )
    assert "Supporting evidence document is mandatory" in str(exc_evid.value)

    # 5. Record valid partial reimbursement of ₹500
    await record_claim_reimbursement(
        claim_id=claim_id,
        payload=RecordReimbursementRequest(
            reimbursement_amount="500.00",
            reimbursement_date="2026-11-20",
            payment_reference="TXN-DUPLICATE-REF",
            supporting_evidence_id="evid-doc-01",
        ),
        principal=clinic_admin_principal,
    )

    # 6. Reject duplicate payment reference for the same claim
    with pytest.raises(HTTPException) as exc4:
        await record_claim_reimbursement(
            claim_id=claim_id,
            payload=RecordReimbursementRequest(
                reimbursement_amount="200.00",
                reimbursement_date="2026-11-21",
                payment_reference="TXN-DUPLICATE-REF",
                supporting_evidence_id="evid-doc-02",
            ),
            principal=clinic_admin_principal,
        )
    assert exc4.value.status_code == 409
    assert "already been recorded" in exc4.value.detail.lower()

    # 7. Complete remaining ₹300
    await record_claim_reimbursement(
        claim_id=claim_id,
        payload=RecordReimbursementRequest(
            reimbursement_amount="300.00",
            reimbursement_date="2026-11-22",
            payment_reference="TXN-FINAL-REF",
            supporting_evidence_id="evid-doc-03",
        ),
        principal=clinic_admin_principal,
    )

    # 8. Reject further reimbursement when already fully reimbursed
    with pytest.raises(HTTPException) as exc5:
        await record_claim_reimbursement(
            claim_id=claim_id,
            payload=RecordReimbursementRequest(
                reimbursement_amount="100.00",
                reimbursement_date="2026-11-23",
                payment_reference="TXN-OVER-REF",
                supporting_evidence_id="evid-doc-04",
            ),
            principal=clinic_admin_principal,
        )
    assert exc5.value.status_code == 400
    assert "fully reimbursed" in exc5.value.detail.lower()


@pytest.mark.asyncio
async def test_patient_get_reimbursement_summary_and_masked_references(
    mock_db, patient_principal, other_patient_principal, clinic_admin_principal
):
    claim_id = "claim-reimb-patient-view"
    now_iso = datetime.now(UTC).isoformat()

    mock_db["insurance_claims"].docs.append({
        "id": claim_id,
        "claim_reference": "CLM-PATIENT-REIMB-101",
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "appointment_id": "apt-p-101",
        "appointment_display_id": "KC-APT-P101",
        "doctor_name": "Dr. Sarah Jenkins",
        "provider_name": "Max Bupa Health Insurance",
        "policy_number_masked": "•••• •••• 5544",
        "consultation_fee": "₹1,200.00",
        "fee_paise": 120000,
        "approved_amount": "₹1,000.00",
        "approved_amount_paise": 100000,
        "status": "partially_approved",
        "created_at": now_iso,
    })

    # Record reimbursement as clinic admin
    await record_claim_reimbursement(
        claim_id=claim_id,
        payload=RecordReimbursementRequest(
            reimbursement_amount="750.00",
            reimbursement_date="2026-11-25",
            payment_reference="NEFT-MAX-77889944",
            payment_method="neft_rtgs",
            supporting_evidence_id="evid-doc-01",
            notes="Partial settlement against approved ₹1,000.",
        ),
        principal=clinic_admin_principal,
    )

    # Patient retrieves reimbursement summary
    summary = await get_patient_claim_reimbursements(
        claim_id=claim_id,
        principal=patient_principal,
    )

    assert summary["claim_id"] == claim_id
    assert summary["claim_reference"] == "CLM-PATIENT-REIMB-101"
    assert summary["original_consultation_fee"] == "₹1,200.00"
    assert summary["approved_amount"] == "1000.00"
    assert summary["reimbursed_amount"] == "750.00"
    assert summary["pending_reimbursement_amount"] == "250.00"
    assert summary["reimbursement_status"] == "partially_reimbursed"
    assert summary["reimbursement_status_label"] == "Partially Reimbursed"
    assert summary["reimbursements_count"] == 1

    # Verify payment reference is masked for patient view
    tx = summary["transactions"][0]
    assert tx["payment_reference_masked"] == "•••• •••• 9944"
    assert tx["payment_reference"] == "•••• •••• 9944"  # Masked in patient response!
    assert tx["reimbursement_amount"] == "750.00"
    assert tx["payment_method_label"] == "NEFT / RTGS"

    # Patient ownership check: other patient receives 404
    with pytest.raises(HTTPException) as exc:
        await get_patient_claim_reimbursements(
            claim_id=claim_id,
            principal=other_patient_principal,
        )
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_clinic_admin_upload_reimbursement_evidence(
    mock_db, clinic_admin_principal
):
    claim_id = "claim-reimb-evidence-test"
    now_iso = datetime.now(UTC).isoformat()

    mock_db["insurance_claims"].docs.append({
        "id": claim_id,
        "claim_reference": "CLM-EVID-001",
        "tenant_id": "tenant-1",
        "patient_id": "patient-user-101",
        "status": "approved",
        "consultation_fee": "₹1,000.00",
        "approved_amount": "₹1,000.00",
        "approved_amount_paise": 100000,
        "created_at": now_iso,
    })

    # Upload valid PDF payment advice
    fake_pdf = BytesIO(b"%PDF-1.4 Fake payment settlement voucher advice content")
    upload_file = UploadFile(filename="Settlement_Advice_UTR9988.pdf", file=fake_pdf, headers={"content-type": "application/pdf"})

    upload_res = await upload_reimbursement_evidence(
        claim_id=claim_id,
        file=upload_file,
        principal=clinic_admin_principal,
    )

    assert upload_res["id"].startswith("reimb-doc-")
    assert upload_res["file_name"] == "Settlement_Advice_UTR9988.pdf"
    assert "/download" in upload_res["download_url"]

    # Record reimbursement referencing the uploaded evidence document
    rec_res = await record_claim_reimbursement(
        claim_id=claim_id,
        payload=RecordReimbursementRequest(
            reimbursement_amount="1000.00",
            reimbursement_date="2026-11-26",
            payment_reference="UTR-SETTL-998811",
            payment_method="direct_bank_transfer",
            supporting_evidence_id=upload_res["id"],
            notes="Settled with attached voucher.",
        ),
        principal=clinic_admin_principal,
    )

    assert rec_res["is_fully_reimbursed"] is True
    assert rec_res["transaction"].supporting_evidence_id == upload_res["id"]
    assert rec_res["transaction"].supporting_evidence_name == "Settlement_Advice_UTR9988.pdf"
    assert "/download" in rec_res["transaction"].supporting_evidence_url

    # Clinic Admin retrieves summary: payment reference is unmasked!
    admin_summary = await get_clinic_admin_claim_reimbursements(
        claim_id=claim_id,
        principal=clinic_admin_principal,
    )
    assert admin_summary["transactions"][0]["payment_reference"] == "UTR-SETTL-998811"  # Unmasked in admin!








