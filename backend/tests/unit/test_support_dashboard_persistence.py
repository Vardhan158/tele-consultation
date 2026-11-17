from datetime import UTC, datetime, timedelta

from teleconsult.modules.admin.support_dashboard_routes import get_sla_info


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
