"""
conftest.py

Shared pytest fixtures for the whole test suite.

Key idea: we never touch the real Postgres DB defined in your .env. Every
test runs against a fresh in-memory SQLite database that is created from
the SAME app.models.Base metadata your real app uses, and thrown away the
moment the test finishes. This means:
  - tests are fast (no real DB server needed)
  - tests never leave junk data behind
  - tests can't corrupt or depend on anything in your dev/prod database

`db_session` is the fixture nearly every test will ask for. The `make_*`
fixtures are small factory functions so each test file doesn't have to
hand-build Principal/Agent/Wallet/Lender/Loan rows from scratch every time.
"""

import sys
from decimal import Decimal
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Make sure `app` package is importable regardless of where pytest is invoked from.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import Base
from app.models import (
    Agent,
    AgentScore,
    AgentStatus,
    Lender,
    Loan,
    LoanStatus,
    Principal,
    Wallet,
)


@pytest.fixture()
def db_session():
    """Fresh in-memory SQLite DB, built from the real app.models schema."""
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


# ---------- Factory helpers ----------
# Plain functions (not fixtures) so each test can call them multiple times
# with different arguments, e.g. to create several agents under one principal.

def make_principal(db_session, name="Test Principal", public_key="dummy-pub-key"):
    principal = Principal(name=name, public_key=public_key)
    db_session.add(principal)
    db_session.flush()  # assigns .id without a full commit
    return principal


def make_agent(
    db_session,
    principal,
    name="Test Agent",
    delegation_mandate="{}",
    status=AgentStatus.ACTIVE,
    vouching_enabled=False,
    wallet_balance=Decimal("0.00"),
):
    agent = Agent(
        principal_id=principal.id,
        name=name,
        delegation_mandate=delegation_mandate,
        status=status,
        vouching_enabled=vouching_enabled,
    )
    db_session.add(agent)
    db_session.flush()

    wallet = Wallet(agent_id=agent.id, spendable_balance=wallet_balance)
    db_session.add(wallet)
    db_session.flush()

    return agent


def make_lender(
    db_session,
    name="Test Lender",
    max_exposure_per_agent=Decimal("500.00"),
    total_platform_exposure_cap=Decimal("10000.00"),
    min_score_required=Decimal("60.00"),
    allowed_agent_categories=None,
):
    lender = Lender(
        name=name,
        max_exposure_per_agent=max_exposure_per_agent,
        total_platform_exposure_cap=total_platform_exposure_cap,
        min_score_required=min_score_required,
        allowed_agent_categories=allowed_agent_categories or [],
    )
    db_session.add(lender)
    db_session.flush()
    return lender


def make_loan(
    db_session,
    agent,
    lender,
    principal_amount=Decimal("100.00"),
    outstanding_balance=None,
    status=LoanStatus.APPROVED,
    credit_limit_at_issuance=Decimal("100.00"),
):
    loan = Loan(
        agent_id=agent.id,
        lender_id=lender.id,
        principal_amount=principal_amount,
        outstanding_balance=outstanding_balance if outstanding_balance is not None else principal_amount,
        status=status,
        credit_limit_at_issuance=credit_limit_at_issuance,
    )
    db_session.add(loan)
    db_session.flush()
    return loan


def make_agent_score(
    db_session,
    agent,
    score=Decimal("70.00"),
    task_success_rate=Decimal("80.00"),
    spend_regularity=Decimal("70.00"),
):
    row = AgentScore(
        agent_id=agent.id,
        score=score,
        task_success_rate=task_success_rate,
        spend_regularity=spend_regularity,
    )
    db_session.add(row)
    db_session.flush()
    return row