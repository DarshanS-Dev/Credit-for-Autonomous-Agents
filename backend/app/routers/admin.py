"""
admin.py

Operator Console: single-screen surface for triggering scripted demo
personas, the manual kill switch, and the shared live event/anomaly feed.

Persona logic lives inline here (not imported from a separate
personas/ package) so the Operator Console can trigger a full scripted
flow synchronously in one HTTP call and return a summary the frontend
can render immediately -- no polling required for the demo-trigger
moment itself (the ongoing feed below is still poll-based, per the
existing dashboard_ws.py-skip decision).
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Agent, AgentStatus, AgentScore, Event, EventType, Loan, LoanStatus,
    Lender, Principal, Transaction, TransactionType, Wallet,
)
from app.schemas import EventOut, PersonaTrigger, PersonaTriggerResult
from app.dependencies import revoke_agent
from app.services import underwriting_service, policy_engine, ledger_service, monitoring_service
from app.services.auth_service import hash_password
from app.services.credential_service import generate_keypair, sign_mandate, load_private_key

router = APIRouter(prefix="/operator", tags=["operator"])


# ---------- Live feed ----------

@router.get("/events", response_model=list[EventOut])
def get_recent_events(
    limit: int = 50,
    agent_id: int | None = None,
    event_type: str | None = None,
    db: Session = Depends(get_db),
):
    """
    Operator Console live outcome feed + Lender Dashboard activity feed +
    Anomaly & Alerts Feed all share this same underlying Event stream.

    agent_id / event_type are optional filters:
    - Agent Detail history: filter by agent_id alone
    - Anomaly & Alerts Feed: filter by event_type=anomaly_flagged
      (optionally combined with agent_id)
    - Operator Console platform-wide view: no filters, same as before
    """
    query = db.query(Event)
    if agent_id is not None:
        query = query.filter(Event.agent_id == agent_id)
    if event_type is not None:
        try:
            query = query.filter(Event.event_type == EventType(event_type))
        except ValueError:
            raise HTTPException(
                status.HTTP_422_UNPROCESSABLE_ENTITY,
                f"Unknown event_type '{event_type}'. Valid values: {[e.value for e in EventType]}",
            )
    return query.order_by(Event.created_at.desc()).limit(limit).all()


# ---------- Manual kill switch ----------

@router.post("/agents/{agent_id}/revoke")
def manual_revoke(agent_id: int, reason: str = "manual operator revocation", db: Session = Depends(get_db)):
    """
    Manual kill switch, independent of the scripted persona flow. This is
    the OPERATOR path -- intended as a permanent ban, so it targets
    AgentStatus.BLACKLISTED specifically (distinct from a principal's own
    voluntary revoke, agents.py POST /{agent_id}/revoke -> REVOKED, and
    from an automatic misbehavior-triggered default -> DEFAULTED). All
    three still go through the same revoke_agent() function.
    """
    agent = revoke_agent(db, agent_id=agent_id, reason=reason, target_status=AgentStatus.BLACKLISTED)
    db.commit()
    return {"agent_id": agent.id, "status": agent.status}


# ---------- Persona trigger ----------

def _unique_email(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}@demo.local"


def _spin_up_principal(db: Session, name: str) -> tuple[Principal, str]:
    """Seed-only keypair generation (per credential_service.py's own
    docstring) -- acceptable here since this whole endpoint IS the
    seed/demo path, not a real user-facing signup flow."""
    private_key_b64, public_key_b64 = generate_keypair()
    principal = Principal(
        name=name,
        email=_unique_email("principal"),
        hashed_password=hash_password("demo-password-123"),
        public_key=public_key_b64,
    )
    db.add(principal)
    db.commit()
    db.refresh(principal)
    return principal, private_key_b64


def _spin_up_lender(db: Session, name: str, min_score: float, max_exposure: float,
                     platform_cap: float) -> Lender:
    lender = Lender(
        name=name,
        email=_unique_email("lender"),
        hashed_password=hash_password("demo-password-123"),
        max_exposure_per_agent=Decimal(str(max_exposure)),
        total_platform_exposure_cap=Decimal(str(platform_cap)),
        min_score_required=Decimal(str(min_score)),
        allowed_agent_categories=[],
    )
    db.add(lender)
    db.commit()
    db.refresh(lender)
    return lender


def _create_agent_with_mandate(db: Session, principal: Principal, private_key_b64: str,
                                name: str, bounds: str) -> Agent:
    agent = Agent(
        principal_id=principal.id,
        name=name,
        delegation_mandate="",
        status=AgentStatus.ACTIVE,
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)
    db.add(Wallet(agent_id=agent.id, spendable_balance=0))
    db.commit()

    import json
    issued_at = datetime.now(timezone.utc)
    private_key = load_private_key(private_key_b64)
    signature = sign_mandate(
        private_key=private_key,
        principal_id=principal.id,
        agent_id=agent.id,
        bounds=bounds,
        issued_at=issued_at,
    )
    agent.delegation_mandate = json.dumps({
        "bounds": bounds,
        "issued_at": issued_at.isoformat(),
        "signature": signature,
    })
    db.commit()
    db.refresh(agent)
    return agent


def _seed_established_history(db: Session, agent_id: int, lender_id: int) -> None:
    """Direct DB seed -- there's deliberately no API for fabricating
    AgentScore/past-Loan history, see underwriting_service.py."""
    db.add(AgentScore(
        agent_id=agent_id,
        score=Decimal("0"),
        task_success_rate=Decimal("95.00"),
        spend_regularity=Decimal("90.00"),
    ))
    prior_loan = Loan(
        agent_id=agent_id,
        lender_id=lender_id,
        principal_amount=Decimal("100.00"),
        interest_amount=Decimal("0"),
        outstanding_balance=Decimal("0"),
        approved_recipient="cloud-compute-vendor.example",
        score_at_decision=Decimal("80.00"),
        policy_min_score_at_decision=Decimal("60.00"),
        status=LoanStatus.REPAID,
        credit_limit_at_issuance=Decimal("100.00"),
    )
    db.add(prior_loan)
    db.flush()
    for i in range(20):
        db.add(Transaction(
            agent_id=agent_id,
            loan_id=prior_loan.id if i % 4 == 0 else None,
            type=TransactionType.TASK_PAYOUT,
            amount=Decimal("10.00"),
        ))
    db.commit()


def _request_loan_internal(db: Session, agent: Agent, lender: Lender,
                            principal_amount: Decimal, approved_recipient: str) -> Loan:
    """
    Mirrors loans.py's request_loan body. Deliberately duplicated rather
    than imported -- loans.py's version is a FastAPI route function bound
    to Depends()-injected params, not a plain callable, so reusing it
    directly here would require constructing a fake request; a small,
    clearly-flagged duplication is simpler and lower-risk this late in
    the build than refactoring loans.py's route into a separate callable
    right now.
    """
    underwriting = underwriting_service.make_underwriting_decision(db, agent, lender)
    policy = policy_engine.evaluate_loan_request(db, lender, underwriting, requested_category=None)

    if not policy.final_approved:
        loan = Loan(
            agent_id=agent.id, lender_id=lender.id, principal_amount=principal_amount,
            interest_amount=0, outstanding_balance=0, status=LoanStatus.DENIED,
            credit_limit_at_issuance=policy.final_limit, approved_recipient=approved_recipient,
            score_at_decision=underwriting.score_at_decision,
            policy_min_score_at_decision=underwriting.policy_min_score,
        )
        db.add(loan)
        db.flush()
        db.add(Event(agent_id=agent.id, loan_id=loan.id, event_type=EventType.LOAN_DENIED, detail=policy.explanation))
        db.commit()
        db.refresh(loan)
        return loan

    final_limit = Decimal(agent.manual_credit_limit_override) if agent.manual_credit_limit_override is not None else policy.final_limit
    loan = Loan(
        agent_id=agent.id, lender_id=lender.id, principal_amount=principal_amount,
        interest_amount=0, outstanding_balance=principal_amount, status=LoanStatus.APPROVED,
        credit_limit_at_issuance=final_limit, approved_recipient=approved_recipient,
        score_at_decision=underwriting.score_at_decision,
        policy_min_score_at_decision=underwriting.policy_min_score,
    )
    db.add(loan)
    db.flush()
    ledger_service.disburse_loan(db, loan)
    db.add(Event(agent_id=agent.id, loan_id=loan.id, event_type=EventType.LOAN_APPROVED, detail=policy.explanation))
    db.commit()
    db.refresh(loan)
    return loan


@router.post("/persona-trigger", response_model=PersonaTriggerResult)
def trigger_persona(payload: PersonaTrigger, db: Session = Depends(get_db)):
    """
    Operator Console 'Persona triggers'. Spins up a fresh demo
    principal + lender + agent server-side and runs the matching
    scripted flow from spec Section 10, returning a summary for the
    live outcome feed to render immediately.

    persona must be one of: "established" | "new" | "misbehaving"
    """
    approved_recipient = "cloud-compute-vendor.example"

    if payload.persona == "established":
        principal, private_key_b64 = _spin_up_principal(db, "Operator Demo Principal (Established)")
        lender = _spin_up_lender(db, "Operator Demo Lender", min_score=60.0, max_exposure=500.0, platform_cap=100000.0)
        agent = _create_agent_with_mandate(db, principal, private_key_b64, "Established-Agent", "up to $500")
        _seed_established_history(db, agent.id, lender.id)
        loan = _request_loan_internal(db, agent, lender, Decimal("200.00"), approved_recipient)
        db.refresh(agent)
        return PersonaTriggerResult(
            persona="established", agent_id=agent.id, agent_status=agent.status.value,
            loan_id=loan.id, loan_status=loan.status.value,
            credit_limit_at_issuance=loan.credit_limit_at_issuance, is_cold_start=False,
            explanation=f"established agent approved at {loan.credit_limit_at_issuance} (above starter limit)",
        )

    elif payload.persona == "new":
        principal, private_key_b64 = _spin_up_principal(db, "Operator Demo Principal (New)")
        lender = _spin_up_lender(db, "Operator Demo Lender", min_score=60.0, max_exposure=500.0, platform_cap=100000.0)
        agent = _create_agent_with_mandate(db, principal, private_key_b64, "New-Agent", "up to $500")
        loan = _request_loan_internal(db, agent, lender, Decimal("200.00"), approved_recipient)
        db.refresh(agent)
        return PersonaTriggerResult(
            persona="new", agent_id=agent.id, agent_status=agent.status.value,
            loan_id=loan.id, loan_status=loan.status.value,
            credit_limit_at_issuance=loan.credit_limit_at_issuance, is_cold_start=True,
            explanation=f"brand-new agent got flat cold-start starter limit ({loan.credit_limit_at_issuance}), not rejected",
        )

    elif payload.persona == "misbehaving":
        principal, private_key_b64 = _spin_up_principal(db, "Operator Demo Principal (Misbehaving)")
        lender = _spin_up_lender(db, "Operator Demo Lender", min_score=30.0, max_exposure=1000.0, platform_cap=100000.0)
        agent = _create_agent_with_mandate(db, principal, private_key_b64, "Misbehaving-Agent", "up to $1000")
        loan = _request_loan_internal(db, agent, lender, Decimal("500.00"), approved_recipient)

        # Legitimate partial repayment first, so the insurance pool has a
        # real balance to draw from when default fires below.
        ledger_service.process_inflow(db, agent.id, Decimal("250.00"))
        db.commit()

        result = monitoring_service.check_spend_purpose(
            db, agent, loan, Decimal("100.00"), "attacker-controlled-address.example",
        )
        db.commit()
        db.refresh(agent)
        db.refresh(loan)

        return PersonaTriggerResult(
            persona="misbehaving", agent_id=agent.id, agent_status=agent.status.value,
            loan_id=loan.id, loan_status=loan.status.value,
            credit_limit_at_issuance=loan.credit_limit_at_issuance,
            insurance_payout=None,  # check_spend_purpose's own result doesn't carry the payout
                                    # amount directly -- see loan.write_off_amount for the final
                                    # bounded loss, and GET /lenders/insurance-pool for the live balance
            final_write_off_amount=loan.write_off_amount,
            explanation=(
                f"unauthorized payment attempt (wrong recipient) -> instant default + revoke; "
                f"agent status now {agent.status.value}, bounded write-off {loan.write_off_amount}"
            ),
        )

    else:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            f"Unknown persona '{payload.persona}'. Must be one of: established, new, misbehaving",
        )
