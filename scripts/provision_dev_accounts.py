"""Provision isolated local integration identities; refuses to run outside dev/local."""
import asyncio
import os
import secrets
from datetime import datetime, UTC
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from teleconsult.config.settings import get_settings
from teleconsult.kernel.db.session import get_engine
from teleconsult.modules.identity.auth_routes import password_hash
from teleconsult.modules.identity.models import UserAccount
from teleconsult.modules.patient_portal.models import Doctor, Patient
from teleconsult.modules.patient_portal.consent import PatientConsent


async def main() -> None:
    settings = get_settings()
    if settings.environment not in {"dev", "local"}:
        raise SystemExit("Refusing to provision accounts outside dev/local environment")
    tenant_id = UUID(settings.default_tenant_id)
    credentials = {
        "admin": (os.getenv("DEV_ADMIN_EMAIL", "clinic-admin@teleconsult.local"), os.getenv("DEV_ADMIN_PASSWORD") or secrets.token_urlsafe(18)),
        "doctor": (os.getenv("DEV_DOCTOR_EMAIL", "doctor@teleconsult.local"), os.getenv("DEV_DOCTOR_PASSWORD") or secrets.token_urlsafe(18)),
        "patient": (os.getenv("DEV_PATIENT_EMAIL", "patient@teleconsult.local"), os.getenv("DEV_PATIENT_PASSWORD") or secrets.token_urlsafe(18)),
    }
    maker = async_sessionmaker(get_engine(), expire_on_commit=False)
    async with maker() as session, session.begin():
        users = {}
        for role, (email, password) in credentials.items():
            user = await session.scalar(select(UserAccount).where(UserAccount.tenant_id == tenant_id, UserAccount.email == email.lower()))
            if user is None:
                user = UserAccount(id=uuid4(), tenant_id=tenant_id, full_name=f"Integration {role.title()}", email=email.lower(), mobile_number="0000000000", password_hash=password_hash(password), terms_version="dev-integration", terms_accepted_at=datetime.now(UTC), verified_at=datetime.now(UTC), role="clinic_admin" if role == "admin" else role)
                session.add(user); await session.flush()
            elif user.role != ("clinic_admin" if role == "admin" else role):
                raise SystemExit(f"Existing account {email} has unexpected role; refusing to alter it")
            users[role] = (user, password)
        doctor_user = users["doctor"][0]
        doctor = await session.scalar(select(Doctor).where(Doctor.user_account_id == doctor_user.id, Doctor.tenant_id == tenant_id))
        if doctor is None:
            doctor = Doctor(tenant_id=tenant_id, user_account_id=doctor_user.id, full_name=doctor_user.full_name, specialty="Integration Medicine", clinic_name="Integration Clinic", registration_number=f"DEV-{secrets.token_hex(4)}", qualifications=["MBBS"], experience_years=5, languages=["en"], supported_languages=["en"], active=False, approved_for_consultation=False, approval_status="pending")
            session.add(doctor)
        patient_user = users["patient"][0]
        patient = await session.scalar(select(Patient).where(Patient.id == patient_user.id, Patient.tenant_id == tenant_id))
        if patient is None:
            session.add(Patient(id=patient_user.id, tenant_id=tenant_id, full_name=patient_user.full_name, email=patient_user.email, phone="0000000000"))
        for consent_type in ("telehealth", "treatment"):
            existing = await session.scalar(select(PatientConsent).where(PatientConsent.tenant_id == tenant_id, PatientConsent.patient_id == patient_user.id, PatientConsent.consent_type == consent_type, PatientConsent.status == "granted"))
            if existing is None:
                session.add(PatientConsent(tenant_id=tenant_id, patient_id=patient_user.id, consent_type=consent_type, version="dev-integration", status="granted"))
    print("Development integration accounts provisioned:")
    for role, (email, password) in credentials.items(): print(f"{role}: {email} / {password}")


if __name__ == "__main__": asyncio.run(main())
