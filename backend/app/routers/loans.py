"""
loans.py

The core auto-approval pipeline: agent requests a loan, we run
underwriting -> policy in sequence, persist the outcome (approved or
denied -- both are recorded, not just approvals), and disburse funds
immediately on approval. No pending/queued state -- everything resolves
synchronously in one request, matching the spec's "no human in the loop
per loan" requirement.

agent_id is a PATH param (not a body field) so
get_active_agent_with_valid_credential -- which every other credential-
gated router (repayment.py) will also depend on -- can be reused
identically here, matching how it's already wired in dependencies.py.
LoanRequest.agent_id in the body is ignored in favor of the path value,
same defensive pattern as agents.py ignoring AgentCreate.principal_id.

One-active-loan-per-agent is enforced here (not in ledger_service, per
that file's own docstring) -- checked before underwriting even runs.

Decision rationale numbers (score_at_decision, policy_min_score) are
persisted on the Loan row at creation time, not recomputed later --
Loan Detail must show what was true AT THE TIME of the decision, never
the agent's current live score.

Manual credit limit override: if a lender has set
Agent.manual_credit_limit_override (agents.py PUT /{agent_id}/credit-limit),
it's applied here as the FINAL number used for credit_limit_at_issuance
on an approved loan -- downstream of both underwriting_service and
policy_engine, same way cold-start's flat COLD_START_LIMIT is downstream
of the score formula. It never changes whether the loan is approved,
only what limit gets recorded once it already is.
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Agent, Event, EventType, Loan, LoanStatus, Lender
from app.schemas import LoanRequest, LoanOut, LoanDetailOut, LoanDecisionRationale, StatusHistoryEntry
from app.dependencies import get_active_agent_with_key_and_credential
from app.services import underwriting_service, policy_engine, ledger_service

router = APIRouter(prefix="/loans", tags=["loans"])


# ---------- Internal helpers ----------

def _build_status_history(db: Session, loan_id: int) -> list[StatusHistoryEntry]:
    events = (
        db.query(Event)
        .filter(Event.loan_id == loan_id)
        .order_by(Event.created_at.asc())
        .all()
    )
    entries = []
    for event in events:
        if event.event_type == EventType.LOAN_APPROVED:
            entries.append(StatusHistoryEntry(status=LoanStatus.APPROVED, changed_at=event.created_at))
        elif event.event_type == EventType.LOAN_DENIED:
            entries.append(StatusHistoryEntry(status=LoanStatus.DENIED, changed_at=event.created_at))
        elif event.event_type == EventType.REPAYMENT_DEDUCTED and "fully repaid" in (event.detail or ""):
            entries.append(StatusHistoryEntry(status=LoanStatus.REPAID, changed_at=event.created_at))
        elif event.event_type == EventType.DEFAULTED:
            entries.append(StatusHistoryEntry(status=LoanStatus.DEFAULTED, changed_at=event.created_at))
    return entries


def _build_loan_detail(db: Session, loan: Loan) -> LoanDetailOut:
    rationale = LoanDecisionRationale(
        score_at_decision=loan.score_at_decision,
        policy_min_score=loan.policy_min_score_at_decision,
        policy_max_exposure=loan.credit_limit_at_issuance,
        threshold_cleared=loan.status in (LoanStatus.APPROVED, LoanStatus.REPAID, LoanStatus.DEFAULTED),
        explanation=_latest_decision_explanation(db, loan.id),
    )
    return LoanDetailOut(
        id=loan.id,
        agent_id=loan.agent_id,
        principal_amount=loan.principal_amount,
        outstanding_balance=loan.outstanding_balance,
        status=loan.status,
        credit_limit_at_issuance=loan.credit_limit_at_issuance,
        issued_at=loan.issued_at,
        due_at=loan.due_at,
        rationale=rationale,
        status_history=_build_status_history(db, loan.id),
    )


def _latest_decision_explanation(db: Session, loan_id: int) -> str:
    event = (
        db.query(Event)
        .filter(Event.loan_id == loan_id, Event.event_type.in_([EventType.LOAN_APPROVED, EventType.LOAN_DENIED]))
        .order_by(Event.created_at.asc())
        .first()
    )
    return event.detail if event else "no decision record found"


# ---------- Main entrypoint ----------

@router.post("/{agent_id}", response_model=LoanDetailOut, status_code=status.HTTP_201_CREATED)
def request_loan(
    payload: LoanRequest,
    db: Session = Depends(get_db),
    agent: Agent = Depends(get_active_agent_with_key_and_credential),
):
    existing_open = (
        db.query(Loan)
        .filter(Loan.agent_id == agent.id, Loan.status == LoanStatus.APPROVED)
        .first()
    )
    if existing_open is not None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Agent already has an open loan (id={existing_open.id}); repay or resolve it before requesting another",
        )

    lender = db.query(Lender).filter(Lender.id == payload.lender_id).first()
    if lender is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Lender not found")

    underwriting = underwriting_service.make_underwriting_decision(db, agent, lender)
    policy = policy_engine.evaluate_loan_request(
        db, lender, underwriting, requested_category=payload.task_category
    )

    if not policy.final_approved:
        loan = Loan(
            agent_id=agent.id,
            lender_id=lender.id,
            principal_amount=payload.principal_amount,
            interest_amount=0,
            outstanding_balance=0,
            status=LoanStatus.DENIED,
            credit_limit_at_issuance=policy.final_limit,
            approved_recipient=payload.approved_recipient,
            score_at_decision=underwriting.score_at_decision,
            policy_min_score_at_decision=underwriting.policy_min_score,
        )
        db.add(loan)
        db.flush()
        db.add(Event(
            agent_id=agent.id,
            loan_id=loan.id,
            event_type=EventType.LOAN_DENIED,
            detail=policy.explanation,
        ))
        db.commit()
        db.refresh(loan)
        return _build_loan_detail(db, loan)

    # Manual credit-limit override (agents.py PUT /{agent_id}/credit-limit)
    # is applied here as the final clamp -- downstream of both
    # underwriting_service and policy_engine, same pattern as cold-start's
    # flat limit. It never changes final_approved, only the recorded limit.
    final_limit = policy.final_limit
    explanation = policy.explanation
    if agent.manual_credit_limit_override is not None:
        final_limit = Decimal(agent.manual_credit_limit_override)
        explanation += (
            f"; lender manually overrode this agent's limit to {final_limit} "
            f"(was {policy.final_limit} from score/policy)"
        )

    loan = Loan(
        agent_id=agent.id,
        lender_id=lender.id,
        principal_amount=payload.principal_amount,
        interest_amount=0,
        outstanding_balance=payload.principal_amount,
        status=LoanStatus.APPROVED,
        credit_limit_at_issuance=final_limit,
        approved_recipient=payload.approved_recipient,
        score_at_decision=underwriting.score_at_decision,
        policy_min_score_at_decision=underwriting.policy_min_score,
    )
    db.add(loan)
    db.flush()

    ledger_service.disburse_loan(db, loan)
    db.add(Event(
        agent_id=agent.id,
        loan_id=loan.id,
        event_type=EventType.LOAN_APPROVED,
        detail=explanation,
    ))

    db.commit()
    db.refresh(loan)
    return _build_loan_detail(db, loan)


# ---------- Read endpoints ----------

@router.get("/{loan_id}", response_model=LoanDetailOut)
def get_loan_detail(loan_id: int, db: Session = Depends(get_db)):
    loan = db.query(Loan).filter(Loan.id == loan_id).first()
    if loan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Loan not found")
    return _build_loan_detail(db, loan)


@router.get("", response_model=list[LoanOut])
def list_loans(
    agent_id: int | None = None,
    lender_id: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(Loan)
    if agent_id is not None:
        query = query.filter(Loan.agent_id == agent_id)
    if lender_id is not None:
        query = query.filter(Loan.lender_id == lender_id)
    return query.order_by(Loan.issued_at.desc()).all()
