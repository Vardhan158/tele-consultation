from fastapi import APIRouter
from teleconsult.config.settings import get_settings

router = APIRouter(prefix="/config", tags=["configuration"])


@router.get("/patient-portal")
async def patient_portal_configuration() -> dict[str, object]:
    settings = get_settings()
    return {
        "auth_method": settings.auth_method,
        "payment_mode": settings.payment_mode,
        "intake_policy": settings.intake_policy,
        "prescriptions_enabled": settings.prescriptions_enabled,
        "video_provider_configured": settings.video_provider != "unconfigured",
        "video_join_window_minutes": settings.video_join_window_minutes,
        "audio_only_allowed": settings.audio_only_allowed,
        "cancellation_deadline_hours": settings.cancellation_deadline_hours,
        "max_reschedules": settings.max_reschedules,
        "mobile_launch_mode": settings.mobile_launch_mode,
        "clinical_record_retention_days": settings.clinical_record_retention_days,
        "clinic_model": settings.clinic_model,
    }
