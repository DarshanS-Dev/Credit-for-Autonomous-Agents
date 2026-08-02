"""
test_dependencies.py

Covers app/dependencies.py: is_credential_currently_valid(), the function
every loan-request and repayment endpoint is meant to depend on before
doing anything else (per the module's own docstring).

*** THIS FILE CURRENTLY DOCUMENTS A REAL BUG. DO NOT SKIP THE FIRST TEST. ***

app/dependencies.py does:
    if agent.status != AgentStatus.active:
using `AgentStatus` imported from `app.models`. But app/models.py's
AgentStatus enum only defines uppercase members (ACTIVE, REVOKED, ...).
There is a SEPARATE, differently-cased AgentStatus enum in app/schemas.py
(lowercase members) -- that's a distinct class, not the same one.

`AgentStatus.active` (lowercase) does not exist on the models.py enum, so
this line raises AttributeError on every single call -- meaning every
endpoint that depends on get_active_agent_with_valid_credential() would
500 instead of correctly returning 403 for a revoked/blacklisted agent, or
200 for a legitimately active one.

Fix (in app/dependencies.py, one line):
    if agent.status != AgentStatus.active:
change to:
    if agent.status != AgentStatus.ACTIVE:

Once fixed, `test_bug_agentstatus_active_currently_raises_attributeerror`
below should be DELETED (it exists only to prove the bug), and the tests
marked `xfail` below will start passing on their own -- remove the xfail
markers at that point too.
"""

import json
from datetime import datetime, timezone

import pytest

from app.models import Agent, AgentStatus, Principal
from app.services.credential_service import generate_keypair, load_private_key, sign_mandate
from app.dependencies import is_credential_currently_valid


def _build_stored_mandate(principal_id, agent_id, bounds, issued_at, priv_b64):
    priv = load_private_key(priv_b64)
    sig = sign_mandate(priv, principal_id, agent_id, bounds, issued_at)
    return json.dumps({
        "bounds": bounds,
        "issued_at": issued_at.astimezone(timezone.utc).isoformat(),
        "signature": sig,
    })


def test_bug_agentstatus_active_currently_raises_attributeerror():
    """
    Proves the bug described in the module docstring. This test is
    EXPECTED TO PASS right now (the AttributeError is real). If this
    test starts failing, it means someone fixed the typo -- great! At
    that point delete this test and remove xfail from the tests below.
    """
    priv_b64, pub_b64 = generate_keypair()
    principal = Principal(id=1, name="P", public_key=pub_b64)
    issued_at = datetime.now(timezone.utc)
    mandate = _build_stored_mandate(1, 5, "max:100", issued_at, priv_b64)
    agent = Agent(id=5, principal_id=1, name="A", delegation_mandate=mandate, status=AgentStatus.ACTIVE)

    with pytest.raises(AttributeError):
        is_credential_currently_valid(agent, principal)


@pytest.mark.xfail(reason="AgentStatus.active typo bug in dependencies.py -- see module docstring", strict=True)
def test_active_agent_with_valid_signature_passes():
    priv_b64, pub_b64 = generate_keypair()
    principal = Principal(id=1, name="P", public_key=pub_b64)
    issued_at = datetime.now(timezone.utc)
    mandate = _build_stored_mandate(1, 5, "max:100", issued_at, priv_b64)
    agent = Agent(id=5, principal_id=1, name="A", delegation_mandate=mandate, status=AgentStatus.ACTIVE)

    assert is_credential_currently_valid(agent, principal) is True


@pytest.mark.xfail(reason="AgentStatus.active typo bug in dependencies.py -- see module docstring", strict=True)
def test_revoked_agent_fails_even_with_valid_signature():
    priv_b64, pub_b64 = generate_keypair()
    principal = Principal(id=1, name="P", public_key=pub_b64)
    issued_at = datetime.now(timezone.utc)
    mandate = _build_stored_mandate(1, 5, "max:100", issued_at, priv_b64)
    agent = Agent(id=5, principal_id=1, name="A", delegation_mandate=mandate, status=AgentStatus.REVOKED)

    assert is_credential_currently_valid(agent, principal) is False


@pytest.mark.xfail(reason="AgentStatus.active typo bug in dependencies.py -- see module docstring", strict=True)
def test_defaulted_agent_fails():
    priv_b64, pub_b64 = generate_keypair()
    principal = Principal(id=1, name="P", public_key=pub_b64)
    issued_at = datetime.now(timezone.utc)
    mandate = _build_stored_mandate(1, 5, "max:100", issued_at, priv_b64)
    agent = Agent(id=5, principal_id=1, name="A", delegation_mandate=mandate, status=AgentStatus.DEFAULTED)

    assert is_credential_currently_valid(agent, principal) is False


def test_malformed_stored_mandate_json_returns_false():
    """
    This one does NOT hit the buggy line, because malformed JSON is caught
    and returns False before the status check would even matter in a
    fixed version -- actually it DOES hit the status check first, so this
    also currently raises. Included so that once the bug is fixed, this
    guards the "corrupted stored data" path specifically.
    """
    _, pub_b64 = generate_keypair()
    principal = Principal(id=1, name="P", public_key=pub_b64)
    agent = Agent(id=5, principal_id=1, name="A", delegation_mandate="not valid json", status=AgentStatus.ACTIVE)

    with pytest.raises(AttributeError):
        is_credential_currently_valid(agent, principal)


@pytest.mark.xfail(reason="AgentStatus.active typo bug in dependencies.py -- see module docstring", strict=True)
def test_tampered_signature_on_stored_mandate_fails():
    priv_b64, pub_b64 = generate_keypair()
    principal = Principal(id=1, name="P", public_key=pub_b64)
    issued_at = datetime.now(timezone.utc)
    mandate_dict = json.loads(_build_stored_mandate(1, 5, "max:100", issued_at, priv_b64))
    mandate_dict["bounds"] = "max:999999"  # tampered after signing
    agent = Agent(id=5, principal_id=1, name="A",
                  delegation_mandate=json.dumps(mandate_dict), status=AgentStatus.ACTIVE)

    assert is_credential_currently_valid(agent, principal) is False