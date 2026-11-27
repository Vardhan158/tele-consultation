import pytest
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

from teleconsult.modules.identity.nmc_verifier import (
    INDIAN_MEDICAL_COUNCILS,
    DoctorVerificationRequest,
    DoctorVerificationResult,
    MedicalCouncilVerificationEngine,
    compute_name_similarity,
    validate_hpr_id,
)
from teleconsult.modules.identity.doctor_routes import (
    list_medical_councils,
    verify_doctor_license_precheck,
)
from teleconsult.modules.admin.routes import reverify_doctor_license


def test_indian_medical_councils_catalog():
    """Verify statutory Indian medical councils are defined with valid regex patterns."""
    assert "Karnataka Medical Council" in INDIAN_MEDICAL_COUNCILS
    assert "Maharashtra Medical Council" in INDIAN_MEDICAL_COUNCILS
    assert "Delhi Medical Council" in INDIAN_MEDICAL_COUNCILS
    assert "Tamil Nadu Medical Council" in INDIAN_MEDICAL_COUNCILS
    assert "National Medical Commission" in INDIAN_MEDICAL_COUNCILS

    codes = [c["code"] for c in INDIAN_MEDICAL_COUNCILS.values()]
    assert "KMC" in codes
    assert "MMC" in codes
    assert "DMC" in codes
    assert "TNMC" in codes
    assert "NMC" in codes

    for name, info in INDIAN_MEDICAL_COUNCILS.items():
        assert "code" in info
        assert "state" in info
        assert "patterns" in info
        assert len(info["patterns"]) > 0


def test_abdm_hpr_id_validation():
    """Verify ABDM Healthcare Professional ID syntax checks."""
    # Valid 14-digit format
    valid, formatted = validate_hpr_id("12-3456-7890-1234")
    assert valid is True
    assert formatted == "12-3456-7890-1234"

    valid, formatted = validate_hpr_id("99111122223333")
    assert valid is True
    assert formatted == "99-1111-2222-3333"

    # Valid alias format
    valid, formatted = validate_hpr_id("dr.rajesh@hpr.abdm")
    assert valid is True
    assert formatted == "dr.rajesh@hpr.abdm"

    # Invalid formats
    valid, formatted = validate_hpr_id("12345")
    assert valid is False
    assert formatted is None

    valid, _ = validate_hpr_id("invalid_format_without_domain")
    assert valid is False

    valid, _ = validate_hpr_id("")
    assert valid is False

    valid, _ = validate_hpr_id(None)
    assert valid is False


def test_name_similarity_calculation():
    """Verify fuzzy matching for doctor identity reconciliation."""
    # Exact name match
    score = compute_name_similarity("Dr. Rajesh Sharma", "Dr. Rajesh Sharma")
    assert score == 1.0

    # Prefix normalization
    score = compute_name_similarity("Dr. Rajesh Sharma", "Rajesh Sharma")
    assert score >= 0.90

    # Minor spelling variation
    score = compute_name_similarity("Dr. Sunita Rao", "Dr. Suneeta Rao")
    assert score >= 0.70

    # Completely different names
    score = compute_name_similarity("Dr. Rajesh Sharma", "Dr. Priya Deshmukh")
    assert score < 0.50


def test_verify_license_ground_truth_match():
    """Verify license verification against recognized sample registry."""
    req = DoctorVerificationRequest(
        full_name="Dr. Arvind Rao",
        registration_number="KMC-2014-98745",
        medical_council="Karnataka Medical Council",
        hpr_id="12-3456-7890-1234",
    )
    result = MedicalCouncilVerificationEngine.verify_license(req)

    assert result.is_valid is True
    assert result.status == "VERIFIED_ACTIVE"
    assert result.confidence_score >= 0.95
    assert result.council_code == "KMC"
    assert "Karnataka Medical Council" in result.council_name
    assert result.hpr_verified is True
    assert result.verification_receipt_id.startswith("NMC-")


def test_verify_license_pattern_match_unregistered_num():
    """Verify pattern validation succeeds for valid format not in mock registry."""
    req = DoctorVerificationRequest(
        full_name="Dr. Vikram Patel",
        registration_number="MMC-99881",
        medical_council="Maharashtra Medical Council",
        specialty="General Surgery",
    )
    result = MedicalCouncilVerificationEngine.verify_license(req)

    assert result.is_valid is True
    assert result.status == "VERIFIED_ACTIVE"
    assert result.council_code == "MMC"
    assert result.confidence_score >= 0.85


def test_verify_license_invalid_council():
    """Verify handling when council is completely invalid."""
    req = DoctorVerificationRequest(
        full_name="Dr. Generic Practitioner",
        registration_number="REG-778899",
        medical_council="Nonexistent Medical Authority",
    )
    result = MedicalCouncilVerificationEngine.verify_license(req)

    assert result.is_valid is False
    assert result.status == "INVALID_COUNCIL"
    assert result.confidence_score == 0.0


@pytest.mark.asyncio
async def test_get_medical_councils_endpoint():
    """Verify GET /doctor/medical-councils API route."""
    res = await list_medical_councils()
    assert isinstance(res, list)
    assert len(res) >= 10
    codes = [c["code"] for c in res]
    assert "KMC" in codes
    assert "DMC" in codes
    assert "MMC" in codes


@pytest.mark.asyncio
async def test_verify_license_precheck_endpoint():
    """Verify POST /doctor/verify-license-precheck API route."""
    req = DoctorVerificationRequest(
        full_name="Dr. Priya Deshmukh",
        registration_number="MMC/2012/04581",
        medical_council="Maharashtra Medical Council",
    )
    result = await verify_doctor_license_precheck(req)
    assert isinstance(result, DoctorVerificationResult)
    assert result.is_valid is True
    assert result.status == "VERIFIED_ACTIVE"
    assert result.confidence_score >= 0.95


@pytest.mark.asyncio
async def test_reverify_doctor_license_endpoint():
    """Verify Clinic Admin POST /admin/doctors/{doctor_id}/reverify-license route."""
    from teleconsult.kernel.authz.policy import Principal

    mock_doc = {
        "id": "doc-test-123",
        "user_id": "usr-test-123",
        "tenant_id": "default-clinic",
        "full_name": "Dr. Rohit Sharma",
        "registration_number": "DMC/R/10452",
        "medical_council": "Delhi Medical Council",
        "council_code": "DMC",
        "hpr_id": "14-5555-6666-7777",
    }

    mock_db = MagicMock()
    mock_db.__getitem__.return_value.find_one = AsyncMock(return_value=mock_doc)
    mock_db.__getitem__.return_value.update_one = AsyncMock()
    mock_db.__getitem__.return_value.insert_one = AsyncMock()

    mock_request = MagicMock()
    mock_principal = Principal(
        user_id="adm-1",
        tenant_id="default-clinic",
        roles=frozenset(["admin"]),
        permissions=frozenset(["*"]),
    )

    with patch("teleconsult.modules.admin.routes._verify_admin", new=AsyncMock(return_value=mock_principal)), \
         patch("teleconsult.modules.admin.routes.mongo_database.database", return_value=mock_db), \
         patch("teleconsult.config.settings.get_settings") as mock_settings:
        mock_settings.return_value.mongodb_enabled = True
        mock_settings.return_value.default_tenant_id = "default-clinic"

        res = await reverify_doctor_license("doc-test-123", mock_request)

        assert res["doctor_id"] == "doc-test-123"
        assert res["verification_status"] == "verified_active"
        assert res["verification_details"]["status"] == "VERIFIED_ACTIVE"
        assert res["council_code"] == "DMC"
        assert res["confidence_score"] >= 0.90
        assert res["hpr_verified"] is True
        mock_db.__getitem__.return_value.update_one.assert_called_once()
