from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from teleconsult.modules.patient_portal.consent import PatientConsent


async def require_active_consent(session: AsyncSession, tenant_id: UUID, patient_id: UUID, consent_types: set[str]) -> None:
    rows = await session.scalars(select(PatientConsent).where(
        PatientConsent.tenant_id == tenant_id, PatientConsent.patient_id == patient_id,
        PatientConsent.consent_type.in_(consent_types), PatientConsent.status == "granted",
        PatientConsent.withdrawn_at.is_(None),
    ))
    active = {row.consent_type for row in rows}
    if not consent_types.issubset(active):
        raise HTTPException(status_code=403, detail="Required consent has not been granted or has been withdrawn")
