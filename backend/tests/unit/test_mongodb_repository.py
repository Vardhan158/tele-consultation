from datetime import UTC, datetime
from uuid import UUID

from teleconsult.kernel.mongodb.repository import serialize_document


def test_repository_serialization_preserves_safe_api_values() -> None:
    document = serialize_document({
        "id": UUID("00000000-0000-0000-0000-000000000001"),
        "created_at": datetime(2026, 1, 1, tzinfo=UTC),
        "nested": {"count": 2},
    })
    assert document["id"] == "00000000-0000-0000-0000-000000000001"
    assert document["created_at"].startswith("2026-01-01T")
    assert document["nested"] == {"count": 2}
