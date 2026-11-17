from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock

import pytest

from teleconsult.kernel.authz.mongodb_policy import MongoPrincipal
from teleconsult.modules.admin import support_dashboard_routes
from teleconsult.modules.admin.support_dashboard_routes import (
    TicketUpdate,
    get_sla_info,
    update_support_ticket,
)


def test_sla_accepts_naive_mongodb_datetime() -> None:
    mongo_timestamp = datetime.now(UTC).replace(tzinfo=None) - timedelta(minutes=5)

    result = get_sla_info(mongo_timestamp, "MEDIUM", "OPEN")

    assert result["hours_target"] == 12
    assert result["status"] == "on_track"
    assert datetime.fromisoformat(result["due_at"]).tzinfo == UTC


def test_sla_status_matching_is_case_insensitive() -> None:
    old_mongo_timestamp = datetime.now(UTC).replace(tzinfo=None) - timedelta(days=2)

    result = get_sla_info(old_mongo_timestamp, "HIGH", "RESOLVED")

    assert result["hours_target"] == 4
    assert result["status"] == "met"


@pytest.mark.asyncio
async def test_reassignment_persists_and_records_ticket_and_audit_history(monkeypatch) -> None:
    ticket = {
        "id": "SUP-123456",
        "tenant_id": "tenant-1",
        "subject": "Help needed",
        "assigned_to": "agent-1",
        "assigned_to_name": "Agent One",
        "status": "OPEN",
        "priority": "MEDIUM",
        "created_at": datetime.now(UTC),
    }
    updated_ticket = {
        **ticket,
        "assigned_to": "agent-2",
        "assigned_to_name": "Agent Two",
    }
    tickets = MagicMock()
    tickets.find_one = AsyncMock(side_effect=[ticket, updated_ticket])
    tickets.update_one = AsyncMock()
    users = MagicMock()
    users.find_one = AsyncMock(return_value={
        "id": "agent-2",
        "tenant_id": "tenant-1",
        "role": "support",
        "active": True,
        "full_name": "Agent Two",
    })
    events = MagicMock()
    events.insert_one = AsyncMock()
    notifications = MagicMock()
    notifications.insert_one = AsyncMock()
    audit_logs = MagicMock()
    audit_logs.insert_one = AsyncMock()
    database = {
        "support_tickets": tickets,
        "users": users,
        "support_ticket_events": events,
        "notifications": notifications,
        "audit_logs": audit_logs,
    }
    monkeypatch.setattr(support_dashboard_routes.mongo_database, "database", lambda: database)

    result = await update_support_ticket(
        "SUP-123456",
        TicketUpdate(assigned_to="agent-2"),
        MongoPrincipal(user_id="manager-1", tenant_id="tenant-1", role="support"),
    )

    update = tickets.update_one.await_args.args[1]
    assert update["$set"]["assigned_to"] == "agent-2"
    assert update["$set"]["assigned_to_name"] == "Agent Two"
    assert update["$push"]["history"]["$each"][0]["action"] == "reassigned"
    audit = audit_logs.insert_one.await_args.args[0]
    assert audit["action"] == "support_ticket.assignment_changed"
    assert audit["metadata"]["previous_assigned_to"] == "agent-1"
    assert audit["metadata"]["assigned_to"] == "agent-2"
    assert result["assigned_to"] == "agent-2"
