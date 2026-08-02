"""
test_credential_service.py

Covers Section 5 of the spec: the delegation mandate. These tests need no
database at all -- credential_service.py is pure cryptography.

What's tested:
  1. A correctly signed mandate verifies successfully
  2. Tampering with ANY field (bounds, principal_id, agent_id) after signing
     invalidates the signature -- this is the whole point of signing a
     substantive payload instead of just an identifier
  3. Verifying with the wrong public key fails
  4. Malformed/garbage input returns False rather than raising -- callers
     on the hot path (every loan request) must never get an unhandled
     exception from this function
  5. issued_at is timezone-normalized before signing, so the same instant
     expressed in two different timezones canonicalizes identically
"""

from datetime import datetime, timedelta, timezone

from app.services.credential_service import (
    canonicalize_mandate,
    generate_keypair,
    load_private_key,
    sign_mandate,
    verify_mandate,
)


def _fresh_signed_mandate(principal_id=1, agent_id=2, bounds="max_loan:100", issued_at=None):
    issued_at = issued_at or datetime(2026, 1, 1, tzinfo=timezone.utc)
    priv_b64, pub_b64 = generate_keypair()
    priv = load_private_key(priv_b64)
    signature = sign_mandate(priv, principal_id, agent_id, bounds, issued_at)
    return pub_b64, signature, principal_id, agent_id, bounds, issued_at


def test_valid_signature_verifies():
    pub_b64, sig, pid, aid, bounds, issued_at = _fresh_signed_mandate()
    assert verify_mandate(pub_b64, sig, pid, aid, bounds, issued_at) is True


def test_tampered_bounds_invalidates_signature():
    pub_b64, sig, pid, aid, bounds, issued_at = _fresh_signed_mandate(bounds="max_loan:100")
    assert verify_mandate(pub_b64, sig, pid, aid, "max_loan:999999", issued_at) is False


def test_tampered_agent_id_invalidates_signature():
    pub_b64, sig, pid, aid, bounds, issued_at = _fresh_signed_mandate(agent_id=2)
    assert verify_mandate(pub_b64, sig, pid, 999, bounds, issued_at) is False


def test_tampered_principal_id_invalidates_signature():
    pub_b64, sig, pid, aid, bounds, issued_at = _fresh_signed_mandate(principal_id=1)
    assert verify_mandate(pub_b64, sig, 999, aid, bounds, issued_at) is False


def test_wrong_public_key_fails_verification():
    pub_b64, sig, pid, aid, bounds, issued_at = _fresh_signed_mandate()
    _, other_pub_b64 = generate_keypair()
    assert verify_mandate(other_pub_b64, sig, pid, aid, bounds, issued_at) is False


def test_malformed_public_key_returns_false_not_raise():
    result = verify_mandate("not-valid-base64!!", "AAAA", 1, 2, "b", datetime.now(timezone.utc))
    assert result is False


def test_malformed_signature_returns_false_not_raise():
    _, pub_b64 = generate_keypair()
    result = verify_mandate(pub_b64, "###not-base64###", 1, 2, "b", datetime.now(timezone.utc))
    assert result is False


def test_canonicalize_mandate_is_timezone_normalized():
    dt_utc = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
    dt_plus_530 = dt_utc.astimezone(timezone(timedelta(hours=5, minutes=30)))  # same instant, IST

    assert canonicalize_mandate(1, 2, "b", dt_utc) == canonicalize_mandate(1, 2, "b", dt_plus_530)


def test_generate_keypair_produces_usable_distinct_keys():
    priv1_b64, pub1_b64 = generate_keypair()
    priv2_b64, pub2_b64 = generate_keypair()

    assert priv1_b64 != priv2_b64
    assert pub1_b64 != pub2_b64


# ---------- Security-relevant edge cases ----------

def test_empty_public_key_returns_false_not_raise():
    result = verify_mandate("", "AAAA", 1, 2, "b", datetime.now(timezone.utc))
    assert result is False


def test_empty_signature_returns_false_not_raise():
    _, pub_b64 = generate_keypair()
    result = verify_mandate(pub_b64, "", 1, 2, "b", datetime.now(timezone.utc))
    assert result is False


def test_empty_bounds_string_can_still_be_signed_and_verified():
    """Empty bounds isn't malformed input to this layer -- it's a valid (if
    unusual) payload; the router/business layer decides if empty bounds
    is acceptable, not the crypto layer."""
    pub_b64, sig, pid, aid, bounds, issued_at = _fresh_signed_mandate(bounds="")
    assert verify_mandate(pub_b64, sig, pid, aid, "", issued_at) is True


def test_signature_from_one_valid_mandate_cannot_be_replayed_against_a_different_agent():
    """
    A malicious actor who intercepts a valid (principal_id=1, agent_id=2)
    signature must not be able to replay it to authorize a DIFFERENT
    agent_id under the same principal. This is the core security property
    the whole delegation-mandate design depends on.
    """
    pub_b64, sig, pid, aid, bounds, issued_at = _fresh_signed_mandate(principal_id=1, agent_id=2)
    # attacker tries to reuse the exact same signature for agent_id=3 instead
    assert verify_mandate(pub_b64, sig, pid, 3, bounds, issued_at) is False


def test_signature_cannot_be_replayed_with_a_different_issued_at():
    """A captured signature must not verify against a replayed/altered timestamp."""
    pub_b64, sig, pid, aid, bounds, issued_at = _fresh_signed_mandate()
    later = issued_at + timedelta(days=365)
    assert verify_mandate(pub_b64, sig, pid, aid, bounds, later) is False


def test_public_key_of_correct_length_but_random_bytes_fails_cleanly():
    """
    32 random bytes base64-encoded is a structurally VALID Ed25519 public
    key length, just not the one that made the signature -- must fail
    verification, not raise, and must not falsely succeed.
    """
    import base64
    import os

    random_but_valid_length_key = base64.b64encode(os.urandom(32)).decode("ascii")
    pid, aid, bounds, issued_at = 1, 2, "b", datetime.now(timezone.utc)

    priv_b64, _correct_pub_b64 = generate_keypair()
    priv = load_private_key(priv_b64)
    sig = sign_mandate(priv, pid, aid, bounds, issued_at)

    assert verify_mandate(random_but_valid_length_key, sig, pid, aid, bounds, issued_at) is False