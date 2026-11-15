import asyncio
import hashlib
import html
import logging
import secrets
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from teleconsult.config.settings import get_settings
from teleconsult.kernel.mongodb.client import mongo_database


async def public_access() -> None:
    """Explicitly mark intentionally public newsletter endpoints for route audits."""


public_access._is_authz = True
router = APIRouter(prefix="/api/newsletter", tags=["newsletter"], dependencies=[Depends(public_access)])
log = logging.getLogger("teleconsult.newsletter")
GENERIC_MESSAGE = "If this address can be subscribed, we’ll send a verification email shortly."


class SubscribeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    consent: bool = Field(...)


def normalized(email: str) -> str:
    return email.strip().casefold()


def digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def website_url() -> str:
    value = get_settings().newsletter_website_url.strip().rstrip("/")
    if not value.startswith("https://"):
        raise HTTPException(503, "Newsletter website URL is not configured")
    return value


def api_url() -> str:
    value = get_settings().newsletter_api_base_url.strip().rstrip("/")
    if not value.startswith("https://"):
        raise HTTPException(503, "Newsletter API URL is not configured")
    return value


def email_html(kind: str, link: str | None = None) -> str:
    settings = get_settings()
    site = html.escape(website_url())
    contact = html.escape(getattr(settings, "brevo_sender_email", "") or getattr(settings, "email_from", "") or "")
    poster = html.escape(settings.newsletter_poster_url.strip()) if settings.newsletter_poster_url.startswith("https://") else ""
    if kind == "verify":
        body = f'<h1>Confirm your Kaizen Care updates</h1><p>You asked to receive Kaizen Care healthcare updates and platform announcements. Confirm your subscription to activate it.</p><p><a class="button" href="{html.escape(link or "")}">Confirm subscription</a></p><p class="muted">This link expires soon. If you did not request this, you can ignore this email.</p>'
        subject = "Confirm your Kaizen Care subscription"
    else:
        poster_block = f'<img class="poster" src="{poster}" alt="Kaizen Care healthcare services" />' if poster else ""
        body = f'{poster_block}<h1>Your Care, Closer to You</h1><p>Kaizen Care helps patients connect with healthcare professionals through online consultations, appointment booking and secure digital healthcare services.</p><ul><li>Discover available doctors</li><li>Book appointments online</li><li>Attend online consultations</li><li>Keep consultation records in one place</li></ul><p><a class="button" href="{site}">Explore Kaizen Care</a></p><p class="muted"><a href="{html.escape(link or "")}">Unsubscribe</a> from future promotional emails.</p>'
        subject = "Welcome to Kaizen Care"
    footer = f'<p class="muted">Kaizen Care{f" · {contact}" if contact else ""}</p>'
    return f'''<!doctype html><html><head><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><style>body{{margin:0;background:#f0f5f7;font-family:Arial,sans-serif;color:#162623}}.wrap{{max-width:620px;margin:24px auto;background:#fff;border-radius:18px;overflow:hidden}}.top{{background:#185a4d;color:#fff;padding:24px 28px;font-size:22px;font-weight:700}}.content{{padding:30px 28px;line-height:1.6}}h1{{color:#185a4d;font-size:28px;line-height:1.2}}.button{{display:inline-block;background:#25836f;color:#fff!important;padding:13px 22px;border-radius:9px;text-decoration:none;font-weight:700}}.muted{{font-size:12px;color:#577877}}.poster{{display:block;width:100%;height:auto;border-radius:12px;margin-bottom:18px}}a{{color:#25836f}}</style></head><body><div class="wrap"><div class="top">Kaizen Care</div><div class="content">{body}{footer}</div></div></body></html>'''


async def send_with_retries(email: str, subject: str, text: str, html_content: str) -> None:
    from teleconsult.modules.identity.auth_routes import send_brevo_email
    for attempt in range(3):
        try:
            await send_brevo_email(email, subject, text, html_content=html_content)
            return
        except Exception:
            log.exception("Newsletter email delivery failed", extra={"attempt": attempt + 1})
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)
    log.error("Newsletter email abandoned after retries", extra={"email_hash": digest(email)})


async def _collections():
    if not mongo_database.enabled:
        raise HTTPException(503, "Newsletter subscriptions are temporarily unavailable")
    try:
        db = mongo_database.database()
    except RuntimeError as exc:
        raise HTTPException(503, "Newsletter subscriptions are temporarily unavailable") from exc
    subscribers = db["newsletter_subscribers"]
    limits = db["newsletter_rate_limits"]
    await subscribers.create_index("email", unique=True)
    await subscribers.create_index("verification_expires_at", expireAfterSeconds=0)
    await limits.create_index("expires_at", expireAfterSeconds=0)
    return subscribers, limits


async def audit(event: str, email: str, **metadata: object) -> None:
    try:
        await mongo_database.database()["newsletter_events"].insert_one({"event": event, "email_hash": digest(email), "metadata": metadata, "created_at": datetime.now(UTC)})
    except Exception:
        log.exception("Newsletter audit write failed", extra={"event": event})


@router.post("/subscribe", status_code=202)
async def subscribe(payload: SubscribeRequest, request: Request):
    if payload.consent is not True:
        raise HTTPException(422, "Marketing-email consent is required")
    subscribers, limits = await _collections()
    email = normalized(str(payload.email))
    now = datetime.now(UTC)
    ip_hash = digest(request.client.host if request.client else "unknown")
    window = now.replace(minute=0, second=0, microsecond=0)
    limit_key = f"{ip_hash}:{window.isoformat()}"
    limit = await limits.find_one_and_update({"_id": limit_key, "expires_at": {"$gt": now}}, {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": window + timedelta(hours=1)}}, upsert=True, return_document=ReturnDocument.AFTER)
    if limit and limit.get("count", 0) > get_settings().newsletter_rate_limit_per_hour:
        raise HTTPException(429, "Too many subscription attempts. Please try again later.")
    existing = await subscribers.find_one({"email": email})
    if existing and existing.get("status") == "active":
        return {"message": GENERIC_MESSAGE}
    token = secrets.token_urlsafe(32)
    expires = now + timedelta(minutes=get_settings().newsletter_token_ttl_minutes)
    update = {"email": email, "status": "pending", "consent_timestamp": now, "verification_token_hash": digest(token), "verification_expires_at": expires, "updated_at": now}
    try:
        await subscribers.update_one({"email": email}, {"$set": update, "$setOnInsert": {"created_at": now}}, upsert=True)
    except DuplicateKeyError:
        return {"message": GENERIC_MESSAGE}
    await audit("subscription_pending", email)
    link = f"{api_url()}/api/newsletter/verify?{urlencode({'token': token})}"
    asyncio.create_task(send_with_retries(email, "Confirm your Kaizen Care subscription", "Confirm your subscription: " + link, email_html("verify", link)))
    return {"message": GENERIC_MESSAGE}


@router.get("/verify")
async def verify(token: str):
    subscribers, _ = await _collections()
    now = datetime.now(UTC)
    record = await subscribers.find_one({"verification_token_hash": digest(token), "status": "pending", "verification_expires_at": {"$gt": now}})
    if not record:
        raise HTTPException(400, "This verification link is invalid or expired")
    welcome_token = secrets.token_urlsafe(24)
    unsubscribe = f"{api_url()}/api/newsletter/unsubscribe?{urlencode({'token': welcome_token})}"
    await subscribers.update_one({"_id": record["_id"], "status": "pending"}, {"$set": {"status": "active", "subscribed_at": now, "updated_at": now, "unsubscribe_token_hash": digest(welcome_token)}, "$unset": {"verification_token_hash": "", "verification_expires_at": ""}})
    await audit("subscription_activated", record["email"])
    asyncio.create_task(send_with_retries(record["email"], "Welcome to Kaizen Care", "Explore Kaizen Care: " + website_url(), email_html("welcome", unsubscribe)))
    return {"status": "active", "message": "Your subscription is confirmed. You can close this page."}


@router.get("/unsubscribe")
async def unsubscribe(token: str):
    subscribers, _ = await _collections()
    result = await subscribers.update_one({"status": "active", "unsubscribe_token_hash": digest(token)}, {"$set": {"status": "unsubscribed", "unsubscribed_at": datetime.now(UTC), "updated_at": datetime.now(UTC)}})
    if result.matched_count == 0:
        raise HTTPException(400, "This unsubscribe link is invalid or expired")
    await audit("subscription_unsubscribed", token)
    return {"status": "unsubscribed", "message": "You have been unsubscribed from Kaizen Care promotional emails."}
