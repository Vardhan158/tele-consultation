from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from teleconsult.kernel.authz.policy import Principal
from teleconsult.modules.patient_portal import routes
from teleconsult.modules.patient_portal.schemas import ConsentCreate


@pytest.mark.asyncio
async def test_get_consent_documents():
    principal = Principal(
        user_id=str(uuid4()),
        tenant_id=str(uuid4()),
        roles=frozenset({"patient"}),
        permissions=frozenset({"patient:profile:read"}),
    )
    docs = await routes.get_consent_documents(principal)
    assert len(docs) >= 3
    types = [d.consent_type for d in docs]
    assert "teleconsultation" in types
    assert "health_data_privacy" in types
    assert "medical_record_sharing" in types

    tele_doc = next(d for d in docs if d.consent_type == "teleconsultation")
    assert tele_doc.category == "essential"
    assert tele_doc.required is True
    assert len(tele_doc.sections) >= 3

    sharing_doc = next(d for d in docs if d.consent_type == "medical_record_sharing")
    assert sharing_doc.category == "optional"
    assert sharing_doc.required is False


@pytest.mark.asyncio
async def test_grant_and_list_consents_flow():
    tenant_id = str(uuid4())
    user_id = str(uuid4())
    principal = Principal(
        user_id=user_id,
        tenant_id=tenant_id,
        roles=frozenset({"patient"}),
        permissions=frozenset({"patient:profile:read", "patient:profile:write"}),
    )

    mock_db = MagicMock()
    mock_consents_col = MagicMock()
    mock_audit_col = MagicMock()
    mock_patients_col = MagicMock()
    mock_users_col = MagicMock()

    storage = []

    async def mock_insert(doc):
        storage.append(dict(doc))
        return MagicMock(acknowledged=True)

    async def mock_update_many(filter_dict, update_dict):
        for item in storage:
            match = True
            if "consent_type" in filter_dict:
                in_list = filter_dict["consent_type"].get("$in", [])
                if item.get("consent_type") not in in_list:
                    match = False
            if match:
                item.update(update_dict.get("$set", {}))
        return MagicMock(modified_count=1)

    class MockCursor:
        def __init__(self, data):
            self.data = list(data)

        def sort(self, *args, **kwargs):
            return self

        async def to_list(self, limit):
            return self.data

    mock_consents_col.insert_one = AsyncMock(side_effect=mock_insert)
    mock_consents_col.update_many = AsyncMock(side_effect=mock_update_many)
    mock_consents_col.find.side_effect = lambda *args, **kwargs: MockCursor(storage)
    mock_audit_col.insert_one = AsyncMock(return_value=MagicMock(acknowledged=True))
    mock_patients_col.find_one = AsyncMock(return_value={"id": str(user_id), "user_id": str(user_id)})
    mock_users_col.find_one = AsyncMock(return_value=None)

    def get_collection(name):
        if name == "consents":
            return mock_consents_col
        if name == "audit_logs":
            return mock_audit_col
        if name == "patients":
            return mock_patients_col
        if name == "users":
            return mock_users_col
        return MagicMock()

    mock_db.__getitem__.side_effect = get_collection

    with patch("teleconsult.kernel.mongodb.client.mongo_database.database", return_value=mock_db), \
         patch("teleconsult.config.settings.get_settings") as mock_settings:
        mock_settings.return_value.mongodb_enabled = True

        res = await routes.grant_consent(
            ConsentCreate(consent_type="teleconsultation", version="v2.1"),
            principal,
        )
        assert res.consent_type == "teleconsultation"
        assert res.status == "granted"
        assert res.category == "essential"
        assert len(storage) == 1

        all_consents = await routes.list_consents(principal)
        assert len(all_consents) == 1
        assert all_consents[0].consent_type == "teleconsultation"
        assert all_consents[0].status == "granted"

        # Now test withdrawal
        mock_consents_col.find_one = AsyncMock(return_value=storage[0])
        withdraw_res = await routes.withdraw_consent("teleconsultation", principal)
        assert withdraw_res.consent_type == "teleconsultation"
        assert withdraw_res.status == "withdrawn"
