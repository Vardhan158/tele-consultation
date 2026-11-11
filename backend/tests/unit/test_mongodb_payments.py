import hashlib
import hmac

from teleconsult.modules.payments.mongodb_repositories import (
    ensure_payment_transition,
    verify_payment_signature,
    verify_webhook_signature,
)


def test_payment_signatures_use_hmac_without_float_amounts() -> None:
    secret = "synthetic-secret"  # noqa: S105 - synthetic HMAC fixture
    order_id, payment_id = "order_test", "pay_test"
    signature = hmac.new(secret.encode(), f"{order_id}|{payment_id}".encode(), hashlib.sha256).hexdigest()
    assert verify_payment_signature(order_id=order_id, payment_id=payment_id, signature=signature, secret=secret)
    assert not verify_payment_signature(order_id=order_id, payment_id=payment_id, signature="bad", secret=secret)


def test_webhook_signature_uses_raw_body() -> None:
    secret, body = "synthetic-secret", b'{"event":"payment.captured"}'
    signature = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    assert verify_webhook_signature(body=body, signature=signature, secret=secret)
    assert not verify_webhook_signature(body=b"changed", signature=signature, secret=secret)


def test_successful_payment_cannot_be_reverted_to_failed() -> None:
    try:
        ensure_payment_transition("success", "failed")
    except Exception:
        pass
    else:
        raise AssertionError("payment success was reverted")
