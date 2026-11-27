"""Pydantic schemas for Insurance Provider Master (Checkpoint 1)."""
from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator
import re


def _clean_str(v: str | None) -> str | None:
    if v is None:
        return None
    cleaned = v.strip()
    return cleaned if cleaned else None


class InsuranceProviderBase(BaseModel):
    provider_name: str = Field(..., min_length=2, max_length=150, description="Insurance Provider Name")
    provider_code: str = Field(..., min_length=2, max_length=50, description="Unique Provider Code")
    country: str = Field(default="India", min_length=2, max_length=100, description="Country of operation")
    provider_type: Literal["Insurance Company", "TPA"] = Field(..., description="Provider Type: Insurance Company or TPA")
    contact_person: str | None = Field(default=None, max_length=120)
    contact_email: str | None = Field(default=None, max_length=254)
    contact_number: str | None = Field(default=None, max_length=35)
    official_website: str | None = Field(default=None, max_length=300)
    claim_submission_email: str | None = Field(default=None, max_length=254)
    claim_submission_portal_url: str | None = Field(default=None, max_length=500)
    status: Literal["Active", "Inactive"] = Field(default="Active", description="Operational Status")

    @field_validator("provider_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Provider name must be at least 2 characters")
        return v

    @field_validator("provider_code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        v = v.strip().upper()
        if not re.match(r"^[A-Z0-9_\-]+$", v):
            raise ValueError("Provider code must contain only letters, numbers, hyphens, and underscores")
        return v

    @field_validator("country")
    @classmethod
    def validate_country(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Country is required")
        return v

    @field_validator("contact_person", "contact_number")
    @classmethod
    def clean_optional_strings(cls, v: str | None) -> str | None:
        return _clean_str(v)

    @field_validator("contact_email", "claim_submission_email")
    @classmethod
    def validate_emails(cls, v: str | None) -> str | None:
        cleaned = _clean_str(v)
        if cleaned:
            email_regex = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
            if not re.match(email_regex, cleaned):
                raise ValueError("Invalid email address format")
            return cleaned.lower()
        return None

    @field_validator("official_website", "claim_submission_portal_url")
    @classmethod
    def validate_urls(cls, v: str | None) -> str | None:
        cleaned = _clean_str(v)
        if cleaned:
            if not (cleaned.startswith("http://") or cleaned.startswith("https://")):
                cleaned = f"https://{cleaned}"
            return cleaned
        return None


class InsuranceProviderCreate(InsuranceProviderBase):
    pass


class InsuranceProviderUpdate(BaseModel):
    provider_name: str | None = Field(default=None, min_length=2, max_length=150)
    provider_code: str | None = Field(default=None, min_length=2, max_length=50)
    country: str | None = Field(default=None, min_length=2, max_length=100)
    provider_type: Literal["Insurance Company", "TPA"] | None = None
    contact_person: str | None = Field(default=None, max_length=120)
    contact_email: str | None = Field(default=None, max_length=254)
    contact_number: str | None = Field(default=None, max_length=35)
    official_website: str | None = Field(default=None, max_length=300)
    claim_submission_email: str | None = Field(default=None, max_length=254)
    claim_submission_portal_url: str | None = Field(default=None, max_length=500)
    status: Literal["Active", "Inactive"] | None = None

    @field_validator("provider_name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if len(v) < 2:
                raise ValueError("Provider name must be at least 2 characters")
            return v
        return None

    @field_validator("provider_code")
    @classmethod
    def validate_code(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip().upper()
            if not re.match(r"^[A-Z0-9_\-]+$", v):
                raise ValueError("Provider code must contain only letters, numbers, hyphens, and underscores")
            return v
        return None

    @field_validator("contact_email", "claim_submission_email")
    @classmethod
    def validate_emails(cls, v: str | None) -> str | None:
        cleaned = _clean_str(v)
        if cleaned:
            email_regex = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
            if not re.match(email_regex, cleaned):
                raise ValueError("Invalid email address format")
            return cleaned.lower()
        return None

    @field_validator("official_website", "claim_submission_portal_url")
    @classmethod
    def validate_urls(cls, v: str | None) -> str | None:
        cleaned = _clean_str(v)
        if cleaned:
            if not (cleaned.startswith("http://") or cleaned.startswith("https://")):
                cleaned = f"https://{cleaned}"
            return cleaned
        return None


class InsuranceProviderStatusUpdate(BaseModel):
    status: Literal["Active", "Inactive"]


class InsuranceProviderResponse(InsuranceProviderBase):
    id: str
    tenant_id: str
    clinic_id: str | None = None
    created_by: str
    created_at: str
    updated_at: str | None = None


class InsuranceProviderListResponse(BaseModel):
    items: list[dict[str, Any]]
    total: int
    page: int
    limit: int
    total_pages: int
    stats: dict[str, int]


class InsuranceDocumentResponse(BaseModel):
    id: str
    file_name: str
    content_type: str
    size_bytes: int
    document_type: str  # "insurance_card" or "policy_document"
    created_at: str


class InsurancePolicyCreate(BaseModel):
    provider_id: str = Field(..., description="Insurance Provider Master ID")
    policy_number: str = Field(..., min_length=2, max_length=60, description="Insurance Policy Number")
    member_id: str | None = Field(default=None, max_length=60)
    policy_holder_name: str = Field(..., min_length=2, max_length=120)
    relationship: Literal["Self", "Spouse", "Child", "Parent", "Other"] = Field(default="Self")
    insurance_type: Literal["Individual", "Family", "Corporate", "Government"] = Field(default="Individual")
    start_date: str = Field(..., description="YYYY-MM-DD")
    expiry_date: str = Field(..., description="YYYY-MM-DD")

    @field_validator("policy_number", "policy_holder_name")
    @classmethod
    def clean_required_strings(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Field cannot be empty")
        return cleaned

    @field_validator("member_id")
    @classmethod
    def clean_member_id(cls, v: str | None) -> str | None:
        return _clean_str(v)

    @field_validator("start_date", "expiry_date")
    @classmethod
    def validate_date_format(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
            raise ValueError("Date must be in YYYY-MM-DD format")
        return v


class InsurancePolicyUpdate(BaseModel):
    policy_holder_name: str | None = Field(default=None, min_length=2, max_length=120)
    relationship: Literal["Self", "Spouse", "Child", "Parent", "Other"] | None = None
    insurance_type: Literal["Individual", "Family", "Corporate", "Government"] | None = None
    member_id: str | None = None
    start_date: str | None = None
    expiry_date: str | None = None
    status: Literal["Active", "Inactive"] | None = None

    @field_validator("start_date", "expiry_date")
    @classmethod
    def validate_date_format(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not re.match(r"^\d{4}-\d{2}-\d{2}$", v):
                raise ValueError("Date must be in YYYY-MM-DD format")
            return v
        return None


class PatientInsurancePolicyResponse(BaseModel):
    id: str
    patient_id: str
    provider_id: str
    provider_name: str
    provider_code: str
    policy_number_masked: str
    member_id: str | None = None
    policy_holder_name: str
    relationship: str = "Self"
    insurance_type: str = "Individual"
    start_date: str | None = None
    expiry_date: str | None = None
    status: str
    card_document: InsuranceDocumentResponse | None = None
    policy_document: InsuranceDocumentResponse | None = None
    created_at: str
    updated_at: str | None = None


class ActiveInsuranceProviderResponse(BaseModel):
    id: str
    provider_name: str
    provider_code: str
    country: str
    provider_type: str
    official_website: str | None = None


# ==============================================================================
# CHECKPOINT 4: POST-CONSULTATION CLAIM ELIGIBILITY & INITIATION SCHEMAS
# ==============================================================================

class ClaimPrerequisiteItem(BaseModel):
    key: str
    title: str
    passed: bool
    message: str
    details: str | None = None


class ClaimEligibilityResponse(BaseModel):
    appointment_id: str
    appointment_display_id: str
    doctor_name: str
    specialty: str
    appointment_date: str
    appointment_status: str
    consultation_fee: str
    fee_paise: int
    currency: str
    payment_status: str
    razorpay_payment_id: str | None = None
    payment_verified: bool
    summary_id: str | None = None
    summary_finalized: bool
    prescription_id: str | None = None
    prescription_status: str | None = None
    prescription_required: bool
    prescription_verified: bool
    has_active_claim: bool
    existing_claim_id: str | None = None
    existing_claim_status: str | None = None
    is_eligible: bool
    unmet_prerequisites: list[str]
    prerequisites: list[ClaimPrerequisiteItem]


class ClaimInitiateRequest(BaseModel):
    policy_id: str
    notes: str | None = None


class ClaimInitiateResponse(BaseModel):
    claim_id: str
    appointment_id: str
    appointment_display_id: str
    policy_id: str
    provider_name: str
    policy_number_masked: str
    consultation_fee: str
    payment_id: str | None = None
    status: str
    created_at: str
    message: str


# ==============================================================================
# CHECKPOINT 5: AUTOMATIC CLAIM DOSSIER & DOCUMENT COLLECTION SCHEMAS
# ==============================================================================

class ClaimDocumentItem(BaseModel):
    id: str
    category: str
    title: str
    description: str
    status: Literal["Available", "Missing", "Not Applicable"]
    is_mandatory: bool
    file_name: str | None = None
    content_type: str | None = None
    size_bytes: int | None = None
    download_url: str | None = None
    preview_url: str | None = None
    details: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ClaimDossierResponse(BaseModel):
    appointment_id: str
    appointment_display_id: str
    policy_id: str | None = None
    provider_name: str | None = None
    policy_number_masked: str | None = None
    paid_amount: str
    amount_paise: int
    currency: str
    documents: list[ClaimDocumentItem]
    mandatory_complete: bool
    missing_mandatory_count: int
    missing_mandatory_titles: list[str]
    total_documents_collected: int
    dossier_ready: bool


class SupportingDocumentUploadResponse(BaseModel):
    id: str
    appointment_id: str
    document_type: str
    title: str
    file_name: str
    content_type: str
    size_bytes: int
    created_at: str


# ==============================================================================
# CHECKPOINT 6: INSURANCE DATA SHARING CONSENT SCHEMAS
# ==============================================================================

class ClaimAuthorizedDocItem(BaseModel):
    id: str
    category: str
    title: str
    status: str
    file_name: str | None = None
    verification_status: str | None = "pending"
    verification_remarks: str | None = None
    download_url: str | None = None
    preview_url: str | None = None


class ConsentDocumentSection(BaseModel):
    heading: str
    body: str


class ConsentReviewDocumentResponse(BaseModel):
    title: str
    version: str
    effective_date: str
    purpose: str
    consent_text: str
    sections: list[ConsentDocumentSection]


class ClaimConsentResponse(BaseModel):
    appointment_id: str
    policy_id: str | None = None
    provider_id: str | None = None
    provider_name: str | None = None
    consent_type: str = "insurance_claim_data_sharing"
    consent_version: str = "1.0"
    consent_text: str
    status: Literal["granted", "withdrawn", "not_granted", "renewal_required"]
    is_granted: bool
    consent_id: str | None = None
    accepted_at: str | None = None
    withdrawn_at: str | None = None
    authorized_documents: list[ClaimAuthorizedDocItem] = Field(default_factory=list)
    requires_renewal: bool = False
    renewal_reason: str | None = None


class ClaimConsentGrantRequest(BaseModel):
    policy_id: str
    consent_accepted: bool
    consent_version: str = "1.0"


class ClaimConsentWithdrawResponse(BaseModel):
    appointment_id: str
    consent_id: str
    status: str
    withdrawn_at: str
    message: str


# ==============================================================================
# CHECKPOINT 7: PATIENT INSURANCE CLAIM SUBMISSION & LIFECYCLE SCHEMAS
# ==============================================================================

class ClaimTimelineEntry(BaseModel):
    stage: str
    status: str
    title: str
    description: str
    occurred_at: str
    actor_role: str | None = None


class ClaimSubmissionRequest(BaseModel):
    policy_id: str
    notes: str | None = None
    save_as_draft: bool = False
    submission_token: str | None = None  # Idempotency / double-click protection


class InsuranceClaimItemResponse(BaseModel):
    id: str
    claim_reference: str
    appointment_id: str
    appointment_display_id: str
    doctor_name: str
    specialty: str
    consultation_date: str
    patient_id: str
    patient_name: str
    policy_id: str
    provider_id: str
    provider_name: str
    policy_number_masked: str
    consultation_fee: str
    fee_paise: int
    currency: str
    status: str
    status_label: str
    submitted_at: str | None = None
    created_at: str
    updated_at: str
    notes: str | None = None
    insurer_claim_reference: str | None = None
    submitted_to_insurer_at: str | None = None
    approved_amount: str | None = None
    reimbursement_status: str | None = None
    reimbursement_status_label: str | None = None
    reimbursed_amount: str | None = None
    pending_reimbursement_amount: str | None = None


class InsuranceClaimDetailResponse(BaseModel):
    id: str
    claim_reference: str
    appointment_id: str
    appointment_display_id: str
    clinic_id: str
    doctor_name: str
    specialty: str
    consultation_date: str
    patient_id: str
    patient_name: str
    patient_phone: str | None = None
    patient_email: str | None = None
    policy_id: str
    provider_id: str
    provider_name: str
    policy_number_masked: str
    policy_holder_name: str
    relationship: str
    member_id: str | None = None
    consultation_fee: str
    fee_paise: int
    currency: str
    payment_id: str | None = None
    payment_status: str | None = None
    consent_id: str
    consent_version: str
    consent_accepted_at: str
    status: str
    status_label: str
    documents: list[ClaimAuthorizedDocItem] = Field(default_factory=list)
    timeline: list[ClaimTimelineEntry] = Field(default_factory=list)
    notes: str | None = None
    submitted_at: str | None = None
    reviewer_id: str | None = None
    reviewer_name: str | None = None
    reviewed_at: str | None = None
    verification_remarks: str | None = None
    created_at: str
    updated_at: str
    is_draft: bool = False
    insurer_claim_reference: str | None = None
    submission_method: str | None = None
    submitted_to_insurer_at: str | None = None
    acknowledgment_document: str | None = None
    insurer_portal_url: str | None = None
    insurer_submission_email: str | None = None
    insurer_contact_number: str | None = None
    approved_amount: str | None = None
    approved_amount_paise: int | None = None
    rejection_reason: str | None = None
    co_pay_or_deduction_reason: str | None = None
    settlement_reference: str | None = None
    requested_documents_reason: str | None = None
    evidence_document: str | None = None
    reimbursement_status: str | None = None
    reimbursement_status_label: str | None = None
    reimbursed_amount: str | None = None
    reimbursed_amount_paise: int | None = None
    pending_reimbursement_amount: str | None = None
    pending_reimbursement_amount_paise: int | None = None
    reimbursements_count: int = 0
    reimbursements: list[dict[str, Any]] = Field(default_factory=list)


class ClaimSubmissionResult(BaseModel):
    id: str
    claim_reference: str
    status: str
    status_label: str
    message: str
    submitted_at: str | None = None
    is_draft: bool = False
    next_step: str


# ==============================================================================
# CHECKPOINT 8: CLINIC ADMIN INSURANCE CLAIM VERIFICATION SCHEMAS
# ==============================================================================

class ClinicAdminClaimStats(BaseModel):
    total: int
    pending_verification: int
    correction_required: int
    ready_for_submission: int
    submitted_to_insurer: int = 0
    under_insurer_review: int = 0
    additional_documents_required: int = 0
    approved: int = 0
    partially_approved: int = 0
    rejected: int = 0
    draft: int = 0
    awaiting_reimbursement: int = 0
    partially_reimbursed: int = 0
    fully_reimbursed: int = 0


class ClinicAdminClaimListItem(BaseModel):
    id: str
    claim_reference: str
    appointment_id: str
    appointment_display_id: str
    doctor_name: str
    specialty: str
    consultation_date: str
    patient_id: str
    patient_name: str
    patient_phone: str | None = None
    patient_email: str | None = None
    policy_id: str
    provider_id: str
    provider_name: str
    policy_number_masked: str
    consultation_fee: str
    fee_paise: int
    currency: str
    status: str
    status_label: str
    submitted_at: str | None = None
    created_at: str
    updated_at: str
    reviewer_id: str | None = None
    reviewer_name: str | None = None
    reviewed_at: str | None = None
    verification_remarks: str | None = None
    documents_count: int = 0
    notes: str | None = None
    insurer_claim_reference: str | None = None
    submission_method: str | None = None
    submitted_to_insurer_at: str | None = None
    approved_amount: str | None = None
    reimbursement_status: str | None = None
    reimbursement_status_label: str | None = None
    reimbursed_amount: str | None = None
    pending_reimbursement_amount: str | None = None


class ClinicAdminClaimListResponse(BaseModel):
    items: list[ClinicAdminClaimListItem]
    total: int
    page: int
    limit: int
    total_pages: int
    stats: ClinicAdminClaimStats


class ClaimDocumentVerificationItem(BaseModel):
    document_id: str
    status: Literal["verified", "rejected", "pending"]
    remarks: str | None = None


class ClinicAdminClaimVerifyRequest(BaseModel):
    action: Literal["mark_ready", "request_correction"]
    remarks: str | None = None
    document_decisions: list[ClaimDocumentVerificationItem] = Field(default_factory=list)


class ClinicAdminClaimVerifyResponse(BaseModel):
    id: str
    claim_reference: str
    status: str
    status_label: str
    message: str
    reviewer_id: str
    reviewed_at: str
    verification_remarks: str | None = None
    timeline_entry: ClaimTimelineEntry


class PatientClaimResubmitRequest(BaseModel):
    notes: str | None = None


class PatientClaimResubmitResponse(BaseModel):
    id: str
    claim_reference: str
    status: str
    status_label: str
    message: str
    resubmitted_at: str


# ==============================================================================
# CHECKPOINT 9: INSURER SUBMISSION & CLAIM STATUS TRACKING SCHEMAS
# ==============================================================================

class ClaimDocumentPackageProviderInfo(BaseModel):
    id: str
    provider_name: str
    provider_code: str
    provider_type: str
    country: str
    claim_submission_portal_url: str | None = None
    claim_submission_email: str | None = None
    contact_number: str | None = None
    official_website: str | None = None


class ClaimDocumentPackageResponse(BaseModel):
    claim_id: str
    claim_reference: str
    appointment_id: str
    appointment_display_id: str
    patient_id: str
    patient_name: str
    policy_id: str
    provider_name: str
    policy_number_masked: str
    consent_id: str
    consent_status: str
    consent_verified: bool
    provider_info: ClaimDocumentPackageProviderInfo
    documents: list[ClaimAuthorizedDocItem]
    package_generated_at: str
    total_documents: int


class SubmitToInsurerRequest(BaseModel):
    insurer_claim_reference: str = Field(..., min_length=2, max_length=100, description="Insurer's official claim reference/acknowledgment number")
    submission_method: Literal["portal", "email", "physical_dispatch", "tpa_portal", "other"] = Field(default="portal")
    submission_date: str | None = Field(default=None, description="YYYY-MM-DD or ISO timestamp")
    acknowledgment_document: str | None = Field(default=None, max_length=255)
    notes: str | None = None

    @field_validator("insurer_claim_reference")
    @classmethod
    def clean_reference(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Insurer claim reference is required")
        return cleaned


class SubmitToInsurerResponse(BaseModel):
    id: str
    claim_reference: str
    status: str
    status_label: str
    insurer_claim_reference: str
    submission_method: str
    submitted_to_insurer_at: str
    message: str
    timeline_entry: ClaimTimelineEntry


class InsurerStatusUpdateRequest(BaseModel):
    status: Literal[
        "under_insurer_review",
        "additional_documents_required",
        "approved",
        "partially_approved",
        "rejected",
    ]
    notes: str | None = None
    requested_documents: str | None = Field(default=None, description="Required if additional_documents_required")
    approved_amount: str | None = Field(default=None, description="Required if approved or partially_approved")
    approved_amount_paise: int | None = None
    co_pay_or_deduction_reason: str | None = Field(default=None, description="Required if partially_approved")
    rejection_reason: str | None = Field(default=None, description="Required if rejected")
    settlement_reference: str | None = Field(default=None, description="Required if approved, partially_approved, or rejected")
    evidence_document: str | None = None


class InsurerStatusUpdateResponse(BaseModel):
    id: str
    claim_reference: str
    status: str
    status_label: str
    approved_amount: str | None = None
    rejection_reason: str | None = None
    updated_at: str
    message: str
    timeline_entry: ClaimTimelineEntry


class PatientSubmitAdditionalDocsRequest(BaseModel):
    notes: str | None = None


class PatientSubmitAdditionalDocsResponse(BaseModel):
    id: str
    claim_reference: str
    status: str
    status_label: str
    message: str
    submitted_at: str


# ==============================================================================
# CHECKPOINT 10: PATIENT REIMBURSEMENT TRACKING SCHEMAS
# ==============================================================================

class ReimbursementTransactionItem(BaseModel):
    id: str
    claim_id: str
    reimbursement_amount: str
    amount_paise: int
    currency: str = "INR"
    reimbursement_date: str
    payment_reference: str  # Unmasked in admin, masked in patient
    payment_reference_masked: str
    payment_method: str
    payment_method_label: str
    supporting_evidence_id: str | None = None
    supporting_evidence_name: str | None = None
    supporting_evidence_url: str | None = None
    notes: str | None = None
    created_at: str
    recorded_by: str | None = None


class RecordReimbursementRequest(BaseModel):
    reimbursement_amount: str = Field(..., description="Reimbursement amount in Rupees, e.g. '800.00'")
    reimbursement_date: str = Field(..., description="YYYY-MM-DD date of reimbursement transaction")
    payment_reference: str = Field(..., min_length=2, max_length=100, description="Insurer bank transaction reference / UTR / Cheque number")
    payment_method: Literal["direct_bank_transfer", "neft_rtgs", "cheque", "upi", "nach_ecs", "other"] = Field(
        default="direct_bank_transfer"
    )
    supporting_evidence_id: str = Field(..., description="Document ID of insurer-issued payment advice / receipt")
    notes: str | None = None

    @field_validator("payment_reference")
    @classmethod
    def clean_ref(cls, v: str) -> str:
        cleaned = v.strip()
        if not cleaned:
            raise ValueError("Payment reference is required")
        return cleaned

    @field_validator("reimbursement_date")
    @classmethod
    def validate_date(cls, v: str) -> str:
        cleaned = v.strip()
        if not re.match(r"^\d{4}-\d{2}-\d{2}$", cleaned):
            raise ValueError("Reimbursement date must be in YYYY-MM-DD format")
        return cleaned

    @field_validator("supporting_evidence_id")
    @classmethod
    def clean_evidence_id(cls, v: str) -> str:
        cleaned = (v or "").strip()
        if not cleaned:
            raise ValueError("Supporting evidence document is mandatory to record reimbursement")
        return cleaned


class RecordReimbursementResponse(BaseModel):
    id: str
    claim_id: str
    claim_reference: str
    reimbursement_status: str
    reimbursement_status_label: str
    reimbursement_amount: str
    total_reimbursed_amount: str
    pending_reimbursement_amount: str
    is_fully_reimbursed: bool
    transaction: ReimbursementTransactionItem
    message: str
    timeline_entry: ClaimTimelineEntry


class ClaimReimbursementSummaryResponse(BaseModel):
    claim_id: str
    claim_reference: str
    appointment_id: str
    appointment_display_id: str
    doctor_name: str
    provider_name: str
    policy_number_masked: str
    original_consultation_fee: str
    original_fee_paise: int
    requested_claim_amount: str
    requested_amount_paise: int
    approved_amount: str
    approved_amount_paise: int
    reimbursed_amount: str
    reimbursed_amount_paise: int
    pending_reimbursement_amount: str
    pending_amount_paise: int
    currency: str = "INR"
    reimbursement_status: Literal["awaiting_reimbursement", "partially_reimbursed", "fully_reimbursed"]
    reimbursement_status_label: str
    transactions: list[ReimbursementTransactionItem] = Field(default_factory=list)
    reimbursements_count: int = 0
    last_reimbursement_date: str | None = None
    timeline: list[ClaimTimelineEntry] = Field(default_factory=list)


class ReimbursementEvidenceUploadResponse(BaseModel):
    id: str
    claim_id: str
    file_name: str
    content_type: str
    size_bytes: int
    download_url: str
    preview_url: str
    created_at: str





