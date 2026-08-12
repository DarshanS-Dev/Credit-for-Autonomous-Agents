"""
ledger_service.py

Owns Section 7 of the spec (repayment enforcement) -- the custodial ledger /
payout interception mechanism. This is the SINGLE CHOKE POINT: every change
to Wallet.spendable_balance must go through process_inflow() in this file.
No other module should touch Wallet.spendable_balance directly. That's what
lets us claim "rules enforced outside the agent's own logic" without real
blockchain infrastructure (Section 8).

Repayment model (confirmed):
- No installment schedule / due dates. Repayment is purely inflow-triggered:
  whenever money lands for an agent, we deduct as much of the outstanding
  loan balance as the inflow covers, immediately, before anything reaches
  spendable_balance.
- Partial repayment != default. If the inflow is smaller than what's owed,
  the loan simply stays APPROVED (open) with a reduced outstanding_balance,
  and $0 is released to spendable_balance. Default is a distinct, explicit
  trigger (task failure / agent spends before repayment / unauthorized
  payment attempt) -- never inferred just because one inflow fell short.
- One active loan per agent at a time (enforced at request time, not here)
  means this file never has to decide deduction order across multiple
  open loans for the same agent.

Interest:
- Frozen at issuance (Loan.interest_amount, set once when the loan is
  created -- not accrued over time). This file only consumes
  outstanding_balance as already-computed; it doesn't compute interest
  itself.

Cross-agent clawback:
- If an agent defaults and its own payout can't cover the shortfall
  (ghosted, spent, or task failed with nothing to reclaim), we check
  sibling agents under the SAME principal_id for spendable balance before
  declaring the loss.
- Consistent with vouching: only agents with vouching_enabled == True are
  eligible to be pulled from.
- Capped per sibling (CLAWBACK_CAP_RATIO) so one bad agent can never drain
  a healthy sibling's whole balance.
- Recorded as its own TransactionType (CROSS_AGENT_CLAWBACK) tagged to both
  the paying sibling and the original defaulting agent/loan.

Insurance pool (second layer of loss protection, after clawback):
- Funded by INSURANCE_CONTRIBUTION_RATE skimmed off every successful
  repayment deduction -- a small, ongoing tax on the system working
  correctly, same principle as a loan-loss reserve funded by interest
  margin in traditional lending.
- On default, whatever clawback couldn't cover is drawn from the pool,
  capped at INSURANCE_PAYOUT_CAP_RATIO of the pool's CURRENT balance per
  default -- mirrors CLAWBACK_CAP_RATIO's reasoning: one very bad default
  should never fully drain protection for every other lender relying on
  the pool.
- Order of protection: cross-agent clawback -> insurance pool -> bounded
  write-off. Never the other way around -- clawback is "the defaulting
  agent's own fleet takes first responsibility," the pool is the
  platform-wide backstop after that's exhausted.
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Agent, InsurancePool, Loan, LoanStatus, Transaction, TransactionType, Wallet, Event, EventType


# ---------- Tunable constants ----------

# Never claw back more than this fraction of a sibling's own spendable
# balance in a single clawback pass, regardless of how large the shortfall
# is. Keeps clawback from being able to fully drain a healthy sibling.
CLAWBACK_CAP_RATIO = Decimal("0.30")

# Fraction of every successful repayment deduction that gets skimmed into
# the insurance pool.
INSURANCE_CONTRIBUTION_RATE = Decimal("0.05")

# Never let a single default draw more than this fraction of the pool's
# CURRENT balance, so one bad default can't wipe out protection for every
# other lender relying on the pool.
INSURANCE_PAYOUT_CAP_RATIO = Decimal("0.50")


# ---------- Return types ----------

@dataclass
class InflowResult:
    """Result of a normal (non-default) inflow being processed."""
    inflow_amount: Decimal
    amount_deducted: Decimal
    amount_released_to_agent: Decimal
    loan_fully_repaid: bool
    remaining_outstanding_balance: Decimal
    insurance_contribution: Decimal
    created_at: datetime


@dataclass
class ClawbackEntry:
    sibling_agent_id: int
    amount_clawed: Decimal


@dataclass
class DefaultResult:
    """Result of explicitly declaring a loan in default."""
    loan_id: int
    agent_id: int
    shortfall_before_clawback: Decimal
    clawback_entries: list[ClawbackEntry] = field(default_factory=list)
    total_clawed_back: Decimal = Decimal("0")
    insurance_payout: Decimal = Decimal("0")
    final_write_off_amount: Decimal = Decimal("0")


# ---------- Internal helpers (the only code allowed to touch Wallet.spendable_balance) ----------

def _credit_wallet(db: Session, agent_id: int, amount: Decimal) -> None:
    """Only place in the codebase that increases spendable_balance."""
    if amount <= 0:
        return
    wallet = db.query(Wallet).filter(Wallet.agent_id == agent_id).first()
    wallet.spendable_balance = Decimal(wallet.spendable_balance) + amount


def _debit_wallet(db: Session, agent_id: int, amount: Decimal) -> None:
    """Only place in the codebase that decreases spendable_balance."""
    if amount <= 0:
        return
    wallet = db.query(Wallet).filter(Wallet.agent_id == agent_id).first()
    wallet.spendable_balance = Decimal(wallet.spendable_balance) - amount


def _get_open_loan(db: Session, agent_id: int) -> Loan | None:
    """
    The one open loan for this agent, if any. Relies on the "one active
    loan per agent" constraint enforced at request time -- if that
    constraint is ever violated upstream, this returns whichever APPROVED
    loan sorts first, which would indicate a bug elsewhere, not something
    this function tries to resolve.
    """
    return (
        db.query(Loan)
        .filter(Loan.agent_id == agent_id, Loan.status == LoanStatus.APPROVED)
        .first()
    )


# ---------- Internal helpers: insurance pool ----------

def _get_insurance_pool(db: Session) -> InsurancePool:
    """Single-row table, id=1, seeded once via migration."""
    return db.query(InsurancePool).filter(InsurancePool.id == 1).first()


def _contribute_to_pool(db: Session, agent_id: int, loan_id: int, amount_deducted: Decimal) -> Decimal:
    """
    Skims INSURANCE_CONTRIBUTION_RATE off a successful repayment deduction
    into the pool. Returns the contribution amount (0 if there was nothing
    to contribute) so callers can surface it on the repayment ledger.
    """
    pool = _get_insurance_pool(db)
    contribution = (amount_deducted * INSURANCE_CONTRIBUTION_RATE).quantize(Decimal("0.01"))
    if contribution <= 0:
        return Decimal("0")
    pool.balance = Decimal(pool.balance) + contribution
    db.add(Transaction(
        agent_id=agent_id,
        loan_id=loan_id,
        type=TransactionType.INSURANCE_CONTRIBUTION,
        amount=contribution,
    ))
    return contribution


def _draw_from_pool(db: Session, agent_id: int, loan_id: int, shortfall: Decimal) -> Decimal:
    """
    Attempts to cover as much of `shortfall` as the pool allows, capped at
    INSURANCE_PAYOUT_CAP_RATIO of the pool's CURRENT balance. Returns the
    amount actually drawn (0 if the pool is empty or the cap is 0).
    """
    pool = _get_insurance_pool(db)
    pool_balance = Decimal(pool.balance)
    cap_for_this_default = pool_balance * INSURANCE_PAYOUT_CAP_RATIO
    draw = min(shortfall, cap_for_this_default, pool_balance)
    if draw <= 0:
        return Decimal("0")
    pool.balance = pool_balance - draw
    db.add(Transaction(
        agent_id=agent_id,
        loan_id=loan_id,
        type=TransactionType.INSURANCE_PAYOUT,
        amount=draw,
    ))
    return draw


# ---------- Main entrypoint: disbursement ----------

def disburse_loan(db: Session, loan: Loan) -> None:
    """
    Credits a newly-approved loan's principal to the agent's spendable
    balance and records the DISBURSEMENT transaction. Called once, by the
    loans.py router, immediately after a Loan transitions PENDING -> APPROVED.

    Goes through _credit_wallet like everything else here -- this file
    remains the only place Wallet.spendable_balance is touched, disbursement
    included, not just repayment.

    Does not commit -- caller (router) owns the transaction boundary, same
    convention as process_inflow() / declare_default().
    """
    amount = Decimal(loan.principal_amount)
    _credit_wallet(db, loan.agent_id, amount)
    db.add(Transaction(
        agent_id=loan.agent_id,
        loan_id=loan.id,
        type=TransactionType.DISBURSEMENT,
        amount=amount,
    ))


# ---------- Main entrypoint: normal inflow ----------

def process_inflow(db: Session, agent_id: int, inflow_amount: Decimal) -> InflowResult:
    """
    THE single choke point. Call this whenever a task payout (or any other
    inflow) lands for an agent. Handles:
    - no open loan -> full amount released to spendable_balance
    - open loan, inflow >= outstanding -> full repayment, loan -> REPAID,
      remainder released to spendable_balance
    - open loan, inflow < outstanding -> partial repayment, loan stays
      APPROVED with reduced outstanding_balance, $0 released

    On any deduction, INSURANCE_CONTRIBUTION_RATE of the deducted amount
    is skimmed into the insurance pool (see module docstring).

    Does NOT commit the session -- caller (router) owns the transaction
    boundary so this can be composed with other writes (e.g. logging the
    Event row) atomically.
    """
    inflow_amount = Decimal(inflow_amount)
    recorded_at = datetime.now(timezone.utc)
    loan = _get_open_loan(db, agent_id)

    if loan is None:
        _credit_wallet(db, agent_id, inflow_amount)
        db.add(Transaction(
            agent_id=agent_id,
            loan_id=None,
            type=TransactionType.TASK_PAYOUT,
            amount=inflow_amount,
        ))
        return InflowResult(
            inflow_amount=inflow_amount,
            amount_deducted=Decimal("0"),
            amount_released_to_agent=inflow_amount,
            loan_fully_repaid=False,
            remaining_outstanding_balance=Decimal("0"),
            insurance_contribution=Decimal("0"),
            created_at=recorded_at,
        )

    outstanding = Decimal(loan.outstanding_balance)
    amount_deducted = min(inflow_amount, outstanding)
    remainder = inflow_amount - amount_deducted

    loan.outstanding_balance = outstanding - amount_deducted
    loan_fully_repaid = loan.outstanding_balance == 0
    if loan_fully_repaid:
        loan.status = LoanStatus.REPAID
        db.add(Event(
            agent_id=agent_id,
            loan_id=loan.id,
            event_type=EventType.REPAYMENT_DEDUCTED,
            detail=f"loan fully repaid: final deduction {amount_deducted} clears outstanding balance",
        ))

    db.add(Transaction(
        agent_id=agent_id,
        loan_id=loan.id,
        type=TransactionType.TASK_PAYOUT,
        amount=inflow_amount,
    ))

    insurance_contribution = Decimal("0")
    if amount_deducted > 0:
        db.add(Transaction(
            agent_id=agent_id,
            loan_id=loan.id,
            type=TransactionType.REPAYMENT,
            amount=amount_deducted,
        ))
        insurance_contribution = _contribute_to_pool(db, agent_id, loan.id, amount_deducted)

    _credit_wallet(db, agent_id, remainder)

    return InflowResult(
        inflow_amount=inflow_amount,
        amount_deducted=amount_deducted,
        amount_released_to_agent=remainder,
        loan_fully_repaid=loan_fully_repaid,
        remaining_outstanding_balance=Decimal(loan.outstanding_balance),
        insurance_contribution=insurance_contribution,
        created_at=recorded_at,
    )


# ---------- Default path ----------

def _eligible_siblings_for_clawback(db: Session, agent: Agent) -> list[Agent]:
    return (
        db.query(Agent)
        .filter(
            Agent.principal_id == agent.principal_id,
            Agent.id != agent.id,
            Agent.vouching_enabled.is_(True),
        )
        .all()
    )


def declare_default(db: Session, loan_id: int) -> DefaultResult:
    """
    Explicitly declare a loan in default (task failure, agent spent payout
    before repayment could be deducted, or an unauthorized-payment attempt
    was caught). This is a distinct call site from process_inflow -- a
    shortfall on a single inflow is NOT enough on its own to trigger this;
    something upstream decides a default has actually occurred and calls
    this explicitly.

    Sequence:
    1. Whatever outstanding_balance remains on the loan is the shortfall.
    2. Attempt cross-agent clawback from vouching-enabled siblings, capped
       per sibling at CLAWBACK_CAP_RATIO of their own spendable_balance.
    3. Whatever's left after clawback is drawn from the insurance pool,
       capped at INSURANCE_PAYOUT_CAP_RATIO of the pool's current balance.
    4. Whatever's left after that is the final bounded write-off.
    5. Loan -> DEFAULTED, write_off_amount recorded on the loan itself.

    Does not touch Agent.status (revocation/blacklisting) -- that's the
    credential layer's responsibility (app/dependencies.py +
    monitoring_service.py), kept separate so this file stays focused on
    money movement only.
    """
    loan = db.query(Loan).filter(Loan.id == loan_id).first()
    shortfall = Decimal(loan.outstanding_balance)

    agent = db.query(Agent).filter(Agent.id == loan.agent_id).first()
    clawback_entries: list[ClawbackEntry] = []
    remaining_shortfall = shortfall

    if remaining_shortfall > 0:
        for sibling in _eligible_siblings_for_clawback(db, agent):
            if remaining_shortfall <= 0:
                break
            sibling_wallet = db.query(Wallet).filter(Wallet.agent_id == sibling.id).first()
            if sibling_wallet is None:
                continue
            sibling_balance = Decimal(sibling_wallet.spendable_balance)
            cap_for_sibling = sibling_balance * CLAWBACK_CAP_RATIO
            amount_to_claw = min(remaining_shortfall, cap_for_sibling)
            if amount_to_claw <= 0:
                continue

            _debit_wallet(db, sibling.id, amount_to_claw)
            db.add(Transaction(
                agent_id=sibling.id,
                loan_id=loan.id,
                type=TransactionType.CROSS_AGENT_CLAWBACK,
                amount=amount_to_claw,
            ))
            clawback_entries.append(ClawbackEntry(sibling_agent_id=sibling.id, amount_clawed=amount_to_claw))
            remaining_shortfall -= amount_to_claw

    total_clawed_back = shortfall - remaining_shortfall

    insurance_draw = Decimal("0")
    if remaining_shortfall > 0:
        insurance_draw = _draw_from_pool(db, agent.id, loan.id, remaining_shortfall)
        remaining_shortfall -= insurance_draw

    final_write_off = remaining_shortfall

    loan.outstanding_balance = Decimal("0")
    loan.status = LoanStatus.DEFAULTED
    loan.write_off_amount = final_write_off

    return DefaultResult(
        loan_id=loan.id,
        agent_id=agent.id,
        shortfall_before_clawback=shortfall,
        clawback_entries=clawback_entries,
        total_clawed_back=total_clawed_back,
        insurance_payout=insurance_draw,
        final_write_off_amount=final_write_off,
    )