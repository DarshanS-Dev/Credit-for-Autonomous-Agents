"""
policy_engine.py

Owns the "does this loan request fit the lender's overall rules?" check —
distinct from underwriting_service.py, which only answers "is this agent
individually creditworthy?" (score vs. min_score_required, per-agent limit
vs. max_exposure_per_agent).

This module sits downstream of underwriting_service.py in the request
flow and is the layer that can still say NO even when an agent's score
and per-agent limit both look fine, because the loan doesn't fit the
lender's broader policy:

1. Category fit — is this loan's task category one the lender is
   willing to fund at all (Lender.allowed_agent_categories)? A high
   score doesn't override a category the lender explicitly excluded.
2. Platform-wide exposure cap — would approving this loan push the
   lender's TOTAL outstanding balance across ALL their agents past
   Lender.total_platform_exposure_cap? This is a portfolio-level check
   that no single per-agent number can catch on its own — an agent
   could individually qualify while the lender as a whole is already
   fully committed.

Deliberately excluded from this file:
- Anomaly/baseline-deviation detection (Section 9) — monitoring_service.py,
  ongoing behavior, not a one-time request-time check.
- The score formula and per-agent limit itself — underwriting_service.py.
- Task-type RISK WEIGHTING (adjusting the approved limit/score based on
  how risky a task category is, e.g. data-labeling vs. crypto trading) —
  flagged separately as a future enhancement layered on top of category
  fit. This file only does binary category fit for now, not risk scaling.

Like underwriting_service.py, this returns a raw dataclass, not a Pydantic
schema — the router is responsible for turning this (combined with the
UnderwritingDecision) into the LoanDecisionRationale response.
"""

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Lender, Loan, LoanStatus
from app.services.underwriting_service import UnderwritingDecision


# ---------- Return type ----------

@dataclass
class PolicyDecision:
    """
    Final gate on top of an UnderwritingDecision. `final_approved` is what
    the router should actually act on — it can be False even when the
    underwriting decision alone was approved, if a policy check fails here.
    """
    category_allowed: bool
    current_platform_exposure: Decimal
    platform_exposure_cap: Decimal
    would_exceed_platform_cap: bool
    final_approved: bool
    final_limit: Decimal
    explanation: str


# ---------- Helpers ----------

def current_platform_exposure(db: Session, lender_id: int) -> Decimal:
    """
    Sum of outstanding_balance across every loan this lender currently has
    live (APPROVED status — i.e. disbursed and not yet fully repaid or
    defaulted-and-written-off). PENDING loans aren't counted since nothing
    has been disbursed yet; REPAID/DEFAULTED loans no longer represent
    live exposure.

    Note: Loan does not currently have a lender_id column (it's linked to
    an agent, not directly to a lender) — see the "what to change" notes
    accompanying this file. This function assumes that column exists.
    """
    loans = (
        db.query(Loan)
        .filter(Loan.lender_id == lender_id, Loan.status == LoanStatus.APPROVED)
        .all()
    )
    return sum((Decimal(loan.outstanding_balance) for loan in loans), Decimal("0"))


def _category_allowed(lender: Lender, requested_category: str | None) -> bool:
    """
    True if the lender funds this category at all. A missing/None category
    on the request is treated as allowed (not every persona/demo loan needs
    a category), so this check only ever blocks on an explicit mismatch.
    An empty allowed_agent_categories list is treated as "no restriction"
    (lender hasn't configured category rules), not "allow nothing."
    """
    if requested_category is None:
        return True
    if not lender.allowed_agent_categories:
        return True
    return requested_category in lender.allowed_agent_categories


# ---------- Main entrypoint ----------

def evaluate_loan_request(
    db: Session,
    lender: Lender,
    underwriting_decision: UnderwritingDecision,
    requested_category: str | None = None,
) -> PolicyDecision:
    """
    Combine underwriting_decision with lender-wide policy checks to produce
    the final go/no-go and final approved limit.

    Order of checks (first failure wins, each is independently reported in
    the returned PolicyDecision so the router/UI can explain exactly which
    rule blocked the loan):
    1. Was the agent-level underwriting decision itself an approval at all?
    2. Is the requested category one the lender funds?
    3. Would this loan push the lender's total live exposure past their
       platform-wide cap?
    """
    exposure = current_platform_exposure(db, lender.id)
    cap = Decimal(lender.total_platform_exposure_cap)
    category_ok = _category_allowed(lender, requested_category)

    if not underwriting_decision.approved:
        return PolicyDecision(
            category_allowed=category_ok,
            current_platform_exposure=exposure,
            platform_exposure_cap=cap,
            would_exceed_platform_cap=False,
            final_approved=False,
            final_limit=Decimal("0"),
            explanation="underwriting decision was already a denial; policy checks not reached",
        )

    if not category_ok:
        return PolicyDecision(
            category_allowed=False,
            current_platform_exposure=exposure,
            platform_exposure_cap=cap,
            would_exceed_platform_cap=False,
            final_approved=False,
            final_limit=Decimal("0"),
            explanation=(
                f"task category '{requested_category}' is not in lender's "
                f"allowed categories -> denied despite qualifying score"
            ),
        )

    projected_exposure = exposure + underwriting_decision.approved_limit
    would_exceed = projected_exposure > cap

    if would_exceed:
        return PolicyDecision(
            category_allowed=True,
            current_platform_exposure=exposure,
            platform_exposure_cap=cap,
            would_exceed_platform_cap=True,
            final_approved=False,
            final_limit=Decimal("0"),
            explanation=(
                f"approving {underwriting_decision.approved_limit} would bring lender's "
                f"total exposure to {projected_exposure}, exceeding platform cap {cap} "
                f"-> denied despite qualifying score and category"
            ),
        )

    return PolicyDecision(
        category_allowed=True,
        current_platform_exposure=exposure,
        platform_exposure_cap=cap,
        would_exceed_platform_cap=False,
        final_approved=True,
        final_limit=underwriting_decision.approved_limit,
        explanation=(
            f"category and platform exposure checks passed "
            f"({projected_exposure}/{cap}) -> approved at {underwriting_decision.approved_limit}"
        ),
    )