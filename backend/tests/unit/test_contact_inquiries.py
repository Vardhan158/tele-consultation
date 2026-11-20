from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from teleconsult.modules.contact import routes


class Collection:
    def __init__(self):
        self.inserted = []

    async def insert_one(self, doc):
        self.inserted.append(doc)
        return SimpleNamespace(inserted_id="mock-id")


class Database:
    def __init__(self):
        self.collections = {"contact_inquiries": Collection()}

    def __getitem__(self, name):
        return self.collections[name]


@pytest.fixture
def setup(monkeypatch):
    database = Database()
    settings = SimpleNamespace(mongodb_enabled=True, default_tenant_id="1")
    monkeypatch.setattr(routes, "get_settings", lambda: settings)
    monkeypatch.setattr(routes.mongo_database, "database", lambda: database)
    return database


@pytest.mark.asyncio
async def test_valid_inquiry_submits_successfully(setup):
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    payload = routes.ContactInquiryCreate(
        name="Jane Doe",
        email="jane.doe@example.com",
        phone="9876543210",
        subject="Appointments",
        message="I would like to know if weekend appointments are available.",
        privacy_consent=True,
    )
    response = await routes.create_contact_inquiry(payload, request)

    assert response.status == "received"
    assert "inquiry has been received" in response.message
    assert len(setup.collections["contact_inquiries"].inserted) == 1
    doc = setup.collections["contact_inquiries"].inserted[0]
    assert doc["name"] == "Jane Doe"
    assert doc["email"] == "jane.doe@example.com"
    assert doc["phone"] == "9876543210"
    assert doc["subject"] == "Appointments"
    assert doc["privacy_consent"] is True


@pytest.mark.asyncio
async def test_inquiry_with_phone_formatting(setup):
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    payload = routes.ContactInquiryCreate(
        name="John Smith",
        email="john@example.com",
        phone="+91 9876543210",
        subject="Technical help",
        message="Trouble logging into patient portal.",
        privacy_consent=True,
    )
    response = await routes.create_contact_inquiry(payload, request)
    assert response.status == "received"
    doc = setup.collections["contact_inquiries"].inserted[0]
    assert doc["phone"] == "9876543210"


@pytest.mark.asyncio
async def test_inquiry_without_phone_optional(setup):
    request = SimpleNamespace(client=SimpleNamespace(host="127.0.0.1"))
    payload = routes.ContactInquiryCreate(
        name="John Smith",
        email="john@example.com",
        phone=None,
        subject="Other",
        message="General inquiry about clinic facilities.",
        privacy_consent=True,
    )
    response = await routes.create_contact_inquiry(payload, request)
    assert response.status == "received"
    doc = setup.collections["contact_inquiries"].inserted[0]
    assert doc["phone"] is None


def test_inquiry_fails_without_privacy_consent():
    with pytest.raises(ValidationError):
        routes.ContactInquiryCreate(
            name="Jane Doe",
            email="jane@example.com",
            phone=None,
            subject="Finding care",
            message="Need consultation info.",
            privacy_consent=False,
        )


def test_inquiry_fails_with_invalid_phone():
    with pytest.raises(ValidationError):
        routes.ContactInquiryCreate(
            name="Jane Doe",
            email="jane@example.com",
            phone="12345",  # not 10 digits
            subject="Finding care",
            message="Need consultation info.",
            privacy_consent=True,
        )


def test_inquiry_fails_with_blank_fields():
    with pytest.raises(ValidationError):
        routes.ContactInquiryCreate(
            name="   ",
            email="jane@example.com",
            phone=None,
            subject="Finding care",
            message="Need consultation info.",
            privacy_consent=True,
        )
