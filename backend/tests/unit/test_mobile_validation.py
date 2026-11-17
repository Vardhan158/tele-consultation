import pytest
from pydantic import ValidationError

from teleconsult.modules.identity.doctor_routes import DoctorRegistration
from teleconsult.modules.identity.schemas import RegisterRequest
from teleconsult.modules.patient_portal.schemas import PatientCreate, PatientProfileUpdate


def test_register_request_mobile_validation():
    # Valid 10-digit mobile numbers
    req1 = RegisterRequest(
        full_name="John Doe",
        email="john@example.com",
        mobile_number="9876543210",
        password="Password123!",
        confirm_password="Password123!",
        terms_version="v1",
        terms_accepted=True,
    )
    assert req1.mobile_number == "9876543210"

    req2 = RegisterRequest(
        full_name="John Doe",
        email="john@example.com",
        mobile_number="+919876543210",
        password="Password123!",
        confirm_password="Password123!",
        terms_version="v1",
        terms_accepted=True,
    )
    assert req2.mobile_number == "+919876543210"

    # Invalid: 9 digits
    with pytest.raises(ValidationError):
        RegisterRequest(
            full_name="John Doe",
            email="john@example.com",
            mobile_number="987654321",
            password="Password123!",
            confirm_password="Password123!",
            terms_version="v1",
            terms_accepted=True,
        )

    # Invalid: 11 digits
    with pytest.raises(ValidationError):
        RegisterRequest(
            full_name="John Doe",
            email="john@example.com",
            mobile_number="98765432101",
            password="Password123!",
            confirm_password="Password123!",
            terms_version="v1",
            terms_accepted=True,
        )


def test_doctor_registration_mobile_validation():
    doc = DoctorRegistration(
        full_name="Dr. Smith",
        email="smith@example.com",
        mobile_number="+91 9876543210",
        password="Password123!",
        registration_number="REG12345",
        experience_years=5,
        qualifications=["MBBS"],
        languages=["English"],
    )
    assert doc.mobile_number == "+91 9876543210"

    with pytest.raises(ValidationError):
        DoctorRegistration(
            full_name="Dr. Smith",
            email="smith@example.com",
            mobile_number="12345",
            password="Password123!",
            registration_number="REG12345",
            experience_years=5,
            qualifications=["MBBS"],
            languages=["English"],
        )


def test_patient_schemas_mobile_validation():
    pat = PatientCreate(
        full_name="Jane Doe",
        email="jane@example.com",
        phone="9876543210",
    )
    assert pat.phone == "9876543210"

    with pytest.raises(ValidationError):
        PatientCreate(
            full_name="Jane Doe",
            email="jane@example.com",
            phone="12345678",
        )

    upd = PatientProfileUpdate(
        phone="+919876543210",
        pharmacy_phone="9876543210",
    )
    assert upd.phone == "+919876543210"

    with pytest.raises(ValidationError):
        PatientProfileUpdate(phone="1234")

    with pytest.raises(ValidationError):
        PatientProfileUpdate(pharmacy_phone="99999")
