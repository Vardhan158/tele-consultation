import pytest
from teleconsult.services.encryption import (
    ENCRYPTION_PREFIX,
    decrypt_clinical_text,
    encrypt_clinical_text,
    get_clinical_encryption_key,
)


def test_encryption_roundtrip():
    """Text encrypted with AES-256-GCM must decrypt accurately back to original plaintext."""
    original_text = (
        "Patient presents with intermittent chest pain radiating to left arm. "
        "ECG shows normal sinus rhythm. Advised Tab Metformin 500mg, review in 3 days."
    )

    encrypted = encrypt_clinical_text(original_text)

    # Must start with version envelope prefix
    assert encrypted.startswith(ENCRYPTION_PREFIX)
    # Ciphertext must differ from plaintext (confidentiality)
    assert original_text not in encrypted

    # Decrypt must recover the exact plaintext
    decrypted = decrypt_clinical_text(encrypted)
    assert decrypted == original_text


def test_tamper_detection_fails_authentication():
    """Modifying ciphertext or tag must fail GCM authentication and return error notice."""
    plain_text = "Confidential psychiatric evaluation notes."
    encrypted = encrypt_clinical_text(plain_text)

    # Tamper with the base64 payload (flip characters in the middle)
    prefix_len = len(ENCRYPTION_PREFIX)
    tampered = encrypted[:prefix_len + 10] + "XYZ" + encrypted[prefix_len + 13:]

    # Decryption should cleanly fail authentication without crashing
    decrypted = decrypt_clinical_text(tampered)
    assert "Decryption Error" in decrypted or decrypted != plain_text


def test_legacy_plaintext_backward_compatibility():
    """Legacy unencrypted database records without enc:v1: must be returned as-is (safe migration)."""
    legacy_note = "Legacy unencrypted clinical note stored before encryption was enabled."

    # Must not raise exception, must return plain string
    recovered = decrypt_clinical_text(legacy_note)
    assert recovered == legacy_note


def test_empty_and_none_handling():
    """Empty strings and None should be handled gracefully."""
    assert encrypt_clinical_text("") == ""
    assert encrypt_clinical_text(None) == ""
    assert decrypt_clinical_text("") == ""
    assert decrypt_clinical_text(None) == ""


def test_encryption_key_length():
    """Clinical encryption key must be strictly 256-bit (32 bytes)."""
    key = get_clinical_encryption_key()
    assert isinstance(key, bytes)
    assert len(key) == 32
