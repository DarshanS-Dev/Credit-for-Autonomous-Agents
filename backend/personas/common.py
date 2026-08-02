"""
personas/common.py

Shared helpers for the three demo persona scripts. These call the LIVE
running API (via requests) exactly the way the real frontend/agent would --
no shortcuts through internal service functions -- EXCEPT for seeding fake
historical data for the "established agent" persona, where there is
deliberately no API endpoint (AgentScore/past Loans are only ever produced
by real usage, not writable directly), so that one case drops to a direct
DB session.

Run personas from the backend project root with the venv active and the
API server already running (uvicorn app.main:app --reload), e.g.:

    python -m personas.persona_established
    python -m personas.persona_new
    python -m personas.persona_misbehaving

Set API_BASE_URL env var if the server isn't on localhost:8000.
"""

import os
import time
import uuid
from datetime import datetime, timezone

import requests

from app.services.credential_service import generate_keypair, sign_mandate, load_private_key

BASE_URL = os.environ.get("API_BASE_URL", "http://localhost:8000")


# ---------- HTTP helpers ----------

def _headers(token: str | None) -> dict:
    return {"Authorization": f"Bearer {token}"} if token else {}


def post(path: str, json: dict | None = None, token: str | None = None) -> dict:
    r = requests.post(f"{BASE_URL}{path}", json=json, headers=_headers(token))
    print(f"  POST {path} -> {r.status_code}")
    if not r.ok:
        print(f"    {r.text}")
    r.raise_for_status()
    return r.json()


def put(path: str, json: dict | None = None, token: str | None = None) -> dict:
    r = requests.put(f"{BASE_URL}{path}", json=json, headers=_headers(token))
    print(f"  PUT {path} -> {r.status_code}")
    if not r.ok:
        print(f"    {r.text}")
    r.raise_for_status()
    return r.json()


def get(path: str, token: str | None = None) -> dict:
    r = requests.get(f"{BASE_URL}{path}", headers=_headers(token))
    print(f"  GET {path} -> {r.status_code}")
    if not r.ok:
        print(f"    {r.text}")
    r.raise_for_status()
    return r.json()


# ---------- Setup helpers ----------

def unique_email(prefix: str) -> str:
    """Avoids 409 Email already registered on repeat runs during rehearsal."""
    return f"{prefix}-{uuid.uuid4().hex[:8]}@demo.local"


def signup_principal(name: str) -> tuple[str, int, str]:
    """
    Generates a fresh Ed25519 keypair (seed/demo-only use of
    generate_keypair, per credential_service.py's own docstring), signs
    up a principal with the public half, and returns
    (access_token, principal_id, private_key_b64).
    """
    private_key_b64, public_key_b64 = generate_keypair()
    resp = post("/auth/signup", {
        "role": "principal",
        "name": name,
        "email": unique_email("principal"),
        "password": "demo-password-123",
        "public_key": public_key_b64,
    })
    return resp["access_token"], resp["id"], private_key_b64


def signup_lender(name: str, min_score: float, max_exposure: float,
                   platform_cap: float, categories: list[str]) -> tuple[str, int]:
    """Signs up a lender and immediately sets its risk policy."""
    resp = post("/auth/signup", {
        "role": "lender",
        "name": name,
        "email": unique_email("lender"),
        "password": "demo-password-123",
    })
    token, lender_id = resp["access_token"], resp["id"]
    put("/lenders/policy", {
        "max_exposure_per_agent": max_exposure,
        "total_platform_exposure_cap": platform_cap,
        "min_score_required": min_score,
        "allowed_agent_categories": categories,
    }, token=token)
    return token, lender_id


def create_agent_with_mandate(principal_token: str, principal_id: int,
                               private_key_b64: str, name: str,
                               bounds: str = "up to $500, task-payout category only") -> int:
    """
    Full onboarding flow exactly as the real frontend would drive it:
    1. POST /agents  -> agent shell exists (mandate empty)
    2. Sign the canonical payload client-side with the principal's private key
    3. POST /agents/{id}/mandate -> server verifies + persists

    Returns the new agent_id.
    """
    agent = post("/agents", {"principal_id": principal_id, "name": name}, token=principal_token)
    agent_id = agent["id"]

    issued_at = datetime.now(timezone.utc)
    private_key = load_private_key(private_key_b64)
    signature = sign_mandate(
        private_key=private_key,
        principal_id=principal_id,
        agent_id=agent_id,
        bounds=bounds,
        issued_at=issued_at,
    )

    post(f"/agents/{agent_id}/mandate", {
        "agent_id": agent_id,
        "bounds": bounds,
        "issued_at": issued_at.isoformat(),
        "signature": signature,
    }, token=principal_token)

    return agent_id


def request_loan(agent_id: int, lender_id: int, principal_amount: float,
                  approved_recipient: str, task_category: str | None = None) -> dict:
    return post(f"/loans/{agent_id}", {
        "agent_id": agent_id,
        "lender_id": lender_id,
        "principal_amount": principal_amount,
        "approved_recipient": approved_recipient,
        "task_category": task_category,
    })


def banner(title: str) -> None:
    print("\n" + "=" * 70)
    print(title)
    print("=" * 70)
