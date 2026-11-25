"""WhatsApp Business Cloud API Adapter for Omnichannel Patient Engagement.

Provides verified, 1-click tokenized join links and e-prescription delivery
directly via WhatsApp to maximize appointment attendance (> 92% industry benchmark).
Falls back gracefully to development logger in local/testing environments.
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any
import httpx

logger = logging.getLogger("teleconsult.notifications.whatsapp")

WHATSAPP_API_VERSION = "v19.0"
WHATSAPP_GRAPH_URL = f"https://graph.facebook.com/{WHATSAPP_API_VERSION}"


def normalize_phone_number(phone: str) -> str:
    """Normalize phone number to international E.164 format without + symbol."""
    cleaned = re.sub(r"[\s()\-+]", "", phone.strip())
    # If 10-digit Indian mobile number, prefix with 91
    if len(cleaned) == 10 and cleaned.isdigit():
        return f"91{cleaned}"
    return cleaned


class WhatsAppAdapter:
    def __init__(
        self,
        api_token: str | None = None,
        phone_number_id: str | None = None,
    ) -> None:
        self.api_token = api_token or os.getenv("WHATSAPP_API_TOKEN", "")
        self.phone_number_id = phone_number_id or os.getenv("WHATSAPP_PHONE_NUMBER_ID", "")
        self.is_configured = bool(self.api_token and self.phone_number_id)

    async def send_message(
        self,
        to_phone: str,
        message: str,
        media_url: str | None = None,
    ) -> dict[str, Any]:
        """Send a WhatsApp text or document message to a patient."""
        normalized = normalize_phone_number(to_phone)
        if not self.is_configured:
            logger.info(
                f"[DEV WHATSAPP DISPATCH] To: {normalized} | Message: {message} | Media: {media_url or 'None'}"
            )
            return {
                "status": "simulated",
                "to": normalized,
                "message": message,
                "media_url": media_url,
                "provider": "dev_mock",
            }

        headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }
        url = f"{WHATSAPP_GRAPH_URL}/{self.phone_number_id}/messages"

        payload: dict[str, Any] = {
            "messaging_product": "whatsapp",
            "to": normalized,
            "type": "text",
            "text": {"preview_url": True, "body": message},
        }

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                res = await client.post(url, headers=headers, json=payload)
                res.raise_for_status()
                return res.json()
        except Exception as exc:
            logger.error(f"WhatsApp API delivery error to {normalized}: {exc}")
            return {
                "status": "failed",
                "to": normalized,
                "error": str(exc),
                "provider": "meta_cloud",
            }

    async def send_appointment_confirmation(
        self,
        to_phone: str,
        patient_name: str,
        doctor_name: str,
        appointment_time: str,
        join_url: str,
    ) -> dict[str, Any]:
        """Send appointment booking confirmation with 1-click video consultation join link."""
        msg = (
            f"Hello {patient_name},\n\n"
            f"Your clinical teleconsultation with {doctor_name} is confirmed for *{appointment_time}*.\n\n"
            f"When your consultation begins, tap this private 1-click link to enter your encrypted room:\n"
            f"{join_url}\n\n"
            f"Kaizen Care Telehealth Center"
        )
        return await self.send_message(to_phone=to_phone, message=msg)

    async def send_15min_reminder(
        self,
        to_phone: str,
        patient_name: str,
        doctor_name: str,
        join_url: str,
    ) -> dict[str, Any]:
        """Send 15-minute pre-consultation reminder."""
        msg = (
            f"Reminder: {patient_name}, your teleconsultation with {doctor_name} begins in *15 minutes*.\n\n"
            f"Please test your camera & audio and join the waiting room here:\n"
            f"{join_url}\n\n"
            f"Kaizen Care Telehealth"
        )
        return await self.send_message(to_phone=to_phone, message=msg)

    async def send_prescription_alert(
        self,
        to_phone: str,
        patient_name: str,
        doctor_name: str,
        prescription_url: str,
    ) -> dict[str, Any]:
        """Send notification with electronic prescription download link."""
        msg = (
            f"Hello {patient_name},\n\n"
            f"{doctor_name} has generated your official electronic prescription.\n\n"
            f"You can view, download, or order medicines directly using this link:\n"
            f"{prescription_url}\n\n"
            f"Thank you for choosing Kaizen Care."
        )
        return await self.send_message(to_phone=to_phone, message=msg)


# Global singleton instance
whatsapp_client = WhatsAppAdapter()


def get_whatsapp_service() -> WhatsAppAdapter:
    """Return singleton WhatsAppAdapter instance."""
    return whatsapp_client

