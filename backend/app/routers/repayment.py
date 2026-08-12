"""
repayment.py

Post-disbursement money events for an agent's open loan: inflows (task
payouts, auto-deducted before release) and misbehavior triggers (spend
purpose-mismatch, task failure) that lead to default + revocation.

Deliberately does NOT model or debit the agent's spend of its own
spendable_balance -- once released, that money is the agent's own
wallet to use, outside this system's control. Our authority is limited
to (a) intercepting inflows before release [ledger_service.process_inflow]
and (b) detecting and killing misuse after the fact [monitoring_service /
declare_default + revoke_agent]. We never simulate the spend itself.
"""

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Agent, Loan, LoanStatus
from app.schemas import RepaymentLedgerEntry, SpendCheckResultOut, TaskFailureResultOut
from app.dependencies import get_active_agent_with_key_and_credential, revoke_agent
from app.services import ledger_service, monitoring_service

router = APIRouter(prefix="/repayment", tags=["repayment"])


class InflowRequest(BaseModel):
    amount: Decimal


class SpendCheckRequest(BaseModel):
    amount: Decimal
    recipient: str


def _get_open_loan_or_404(db: Session, agent_id: int) -> Loan:
    loan = (
        db.query(Loan)
        .filter(Loan.agent_id == agent_id, Loan.status == LoanStatus.APPROVED)
        .first()
    )
    if loan is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent has no open loan")
    return loan


@router.post("/inflow/{agent_id}", response_model=RepaymentLedgerEntry)
def record_inflow(
    payload: InflowRequest,
    db: Session = Depends(get_db),
    agent: Agent = Depends(get_active_agent_with_key_and_credential),
):
    """
    Simulates a task payout landing for the agent. In the real system this
    would be triggered by the task-execution side, not a human -- here
    it's called directly (by the demo persona scripts or manually) to
    represent that event. Repayment deduction happens before anything
    reaches the agent's spendable balance, per Section 7. A slice of any
    deduction also flows into the insurance pool (see ledger_service.py).
    """
    result = ledger_service.process_inflow(db, agent.id, payload.amount)
    db.commit()

    return RepaymentLedgerEntry(
        inflow_amount=result.inflow_amount,
        amount_deducted=result.amount_deducted,
        amount_released_to_agent=result.amount_released_to_agent,
        insurance_contribution=result.insurance_contribution,
        write_off_amount=None,  # only ever set on a declared default, not a normal inflow
        created_at=result.created_at,
    )


@router.post("/spend/{agent_id}", response_model=SpendCheckResultOut)
def check_spend(
    payload: SpendCheckRequest,
    db: Session = Depends(get_db),
    agent: Agent = Depends(get_active_agent_with_key_and_credential),
):
    """
    Evaluates whether a spend attempt matches the loan's approved purpose.
    Does NOT move any money -- the agent's spendable_balance is its own
    to use once released; we only ever detect and react to misuse
    (monitoring_service handles the default+revoke internally for a
    wrong-recipient case).

    Called BEFORE any real/simulated spend the agent takes, so a
    wrong-recipient attempt is caught and killed before it's treated as
    having happened -- consistent with monitoring_service's own docstring.
    """
    loan = _get_open_loan_or_404(db, agent.id)

    result = monitoring_service.check_spend_purpose(
        db, agent, loan, payload.amount, payload.recipient
    )
    db.commit()

    return SpendCheckResultOut(
        severity=result.severity.value,
        reason=result.reason,
        loan_id=result.loan_id,
    )


@router.post("/task-failure/{agent_id}", response_model=TaskFailureResultOut)
def declare_task_failure(
    db: Session = Depends(get_db),
    agent: Agent = Depends(get_active_agent_with_key_and_credential),
):
    """
    Task failure is a distinct default trigger from spend misuse -- there's
    no recipient/amount to evaluate, the task simply didn't complete, so
    this bypasses monitoring_service entirely and goes straight to the
    same default + revoke sequence monitoring_service._handle_default
    uses internally for the wrong-recipient case. Kept as its own
    endpoint (not folded into check_spend) since "no spend was even
    attempted" is a genuinely different scenario, not a spend that
    failed a check.
    """
    loan = _get_open_loan_or_404(db, agent.id)

    default_result = ledger_service.declare_default(db, loan_id=loan.id)
    revoke_agent(db, agent_id=agent.id, reason="task execution failed; loan defaulted")
    db.commit()

    return TaskFailureResultOut(
        loan_id=default_result.loan_id,
        agent_id=default_result.agent_id,
        shortfall_before_clawback=default_result.shortfall_before_clawback,
        total_clawed_back=default_result.total_clawed_back,
        insurance_payout=default_result.insurance_payout,
        final_write_off_amount=default_result.final_write_off_amount,
        agent_status="defaulted",
    )