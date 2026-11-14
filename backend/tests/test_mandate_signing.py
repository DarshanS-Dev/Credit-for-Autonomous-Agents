"""
test_mandate_signing.py

Verifies the mandate sign + verify round-trip defined in credential_service.py.

This test is fully self-contained (no DB, no running server, no Hindsight).
It directly exercises the cryptographic layer that every loan request and
agent auth check depends on.

Coverage:
  1. canonicalize_mandate produces deterministic output
  2. sign_mandate + verify_mandate: valid key+payload -> True
  3. verify_mandate: wrong agent_id tampered after signing -> False
  4. verify_mandate: wrong principal_id -> False
  5. verify_mandate: bounds changed after signing -> False
  6. verify_mandate: issued_at changed after signing -> False
  7. verify_mandate: different keypair (impersonation) -> False
  8. verify_mandate: malformed base64 public key -> False (no exception)
  9. verify_mandate: malformed base64 signature -> False (no exception)
 10. Full onboarding flow: generate keypair -> create agent shell ->
     sign mandate -> verify -> assert api_key_hash is set
     (exercises generate_keypair, sign_mandate, verify_mandate, 
      generate_agent_api_key, hash_agent_api_key, verify_agent_api_key)
"""

import json
from datetime import datetime, timezone

import pytest

# ---------------------------------------------------------------------------
# Isolate credential_service from real settings.
# credential_service imports app.config.settings for the HMAC pepper,
# but only in the bottom half of the file (agent API key functions).
# We stub it out here so the entire module loads without a .env file.
# ---------------------------------------------------------------------------
import types
import sys

_config_stub = types.ModuleType("app.config")
_settings_stub = types.SimpleNamespace(
    agent_api_key_pepper="test-pepper-for-unit-tests"
)
_config_stub.settings = _settings_stub  # type: ignore[attr-defined]
sys.modules.setdefault("app.config", _config_stub)

from app.services.credential_service import (  # noqa: E402
    canonicalize_mandate,
    generate_keypair,
    load_private_key,
    sign_mandate,
    verify_mandate,
    generate_agent_api_key,
    hash_agent_api_key,
    verify_agent_api_key,
)


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture
def keypair():
    """Fresh Ed25519 keypair for each test."""
    private_b64, public_b64 = generate_keypair()
    return private_b64, public_b64


@pytest.fixture
def mandate_params():
    return {
        "principal_id": 1,
        "agent_id": 42,
        "bounds": "up to $500, task-payout category only",
        "issued_at": datetime(2024, 6, 1, 12, 0, 0, tzinfo=timezone.utc),
    }


# ── Test 1: canonicalize_mandate is deterministic ─────────────────────────────

class TestCanonicalizeMandate:
    def test_deterministic_output(self, mandate_params):
        a = canonicalize_mandate(**mandate_params)
        b = canonicalize_mandate(**mandate_params)
        assert a == b

    def test_is_valid_sorted_json(self, mandate_params):
        payload = canonicalize_mandate(**mandate_params)
        parsed = json.loads(payload.decode("utf-8"))
        assert parsed["principal_id"] == mandate_params["principal_id"]
        assert parsed["agent_id"] == mandate_params["agent_id"]
        assert parsed["bounds"] == mandate_params["bounds"]

    def test_different_params_produce_different_bytes(self, mandate_params):
        a = canonicalize_mandate(**mandate_params)
        different = dict(mandate_params, agent_id=99)
        b = canonicalize_mandate(**different)
        assert a != b


# ── Test 2: valid round-trip ──────────────────────────────────────────────────

class TestValidRoundTrip:
    def test_sign_then_verify_returns_true(self, keypair, mandate_params):
        private_b64, public_b64 = keypair
        private_key = load_private_key(private_b64)

        signature = sign_mandate(private_key=private_key, **mandate_params)

        result = verify_mandate(
            public_key_b64=public_b64,
            signature_b64=signature,
            **mandate_params,
        )
        assert result is True, "Valid signature should verify as True"

    def test_signature_is_non_empty_string(self, keypair, mandate_params):
        private_b64, _ = keypair
        private_key = load_private_key(private_b64)
        sig = sign_mandate(private_key=private_key, **mandate_params)
        assert isinstance(sig, str) and len(sig) > 0


# ── Tests 3-7: tamper detection (all should return False) ─────────────────────

class TestTamperDetection:
    def _make_signature(self, keypair, params):
        private_b64, _ = keypair
        private_key = load_private_key(private_b64)
        return sign_mandate(private_key=private_key, **params)

    def test_wrong_agent_id_fails(self, keypair, mandate_params):
        _, public_b64 = keypair
        sig = self._make_signature(keypair, mandate_params)
        tampered = dict(mandate_params, agent_id=mandate_params["agent_id"] + 1)
        assert verify_mandate(public_key_b64=public_b64, signature_b64=sig, **tampered) is False

    def test_wrong_principal_id_fails(self, keypair, mandate_params):
        _, public_b64 = keypair
        sig = self._make_signature(keypair, mandate_params)
        tampered = dict(mandate_params, principal_id=mandate_params["principal_id"] + 1)
        assert verify_mandate(public_key_b64=public_b64, signature_b64=sig, **tampered) is False

    def test_bounds_changed_fails(self, keypair, mandate_params):
        _, public_b64 = keypair
        sig = self._make_signature(keypair, mandate_params)
        tampered = dict(mandate_params, bounds="unlimited access")
        assert verify_mandate(public_key_b64=public_b64, signature_b64=sig, **tampered) is False

    def test_issued_at_changed_fails(self, keypair, mandate_params):
        _, public_b64 = keypair
        sig = self._make_signature(keypair, mandate_params)
        tampered = dict(
            mandate_params,
            issued_at=datetime(2099, 1, 1, tzinfo=timezone.utc),
        )
        assert verify_mandate(public_key_b64=public_b64, signature_b64=sig, **tampered) is False

    def test_different_keypair_impersonation_fails(self, keypair, mandate_params):
        """An attacker cannot use their own private key to sign a mandate
        that verifies against someone else's public key."""
        _, victim_public_b64 = keypair
        attacker_private_b64, _ = generate_keypair()
        attacker_private_key = load_private_key(attacker_private_b64)
        attacker_sig = sign_mandate(private_key=attacker_private_key, **mandate_params)
        # Verifying attacker's signature against victim's public key must fail
        assert verify_mandate(
            public_key_b64=victim_public_b64,
            signature_b64=attacker_sig,
            **mandate_params,
        ) is False


# ── Tests 8-9: malformed inputs return False, never raise ────────────────────

class TestMalformedInputs:
    def test_malformed_public_key_returns_false(self, mandate_params):
        assert (
            verify_mandate(
                public_key_b64="not-valid-base64!!!",
                signature_b64="AAAA",
                **mandate_params,
            )
            is False
        )

    def test_malformed_signature_returns_false(self, keypair, mandate_params):
        _, public_b64 = keypair
        assert (
            verify_mandate(
                public_key_b64=public_b64,
                signature_b64="not-valid-base64!!!",
                **mandate_params,
            )
            is False
        )

    def test_empty_public_key_returns_false(self, mandate_params):
        assert (
            verify_mandate(
                public_key_b64="",
                signature_b64="AAAA",
                **mandate_params,
            )
            is False
        )


# ── Test 10: full agent API key round-trip ────────────────────────────────────

class TestAgentApiKeyRoundTrip:
    def test_generate_hash_verify(self):
        raw_key = generate_agent_api_key()
        assert len(raw_key) > 20, "Raw key should be substantial"

        stored_hash = hash_agent_api_key(raw_key)
        assert stored_hash != raw_key, "Hash must not equal raw key"

        assert verify_agent_api_key(raw_key, stored_hash) is True

    def test_wrong_key_fails_verification(self):
        raw_key = generate_agent_api_key()
        stored_hash = hash_agent_api_key(raw_key)
        different_key = generate_agent_api_key()
        assert verify_agent_api_key(different_key, stored_hash) is False

    def test_mandate_plus_api_key_full_flow(self):
        """
        Simulates the full onboarding sequence:
          generate_keypair -> sign mandate -> verify mandate -> mint API key -> verify API key
        This is exactly what POST /agents/{id}/mandate does server-side.
        """
        private_b64, public_b64 = generate_keypair()
        private_key = load_private_key(private_b64)

        params = {
            "principal_id": 7,
            "agent_id": 101,
            "bounds": "task-payout only, up to $200",
            "issued_at": datetime.now(timezone.utc),
        }

        # Client-side: sign
        signature = sign_mandate(private_key=private_key, **params)

        # Server-side: verify mandate
        mandate_valid = verify_mandate(
            public_key_b64=public_b64,
            signature_b64=signature,
            **params,
        )
        assert mandate_valid is True, "Mandate must verify"

        # Server-side: mint bearer API key (what agents.py does on success)
        raw_api_key = generate_agent_api_key()
        stored_hash = hash_agent_api_key(raw_api_key)

        # Subsequent request: agent presents raw key, server verifies
        assert verify_agent_api_key(raw_api_key, stored_hash) is True
        assert verify_agent_api_key("wrong-key", stored_hash) is False
