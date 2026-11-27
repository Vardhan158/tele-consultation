"""Insurance notifications and alerts service.

Integrates with the existing notification collection and Brevo email service.
Provides role-specific notification dispatch, deduplication, retry handling,
and policy expiry scanning while strictly preserving clinical privacy.
"""
import html
import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import uuid4

from teleconsult.config.settings import get_settings
from teleconsult.kernel.mongodb.client import mongo_database

logger = logging.getLogger("teleconsult.insurance_notifications")

DEFAULT_NOTIFICATION_CONFIG = {
    "policy_expiry_reminder_days": 30,
    "claim_pending_reminder_hours": 24,
    "pending_claim_reminder_hours": 24,
    "notification_dedup_window_minutes": 60,
    "dedup_window_minutes": 60,
    "email_notifications_enabled": True,
    "email_enabled": True,
    "in_app_notifications_enabled": True,
    "in_app_enabled": True,
}


async def get_notification_config(db: Any, tenant_id: str) -> dict[str, Any]:
    """Retrieve tenant notification configuration with sensible defaults."""
    cfg = await db["clinic_configs"].find_one({
        "tenant_id": tenant_id,
        "config_type": "insurance_notifications",
    })
    if not cfg:
        cfg = {}
    policy_days = int(cfg.get("policy_expiry_reminder_days", 30))
    hours = int(cfg.get("claim_pending_reminder_hours") or cfg.get("pending_claim_reminder_hours") or 24)
    dedup_mins = int(cfg.get("notification_dedup_window_minutes") or cfg.get("dedup_window_minutes") or 60)
    email_on = bool(cfg.get("email_notifications_enabled", cfg.get("email_enabled", True)))
    in_app_on = bool(cfg.get("in_app_notifications_enabled", cfg.get("in_app_enabled", True)))
    return {
        "policy_expiry_reminder_days": policy_days,
        "claim_pending_reminder_hours": hours,
        "pending_claim_reminder_hours": hours,
        "notification_dedup_window_minutes": dedup_mins,
        "dedup_window_minutes": dedup_mins,
        "email_notifications_enabled": email_on,
        "email_enabled": email_on,
        "in_app_notifications_enabled": in_app_on,
        "in_app_enabled": in_app_on,
    }


async def update_notification_config(db: Any, tenant_id: str, updates: dict[str, Any]) -> dict[str, Any]:
    """Update tenant notification configuration."""
    now_iso = datetime.now(UTC).isoformat()
    clean_updates = {k: v for k, v in updates.items() if v is not None}
    if "pending_claim_reminder_hours" in clean_updates and "claim_pending_reminder_hours" not in clean_updates:
        clean_updates["claim_pending_reminder_hours"] = clean_updates["pending_claim_reminder_hours"]
    if "dedup_window_minutes" in clean_updates and "notification_dedup_window_minutes" not in clean_updates:
        clean_updates["notification_dedup_window_minutes"] = clean_updates["dedup_window_minutes"]
    if "email_enabled" in clean_updates and "email_notifications_enabled" not in clean_updates:
        clean_updates["email_notifications_enabled"] = clean_updates["email_enabled"]
    if "in_app_enabled" in clean_updates and "in_app_notifications_enabled" not in clean_updates:
        clean_updates["in_app_notifications_enabled"] = clean_updates["in_app_enabled"]

    clean_updates["updated_at"] = now_iso
    await db["clinic_configs"].update_one(
        {"tenant_id": tenant_id, "config_type": "insurance_notifications"},
        {"$set": clean_updates, "$setOnInsert": {"created_at": now_iso}},
        upsert=True,
    )
    return await get_notification_config(db, tenant_id)


def build_insurance_email_html(subject: str, message_body: str, target_link_text: str = "View in Portal") -> str:
    """Generate a responsive, brand-compliant HTML email without exposing clinical/medical data."""
    clean_subject = html.escape(subject)
    clean_body = html.escape(message_body)
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{clean_subject}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #F0F5F7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #162623;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #F0F5F7; padding: 24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" max-width="600" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; border: 1px solid #d2e4e2; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #185A4D 0%, #25836F 100%); padding: 24px 32px; text-align: left;">
              <table role="presentation" width="100%">
                <tr>
                  <td>
                    <span style="font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.5px;">Kaizen Care</span>
                    <span style="display: block; font-size: 11px; color: #d2f0eb; text-transform: uppercase; letter-spacing: 1px; font-weight: 600; margin-top: 4px;">Health Insurance &amp; Reimbursement Portal</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px; font-size: 14px; line-height: 1.6; color: #2d3748;">
              <h2 style="margin: 0 0 16px 0; font-size: 18px; font-weight: 700; color: #185A4D;">{clean_subject}</h2>
              <p style="margin: 0 0 20px 0; color: #4a5568; font-size: 14px; line-height: 1.6;">{clean_body}</p>

              <div style="background-color: #F0F5F7; border-left: 4px solid #25836F; padding: 12px 16px; border-radius: 8px; margin: 24px 0;">
                <p style="margin: 0; font-size: 12px; color: #185A4D; font-weight: 600;">
                  Privacy &amp; Security Notice:
                </p>
                <p style="margin: 4px 0 0 0; font-size: 11px; color: #577877; line-height: 1.5;">
                  Kaizen Care notifications never contain confidential medical records, diagnoses, or prescriptions in email transmissions. Log in to your secure portal to review full details.
                </p>
              </div>

              <table role="presentation" cellspacing="0" cellpadding="0" style="margin-top: 24px;">
                <tr>
                  <td align="center" style="border-radius: 10px; background-color: #185A4D;">
                    <a href="https://teleconsult.kaizencare.com" style="display: inline-block; padding: 12px 24px; font-size: 13px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 10px;">
                      {clean_body and target_link_text}
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 32px; border-top: 1px solid #edf2f7; font-size: 11px; color: #718096; line-height: 1.5;">
              <p style="margin: 0 0 4px 0;">This is an automated notification from Kaizen Care Teleconsultation Platform.</p>
              <p style="margin: 0;">&copy; {datetime.now(UTC).year} Kaizen Care. All rights reserved. Do not reply to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


async def deliver_brevo_email_safe(
    recipient_email: str,
    subject: str,
    body: str,
) -> tuple[str, str | None]:
    """Deliver transactional email using Brevo integration safely.
    Returns (status: 'delivered' | 'sandboxed' | 'failed', error_message: str | None)."""
    settings = get_settings()
    sender = getattr(settings, "brevo_sender_email", None) or getattr(settings, "email_from", None)
    api_key = getattr(settings, "brevo_api_key", None)

    # In dev, test, or when API key is missing -> mark as sandboxed
    if settings.environment in {"dev", "local", "test"} or not api_key or not sender:
        logger.info("Brevo email sandboxed for %s: %s", recipient_email, subject)
        return "sandboxed", None

    try:
        from teleconsult.modules.identity.auth_routes import send_brevo_email
        html_content = build_insurance_email_html(subject, body)
        await send_brevo_email(
            email=recipient_email,
            subject=subject,
            text=body,
            html_content=html_content,
        )
        return "delivered", None
    except Exception as exc:
        logger.warning("Brevo email failed for %s (%s): %s", recipient_email, subject, exc)
        return "failed", str(exc)


async def send_insurance_notification(
    db: Any,
    *,
    tenant_id: str,
    event_type: str,
    recipient_role: str,
    subject: str,
    body: str,
    notification_type: str | None = None,
    recipient_id: str | None = None,
    recipient_email: str | None = None,
    claim_id: str | None = None,
    claim_reference: str | None = None,
    policy_id: str | None = None,
    appointment_id: str | None = None,
    appointment_display_id: str | None = None,
    provider_name: str | None = None,
    extra_metadata: dict[str, Any] | None = None,
    force_send: bool = False,
) -> dict[str, Any]:
    """Central notification dispatcher for health insurance events.
    Enforces deduplication, records in-app notification in MongoDB, and triggers Brevo email."""
    now_dt = datetime.now(UTC)
    now_iso = now_dt.isoformat()

    # Retrieve tenant notification configuration
    cfg = await get_notification_config(db, tenant_id)
    dedup_window_mins = cfg.get("notification_dedup_window_minutes", 60)

    # 1. Deduplication Guard
    if not force_send:
        dedup_cutoff = (now_dt - timedelta(minutes=dedup_window_mins)).isoformat()
        dedup_query: dict[str, Any] = {
            "tenant_id": tenant_id,
            "event_type": event_type,
            "created_at": {"$gte": dedup_cutoff},
        }
        if recipient_id:
            dedup_query["recipient_id"] = recipient_id
        else:
            dedup_query["recipient_role"] = recipient_role

        if claim_id:
            dedup_query["claim_id"] = claim_id
        elif policy_id:
            dedup_query["policy_id"] = policy_id

        existing = await db["notifications"].find_one(dedup_query)
        if existing:
            logger.info("Suppressed duplicate notification %s for %s", event_type, recipient_id or recipient_role)
            return existing

    # 2. Resolve recipient email if not provided
    if not recipient_email and recipient_id:
        user_doc = await db["users"].find_one({"id": recipient_id})
        if user_doc and user_doc.get("email"):
            recipient_email = user_doc["email"]

    # 3. Email Delivery Attempt
    email_status = "skipped"
    email_error = None
    if cfg.get("email_notifications_enabled", True) and recipient_email:
        email_status, email_error = await deliver_brevo_email_safe(
            recipient_email=recipient_email,
            subject=subject,
            body=body,
        )

    # 4. Construct Notification Record
    notif_id = f"notif-ins-{uuid4().hex[:12]}"
    target_tab = "my-insurance" if recipient_role == "patient" else "clinic-insurance"

    metadata = {
        "claim_id": claim_id,
        "claim_reference": claim_reference,
        "policy_id": policy_id,
        "appointment_id": appointment_id,
        "appointment_display_id": appointment_display_id,
        "provider_name": provider_name,
        **(extra_metadata or {}),
    }

    resolved_type = notification_type or event_type

    notification_doc = {
        "id": notif_id,
        "tenant_id": tenant_id,
        "recipient_id": recipient_id,
        "recipient_role": recipient_role,
        "recipient_email": recipient_email,
        "event_type": event_type,
        "type": resolved_type,
        "notification_type": resolved_type,
        "channel": "in_app",
        "subject": subject,
        "title": subject,
        "body": body,
        "message": body,
        "status": "delivered",
        "delivery_status": "delivered",
        "email_delivery_status": email_status,
        "email_error": email_error,
        "email_retries": 0,
        "read_at": None,
        "read": False,
        "claim_id": claim_id,
        "claim_reference": claim_reference,
        "policy_id": policy_id,
        "appointment_id": appointment_id,
        "target_tab": target_tab,
        "target_id": claim_id or policy_id,
        "metadata": metadata,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    await db["notifications"].insert_one(notification_doc)
    return notification_doc


# =========================================================================
# PATIENT NOTIFICATION DISPATCHERS (9 Scenarios)
# =========================================================================

async def notify_patient_claim_submitted(
    db: Any,
    *,
    tenant_id: str,
    patient_id: str,
    patient_email: str | None = None,
    claim_id: str,
    claim_reference: str,
    appointment_display_id: str,
    provider_name: str,
) -> dict[str, Any]:
    """1. Insurance claim submitted successfully."""
    subject = "Insurance Claim Submitted Successfully"
    body = (
        f"Your insurance claim {claim_reference} for appointment {appointment_display_id} "
        f"({provider_name}) has been received and queued for internal document verification."
    )
    return await send_insurance_notification(
        db,
        tenant_id=tenant_id,
        recipient_id=patient_id,
        recipient_role="patient",
        recipient_email=patient_email,
        event_type="insurance_claim_submitted",
        notification_type="insurance_claim_submitted",
        subject=subject,
        body=body,
        claim_id=claim_id,
        claim_reference=claim_reference,
        appointment_display_id=appointment_display_id,
        provider_name=provider_name,
    )


async def notify_patient_claim_verified(
    db: Any,
    *,
    tenant_id: str,
    patient_id: str,
    patient_email: str | None = None,
    claim_id: str,
    claim_reference: str,
    provider_name: str,
) -> dict[str, Any]:
    """2. Claim document verification completed."""
    subject = "Claim Document Verification Completed"
    body = (
        f"Your insurance claim dossier {claim_reference} has passed internal verification "
        f"and is marked ready for transmission to {provider_name}."
    )
    return await send_insurance_notification(
        db,
        tenant_id=tenant_id,
        recipient_id=patient_id,
        recipient_role="patient",
        recipient_email=patient_email,
        event_type="claim_verification_completed",
        notification_type="insurance_claim_verified",
        subject=subject,
        body=body,
        claim_id=claim_id,
        claim_reference=claim_reference,
        provider_name=provider_name,
    )


async def notify_patient_claim_correction_required(
    db: Any,
    *,
    tenant_id: str,
    patient_id: str,
    patient_email: str | None = None,
    claim_id: str,
    claim_reference: str,
    remarks: str,
) -> dict[str, Any]:
    """3. Claim correction required."""
    subject = "Action Required: Insurance Claim Correction Needed"
    body = (
        f"Clinic administration requested corrections for claim {claim_reference}: "
        f"{remarks}. Please update and resubmit your claim documents."
    )
    return await send_insurance_notification(
        db,
        tenant_id=tenant_id,
        recipient_id=patient_id,
        recipient_role="patient",
        recipient_email=patient_email,
        event_type="claim_correction_required",
        notification_type="insurance_claim_correction_required",
        subject=subject,
        body=body,
        claim_id=claim_id,
        claim_reference=claim_reference,
        extra_metadata={"remarks": remarks},
    )


async def notify_patient_claim_submitted_to_insurer(
    db: Any,
    *,
    tenant_id: str,
    patient_id: str,
    patient_email: str | None = None,
    claim_id: str,
    claim_reference: str,
    provider_name: str,
    insurer_claim_reference: str,
    submission_method: str = "portal",
) -> dict[str, Any]:
    """4. Claim submitted to insurer."""
    subject = "Insurance Claim Transmitted to Insurer"
    body = (
        f"Your claim {claim_reference} has been transmitted to {provider_name} "
        f"via {submission_method} (Insurer Ref: {insurer_claim_reference}). Adjudication is in progress."
    )
    return await send_insurance_notification(
        db,
        tenant_id=tenant_id,
        recipient_id=patient_id,
        recipient_role="patient",
        recipient_email=patient_email,
        event_type="claim_submitted_to_insurer",
        notification_type="insurance_claim_submitted_to_insurer",
        subject=subject,
        body=body,
        claim_id=claim_id,
        claim_reference=claim_reference,
        provider_name=provider_name,
        extra_metadata={"insurer_claim_reference": insurer_claim_reference},
    )
    """4. Claim submitted to insurer."""
    subject = "Insurance Claim Transmitted to Insurer"
    body = (
        f"Your claim {claim_reference} has been transmitted to {provider_name} "
        f"via {submission_method} (Insurer Ref: {insurer_claim_reference}). Adjudication is in progress."
    )
    return await send_insurance_notification(
        db,
        tenant_id=tenant_id,
        recipient_id=patient_id,
        recipient_role="patient",
        recipient_email=patient_email,
        event_type="claim_submitted_to_insurer",
        subject=subject,
        body=body,
        claim_id=claim_id,
        claim_reference=claim_reference,
        provider_name=provider_name,
        extra_metadata={"insurer_claim_reference": insurer_claim_reference},
    )


async def notify_patient_additional_documents_requested(
    db: Any,
    *,
    tenant_id: str,
    patient_id: str,
    patient_email: str | None = None,
    claim_id: str,
    claim_reference: str,
    provider_name: str,
    requested_documents: str,
) -> dict[str, Any]:
    """5. Additional documents requested by insurer."""
    subject = "Action Required: Additional Claim Documents Requested"
    body = (
        f"{provider_name} requested additional documentation for claim {claim_reference}: "
        f"{requested_documents}. Please upload the requested files through your portal."
    )
    return await send_insurance_notification(
        db,
        tenant_id=tenant_id,
        recipient_id=patient_id,
        recipient_role="patient",
        recipient_email=patient_email,
        event_type="additional_documents_requested",
        notification_type="insurance_claim_additional_documents_required",
        subject=subject,
        body=body,
        claim_id=claim_id,
        claim_reference=claim_reference,
        provider_name=provider_name,
        extra_metadata={"requested_documents": requested_documents},
    )


async def notify_patient_claim_adjudicated(
    db: Any,
    *,
    tenant_id: str,
    patient_id: str,
    patient_email: str | None = None,
    claim_id: str,
    claim_reference: str,
    provider_name: str,
    adjudication_status: str,  # 'approved' | 'partially_approved' | 'rejected'
    approved_amount: str | None = None,
    co_pay_reason: str | None = None,
    rejection_reason: str | None = None,
    settlement_reference: str | None = None,
) -> dict[str, Any]:
    """6. Claim approved, partially approved or rejected."""
    if adjudication_status == "approved":
        subject = "Insurance Claim Approved"
        body = (
            f"Great news! Your claim {claim_reference} was approved by {provider_name} "
            f"for ₹{approved_amount} (Settlement Ref: {settlement_reference or 'N/A'})."
        )
    elif adjudication_status == "partially_approved":
        subject = "Insurance Claim Partially Approved"
        body = (
            f"Your claim {claim_reference} was partially approved by {provider_name} "
            f"for ₹{approved_amount}. Deduction reason: {co_pay_reason or 'Non-covered items'}."
        )
    else:
        subject = "Insurance Claim Adjudication Decision"
        body = (
            f"Your claim {claim_reference} was not approved by {provider_name}. "
            f"Reason: {rejection_reason or 'Policy criteria not met'}. Review portal for full notice."
        )

    return await send_insurance_notification(
        db,
        tenant_id=tenant_id,
        recipient_id=patient_id,
        recipient_role="patient",
        recipient_email=patient_email,
        event_type=f"claim_{adjudication_status}",
        notification_type=f"insurance_claim_{adjudication_status}",
        subject=subject,
        body=body,
        claim_id=claim_id,
        claim_reference=claim_reference,
        provider_name=provider_name,
        extra_metadata={
            "adjudication_status": adjudication_status,
            "approved_amount": approved_amount,
            "settlement_reference": settlement_reference,
        },
    )


async def notify_patient_reimbursement_recorded(
    db: Any,
    *,
    tenant_id: str,
    patient_id: str,
    patient_email: str | None = None,
    claim_id: str,
    claim_reference: str,
    amount: str,
    pending_amount: str,
    masked_ref: str,
    is_full: bool,
) -> dict[str, Any]:
    """7 & 8. Partial or full reimbursement recorded."""
    if is_full:
        subject = "Insurance Claim Fully Reimbursed"
        body = (
            f"Final reimbursement payment of ₹{amount} has been verified for claim {claim_reference} "
            f"(Ref: {masked_ref}). Your claim is now fully reimbursed."
        )
        event_type = "full_reimbursement_recorded"
    else:
        subject = "Partial Reimbursement Payment Recorded"
        body = (
            f"An insurer reimbursement payment of ₹{amount} has been recorded for claim {claim_reference} "
            f"(Ref: {masked_ref}). Remaining pending balance: ₹{pending_amount}."
        )
        event_type = "partial_reimbursement_recorded"

    return await send_insurance_notification(
        db,
        tenant_id=tenant_id,
        recipient_id=patient_id,
        recipient_role="patient",
        recipient_email=patient_email,
        event_type=event_type,
        notification_type="insurance_reimbursement_update",
        subject=subject,
        body=body,
        claim_id=claim_id,
        claim_reference=claim_reference,
        extra_metadata={
            "reimbursed_amount": amount,
            "pending_amount": pending_amount,
            "masked_reference": masked_ref,
            "is_full": is_full,
        },
    )


async def notify_patient_policy_expiring(
    db: Any,
    *,
    tenant_id: str,
    patient_id: str,
    patient_email: str | None = None,
    policy_id: str,
    provider_name: str,
    policy_number_masked: str,
    expiry_date: str,
    days_remaining: int,
) -> dict[str, Any]:
    """9. Insurance policy approaching expiry."""
    subject = "Health Insurance Policy Approaching Expiry"
    body = (
        f"Your {provider_name} policy ({policy_number_masked}) is scheduled to expire in "
        f"{days_remaining} days on {expiry_date}. Please update your policy details in My Insurance."
    )
    return await send_insurance_notification(
        db,
        tenant_id=tenant_id,
        recipient_id=patient_id,
        recipient_role="patient",
        recipient_email=patient_email,
        event_type="insurance_policy_expiring",
        notification_type="insurance_policy_expiring",
        subject=subject,
        body=body,
        policy_id=policy_id,
        provider_name=provider_name,
        extra_metadata={
            "expiry_date": expiry_date,
            "days_remaining": days_remaining,
            "policy_number_masked": policy_number_masked,
        },
    )


# =========================================================================
# CLINIC ADMIN NOTIFICATION DISPATCHERS (6 Scenarios)
# =========================================================================

async def notify_admin_new_claim_received(
    db: Any,
    *,
    tenant_id: str,
    claim_id: str,
    claim_reference: str,
    patient_name: str,
    appointment_display_id: str,
    provider_name: str,
) -> dict[str, Any]:
    """1. New insurance claim received."""
    subject = "New Insurance Claim Received"
    body = (
        f"Patient {patient_name} submitted reimbursement claim {claim_reference} "
        f"({provider_name}) for appointment {appointment_display_id}. Queued for document verification."
    )
    return await send_insurance_notification(
        db,
        tenant_id=tenant_id,
        recipient_id="clinic_admin",
        recipient_role="clinic_admin",
        event_type="admin_new_claim_received",
        notification_type="insurance_claim_admin_action_required",
        subject=subject,
        body=body,
        claim_id=claim_id,
        claim_reference=claim_reference,
        appointment_display_id=appointment_display_id,
        provider_name=provider_name,
        extra_metadata={"patient_name": patient_name},
    )


async def notify_admin_claim_resubmitted(
    db: Any,
    *,
    tenant_id: str,
    claim_id: str,
    claim_reference: str,
    patient_name: str,
) -> dict[str, Any]:
    """2. Patient corrected and resubmitted claim."""
    subject = "Corrected Insurance Claim Resubmitted"
    body = (
        f"Patient {patient_name} addressed requested corrections and resubmitted "
        f"claim {claim_reference} for verification review."
    )
    return await send_insurance_notification(
        db,
        tenant_id=tenant_id,
        recipient_id="clinic_admin",
        recipient_role="clinic_admin",
        event_type="admin_claim_resubmitted",
        notification_type="insurance_claim_resubmitted",
        subject=subject,
        body=body,
        claim_id=claim_id,
        claim_reference=claim_reference,
        extra_metadata={"patient_name": patient_name},
    )


async def notify_admin_claim_pending_verification(
    db: Any,
    *,
    tenant_id: str,
    claim_id: str,
    claim_reference: str,
    hours_pending: int,
) -> dict[str, Any]:
    """3. Claim pending document verification reminder."""
    subject = "Reminder: Claim Pending Document Verification"
    body = (
        f"Claim {claim_reference} has been awaiting clinic document verification "
        f"for over {hours_pending} hours. Please audit clinical records and verify consent."
    )
    return await send_insurance_notification(
        db,
        tenant_id=tenant_id,
        recipient_id="clinic_admin",
        recipient_role="clinic_admin",
        event_type="admin_claim_pending_verification",
        notification_type="insurance_claim_pending_verification",
        subject=subject,
        body=body,
        claim_id=claim_id,
        claim_reference=claim_reference,
        extra_metadata={"hours_pending": hours_pending},
    )


async def notify_admin_verified_claim_pending_submission(
    db: Any,
    *,
    tenant_id: str,
    claim_id: str,
    claim_reference: str,
    provider_name: str,
) -> dict[str, Any]:
    """4. Verified claim pending insurer submission."""
    subject = "Claim Ready for Insurer Transmission"
    body = (
        f"Claim {claim_reference} is verified and ready for transmission to {provider_name}. "
        f"Please download authorized dossier and submit via insurer channel."
    )
    return await send_insurance_notification(
        db,
        tenant_id=tenant_id,
        recipient_id="clinic_admin",
        recipient_role="clinic_admin",
        event_type="admin_verified_claim_pending_submission",
        notification_type="insurance_claim_ready_for_submission",
        subject=subject,
        body=body,
        claim_id=claim_id,
        claim_reference=claim_reference,
        provider_name=provider_name,
    )


async def notify_admin_additional_documents_uploaded(
    db: Any,
    *,
    tenant_id: str,
    claim_id: str,
    claim_reference: str,
    patient_name: str,
) -> dict[str, Any]:
    """5. Additional documents uploaded by patient."""
    subject = "Patient Uploaded Insurer-Requested Documents"
    body = (
        f"Patient {patient_name} uploaded additional documents for claim {claim_reference}. "
        f"Claim status updated to Under Insurer Review."
    )
    return await send_insurance_notification(
        db,
        tenant_id=tenant_id,
        recipient_id="clinic_admin",
        recipient_role="clinic_admin",
        event_type="admin_additional_documents_uploaded",
        notification_type="insurance_claim_additional_docs_submitted",
        subject=subject,
        body=body,
        claim_id=claim_id,
        claim_reference=claim_reference,
        extra_metadata={"patient_name": patient_name},
    )


async def notify_admin_approved_awaiting_reimbursement(
    db: Any,
    *,
    tenant_id: str,
    claim_id: str,
    claim_reference: str,
    provider_name: str,
    approved_amount: str,
) -> dict[str, Any]:
    """6. Approved claim awaiting reimbursement confirmation."""
    subject = "Approved Claim Awaiting Reimbursement Reconciliation"
    body = (
        f"Claim {claim_reference} was approved by {provider_name} for ₹{approved_amount}. "
        f"Awaiting reimbursement settlement entry."
    )
    return await send_insurance_notification(
        db,
        tenant_id=tenant_id,
        recipient_id="clinic_admin",
        recipient_role="clinic_admin",
        event_type="admin_approved_awaiting_reimbursement",
        notification_type="insurance_claim_approved",
        subject=subject,
        body=body,
        claim_id=claim_id,
        claim_reference=claim_reference,
        provider_name=provider_name,
        extra_metadata={"approved_amount": approved_amount},
    )


# =========================================================================
# BACKGROUND SCANNER: POLICY EXPIRY & PENDING CLAIM REMINDERS
# =========================================================================

async def scan_and_notify_expiring_policies(db: Any, tenant_id: str | None = None) -> list[dict[str, Any]]:
    """Scan active policies approaching expiry and dispatch notifications."""
    query: dict[str, Any] = {"status": "Active"}
    if tenant_id:
        query["tenant_id"] = tenant_id

    # Resolve config
    default_cfg = dict(DEFAULT_NOTIFICATION_CONFIG)
    if tenant_id:
        default_cfg = await get_notification_config(db, tenant_id)
    reminder_days = default_cfg.get("policy_expiry_reminder_days", 30)

    now_dt = datetime.now(UTC)
    today_str = now_dt.strftime("%Y-%m-%d")
    max_expiry_str = (now_dt + timedelta(days=reminder_days)).strftime("%Y-%m-%d")

    query["expiry_date"] = {"$gte": today_str, "$lte": max_expiry_str}

    dispatched = []
    cursor = db["insurance_policies"].find(query)
    async for policy in cursor:
        p_tenant = policy.get("tenant_id")
        p_patient = policy.get("patient_id") or policy.get("user_id")
        p_id = policy.get("id")
        p_expiry = policy.get("expiry_date")
        if not (p_tenant and p_patient and p_id and p_expiry):
            continue

        try:
            exp_date = datetime.strptime(p_expiry, "%Y-%m-%d").date()
            days_left = (exp_date - now_dt.date()).days
        except Exception:
            days_left = reminder_days

        # Suppress if already reminded within 14 days
        cooldown_cutoff = (now_dt - timedelta(days=14)).isoformat()
        recent = await db["notifications"].find_one({
            "tenant_id": p_tenant,
            "policy_id": p_id,
            "event_type": "insurance_policy_expiring",
            "created_at": {"$gte": cooldown_cutoff},
        })
        if recent:
            continue

        res = await notify_patient_policy_expiring(
            db,
            tenant_id=p_tenant,
            patient_id=p_patient,
            policy_id=p_id,
            provider_name=policy.get("provider_name", "Insurance Provider"),
            policy_number_masked=policy.get("policy_number_masked", "•••• ••••"),
            expiry_date=p_expiry,
            days_remaining=max(0, days_left),
        )
        dispatched.append(res)

    return dispatched


async def scan_and_notify_pending_claims(db: Any, tenant_id: str | None = None) -> list[dict[str, Any]]:
    """Scan claims pending verification exceeding reminder threshold and notify clinic admins."""
    query: dict[str, Any] = {"status": "pending_document_verification"}
    if tenant_id:
        query["tenant_id"] = tenant_id

    default_cfg = dict(DEFAULT_NOTIFICATION_CONFIG)
    if tenant_id:
        default_cfg = await get_notification_config(db, tenant_id)
    threshold_hours = default_cfg.get("pending_claim_reminder_hours", 24)

    now_dt = datetime.now(UTC)
    cutoff_iso = (now_dt - timedelta(hours=threshold_hours)).isoformat()
    query["created_at"] = {"$lte": cutoff_iso}

    dispatched = []
    cursor = db["insurance_claims"].find(query)
    async for claim in cursor:
        c_tenant = claim.get("tenant_id")
        c_id = claim.get("id")
        claim_ref = claim.get("claim_reference") or c_id
        if not (c_tenant and c_id):
            continue

        created_str = claim.get("created_at")
        hours_pending = threshold_hours
        if created_str:
            try:
                dt = datetime.fromisoformat(created_str.replace("Z", "+00:00"))
                hours_pending = max(int((now_dt - dt).total_seconds() / 3600), threshold_hours)
            except ValueError:
                pass

        notif = await notify_admin_claim_pending_verification(
            db,
            tenant_id=c_tenant,
            claim_id=c_id,
            claim_reference=claim_ref,
            hours_pending=hours_pending,
        )
        if notif:
            dispatched.append(notif)

    return dispatched
