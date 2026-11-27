"""Unit tests for Checkpoint 11: Insurance Notifications & Alerts.

Verifies:
1. Patient notification scenarios (all 9 scenarios):
   - Claim submitted successfully
   - Claim document verification completed
   - Claim correction required
   - Claim submitted to insurer
   - Additional documents requested
   - Claim approved, partially approved, rejected
   - Partial reimbursement recorded
   - Full reimbursement recorded
   - Insurance policy approaching expiry
2. Clinic Admin notification scenarios (all 6 scenarios):
   - New insurance claim received
   - Patient corrected and resubmitted claim
   - Claim pending document verification reminder
   - Verified claim pending insurer submission
   - Additional documents uploaded by patient
   - Approved claim awaiting reimbursement confirmation
3. Deduplication window enforcement.
4. Reminder & alert configuration endpoints (GET / PUT).
5. Background scanners (expiring policies & pending claims).
6. Admin unread count, mark as read, and mark all as read.
7. Patient unread count endpoint.
8. Clinical privacy guard (no prescription, clinical note, or diagnosis exposed).
9. Brevo email delivery fallback & retry.
"""
from datetime import UTC, datetime, timedelta
from typing import Any
import pytest
from fastapi import HTTPException

from teleconsult.kernel.authz.mongodb_policy import MongoPrincipal
from teleconsult.kernel.authz.policy import Principal
from teleconsult.modules.notifications.admin_routes import (
    get_clinic_admin_unread_count,
    get_clinic_notification_config,
    list_clinic_admin_notifications,
    mark_all_clinic_admin_notifications_read,
    mark_clinic_admin_notification_read,
    retry_clinic_admin_notification_email,
    trigger_expiring_policies_scan,
    trigger_pending_claims_scan,
    update_clinic_notification_config,
)
from teleconsult.modules.notifications.insurance_notifications import (
    deliver_brevo_email_safe,
    get_notification_config,
    notify_admin_additional_documents_uploaded,
    notify_admin_approved_awaiting_reimbursement,
    notify_admin_claim_pending_verification,
    notify_admin_claim_resubmitted,
    notify_admin_new_claim_received,
    notify_admin_verified_claim_pending_submission,
    notify_patient_additional_documents_requested,
    notify_patient_claim_adjudicated,
    notify_patient_claim_correction_required,
    notify_patient_claim_submitted,
    notify_patient_claim_submitted_to_insurer,
    notify_patient_claim_verified,
    notify_patient_policy_expiring,
    notify_patient_reimbursement_recorded,
    scan_and_notify_expiring_policies,
    scan_and_notify_pending_claims,
    send_insurance_notification,
    update_notification_config,
)
from teleconsult.modules.notifications.patient_routes import (
    get_patient_unread_count,
    list_notifications,
    mark_all_read,
    mark_read,
)
from teleconsult.modules.notifications.schemas import UpdateNotificationConfigRequest


class MockCursor:
    def __init__(self, docs: list[dict[str, Any]]):
        self._docs = docs

    def sort(self, key: str, direction: int = 1) -> "MockCursor":
        reverse = direction < 0
        self._docs = sorted(self._docs, key=lambda x: str(x.get(key, "")), reverse=reverse)
        return self

    def limit(self, count: int) -> "MockCursor":
        self._docs = self._docs[:count]
        return self

    async def to_list(self, length: int = 100) -> list[dict[str, Any]]:
        return self._docs[:length]

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
                if "$gte" in v:
                    if doc_val is None or doc_val < v["$gte"]:
                        return False
                if "$lte" in v:
                    if doc_val is None or doc_val > v["$lte"]:
                        return False
            elif doc_val != v:
                return False
        return True

    async def find_one(self, query: dict[str, Any]) -> dict[str, Any] | None:
        for d in self.docs:
            if self._matches(d, query):
                return dict(d)
        return None

    def find(self, query: dict[str, Any] | None = None) -> MockCursor:
        if not query:
            return MockCursor([dict(d) for d in self.docs])
        matched = [dict(d) for d in self.docs if self._matches(d, query)]
        return MockCursor(matched)

    async def count_documents(self, query: dict[str, Any]) -> int:
        return sum(1 for d in self.docs if self._matches(d, query))

    async def insert_one(self, doc: dict[str, Any]) -> None:
        self.docs.append(dict(doc))

    async def update_one(self, query: dict[str, Any], update: dict[str, Any], upsert: bool = False) -> Any:
        class UpdateResult:
            def __init__(self, matched: int, modified: int, upserted_id: Any = None):
                self.matched_count = matched
                self.modified_count = modified
                self.upserted_id = upserted_id

        for d in self.docs:
            if self._matches(d, query):
                if "$set" in update:
                    d.update(update["$set"])
                return UpdateResult(1, 1)

        if upsert:
            new_doc = dict(query)
            if "$set" in update:
                new_doc.update(update["$set"])
            if "$setOnInsert" in update:
                new_doc.update(update["$setOnInsert"])
            self.docs.append(new_doc)
            return UpdateResult(0, 0, new_doc.get("id"))

        return UpdateResult(0, 0)

    async def update_many(self, query: dict[str, Any], update: dict[str, Any]) -> Any:
        class UpdateResult:
            def __init__(self, matched: int, modified: int):
                self.matched_count = matched
                self.modified_count = modified

        matched, modified = 0, 0
        for d in self.docs:
            if self._matches(d, query):
                matched += 1
                if "$set" in update:
                    d.update(update["$set"])
                    modified += 1
        return UpdateResult(matched, modified)


class MockDatabase:
    def __init__(self):
        self.collections: dict[str, InMemoryMongoCollection] = {}

    def __getitem__(self, name: str) -> InMemoryMongoCollection:
        if name not in self.collections:
            self.collections[name] = InMemoryMongoCollection()
        return self.collections[name]


@pytest.fixture
def mock_db(monkeypatch):
    db = MockDatabase()
    import teleconsult.kernel.mongodb.client as mc
    monkeypatch.setattr(type(mc.mongo_database), "enabled", property(lambda self: True))
    monkeypatch.setattr(mc.mongo_database, "database", lambda: db)
    return db


@pytest.fixture
def admin_principal():
    return MongoPrincipal(
        user_id="admin-001",
        tenant_id="test-tenant",
        role="clinic_admin",
        clinic_id="clinic-001",
    )


@pytest.fixture
def patient_principal():
    return Principal(
        user_id="pat-001",
        tenant_id="test-tenant",
        roles={"patient"},
        permissions={"notification:read", "notification:retry", "insurance:read", "insurance:write"},
    )


# ==============================================================================
# TEST 1: PATIENT NOTIFICATION SCENARIOS (ALL 9)
# ==============================================================================

@pytest.mark.asyncio
async def test_all_9_patient_notification_scenarios(mock_db):
    tenant_id = "test-tenant"
    patient_id = "pat-001"
    email = "patient@test.com"
    claim_id = "claim-100"
    claim_ref = "CLM-20261126-001"
    provider = "Star Health Insurance"

    # 1. Claim Submitted
    n1 = await notify_patient_claim_submitted(
        mock_db,
        tenant_id=tenant_id,
        patient_id=patient_id,
        patient_email=email,
        claim_id=claim_id,
        claim_reference=claim_ref,
        appointment_display_id="APT-20261126-001",
        provider_name=provider,
    )
    assert n1["event_type"] == "insurance_claim_submitted"
    assert "received" in n1["body"]
    assert n1["target_tab"] == "my-insurance"

    # 2. Claim Verified
    n2 = await notify_patient_claim_verified(
        mock_db,
        tenant_id=tenant_id,
        patient_id=patient_id,
        patient_email=email,
        claim_id=claim_id,
        claim_reference=claim_ref,
        provider_name=provider,
    )
    assert n2["event_type"] == "claim_verification_completed"
    assert "ready for transmission" in n2["body"]

    # 3. Correction Required
    n3 = await notify_patient_claim_correction_required(
        mock_db,
        tenant_id=tenant_id,
        patient_id=patient_id,
        patient_email=email,
        claim_id=claim_id,
        claim_reference=claim_ref,
        remarks="Please attach doctor signature",
    )
    assert n3["event_type"] == "claim_correction_required"
    assert "doctor signature" in n3["body"]

    # 4. Submitted to Insurer
    n4 = await notify_patient_claim_submitted_to_insurer(
        mock_db,
        tenant_id=tenant_id,
        patient_id=patient_id,
        patient_email=email,
        claim_id=claim_id,
        claim_reference=claim_ref,
        provider_name=provider,
        insurer_claim_reference="INS-STAR-999",
        submission_method="portal",
    )
    assert n4["event_type"] == "claim_submitted_to_insurer"
    assert "INS-STAR-999" in n4["body"]

    # 5. Additional Docs Requested
    n5 = await notify_patient_additional_documents_requested(
        mock_db,
        tenant_id=tenant_id,
        patient_id=patient_id,
        patient_email=email,
        claim_id=claim_id,
        claim_reference=claim_ref,
        provider_name=provider,
        requested_documents="Detailed diagnostic lab report",
    )
    assert n5["event_type"] == "additional_documents_requested"
    assert "Detailed diagnostic lab report" in n5["body"]

    # 6. Approved, Partially Approved, Rejected
    n6_app = await notify_patient_claim_adjudicated(
        mock_db,
        tenant_id=tenant_id,
        patient_id=patient_id,
        claim_id=claim_id,
        claim_reference=claim_ref,
        provider_name=provider,
        adjudication_status="approved",
        approved_amount="1500.00",
        settlement_reference="SETTLE-111",
    )
    assert n6_app["event_type"] == "claim_approved"
    assert "₹1500.00" in n6_app["body"]

    n6_part = await notify_patient_claim_adjudicated(
        mock_db,
        tenant_id=tenant_id,
        patient_id=patient_id,
        claim_id=claim_id,
        claim_reference=claim_ref,
        provider_name=provider,
        adjudication_status="partially_approved",
        approved_amount="1000.00",
        co_pay_reason="Consultation deductible 500",
    )
    assert n6_part["event_type"] == "claim_partially_approved"
    assert "₹1000.00" in n6_part["body"]

    n6_rej = await notify_patient_claim_adjudicated(
        mock_db,
        tenant_id=tenant_id,
        patient_id=patient_id,
        claim_id=claim_id,
        claim_reference=claim_ref,
        provider_name=provider,
        adjudication_status="rejected",
        rejection_reason="Out of coverage window",
    )
    assert n6_rej["event_type"] == "claim_rejected"
    assert "Out of coverage window" in n6_rej["body"]

    # 7 & 8. Partial & Full Reimbursement
    n7 = await notify_patient_reimbursement_recorded(
        mock_db,
        tenant_id=tenant_id,
        patient_id=patient_id,
        claim_id=claim_id,
        claim_reference=claim_ref,
        amount="800.00",
        pending_amount="200.00",
        masked_ref="•••• •••• 1234",
        is_full=False,
    )
    assert n7["event_type"] == "partial_reimbursement_recorded"
    assert "₹800.00" in n7["body"]
    assert "₹200.00" in n7["body"]

    n8 = await notify_patient_reimbursement_recorded(
        mock_db,
        tenant_id=tenant_id,
        patient_id=patient_id,
        claim_id=claim_id,
        claim_reference=claim_ref,
        amount="200.00",
        pending_amount="0.00",
        masked_ref="•••• •••• 5678",
        is_full=True,
    )
    assert n8["event_type"] == "full_reimbursement_recorded"
    assert "fully reimbursed" in n8["body"].lower()

    # 9. Policy Expiring
    n9 = await notify_patient_policy_expiring(
        mock_db,
        tenant_id=tenant_id,
        patient_id=patient_id,
        policy_id="pol-001",
        provider_name=provider,
        policy_number_masked="•••• •••• 9999",
        expiry_date="2026-12-31",
        days_remaining=15,
    )
    assert n9["event_type"] == "insurance_policy_expiring"
    assert "15 days" in n9["body"]
    assert "•••• •••• 9999" in n9["body"]


# ==============================================================================
# TEST 2: CLINIC ADMIN NOTIFICATION SCENARIOS (ALL 6)
# ==============================================================================

@pytest.mark.asyncio
async def test_all_6_clinic_admin_notification_scenarios(mock_db):
    tenant_id = "test-tenant"
    claim_id = "claim-200"
    claim_ref = "CLM-20261126-002"
    patient_name = "Jane Doe"
    provider = "HDFC ERGO"

    # 1. New claim received
    a1 = await notify_admin_new_claim_received(
        mock_db,
        tenant_id=tenant_id,
        claim_id=claim_id,
        claim_reference=claim_ref,
        patient_name=patient_name,
        appointment_display_id="APT-20261126-002",
        provider_name=provider,
    )
    assert a1["recipient_role"] == "clinic_admin"
    assert a1["event_type"] == "admin_new_claim_received"
    assert "Jane Doe" in a1["body"]

    # 2. Resubmitted claim
    a2 = await notify_admin_claim_resubmitted(
        mock_db,
        tenant_id=tenant_id,
        claim_id=claim_id,
        claim_reference=claim_ref,
        patient_name=patient_name,
    )
    assert a2["event_type"] == "admin_claim_resubmitted"

    # 3. Pending verification reminder
    a3 = await notify_admin_claim_pending_verification(
        mock_db,
        tenant_id=tenant_id,
        claim_id=claim_id,
        claim_reference=claim_ref,
        hours_pending=36,
    )
    assert a3["event_type"] == "admin_claim_pending_verification"
    assert "36 hours" in a3["body"]

    # 4. Verified claim pending submission
    a4 = await notify_admin_verified_claim_pending_submission(
        mock_db,
        tenant_id=tenant_id,
        claim_id=claim_id,
        claim_reference=claim_ref,
        provider_name=provider,
    )
    assert a4["event_type"] == "admin_verified_claim_pending_submission"
    assert "ready for transmission" in a4["body"].lower()

    # 5. Additional documents uploaded
    a5 = await notify_admin_additional_documents_uploaded(
        mock_db,
        tenant_id=tenant_id,
        claim_id=claim_id,
        claim_reference=claim_ref,
        patient_name=patient_name,
    )
    assert a5["event_type"] == "admin_additional_documents_uploaded"

    # 6. Approved awaiting reimbursement
    a6 = await notify_admin_approved_awaiting_reimbursement(
        mock_db,
        tenant_id=tenant_id,
        claim_id=claim_id,
        claim_reference=claim_ref,
        provider_name=provider,
        approved_amount="2500.00",
    )
    assert a6["event_type"] == "admin_approved_awaiting_reimbursement"
    assert "₹2500.00" in a6["body"]


# ==============================================================================
# TEST 3: DEDUPLICATION WINDOW ENFORCEMENT
# ==============================================================================

@pytest.mark.asyncio
async def test_notification_deduplication(mock_db):
    tenant_id = "test-tenant"
    patient_id = "pat-002"
    claim_id = "claim-300"
    claim_ref = "CLM-20261126-003"

    # First send succeeds
    first = await notify_patient_claim_submitted(
        mock_db,
        tenant_id=tenant_id,
        patient_id=patient_id,
        claim_id=claim_id,
        claim_reference=claim_ref,
        appointment_display_id="APT-003",
        provider_name="Max Bupa",
    )
    assert first["id"] is not None

    # Duplicate call within 60 min cooldown returns existing record without inserting duplicate
    dup = await notify_patient_claim_submitted(
        mock_db,
        tenant_id=tenant_id,
        patient_id=patient_id,
        claim_id=claim_id,
        claim_reference=claim_ref,
        appointment_display_id="APT-003",
        provider_name="Max Bupa",
    )
    assert dup["id"] == first["id"]

    # Verify only 1 document is present in database
    count = await mock_db["notifications"].count_documents({"claim_id": claim_id})
    assert count == 1


# ==============================================================================
# TEST 4: CONFIGURATION VIEW AND UPDATE
# ==============================================================================

@pytest.mark.asyncio
async def test_notification_config(mock_db, admin_principal):
    # Default config
    cfg = await get_clinic_notification_config(admin_principal)
    assert cfg["policy_expiry_reminder_days"] == 30
    assert cfg["pending_claim_reminder_hours"] == 24
    assert cfg["dedup_window_minutes"] == 60

    # Update config
    update_req = UpdateNotificationConfigRequest(
        policy_expiry_reminder_days=15,
        pending_claim_reminder_hours=12,
        dedup_window_minutes=30,
        email_enabled=True,
    )
    updated = await update_clinic_notification_config(update_req, admin_principal)
    assert updated["policy_expiry_reminder_days"] == 15
    assert updated["pending_claim_reminder_hours"] == 12
    assert updated["dedup_window_minutes"] == 30


# ==============================================================================
# TEST 5: BACKGROUND SCAN TRIDGERS
# ==============================================================================

@pytest.mark.asyncio
async def test_background_scanners(mock_db, admin_principal):
    tenant_id = admin_principal.tenant_id

    # Seed an expiring policy
    await mock_db["insurance_policies"].insert_one({
        "id": "pol-expiring-1",
        "tenant_id": tenant_id,
        "patient_id": "pat-005",
        "status": "Active",
        "provider_name": "Bajaj Allianz",
        "policy_number_masked": "•••• •••• 5555",
        "expiry_date": (datetime.now(UTC) + timedelta(days=10)).strftime("%Y-%m-%d"),
    })

    # Seed an overdue pending claim (created 48 hours ago)
    old_time = (datetime.now(UTC) - timedelta(hours=48)).isoformat()
    await mock_db["insurance_claims"].insert_one({
        "id": "claim-overdue-1",
        "tenant_id": tenant_id,
        "claim_reference": "CLM-OVERDUE-001",
        "status": "pending_document_verification",
        "created_at": old_time,
    })

    # Trigger scans
    policy_res = await trigger_expiring_policies_scan(admin_principal)
    assert policy_res["status"] == "completed"
    assert policy_res["reminders_dispatched"] >= 1

    claim_res = await trigger_pending_claims_scan(admin_principal)
    assert claim_res["status"] == "completed"
    assert claim_res["reminders_dispatched"] >= 1


# ==============================================================================
# TEST 6: ADMIN UNREAD COUNT, LIST & MARK AS READ
# ==============================================================================

@pytest.mark.asyncio
async def test_clinic_admin_unread_and_mark_read(mock_db, admin_principal):
    tenant_id = admin_principal.tenant_id

    # Create 2 admin notifications
    a1 = await notify_admin_new_claim_received(
        mock_db,
        tenant_id=tenant_id,
        claim_id="c-1",
        claim_reference="CLM-01",
        patient_name="Alex",
        appointment_display_id="APT-01",
        provider_name="Provider 1",
    )
    a2 = await notify_admin_claim_resubmitted(
        mock_db,
        tenant_id=tenant_id,
        claim_id="c-2",
        claim_reference="CLM-02",
        patient_name="Bob",
    )

    unread_res = await get_clinic_admin_unread_count(admin_principal)
    assert unread_res["unread_count"] == 2

    # Mark first notification as read
    res = await mark_clinic_admin_notification_read(a1["id"], admin_principal)
    assert res["status"] == "read"

    unread_res2 = await get_clinic_admin_unread_count(admin_principal)
    assert unread_res2["unread_count"] == 1

    # Mark all read
    all_res = await mark_all_clinic_admin_notifications_read(admin_principal)
    assert all_res["status"] == "read"
    assert all_res["updated_count"] >= 1

    unread_res3 = await get_clinic_admin_unread_count(admin_principal)
    assert unread_res3["unread_count"] == 0


# ==============================================================================
# TEST 7: PATIENT UNREAD COUNT & LIST
# ==============================================================================

@pytest.mark.asyncio
async def test_patient_unread_count_and_list(mock_db, patient_principal):
    tenant_id = patient_principal.tenant_id
    patient_id = patient_principal.user_id

    # Insert patient notification
    await notify_patient_claim_submitted(
        mock_db,
        tenant_id=tenant_id,
        patient_id=patient_id,
        claim_id="claim-pat-1",
        claim_reference="CLM-PAT-001",
        appointment_display_id="APT-PAT-01",
        provider_name="Provider Pat",
    )

    # Check unread count
    cnt = await get_patient_unread_count(patient_principal)
    assert cnt["unread_count"] >= 1

    # Mark all read
    await mark_all_read(patient_principal)
    cnt2 = await get_patient_unread_count(patient_principal)
    assert cnt2["unread_count"] == 0


# ==============================================================================
# TEST 8: PRIVACY GUARD
# ==============================================================================

@pytest.mark.asyncio
async def test_clinical_privacy_guard(mock_db):
    """Ensure no prescriptions, diagnoses, or clinical notes leak into notifications."""
    res = await notify_patient_claim_submitted(
        mock_db,
        tenant_id="test-tenant",
        patient_id="pat-privacy",
        claim_id="claim-priv-1",
        claim_reference="CLM-PRIV-001",
        appointment_display_id="APT-PRIV-001",
        provider_name="Star Health",
    )

    body = res["body"].lower()
    subject = res["subject"].lower()

    sensitive_terms = ["prescription", "amoxicillin", "diagnosis", "hypertension", "clinical note", "doctor summary"]
    for term in sensitive_terms:
        assert term not in body
        assert term not in subject


# ==============================================================================
# TEST 9: BREVO EMAIL SANDBOX & RETRY
# ==============================================================================

@pytest.mark.asyncio
async def test_brevo_email_safe_delivery_and_retry(mock_db, admin_principal):
    # In test/dev environment, deliver_brevo_email_safe returns 'sandboxed'
    status, err = await deliver_brevo_email_safe("test@example.com", "Test Subject", "Test Body")
    assert status == "sandboxed"
    assert err is None

    # Test retry endpoint on an existing notification
    notif_doc = {
        "id": "notif-retry-test",
        "tenant_id": admin_principal.tenant_id,
        "recipient_role": "clinic_admin",
        "recipient_email": "admin@clinic.com",
        "subject": "Admin Alert",
        "body": "Alert body",
        "email_delivery_status": "failed",
        "email_retries": 1,
        "read": False,
        "created_at": datetime.now(UTC).isoformat(),
    }
    await mock_db["notifications"].insert_one(notif_doc)

    retry_res = await retry_clinic_admin_notification_email("notif-retry-test", admin_principal)
    assert retry_res["status"] == "sandboxed"
    assert retry_res["retries"] == 2
