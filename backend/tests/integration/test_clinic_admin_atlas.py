import pytest

from .clinic_admin_atlas_config import atlas_test_config


def test_live_suite_fails_closed_without_explicit_isolated_config(monkeypatch):
    monkeypatch.delenv("CLINIC_ADMIN_TEST_MONGODB_URI", raising=False)
    monkeypatch.delenv("CLINIC_ADMIN_TEST_MONGODB_DATABASE", raising=False)
    with pytest.raises(RuntimeError, match="Set .*CLINIC_ADMIN_TEST"):
        atlas_test_config()
