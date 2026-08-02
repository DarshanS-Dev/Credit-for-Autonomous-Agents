"""
credential_service.py

Pure cryptographic operations for the delegation mandate (Section 5 of spec).
No DB access here — this module only proves "did this exact payload get signed
by the holder of this exact public key." Whether a credential is *currently*
valid for use (agent.status == active, not revoked, etc.) is a separate
concern that lives with DB-aware code (e.g. a dependency in routers/agents.py).

Trust model:
- The principal's private key is generated and held client-side (browser).
  It NEVER touches this server. This module never has access to a private
  key during normal operation.
- The one exception is `generate_keypair()`, which exists ONLY to seed the
  2 demo accounts for the hackathon (we're not building real signup/wallet
  UX). It must never be called as part of the live mandate-signing flow.
- The canonical payload signed by the principal is a substantive commitment
  (principal_id, agent_id, bounds of authorization, issued_at timestamp) —
  not just an identifier. This is what lets us say "only this principal's
  key could have authorized exactly this agent, with exactly these bounds,
  at exactly this time" if a loan defaults and accountability is questioned.
"""

import base64
import json
from datetime import datetime, timezone

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)
from cryptography.hazmat.primitives import serialization


# ---------- Encoding helpers ----------

def _b64encode(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


def _b64decode(data: str) -> bytes:
    return base64.b64decode(data.encode("ascii"))


# ---------- Canonical payload ----------

def canonicalize_mandate(
    principal_id: int,
    agent_id: int,
    bounds: str,
    issued_at: datetime,
) -> bytes:
    """
    Build the exact byte string the principal signs.

    Canonical JSON (sorted keys, no whitespace) rather than a delimited
    string — this is the closer analogue to how a real mandate/credential
    payload (e.g. AP2-style) would be structured, and avoids ambiguity if
    `bounds` ever contains a delimiter character.

    issued_at is normalized to UTC ISO-8601 so the same logical timestamp
    always canonicalizes identically regardless of timezone the caller
    constructed it in.
    """
    payload = {
        "principal_id": principal_id,
        "agent_id": agent_id,
        "bounds": bounds,
        "issued_at": issued_at.astimezone(timezone.utc).isoformat(),
    }
    return json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")


# ---------- Verification (the operation the server actually performs) ----------

def verify_mandate(
    public_key_b64: str,
    signature_b64: str,
    principal_id: int,
    agent_id: int,
    bounds: str,
    issued_at: datetime,
) -> bool:
    """
    Verify that the holder of `public_key_b64`'s matching private key signed
    exactly this (principal_id, agent_id, bounds, issued_at) payload.

    Returns False on any invalid signature or malformed input rather than
    raising — callers (routers) should treat False as "reject the mandate",
    not as an error condition to 500 on.
    """
    try:
        public_key = Ed25519PublicKey.from_public_bytes(_b64decode(public_key_b64))
        signature = _b64decode(signature_b64)
        message = canonicalize_mandate(principal_id, agent_id, bounds, issued_at)
        public_key.verify(signature, message)
        return True
    except (InvalidSignature, ValueError, Exception):
        # ValueError: malformed base64 / wrong-length key bytes
        # InvalidSignature: well-formed but doesn't match
        # broad Exception guard is intentional here: this function's only
        # contract is bool, never an exception, since it sits on a hot path
        # (every loan request re-validates the mandate is attached)
        return False


# ---------- Signing (client-side in the real flow; helper for tests/demo) ----------

def sign_mandate(
    private_key: Ed25519PrivateKey,
    principal_id: int,
    agent_id: int,
    bounds: str,
    issued_at: datetime,
) -> str:
    """
    Sign the canonical mandate payload, returning a base64 signature.

    In the actual product this runs in the principal's browser (private key
    never sent to us). This function exists so:
    - the frontend/demo has a reference implementation of exactly what to sign
    - tests and the seeded demo-account script can produce valid mandates
      without a browser in the loop
    """
    message = canonicalize_mandate(principal_id, agent_id, bounds, issued_at)
    signature = private_key.sign(message)
    return _b64encode(signature)


# ---------- Demo/seed-only keypair generation ----------

def generate_keypair() -> tuple[str, str]:
    """
    Generate a fresh Ed25519 keypair, returned as (private_key_b64, public_key_b64).

    SEED-ONLY. This must never be called from the live mandate-signing API
    path — that would mean the server generated a "principal's" private key,
    which defeats the entire point of asymmetric signing (see module docstring).
    Only use: scripting the 2 seeded demo accounts and their personas.
    """
    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()

    private_bytes = private_key.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return _b64encode(private_bytes), _b64encode(public_bytes)


def load_private_key(private_key_b64: str) -> Ed25519PrivateKey:
    """Reconstruct a private key from raw base64 bytes. Seed/test use only."""
    return Ed25519PrivateKey.from_private_bytes(_b64decode(private_key_b64))