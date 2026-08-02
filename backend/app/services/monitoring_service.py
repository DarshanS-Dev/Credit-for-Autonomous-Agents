"""
monitoring_service.py

Owns Section 9 of the spec (USP/differentiator) -- but reframed per
discussion: the anomaly signal is PURPOSE-MISMATCH, not spend volume.
An agent spending its full loan quickly is the loan working as intended,
not a red flag. The actual risk signal is whether the money is going
where it was borrowed to go.

Two independent checks, escalating severity:
1. Wrong recipient entirely -> the agent is paying someone the loan was
   never approved for. No legitimate reason for this. Treated as an
   unauthorized-payment attempt (spec Section 10, item 3) -> triggers
   default + revocation immediately, not just a flag.
2. Right recipient, amount overshoots the loan principal by more than
   a small tolerance (10%) -> flagged only, not defaulted. Could be a
   legitimate price shift on the vendor's end; worth surfacing on the
   Anomaly & Alerts Feed, not worth an automatic kill.

Scope boundaries (deliberate):
- This file decides "is this spend attempt anomalous, and how severely."
  It does NOT move money (ledger_service.py owns that) and does NOT
  flip Agent.status directly -- revocation is delegated to
  revoke_agent() (kept in app/dependencies.py, alongside the other
  credential-state logic) so there's exactly one place in the codebase
  that flips an agent to revoked/defaulted/blacklisted, whether the
  trigger is this file, a manual Operator Console kill switch, or
  anything else in the future.
- Called from the simulate-spend endpoint BEFORE any wallet debit is
  attempted -- a wrong-recipient spend should never reach
  ledger_service at all, it's caught and killed here first.
"""

from dataclasses import dataclass
from decimal import Decimal
from enum import Enum

from sqlalchemy.orm import Session

from app.models import Agent, EventType, Event, Loan, LoanStatus
from app.services import ledger_service
from app.dependencies import revoke_agent


# ---------- Tunable constants ----------

# Tolerance above the loan's own principal amount before a *correctly
# recipient-matched* spend is even flag-worthy. Anything within this
# band is treated as normal (e.g. minor vendor price movement), not
# an anomaly at all.
OVERSPEND_TOLERANCE_RATIO = Decimal("1.1")


# ---------- Result type ----------

class AnomalySeverity(str, Enum):
    NONE = "none"
    FLAGGED = "flagged"       # surfaced on Anomaly & Alerts Feed, agent keeps operating
    DEFAULTED = "defaulted"   # loan defaulted + agent revoked, immediately


@dataclass
class SpendCheckResult:
    severity: AnomalySeverity
    reason: str | None
    loan_id: int | None = None


# ---------- Main entrypoint ----------

def check_spend_purpose(
    db: Session,
    agent: Agent,
    loan: Loan,
    transaction_amount: Decimal,
    transaction_recipient: str,
) -> SpendCheckResult:
    """
    Call this BEFORE any wallet debit / spend is actually recorded, from
    whatever endpoint handles a simulated (or real, eventually) spend
    attempt.

    Only ever called when `loan` is the agent's currently open
    (APPROVED) loan -- if the agent has no open loan, there's nothing to
    check purpose-fit against and this function shouldn't be reached by
    the caller.

    Order of checks:
    1. Recipient mismatch -> immediate default + revoke. This is the
       "unauthorized payment attempt" scenario from the spec's demo
       script (Section 10, item 3) -- there is no tolerance band here,
       any mismatch is treated as intentional misuse, not noise.
    2. Recipient matches, but amount exceeds loan principal by more
       than OVERSPEND_TOLERANCE_RATIO -> flag only, no action taken
       against the agent or loan.
    3. Otherwise -> clean, no anomaly.
    """
    transaction_amount = Decimal(transaction_amount)

    if transaction_recipient != loan.approved_recipient:
        _handle_default(
            db,
            agent=agent,
            loan=loan,
            reason=(
                f"spend recipient '{transaction_recipient}' does not match "
                f"loan's approved recipient '{loan.approved_recipient}' "
                f"-> unauthorized payment attempt"
            ),
        )
        return SpendCheckResult(
            severity=AnomalySeverity.DEFAULTED,
            reason="wrong_recipient",
            loan_id=loan.id,
        )

    principal = Decimal(loan.principal_amount)
    overspend_limit = principal * OVERSPEND_TOLERANCE_RATIO

    if transaction_amount > overspend_limit:
        reason = (
            f"spend amount {transaction_amount} exceeds loan principal "
            f"{principal} by more than {OVERSPEND_TOLERANCE_RATIO}x tolerance "
            f"({overspend_limit}) -> flagged, recipient still correct"
        )
        db.add(Event(
            agent_id=agent.id,
            event_type=EventType.ANOMALY_FLAGGED,
            detail=reason,
        ))
        return SpendCheckResult(
            severity=AnomalySeverity.FLAGGED,
            reason="beyond_loan_purpose",
            loan_id=loan.id,
        )

    return SpendCheckResult(severity=AnomalySeverity.NONE, reason=None, loan_id=loan.id)


# ---------- Internal: wiring default + revoke together ----------

def _handle_default(db: Session, agent: Agent, loan: Loan, reason: str) -> None:
    """
    A wrong-recipient spend is both a money problem and a trust problem,
    so this deliberately calls both halves rather than picking one:

    - ledger_service.declare_default(): resolves the outstanding balance
      (attempts cross-agent clawback, records the bounded write-off) --
      does NOT touch Agent.status by its own design.
    - revoke_agent(): the single place that flips Agent.status, kept
      separate so a manual Operator Console kill switch can call the
      exact same function later without duplicating this logic.

    Both writes + the Event log happen in this one call so a caller
    (the simulate-spend router) gets one atomic-looking outcome to
    commit, even though it's touching three different concerns.
    """
    ledger_service.declare_default(db, loan_id=loan.id)
    revoke_agent(db, agent_id=agent.id, reason=reason)

    db.add(Event(
        agent_id=agent.id,
        event_type=EventType.DEFAULTED,
        detail=reason,
    ))