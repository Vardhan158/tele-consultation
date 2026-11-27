"""FastAPI routes for Insurance Management:
- Clinic Admin: Insurance Provider Master (Checkpoint 1)
- Patient Portal: My Insurance Policies & Active Providers (Checkpoint 2)
- Patient Portal: Policy Registration & Secure Document Upload (Checkpoint 3)
"""
from datetime import UTC, datetime
import math
from pathlib import Path
import re
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse, Response

from teleconsult.config.settings import get_settings
from teleconsult.kernel.authz.mongodb_policy import MongoPrincipal, require_permission
from teleconsult.kernel.authz.policy import Principal, require
from teleconsult.kernel.mongodb.client import mongo_database
from teleconsult.modules.identity.auth_routes import token_hash
from teleconsult.modules.insurance.schemas import (
    ActiveInsuranceProviderResponse,
    ClaimAuthorizedDocItem,
    ClaimConsentGrantRequest,
    ClaimConsentResponse,
    ClaimConsentWithdrawResponse,
    ClaimDocumentItem,
    ClaimDocumentPackageProviderInfo,
    ClaimDocumentPackageResponse,
    ClaimDocumentVerificationItem,
    ClaimDossierResponse,
    ClaimEligibilityResponse,
    ClaimInitiateRequest,
    ClaimInitiateResponse,
    ClaimPrerequisiteItem,
    ClaimSubmissionRequest,
    ClaimSubmissionResult,
    ClaimTimelineEntry,
    ClinicAdminClaimListItem,
    ClinicAdminClaimListResponse,
    ClinicAdminClaimStats,
    ClinicAdminClaimVerifyRequest,
    ClinicAdminClaimVerifyResponse,
    ConsentDocumentSection,
    ConsentReviewDocumentResponse,
    InsuranceClaimDetailResponse,
    InsuranceClaimItemResponse,
    InsuranceDocumentResponse,
    InsurancePolicyCreate,
    InsurancePolicyUpdate,
    InsuranceProviderCreate,
    InsuranceProviderListResponse,
    InsuranceProviderStatusUpdate,
    InsuranceProviderUpdate,
    InsurerStatusUpdateRequest,
    InsurerStatusUpdateResponse,
    PatientClaimResubmitRequest,
    PatientClaimResubmitResponse,
    PatientInsurancePolicyResponse,
    PatientSubmitAdditionalDocsRequest,
    PatientSubmitAdditionalDocsResponse,
    PreflightCheckItem,
    PreflightClaimValidationRequest,
    PreflightClaimValidationResponse,
    ClaimReimbursementSummaryResponse,
    RecordReimbursementRequest,
    RecordReimbursementResponse,
    ReimbursementEvidenceUploadResponse,
    ReimbursementTransactionItem,
    SubmitToInsurerRequest,
    SubmitToInsurerResponse,
    SupportingDocumentUploadResponse,
)
from teleconsult.modules.notifications.insurance_notifications import (
    notify_admin_additional_documents_uploaded,
    notify_admin_approved_awaiting_reimbursement,
    notify_admin_claim_resubmitted,
    notify_admin_new_claim_received,
    notify_admin_verified_claim_pending_submission,
    notify_patient_additional_documents_requested,
    notify_patient_claim_adjudicated,
    notify_patient_claim_correction_required,
    notify_patient_claim_submitted,
    notify_patient_claim_submitted_to_insurer,
    notify_patient_claim_verified,
    notify_patient_reimbursement_recorded,
    send_insurance_notification,
)

router = APIRouter(tags=["insurance"])

PRIVATE_INSURANCE_DIR = Path(__file__).resolve().parents[4] / "private_storage" / "insurance_documents"
ALLOWED_FILE_TYPES = {"application/pdf", "image/jpeg", "image/png", "image/jpg"}
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10 MB limit


def _ensure_storage_dir() -> Path:
    PRIVATE_INSURANCE_DIR.mkdir(parents=True, exist_ok=True)
    return PRIVATE_INSURANCE_DIR


async def clinic_admin_dep(request: Request) -> MongoPrincipal:
    settings = get_settings()
    if not settings.mongodb_enabled or not mongo_database.enabled:
        raise HTTPException(503, "MongoDB clinic administration is not enabled")
    raw = request.cookies.get("teleconsult_session")
    db = mongo_database.database()

    if raw:
        session = await db["user_sessions"].find_one({
            "tenant_id": settings.default_tenant_id,
            "token_hash": token_hash(raw),
            "revoked_at": {"$exists": False},
            "expires_at": {"$gt": datetime.now(UTC)},
        })
        user = await db["users"].find_one({"tenant_id": settings.default_tenant_id, "id": session["user_id"]}) if session else None
        if user and user.get("role") == "clinic_admin":
            return MongoPrincipal(
                user_id=user["id"],
                tenant_id=user["tenant_id"],
                role=user["role"],
                clinic_id=user.get("clinic_id"),
            )

    # Local / dev test fallback fixture support
    if settings.environment in {"dev", "local"}:
        dev_role = request.headers.get("X-Dev-Role") or "clinic_admin"
        if dev_role == "clinic_admin":
            dev_user_id = request.headers.get("X-Dev-User-Id") or "admin-user"
            dev_tenant_id = request.headers.get("X-Dev-Tenant-Id") or settings.default_tenant_id
            return MongoPrincipal(
                user_id=dev_user_id,
                tenant_id=dev_tenant_id,
                role="clinic_admin",
                clinic_id=request.headers.get("X-Dev-Clinic-Id"),
            )

    raise HTTPException(401, "Authentication required as Clinic Administrator")


clinic_admin_dep._is_authz = True  # Satisfies architecture authorization guard


def _scope(principal: MongoPrincipal) -> dict[str, Any]:
    scope: dict[str, Any] = {"tenant_id": principal.tenant_id}
    if principal.clinic_id:
        scope["clinic_id"] = principal.clinic_id
    return scope


def _clean(document: dict[str, Any]) -> dict[str, Any]:
    document.pop("_id", None)
    for key, value in list(document.items()):
        if hasattr(value, "isoformat"):
            document[key] = value.isoformat()
    return document


def mask_policy_number(raw_number: str) -> str:
    """Mask insurance policy numbers, keeping only the final 4 characters."""
    if not raw_number:
        return "•••• •••• ••••"
    clean = str(raw_number).strip()
    if len(clean) <= 4:
        return f"•••• {clean}"
    last4 = clean[-4:]
    return f"•••• •••• {last4}"


def _determine_policy_status(start_date: str, expiry_date: str, manual_status: str | None = None) -> str:
    if manual_status == "Inactive":
        return "Inactive"
    today_str = datetime.now(UTC).strftime("%Y-%m-%d")
    if expiry_date < today_str:
        return "Expired"
    return "Active"


async def _resolve_patient_ids(db: Any, tenant_id: str, user_id: str) -> list[str]:
    """Resolve patient ID variants (user ID vs patient record ID) for reliable ownership queries."""
    patient_ids = [str(user_id)]
    patient_doc = await db["patients"].find_one({
        "tenant_id": str(tenant_id),
        "$or": [
            {"id": str(user_id)},
            {"user_id": str(user_id)},
            {"user_account_id": str(user_id)},
        ],
    })
    if patient_doc:
        for k in ("id", "user_id", "user_account_id"):
            val = patient_doc.get(k)
            if val and str(val) not in patient_ids:
                patient_ids.append(str(val))
    return patient_ids


async def _save_insurance_document(
    db: Any,
    file: UploadFile,
    doc_type: str,
    tenant_id: str,
    patient_id: str,
    user_id: str,
    policy_id: str | None = None,
    appointment_id: str | None = None,
    title: str | None = None,
) -> dict[str, Any]:
    """Validate and store an insurance card, policy document, or supporting document in secure private storage."""
    data = await file.read()
    if len(data) > MAX_FILE_BYTES:
        raise HTTPException(413, f"File '{file.filename}' exceeds the maximum allowed size of 10 MB")

    content_type = (file.content_type or "application/octet-stream").lower()
    if content_type == "image/jpg":
        content_type = "image/jpeg"
    if content_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(400, f"Unsupported file type '{content_type}'. Only PDF, JPG, and PNG are allowed.")

    storage_dir = _ensure_storage_dir()
    doc_id = str(uuid4())
    ext = Path(file.filename or "doc").suffix.lower()
    if not ext:
        ext = ".pdf" if content_type == "application/pdf" else ".png"

    safe_storage_key = f"{tenant_id}_{patient_id}_{doc_id}{ext}"
    target_path = (storage_dir / safe_storage_key).resolve()

    # Avoid path traversal
    if storage_dir.resolve() not in target_path.parents:
        raise HTTPException(400, "Invalid file storage path")

    try:
        target_path.write_bytes(data)
    except Exception as e:
        raise HTTPException(500, f"Failed to save document to storage: {str(e)}")

    now = datetime.now(UTC).isoformat()
    doc_record = {
        "id": doc_id,
        "tenant_id": str(tenant_id),
        "patient_id": str(patient_id),
        "user_id": str(user_id),
        "policy_id": str(policy_id) if policy_id else None,
        "appointment_id": str(appointment_id) if appointment_id else None,
        "title": str(title) if title else None,
        "document_type": doc_type,
        "file_name": file.filename or f"{doc_type}{ext}",
        "content_type": content_type,
        "size_bytes": len(data),
        "storage_key": safe_storage_key,
        "created_at": now,
    }
    await db["insurance_documents"].insert_one(doc_record)
    return _clean(doc_record)


async def _enrich_policy_with_documents(db: Any, policy_doc: dict[str, Any]) -> dict[str, Any]:
    """Attach card_document and policy_document details if linked."""
    card_id = policy_doc.get("card_document_id")
    pol_doc_id = policy_doc.get("policy_document_id")

    policy_doc["card_document"] = None
    policy_doc["policy_document"] = None

    if card_id:
        card_doc = await db["insurance_documents"].find_one({"id": card_id})
        if card_doc:
            policy_doc["card_document"] = {
                "id": card_doc["id"],
                "file_name": card_doc["file_name"],
                "content_type": card_doc["content_type"],
                "size_bytes": card_doc["size_bytes"],
                "document_type": card_doc["document_type"],
                "created_at": card_doc["created_at"],
            }

    if pol_doc_id:
        p_doc = await db["insurance_documents"].find_one({"id": pol_doc_id})
        if p_doc:
            policy_doc["policy_document"] = {
                "id": p_doc["id"],
                "file_name": p_doc["file_name"],
                "content_type": p_doc["content_type"],
                "size_bytes": p_doc["size_bytes"],
                "document_type": p_doc["document_type"],
                "created_at": p_doc["created_at"],
            }

    return policy_doc


# ==============================================================================
# CLINIC ADMIN: INSURANCE PROVIDER MASTER (CHECKPOINT 1)
# ==============================================================================

@router.get("/clinic-admin/insurance/providers", response_model=InsuranceProviderListResponse)
async def list_insurance_providers(
    search: str | None = None,
    status: str | None = None,
    provider_type: str | None = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Search, filter, and paginate insurance providers scoped to the clinic tenant."""
    require_permission(principal, "clinic:insurance:read")
    db = mongo_database.database()
    scope = _scope(principal)

    query: dict[str, Any] = {**scope}

    if status and status.strip().lower() != "all":
        query["status"] = status.strip()

    if provider_type and provider_type.strip().lower() != "all":
        query["provider_type"] = provider_type.strip()

    if search and search.strip():
        term = re.escape(search.strip())
        regex_filter = {"$regex": term, "$options": "i"}
        query["$or"] = [
            {"provider_name": regex_filter},
            {"provider_code": regex_filter},
            {"contact_person": regex_filter},
            {"contact_email": regex_filter},
        ]

    total = await db["insurance_providers"].count_documents(query)
    p_num = int(page if isinstance(page, int) else (getattr(page, "default", 1) or 1))
    l_num = int(limit if isinstance(limit, int) else (getattr(limit, "default", 10) or 10))
    total_pages = math.ceil(total / l_num) if total > 0 else 1
    skip = (p_num - 1) * l_num

    cursor = db["insurance_providers"].find(query).sort("created_at", -1).skip(skip).limit(l_num)
    items = [_clean(doc) async for doc in cursor]

    # Global clinic stats for metrics dashboard cards
    total_all = await db["insurance_providers"].count_documents(scope)
    active_count = await db["insurance_providers"].count_documents({**scope, "status": "Active"})
    inactive_count = await db["insurance_providers"].count_documents({**scope, "status": "Inactive"})
    ins_co_count = await db["insurance_providers"].count_documents({**scope, "provider_type": "Insurance Company"})
    tpa_count = await db["insurance_providers"].count_documents({**scope, "provider_type": "TPA"})

    return {
        "items": items,
        "total": total,
        "page": p_num,
        "limit": l_num,
        "total_pages": total_pages,
        "stats": {
            "total": total_all,
            "active": active_count,
            "inactive": inactive_count,
            "insurance_company": ins_co_count,
            "tpa": tpa_count,
        },
    }


@router.post("/clinic-admin/insurance/providers", status_code=201)
async def create_insurance_provider(
    payload: InsuranceProviderCreate,
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Create a new insurance provider with duplicate code prevention and audit logging."""
    require_permission(principal, "clinic:insurance:write")
    db = mongo_database.database()
    scope = _scope(principal)

    code = payload.provider_code.strip().upper()

    # Prevent duplicate provider records in the same tenant
    existing = await db["insurance_providers"].find_one({
        "tenant_id": principal.tenant_id,
        "provider_code": {"$regex": f"^{re.escape(code)}$", "$options": "i"},
    })
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"An insurance provider with code '{code}' already exists.",
        )

    now = datetime.now(UTC).isoformat()
    provider_id = str(uuid4())

    doc: dict[str, Any] = {
        "id": provider_id,
        "tenant_id": principal.tenant_id,
        "clinic_id": principal.clinic_id,
        "provider_name": payload.provider_name.strip(),
        "provider_code": code,
        "country": payload.country.strip(),
        "provider_type": payload.provider_type,
        "contact_person": payload.contact_person,
        "contact_email": payload.contact_email,
        "contact_number": payload.contact_number,
        "official_website": payload.official_website,
        "claim_submission_email": payload.claim_submission_email,
        "claim_submission_portal_url": payload.claim_submission_portal_url,
        "status": payload.status,
        "created_by": principal.user_id,
        "created_at": now,
        "updated_at": now,
    }

    await db["insurance_providers"].insert_one(doc)

    # Audit log
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "insurance_provider.created",
        "target_id": provider_id,
        "metadata": {
            "provider_name": doc["provider_name"],
            "provider_code": doc["provider_code"],
            "provider_type": doc["provider_type"],
            "status": doc["status"],
        },
        "created_at": now,
    })

    return _clean(doc)


@router.get("/clinic-admin/insurance/providers/{provider_id}")
async def get_insurance_provider(
    provider_id: str,
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Retrieve full details of an insurance provider."""
    require_permission(principal, "clinic:insurance:read")
    db = mongo_database.database()
    scope = _scope(principal)

    doc = await db["insurance_providers"].find_one({**scope, "id": provider_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Insurance provider not found")

    return _clean(doc)


@router.put("/clinic-admin/insurance/providers/{provider_id}")
async def update_insurance_provider(
    provider_id: str,
    payload: InsuranceProviderUpdate,
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Update insurance provider details with uniqueness validation and audit logging."""
    require_permission(principal, "clinic:insurance:write")
    db = mongo_database.database()
    scope = _scope(principal)

    existing = await db["insurance_providers"].find_one({**scope, "id": provider_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Insurance provider not found")

    # If code changed, check uniqueness
    if payload.provider_code is not None:
        new_code = payload.provider_code.strip().upper()
        if new_code != existing.get("provider_code"):
            dup = await db["insurance_providers"].find_one({
                "tenant_id": principal.tenant_id,
                "provider_code": {"$regex": f"^{re.escape(new_code)}$", "$options": "i"},
                "id": {"$ne": provider_id},
            })
            if dup:
                raise HTTPException(
                    status_code=409,
                    detail=f"An insurance provider with code '{new_code}' already exists.",
                )

    raw_updates = payload.model_dump(exclude_unset=True)
    if not raw_updates:
        return _clean(existing)

    now = datetime.now(UTC).isoformat()
    updates: dict[str, Any] = {"updated_at": now}

    for k, v in raw_updates.items():
        if k == "provider_code" and v is not None:
            updates[k] = v.strip().upper()
        elif isinstance(v, str):
            updates[k] = v.strip()
        else:
            updates[k] = v

    await db["insurance_providers"].update_one(
        {**scope, "id": provider_id},
        {"$set": updates},
    )

    # Audit log
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "insurance_provider.updated",
        "target_id": provider_id,
        "metadata": {
            "provider_code": updates.get("provider_code", existing.get("provider_code")),
            "changes": {k: v for k, v in updates.items() if k != "updated_at"},
        },
        "created_at": now,
    })

    updated_doc = await db["insurance_providers"].find_one({**scope, "id": provider_id})
    return _clean(updated_doc)


@router.patch("/clinic-admin/insurance/providers/{provider_id}/status")
async def toggle_insurance_provider_status(
    provider_id: str,
    payload: InsuranceProviderStatusUpdate,
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Activate or deactivate an insurance provider with audit logging."""
    require_permission(principal, "clinic:insurance:write")
    db = mongo_database.database()
    scope = _scope(principal)

    existing = await db["insurance_providers"].find_one({**scope, "id": provider_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Insurance provider not found")

    now = datetime.now(UTC).isoformat()
    await db["insurance_providers"].update_one(
        {**scope, "id": provider_id},
        {"$set": {"status": payload.status, "updated_at": now}},
    )

    # Audit log
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "insurance_provider.status_changed",
        "target_id": provider_id,
        "metadata": {
            "previous_status": existing.get("status"),
            "new_status": payload.status,
            "provider_code": existing.get("provider_code"),
            "provider_name": existing.get("provider_name"),
        },
        "created_at": now,
    })

    updated_doc = await db["insurance_providers"].find_one({**scope, "id": provider_id})
    return _clean(updated_doc)


# ==============================================================================
# PATIENT PORTAL: MY INSURANCE (CHECKPOINT 2 & CHECKPOINT 3)
# ==============================================================================

@router.get("/patient/insurance/policies", response_model=list[PatientInsurancePolicyResponse])
async def list_patient_insurance_policies(
    principal: Principal = Depends(require("insurance:read")),
) -> list[dict[str, Any]]:
    """Retrieve authenticated patient's insurance policies with masked policy numbers and documents."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)
    today_str = datetime.now(UTC).strftime("%Y-%m-%d")

    query = {
        "tenant_id": principal.tenant_id,
        "$or": [
            {"patient_id": {"$in": patient_ids}},
            {"user_id": principal.user_id},
        ],
    }

    # Query both insurance_policies and legacy patient_insurance_policies
    results: list[dict[str, Any]] = []
    seen_ids = set()

    for col_name in ("insurance_policies", "patient_insurance_policies"):
        try:
            cursor = db[col_name].find(query).sort("created_at", -1)
            async for doc in cursor:
                if doc["id"] in seen_ids:
                    continue
                seen_ids.add(doc["id"])
                clean_doc = _clean(doc)
                raw_num = clean_doc.pop("policy_number", "")
                if not clean_doc.get("policy_number_masked"):
                    clean_doc["policy_number_masked"] = mask_policy_number(raw_num)

                # Automatic Expiration detection
                exp_date = clean_doc.get("expiry_date")
                if exp_date and exp_date < today_str and clean_doc.get("status") == "Active":
                    clean_doc["status"] = "Expired"
                    try:
                        await db[col_name].update_one({"id": clean_doc["id"]}, {"$set": {"status": "Expired"}})
                    except Exception:
                        pass

                clean_doc = await _enrich_policy_with_documents(db, clean_doc)
                results.append(clean_doc)
        except Exception:
            continue

    return results


@router.get("/patient/insurance/policies/{policy_id}", response_model=PatientInsurancePolicyResponse)
async def get_patient_insurance_policy(
    policy_id: str,
    principal: Principal = Depends(require("insurance:read")),
) -> dict[str, Any]:
    """Retrieve full details of a specific policy belonging to the patient."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    query = {
        "id": policy_id,
        "tenant_id": principal.tenant_id,
        "$or": [
            {"patient_id": {"$in": patient_ids}},
            {"user_id": principal.user_id},
        ],
    }

    doc = await db["insurance_policies"].find_one(query)
    if not doc:
        try:
            doc = await db["patient_insurance_policies"].find_one(query)
        except Exception:
            doc = None

    if not doc:
        raise HTTPException(status_code=404, detail="Insurance policy not found")

    clean_doc = _clean(doc)
    raw_num = clean_doc.pop("policy_number", "")
    if not clean_doc.get("policy_number_masked"):
        clean_doc["policy_number_masked"] = mask_policy_number(raw_num)

    today_str = datetime.now(UTC).strftime("%Y-%m-%d")
    if clean_doc.get("expiry_date") and clean_doc["expiry_date"] < today_str and clean_doc.get("status") == "Active":
        clean_doc["status"] = "Expired"

    clean_doc = await _enrich_policy_with_documents(db, clean_doc)
    return clean_doc


@router.post("/patient/insurance/policies", status_code=201, response_model=PatientInsurancePolicyResponse)
async def register_patient_insurance_policy(
    provider_id: str = Form(...),
    policy_number: str = Form(...),
    member_id: str | None = Form(None),
    policy_holder_name: str = Form(...),
    relationship: str = Form("Self"),
    insurance_type: str = Form("Individual"),
    start_date: str = Form(...),
    expiry_date: str = Form(...),
    insurance_card: UploadFile | None = File(None),
    policy_document: UploadFile | None = File(None),
    principal: Principal = Depends(require("insurance:write")),
) -> dict[str, Any]:
    """Register a new patient health insurance policy with optional secure card and document uploads."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    # 1. Date format and sanity validation
    date_regex = r"^\d{4}-\d{2}-\d{2}$"
    s_date = start_date.strip()
    e_date = expiry_date.strip()
    if not re.match(date_regex, s_date) or not re.match(date_regex, e_date):
        raise HTTPException(status_code=422, detail="Start and expiry dates must follow YYYY-MM-DD format")
    if e_date < s_date:
        raise HTTPException(status_code=422, detail="Policy expiry date cannot be earlier than start date")

    # 2. Provider validation against active Master
    provider = await db["insurance_providers"].find_one({
        "tenant_id": principal.tenant_id,
        "id": provider_id.strip(),
        "status": "Active",
    })
    if not provider:
        raise HTTPException(status_code=400, detail="Selected insurance provider is invalid or inactive")

    # 3. Duplicate policy check per patient
    clean_policy_num = policy_number.strip()
    existing_dup = await db["insurance_policies"].find_one({
        "tenant_id": principal.tenant_id,
        "$or": [
            {"patient_id": {"$in": patient_ids}},
            {"user_id": principal.user_id},
        ],
        "provider_id": provider["id"],
        "policy_number": {"$regex": f"^{re.escape(clean_policy_num)}$", "$options": "i"},
        "status": {"$ne": "Inactive"},
    })
    if existing_dup:
        raise HTTPException(
            status_code=409,
            detail=f"An active policy with number '{clean_policy_num}' is already registered with {provider['provider_name']}.",
        )

    # 4. Automatic expiration check
    initial_status = _determine_policy_status(s_date, e_date)
    policy_id = str(uuid4())
    now = datetime.now(UTC).isoformat()

    # 5. Handle Document Uploads
    card_doc_id = None
    if insurance_card and getattr(insurance_card, "filename", None):
        card_res = await _save_insurance_document(
            db=db,
            file=insurance_card,
            doc_type="insurance_card",
            tenant_id=principal.tenant_id,
            patient_id=principal.user_id,
            user_id=principal.user_id,
            policy_id=policy_id,
        )
        card_doc_id = card_res["id"]

    policy_doc_id = None
    if policy_document and getattr(policy_document, "filename", None):
        pdoc_res = await _save_insurance_document(
            db=db,
            file=policy_document,
            doc_type="policy_document",
            tenant_id=principal.tenant_id,
            patient_id=principal.user_id,
            user_id=principal.user_id,
            policy_id=policy_id,
        )
        policy_doc_id = pdoc_res["id"]

    # 6. Insert Policy Record
    clean_member_id = member_id.strip() if isinstance(member_id, str) and member_id.strip() else None
    policy_doc = {
        "id": policy_id,
        "tenant_id": principal.tenant_id,
        "patient_id": principal.user_id,
        "user_id": principal.user_id,
        "provider_id": provider["id"],
        "provider_name": provider["provider_name"],
        "provider_code": provider["provider_code"],
        "policy_number": clean_policy_num,
        "policy_number_masked": mask_policy_number(clean_policy_num),
        "member_id": clean_member_id,
        "policy_holder_name": policy_holder_name.strip() if isinstance(policy_holder_name, str) else str(policy_holder_name),
        "relationship": relationship.strip() if isinstance(relationship, str) else "Self",
        "insurance_type": insurance_type.strip() if isinstance(insurance_type, str) else "Individual",
        "start_date": s_date,
        "expiry_date": e_date,
        "status": initial_status,
        "card_document_id": card_doc_id,
        "policy_document_id": policy_doc_id,
        "created_at": now,
        "updated_at": now,
    }
    await db["insurance_policies"].insert_one(policy_doc)

    # 7. Audit Log
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "insurance_policy.registered",
        "target_id": policy_id,
        "metadata": {
            "provider_code": provider["provider_code"],
            "policy_masked": mask_policy_number(clean_policy_num),
            "status": initial_status,
        },
        "created_at": now,
    })

    return_doc = _clean(policy_doc)
    return_doc.pop("policy_number", None)
    return await _enrich_policy_with_documents(db, return_doc)


@router.put("/patient/insurance/policies/{policy_id}", response_model=PatientInsurancePolicyResponse)
async def update_patient_insurance_policy(
    policy_id: str,
    policy_holder_name: str | None = Form(None),
    relationship: str | None = Form(None),
    insurance_type: str | None = Form(None),
    member_id: str | None = Form(None),
    start_date: str | None = Form(None),
    expiry_date: str | None = Form(None),
    insurance_card: UploadFile | None = File(None),
    policy_document: UploadFile | None = File(None),
    principal: Principal = Depends(require("insurance:write")),
) -> dict[str, Any]:
    """Edit patient insurance policy details or update attached documents."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    query = {
        "id": policy_id,
        "tenant_id": principal.tenant_id,
        "$or": [
            {"patient_id": {"$in": patient_ids}},
            {"user_id": principal.user_id},
        ],
    }

    existing = await db["insurance_policies"].find_one(query)
    if not existing:
        raise HTTPException(status_code=404, detail="Insurance policy not found")

    now = datetime.now(UTC).isoformat()
    updates: dict[str, Any] = {"updated_at": now}

    if policy_holder_name is not None and policy_holder_name.strip():
        updates["policy_holder_name"] = policy_holder_name.strip()
    if relationship is not None and relationship.strip():
        updates["relationship"] = relationship.strip()
    if insurance_type is not None and insurance_type.strip():
        updates["insurance_type"] = insurance_type.strip()
    if member_id is not None:
        updates["member_id"] = member_id.strip() if member_id.strip() else None

    s_date = start_date.strip() if start_date and start_date.strip() else existing.get("start_date")
    e_date = expiry_date.strip() if expiry_date and expiry_date.strip() else existing.get("expiry_date")

    if s_date and e_date:
        if e_date < s_date:
            raise HTTPException(status_code=422, detail="Policy expiry date cannot be earlier than start date")
        updates["start_date"] = s_date
        updates["expiry_date"] = e_date
        updates["status"] = _determine_policy_status(s_date, e_date, existing.get("status"))

    # Document updates
    if insurance_card and insurance_card.filename:
        card_res = await _save_insurance_document(
            db=db,
            file=insurance_card,
            doc_type="insurance_card",
            tenant_id=principal.tenant_id,
            patient_id=principal.user_id,
            user_id=principal.user_id,
            policy_id=policy_id,
        )
        updates["card_document_id"] = card_res["id"]

    if policy_document and policy_document.filename:
        pdoc_res = await _save_insurance_document(
            db=db,
            file=policy_document,
            doc_type="policy_document",
            tenant_id=principal.tenant_id,
            patient_id=principal.user_id,
            user_id=principal.user_id,
            policy_id=policy_id,
        )
        updates["policy_document_id"] = pdoc_res["id"]

    await db["insurance_policies"].update_one({"id": policy_id}, {"$set": updates})

    # Audit log
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "insurance_policy.updated",
        "target_id": policy_id,
        "metadata": {
            "changes": {k: v for k, v in updates.items() if k != "updated_at"},
        },
        "created_at": now,
    })

    updated_doc = await db["insurance_policies"].find_one({"id": policy_id})
    clean_doc = _clean(updated_doc)
    clean_doc.pop("policy_number", None)
    return await _enrich_policy_with_documents(db, clean_doc)


@router.patch("/patient/insurance/policies/{policy_id}/status")
async def toggle_patient_insurance_policy_status(
    policy_id: str,
    payload: InsuranceProviderStatusUpdate,
    principal: Principal = Depends(require("insurance:write")),
) -> dict[str, Any]:
    """Deactivate or activate an insurance policy."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    query = {
        "id": policy_id,
        "tenant_id": principal.tenant_id,
        "$or": [
            {"patient_id": {"$in": patient_ids}},
            {"user_id": principal.user_id},
        ],
    }

    existing = await db["insurance_policies"].find_one(query)
    if not existing:
        raise HTTPException(status_code=404, detail="Insurance policy not found")

    new_status = payload.status
    # Check if activating an already expired policy
    if new_status == "Active":
        today_str = datetime.now(UTC).strftime("%Y-%m-%d")
        if existing.get("expiry_date") and existing["expiry_date"] < today_str:
            raise HTTPException(status_code=400, detail="Cannot activate an expired policy")

    now = datetime.now(UTC).isoformat()
    await db["insurance_policies"].update_one({"id": policy_id}, {"$set": {"status": new_status, "updated_at": now}})

    # Audit log
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "insurance_policy.status_changed",
        "target_id": policy_id,
        "metadata": {
            "previous_status": existing.get("status"),
            "new_status": new_status,
        },
        "created_at": now,
    })

    return {"id": policy_id, "status": new_status, "message": f"Policy {new_status.lower()} successfully"}


@router.get("/patient/insurance/documents/{document_id}/download")
async def download_insurance_document(
    document_id: str,
    principal: Principal = Depends(require("insurance:read")),
):
    """Download an uploaded insurance card or policy document securely."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    doc = await db["insurance_documents"].find_one({
        "id": document_id,
        "tenant_id": principal.tenant_id,
        "$or": [
            {"patient_id": {"$in": patient_ids}},
            {"user_id": principal.user_id},
        ],
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found or access denied")

    storage_dir = _ensure_storage_dir()
    file_path = (storage_dir / doc["storage_key"]).resolve()

    if storage_dir.resolve() not in file_path.parents or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Document file content unavailable")

    return FileResponse(
        path=file_path,
        media_type=doc["content_type"],
        filename=doc["file_name"],
        content_disposition_type="attachment",
    )


@router.get("/patient/insurance/documents/{document_id}/preview")
async def preview_insurance_document(
    document_id: str,
    principal: Principal = Depends(require("insurance:read")),
):
    """Inline preview of an uploaded insurance card or policy document."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    doc = await db["insurance_documents"].find_one({
        "id": document_id,
        "tenant_id": principal.tenant_id,
        "$or": [
            {"patient_id": {"$in": patient_ids}},
            {"user_id": principal.user_id},
        ],
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found or access denied")

    storage_dir = _ensure_storage_dir()
    file_path = (storage_dir / doc["storage_key"]).resolve()

    if storage_dir.resolve() not in file_path.parents or not file_path.is_file():
        raise HTTPException(status_code=404, detail="Document file content unavailable")

    return FileResponse(
        path=file_path,
        media_type=doc["content_type"],
        filename=doc["file_name"],
        content_disposition_type="inline",
    )


@router.get("/patient/insurance/providers", response_model=list[ActiveInsuranceProviderResponse])
async def list_active_insurance_providers(
    principal: Principal = Depends(require("insurance:read")),
) -> list[dict[str, Any]]:
    """Retrieve active recognized insurance providers from Insurance Provider Master."""
    db = mongo_database.database()
    query = {
        "tenant_id": principal.tenant_id,
        "status": "Active",
    }
    cursor = db["insurance_providers"].find(query).sort("provider_name", 1)
    return [_clean(doc) async for doc in cursor]


# ==============================================================================
# CHECKPOINT 4: POST-CONSULTATION INSURANCE CLAIM ELIGIBILITY & INITIATION
# ==============================================================================

async def _fetch_claim_appointment_context(
    db: Any,
    tenant_id: str,
    appointment_id: str,
    patient_ids: list[str],
    user_id: str,
) -> dict[str, Any]:
    """Retrieve and validate appointment, doctor, payment, clinical summary, and prescription details."""
    apt = await db["appointments"].find_one({
        "tenant_id": tenant_id,
        "id": appointment_id,
        "$or": [
            {"patient_id": {"$in": patient_ids}},
            {"user_id": user_id},
        ],
    })
    if not apt:
        raise HTTPException(status_code=404, detail="Appointment not found or unauthorized")

    # Doctor resolution
    doctor_name = "Treating Clinician"
    specialty = "General Medicine"
    if isinstance(apt.get("doctor"), dict):
        doctor_name = apt["doctor"].get("name") or apt["doctor"].get("full_name") or doctor_name
        specialty = apt["doctor"].get("specialty") or specialty
    elif apt.get("doctor_name"):
        doctor_name = str(apt["doctor_name"])
        specialty = str(apt.get("specialty") or specialty)
    elif apt.get("doctor_id"):
        doc_record = await db["doctors"].find_one({"tenant_id": tenant_id, "id": apt["doctor_id"]})
        if not doc_record:
            doc_record = await db["users"].find_one({"tenant_id": tenant_id, "id": apt["doctor_id"]})
        if doc_record:
            doctor_name = doc_record.get("full_name") or doc_record.get("name") or doctor_name
            specialty = doc_record.get("specialty") or specialty

    # Payment lookup
    payment_doc = await db["payments"].find_one({
        "tenant_id": tenant_id,
        "appointment_id": appointment_id,
    })
    apt_payment_status = str(apt.get("payment_status", "")).lower()
    is_payment_captured = apt_payment_status in {"captured", "success", "paid"} or (
        payment_doc is not None and str(payment_doc.get("status", "")).lower() in {"captured", "success"}
    )
    rzp_id = (
        apt.get("razorpay_payment_id")
        or (payment_doc.get("provider_transaction_id") if payment_doc else None)
        or (payment_doc.get("id") if payment_doc else None)
    )

    fee_paise = (
        apt.get("total_payable_paise")
        or apt.get("fee_paise")
        or (payment_doc.get("amount_paise") if payment_doc else None)
        or (payment_doc.get("amount") if payment_doc else None)
        or 50000
    )
    currency = apt.get("currency") or "INR"
    curr_sym = "₹" if currency.upper() in {"INR", ""} else f"{currency} "
    fee_formatted = f"{curr_sym}{(fee_paise / 100):.2f}"

    # Appointment Completion
    apt_status = str(apt.get("status", "")).lower()
    is_completed = apt_status in {"completed", "ended"}

    # Consultation Summary lookup
    summary = await db["consultation_summaries"].find_one({
        "tenant_id": tenant_id,
        "appointment_id": appointment_id,
    })
    if not summary:
        summary = await db["clinical_notes"].find_one({
            "tenant_id": tenant_id,
            "$or": [{"appointment_id": appointment_id}, {"consultation_id": appointment_id}],
        })
    summary_finalized = summary is not None and str(summary.get("status", "")).lower() in {"released", "finalized"}
    summary_id = str(summary.get("id")) if summary else None

    # Prescription lookup (optional, if issued it must be released)
    prescription = await db["prescriptions"].find_one({
        "tenant_id": tenant_id,
        "appointment_id": appointment_id,
    })
    has_prescription = prescription is not None
    prescription_status = prescription.get("status") if prescription else None
    prescription_id = str(prescription.get("id")) if prescription else None
    prescription_verified = not has_prescription or str(prescription_status).lower() in {"released", "finalized"}

    # Existing active claim lookup
    existing_claim = await db["insurance_claims"].find_one({
        "tenant_id": tenant_id,
        "appointment_id": appointment_id,
        "status": {"$nin": ["cancelled", "rejected", "withdrawn"]},
    })
    has_active_claim = existing_claim is not None
    existing_claim_id = str(existing_claim.get("id")) if existing_claim else None
    existing_claim_status = existing_claim.get("status") if existing_claim else None

    # Date formatting
    raw_start = apt.get("starts_at") or apt.get("date") or apt.get("created_at") or datetime.now(UTC).isoformat()
    raw_id = str(apt.get("id", ""))
    display_id = raw_id if raw_id.startswith("KC-APT-") else f"KC-APT-{raw_id[-6:].upper()}"

    return {
        "appointment": apt,
        "display_id": display_id,
        "doctor_name": doctor_name,
        "specialty": specialty,
        "appointment_date": str(raw_start),
        "appointment_status": apt.get("status", "pending"),
        "is_completed": is_completed,
        "fee_paise": fee_paise,
        "currency": currency,
        "consultation_fee": fee_formatted,
        "payment_status": apt.get("payment_status") or (payment_doc.get("status") if payment_doc else "pending"),
        "payment_verified": is_payment_captured,
        "razorpay_payment_id": rzp_id,
        "summary_id": summary_id,
        "summary_finalized": summary_finalized,
        "has_prescription": has_prescription,
        "prescription_id": prescription_id,
        "prescription_status": prescription_status,
        "prescription_verified": prescription_verified,
        "has_active_claim": has_active_claim,
        "existing_claim_id": existing_claim_id,
        "existing_claim_status": existing_claim_status,
    }


@router.get("/patient/insurance/appointments/{appointment_id}/claim-eligibility", response_model=ClaimEligibilityResponse)
async def check_appointment_claim_eligibility(
    appointment_id: str,
    principal: Principal = Depends(require("insurance:read")),
) -> dict[str, Any]:
    """Evaluate server-side post-consultation claim prerequisites for a completed appointment."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    ctx = await _fetch_claim_appointment_context(
        db=db,
        tenant_id=principal.tenant_id,
        appointment_id=appointment_id,
        patient_ids=patient_ids,
        user_id=principal.user_id,
    )

    # Compile 5 detailed prerequisites
    prerequisites = [
        ClaimPrerequisiteItem(
            key="payment",
            title="Razorpay Payment Verification",
            passed=ctx["payment_verified"],
            message="Payment successfully verified via Razorpay" if ctx["payment_verified"] else "Payment verification required; unverified or pending payment",
            details=f"Transaction ID: {ctx['razorpay_payment_id']}" if ctx["razorpay_payment_id"] else None,
        ),
        ClaimPrerequisiteItem(
            key="appointment_status",
            title="Consultation Completion",
            passed=ctx["is_completed"],
            message="Consultation marked Completed" if ctx["is_completed"] else f"Appointment status is currently '{ctx['appointment_status']}', must be 'Completed'",
            details=f"Status: {ctx['appointment_status']}",
        ),
        ClaimPrerequisiteItem(
            key="summary",
            title="Finalized Consultation Summary",
            passed=ctx["summary_finalized"],
            message="Consultation summary finalized & signed by doctor" if ctx["summary_finalized"] else "Doctor consultation summary has not been finalized yet",
            details=f"Summary ID: {ctx['summary_id']}" if ctx["summary_id"] else "Pending clinician sign-off",
        ),
        ClaimPrerequisiteItem(
            key="prescription",
            title="Prescription Availability",
            passed=ctx["prescription_verified"],
            message="Prescription finalized & released" if (ctx["has_prescription"] and ctx["prescription_verified"]) else "No prescription medically required for this visit" if not ctx["has_prescription"] else "Prescription pending release by clinician",
            details=f"Prescription ID: {ctx['prescription_id']}" if ctx["prescription_id"] else "Not required / none issued",
        ),
        ClaimPrerequisiteItem(
            key="duplicate_claim",
            title="Single Active Claim Rule",
            passed=not ctx["has_active_claim"],
            message="No prior active claim on file" if not ctx["has_active_claim"] else f"Active claim already registered ({ctx['existing_claim_id']})",
            details=f"Claim Reference: {ctx['existing_claim_id']}" if ctx["existing_claim_id"] else None,
        ),
    ]

    is_eligible = (
        ctx["payment_verified"]
        and ctx["is_completed"]
        and ctx["summary_finalized"]
        and ctx["prescription_verified"]
        and not ctx["has_active_claim"]
    )

    unmet: list[str] = []
    if not ctx["payment_verified"]:
        unmet.append("Razorpay payment must be successfully verified.")
    if not ctx["is_completed"]:
        unmet.append(f"Consultation must be Completed (currently '{ctx['appointment_status']}').")
    if not ctx["summary_finalized"]:
        unmet.append("Doctor consultation summary has not been finalized yet.")
    if not ctx["prescription_verified"]:
        unmet.append("Issued clinical prescription has not been released yet.")
    if ctx["has_active_claim"]:
        unmet.append(f"An active claim ({ctx['existing_claim_id']}) has already been initiated for this appointment.")

    return {
        "appointment_id": appointment_id,
        "appointment_display_id": ctx["display_id"],
        "doctor_name": ctx["doctor_name"],
        "specialty": ctx["specialty"],
        "appointment_date": ctx["appointment_date"],
        "appointment_status": ctx["appointment_status"],
        "consultation_fee": ctx["consultation_fee"],
        "fee_paise": ctx["fee_paise"],
        "currency": ctx["currency"],
        "payment_status": ctx["payment_status"],
        "razorpay_payment_id": ctx["razorpay_payment_id"],
        "payment_verified": ctx["payment_verified"],
        "summary_id": ctx["summary_id"],
        "summary_finalized": ctx["summary_finalized"],
        "prescription_id": ctx["prescription_id"],
        "prescription_status": ctx["prescription_status"],
        "prescription_required": ctx["has_prescription"],
        "prescription_verified": ctx["prescription_verified"],
        "has_active_claim": ctx["has_active_claim"],
        "existing_claim_id": ctx["existing_claim_id"],
        "existing_claim_status": ctx["existing_claim_status"],
        "is_eligible": is_eligible,
        "unmet_prerequisites": unmet,
        "prerequisites": prerequisites,
    }


@router.post("/patient/insurance/appointments/{appointment_id}/claim-initiate", response_model=ClaimInitiateResponse)
async def initiate_appointment_insurance_claim(
    appointment_id: str,
    payload: ClaimInitiateRequest,
    principal: Principal = Depends(require("insurance:write")),
) -> dict[str, Any]:
    """Initiate a post-consultation insurance claim after validating all prerequisites and linked policy."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    # 1. Server-side prerequisite check
    ctx = await _fetch_claim_appointment_context(
        db=db,
        tenant_id=principal.tenant_id,
        appointment_id=appointment_id,
        patient_ids=patient_ids,
        user_id=principal.user_id,
    )

    if not ctx["payment_verified"]:
        raise HTTPException(status_code=400, detail="Cannot initiate claim: Razorpay payment has not been verified")
    if not ctx["is_completed"]:
        raise HTTPException(status_code=400, detail=f"Cannot initiate claim: Consultation status is '{ctx['appointment_status']}', must be Completed")
    if not ctx["summary_finalized"]:
        raise HTTPException(status_code=400, detail="Cannot initiate claim: Consultation summary has not been finalized by doctor")
    if not ctx["prescription_verified"]:
        raise HTTPException(status_code=400, detail="Cannot initiate claim: Issued prescription has not been released yet")
    if ctx["has_active_claim"]:
        raise HTTPException(status_code=409, detail=f"An active claim ({ctx['existing_claim_id']}) already exists for this appointment")

    # 2. Policy validation
    query = {
        "tenant_id": principal.tenant_id,
        "id": payload.policy_id.strip(),
        "$or": [
            {"patient_id": {"$in": patient_ids}},
            {"user_id": principal.user_id},
        ],
    }
    policy = await db["insurance_policies"].find_one(query)
    if not policy and "patient_insurance_policies" in db:
        policy = await db["patient_insurance_policies"].find_one(query)

    if not policy:
        raise HTTPException(status_code=404, detail="Selected insurance policy not found or does not belong to you")

    if policy.get("status") != "Active":
        raise HTTPException(status_code=400, detail=f"Selected policy is {policy.get('status')}; only Active policies can be used")

    today_str = datetime.now(UTC).strftime("%Y-%m-%d")
    if policy.get("expiry_date") and policy["expiry_date"] < today_str:
        raise HTTPException(status_code=400, detail="Selected policy has expired")

    # 3. Create initiated claim record
    claim_id = f"CLM-{uuid4().hex[:8].upper()}"
    now = datetime.now(UTC).isoformat()
    masked_num = policy.get("policy_number_masked") or mask_policy_number(policy.get("policy_number", ""))

    claim_doc = {
        "id": claim_id,
        "tenant_id": principal.tenant_id,
        "patient_id": principal.user_id,
        "user_id": principal.user_id,
        "appointment_id": appointment_id,
        "appointment_display_id": ctx["display_id"],
        "policy_id": policy["id"],
        "provider_id": policy["provider_id"],
        "provider_name": policy["provider_name"],
        "provider_code": policy.get("provider_code", ""),
        "policy_number_masked": masked_num,
        "consultation_fee": ctx["consultation_fee"],
        "fee_paise": ctx["fee_paise"],
        "currency": ctx["currency"],
        "payment_id": ctx["razorpay_payment_id"],
        "summary_id": ctx["summary_id"],
        "prescription_id": ctx["prescription_id"],
        "notes": payload.notes.strip() if payload.notes else None,
        "status": "initiated",
        "created_at": now,
        "updated_at": now,
    }
    await db["insurance_claims"].insert_one(claim_doc)

    # 4. Audit Log
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "insurance_claim.initiated",
        "target_id": claim_id,
        "metadata": {
            "appointment_id": appointment_id,
            "policy_id": policy["id"],
            "provider_name": policy["provider_name"],
            "fee_paise": ctx["fee_paise"],
            "status": "initiated",
        },
        "created_at": now,
    })

    return {
        "claim_id": claim_id,
        "appointment_id": appointment_id,
        "appointment_display_id": ctx["display_id"],
        "policy_id": policy["id"],
        "provider_name": policy["provider_name"],
        "policy_number_masked": masked_num,
        "consultation_fee": ctx["consultation_fee"],
        "payment_id": ctx["razorpay_payment_id"],
        "status": "initiated",
        "created_at": now,
        "message": "Insurance claim request successfully initiated with verified clinical records.",
    }


# ==============================================================================
# CHECKPOINT 5: AUTOMATIC INSURANCE CLAIM DOSSIER & DOCUMENT COLLECTION
# ==============================================================================

def _generate_invoice_pdf(
    invoice_no: str,
    invoice_date: str,
    display_id: str,
    tenant_id: str,
    patient_name: str,
    patient_id: str,
    patient_phone: str,
    patient_email: str,
    doctor_name: str,
    specialty: str,
    fee_paise: int,
    currency: str,
    payment_id: str | None,
    payment_time: str,
) -> bytes:
    import io
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    width, height = letter

    # Header banner (Deep Teal #185A4D)
    c.setFillColor(colors.HexColor("#185A4D"))
    c.rect(0, height - 75, width, 75, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(40, height - 35, "KAIZEN CARE TELEHEALTH CLINIC")
    c.setFont("Helvetica", 9)
    c.drawString(40, height - 52, "Tax Invoice & Official Consultation Bill · Regulatory Compliant")

    # Document details
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, height - 100, f"Invoice No: {invoice_no}")
    c.drawString(width - 200, height - 100, f"Date: {invoice_date[:10]}")
    c.setFont("Helvetica", 9)
    c.drawString(40, height - 115, f"Encounter Ref: {display_id}")
    c.drawString(width - 200, height - 115, f"Clinic Tenant: {tenant_id}")

    # Separator
    c.setStrokeColor(colors.HexColor("#CBD5E1"))
    c.setLineWidth(0.8)
    c.line(40, height - 125, width - 40, height - 125)

    # Patient & Doctor Info
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, height - 145, "PATIENT DETAILS")
    c.drawString(width / 2 + 10, height - 145, "ATTENDING CLINICIAN")

    c.setFont("Helvetica", 9)
    c.drawString(40, height - 160, f"Name: {patient_name}")
    c.drawString(40, height - 175, f"Patient ID: {patient_id}")
    c.drawString(40, height - 190, f"Contact: {patient_phone}")
    c.drawString(40, height - 205, f"Email: {patient_email}")

    c.drawString(width / 2 + 10, height - 160, f"Doctor: {doctor_name}")
    c.drawString(width / 2 + 10, height - 175, f"Specialty: {specialty}")
    c.drawString(width / 2 + 10, height - 190, "Reg: Registered Medical Practitioner (NMC)")
    c.drawString(width / 2 + 10, height - 205, "Facility: Kaizen Care Digital Health Hub")

    # Table Header
    y = height - 230
    c.setFillColor(colors.HexColor("#F0F5F7"))
    c.rect(40, y - 5, width - 80, 20, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#185A4D"))
    c.setFont("Helvetica-Bold", 9)
    c.drawString(50, y, "#")
    c.drawString(80, y, "Service Description")
    c.drawString(340, y, "Consultation Mode")
    c.drawRightString(width - 50, y, "Amount (INR)")

    # Table Row
    y -= 25
    fee_inr = fee_paise / 100.0
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 9)
    c.drawString(50, y, "1")
    c.drawString(80, y, "Telehealth Video Consultation Encounter")
    c.drawString(340, y, "High-Definition Video")
    c.drawRightString(width - 50, y, f"{fee_inr:.2f}")

    y -= 18
    c.drawString(50, y, "2")
    c.drawString(80, y, "Electronic Medical Records & Prescription Archival")
    c.drawString(340, y, "Encrypted Storage")
    c.drawRightString(width - 50, y, "0.00")

    # Table Footer / Totals
    y -= 20
    c.line(40, y, width - 40, y)
    y -= 16
    c.setFont("Helvetica-Bold", 9)
    c.drawString(340, y, "Subtotal:")
    c.drawRightString(width - 50, y, f"Rs. {fee_inr:.2f}")

    y -= 14
    c.drawString(340, y, "Taxes (GST Exemption):")
    c.drawRightString(width - 50, y, "Rs. 0.00")

    y -= 16
    c.setFillColor(colors.HexColor("#185A4D"))
    c.rect(330, y - 4, width - 370, 18, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.drawString(340, y, "Total Paid:")
    c.drawRightString(width - 50, y, f"Rs. {fee_inr:.2f}")

    # Payment settlement details
    y -= 35
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 9)
    c.drawString(40, y, "PAYMENT SETTLEMENT & GATEWAY AUDIT:")
    c.setFont("Helvetica", 8)
    y -= 14
    c.drawString(40, y, "Gateway: Razorpay Automated Payment Gateway · Settlement: Verified Online Capture")
    y -= 12
    c.drawString(40, y, f"Gateway Transaction Ref: {payment_id or 'rzp_verified_live'} · Timestamp: {payment_time}")
    y -= 12
    c.drawString(40, y, "Payment Balance: Rs. 0.00 · Claim Status: Cleared for Insurance Dossier Filing")

    # Legal note
    c.setFillColor(colors.HexColor("#577877"))
    c.setFont("Helvetica", 7.5)
    c.drawString(40, 50, "This is an electronically generated and certified tax invoice under the Information Technology Act & Telemedicine Guidelines.")
    c.drawString(40, 40, "Health care services by an authorized medical practitioner are exempt from GST under Notification No. 12/2017-Central Tax.")

    c.save()
    return buf.getvalue()


def _generate_invoice_text(
    invoice_no: str,
    invoice_date: str,
    display_id: str,
    tenant_id: str,
    patient_name: str,
    patient_id: str,
    patient_phone: str,
    patient_email: str,
    doctor_name: str,
    specialty: str,
    fee_paise: int,
    currency: str,
    payment_id: str | None,
    payment_time: str,
) -> str:
    fee_inr = fee_paise / 100.0
    return (
        "================================================================================\n"
        "                    KAIZEN CARE TELEHEALTH CLINIC\n"
        "                 Tax Invoice & Consultation Statement\n"
        "================================================================================\n"
        f"Invoice No:          {invoice_no}\n"
        f"Invoice Date:        {invoice_date[:10]}\n"
        f"Encounter Ref:       {display_id}\n"
        f"Clinic Tenant ID:    {tenant_id}\n"
        "Consultation Mode:   Secure High-Definition Video Teleconsultation\n"
        "--------------------------------------------------------------------------------\n"
        "PATIENT DETAILS:\n"
        f"  Name:              {patient_name}\n"
        f"  Patient ID:        {patient_id}\n"
        f"  Phone:             {patient_phone}\n"
        f"  Email:             {patient_email}\n\n"
        "ATTENDING CLINICIAN:\n"
        f"  Doctor:            {doctor_name}\n"
        f"  Specialty:         {specialty}\n"
        "  Registration:      Registered Medical Practitioner (NMC Verified)\n"
        "--------------------------------------------------------------------------------\n"
        "BILLING BREAKDOWN:\n"
        f"  1. Telehealth Video Consultation (Scheduled 15 min):    Rs. {fee_inr:.2f}\n"
        "  2. Electronic Prescription & Records Archival:          Rs. 0.00\n"
        "  3. Platform Technology & HIPAA Cloud Infrastructure:    Rs. 0.00\n"
        "--------------------------------------------------------------------------------\n"
        f"  Subtotal:                                               Rs. {fee_inr:.2f}\n"
        "  Taxes (GST Exempt - Healthcare Clinical Services):       Rs. 0.00\n"
        f"  TOTAL AMOUNT PAID:                                      Rs. {fee_inr:.2f}\n"
        "  BALANCE DUE:                                            Rs. 0.00\n"
        "--------------------------------------------------------------------------------\n"
        "PAYMENT DETAILS:\n"
        "  Payment Gateway:   Razorpay Automated Gateway\n"
        f"  Transaction ID:    {payment_id or 'Verified Online Settlement'}\n"
        "  Payment Status:    CAPTURED / SUCCESSFUL\n"
        f"  Timestamp:         {payment_time}\n"
        "================================================================================\n"
        "This is an electronically generated tax invoice under the Information Technology\n"
        "Act and Telemedicine Practice Guidelines. Health care services by clinical establishments\n"
        "are exempt from GST under Notification No. 12/2017-Central Tax.\n"
        "================================================================================\n"
    )


def _generate_receipt_pdf(
    receipt_no: str,
    receipt_date: str,
    display_id: str,
    patient_name: str,
    patient_id: str,
    doctor_name: str,
    specialty: str,
    fee_paise: int,
    payment_id: str | None,
    payment_time: str,
) -> bytes:
    import io
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.pdfgen import canvas

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    width, height = letter

    # Header banner (Teal)
    c.setFillColor(colors.HexColor("#25836F"))
    c.rect(0, height - 75, width, 75, fill=1, stroke=0)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(40, height - 35, "KAIZEN CARE TELEHEALTH CLINIC")
    c.setFont("Helvetica", 9)
    c.drawString(40, height - 52, "Official Razorpay Payment Receipt · Electronic Proof of Payment")

    # Document details
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, height - 100, f"Receipt No: {receipt_no}")
    c.drawString(width - 200, height - 100, f"Date: {receipt_date[:10]}")
    c.setFont("Helvetica", 9)
    c.drawString(40, height - 115, f"Appointment ID: {display_id}")
    c.drawString(width - 200, height - 115, f"Txn Ref: {payment_id or 'Verified'}")

    c.setStrokeColor(colors.HexColor("#CBD5E1"))
    c.setLineWidth(0.8)
    c.line(40, height - 125, width - 40, height - 125)

    y = height - 150
    fee_inr = fee_paise / 100.0
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "PAYMENT RECEIPT CONFIRMATION")
    y -= 20
    c.setFont("Helvetica", 9)
    c.drawString(40, y, f"Received with thanks from: {patient_name} (Patient ID: {patient_id})")
    y -= 16
    c.drawString(40, y, f"On account of: Outpatient Teleconsultation with {doctor_name} ({specialty})")
    y -= 16
    c.drawString(40, y, f"Amount Received: Rs. {fee_inr:.2f} (Indian Rupees)")
    y -= 16
    c.drawString(40, y, "Payment Mode: Online / Razorpay Verified")
    y -= 16
    c.drawString(40, y, f"Transaction Identifier: {payment_id or 'Verified'}")
    y -= 16
    c.drawString(40, y, "Payment Status: CAPTURED / SUCCESSFUL")

    y -= 30
    c.setFillColor(colors.HexColor("#F0F5F7"))
    c.rect(40, y - 10, width - 80, 45, fill=1, stroke=0)
    c.setFillColor(colors.HexColor("#185A4D"))
    c.setFont("Helvetica-Bold", 10)
    c.drawString(55, y + 15, f"TOTAL AMOUNT SETTLED: Rs. {fee_inr:.2f}")
    c.setFont("Helvetica", 8)
    c.drawString(55, y, "This payment was verified electronically via Razorpay webhook and credited towards the consultation.")

    c.setFillColor(colors.HexColor("#577877"))
    c.setFont("Helvetica", 8)
    c.drawString(40, 50, "Authorized Signatory: Kaizen Care Finance & Accounts Division")
    c.drawString(40, 38, "Official electronic proof of payment eligible for submission to third-party insurance providers.")

    c.save()
    return buf.getvalue()


def _generate_receipt_text(
    receipt_no: str,
    receipt_date: str,
    display_id: str,
    patient_name: str,
    patient_id: str,
    doctor_name: str,
    specialty: str,
    fee_paise: int,
    payment_id: str | None,
    payment_time: str,
) -> str:
    fee_inr = fee_paise / 100.0
    return (
        "================================================================================\n"
        "                    KAIZEN CARE TELEHEALTH CLINIC\n"
        "               Official Razorpay Payment Settlement Receipt\n"
        "================================================================================\n"
        f"Receipt No:          {receipt_no}\n"
        f"Receipt Date:        {receipt_date[:10]}\n"
        f"Appointment ID:      {display_id}\n"
        f"Transaction Ref:     {payment_id or 'rzp_verified_payment'}\n"
        "--------------------------------------------------------------------------------\n"
        "Received with thanks from:\n"
        f"  Patient Name:      {patient_name}\n"
        f"  Patient ID:        {patient_id}\n\n"
        "On account of:\n"
        f"  Consultation:      Telehealth Outpatient Video Consultation\n"
        f"  Clinician:         {doctor_name} ({specialty})\n"
        f"  Date & Time:       {payment_time}\n\n"
        "Payment Details:\n"
        f"  Amount Settled:    Rs. {fee_inr:.2f} (Indian Rupees)\n"
        "  Payment Channel:   Razorpay Gateway Integration\n"
        f"  Transaction ID:    {payment_id or 'Captured Online'}\n"
        "  Payment Status:    SETTLED / CAPTURED\n"
        "--------------------------------------------------------------------------------\n"
        "Authorized Signatory:\n"
        "Kaizen Care Accounts & Financial Settlement Unit\n"
        "Issued electronically for third-party insurance reimbursement claims.\n"
        "================================================================================\n"
    )


@router.get("/patient/insurance/appointments/{appointment_id}/claim-dossier", response_model=ClaimDossierResponse)
async def get_appointment_claim_dossier(
    appointment_id: str,
    policy_id: str | None = None,
    principal: Principal = Depends(require("insurance:read")),
) -> dict[str, Any]:
    """Automatically retrieve and aggregate all claim supporting documents for the completed appointment."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    ctx = await _fetch_claim_appointment_context(
        db=db,
        tenant_id=principal.tenant_id,
        appointment_id=appointment_id,
        patient_ids=patient_ids,
        user_id=principal.user_id,
    )

    # 1. Patient Profile
    patient_doc = await db["patients"].find_one({
        "tenant_id": principal.tenant_id,
        "$or": [
            {"id": {"$in": patient_ids}},
            {"user_id": principal.user_id},
            {"user_account_id": principal.user_id},
        ],
    })
    if not patient_doc:
        patient_doc = await db["users"].find_one({
            "tenant_id": principal.tenant_id,
            "id": principal.user_id,
        }) or {}

    p_name = patient_doc.get("full_name") or patient_doc.get("name") or "Patient"
    p_id = str(patient_doc.get("id") or patient_doc.get("patient_id") or principal.user_id)
    p_phone = str(patient_doc.get("phone") or patient_doc.get("contact_number") or "N/A")
    p_email = str(patient_doc.get("email") or "N/A")
    p_gender = str(patient_doc.get("gender") or "N/A")
    p_dob = str(patient_doc.get("dob") or patient_doc.get("date_of_birth") or "N/A")

    patient_profile_item = ClaimDocumentItem(
        id=f"doc-profile-{p_id}",
        category="patient_profile",
        title="Patient Demographic & Identity Record",
        description="Verified patient profile and contact information from electronic medical database",
        status="Available",
        is_mandatory=True,
        details=f"Name: {p_name} • Patient ID: {p_id} • Phone: {p_phone} • Email: {p_email}",
        metadata={"name": p_name, "patient_id": p_id, "phone": p_phone, "email": p_email, "gender": p_gender, "dob": p_dob},
    )

    # 2. Selected Policy & 3. Insurance Card
    policy = None
    target_policy_id = None
    if policy_id and isinstance(policy_id, str) and policy_id.strip():
        target_policy_id = policy_id.strip()

    # If no policy_id supplied, check if initiated claim has policy_id or find latest active policy
    if not target_policy_id:
        if ctx.get("existing_claim_id"):
            claim_rec = await db["insurance_claims"].find_one({"id": ctx["existing_claim_id"], "tenant_id": principal.tenant_id})
            if claim_rec and claim_rec.get("policy_id"):
                target_policy_id = claim_rec["policy_id"]

    if target_policy_id:
        policy = await db["insurance_policies"].find_one({
            "tenant_id": principal.tenant_id,
            "id": target_policy_id,
            "$or": [{"patient_id": {"$in": patient_ids}}, {"user_id": principal.user_id}],
        })
        if not policy and "patient_insurance_policies" in db:
            policy = await db["patient_insurance_policies"].find_one({
                "tenant_id": principal.tenant_id,
                "id": target_policy_id,
                "$or": [{"patient_id": {"$in": patient_ids}}, {"user_id": principal.user_id}],
            })
    else:
        # Pick the latest active policy for this patient if available
        policy = await db["insurance_policies"].find_one({
            "tenant_id": principal.tenant_id,
            "status": "Active",
            "$or": [{"patient_id": {"$in": patient_ids}}, {"user_id": principal.user_id}],
        })
        if not policy and "patient_insurance_policies" in db:
            policy = await db["patient_insurance_policies"].find_one({
                "tenant_id": principal.tenant_id,
                "status": "Active",
                "$or": [{"patient_id": {"$in": patient_ids}}, {"user_id": principal.user_id}],
            })

    masked_num = None
    if policy:
        masked_num = policy.get("policy_number_masked") or mask_policy_number(policy.get("policy_number", ""))
        policy_item = ClaimDocumentItem(
            id=f"doc-policy-{policy['id']}",
            category="insurance_policy",
            title="Selected Insurance Policy Details",
            description=f"{policy.get('provider_name')} • Policy {masked_num}",
            status="Available",
            is_mandatory=True,
            details=f"Provider: {policy.get('provider_name')} • Type: {policy.get('insurance_type', 'Individual')} • Valid: {policy.get('start_date', 'N/A')} to {policy.get('expiry_date', 'N/A')}",
            metadata={"policy_id": policy["id"], "provider_name": policy.get("provider_name"), "provider_code": policy.get("provider_code"), "policy_number_masked": masked_num, "expiry_date": policy.get("expiry_date")},
        )

        card_doc = None
        if policy.get("card_document_id"):
            card_doc = await db["insurance_documents"].find_one({"id": policy["card_document_id"], "tenant_id": principal.tenant_id})
        if not card_doc:
            card_doc = await db["insurance_documents"].find_one({
                "tenant_id": principal.tenant_id,
                "policy_id": policy["id"],
                "document_type": "insurance_card",
            })

        if card_doc:
            card_item = ClaimDocumentItem(
                id=card_doc["id"],
                category="insurance_card",
                title="Insurance Card / Member E-Card",
                description=f"Policy card document: {card_doc.get('file_name', 'card')}",
                status="Available",
                is_mandatory=True,
                file_name=card_doc.get("file_name"),
                content_type=card_doc.get("content_type"),
                size_bytes=card_doc.get("size_bytes"),
                download_url=f"/api/patient/insurance/documents/{card_doc['id']}/download",
                preview_url=f"/api/patient/insurance/documents/{card_doc['id']}/preview",
                details=f"Uploaded on {card_doc.get('created_at', '')[:10]} ({(card_doc.get('size_bytes', 0) / 1024):.1f} KB)",
                metadata={"document_id": card_doc["id"], "uploaded_at": card_doc.get("created_at")},
            )
        else:
            card_item = ClaimDocumentItem(
                id="doc-card-missing",
                category="insurance_card",
                title="Insurance Card / Member E-Card",
                description="Insurance card document has not been uploaded for this policy",
                status="Missing",
                is_mandatory=True,
                details="Please upload an insurance card in My Insurance or attach it as a supporting document",
            )
    else:
        policy_item = ClaimDocumentItem(
            id="doc-policy-missing",
            category="insurance_policy",
            title="Selected Insurance Policy Details",
            description="No active insurance policy selected for this claim",
            status="Missing",
            is_mandatory=True,
            details="Select an existing insurance policy or add a new policy in My Insurance",
        )
        card_item = ClaimDocumentItem(
            id="doc-card-missing",
            category="insurance_card",
            title="Insurance Card / Member E-Card",
            description="Insurance card document cannot be retrieved without an active policy",
            status="Missing",
            is_mandatory=True,
            details="Requires a registered insurance policy with an uploaded insurance card",
        )

    # 4. Doctor-Issued Prescription
    rx_doc = await db["prescriptions"].find_one({
        "tenant_id": principal.tenant_id,
        "appointment_id": appointment_id,
    })
    if rx_doc:
        rx_status = rx_doc.get("status", "")
        rx_released = str(rx_status).lower() in {"released", "finalized"}
        rx_item = ClaimDocumentItem(
            id=rx_doc["id"],
            category="prescription",
            title="Doctor-Issued Digital Prescription",
            description=f"Official digital prescription authorized by {ctx['doctor_name']}",
            status="Available" if rx_released else "Missing",
            is_mandatory=False,
            file_name=f"Prescription-{ctx['display_id']}.pdf",
            content_type="application/pdf",
            download_url=f"/api/patient/clinical-outputs/prescriptions/{rx_doc['id']}/download",
            preview_url=f"/api/patient/clinical-outputs/prescriptions/{rx_doc['id']}/download",
            details=f"Prescription ID: {rx_doc['id']} • Signed: {rx_doc.get('released_at', rx_doc.get('created_at', ''))[:10]}",
            metadata={"prescription_id": rx_doc["id"], "prescriber": rx_doc.get("prescriber_name") or ctx["doctor_name"]},
        )
    else:
        rx_item = ClaimDocumentItem(
            id="doc-rx-none",
            category="prescription",
            title="Doctor-Issued Digital Prescription",
            description="No prescription was medically required for this consultation",
            status="Not Applicable",
            is_mandatory=False,
            details="Attending physician concluded that no prescription medications were medically indicated for this encounter",
        )

    # 5. Finalized Consultation Summary
    sum_doc = await db["consultation_summaries"].find_one({
        "tenant_id": principal.tenant_id,
        "appointment_id": appointment_id,
    })
    if not sum_doc:
        sum_doc = await db["clinical_notes"].find_one({
            "tenant_id": principal.tenant_id,
            "$or": [{"appointment_id": appointment_id}, {"consultation_id": appointment_id}],
        })

    if sum_doc and str(sum_doc.get("status", "")).lower() in {"released", "finalized"}:
        summary_item = ClaimDocumentItem(
            id=sum_doc["id"],
            category="consultation_summary",
            title="Finalized Consultation Clinical Summary",
            description=f"Complete consultation summary with clinical notes from {ctx['doctor_name']}",
            status="Available",
            is_mandatory=True,
            file_name=f"Consultation-Summary-{ctx['display_id']}.txt",
            content_type="text/plain",
            download_url=f"/api/patient/clinical-outputs/summaries/{sum_doc['id']}/download",
            preview_url=f"/api/patient/clinical-outputs/summaries/{sum_doc['id']}/download",
            details=f"Summary ID: {sum_doc['id']} • Finalized: {sum_doc.get('released_at', sum_doc.get('created_at', ''))[:10]}",
            metadata={"summary_id": sum_doc["id"]},
        )
    else:
        summary_item = ClaimDocumentItem(
            id="doc-summary-missing",
            category="consultation_summary",
            title="Finalized Consultation Clinical Summary",
            description="Doctor consultation summary has not been finalized yet",
            status="Missing",
            is_mandatory=True,
            details="Awaiting doctor sign-off and summary publication",
        )

    # 6. Consultation Invoice
    invoice_item = ClaimDocumentItem(
        id=f"doc-invoice-{appointment_id}",
        category="consultation_invoice",
        title="Itemized Consultation Tax Invoice",
        description=f"Official Kaizen Care medical invoice for {ctx['consultation_fee']}",
        status="Available",
        is_mandatory=True,
        file_name=f"Invoice-{ctx['display_id']}.pdf",
        content_type="application/pdf",
        download_url=f"/api/patient/insurance/appointments/{appointment_id}/invoice/download",
        preview_url=f"/api/patient/insurance/appointments/{appointment_id}/invoice/preview",
        details=f"Amount: {ctx['consultation_fee']} • Encounter ID: {ctx['display_id']}",
        metadata={"fee_paise": ctx["fee_paise"], "currency": ctx["currency"]},
    )

    # 7. Verified Payment Receipt
    if ctx["payment_verified"]:
        receipt_item = ClaimDocumentItem(
            id=f"doc-receipt-{appointment_id}",
            category="payment_receipt",
            title="Verified Razorpay Payment Receipt",
            description=f"Payment transaction receipt (Txn: {ctx['razorpay_payment_id'] or 'Verified'})",
            status="Available",
            is_mandatory=True,
            file_name=f"Receipt-{ctx['display_id']}.pdf",
            content_type="application/pdf",
            download_url=f"/api/patient/insurance/appointments/{appointment_id}/receipt/download",
            preview_url=f"/api/patient/insurance/appointments/{appointment_id}/receipt/preview",
            details=f"Payment Gateway: Razorpay • Txn: {ctx['razorpay_payment_id'] or 'Verified'} • Settled",
            metadata={"transaction_id": ctx["razorpay_payment_id"]},
        )
    else:
        receipt_item = ClaimDocumentItem(
            id="doc-receipt-missing",
            category="payment_receipt",
            title="Verified Razorpay Payment Receipt",
            description="Payment verification pending or failed",
            status="Missing",
            is_mandatory=True,
            details="Razorpay payment must be verified before receipt can be generated",
        )

    # 8. Additional Supporting Documents
    additional_items: list[ClaimDocumentItem] = []
    supp_cursor = db["insurance_documents"].find({
        "tenant_id": principal.tenant_id,
        "appointment_id": appointment_id,
        "document_type": "supporting_document",
        "$or": [
            {"patient_id": {"$in": patient_ids}},
            {"user_id": principal.user_id},
        ],
    }).sort("created_at", -1)

    async for sdoc in supp_cursor:
        additional_items.append(
            ClaimDocumentItem(
                id=sdoc["id"],
                category="supporting_document",
                title=sdoc.get("title") or sdoc.get("file_name") or "Supporting Document",
                description=f"Uploaded supporting document: {sdoc.get('file_name')}",
                status="Available",
                is_mandatory=False,
                file_name=sdoc.get("file_name"),
                content_type=sdoc.get("content_type"),
                size_bytes=sdoc.get("size_bytes"),
                download_url=f"/api/patient/insurance/documents/{sdoc['id']}/download",
                preview_url=f"/api/patient/insurance/documents/{sdoc['id']}/preview",
                details=f"Uploaded on {sdoc.get('created_at', '')[:10]} ({(sdoc.get('size_bytes', 0) / 1024):.1f} KB)",
                metadata={"document_id": sdoc["id"], "appointment_id": appointment_id},
            )
        )

    all_docs = [
        patient_profile_item,
        policy_item,
        card_item,
        rx_item,
        summary_item,
        invoice_item,
        receipt_item,
        *additional_items,
    ]

    missing_mandatory = [doc.title for doc in all_docs if doc.is_mandatory and doc.status == "Missing"]
    mandatory_complete = len(missing_mandatory) == 0

    return {
        "appointment_id": appointment_id,
        "appointment_display_id": ctx["display_id"],
        "policy_id": policy["id"] if policy else None,
        "provider_name": policy.get("provider_name") if policy else None,
        "policy_number_masked": masked_num if policy else None,
        "paid_amount": ctx["consultation_fee"],
        "amount_paise": ctx["fee_paise"],
        "currency": ctx["currency"],
        "documents": all_docs,
        "mandatory_complete": mandatory_complete,
        "missing_mandatory_count": len(missing_mandatory),
        "missing_mandatory_titles": missing_mandatory,
        "total_documents_collected": len(all_docs),
        "dossier_ready": mandatory_complete,
    }


@router.post("/patient/insurance/appointments/{appointment_id}/claim-documents", response_model=SupportingDocumentUploadResponse)
async def upload_claim_supporting_document(
    appointment_id: str,
    file: UploadFile = File(...),
    title: str = Form("Supporting Document"),
    principal: Principal = Depends(require("insurance:write")),
) -> dict[str, Any]:
    """Upload additional supporting document specifically associated with this appointment."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    # Validate appointment ownership and completion
    ctx = await _fetch_claim_appointment_context(
        db=db,
        tenant_id=principal.tenant_id,
        appointment_id=appointment_id,
        patient_ids=patient_ids,
        user_id=principal.user_id,
    )
    if not ctx["is_completed"]:
        raise HTTPException(status_code=400, detail="Cannot attach documents to an uncompleted appointment")

    clean_title = title.strip() if title else "Supporting Document"
    if not clean_title:
        clean_title = "Supporting Document"

    doc_res = await _save_insurance_document(
        db=db,
        file=file,
        doc_type="supporting_document",
        tenant_id=principal.tenant_id,
        patient_id=principal.user_id,
        user_id=principal.user_id,
        appointment_id=appointment_id,
        title=clean_title,
    )

    # Audit log
    now = datetime.now(UTC).isoformat()
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "insurance_supporting_document.uploaded",
        "target_id": doc_res["id"],
        "metadata": {
            "appointment_id": appointment_id,
            "title": clean_title,
            "file_name": doc_res["file_name"],
            "size_bytes": doc_res["size_bytes"],
        },
        "created_at": now,
    })

    return {
        "id": doc_res["id"],
        "appointment_id": appointment_id,
        "document_type": "supporting_document",
        "title": clean_title,
        "file_name": doc_res["file_name"],
        "content_type": doc_res["content_type"],
        "size_bytes": doc_res["size_bytes"],
        "created_at": doc_res["created_at"],
    }


@router.delete("/patient/insurance/documents/{document_id}")
async def delete_patient_insurance_document(
    document_id: str,
    principal: Principal = Depends(require("insurance:write")),
) -> dict[str, Any]:
    """Delete an uploaded insurance or supporting document belonging to the patient."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    query = {
        "id": document_id,
        "tenant_id": principal.tenant_id,
        "$or": [
            {"patient_id": {"$in": patient_ids}},
            {"user_id": principal.user_id},
        ],
    }
    doc = await db["insurance_documents"].find_one(query)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found or access denied")

    await db["insurance_documents"].delete_one({"id": document_id})
    storage_dir = _ensure_storage_dir()
    file_path = (storage_dir / doc["storage_key"]).resolve()
    if file_path.is_file():
        try:
            file_path.unlink()
        except Exception:
            pass

    now = datetime.now(UTC).isoformat()
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "insurance_document.deleted",
        "target_id": document_id,
        "metadata": {"file_name": doc.get("file_name"), "document_type": doc.get("document_type")},
        "created_at": now,
    })
    return {"id": document_id, "message": "Document deleted successfully"}


@router.get("/patient/insurance/appointments/{appointment_id}/invoice/download")
async def download_claim_invoice(
    appointment_id: str,
    principal: Principal = Depends(require("insurance:read")),
):
    """Download itemized official consultation invoice as PDF."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)
    ctx = await _fetch_claim_appointment_context(
        db=db,
        tenant_id=principal.tenant_id,
        appointment_id=appointment_id,
        patient_ids=patient_ids,
        user_id=principal.user_id,
    )

    patient_doc = await db["patients"].find_one({
        "tenant_id": principal.tenant_id,
        "$or": [{"id": {"$in": patient_ids}}, {"user_id": principal.user_id}],
    }) or {}
    p_name = patient_doc.get("full_name") or patient_doc.get("name") or "Patient"
    p_id = str(patient_doc.get("id") or patient_doc.get("patient_id") or principal.user_id)
    p_phone = str(patient_doc.get("phone") or patient_doc.get("contact_number") or "N/A")
    p_email = str(patient_doc.get("email") or "N/A")

    invoice_no = f"INV-{appointment_id[-8:].upper()}"
    filename = f"Invoice-{ctx['display_id']}.pdf"

    try:
        pdf_bytes = _generate_invoice_pdf(
            invoice_no=invoice_no,
            invoice_date=ctx["appointment_date"],
            display_id=ctx["display_id"],
            tenant_id=principal.tenant_id,
            patient_name=p_name,
            patient_id=p_id,
            patient_phone=p_phone,
            patient_email=p_email,
            doctor_name=ctx["doctor_name"],
            specialty=ctx["specialty"],
            fee_paise=ctx["fee_paise"],
            currency=ctx["currency"],
            payment_id=ctx["razorpay_payment_id"],
            payment_time=ctx["appointment_date"],
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception:
        text_content = _generate_invoice_text(
            invoice_no=invoice_no,
            invoice_date=ctx["appointment_date"],
            display_id=ctx["display_id"],
            tenant_id=principal.tenant_id,
            patient_name=p_name,
            patient_id=p_id,
            patient_phone=p_phone,
            patient_email=p_email,
            doctor_name=ctx["doctor_name"],
            specialty=ctx["specialty"],
            fee_paise=ctx["fee_paise"],
            currency=ctx["currency"],
            payment_id=ctx["razorpay_payment_id"],
            payment_time=ctx["appointment_date"],
        )
        return PlainTextResponse(
            text_content,
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="Invoice-{ctx["display_id"]}.txt"'},
        )


@router.get("/patient/insurance/appointments/{appointment_id}/invoice/preview")
async def preview_claim_invoice(
    appointment_id: str,
    principal: Principal = Depends(require("insurance:read")),
):
    """Inline preview of itemized official consultation invoice as PDF."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)
    ctx = await _fetch_claim_appointment_context(
        db=db,
        tenant_id=principal.tenant_id,
        appointment_id=appointment_id,
        patient_ids=patient_ids,
        user_id=principal.user_id,
    )

    patient_doc = await db["patients"].find_one({
        "tenant_id": principal.tenant_id,
        "$or": [{"id": {"$in": patient_ids}}, {"user_id": principal.user_id}],
    }) or {}
    p_name = patient_doc.get("full_name") or patient_doc.get("name") or "Patient"
    p_id = str(patient_doc.get("id") or patient_doc.get("patient_id") or principal.user_id)
    p_phone = str(patient_doc.get("phone") or patient_doc.get("contact_number") or "N/A")
    p_email = str(patient_doc.get("email") or "N/A")

    invoice_no = f"INV-{appointment_id[-8:].upper()}"
    filename = f"Invoice-{ctx['display_id']}.pdf"

    try:
        pdf_bytes = _generate_invoice_pdf(
            invoice_no=invoice_no,
            invoice_date=ctx["appointment_date"],
            display_id=ctx["display_id"],
            tenant_id=principal.tenant_id,
            patient_name=p_name,
            patient_id=p_id,
            patient_phone=p_phone,
            patient_email=p_email,
            doctor_name=ctx["doctor_name"],
            specialty=ctx["specialty"],
            fee_paise=ctx["fee_paise"],
            currency=ctx["currency"],
            payment_id=ctx["razorpay_payment_id"],
            payment_time=ctx["appointment_date"],
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{filename}"'},
        )
    except Exception:
        text_content = _generate_invoice_text(
            invoice_no=invoice_no,
            invoice_date=ctx["appointment_date"],
            display_id=ctx["display_id"],
            tenant_id=principal.tenant_id,
            patient_name=p_name,
            patient_id=p_id,
            patient_phone=p_phone,
            patient_email=p_email,
            doctor_name=ctx["doctor_name"],
            specialty=ctx["specialty"],
            fee_paise=ctx["fee_paise"],
            currency=ctx["currency"],
            payment_id=ctx["razorpay_payment_id"],
            payment_time=ctx["appointment_date"],
        )
        return PlainTextResponse(
            text_content,
            media_type="text/plain",
            headers={"Content-Disposition": f'inline; filename="Invoice-{ctx["display_id"]}.txt"'},
        )


@router.get("/patient/insurance/appointments/{appointment_id}/receipt/download")
async def download_claim_receipt(
    appointment_id: str,
    principal: Principal = Depends(require("insurance:read")),
):
    """Download verified Razorpay payment receipt as PDF."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)
    ctx = await _fetch_claim_appointment_context(
        db=db,
        tenant_id=principal.tenant_id,
        appointment_id=appointment_id,
        patient_ids=patient_ids,
        user_id=principal.user_id,
    )

    if not ctx["payment_verified"]:
        raise HTTPException(status_code=400, detail="Cannot generate receipt: Payment has not been verified")

    patient_doc = await db["patients"].find_one({
        "tenant_id": principal.tenant_id,
        "$or": [{"id": {"$in": patient_ids}}, {"user_id": principal.user_id}],
    }) or {}
    p_name = patient_doc.get("full_name") or patient_doc.get("name") or "Patient"
    p_id = str(patient_doc.get("id") or patient_doc.get("patient_id") or principal.user_id)

    receipt_no = f"RCP-{appointment_id[-8:].upper()}"
    filename = f"Receipt-{ctx['display_id']}.pdf"

    try:
        pdf_bytes = _generate_receipt_pdf(
            receipt_no=receipt_no,
            receipt_date=ctx["appointment_date"],
            display_id=ctx["display_id"],
            patient_name=p_name,
            patient_id=p_id,
            doctor_name=ctx["doctor_name"],
            specialty=ctx["specialty"],
            fee_paise=ctx["fee_paise"],
            payment_id=ctx["razorpay_payment_id"],
            payment_time=ctx["appointment_date"],
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception:
        text_content = _generate_receipt_text(
            receipt_no=receipt_no,
            receipt_date=ctx["appointment_date"],
            display_id=ctx["display_id"],
            patient_name=p_name,
            patient_id=p_id,
            doctor_name=ctx["doctor_name"],
            specialty=ctx["specialty"],
            fee_paise=ctx["fee_paise"],
            payment_id=ctx["razorpay_payment_id"],
            payment_time=ctx["appointment_date"],
        )
        return PlainTextResponse(
            text_content,
            media_type="text/plain",
            headers={"Content-Disposition": f'attachment; filename="Receipt-{ctx["display_id"]}.txt"'},
        )


@router.get("/patient/insurance/appointments/{appointment_id}/receipt/preview")
async def preview_claim_receipt(
    appointment_id: str,
    principal: Principal = Depends(require("insurance:read")),
):
    """Inline preview of verified Razorpay payment receipt as PDF."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)
    ctx = await _fetch_claim_appointment_context(
        db=db,
        tenant_id=principal.tenant_id,
        appointment_id=appointment_id,
        patient_ids=patient_ids,
        user_id=principal.user_id,
    )

    if not ctx["payment_verified"]:
        raise HTTPException(status_code=400, detail="Cannot preview receipt: Payment has not been verified")

    patient_doc = await db["patients"].find_one({
        "tenant_id": principal.tenant_id,
        "$or": [{"id": {"$in": patient_ids}}, {"user_id": principal.user_id}],
    }) or {}
    p_name = patient_doc.get("full_name") or patient_doc.get("name") or "Patient"
    p_id = str(patient_doc.get("id") or patient_doc.get("patient_id") or principal.user_id)

    receipt_no = f"RCP-{appointment_id[-8:].upper()}"
    filename = f"Receipt-{ctx['display_id']}.pdf"

    try:
        pdf_bytes = _generate_receipt_pdf(
            receipt_no=receipt_no,
            receipt_date=ctx["appointment_date"],
            display_id=ctx["display_id"],
            patient_name=p_name,
            patient_id=p_id,
            doctor_name=ctx["doctor_name"],
            specialty=ctx["specialty"],
            fee_paise=ctx["fee_paise"],
            payment_id=ctx["razorpay_payment_id"],
            payment_time=ctx["appointment_date"],
        )
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="{filename}"'},
        )
    except Exception:
        text_content = _generate_receipt_text(
            receipt_no=receipt_no,
            receipt_date=ctx["appointment_date"],
            display_id=ctx["display_id"],
            patient_name=p_name,
            patient_id=p_id,
            doctor_name=ctx["doctor_name"],
            specialty=ctx["specialty"],
            fee_paise=ctx["fee_paise"],
            payment_id=ctx["razorpay_payment_id"],
            payment_time=ctx["appointment_date"],
        )
        return PlainTextResponse(
            text_content,
            media_type="text/plain",
            headers={"Content-Disposition": f'inline; filename="Receipt-{ctx["display_id"]}.txt"'},
        )


# ==============================================================================
# CHECKPOINT 6: INSURANCE DATA SHARING CONSENT
# ==============================================================================

CLAIM_CONSENT_TYPE = "insurance_claim_data_sharing"
CLAIM_CONSENT_VERSION = "1.0"
CLAIM_CONSENT_TEXT = (
    "I authorize Kaizen Care to share the selected clinical records, insurance details and "
    "payment documents with my selected insurance provider or authorized TPA for processing this "
    "reimbursement claim. I understand that claim approval and reimbursement are subject to my "
    "insurance policy terms."
)

CLAIM_CONSENT_DOCUMENT_DEFINITION = {
    "title": "Authorization for Disclosure of Medical, Financial & Policy Records for Insurance Reimbursement",
    "version": CLAIM_CONSENT_VERSION,
    "effective_date": "2026-01-01",
    "purpose": (
        "To provide explicit, informed, and revocable patient authorization for Kaizen Care to share "
        "clinical encounter summaries, prescriptions, consultation invoices, and payment receipts with "
        "the patient's chosen insurance company or Third-Party Administrator (TPA) exclusively for reimbursement claim settlement."
    ),
    "consent_text": CLAIM_CONSENT_TEXT,
    "sections": [
        {
            "heading": "1. Purpose of Data Disclosure",
            "body": (
                "Your clinical records, electronic consultation summary, diagnostic findings, prescriptions, "
                "itemized medical tax invoice, and verified Razorpay payment transaction receipts are disclosed "
                "solely to facilitate processing, adjudication, and settlement of your post-consultation reimbursement "
                "claim with your chosen health insurer or authorized TPA."
            ),
        },
        {
            "heading": "2. Designated Recipients",
            "body": (
                "Data sharing is strictly restricted to the authorized claims management division of your selected "
                "insurance carrier or licensed Third Party Administrator (TPA) registered in the Kaizen Care Provider "
                "Master. Your health data will never be sold, licensed, or shared with unauthorized commercial marketing entities."
            ),
        },
        {
            "heading": "3. Scope of Authorized Records",
            "body": (
                "Only records directly associated with this specific telehealth consultation encounter are included in "
                "this transmission. Records from past or unrelated encounters are strictly isolated and excluded unless "
                "separately authorized by you."
            ),
        },
        {
            "heading": "4. Right of Immediate Revocation",
            "body": (
                "You retain the statutory right to withdraw this sharing consent at any time prior to external dispatch "
                "to the insurance carrier. Revocation takes immediate effect and prevents any further sharing of your "
                "clinical documents for this claim."
            ),
        },
        {
            "heading": "5. Policy Terms & Adjudication Disclaimer",
            "body": (
                "You acknowledge that Kaizen Care is a digital telehealth clinical provider and does not adjudicate, "
                "guarantee, or influence the insurer's final coverage or reimbursement determination. Claim approval "
                "remains subject to your personal insurance policy terms, exclusions, deductibles, and waiting periods."
            ),
        },
    ],
}


def _compute_consent_footprint(provider_id: str | None, doc_ids: list[str]) -> str:
    sorted_docs = sorted(doc_ids)
    return f"{provider_id or 'none'}::{','.join(sorted_docs)}"


@router.get("/patient/insurance/claim-consent/document", response_model=ConsentReviewDocumentResponse)
async def get_claim_consent_document_definition(
    principal: Principal = Depends(require("insurance:read")),
) -> dict[str, Any]:
    """Retrieve full dynamic legal consent document definition for patient review."""
    return CLAIM_CONSENT_DOCUMENT_DEFINITION


@router.get("/patient/insurance/appointments/{appointment_id}/claim-consent", response_model=ClaimConsentResponse)
async def get_appointment_claim_consent(
    appointment_id: str,
    policy_id: str | None = None,
    principal: Principal = Depends(require("insurance:read")),
) -> dict[str, Any]:
    """Retrieve current insurance data sharing consent status, authorized documents, and renewal requirements."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    # 1. Validate appointment context
    ctx = await _fetch_claim_appointment_context(
        db=db,
        tenant_id=principal.tenant_id,
        appointment_id=appointment_id,
        patient_ids=patient_ids,
        user_id=principal.user_id,
    )

    # 2. Get dossier to know current documents and policy
    dossier = await get_appointment_claim_dossier(
        appointment_id=appointment_id,
        policy_id=policy_id,
        principal=principal,
    )

    current_provider_id = None
    current_provider_name = None
    target_policy = None

    if dossier.get("policy_id"):
        target_policy = await db["insurance_policies"].find_one({
            "tenant_id": principal.tenant_id,
            "id": dossier["policy_id"],
        })
        if not target_policy and "patient_insurance_policies" in db:
            target_policy = await db["patient_insurance_policies"].find_one({
                "tenant_id": principal.tenant_id,
                "id": dossier["policy_id"],
            })
        if target_policy:
            current_provider_id = target_policy.get("provider_id")
            current_provider_name = target_policy.get("provider_name")

    # Available documents intended for sharing
    available_docs: list[ClaimAuthorizedDocItem] = [
        ClaimAuthorizedDocItem(
            id=d.id,
            category=d.category,
            title=d.title,
            status=d.status,
            file_name=d.file_name,
        )
        for d in dossier.get("documents", [])
        if d.status == "Available"
    ]
    current_footprint = _compute_consent_footprint(current_provider_id, [d.id for d in available_docs])

    # 3. Query active/latest non-superseded consent from db["consents"]
    consent_query = {
        "tenant_id": principal.tenant_id,
        "appointment_id": appointment_id,
        "consent_type": CLAIM_CONSENT_TYPE,
        "status": {"$in": ["granted", "withdrawn"]},
        "$or": [
            {"patient_id": {"$in": patient_ids}},
            {"user_id": principal.user_id},
        ],
    }

    consent_cursor = db["consents"].find(consent_query).sort("created_at", -1)
    existing_consent = None
    async for c_doc in consent_cursor:
        existing_consent = c_doc
        break

    status = "not_granted"
    is_granted = False
    requires_renewal = False
    renewal_reason = None
    consent_id = None
    accepted_at = None
    withdrawn_at = None

    if existing_consent:
        consent_id = existing_consent.get("id")
        stored_status = existing_consent.get("status")

        if stored_status == "granted":
            accepted_at = existing_consent.get("accepted_at")
            stored_footprint = existing_consent.get("documents_footprint")

            if stored_footprint != current_footprint:
                requires_renewal = True
                renewal_reason = "Insurance provider or authorized document list has changed since consent was granted."
                status = "renewal_required"
                is_granted = False
            else:
                status = "granted"
                is_granted = True
        elif stored_status == "withdrawn":
            status = "withdrawn"
            is_granted = False
            accepted_at = existing_consent.get("accepted_at")
            withdrawn_at = existing_consent.get("withdrawn_at")
        else:
            status = "not_granted"
            is_granted = False

    return {
        "appointment_id": appointment_id,
        "policy_id": dossier.get("policy_id"),
        "provider_id": current_provider_id,
        "provider_name": current_provider_name,
        "consent_type": CLAIM_CONSENT_TYPE,
        "consent_version": CLAIM_CONSENT_VERSION,
        "consent_text": CLAIM_CONSENT_TEXT,
        "status": status,
        "is_granted": is_granted,
        "consent_id": consent_id,
        "accepted_at": accepted_at,
        "withdrawn_at": withdrawn_at,
        "authorized_documents": available_docs,
        "requires_renewal": requires_renewal,
        "renewal_reason": renewal_reason,
    }


@router.post("/patient/insurance/appointments/{appointment_id}/claim-consent", response_model=ClaimConsentResponse)
async def grant_appointment_claim_consent(
    appointment_id: str,
    payload: ClaimConsentGrantRequest,
    principal: Principal = Depends(require("insurance:write")),
) -> dict[str, Any]:
    """Grant explicit patient authorization to share encounter records with the selected insurer."""
    if not payload.consent_accepted:
        raise HTTPException(status_code=422, detail="Explicit consent acceptance is required to authorize data sharing")

    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    # Validate appointment context
    ctx = await _fetch_claim_appointment_context(
        db=db,
        tenant_id=principal.tenant_id,
        appointment_id=appointment_id,
        patient_ids=patient_ids,
        user_id=principal.user_id,
    )
    if not ctx["is_completed"]:
        raise HTTPException(status_code=400, detail="Cannot grant insurance consent for an uncompleted appointment")

    # Validate policy
    pol_id = payload.policy_id.strip() if payload.policy_id else None
    if not pol_id:
        raise HTTPException(status_code=400, detail="An insurance policy must be selected to grant sharing consent")

    policy = await db["insurance_policies"].find_one({
        "tenant_id": principal.tenant_id,
        "id": pol_id,
        "$or": [{"patient_id": {"$in": patient_ids}}, {"user_id": principal.user_id}],
    })
    if not policy and "patient_insurance_policies" in db:
        policy = await db["patient_insurance_policies"].find_one({
            "tenant_id": principal.tenant_id,
            "id": pol_id,
            "$or": [{"patient_id": {"$in": patient_ids}}, {"user_id": principal.user_id}],
        })

    if not policy:
        raise HTTPException(status_code=404, detail="Selected insurance policy not found or access denied")
    if policy.get("status") != "Active":
        raise HTTPException(status_code=400, detail="Selected insurance policy must be Active to grant consent")

    # Fetch dossier to extract authorized documents
    dossier = await get_appointment_claim_dossier(
        appointment_id=appointment_id,
        policy_id=policy["id"],
        principal=principal,
    )

    available_docs: list[ClaimAuthorizedDocItem] = [
        ClaimAuthorizedDocItem(
            id=d.id,
            category=d.category,
            title=d.title,
            status=d.status,
            file_name=d.file_name,
        )
        for d in dossier.get("documents", [])
        if d.status == "Available"
    ]
    footprint = _compute_consent_footprint(policy.get("provider_id"), [d.id for d in available_docs])

    now = datetime.now(UTC).isoformat()
    consent_id = f"cst-{uuid4().hex[:12]}"

    # Supersede existing consents for this encounter
    await db["consents"].update_many(
        {
            "tenant_id": principal.tenant_id,
            "appointment_id": appointment_id,
            "consent_type": CLAIM_CONSENT_TYPE,
            "status": "granted",
        },
        {"$set": {"status": "superseded", "superseded_at": now}},
    )

    # Insert new consent record
    consent_doc = {
        "id": consent_id,
        "tenant_id": principal.tenant_id,
        "patient_id": principal.user_id,
        "user_id": principal.user_id,
        "appointment_id": appointment_id,
        "claim_draft_id": f"DRAFT-{appointment_id[-8:].upper()}",
        "policy_id": policy["id"],
        "provider_id": policy.get("provider_id"),
        "provider_name": policy.get("provider_name"),
        "consent_type": CLAIM_CONSENT_TYPE,
        "consent_version": payload.consent_version or CLAIM_CONSENT_VERSION,
        "consent_text": CLAIM_CONSENT_TEXT,
        "authorized_documents": [d.model_dump() for d in available_docs],
        "documents_footprint": footprint,
        "status": "granted",
        "accepted_at": now,
        "created_at": now,
        "updated_at": now,
    }
    await db["consents"].insert_one(consent_doc)

    # Record Audit Log
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "insurance_claim_consent.granted",
        "resource_type": "patient_consent",
        "resource_id": consent_id,
        "metadata": {
            "appointment_id": appointment_id,
            "policy_id": policy["id"],
            "provider_id": policy.get("provider_id"),
            "provider_name": policy.get("provider_name"),
            "authorized_docs_count": len(available_docs),
            "consent_version": payload.consent_version or CLAIM_CONSENT_VERSION,
        },
        "created_at": now,
    })

    return {
        "appointment_id": appointment_id,
        "policy_id": policy["id"],
        "provider_id": policy.get("provider_id"),
        "provider_name": policy.get("provider_name"),
        "consent_type": CLAIM_CONSENT_TYPE,
        "consent_version": payload.consent_version or CLAIM_CONSENT_VERSION,
        "consent_text": CLAIM_CONSENT_TEXT,
        "status": "granted",
        "is_granted": True,
        "consent_id": consent_id,
        "accepted_at": now,
        "withdrawn_at": None,
        "authorized_documents": available_docs,
        "requires_renewal": False,
        "renewal_reason": None,
    }


@router.post("/patient/insurance/appointments/{appointment_id}/claim-consent/withdraw", response_model=ClaimConsentWithdrawResponse)
async def withdraw_appointment_claim_consent(
    appointment_id: str,
    principal: Principal = Depends(require("insurance:write")),
) -> dict[str, Any]:
    """Withdraw insurance data sharing authorization before claim dispatch."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    # Validate appointment ownership
    await _fetch_claim_appointment_context(
        db=db,
        tenant_id=principal.tenant_id,
        appointment_id=appointment_id,
        patient_ids=patient_ids,
        user_id=principal.user_id,
    )

    consent_cursor = db["consents"].find({
        "tenant_id": principal.tenant_id,
        "appointment_id": appointment_id,
        "consent_type": CLAIM_CONSENT_TYPE,
        "status": "granted",
        "$or": [
            {"patient_id": {"$in": patient_ids}},
            {"user_id": principal.user_id},
        ],
    }).sort("created_at", -1)

    active_consent = None
    async for c in consent_cursor:
        active_consent = c
        break

    if not active_consent:
        raise HTTPException(status_code=400, detail="No active insurance data sharing consent found to withdraw")

    now = datetime.now(UTC).isoformat()
    await db["consents"].update_one(
        {"id": active_consent["id"]},
        {"$set": {"status": "withdrawn", "withdrawn_at": now, "updated_at": now}},
    )
    if "patient_consents" in db:
        await db["patient_consents"].update_one(
            {"id": active_consent["id"]},
            {"$set": {"status": "withdrawn", "withdrawn_at": now, "updated_at": now}},
        )
    await db["insurance_claims"].update_many(
        {"tenant_id": principal.tenant_id, "appointment_id": appointment_id},
        {"$set": {"consent_status": "withdrawn", "patient_consented": False, "updated_at": now}},
    )

    # Record Audit Log
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": "insurance_claim_consent.withdrawn",
        "resource_type": "patient_consent",
        "resource_id": active_consent["id"],
        "metadata": {
            "appointment_id": appointment_id,
            "provider_id": active_consent.get("provider_id"),
            "provider_name": active_consent.get("provider_name"),
        },
        "created_at": now,
    })

    return {
        "appointment_id": appointment_id,
        "consent_id": active_consent["id"],
        "status": "withdrawn",
        "withdrawn_at": now,
        "message": "Insurance data sharing authorization has been successfully withdrawn.",
    }


# ==============================================================================
# CHECKPOINT 7: PATIENT INSURANCE CLAIM SUBMISSION & LIFECYCLE ENDPOINTS
# ==============================================================================

CLAIM_STATUS_LABELS = {
    "draft": "Draft Saved",
    "pending_document_verification": "Pending Document Verification",
    "correction_required": "Correction Required",
    "ready_for_submission": "Ready for Submission",
    "verified": "Documents Verified",
    "submitted_to_insurer": "Submitted to Insurer",
    "under_insurer_review": "Under Insurer Review",
    "additional_documents_required": "Additional Documents Required",
    "approved": "Approved",
    "partially_approved": "Partially Approved",
    "rejected": "Rejected",
    "withdrawn": "Claim Withdrawn",
}

REIMBURSEMENT_STATUS_LABELS = {
    "awaiting_reimbursement": "Awaiting Reimbursement",
    "partially_reimbursed": "Partially Reimbursed",
    "fully_reimbursed": "Fully Reimbursed",
}

PAYMENT_METHOD_LABELS = {
    "direct_bank_transfer": "Direct Bank Transfer",
    "neft_rtgs": "NEFT / RTGS",
    "cheque": "Cheque",
    "upi": "UPI",
    "nach_ecs": "NACH / ECS",
    "other": "Other Settlement",
}


def mask_transaction_reference(raw_ref: str) -> str:
    """Mask reimbursement transaction references, keeping only the final 4 characters."""
    if not raw_ref:
        return "TXN-••••••••"
    clean = str(raw_ref).strip()
    if len(clean) <= 4:
        return f"•••• {clean}"
    return f"•••• •••• {clean[-4:]}"


async def _compute_claim_reimbursement_summary(
    db: Any,
    claim: dict[str, Any],
    mask_ref_for_patient: bool = False,
) -> dict[str, Any]:
    """Calculate verified reimbursement statistics and transactions for an approved claim."""
    approved_paise = claim.get("approved_amount_paise")
    if approved_paise is None:
        raw_approved = claim.get("approved_amount") or "0"
        try:
            approved_paise = int(round(float(str(raw_approved).replace("₹", "").replace(",", "").strip()) * 100))
        except Exception:
            approved_paise = 0

    reimbursement_cursor = db["insurance_reimbursements"].find({
        "tenant_id": claim.get("tenant_id"),
        "claim_id": claim.get("id"),
    }).sort("created_at", -1)
    tx_docs = []
    async for tx in reimbursement_cursor:
        tx_docs.append(tx)

    total_reimbursed_paise = sum(int(tx.get("amount_paise") or 0) for tx in tx_docs)
    pending_paise = max(0, approved_paise - total_reimbursed_paise)

    if total_reimbursed_paise == 0:
        status_key = "awaiting_reimbursement"
    elif total_reimbursed_paise < approved_paise:
        status_key = "partially_reimbursed"
    else:
        status_key = "fully_reimbursed"

    status_label = REIMBURSEMENT_STATUS_LABELS[status_key]

    tx_items = []
    for tx in tx_docs:
        payment_ref = tx.get("payment_reference", "")
        masked_ref = mask_transaction_reference(payment_ref)
        method_raw = tx.get("payment_method", "direct_bank_transfer")
        method_label = PAYMENT_METHOD_LABELS.get(method_raw, method_raw.replace("_", " ").title())

        evidence_url = None
        evidence_name = tx.get("supporting_evidence_name")
        evidence_id = tx.get("supporting_evidence_id")
        if evidence_id:
            evidence_url = f"/api/patient/insurance/documents/{evidence_id}/download"

        tx_items.append({
            "id": tx.get("id"),
            "claim_id": tx.get("claim_id"),
            "reimbursement_amount": f"{int(tx.get('amount_paise') or 0) / 100:.2f}",
            "amount_paise": int(tx.get("amount_paise") or 0),
            "currency": tx.get("currency", "INR"),
            "reimbursement_date": tx.get("reimbursement_date", ""),
            "payment_reference": masked_ref if mask_ref_for_patient else payment_ref,
            "payment_reference_masked": masked_ref,
            "payment_method": method_raw,
            "payment_method_label": method_label,
            "supporting_evidence_id": evidence_id,
            "supporting_evidence_name": evidence_name,
            "supporting_evidence_url": evidence_url,
            "notes": tx.get("notes"),
            "created_at": tx.get("created_at", ""),
            "recorded_by": tx.get("recorded_by"),
        })

    last_date = tx_docs[0].get("reimbursement_date") if tx_docs else None

    return {
        "approved_amount_paise": approved_paise,
        "approved_amount": f"{approved_paise / 100:.2f}",
        "reimbursed_amount_paise": total_reimbursed_paise,
        "reimbursed_amount": f"{total_reimbursed_paise / 100:.2f}",
        "pending_reimbursement_amount_paise": pending_paise,
        "pending_reimbursement_amount": f"{pending_paise / 100:.2f}",
        "reimbursement_status": status_key,
        "reimbursement_status_label": status_label,
        "reimbursements_count": len(tx_items),
        "transactions": tx_items,
        "last_reimbursement_date": last_date,
    }


@router.post("/patient/insurance/appointments/{appointment_id}/claim-submit", response_model=ClaimSubmissionResult)
async def submit_or_draft_appointment_claim(
    appointment_id: str,
    payload: ClaimSubmissionRequest,
    principal: Principal = Depends(require("insurance:write")),
) -> dict[str, Any]:
    """Submit a completed appointment reimbursement claim for Clinic Admin verification, or save as Draft.
    Strictly validates prerequisites, mandatory documents completeness, active policy, and data sharing consent."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    # 1. Fetch appointment context & prerequisites
    ctx = await _fetch_claim_appointment_context(
        db=db,
        tenant_id=principal.tenant_id,
        appointment_id=appointment_id,
        patient_ids=patient_ids,
        user_id=principal.user_id,
    )

    if not ctx["payment_verified"]:
        raise HTTPException(status_code=400, detail="Cannot submit claim: Razorpay payment has not been verified")
    if not ctx["is_completed"]:
        raise HTTPException(status_code=400, detail=f"Cannot submit claim: Consultation status is '{ctx['appointment_status']}', must be Completed")
    if not ctx["summary_finalized"]:
        raise HTTPException(status_code=400, detail="Cannot submit claim: Consultation summary has not been finalized by doctor")
    if not ctx["prescription_verified"]:
        raise HTTPException(status_code=400, detail="Cannot submit claim: Issued prescription has not been released yet")

    # 2. Check for existing active (non-withdrawn/rejected) claims
    existing_claims = await db["insurance_claims"].find({
        "tenant_id": principal.tenant_id,
        "appointment_id": appointment_id,
        "status": {"$nin": ["cancelled", "rejected", "withdrawn"]},
    }).to_list(length=10) if hasattr(db["insurance_claims"], "to_list") else []

    if not existing_claims:
        # Fallback query for async cursor / mock cursor
        existing_claims = []
        cursor = db["insurance_claims"].find({
            "tenant_id": principal.tenant_id,
            "appointment_id": appointment_id,
            "status": {"$nin": ["cancelled", "rejected", "withdrawn"]},
        })
        async for c in cursor:
            existing_claims.append(c)

    # If submitting a live claim and an active submitted claim already exists -> Prevent duplicate
    for ex in existing_claims:
        if ex.get("status") not in ["draft", "initiated"]:
            raise HTTPException(
                status_code=409,
                detail=f"An active claim ({ex.get('claim_reference') or ex.get('id')}) is already submitted for this appointment (Status: {ex.get('status')})"
            )

    # 3. Policy validation
    pol_id = payload.policy_id.strip() if payload.policy_id else None
    if not pol_id:
        raise HTTPException(status_code=400, detail="An active insurance policy must be selected")

    policy = await db["insurance_policies"].find_one({
        "tenant_id": principal.tenant_id,
        "id": pol_id,
        "$or": [{"patient_id": {"$in": patient_ids}}, {"user_id": principal.user_id}],
    })
    if not policy and "patient_insurance_policies" in db:
        policy = await db["patient_insurance_policies"].find_one({
            "tenant_id": principal.tenant_id,
            "id": pol_id,
            "$or": [{"patient_id": {"$in": patient_ids}}, {"user_id": principal.user_id}],
        })

    if not policy:
        raise HTTPException(status_code=404, detail="Selected insurance policy not found or does not belong to you")
    if policy.get("status") != "Active":
        raise HTTPException(status_code=400, detail="Selected insurance policy must be Active")

    today_str = datetime.now(UTC).strftime("%Y-%m-%d")
    if policy.get("expiry_date") and policy["expiry_date"] < today_str:
        raise HTTPException(status_code=400, detail="Selected insurance policy has expired")

    # 4. Mandatory Dossier Completeness Check
    dossier = await get_appointment_claim_dossier(
        appointment_id=appointment_id,
        policy_id=policy["id"],
        principal=principal,
    )
    if not payload.save_as_draft and not dossier.get("mandatory_complete"):
        missing = dossier.get("missing_mandatory_titles", [])
        raise HTTPException(
            status_code=422,
            detail=f"Claim submission cannot proceed: Mandatory supporting documents are missing ({', '.join(missing)})"
        )

    # 5. Consent Authorization Check (Required if submitting live claim)
    consent_status = await get_appointment_claim_consent(
        appointment_id=appointment_id,
        policy_id=policy["id"],
        principal=principal,
    )

    if not payload.save_as_draft:
        if not consent_status.get("is_granted"):
            raise HTTPException(
                status_code=422,
                detail="Claim submission requires explicit Insurance Data Sharing Consent to be granted"
            )
        if consent_status.get("requires_renewal"):
            raise HTTPException(
                status_code=422,
                detail=f"Consent renewal required before submission: {consent_status.get('renewal_reason')}"
            )

    # 6. Resolve Patient Profile Details
    patient_doc = await db["patients"].find_one({
        "tenant_id": principal.tenant_id,
        "$or": [{"id": {"$in": patient_ids}}, {"user_id": principal.user_id}],
    })
    patient_name = patient_doc.get("full_name") or patient_doc.get("name") if patient_doc else "Patient"
    patient_phone = patient_doc.get("phone") if patient_doc else None
    patient_email = patient_doc.get("email") if patient_doc else None

    # 7. Formulate Claim Reference and Document Records
    now_dt = datetime.now(UTC)
    now_iso = now_dt.isoformat()
    claim_status = "draft" if payload.save_as_draft else "pending_document_verification"
    status_label = CLAIM_STATUS_LABELS[claim_status]

    # Find existing draft if any to update instead of creating duplicate drafts
    existing_draft = next((c for c in existing_claims if c.get("status") in ["draft", "initiated"]), None)

    if existing_draft:
        claim_id = existing_draft["id"]
        claim_ref = existing_draft.get("claim_reference") or f"KC-CLM-{now_dt.strftime('%Y%m')}-{claim_id[-6:].upper()}"
    else:
        claim_id = f"clm-{uuid4().hex[:12]}"
        claim_ref = f"KC-CLM-{now_dt.strftime('%Y%m')}-{claim_id[-6:].upper()}"

    available_docs = [
        {
            "id": d.id,
            "category": d.category,
            "title": d.title,
            "status": d.status,
            "file_name": d.file_name,
        }
        for d in dossier.get("documents", [])
        if d.status == "Available"
    ]

    if existing_draft:
        final_timeline = list(existing_draft.get("timeline") or [])
        if not payload.save_as_draft:
            final_timeline.append({
                "stage": "submission",
                "status": "pending_document_verification",
                "title": "Submitted for Clinic Admin Verification",
                "description": "Patient finalized dossier and granted data sharing consent. Queued for internal Clinic Admin audit.",
                "occurred_at": now_iso,
                "actor_role": "patient",
            })
    else:
        final_timeline = [
            {
                "stage": "creation",
                "status": "draft",
                "title": "Claim Draft Initialized",
                "description": f"Draft claim created with policy {policy.get('provider_name')}.",
                "occurred_at": now_iso,
                "actor_role": "patient",
            }
        ]
        if not payload.save_as_draft:
            final_timeline.append({
                "stage": "submission",
                "status": "pending_document_verification",
                "title": "Submitted for Clinic Admin Verification",
                "description": "Patient finalized dossier and granted data sharing consent. Queued for internal Clinic Admin audit.",
                "occurred_at": now_iso,
                "actor_role": "patient",
            })

    claim_record = {
        "id": claim_id,
        "claim_reference": claim_ref,
        "tenant_id": principal.tenant_id,
        "patient_id": principal.user_id,
        "user_id": principal.user_id,
        "appointment_id": appointment_id,
        "appointment_display_id": ctx["display_id"],
        "clinic_id": ctx["appointment"].get("clinic_id") or principal.tenant_id,
        "doctor_id": ctx["appointment"].get("doctor_id"),
        "doctor_name": ctx["doctor_name"],
        "specialty": ctx["specialty"],
        "consultation_date": ctx["appointment_date"],
        "patient_name": patient_name,
        "patient_phone": patient_phone,
        "patient_email": patient_email,
        "policy_id": policy["id"],
        "provider_id": policy["provider_id"],
        "provider_name": policy["provider_name"],
        "provider_code": policy.get("provider_code", ""),
        "policy_number_masked": policy.get("policy_number_masked") or mask_policy_number(policy.get("policy_number", "")),
        "policy_holder_name": policy.get("policy_holder_name") or patient_name,
        "relationship": policy.get("relationship", "Self"),
        "member_id": policy.get("member_id"),
        "consultation_fee": ctx["consultation_fee"],
        "fee_paise": ctx["fee_paise"],
        "currency": ctx["currency"],
        "payment_id": ctx["razorpay_payment_id"],
        "payment_status": ctx["payment_status"],
        "consent_id": consent_status.get("consent_id") or f"cst-{uuid4().hex[:8]}",
        "consent_version": consent_status.get("consent_version", "1.0"),
        "consent_accepted_at": consent_status.get("accepted_at") or now_iso,
        "documents": available_docs,
        "notes": payload.notes.strip() if payload.notes else None,
        "status": claim_status,
        "status_label": status_label,
        "timeline": final_timeline,
        "submitted_at": now_iso if not payload.save_as_draft else None,
        "created_at": existing_draft.get("created_at") if existing_draft else now_iso,
        "updated_at": now_iso,
        "is_draft": payload.save_as_draft,
        "submission_token": payload.submission_token,
    }

    if existing_draft:
        await db["insurance_claims"].update_one({"id": claim_id}, {"$set": claim_record})
    else:
        await db["insurance_claims"].insert_one(claim_record)

    # 8. Dispatch Notifications to Patient and Clinic Admin
    if not payload.save_as_draft:
        user_doc = await db["users"].find_one({"id": principal.user_id})
        patient_email = user_doc.get("email") if user_doc else None

        await notify_patient_claim_submitted(
            db,
            tenant_id=principal.tenant_id,
            patient_id=principal.user_id,
            patient_email=patient_email,
            claim_id=claim_id,
            claim_reference=claim_ref,
            appointment_display_id=ctx["display_id"],
            provider_name=policy["provider_name"],
        )

        await notify_admin_new_claim_received(
            db,
            tenant_id=principal.tenant_id,
            claim_id=claim_id,
            claim_reference=claim_ref,
            patient_name=patient_name,
            appointment_display_id=ctx["display_id"],
            provider_name=policy["provider_name"],
        )

    # 9. Audit Logging
    audit_action = "insurance_claim.draft_saved" if payload.save_as_draft else "insurance_claim.submitted"
    await db["audit_logs"].insert_one({
        "id": str(uuid4()),
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "action": audit_action,
        "target_id": claim_id,
        "resource_type": "insurance_claim",
        "resource_id": claim_id,
        "metadata": {
            "claim_reference": claim_ref,
            "appointment_id": appointment_id,
            "policy_id": policy["id"],
            "provider_name": policy["provider_name"],
            "fee_paise": ctx["fee_paise"],
            "status": claim_status,
            "documents_count": len(available_docs),
            "consent_id": claim_record["consent_id"],
        },
        "created_at": now_iso,
    })

    next_step = (
        "Your draft claim has been saved. You can review and submit it at any time."
        if payload.save_as_draft
        else "Your claim is now queued with the Clinic Admin for internal document verification before insurer transmission."
    )

    message = (
        f"Claim draft for consultation {ctx['display_id']} saved successfully."
        if payload.save_as_draft
        else f"Reimbursement claim {claim_ref} submitted successfully and is pending internal clinic verification."
    )

    return {
        "id": claim_id,
        "claim_reference": claim_ref,
        "status": claim_status,
        "status_label": status_label,
        "message": message,
        "submitted_at": claim_record["submitted_at"],
        "is_draft": payload.save_as_draft,
        "next_step": next_step,
    }


@router.get("/patient/insurance/claims", response_model=list[InsuranceClaimItemResponse])
async def list_patient_insurance_claims(
    principal: Principal = Depends(require("insurance:read")),
) -> list[dict[str, Any]]:
    """Retrieve all reimbursement claims submitted by the current patient."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    query = {
        "tenant_id": principal.tenant_id,
        "$or": [
            {"patient_id": {"$in": patient_ids}},
            {"user_id": principal.user_id},
        ],
    }

    claims_cursor = db["insurance_claims"].find(query).sort("created_at", -1)
    results = []
    async for c in claims_cursor:
        status_raw = c.get("status", "pending_document_verification")
        results.append({
            "id": c.get("id"),
            "claim_reference": c.get("claim_reference") or c.get("id"),
            "appointment_id": c.get("appointment_id"),
            "appointment_display_id": c.get("appointment_display_id") or f"KC-APT-{c.get('appointment_id', '')[-6:].upper()}",
            "doctor_name": c.get("doctor_name", "Doctor"),
            "specialty": c.get("specialty", "General"),
            "consultation_date": c.get("consultation_date", c.get("created_at", "")),
            "patient_id": c.get("patient_id") or principal.user_id,
            "patient_name": c.get("patient_name", "Patient"),
            "policy_id": c.get("policy_id", ""),
            "provider_id": c.get("provider_id", ""),
            "provider_name": c.get("provider_name", "Insurance Provider"),
            "policy_number_masked": c.get("policy_number_masked", ""),
            "consultation_fee": c.get("consultation_fee", "INR 0.00"),
            "fee_paise": c.get("fee_paise", 0),
            "currency": c.get("currency", "INR"),
            "status": status_raw,
            "status_label": c.get("status_label") or CLAIM_STATUS_LABELS.get(status_raw, status_raw.replace("_", " ").title()),
            "submitted_at": c.get("submitted_at"),
            "created_at": c.get("created_at", datetime.now(UTC).isoformat()),
            "updated_at": c.get("updated_at", datetime.now(UTC).isoformat()),
            "notes": c.get("notes"),
            "insurer_claim_reference": c.get("insurer_claim_reference"),
            "submitted_to_insurer_at": c.get("submitted_to_insurer_at"),
            "approved_amount": c.get("approved_amount"),
            "reimbursement_status": c.get("reimbursement_status") or ("awaiting_reimbursement" if status_raw in {"approved", "partially_approved"} else None),
            "reimbursement_status_label": c.get("reimbursement_status_label") or (REIMBURSEMENT_STATUS_LABELS.get(c.get("reimbursement_status", "awaiting_reimbursement")) if status_raw in {"approved", "partially_approved"} else None),
            "reimbursed_amount": c.get("reimbursed_amount") or ("0.00" if status_raw in {"approved", "partially_approved"} else None),
            "pending_reimbursement_amount": c.get("pending_reimbursement_amount") or (c.get("approved_amount") if status_raw in {"approved", "partially_approved"} else None),
        })

    return results


@router.get("/patient/insurance/claims/{claim_id}", response_model=InsuranceClaimDetailResponse)
async def get_patient_insurance_claim_detail(
    claim_id: str,
    principal: Principal = Depends(require("insurance:read")),
) -> dict[str, Any]:
    """Retrieve full details, document list, and status timeline for a specific patient insurance claim."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    query = {
        "tenant_id": principal.tenant_id,
        "$or": [
            {"id": claim_id},
            {"claim_reference": claim_id},
        ],
    }

    claim = await db["insurance_claims"].find_one(query)
    if not claim:
        raise HTTPException(status_code=404, detail="Insurance claim not found")

    # Enforce patient ownership and tenant isolation
    claim_patient_id = claim.get("patient_id") or claim.get("user_id")
    if claim_patient_id not in patient_ids and claim_patient_id != principal.user_id:
        raise HTTPException(status_code=404, detail="Insurance claim not found or access denied")

    status_raw = claim.get("status", "pending_document_verification")
    status_label = claim.get("status_label") or CLAIM_STATUS_LABELS.get(status_raw, status_raw.replace("_", " ").title())

    # Build default timeline if missing
    timeline = claim.get("timeline") or []
    if not timeline:
        timeline = [
            {
                "stage": "creation",
                "status": "draft",
                "title": "Claim Record Created",
                "description": f"Claim {claim.get('claim_reference')} initiated for consultation.",
                "occurred_at": claim.get("created_at", datetime.now(UTC).isoformat()),
                "actor_role": "patient",
            }
        ]
        if claim.get("submitted_at"):
            timeline.append({
                "stage": "submission",
                "status": "pending_document_verification",
                "title": "Submitted for Clinic Admin Verification",
                "description": "Patient finalized dossier and granted data sharing consent. Queued for internal Clinic Admin audit.",
                "occurred_at": claim["submitted_at"],
                "actor_role": "patient",
            })

    raw_docs = claim.get("documents") or []
    doc_items = [
        ClaimAuthorizedDocItem(
            id=d.get("id", str(uuid4())),
            category=d.get("category", "document"),
            title=d.get("title", "Clinical Record"),
            status=d.get("status", "Available"),
            file_name=d.get("file_name"),
            verification_status=d.get("verification_status", "pending"),
            verification_remarks=d.get("verification_remarks"),
            download_url=d.get("download_url"),
            preview_url=d.get("preview_url"),
        )
        for d in raw_docs
    ]

    reimb_summary = await _compute_claim_reimbursement_summary(db, claim, mask_ref_for_patient=True)

    return {
        "id": claim.get("id"),
        "claim_reference": claim.get("claim_reference") or claim.get("id"),
        "appointment_id": claim.get("appointment_id"),
        "appointment_display_id": claim.get("appointment_display_id") or f"KC-APT-{claim.get('appointment_id', '')[-6:].upper()}",
        "clinic_id": claim.get("clinic_id") or principal.tenant_id,
        "doctor_name": claim.get("doctor_name", "Doctor"),
        "specialty": claim.get("specialty", "General"),
        "consultation_date": claim.get("consultation_date", claim.get("created_at", "")),
        "patient_id": claim.get("patient_id") or principal.user_id,
        "patient_name": claim.get("patient_name", "Patient"),
        "patient_phone": claim.get("patient_phone"),
        "patient_email": claim.get("patient_email"),
        "policy_id": claim.get("policy_id", ""),
        "provider_id": claim.get("provider_id", ""),
        "provider_name": claim.get("provider_name", "Insurance Provider"),
        "policy_number_masked": claim.get("policy_number_masked", ""),
        "policy_holder_name": claim.get("policy_holder_name", claim.get("patient_name", "Patient")),
        "relationship": claim.get("relationship", "Self"),
        "member_id": claim.get("member_id"),
        "consultation_fee": claim.get("consultation_fee", "INR 0.00"),
        "fee_paise": claim.get("fee_paise", 0),
        "currency": claim.get("currency", "INR"),
        "payment_id": claim.get("payment_id"),
        "payment_status": claim.get("payment_status", "captured"),
        "consent_id": claim.get("consent_id", "N/A"),
        "consent_version": claim.get("consent_version", "1.0"),
        "consent_accepted_at": claim.get("consent_accepted_at", claim.get("created_at", "")),
        "status": status_raw,
        "status_label": status_label,
        "documents": doc_items,
        "timeline": [ClaimTimelineEntry(**t) for t in timeline],
        "notes": claim.get("notes"),
        "submitted_at": claim.get("submitted_at"),
        "reviewer_id": claim.get("reviewer_id"),
        "reviewer_name": claim.get("reviewer_name"),
        "reviewed_at": claim.get("reviewed_at"),
        "verification_remarks": claim.get("verification_remarks"),
        "created_at": claim.get("created_at", datetime.now(UTC).isoformat()),
        "updated_at": claim.get("updated_at", datetime.now(UTC).isoformat()),
        "is_draft": claim.get("is_draft", False),
        "insurer_claim_reference": claim.get("insurer_claim_reference"),
        "submission_method": claim.get("submission_method"),
        "submitted_to_insurer_at": claim.get("submitted_to_insurer_at"),
        "acknowledgment_document": claim.get("acknowledgment_document"),
        "insurer_portal_url": claim.get("insurer_portal_url"),
        "insurer_submission_email": claim.get("insurer_submission_email"),
        "insurer_contact_number": claim.get("insurer_contact_number"),
        "approved_amount": claim.get("approved_amount"),
        "approved_amount_paise": claim.get("approved_amount_paise"),
        "rejection_reason": claim.get("rejection_reason"),
        "co_pay_or_deduction_reason": claim.get("co_pay_or_deduction_reason"),
        "settlement_reference": claim.get("settlement_reference"),
        "requested_documents_reason": claim.get("requested_documents_reason"),
        "evidence_document": claim.get("evidence_document"),
        "reimbursement_status": reimb_summary["reimbursement_status"],
        "reimbursement_status_label": reimb_summary["reimbursement_status_label"],
        "reimbursed_amount": reimb_summary["reimbursed_amount"],
        "reimbursed_amount_paise": reimb_summary["reimbursed_amount_paise"],
        "pending_reimbursement_amount": reimb_summary["pending_reimbursement_amount"],
        "pending_reimbursement_amount_paise": reimb_summary["pending_reimbursement_amount_paise"],
        "reimbursements_count": reimb_summary["reimbursements_count"],
        "reimbursements": reimb_summary["transactions"],
    }


@router.post("/patient/insurance/claims/{claim_id}/resubmit", response_model=PatientClaimResubmitResponse)
async def resubmit_patient_insurance_claim(
    claim_id: str,
    payload: PatientClaimResubmitRequest,
    principal: Principal = Depends(require("insurance:write")),
) -> dict[str, Any]:
    """Allow patient to resubmit an insurance claim after addressing Clinic Admin verification remarks."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    query = {
        "tenant_id": principal.tenant_id,
        "$or": [{"id": claim_id}, {"claim_reference": claim_id}],
    }
    claim = await db["insurance_claims"].find_one(query)
    if not claim:
        raise HTTPException(status_code=404, detail="Insurance claim not found")

    claim_patient_id = claim.get("patient_id") or claim.get("user_id")
    if claim_patient_id not in patient_ids and claim_patient_id != principal.user_id:
        raise HTTPException(status_code=404, detail="Insurance claim not found or access denied")

    if claim.get("status") != "correction_required":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot resubmit claim with status '{claim.get('status')}'. Resubmission is only allowed when status is 'Correction Required'."
        )

    now_iso = datetime.now(UTC).isoformat()
    resubmit_note = payload.notes.strip() if payload.notes and payload.notes.strip() else "Patient addressed requested corrections and resubmitted dossier."

    timeline_entry = {
        "stage": "resubmission",
        "status": "pending_document_verification",
        "title": "Resubmitted with Corrections",
        "description": resubmit_note,
        "occurred_at": now_iso,
        "actor_role": "patient",
    }
    updated_timeline = list(claim.get("timeline") or [])
    updated_timeline.append(timeline_entry)

    # Reset any rejected document verification status back to pending
    updated_docs = []
    for d in claim.get("documents", []):
        d_copy = dict(d)
        if d_copy.get("verification_status") in {"rejected", "needs_correction"}:
            d_copy["verification_status"] = "pending"
        updated_docs.append(d_copy)

    await db["insurance_claims"].update_one(
        {"id": claim["id"]},
        {
            "$set": {
                "status": "pending_document_verification",
                "status_label": CLAIM_STATUS_LABELS["pending_document_verification"],
                "documents": updated_docs,
                "timeline": updated_timeline,
                "updated_at": now_iso,
            },
        }
    )

    # Notify Clinic Admin
    await notify_admin_claim_resubmitted(
        db,
        tenant_id=principal.tenant_id,
        claim_id=claim["id"],
        claim_reference=claim.get("claim_reference") or claim["id"],
        patient_name=claim.get("patient_name", "Patient"),
    )

    # Audit log
    await db["audit_logs"].insert_one({
        "id": f"audit-{uuid4().hex[:12]}",
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "actor_role": "patient",
        "action": "insurance_claim.resubmitted",
        "resource_type": "insurance_claim",
        "resource_id": claim["id"],
        "metadata": {
            "claim_reference": claim.get("claim_reference"),
            "notes": resubmit_note,
        },
        "created_at": now_iso,
    })

    return {
        "id": claim["id"],
        "claim_reference": claim.get("claim_reference") or claim["id"],
        "status": "pending_document_verification",
        "status_label": CLAIM_STATUS_LABELS["pending_document_verification"],
        "message": "Claim has been resubmitted successfully and is now pending Clinic Admin document verification.",
        "resubmitted_at": now_iso,
    }


# ==============================================================================
# CLINIC ADMIN: INSURANCE CLAIM VERIFICATION (CHECKPOINT 8)
# ==============================================================================

@router.get("/clinic-admin/insurance/claims", response_model=ClinicAdminClaimListResponse)
async def list_clinic_admin_insurance_claims(
    search: str | None = None,
    status: str | None = None,
    provider_id: str | None = None,
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=100),
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Retrieve, search, and filter insurance claims for Clinic Admin verification queue with live KPI counts."""
    require_permission(principal, "clinic:insurance:read")
    db = mongo_database.database()

    # Calculate actual database counts for KPIs across the clinic tenant
    stats_data = {
        "total": 0,
        "pending_verification": 0,
        "correction_required": 0,
        "ready_for_submission": 0,
        "submitted_to_insurer": 0,
        "under_insurer_review": 0,
        "additional_documents_required": 0,
        "approved": 0,
        "partially_approved": 0,
        "rejected": 0,
        "draft": 0,
        "awaiting_reimbursement": 0,
        "partially_reimbursed": 0,
        "fully_reimbursed": 0,
    }

    all_claims_cursor = db["insurance_claims"].find({"tenant_id": principal.tenant_id})
    async for c in all_claims_cursor:
        s = c.get("status", "")
        if s == "pending_document_verification":
            stats_data["pending_verification"] += 1
        elif s == "correction_required":
            stats_data["correction_required"] += 1
        elif s == "ready_for_submission":
            stats_data["ready_for_submission"] += 1
        elif s == "submitted_to_insurer":
            stats_data["submitted_to_insurer"] += 1
        elif s == "under_insurer_review":
            stats_data["under_insurer_review"] += 1
        elif s == "additional_documents_required":
            stats_data["additional_documents_required"] += 1
        elif s == "approved":
            stats_data["approved"] += 1
        elif s == "partially_approved":
            stats_data["partially_approved"] += 1
        elif s == "rejected":
            stats_data["rejected"] += 1
        elif s == "draft":
            stats_data["draft"] += 1

        r_stat = c.get("reimbursement_status")
        if not r_stat and s in {"approved", "partially_approved"}:
            r_stat = "awaiting_reimbursement"
        if r_stat == "awaiting_reimbursement":
            stats_data["awaiting_reimbursement"] += 1
        elif r_stat == "partially_reimbursed":
            stats_data["partially_reimbursed"] += 1
        elif r_stat == "fully_reimbursed":
            stats_data["fully_reimbursed"] += 1

        if s != "draft":
            stats_data["total"] += 1

    # Build query
    query: dict[str, Any] = {"tenant_id": principal.tenant_id}
    if status and status.strip() and status != "all":
        query["status"] = status.strip()
    else:
        # Default: show all non-draft submitted claims
        query["status"] = {"$ne": "draft"}

    if provider_id and provider_id.strip() and provider_id != "all":
        query["provider_id"] = provider_id.strip()

    if search and search.strip():
        regex = {"$regex": re.escape(search.strip()), "$options": "i"}
        query["$or"] = [
            {"claim_reference": regex},
            {"patient_name": regex},
            {"doctor_name": regex},
            {"provider_name": regex},
            {"policy_number_masked": regex},
            {"appointment_display_id": regex},
        ]

    page_int = getattr(page, "default", page)
    try:
        page_int = int(page_int)
    except (TypeError, ValueError):
        page_int = 1

    limit_int = getattr(limit, "default", limit)
    try:
        limit_int = int(limit_int)
    except (TypeError, ValueError):
        limit_int = 10

    # Sort and paginate
    claims_cursor = db["insurance_claims"].find(query).sort("submitted_at", -1)
    matching_claims = []
    async for c in claims_cursor:
        matching_claims.append(c)

    total_matching = len(matching_claims)
    total_pages = max(1, math.ceil(total_matching / limit_int))
    offset = (page_int - 1) * limit_int
    paginated_slice = matching_claims[offset : offset + limit_int]

    items = []
    for c in paginated_slice:
        s_raw = c.get("status", "pending_document_verification")
        items.append({
            "id": c.get("id"),
            "claim_reference": c.get("claim_reference") or c.get("id"),
            "appointment_id": c.get("appointment_id"),
            "appointment_display_id": c.get("appointment_display_id") or f"KC-APT-{c.get('appointment_id', '')[-6:].upper()}",
            "doctor_name": c.get("doctor_name", "Doctor"),
            "specialty": c.get("specialty", "General"),
            "consultation_date": c.get("consultation_date", c.get("created_at", "")),
            "patient_id": c.get("patient_id", ""),
            "patient_name": c.get("patient_name", "Patient"),
            "patient_phone": c.get("patient_phone"),
            "patient_email": c.get("patient_email"),
            "policy_id": c.get("policy_id", ""),
            "provider_id": c.get("provider_id", ""),
            "provider_name": c.get("provider_name", "Insurance Provider"),
            "policy_number_masked": c.get("policy_number_masked", ""),
            "consultation_fee": c.get("consultation_fee", "INR 0.00"),
            "fee_paise": c.get("fee_paise", 0),
            "currency": c.get("currency", "INR"),
            "status": s_raw,
            "status_label": c.get("status_label") or CLAIM_STATUS_LABELS.get(s_raw, s_raw.replace("_", " ").title()),
            "submitted_at": c.get("submitted_at"),
            "created_at": c.get("created_at", datetime.now(UTC).isoformat()),
            "updated_at": c.get("updated_at", datetime.now(UTC).isoformat()),
            "reviewer_id": c.get("reviewer_id"),
            "reviewer_name": c.get("reviewer_name"),
            "reviewed_at": c.get("reviewed_at"),
            "verification_remarks": c.get("verification_remarks"),
            "documents_count": len(c.get("documents", [])),
            "notes": c.get("notes"),
            "insurer_claim_reference": c.get("insurer_claim_reference"),
            "submission_method": c.get("submission_method"),
            "submitted_to_insurer_at": c.get("submitted_to_insurer_at"),
            "approved_amount": c.get("approved_amount"),
            "reimbursement_status": c.get("reimbursement_status") or ("awaiting_reimbursement" if s_raw in {"approved", "partially_approved"} else None),
            "reimbursement_status_label": c.get("reimbursement_status_label") or (REIMBURSEMENT_STATUS_LABELS.get(c.get("reimbursement_status", "awaiting_reimbursement")) if s_raw in {"approved", "partially_approved"} else None),
            "reimbursed_amount": c.get("reimbursed_amount") or ("0.00" if s_raw in {"approved", "partially_approved"} else None),
            "pending_reimbursement_amount": c.get("pending_reimbursement_amount") or (c.get("approved_amount") if s_raw in {"approved", "partially_approved"} else None),
        })

    return {
        "items": items,
        "total": total_matching,
        "page": page_int,
        "limit": limit_int,
        "total_pages": total_pages,
        "stats": stats_data,
    }


@router.get("/clinic-admin/insurance/claims/{claim_id}", response_model=InsuranceClaimDetailResponse)
async def get_clinic_admin_insurance_claim_detail(
    claim_id: str,
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Retrieve complete claim dossier details, clinical outputs, payment confirmation, and status history for Clinic Admin verification."""
    require_permission(principal, "clinic:insurance:read")
    db = mongo_database.database()

    query = {
        "tenant_id": principal.tenant_id,
        "$or": [{"id": claim_id}, {"claim_reference": claim_id}],
    }
    claim = await db["insurance_claims"].find_one(query)
    if not claim:
        raise HTTPException(status_code=404, detail="Insurance claim not found")

    status_raw = claim.get("status", "pending_document_verification")
    status_label = claim.get("status_label") or CLAIM_STATUS_LABELS.get(status_raw, status_raw.replace("_", " ").title())

    timeline = claim.get("timeline") or []
    if not timeline:
        timeline = [
            {
                "stage": "creation",
                "status": "draft",
                "title": "Claim Record Created",
                "description": f"Claim {claim.get('claim_reference')} initiated for consultation.",
                "occurred_at": claim.get("created_at", datetime.now(UTC).isoformat()),
                "actor_role": "patient",
            }
        ]
        if claim.get("submitted_at"):
            timeline.append({
                "stage": "submission",
                "status": "pending_document_verification",
                "title": "Submitted for Clinic Admin Verification",
                "description": "Patient finalized dossier and granted data sharing consent. Queued for internal Clinic Admin audit.",
                "occurred_at": claim["submitted_at"],
                "actor_role": "patient",
            })

    raw_docs = claim.get("documents") or []
    doc_items = [
        ClaimAuthorizedDocItem(
            id=d.get("id", str(uuid4())),
            category=d.get("category", "document"),
            title=d.get("title", "Clinical Record"),
            status=d.get("status", "Available"),
            file_name=d.get("file_name"),
            verification_status=d.get("verification_status", "pending"),
            verification_remarks=d.get("verification_remarks"),
            download_url=d.get("download_url"),
            preview_url=d.get("preview_url"),
        )
        for d in raw_docs
    ]

    provider = None
    if claim.get("provider_id"):
        provider = await db["insurance_providers"].find_one({"id": claim["provider_id"]})
    if not provider and claim.get("provider_name"):
        provider = await db["insurance_providers"].find_one({"provider_name": claim["provider_name"]})

    reimb_summary = await _compute_claim_reimbursement_summary(db, claim, mask_ref_for_patient=False)

    return {
        "id": claim.get("id"),
        "claim_reference": claim.get("claim_reference") or claim.get("id"),
        "appointment_id": claim.get("appointment_id"),
        "appointment_display_id": claim.get("appointment_display_id") or f"KC-APT-{claim.get('appointment_id', '')[-6:].upper()}",
        "clinic_id": claim.get("clinic_id") or principal.tenant_id,
        "doctor_name": claim.get("doctor_name", "Doctor"),
        "specialty": claim.get("specialty", "General"),
        "consultation_date": claim.get("consultation_date", claim.get("created_at", "")),
        "patient_id": claim.get("patient_id", ""),
        "patient_name": claim.get("patient_name", "Patient"),
        "patient_phone": claim.get("patient_phone"),
        "patient_email": claim.get("patient_email"),
        "policy_id": claim.get("policy_id", ""),
        "provider_id": claim.get("provider_id", ""),
        "provider_name": claim.get("provider_name", "Insurance Provider"),
        "policy_number_masked": claim.get("policy_number_masked", ""),
        "policy_holder_name": claim.get("policy_holder_name", claim.get("patient_name", "Patient")),
        "relationship": claim.get("relationship", "Self"),
        "member_id": claim.get("member_id"),
        "consultation_fee": claim.get("consultation_fee", "INR 0.00"),
        "fee_paise": claim.get("fee_paise", 0),
        "currency": claim.get("currency", "INR"),
        "payment_id": claim.get("payment_id"),
        "payment_status": claim.get("payment_status", "captured"),
        "consent_id": claim.get("consent_id", "N/A"),
        "consent_version": claim.get("consent_version", "1.0"),
        "consent_accepted_at": claim.get("consent_accepted_at", claim.get("created_at", "")),
        "status": status_raw,
        "status_label": status_label,
        "documents": doc_items,
        "timeline": [ClaimTimelineEntry(**t) for t in timeline],
        "notes": claim.get("notes"),
        "submitted_at": claim.get("submitted_at"),
        "reviewer_id": claim.get("reviewer_id"),
        "reviewer_name": claim.get("reviewer_name"),
        "reviewed_at": claim.get("reviewed_at"),
        "verification_remarks": claim.get("verification_remarks"),
        "created_at": claim.get("created_at", datetime.now(UTC).isoformat()),
        "updated_at": claim.get("updated_at", datetime.now(UTC).isoformat()),
        "is_draft": claim.get("is_draft", False),
        "insurer_claim_reference": claim.get("insurer_claim_reference"),
        "submission_method": claim.get("submission_method"),
        "submitted_to_insurer_at": claim.get("submitted_to_insurer_at"),
        "acknowledgment_document": claim.get("acknowledgment_document"),
        "insurer_portal_url": claim.get("insurer_portal_url") or (provider.get("claim_submission_portal_url") if provider else None),
        "insurer_submission_email": claim.get("insurer_submission_email") or (provider.get("claim_submission_email") if provider else None),
        "insurer_contact_number": claim.get("insurer_contact_number") or (provider.get("contact_number") if provider else None),
        "approved_amount": claim.get("approved_amount"),
        "approved_amount_paise": claim.get("approved_amount_paise"),
        "rejection_reason": claim.get("rejection_reason"),
        "co_pay_or_deduction_reason": claim.get("co_pay_or_deduction_reason"),
        "settlement_reference": claim.get("settlement_reference"),
        "requested_documents_reason": claim.get("requested_documents_reason"),
        "evidence_document": claim.get("evidence_document"),
        "reimbursement_status": reimb_summary["reimbursement_status"],
        "reimbursement_status_label": reimb_summary["reimbursement_status_label"],
        "reimbursed_amount": reimb_summary["reimbursed_amount"],
        "reimbursed_amount_paise": reimb_summary["reimbursed_amount_paise"],
        "pending_reimbursement_amount": reimb_summary["pending_reimbursement_amount"],
        "pending_reimbursement_amount_paise": reimb_summary["pending_reimbursement_amount_paise"],
        "reimbursements_count": reimb_summary["reimbursements_count"],
        "reimbursements": reimb_summary["transactions"],
    }


@router.post("/clinic-admin/insurance/claims/{claim_id}/verify", response_model=ClinicAdminClaimVerifyResponse)
async def verify_clinic_admin_insurance_claim(
    claim_id: str,
    payload: ClinicAdminClaimVerifyRequest,
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Execute Clinic Admin document verification decision.
    Options:
    - 'request_correction': Flags documents and sets claim status to 'correction_required' with mandatory remarks.
    - 'mark_ready': Validates completeness and marks claim as 'ready_for_submission' for insurer submission.
    """
    require_permission(principal, "clinic:insurance:write")
    db = mongo_database.database()

    query = {
        "tenant_id": principal.tenant_id,
        "$or": [{"id": claim_id}, {"claim_reference": claim_id}],
    }
    claim = await db["insurance_claims"].find_one(query)
    if not claim:
        raise HTTPException(status_code=404, detail="Insurance claim not found")

    current_status = claim.get("status", "")
    if current_status not in {"pending_document_verification", "correction_required"}:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot verify claim with status '{current_status}'. Verification is only allowed for 'Pending Document Verification' or 'Correction Required' claims."
        )

    now_iso = datetime.now(UTC).isoformat()
    claim_ref = claim.get("claim_reference") or claim["id"]
    patient_id = claim.get("patient_id") or claim.get("user_id")

    # Build document decisions map
    decisions_by_doc_id = {d.document_id: d for d in payload.document_decisions}

    if payload.action == "request_correction":
        if not payload.remarks or not payload.remarks.strip():
            raise HTTPException(
                status_code=422,
                detail="Correction remarks are mandatory when requesting claim corrections."
            )

        correction_remarks = payload.remarks.strip()
        new_status = "correction_required"
        new_label = CLAIM_STATUS_LABELS["correction_required"]

        # Update document verification statuses
        updated_docs = []
        for d in claim.get("documents", []):
            d_copy = dict(d)
            if d_copy.get("id") in decisions_by_doc_id:
                dec = decisions_by_doc_id[d_copy["id"]]
                d_copy["verification_status"] = dec.status
                d_copy["verification_remarks"] = dec.remarks
            updated_docs.append(d_copy)

        timeline_entry = {
            "stage": "correction_requested",
            "status": new_status,
            "title": "Correction Requested by Clinic Admin",
            "description": correction_remarks,
            "occurred_at": now_iso,
            "actor_role": "clinic_admin",
        }
        updated_timeline = list(claim.get("timeline") or [])
        updated_timeline.append(timeline_entry)

        await db["insurance_claims"].update_one(
            {"id": claim["id"]},
            {
                "$set": {
                    "status": new_status,
                    "status_label": new_label,
                    "reviewer_id": principal.user_id,
                    "reviewer_name": "Clinic Administrator",
                    "reviewed_at": now_iso,
                    "verification_remarks": correction_remarks,
                    "documents": updated_docs,
                    "timeline": updated_timeline,
                    "updated_at": now_iso,
                },
            }
        )

        # Notify patient of correction required
        await notify_patient_claim_correction_required(
            db,
            tenant_id=principal.tenant_id,
            patient_id=patient_id,
            claim_id=claim["id"],
            claim_reference=claim_ref,
            remarks=correction_remarks,
        )

        # Audit log
        await db["audit_logs"].insert_one({
            "id": f"audit-{uuid4().hex[:12]}",
            "tenant_id": principal.tenant_id,
            "actor_id": principal.user_id,
            "actor_role": "clinic_admin",
            "action": "insurance_claim.correction_requested",
            "resource_type": "insurance_claim",
            "resource_id": claim["id"],
            "metadata": {
                "claim_reference": claim_ref,
                "remarks": correction_remarks,
            },
            "created_at": now_iso,
        })

        return {
            "id": claim["id"],
            "claim_reference": claim_ref,
            "status": new_status,
            "status_label": new_label,
            "message": "Claim status updated to Correction Required. The patient has been notified to make adjustments.",
            "reviewer_id": principal.user_id,
            "reviewed_at": now_iso,
            "verification_remarks": correction_remarks,
            "timeline_entry": ClaimTimelineEntry(**timeline_entry),
        }

    elif payload.action == "mark_ready":
        # Check if any document was marked rejected in payload
        if any(d.status == "rejected" for d in payload.document_decisions):
            raise HTTPException(
                status_code=422,
                detail="Cannot mark claim as Ready for Submission while one or more documents are marked rejected. Please request corrections instead."
            )

        verification_remarks = payload.remarks.strip() if payload.remarks and payload.remarks.strip() else "All clinical and financial records verified by Clinic Admin. Ready for insurer submission."
        new_status = "ready_for_submission"
        new_label = CLAIM_STATUS_LABELS["ready_for_submission"]

        # Mark all documents as verified unless specified
        updated_docs = []
        for d in claim.get("documents", []):
            d_copy = dict(d)
            if d_copy.get("id") in decisions_by_doc_id:
                dec = decisions_by_doc_id[d_copy["id"]]
                d_copy["verification_status"] = dec.status
                d_copy["verification_remarks"] = dec.remarks
            else:
                d_copy["verification_status"] = "verified"
            updated_docs.append(d_copy)

        timeline_entry = {
            "stage": "verification",
            "status": new_status,
            "title": "Verified & Ready for Submission",
            "description": verification_remarks,
            "occurred_at": now_iso,
            "actor_role": "clinic_admin",
        }
        updated_timeline = list(claim.get("timeline") or [])
        updated_timeline.append(timeline_entry)

        await db["insurance_claims"].update_one(
            {"id": claim["id"]},
            {
                "$set": {
                    "status": new_status,
                    "status_label": new_label,
                    "reviewer_id": principal.user_id,
                    "reviewer_name": "Clinic Administrator",
                    "reviewed_at": now_iso,
                    "verification_remarks": verification_remarks,
                    "documents": updated_docs,
                    "timeline": updated_timeline,
                    "updated_at": now_iso,
                },
            }
        )

        # Notify patient and admin
        await notify_patient_claim_verified(
            db,
            tenant_id=principal.tenant_id,
            patient_id=patient_id,
            claim_id=claim["id"],
            claim_reference=claim_ref,
            provider_name=claim.get("provider_name", "Insurer"),
        )
        await notify_admin_verified_claim_pending_submission(
            db,
            tenant_id=principal.tenant_id,
            claim_id=claim["id"],
            claim_reference=claim_ref,
            provider_name=claim.get("provider_name", "Insurer"),
        )

        # Audit log
        await db["audit_logs"].insert_one({
            "id": f"audit-{uuid4().hex[:12]}",
            "tenant_id": principal.tenant_id,
            "actor_id": principal.user_id,
            "actor_role": "clinic_admin",
            "action": "insurance_claim.verified",
            "resource_type": "insurance_claim",
            "resource_id": claim["id"],
            "metadata": {
                "claim_reference": claim_ref,
                "remarks": verification_remarks,
            },
            "created_at": now_iso,
        })

        return {
            "id": claim["id"],
            "claim_reference": claim_ref,
            "status": new_status,
            "status_label": new_label,
            "message": "Claim successfully verified and marked Ready for Submission.",
            "reviewer_id": principal.user_id,
            "reviewed_at": now_iso,
            "verification_remarks": verification_remarks,
            "timeline_entry": ClaimTimelineEntry(**timeline_entry),
        }

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported verification action: '{payload.action}'")


# ==============================================================================
# CHECKPOINT 9: INSURER SUBMISSION & CLAIM STATUS TRACKING ENDPOINTS
# ==============================================================================

@router.get("/clinic-admin/insurance/claims/{claim_id}/document-package", response_model=ClaimDocumentPackageResponse)
async def get_clinic_admin_claim_document_package(
    claim_id: str,
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Retrieve the authorized clinical and financial document package for external insurer transmission.
    Strictly verifies active patient data sharing consent before releasing records."""
    require_permission(principal, "clinic:insurance:read")
    db = mongo_database.database()

    query = {
        "tenant_id": principal.tenant_id,
        "$or": [{"id": claim_id}, {"claim_reference": claim_id}],
    }
    claim = await db["insurance_claims"].find_one(query)
    if not claim:
        raise HTTPException(status_code=404, detail="Insurance claim not found")

    # Validate active patient consent
    consent_status = claim.get("consent_status", "granted")
    patient_consented = claim.get("patient_consented", True)

    consent_id = claim.get("consent_id")
    if consent_id and consent_id != "N/A":
        consent_record = await db["consents"].find_one({"id": consent_id, "tenant_id": principal.tenant_id})
        if not consent_record and "patient_consents" in db:
            consent_record = await db["patient_consents"].find_one({"id": consent_id, "tenant_id": principal.tenant_id})
        if consent_record:
            consent_status = consent_record.get("status", consent_status)

    if consent_status != "granted" or not patient_consented:
        raise HTTPException(
            status_code=403,
            detail="Patient data sharing consent is not active or has been withdrawn. Authorized documents cannot be released."
        )

    # Fetch provider master details
    provider_id = claim.get("provider_id")
    provider = await db["insurance_providers"].find_one({"id": provider_id, "tenant_id": principal.tenant_id})
    if not provider:
        provider = await db["insurance_providers"].find_one({"provider_name": claim.get("provider_name")})

    provider_info = {
        "id": provider.get("id") if provider else (provider_id or ""),
        "provider_name": provider.get("provider_name") if provider else claim.get("provider_name", "Insurance Provider"),
        "provider_code": provider.get("provider_code") if provider else "INS",
        "provider_type": provider.get("provider_type") if provider else "Insurance Company",
        "country": provider.get("country") if provider else "India",
        "claim_submission_portal_url": provider.get("claim_submission_portal_url") if provider else None,
        "claim_submission_email": provider.get("claim_submission_email") if provider else None,
        "contact_number": provider.get("contact_number") if provider else None,
        "official_website": provider.get("official_website") if provider else None,
    }

    raw_docs = claim.get("documents") or []
    doc_items = [
        ClaimAuthorizedDocItem(
            id=d.get("id", str(uuid4())),
            category=d.get("category", "document"),
            title=d.get("title", "Clinical Record"),
            status=d.get("status", "Available"),
            file_name=d.get("file_name"),
            verification_status=d.get("verification_status", "verified"),
            verification_remarks=d.get("verification_remarks"),
            download_url=d.get("download_url"),
            preview_url=d.get("preview_url"),
        )
        for d in raw_docs
    ]

    now_iso = datetime.now(UTC).isoformat()
    return {
        "claim_id": claim.get("id"),
        "claim_reference": claim.get("claim_reference") or claim.get("id"),
        "appointment_id": claim.get("appointment_id", ""),
        "appointment_display_id": claim.get("appointment_display_id") or f"KC-APT-{claim.get('appointment_id', '')[-6:].upper()}",
        "patient_id": claim.get("patient_id", ""),
        "patient_name": claim.get("patient_name", "Patient"),
        "policy_id": claim.get("policy_id", ""),
        "provider_name": claim.get("provider_name", "Insurance Provider"),
        "policy_number_masked": claim.get("policy_number_masked", ""),
        "consent_id": claim.get("consent_id", "N/A"),
        "consent_status": consent_status,
        "consent_verified": True,
        "provider_info": provider_info,
        "documents": doc_items,
        "package_generated_at": now_iso,
        "total_documents": len(doc_items),
    }


@router.post("/clinic-admin/insurance/claims/{claim_id}/submit-to-insurer", response_model=SubmitToInsurerResponse)
async def submit_claim_to_insurer(
    claim_id: str,
    payload: SubmitToInsurerRequest,
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Record manual transmission of authorized claim dossier to external insurer's official channel.
    Enforces active patient consent, verified status, and mandatory insurer acknowledgment reference."""
    require_permission(principal, "clinic:insurance:write")
    db = mongo_database.database()

    query = {
        "tenant_id": principal.tenant_id,
        "$or": [{"id": claim_id}, {"claim_reference": claim_id}],
    }
    claim = await db["insurance_claims"].find_one(query)
    if not claim:
        raise HTTPException(status_code=404, detail="Insurance claim not found")

    current_status = claim.get("status", "")

    # Prevent duplicate external submission
    if current_status in {"submitted_to_insurer", "under_insurer_review", "approved", "partially_approved", "rejected"}:
        existing_ref = claim.get("insurer_claim_reference") or "On File"
        raise HTTPException(
            status_code=400,
            detail=f"Claim has already been submitted to insurer (Insurer Ref: {existing_ref}, Status: {claim.get('status_label') or current_status}). Duplicate submissions are prohibited."
        )

    if current_status not in {"ready_for_submission", "additional_documents_required"}:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot submit claim with status '{current_status}'. Claim must be verified and marked 'Ready for Submission' by Clinic Admin first."
        )

    # Validate active patient consent
    consent_status = claim.get("consent_status", "granted")
    patient_consented = claim.get("patient_consented", True)
    if consent_status != "granted" or not patient_consented:
        raise HTTPException(
            status_code=403,
            detail="Patient data sharing consent is not active or has been withdrawn. Transmission to insurer is forbidden without active patient consent."
        )

    now_iso = datetime.now(UTC).isoformat()
    submission_date_str = payload.submission_date.strip() if payload.submission_date and payload.submission_date.strip() else now_iso
    insurer_ref = payload.insurer_claim_reference.strip()
    claim_ref = claim.get("claim_reference") or claim["id"]
    patient_id = claim.get("patient_id") or claim.get("user_id")
    provider_name = claim.get("provider_name", "Insurance Provider")

    new_status = "submitted_to_insurer"
    new_label = CLAIM_STATUS_LABELS["submitted_to_insurer"]

    timeline_entry = {
        "stage": "insurer_transmission",
        "status": new_status,
        "title": "Submitted to Insurer",
        "description": f"Authorized claim package transmitted to {provider_name} via {payload.submission_method.replace('_', ' ').title()}. Insurer Claim Reference: {insurer_ref}." + (f" Notes: {payload.notes.strip()}" if payload.notes and payload.notes.strip() else ""),
        "occurred_at": now_iso,
        "actor_role": "clinic_admin",
    }
    updated_timeline = list(claim.get("timeline") or [])
    updated_timeline.append(timeline_entry)

    await db["insurance_claims"].update_one(
        {"id": claim["id"]},
        {
            "$set": {
                "status": new_status,
                "status_label": new_label,
                "insurer_claim_reference": insurer_ref,
                "submission_method": payload.submission_method,
                "submitted_to_insurer_at": submission_date_str,
                "acknowledgment_document": payload.acknowledgment_document.strip() if payload.acknowledgment_document else None,
                "submission_notes": payload.notes.strip() if payload.notes else None,
                "timeline": updated_timeline,
                "updated_at": now_iso,
            }
        }
    )

    # Notify patient
    await notify_patient_claim_submitted_to_insurer(
        db,
        tenant_id=principal.tenant_id,
        patient_id=patient_id,
        claim_id=claim["id"],
        claim_reference=claim_ref,
        provider_name=provider_name,
        insurer_claim_reference=insurer_ref,
        submission_method=payload.submission_method,
    )

    # Audit log
    await db["audit_logs"].insert_one({
        "id": f"audit-{uuid4().hex[:12]}",
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "actor_role": "clinic_admin",
        "action": "insurance_claim.submitted_to_insurer",
        "resource_type": "insurance_claim",
        "resource_id": claim["id"],
        "metadata": {
            "claim_reference": claim_ref,
            "insurer_claim_reference": insurer_ref,
            "submission_method": payload.submission_method,
        },
        "created_at": now_iso,
    })

    return {
        "id": claim["id"],
        "claim_reference": claim_ref,
        "status": new_status,
        "status_label": new_label,
        "insurer_claim_reference": insurer_ref,
        "submission_method": payload.submission_method,
        "submitted_to_insurer_at": submission_date_str,
        "message": f"Claim {claim_ref} successfully transmitted to {provider_name} with Insurer Reference #{insurer_ref}.",
        "timeline_entry": ClaimTimelineEntry(**timeline_entry),
    }


@router.post("/clinic-admin/insurance/claims/{claim_id}/insurer-status", response_model=InsurerStatusUpdateResponse)
async def update_insurer_claim_status(
    claim_id: str,
    payload: InsurerStatusUpdateRequest,
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Record an official insurer status update with required evidence and adjudication details.
    Strictly prohibits automatic reimbursement or fake approvals; requires actual settlement/rejection references."""
    require_permission(principal, "clinic:insurance:write")
    db = mongo_database.database()

    query = {
        "tenant_id": principal.tenant_id,
        "$or": [{"id": claim_id}, {"claim_reference": claim_id}],
    }
    claim = await db["insurance_claims"].find_one(query)
    if not claim:
        raise HTTPException(status_code=404, detail="Insurance claim not found")

    current_status = claim.get("status", "")

    # Must have been submitted to insurer first
    if current_status not in {"submitted_to_insurer", "under_insurer_review", "additional_documents_required", "approved", "partially_approved", "rejected"}:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot record insurer status for claim with status '{current_status}'. Claim must be submitted to insurer first."
        )

    target_status = payload.status
    now_iso = datetime.now(UTC).isoformat()
    claim_ref = claim.get("claim_reference") or claim["id"]
    patient_id = claim.get("patient_id") or claim.get("user_id")
    provider_name = claim.get("provider_name", "Insurance Provider")
    insurer_ref = claim.get("insurer_claim_reference", "N/A")

    update_fields: dict[str, Any] = {
        "status": target_status,
        "status_label": CLAIM_STATUS_LABELS[target_status],
        "updated_at": now_iso,
    }

    if target_status == "under_insurer_review":
        title = "Under Insurer Review"
        desc = f"{provider_name} acknowledged claim #{insurer_ref}; currently under coverage review."
        if payload.notes and payload.notes.strip():
            desc += f" Remarks: {payload.notes.strip()}"

    elif target_status == "additional_documents_required":
        if not payload.requested_documents or not payload.requested_documents.strip():
            raise HTTPException(
                status_code=422,
                detail="Details of requested documents or insurer query are mandatory when marking Additional Documents Required."
            )
        req_docs = payload.requested_documents.strip()
        update_fields["requested_documents_reason"] = req_docs
        title = "Additional Documents Requested by Insurer"
        desc = f"{provider_name} requested additional evidence: {req_docs}"

    elif target_status == "approved":
        if not payload.approved_amount or not payload.approved_amount.strip():
            raise HTTPException(
                status_code=422,
                detail="Approved amount is mandatory when recording claim approval."
            )
        if not payload.settlement_reference or not payload.settlement_reference.strip():
            raise HTTPException(
                status_code=422,
                detail="Insurer settlement reference/letter is mandatory when recording claim approval."
            )
        update_fields["approved_amount"] = payload.approved_amount.strip()
        if payload.approved_amount_paise is not None:
            update_fields["approved_amount_paise"] = payload.approved_amount_paise
        update_fields["settlement_reference"] = payload.settlement_reference.strip()
        if payload.evidence_document:
            update_fields["evidence_document"] = payload.evidence_document.strip()
        title = "Claim Approved by Insurer"
        desc = f"{provider_name} approved reimbursement claim for {payload.approved_amount.strip()}. Settlement Ref: {payload.settlement_reference.strip()}."

    elif target_status == "partially_approved":
        if not payload.approved_amount or not payload.approved_amount.strip():
            raise HTTPException(
                status_code=422,
                detail="Approved amount is mandatory when recording partial claim approval."
            )
        if not payload.co_pay_or_deduction_reason or not payload.co_pay_or_deduction_reason.strip():
            raise HTTPException(
                status_code=422,
                detail="Co-pay or deduction reason is mandatory when recording partial claim approval."
            )
        if not payload.settlement_reference or not payload.settlement_reference.strip():
            raise HTTPException(
                status_code=422,
                detail="Insurer settlement reference/letter is mandatory when recording partial claim approval."
            )
        update_fields["approved_amount"] = payload.approved_amount.strip()
        if payload.approved_amount_paise is not None:
            update_fields["approved_amount_paise"] = payload.approved_amount_paise
        update_fields["co_pay_or_deduction_reason"] = payload.co_pay_or_deduction_reason.strip()
        update_fields["settlement_reference"] = payload.settlement_reference.strip()
        if payload.evidence_document:
            update_fields["evidence_document"] = payload.evidence_document.strip()
        title = "Claim Partially Approved by Insurer"
        desc = f"{provider_name} partially approved claim for {payload.approved_amount.strip()}. Deduction: {payload.co_pay_or_deduction_reason.strip()}. Settlement Ref: {payload.settlement_reference.strip()}."

    elif target_status == "rejected":
        if not payload.rejection_reason or not payload.rejection_reason.strip():
            raise HTTPException(
                status_code=422,
                detail="Rejection reason is mandatory when recording claim rejection."
            )
        if not payload.settlement_reference or not payload.settlement_reference.strip():
            raise HTTPException(
                status_code=422,
                detail="Insurer rejection letter / notice reference is mandatory when recording claim rejection."
            )
        update_fields["rejection_reason"] = payload.rejection_reason.strip()
        update_fields["settlement_reference"] = payload.settlement_reference.strip()
        if payload.evidence_document:
            update_fields["evidence_document"] = payload.evidence_document.strip()
        title = "Claim Rejected by Insurer"
        desc = f"{provider_name} rejected claim. Reason: {payload.rejection_reason.strip()}. Notice Ref: {payload.settlement_reference.strip()}."

    else:
        raise HTTPException(status_code=400, detail=f"Unsupported status update: '{target_status}'")

    if payload.notes and payload.notes.strip():
        update_fields["notes"] = payload.notes.strip()

    timeline_entry = {
        "stage": f"insurer_{target_status}",
        "status": target_status,
        "title": title,
        "description": desc,
        "occurred_at": now_iso,
        "actor_role": "clinic_admin",
    }
    updated_timeline = list(claim.get("timeline") or [])
    updated_timeline.append(timeline_entry)
    update_fields["timeline"] = updated_timeline

    await db["insurance_claims"].update_one(
        {"id": claim["id"]},
        {"$set": update_fields}
    )

    # Notify patient & clinic admin
    patient_email = None
    user_doc = await db["users"].find_one({"id": patient_id})
    if user_doc and user_doc.get("email"):
        patient_email = user_doc["email"]

    if target_status == "additional_documents_required":
        await notify_patient_additional_documents_requested(
            db,
            tenant_id=principal.tenant_id,
            patient_id=patient_id,
            patient_email=patient_email,
            claim_id=claim["id"],
            claim_reference=claim_ref,
            provider_name=provider_name,
            requested_documents=payload.requested_documents or "Additional supporting evidence requested by insurer",
        )
    elif target_status in ("approved", "partially_approved", "rejected"):
        approved_amt_str = str(payload.approved_amount).replace("₹", "").strip() if payload.approved_amount is not None else None
        await notify_patient_claim_adjudicated(
            db,
            tenant_id=principal.tenant_id,
            patient_id=patient_id,
            patient_email=patient_email,
            claim_id=claim["id"],
            claim_reference=claim_ref,
            provider_name=provider_name,
            adjudication_status=target_status,
            approved_amount=approved_amt_str,
            co_pay_reason=getattr(payload, "co_pay_or_deduction_reason", None) or getattr(payload, "co_pay_reason", None),
            rejection_reason=payload.rejection_reason,
            settlement_reference=payload.settlement_reference,
        )
        if target_status in ("approved", "partially_approved") and approved_amt_str:
            await notify_admin_approved_awaiting_reimbursement(
                db,
                tenant_id=principal.tenant_id,
                claim_id=claim["id"],
                claim_reference=claim_ref,
                provider_name=provider_name,
                approved_amount=approved_amt_str,
            )
    else:
        await send_insurance_notification(
            db,
            tenant_id=principal.tenant_id,
            recipient_id=patient_id,
            recipient_role="patient",
            recipient_email=patient_email,
            event_type=f"insurance_claim_{target_status}",
            subject=f"Claim Status Update: {CLAIM_STATUS_LABELS[target_status]}",
            body=f"Your insurance claim ({claim_ref}) with {provider_name} is now '{CLAIM_STATUS_LABELS[target_status]}'.",
            claim_id=claim["id"],
            claim_reference=claim_ref,
            provider_name=provider_name,
            extra_metadata={"status": target_status},
        )

    # Audit log
    await db["audit_logs"].insert_one({
        "id": f"audit-{uuid4().hex[:12]}",
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "actor_role": "clinic_admin",
        "action": f"insurance_claim.status_{target_status}",
        "resource_type": "insurance_claim",
        "resource_id": claim["id"],
        "metadata": {
            "claim_reference": claim_ref,
            "target_status": target_status,
            "approved_amount": update_fields.get("approved_amount"),
            "rejection_reason": update_fields.get("rejection_reason"),
        },
        "created_at": now_iso,
    })

    return {
        "id": claim["id"],
        "claim_reference": claim_ref,
        "status": target_status,
        "status_label": CLAIM_STATUS_LABELS[target_status],
        "approved_amount": update_fields.get("approved_amount"),
        "rejection_reason": update_fields.get("rejection_reason"),
        "updated_at": now_iso,
        "message": f"Claim status updated to '{CLAIM_STATUS_LABELS[target_status]}'. Patient has been notified.",
        "timeline_entry": ClaimTimelineEntry(**timeline_entry),
    }


@router.post("/patient/insurance/claims/{claim_id}/additional-documents", response_model=SupportingDocumentUploadResponse)
async def upload_patient_additional_document(
    claim_id: str,
    title: str = Form(..., min_length=2, max_length=150),
    file: UploadFile = File(...),
    principal: Principal = Depends(require("insurance:write")),
) -> dict[str, Any]:
    """Upload an additional supporting document when insurer requests additional evidence."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    query = {
        "tenant_id": principal.tenant_id,
        "$or": [{"id": claim_id}, {"claim_reference": claim_id}],
    }
    claim = await db["insurance_claims"].find_one(query)
    if not claim:
        raise HTTPException(status_code=404, detail="Insurance claim not found")

    claim_patient_id = claim.get("patient_id") or claim.get("user_id")
    if claim_patient_id not in patient_ids and claim_patient_id != principal.user_id:
        raise HTTPException(status_code=404, detail="Insurance claim not found or access denied")

    if claim.get("status") != "additional_documents_required":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot upload additional documents for claim with status '{claim.get('status')}'. Additional uploads are only permitted when insurer status is 'Additional Documents Required'."
        )

    content_type = file.content_type or "application/octet-stream"
    if content_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(status_code=400, detail=f"File type '{content_type}' is not supported. Use PDF, JPEG, or PNG.")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_BYTES:
        raise HTTPException(status_code=400, detail="File size exceeds maximum limit of 10 MB.")

    file_id = f"doc-{uuid4().hex[:12]}"
    file_ext = Path(file.filename or "doc.pdf").suffix.lower()
    storage_filename = f"{file_id}{file_ext}"
    storage_path = PRIVATE_INSURANCE_DIR / storage_filename

    try:
        storage_path.write_bytes(file_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to store uploaded document securely: {e}")

    now_iso = datetime.now(UTC).isoformat()
    doc_record = {
        "id": file_id,
        "tenant_id": principal.tenant_id,
        "patient_id": claim_patient_id,
        "file_name": file.filename or "supporting_doc",
        "content_type": content_type,
        "size_bytes": len(file_bytes),
        "storage_key": storage_filename,
        "document_type": "additional_requested_document",
        "created_at": now_iso,
    }
    await db["insurance_documents"].insert_one(doc_record)

    new_doc_item = {
        "id": file_id,
        "category": "additional_requested_document",
        "title": title.strip(),
        "status": "Available",
        "file_name": file.filename or "supporting_doc",
        "verification_status": "pending",
        "download_url": f"/api/patient/insurance/documents/{file_id}/download",
        "preview_url": f"/api/patient/insurance/documents/{file_id}/preview",
    }
    updated_docs = list(claim.get("documents") or [])
    updated_docs.append(new_doc_item)

    await db["insurance_claims"].update_one(
        {"id": claim["id"]},
        {
            "$set": {
                "documents": updated_docs,
                "updated_at": now_iso,
            }
        }
    )

    return {
        "id": file_id,
        "appointment_id": claim.get("appointment_id", ""),
        "document_type": "additional_requested_document",
        "title": title.strip(),
        "file_name": file.filename or "supporting_doc",
        "content_type": content_type,
        "size_bytes": len(file_bytes),
        "created_at": now_iso,
    }


@router.post("/patient/insurance/claims/{claim_id}/submit-additional-docs", response_model=PatientSubmitAdditionalDocsResponse)
async def submit_patient_additional_documents(
    claim_id: str,
    payload: PatientSubmitAdditionalDocsRequest,
    principal: Principal = Depends(require("insurance:write")),
) -> dict[str, Any]:
    """Submit the requested additional documents and return claim to 'Under Insurer Review'."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    query = {
        "tenant_id": principal.tenant_id,
        "$or": [{"id": claim_id}, {"claim_reference": claim_id}],
    }
    claim = await db["insurance_claims"].find_one(query)
    if not claim:
        raise HTTPException(status_code=404, detail="Insurance claim not found")

    claim_patient_id = claim.get("patient_id") or claim.get("user_id")
    if claim_patient_id not in patient_ids and claim_patient_id != principal.user_id:
        raise HTTPException(status_code=404, detail="Insurance claim not found or access denied")

    if claim.get("status") != "additional_documents_required":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot submit additional documents for claim with status '{claim.get('status')}'. Status must be 'Additional Documents Required'."
        )

    now_iso = datetime.now(UTC).isoformat()
    claim_ref = claim.get("claim_reference") or claim["id"]
    notes = payload.notes.strip() if payload.notes and payload.notes.strip() else "Patient uploaded requested additional supporting documents."

    new_status = "under_insurer_review"
    new_label = CLAIM_STATUS_LABELS["under_insurer_review"]

    timeline_entry = {
        "stage": "additional_docs_submitted",
        "status": new_status,
        "title": "Additional Documents Submitted by Patient",
        "description": notes,
        "occurred_at": now_iso,
        "actor_role": "patient",
    }
    updated_timeline = list(claim.get("timeline") or [])
    updated_timeline.append(timeline_entry)

    await db["insurance_claims"].update_one(
        {"id": claim["id"]},
        {
            "$set": {
                "status": new_status,
                "status_label": new_label,
                "patient_resubmit_notes": notes,
                "timeline": updated_timeline,
                "updated_at": now_iso,
            }
        }
    )

    # Notify Clinic Admin
    patient_name = claim.get("patient_name") or "Patient"
    await notify_admin_additional_documents_uploaded(
        db,
        tenant_id=principal.tenant_id,
        claim_id=claim["id"],
        claim_reference=claim_ref,
        patient_name=patient_name,
    )

    # Audit log
    await db["audit_logs"].insert_one({
        "id": f"audit-{uuid4().hex[:12]}",
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "actor_role": "patient",
        "action": "insurance_claim.additional_docs_submitted",
        "resource_type": "insurance_claim",
        "resource_id": claim["id"],
        "metadata": {
            "claim_reference": claim_ref,
            "notes": notes,
        },
        "created_at": now_iso,
    })

    return {
        "id": claim["id"],
        "claim_reference": claim_ref,
        "status": new_status,
        "status_label": new_label,
        "message": "Additional documents submitted successfully. The claim is now Under Insurer Review.",
        "submitted_at": now_iso,
    }


# ==============================================================================
# CHECKPOINT 10: PATIENT REIMBURSEMENT TRACKING ENDPOINTS
# ==============================================================================

@router.post("/clinic-admin/insurance/claims/{claim_id}/reimbursement-evidence", response_model=ReimbursementEvidenceUploadResponse)
async def upload_reimbursement_evidence(
    claim_id: str,
    file: UploadFile = File(...),
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Upload insurer payment settlement advice or bank receipt evidence."""
    require_permission(principal, "clinic:insurance:write")
    db = mongo_database.database()

    query = {
        "tenant_id": principal.tenant_id,
        "$or": [{"id": claim_id}, {"claim_reference": claim_id}],
    }
    claim = await db["insurance_claims"].find_one(query)
    if not claim:
        raise HTTPException(status_code=404, detail="Insurance claim not found")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_BYTES:
        raise HTTPException(413, "File exceeds the 10 MB size limit")

    content_type = (file.content_type or "application/pdf").lower()
    if content_type == "image/jpg":
        content_type = "image/jpeg"
    if content_type not in ALLOWED_FILE_TYPES:
        raise HTTPException(400, f"Unsupported file type '{content_type}'. Only PDF, JPG, and PNG are allowed.")

    storage_dir = _ensure_storage_dir()
    file_id = f"reimb-doc-{uuid4().hex[:10]}"
    ext = Path(file.filename or "doc.pdf").suffix.lower() or ".pdf"
    file_path = storage_dir / f"{principal.tenant_id}_{file_id}{ext}"
    file_path.write_bytes(file_bytes)

    now_iso = datetime.now(UTC).isoformat()
    doc_meta = {
        "id": file_id,
        "tenant_id": principal.tenant_id,
        "claim_id": claim["id"],
        "patient_id": claim.get("patient_id", ""),
        "document_type": "reimbursement_evidence",
        "file_name": file.filename or "reimbursement_evidence",
        "content_type": content_type,
        "size_bytes": len(file_bytes),
        "storage_path": str(file_path),
        "created_at": now_iso,
    }
    await db["insurance_documents"].insert_one(doc_meta)

    return {
        "id": file_id,
        "claim_id": claim["id"],
        "file_name": file.filename or "reimbursement_evidence",
        "content_type": content_type,
        "size_bytes": len(file_bytes),
        "download_url": f"/api/patient/insurance/documents/{file_id}/download",
        "preview_url": f"/api/patient/insurance/documents/{file_id}/preview",
        "created_at": now_iso,
    }


@router.post("/clinic-admin/insurance/claims/{claim_id}/reimbursements", response_model=RecordReimbursementResponse)
async def record_claim_reimbursement(
    claim_id: str,
    payload: RecordReimbursementRequest,
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Record an insurer-disbursed reimbursement transaction for an approved or partially approved claim.
    Validates that cumulative reimbursement does not exceed insurer-approved amount and prevents duplicate transactions."""
    require_permission(principal, "clinic:insurance:write")
    db = mongo_database.database()

    query = {
        "tenant_id": principal.tenant_id,
        "$or": [{"id": claim_id}, {"claim_reference": claim_id}],
    }
    claim = await db["insurance_claims"].find_one(query)
    if not claim:
        raise HTTPException(status_code=404, detail="Insurance claim not found")

    claim_status = claim.get("status", "")
    if claim_status not in {"approved", "partially_approved"}:
        raise HTTPException(
            status_code=400,
            detail=f"Reimbursement can only be recorded for approved or partially approved claims (current status: '{CLAIM_STATUS_LABELS.get(claim_status, claim_status)}')."
        )

    # Parse and validate amount
    raw_amount = payload.reimbursement_amount.replace("₹", "").replace(",", "").strip()
    try:
        amount_float = float(raw_amount)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="Invalid reimbursement amount. Must be a valid numeric amount.")

    if amount_float <= 0:
        raise HTTPException(status_code=400, detail="Reimbursement amount must be greater than zero.")

    amount_paise = int(round(amount_float * 100))

    # Approved amount validation
    approved_paise = claim.get("approved_amount_paise")
    if approved_paise is None or approved_paise <= 0:
        raw_approved = claim.get("approved_amount") or "0"
        try:
            approved_paise = int(round(float(str(raw_approved).replace("₹", "").replace(",", "").strip()) * 100))
        except Exception:
            approved_paise = 0

    if approved_paise <= 0:
        raise HTTPException(status_code=400, detail="Cannot record reimbursement: Claim does not have an approved settlement amount.")

    # Prevent duplicate payment reference on the same claim
    clean_ref = payload.payment_reference.strip()
    existing_ref = await db["insurance_reimbursements"].find_one({
        "tenant_id": principal.tenant_id,
        "claim_id": claim["id"],
        "payment_reference": clean_ref,
    })
    if existing_ref:
        raise HTTPException(
            status_code=409,
            detail=f"A reimbursement transaction with reference '{clean_ref}' has already been recorded for this claim."
        )

    # Calculate cumulative existing reimbursements
    reimb_cursor = db["insurance_reimbursements"].find({
        "tenant_id": principal.tenant_id,
        "claim_id": claim["id"],
    })
    existing_txs = []
    async for tx in reimb_cursor:
        existing_txs.append(tx)

    existing_total_paise = sum(int(t.get("amount_paise") or 0) for t in existing_txs)
    remaining_pending_paise = approved_paise - existing_total_paise

    if remaining_pending_paise <= 0:
        raise HTTPException(status_code=400, detail="This claim has already been fully reimbursed.")

    if amount_paise > remaining_pending_paise:
        raise HTTPException(
            status_code=400,
            detail=f"Reimbursement amount ₹{amount_paise / 100:.2f} exceeds the remaining pending balance of ₹{remaining_pending_paise / 100:.2f}."
        )

    now_iso = datetime.now(UTC).isoformat()
    tx_id = f"reimb-tx-{uuid4().hex[:10]}"
    new_total_paise = existing_total_paise + amount_paise
    new_pending_paise = approved_paise - new_total_paise
    new_reimb_status = "fully_reimbursed" if new_pending_paise == 0 else "partially_reimbursed"
    new_reimb_status_label = REIMBURSEMENT_STATUS_LABELS[new_reimb_status]

    # Enforce mandatory supporting evidence document
    clean_evidence_id = (payload.supporting_evidence_id or "").strip()
    if not clean_evidence_id:
        raise HTTPException(
            status_code=400,
            detail="Supporting evidence document (remittance advice or insurer payment receipt) is mandatory to record reimbursement.",
        )

    # Resolve supporting evidence name
    evidence_name = "reimbursement_evidence.pdf"
    doc = await db["insurance_documents"].find_one({"id": clean_evidence_id})
    if doc:
        evidence_name = doc.get("file_name", evidence_name)

    tx_doc = {
        "id": tx_id,
        "tenant_id": principal.tenant_id,
        "clinic_id": principal.clinic_id,
        "claim_id": claim["id"],
        "patient_id": claim.get("patient_id") or claim.get("user_id"),
        "reimbursement_amount": f"{amount_paise / 100:.2f}",
        "amount_paise": amount_paise,
        "currency": "INR",
        "reimbursement_date": payload.reimbursement_date,
        "payment_reference": clean_ref,
        "payment_method": payload.payment_method,
        "supporting_evidence_id": clean_evidence_id,
        "supporting_evidence_name": evidence_name,
        "notes": payload.notes.strip() if payload.notes else None,
        "created_at": now_iso,
        "recorded_by": principal.user_id,
    }
    await db["insurance_reimbursements"].insert_one(tx_doc)

    # Timeline entry
    claim_ref = claim.get("claim_reference") or claim["id"]
    masked_ref = mask_transaction_reference(clean_ref)
    provider_name = claim.get("provider_name") or "Insurer"
    timeline_desc = (
        f"Insurer reimbursement payment of ₹{amount_paise / 100:.2f} recorded (Ref: {masked_ref}). "
        f"Total reimbursed: ₹{new_total_paise / 100:.2f} of ₹{approved_paise / 100:.2f}."
    )
    timeline_entry = {
        "stage": "reimbursement",
        "status": new_reimb_status,
        "title": f"Reimbursement Recorded: {new_reimb_status_label}",
        "description": timeline_desc,
        "occurred_at": now_iso,
        "actor_role": "clinic_admin",
    }
    updated_timeline = list(claim.get("timeline") or [])
    updated_timeline.append(timeline_entry)

    # Update claim
    await db["insurance_claims"].update_one(
        {"id": claim["id"]},
        {
            "$set": {
                "reimbursement_status": new_reimb_status,
                "reimbursement_status_label": new_reimb_status_label,
                "reimbursed_amount": f"{new_total_paise / 100:.2f}",
                "reimbursed_amount_paise": new_total_paise,
                "pending_reimbursement_amount": f"{new_pending_paise / 100:.2f}",
                "pending_reimbursement_amount_paise": new_pending_paise,
                "last_reimbursement_date": payload.reimbursement_date,
                "timeline": updated_timeline,
                "updated_at": now_iso,
            }
        }
    )

    # Notify patient
    patient_user_id = claim.get("patient_id") or claim.get("user_id")
    patient_email = None
    if patient_user_id:
        user_doc = await db["users"].find_one({"id": patient_user_id})
        if user_doc and user_doc.get("email"):
            patient_email = user_doc["email"]

    await notify_patient_reimbursement_recorded(
        db,
        tenant_id=principal.tenant_id,
        patient_id=patient_user_id,
        patient_email=patient_email,
        claim_id=claim["id"],
        claim_reference=claim_ref,
        amount=f"{amount_paise / 100:.2f}",
        pending_amount=f"{new_pending_paise / 100:.2f}",
        masked_ref=masked_ref,
        is_full=(new_pending_paise == 0),
    )

    # Audit log
    await db["audit_logs"].insert_one({
        "id": f"audit-{uuid4().hex[:12]}",
        "tenant_id": principal.tenant_id,
        "actor_id": principal.user_id,
        "actor_role": "clinic_admin",
        "action": "insurance_reimbursement.recorded",
        "resource_type": "insurance_reimbursement",
        "resource_id": tx_id,
        "metadata": {
            "claim_id": claim["id"],
            "claim_reference": claim_ref,
            "amount_paise": amount_paise,
            "payment_reference": clean_ref,
            "reimbursement_status": new_reimb_status,
        },
        "created_at": now_iso,
    })

    method_label = PAYMENT_METHOD_LABELS.get(payload.payment_method, payload.payment_method.replace("_", " ").title())
    evidence_url = f"/api/patient/insurance/documents/{payload.supporting_evidence_id}/download" if payload.supporting_evidence_id else None

    tx_response = ReimbursementTransactionItem(
        id=tx_id,
        claim_id=claim["id"],
        reimbursement_amount=f"{amount_paise / 100:.2f}",
        amount_paise=amount_paise,
        currency="INR",
        reimbursement_date=payload.reimbursement_date,
        payment_reference=clean_ref,
        payment_reference_masked=masked_ref,
        payment_method=payload.payment_method,
        payment_method_label=method_label,
        supporting_evidence_id=payload.supporting_evidence_id,
        supporting_evidence_name=evidence_name,
        supporting_evidence_url=evidence_url,
        notes=payload.notes.strip() if payload.notes else None,
        created_at=now_iso,
        recorded_by=principal.user_id,
    )

    return {
        "id": tx_id,
        "claim_id": claim["id"],
        "claim_reference": claim_ref,
        "reimbursement_status": new_reimb_status,
        "reimbursement_status_label": new_reimb_status_label,
        "reimbursement_amount": f"{amount_paise / 100:.2f}",
        "total_reimbursed_amount": f"{new_total_paise / 100:.2f}",
        "pending_reimbursement_amount": f"{new_pending_paise / 100:.2f}",
        "is_fully_reimbursed": (new_pending_paise == 0),
        "transaction": tx_response,
        "message": f"Reimbursement transaction of ₹{amount_paise / 100:.2f} recorded successfully ({new_reimb_status_label}).",
        "timeline_entry": ClaimTimelineEntry(**timeline_entry),
    }


@router.get("/clinic-admin/insurance/claims/{claim_id}/reimbursements", response_model=ClaimReimbursementSummaryResponse)
async def get_clinic_admin_claim_reimbursements(
    claim_id: str,
    principal: MongoPrincipal = Depends(clinic_admin_dep),
) -> dict[str, Any]:
    """Retrieve verified reimbursement summary and full transactions list for a claim (Clinic Admin view with unmasked references)."""
    require_permission(principal, "clinic:insurance:read")
    db = mongo_database.database()

    query = {
        "tenant_id": principal.tenant_id,
        "$or": [{"id": claim_id}, {"claim_reference": claim_id}],
    }
    claim = await db["insurance_claims"].find_one(query)
    if not claim:
        raise HTTPException(status_code=404, detail="Insurance claim not found")

    reimb_summary = await _compute_claim_reimbursement_summary(db, claim, mask_ref_for_patient=False)
    fee_paise = claim.get("fee_paise", 0)
    original_fee = claim.get("consultation_fee") or f"₹{fee_paise / 100:.2f}"

    return {
        "claim_id": claim["id"],
        "claim_reference": claim.get("claim_reference") or claim["id"],
        "appointment_id": claim.get("appointment_id", ""),
        "appointment_display_id": claim.get("appointment_display_id") or f"KC-APT-{claim.get('appointment_id', '')[-6:].upper()}",
        "doctor_name": claim.get("doctor_name", "Doctor"),
        "provider_name": claim.get("provider_name", "Insurance Provider"),
        "policy_number_masked": claim.get("policy_number_masked", ""),
        "original_consultation_fee": original_fee,
        "original_fee_paise": fee_paise,
        "requested_claim_amount": original_fee,
        "requested_amount_paise": fee_paise,
        "approved_amount": reimb_summary["approved_amount"],
        "approved_amount_paise": reimb_summary["approved_amount_paise"],
        "reimbursed_amount": reimb_summary["reimbursed_amount"],
        "reimbursed_amount_paise": reimb_summary["reimbursed_amount_paise"],
        "pending_reimbursement_amount": reimb_summary["pending_reimbursement_amount"],
        "pending_amount_paise": reimb_summary["pending_reimbursement_amount_paise"],
        "currency": "INR",
        "reimbursement_status": reimb_summary["reimbursement_status"],
        "reimbursement_status_label": reimb_summary["reimbursement_status_label"],
        "transactions": reimb_summary["transactions"],
        "reimbursements_count": reimb_summary["reimbursements_count"],
        "last_reimbursement_date": reimb_summary["last_reimbursement_date"],
        "timeline": [ClaimTimelineEntry(**t) for t in (claim.get("timeline") or [])],
    }


@router.get("/patient/insurance/claims/{claim_id}/reimbursements", response_model=ClaimReimbursementSummaryResponse)
async def get_patient_claim_reimbursements(
    claim_id: str,
    principal: Principal = Depends(require("insurance:read")),
) -> dict[str, Any]:
    """Retrieve reimbursement tracking details and transaction history for a patient claim (with masked payment references)."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)

    query = {
        "tenant_id": principal.tenant_id,
        "$or": [{"id": claim_id}, {"claim_reference": claim_id}],
    }
    claim = await db["insurance_claims"].find_one(query)
    if not claim:
        raise HTTPException(status_code=404, detail="Insurance claim not found")

    claim_patient_id = claim.get("patient_id") or claim.get("user_id")
    if claim_patient_id not in patient_ids and claim_patient_id != principal.user_id:
        raise HTTPException(status_code=404, detail="Insurance claim not found or access denied")

    reimb_summary = await _compute_claim_reimbursement_summary(db, claim, mask_ref_for_patient=True)
    fee_paise = claim.get("fee_paise", 0)
    original_fee = claim.get("consultation_fee") or f"₹{fee_paise / 100:.2f}"

    return {
        "claim_id": claim["id"],
        "claim_reference": claim.get("claim_reference") or claim["id"],
        "appointment_id": claim.get("appointment_id", ""),
        "appointment_display_id": claim.get("appointment_display_id") or f"KC-APT-{claim.get('appointment_id', '')[-6:].upper()}",
        "doctor_name": claim.get("doctor_name", "Doctor"),
        "provider_name": claim.get("provider_name", "Insurance Provider"),
        "policy_number_masked": claim.get("policy_number_masked", ""),
        "original_consultation_fee": original_fee,
        "original_fee_paise": fee_paise,
        "requested_claim_amount": original_fee,
        "requested_amount_paise": fee_paise,
        "approved_amount": reimb_summary["approved_amount"],
        "approved_amount_paise": reimb_summary["approved_amount_paise"],
        "reimbursed_amount": reimb_summary["reimbursed_amount"],
        "reimbursed_amount_paise": reimb_summary["reimbursed_amount_paise"],
        "pending_reimbursement_amount": reimb_summary["pending_reimbursement_amount"],
        "pending_amount_paise": reimb_summary["pending_reimbursement_amount_paise"],
        "currency": "INR",
        "reimbursement_status": reimb_summary["reimbursement_status"],
        "reimbursement_status_label": reimb_summary["reimbursement_status_label"],
        "transactions": reimb_summary["transactions"],
        "reimbursements_count": reimb_summary["reimbursements_count"],
        "last_reimbursement_date": reimb_summary["last_reimbursement_date"],
        "timeline": [ClaimTimelineEntry(**t) for t in (claim.get("timeline") or [])],
    }


@router.post("/patient/insurance/claims/preflight-validate", response_model=PreflightClaimValidationResponse)
async def preflight_validate_claim(
    payload: PreflightClaimValidationRequest,
    principal: Principal = Depends(require("insurance:read")),
) -> dict[str, Any]:
    """Pre-submission verification for patient insurance reimbursement claim.
    Validates policy coverage dates, name matching, mandatory documents presence,
    and fee reconciliation, returning an itemized readiness checklist and 0-100% score."""
    db = mongo_database.database()
    patient_ids = await _resolve_patient_ids(db, principal.tenant_id, principal.user_id)
    appointment_id = payload.appointment_id.strip()

    # 1. Fetch appointment context
    try:
        ctx = await _fetch_claim_appointment_context(
            db=db,
            tenant_id=principal.tenant_id,
            appointment_id=appointment_id,
            patient_ids=patient_ids,
            user_id=principal.user_id,
        )
    except HTTPException as e:
        return {
            "appointment_id": appointment_id,
            "policy_id": payload.policy_id,
            "readiness_score": 0,
            "is_submission_ready": False,
            "checks": [
                PreflightCheckItem(
                    key="appointment_validity",
                    title="Appointment Verification",
                    passed=False,
                    severity="error",
                    message=f"Appointment verification error: {e.detail}",
                    action_hint="Ensure appointment ID is valid and belongs to your account",
                )
            ],
            "summary_message": f"Appointment could not be verified: {e.detail}",
        }

    checks: list[PreflightCheckItem] = []

    # Check 1: Consultation Status
    is_completed = ctx.get("is_completed", False)
    checks.append(PreflightCheckItem(
        key="consultation_status",
        title="Consultation Completed",
        passed=is_completed,
        severity="error" if not is_completed else "info",
        message="Consultation completed by clinician" if is_completed else f"Appointment status is '{ctx.get('appointment_status')}' (must be Completed)",
        action_hint=None if is_completed else "Reimbursement claims can only be filed after the consultation concludes",
    ))

    # Check 2: Razorpay Payment Verification
    payment_verified = ctx.get("payment_verified", False)
    checks.append(PreflightCheckItem(
        key="payment_verification",
        title="Payment Verified & Reconciled",
        passed=payment_verified,
        severity="error" if not payment_verified else "info",
        message=f"Payment verified for consultation fee: {ctx.get('consultation_fee')}" if payment_verified else "Consultation payment is pending or unverified",
        action_hint=None if payment_verified else "Verify payment status in your Payments tab",
    ))

    # Check 3: Consultation Summary Finalized
    summary_finalized = ctx.get("summary_finalized", False)
    checks.append(PreflightCheckItem(
        key="summary_finalized",
        title="Clinical Notes Finalized",
        passed=summary_finalized,
        severity="error" if not summary_finalized else "info",
        message="Consultation encounter summary finalized and locked by doctor" if summary_finalized else "Clinical encounter notes have not been finalized yet",
        action_hint=None if summary_finalized else "Doctor must finalize notes before insurance claims can proceed",
    ))

    # Check 4: Prescription Released
    prescription_verified = ctx.get("prescription_verified", False)
    checks.append(PreflightCheckItem(
        key="prescription_released",
        title="Digital Prescription Released",
        passed=prescription_verified,
        severity="error" if not prescription_verified else "info",
        message="Verified digital prescription released" if prescription_verified else "Prescription has not been released yet",
        action_hint=None if prescription_verified else "Prescription is required as part of mandatory claim package",
    ))

    # Check 5: Policy Selection & Validity
    policy_id = payload.policy_id.strip() if payload.policy_id else None
    policy = None
    if policy_id:
        policy = await db["insurance_policies"].find_one({
            "tenant_id": principal.tenant_id,
            "id": policy_id,
            "$or": [{"patient_id": {"$in": patient_ids}}, {"user_id": principal.user_id}],
        })
        if not policy and "patient_insurance_policies" in db:
            policy = await db["patient_insurance_policies"].find_one({
                "tenant_id": principal.tenant_id,
                "id": policy_id,
            })

    if not policy_id:
        checks.append(PreflightCheckItem(
            key="policy_selection",
            title="Insurance Policy Selected",
            passed=False,
            severity="error",
            message="No active insurance policy selected",
            action_hint="Select a registered insurance policy from your account",
        ))
    elif not policy:
        checks.append(PreflightCheckItem(
            key="policy_selection",
            title="Insurance Policy Selected",
            passed=False,
            severity="error",
            message=f"Policy '{policy_id}' not found or belongs to another user",
            action_hint="Verify your policy ID in My Insurance screen",
        ))
    else:
        # Policy is selected and found
        checks.append(PreflightCheckItem(
            key="policy_selection",
            title="Insurance Policy Selected",
            passed=True,
            severity="info",
            message=f"Policy selected: {policy.get('provider_name', 'Provider')} ({mask_policy_number(policy.get('policy_number', ''))})",
            action_hint=None,
        ))

        # Check 6: Policy Status Active
        status = policy.get("status", "Active")
        is_active = status.lower() == "active"
        checks.append(PreflightCheckItem(
            key="policy_status",
            title="Policy Active Status",
            passed=is_active,
            severity="error" if not is_active else "info",
            message=f"Policy status is '{status}'",
            action_hint=None if is_active else "Only Active policies can be submitted for reimbursement",
        ))

        # Check 7: Policy Coverage Window
        appt_date_str = str(ctx.get("appointment_date") or ctx.get("appointment_starts_at") or "")[:10]
        start_date = policy.get("start_date", "")
        expiry_date = policy.get("expiry_date", "")
        coverage_valid = True
        cov_msg = "Appointment date falls within valid policy coverage window"
        if expiry_date and appt_date_str > expiry_date:
            coverage_valid = False
            cov_msg = f"Policy expired on {expiry_date}, but appointment occurred on {appt_date_str}"
        elif start_date and appt_date_str < start_date:
            coverage_valid = False
            cov_msg = f"Policy starts on {start_date}, but appointment occurred on {appt_date_str}"

        checks.append(PreflightCheckItem(
            key="coverage_window",
            title="Coverage Period Validity",
            passed=coverage_valid,
            severity="error" if not coverage_valid else "info",
            message=cov_msg,
            action_hint=None if coverage_valid else "Ensure consultation date falls within policy active coverage period",
        ))

        # Check 8: Name / Relationship Matching
        patient_doc = await db["patients"].find_one({
            "tenant_id": principal.tenant_id,
            "$or": [{"id": {"$in": patient_ids}}, {"user_id": principal.user_id}],
        })
        patient_name = (patient_doc or {}).get("full_name") or "Patient"
        holder_name = policy.get("policy_holder_name", "")
        rel = policy.get("relationship", "Self")
        name_matched = bool(holder_name and (rel.lower() != "self" or (patient_name.lower().split()[0] in holder_name.lower())))
        checks.append(PreflightCheckItem(
            key="holder_identity_match",
            title="Policyholder Identity Alignment",
            passed=name_matched,
            severity="warning" if not name_matched else "info",
            message=f"Claimant '{patient_name}' linked via '{rel}' relationship to policyholder '{holder_name}'" if name_matched else f"Policyholder name '{holder_name}' does not match patient name '{patient_name}'",
            action_hint=None if name_matched else "Ensure relationship or policyholder details match your patient profile",
        ))

    # Calculate overall readiness score
    mandatory_keys = {"consultation_status", "payment_verification", "summary_finalized", "prescription_released", "policy_selection", "policy_status", "coverage_window"}
    mandatory_checks = [c for c in checks if c.key in mandatory_keys]
    passed_mandatory = sum(1 for c in mandatory_checks if c.passed)
    total_mandatory = len(mandatory_keys)
    readiness_score = int(round((passed_mandatory / total_mandatory) * 100))
    is_ready = readiness_score == 100

    if is_ready:
        summary_message = "Your claim meets 100% of reimbursement criteria and is ready for submission."
    elif readiness_score >= 70:
        summary_message = f"Your claim is {readiness_score}% ready. Please resolve outstanding items before submitting."
    else:
        summary_message = f"Claim prerequisites incomplete ({readiness_score}%). Consultation must be finalized and an active policy attached."

    return {
        "appointment_id": appointment_id,
        "policy_id": policy_id,
        "readiness_score": readiness_score,
        "is_submission_ready": is_ready,
        "checks": checks,
        "summary_message": summary_message,
    }



