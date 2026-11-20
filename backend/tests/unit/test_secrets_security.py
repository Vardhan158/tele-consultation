import inspect
import pytest
from teleconsult.config.settings import Settings
from teleconsult.modules.payments import patient_routes


def test_production_secrets_fail_fast_when_missing():
    """In production/staging, missing secrets must raise RuntimeError to prevent insecure deployment."""
    prod_settings = Settings(
        environment="production",
        database_url="",
        mongodb_enabled=True,
        mongodb_uri="",
        razorpay_key_id="",
        razorpay_key_secret="",
    )

    with pytest.raises(RuntimeError) as exc_info:
        prod_settings.validate_production_configuration()

    assert "Production startup failed" in str(exc_info.value)
    assert "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET" in str(exc_info.value)


def test_production_secrets_pass_when_configured():
    """In production, when all required credentials are provided, validation passes without error."""
    prod_settings = Settings(
        environment="production",
        database_url="postgresql+asyncpg://user:pass@localhost:5432/teleconsult",
        razorpay_key_id="rzp_live_realKey123",
        razorpay_key_secret="real_secret_token_abc456",
        clinical_encryption_key="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    )

    # Should not raise
    prod_settings.validate_production_configuration()


def test_dev_environment_permits_local_boot():
    """In dev mode, local boot is permitted without live production credentials."""
    dev_settings = Settings(
        environment="dev",
        database_url="",
        razorpay_key_id="",
        razorpay_key_secret="",
    )

    # Should not raise in dev
    dev_settings.validate_production_configuration()


def test_patient_routes_source_contains_no_hardcoded_secrets():
    """Verify that candidate_secrets in patient_routes does not contain any hardcoded test secret strings."""
    source = inspect.getsource(patient_routes.verify_payment)

    # Verify former test secrets have been completely purged
    assert "kaizentrix_test_secret_12345" not in source
    assert "l0wIalwefClE3hHfLvyHg832" not in source
    assert "WidTX3FijxB03ePRSecret" not in source
