from types import SimpleNamespace

import pytest

from teleconsult.kernel.authz.policy import Principal
from teleconsult.modules.identity import doctor_routes


class Users:
    def __init__(self):
        self.document = {"id": "doctor-1", "tenant_id": "tenant-1", "role": "doctor"}

    async def find_one(self, query):
        return dict(self.document) if query.get("id") == self.document["id"] else None

    async def update_one(self, query, update):
        self.document.update(update.get("$set", {}))
        for key, value in update.get("$inc", {}).items():
            self.document[key] = self.document.get(key, 0) + value


@pytest.mark.asyncio
async def test_mongodb_mfa_enrollment_and_verification(monkeypatch):
    users = Users()
    db = {"users": users}
    monkeypatch.setattr(doctor_routes.mongo_database, "database", lambda: db)
    monkeypatch.setattr(doctor_routes, "get_settings", lambda: SimpleNamespace(mongodb_enabled=True))
    principal = Principal("doctor-1", "tenant-1", frozenset({"doctor"}), frozenset({"doctor:profile:write"}))

    enrolled = await doctor_routes.enroll_mfa(None, principal)
    assert len(enrolled["secret"]) >= 16
    assert len(enrolled["recovery_codes"]) == 8
    assert users.document["mfa_enabled"] is False

    code = doctor_routes._totp(users.document["mfa_secret"])
    assert await doctor_routes.verify_mfa(doctor_routes.MfaCode(code=code), None, principal) == {"status": "enabled"}
    assert users.document["mfa_enabled"] is True


@pytest.mark.asyncio
async def test_mongodb_mfa_verification_rejects_malformed_legacy_state(monkeypatch):
    users = Users()
    users.document.update({"mfa_secret": "not-base32", "mfa_enrollment_expires_at": "not-a-date", "mfa_failed_attempts": 0})
    monkeypatch.setattr(doctor_routes.mongo_database, "database", lambda: {"users": users})
    monkeypatch.setattr(doctor_routes, "get_settings", lambda: SimpleNamespace(mongodb_enabled=True))
    principal = Principal("doctor-1", "tenant-1", frozenset({"doctor"}), frozenset({"doctor:profile:write"}))
    with pytest.raises(Exception) as error:
        await doctor_routes.verify_mfa(doctor_routes.MfaCode(code="123456"), None, principal)
    assert getattr(error.value, "status_code", None) == 400
