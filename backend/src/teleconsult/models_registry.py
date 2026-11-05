# Imports every model so Alembic sees the full metadata.
from teleconsult.kernel.events import outbox  # noqa: F401
from teleconsult.modules.audit import models as audit_models  # noqa: F401
from teleconsult.modules.consent import models as consent_models  # noqa: F401
from teleconsult.modules.consultation import models as consultation_models  # noqa: F401
from teleconsult.modules.directory import models as directory_models  # noqa: F401
from teleconsult.modules.identity import models as identity_models  # noqa: F401
from teleconsult.modules.notifications import models as notifications_models  # noqa: F401
from teleconsult.modules.payments import models as payments_models  # noqa: F401
from teleconsult.modules.records import models as records_models  # noqa: F401
from teleconsult.modules.reporting import models as reporting_models  # noqa: F401
from teleconsult.modules.scheduling import models as scheduling_models  # noqa: F401
from teleconsult.modules.support_access import models as support_access_models  # noqa: F401
from teleconsult.modules.tenancy import models as tenancy_models  # noqa: F401
from teleconsult.modules.patient_portal.models import Appointment, AppointmentEvent, Doctor, DoctorAvailability, Patient  # noqa: F401
from teleconsult.modules.patient_portal.consent import PatientConsent  # noqa: F401
from teleconsult.modules.audit.models import AuditRecord  # noqa: F401
from teleconsult.modules.identity.models import AuthSession, RecoveryToken, UserAccount  # noqa: F401
from teleconsult.modules.patient_portal.intake import MedicalIntake  # noqa: F401
from teleconsult.modules.payments.models import PaymentTransaction  # noqa: F401
from teleconsult.modules.notifications.models import Notification  # noqa: F401
from teleconsult.modules.consultation.video_models import VideoSession  # noqa: F401
from teleconsult.modules.records.patient_models import PatientDocument  # noqa: F401
from teleconsult.modules.records.clinical_models import ConsultationSummary, Prescription  # noqa: F401
from teleconsult.modules.support_access.patient_models import FollowUpAction, SupportTicket  # noqa: F401
from teleconsult.modules.tenancy.core_models import Clinic, Specialty  # noqa: F401
from teleconsult.modules.payments.refund_models import Refund  # noqa: F401
from teleconsult.modules.consultation.clinical_models import ClinicalNote, ClinicalNoteAmendment, Consultation  # noqa: F401
from teleconsult.modules.consultation.video_models import VideoSession, VideoSessionEvent  # noqa: F401
