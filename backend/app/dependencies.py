"""
dependencies.py

DB-aware layer that credential_service.py deliberately does NOT contain.

credential_service.verify_mandate() only proves "a valid signature exists
for this exact payload." It says nothing about whether that credential is
still USABLE right now — an agent can have a perfectly valid signature from
setup time and still be revoked/defaulted/blacklisted since then.

This module is what every loan-request/repayment endpoint should depend on
before doing anything else. It combines two independent checks, and BOTH
must pass:

1. Agent.status == active in the DB (the fast, mutable, revocable state —
   this is what instant kill-switch/revocation actually flips, per Section 7)
2. The stored delegation_mandate still cryptographically verifies against
   the principal's public key (catches tampering/corruption of stored data,
   not just "was it ever revoked")

Kept as a FastAPI dependency (not baked into router bodies) so it can be
reused identically across agents.py, loans.py, and repayment.py routers,
and so revocation logic changes happen in exactly one place.
"""

import json
from datetime import datetime

from fastapi import Depends, HTTPException, status as http_status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Agent, AgentStatus, Principal
from app.services.credential_service import verify_mandate


class CredentialInvalidError(Exception):
    """Raised internally when a mandate fails re-verification (not just non-active status)."""
    pass


def _parse_stored_mandate(delegation_mandate: str) -> dict:
    """
    Agent.delegation_mandate is stored as a JSON string containing the
    fields needed to re-verify the signature later:
        {"bounds": str, "issued_at": iso8601 str, "signature": base64 str}

    Kept as one JSON blob rather than separate columns since it's only ever
    read as a unit (to re-verify) and never queried/filtered on individually.
    """
    try:
        data = json.loads(delegation_mandate)
        assert all(k in data for k in ("bounds", "issued_at", "signature"))
        return data
    except (json.JSONDecodeError, AssertionError, TypeError) as e:
        raise CredentialInvalidError(f"malformed stored mandate: {e}")


def is_credential_currently_valid(agent: Agent, principal: Principal) -> bool:
    """
    Pure check combining both conditions. Does not raise — returns bool so
    callers (e.g. a dashboard listing many agents) can use it without
    exception-handling per agent.
    """
    if agent.status != AgentStatus.active:
        return False

    try:
        mandate = _parse_stored_mandate(agent.delegation_mandate)
    except CredentialInvalidError:
        return False

    issued_at = datetime.fromisoformat(mandate["issued_at"])

    return verify_mandate(
        public_key_b64=principal.public_key,
        signature_b64=mandate["signature"],
        principal_id=principal.id,
        agent_id=agent.id,
        bounds=mandate["bounds"],
        issued_at=issued_at,
    )


def get_active_agent_with_valid_credential(
    agent_id: int,
    db: Session = Depends(get_db),
) -> Agent:
    """
    FastAPI dependency. Use this in any endpoint that requires "this agent
    is currently authorized to act" — loan requests, repayment processing,
    spend attempts.

    Raises:
        404 if the agent doesn't exist at all
        403 if the agent exists but is not active, or its signature no
            longer verifies (distinguished from 404 so the frontend can
            show "revoked/blacklisted" state rather than a generic not-found)
    """
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if agent is None:
        raise HTTPException(status_code=http_status.HTTP_404_NOT_FOUND, detail="Agent not found")

    principal = db.query(Principal).filter(Principal.id == agent.principal_id).first()
    if principal is None:
        # Data integrity issue, not a normal "agent revoked" case
        raise HTTPException(
            status_code=http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Agent has no associated principal",
        )

    if not is_credential_currently_valid(agent, principal):
        raise HTTPException(
            status_code=http_status.HTTP_403_FORBIDDEN,
            detail=f"Agent credential is not valid for use (status={agent.status.value})",
        )

    return agent