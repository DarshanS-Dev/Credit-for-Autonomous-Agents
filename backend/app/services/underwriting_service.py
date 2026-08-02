"""
underwriting_service.py

Owns Section 6 of the spec (scoring without credit history) and produces
the approve / starter-limit / deny decision for a loan request, checked
against the requesting lender's policy (Lender.min_score_required,
max_exposure_per_agent, allowed_agent_categories).

Scope boundaries (deliberate):
- This file OWNS the score formula. It computes AgentScore.score from
  task_success_rate, spend_regularity, transaction history length, and
  prior repayment history — it does not just read a precomputed value.
- Cold-start is defined as "no AgentScore row exists yet for this agent"
  (not a transaction-count threshold). Cold-start agents get a flat
  conservative starter limit, not a percentage of the lender's cap —
  flat avoids edge cases where a lender's max_exposure_per_agent is huge.
- This service returns RAW decision data (score, thresholds, approved
  bool, limit, explanation string) — it does NOT construct the
  LoanDecisionRationale Pydantic schema itself. The router assembles the
  schema from this output. Keeps this module DB/schema-agnostic and
  independently testable without importing app.schemas.
- Anomaly detection (Section 9 — deviation from an agent's OWN ongoing
  baseline behavior) does NOT live here. That is ongoing monitoring, not
  a one-time loan-request decision, and belongs entirely in
  monitoring_service.py.

Cross-agent reputation sharing (cold-start innovation):
- Real principals run fleets of agents, not one agent in isolation.
- When an agent is cold-start, instead of underwriting it in a vacuum,
  we look at sibling agents under the same principal_id that DO have an
  AgentScore, and grant a small, capped trust boost off their average.
- This boost is capped low and only ever applied on top of the flat
  starter limit / cold-start score baseline — it can raise a cold-start
  agent's effective score/limit modestly, it can never substitute for a
  real track record, and it never applies once the agent has its own
  AgentScore row (that's a one-time cold-start allowance, not a
  permanent subsidy).
- Only siblings with Agent.vouching_enabled == True are considered. The
  principal opts an agent into the fleet-trust pool (a single boolean,
  not a per-pair consent graph) — vouching never happens silently for
  an agent the principal hasn't enrolled.
"""

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Agent, AgentScore, Lender, Loan, LoanStatus, Transaction, TransactionType


# ---------- Tunable constants ----------

# Flat conservative limit for any agent with no AgentScore row yet.
# Flat (not a % of lender's cap) so a lender with a huge max_exposure_per_agent
# doesn't accidentally hand a brand-new, unproven agent a large loan.
COLD_START_LIMIT = Decimal("50.00")

# A nominal score assigned to cold-start agents purely so they have SOME
# number to compare against policy.min_score_required. This is intentionally
# low/conservative — it should sit below most lenders' thresholds, which is
# exactly what routes a cold-start agent to "starter limit" rather than
# "full approval" in the decision logic below.
COLD_START_BASE_SCORE = Decimal("40.00")

# Cross-agent reputation boost: capped so a strong sibling can meaningfully
# help but never fully vouch a brand-new agent into a high score.
MAX_SIBLING_BOOST = Decimal("15.00")

# Score formula weights. Chosen so repayment history (the signal a lender
# actually cares about most) dominates, task success rate is secondary,
# and spend regularity / history length are smaller stabilizing factors.
WEIGHT_TASK_SUCCESS = Decimal("0.35")
WEIGHT_SPEND_REGULARITY = Decimal("0.20")
WEIGHT_HISTORY_LENGTH = Decimal("0.15")
WEIGHT_REPAYMENT_HISTORY = Decimal("0.30")

# Transaction count considered "full credit" for the history-length signal.
# An agent with this many or more transactions gets full marks on this
# component; fewer scales down linearly. Arbitrary but reasonable for a
# 30-hour demo — avoids needing a real distribution to calibrate against.
HISTORY_LENGTH_FULL_CREDIT_COUNT = 20


# ---------- Return type ----------

@dataclass
class UnderwritingDecision:
    """
    Raw decision output. The router is responsible for turning this into
    the LoanDecisionRationale schema (schemas.py) for the API response.
    """
    score_at_decision: Decimal
    policy_min_score: Decimal
    policy_max_exposure: Decimal
    is_cold_start: bool
    sibling_boost_applied: Decimal
    approved: bool
    is_starter_limit: bool
    approved_limit: Decimal
    explanation: str


# ---------- Score formula ----------

def _history_length_component(transaction_count: int) -> Decimal:
    if transaction_count <= 0:
        return Decimal("0")
    ratio = Decimal(min(transaction_count, HISTORY_LENGTH_FULL_CREDIT_COUNT)) / Decimal(
        HISTORY_LENGTH_FULL_CREDIT_COUNT
    )
    return ratio * Decimal("100")


def _repayment_history_component(db: Session, agent_id: int) -> Decimal:
    """
    Prior repayment history signal: fraction of the agent's past loans that
    reached REPAID status (as opposed to DEFAULTED). Loans still PENDING/
    APPROVED (i.e. currently active/open) are excluded — they haven't
    resolved yet and shouldn't count as either a positive or negative
    signal.
    """
    resolved_loans = (
        db.query(Loan)
        .filter(
            Loan.agent_id == agent_id,
            Loan.status.in_([LoanStatus.REPAID, LoanStatus.DEFAULTED]),
        )
        .all()
    )
    if not resolved_loans:
        # No resolved history yet -> neutral midpoint, not zero. A brand new
        # agent isn't "bad at repaying," it just has no data point yet.
        return Decimal("50")

    repaid_count = sum(1 for loan in resolved_loans if loan.status == LoanStatus.REPAID)
    ratio = Decimal(repaid_count) / Decimal(len(resolved_loans))
    return ratio * Decimal("100")


def compute_score(db: Session, agent: Agent) -> Decimal:
    """
    Compute the agent's current behavioral score from raw signals.

    Reads task_success_rate / spend_regularity off the agent's existing
    AgentScore row if present (those two are maintained by whatever process
    records task outcomes — outside this service's scope), but the OVERALL
    score is always recomputed here from the weighted formula rather than
    trusted as a stored value. transaction history length and repayment
    history are always derived fresh from Transaction/Loan rows.
    """
    existing = db.query(AgentScore).filter(AgentScore.agent_id == agent.id).first()
    task_success_rate = existing.task_success_rate if existing else Decimal("0")
    spend_regularity = existing.spend_regularity if existing else Decimal("0")

    transaction_count = db.query(Transaction).filter(Transaction.agent_id == agent.id).count()
    history_component = _history_length_component(transaction_count)
    repayment_component = _repayment_history_component(db, agent.id)

    score = (
        Decimal(task_success_rate) * WEIGHT_TASK_SUCCESS
        + Decimal(spend_regularity) * WEIGHT_SPEND_REGULARITY
        + history_component * WEIGHT_HISTORY_LENGTH
        + repayment_component * WEIGHT_REPAYMENT_HISTORY
    )
    return score.quantize(Decimal("0.01"))


# ---------- Cross-agent reputation boost (cold-start only) ----------

def _sibling_reputation_boost(db: Session, agent: Agent) -> Decimal:
    """
    Only ever called for cold-start agents (see make_underwriting_decision).
    Looks at sibling agents under the same principal that already have an
    AgentScore, and grants a small boost off their average score.

    Deliberately capped at MAX_SIBLING_BOOST regardless of how good the
    siblings' scores are, and only ever additive on top of
    COLD_START_BASE_SCORE — a fleet of great agents can meaningfully help
    a new one, but can never single-handedly vouch it into a fully trusted
    score.
    """
    sibling_scores = (
        db.query(AgentScore.score)
        .join(Agent, Agent.id == AgentScore.agent_id)
        .filter(
            Agent.principal_id == agent.principal_id,
            Agent.id != agent.id,
            Agent.vouching_enabled.is_(True),
        )
        .all()
    )
    if not sibling_scores:
        return Decimal("0")

    scores = [Decimal(row[0]) for row in sibling_scores]
    avg_sibling_score = sum(scores) / Decimal(len(scores))

    # Boost scales with how good the siblings are, capped at MAX_SIBLING_BOOST.
    # e.g. siblings averaging 100 -> full boost; siblings averaging 50 -> half.
    boost = (avg_sibling_score / Decimal("100")) * MAX_SIBLING_BOOST
    return min(boost, MAX_SIBLING_BOOST).quantize(Decimal("0.01"))


# ---------- Main decision entrypoint ----------

def make_underwriting_decision(db: Session, agent: Agent, lender: Lender) -> UnderwritingDecision:
    """
    Produce the approve / starter-limit / deny decision for a loan request
    from `agent` against `lender`'s policy.

    Cold-start path (no AgentScore row exists yet):
    - score = COLD_START_BASE_SCORE + capped sibling reputation boost
    - never fully "approved" against policy.min_score_required — cold-start
      agents always get routed to the flat starter limit, never a
      policy-scaled limit, regardless of how favorable the sibling boost is.
      This keeps the "flat, conservative, capped" cold-start story intact
      even when reputation sharing is in play.

    Warm path (AgentScore row exists):
    - score = compute_score(db, agent)
    - approved if score >= lender.min_score_required, limit = min policy
      max_exposure_per_agent (category/exposure-amount fitting is handled
      by policy_engine.py / the router, not here)
    - denied otherwise, limit = 0
    """
    existing_score_row = db.query(AgentScore).filter(AgentScore.agent_id == agent.id).first()
    is_cold_start = existing_score_row is None

    if is_cold_start:
        sibling_boost = _sibling_reputation_boost(db, agent)
        score = COLD_START_BASE_SCORE + sibling_boost

        explanation = (
            f"agent has no prior score history (cold start) -> "
            f"starter limit of {COLD_START_LIMIT} applied"
        )
        if sibling_boost > 0:
            explanation += (
                f"; base score {COLD_START_BASE_SCORE} boosted by {sibling_boost} "
                f"from sibling agents under the same principal"
            )

        return UnderwritingDecision(
            score_at_decision=score,
            policy_min_score=Decimal(lender.min_score_required),
            policy_max_exposure=Decimal(lender.max_exposure_per_agent),
            is_cold_start=True,
            sibling_boost_applied=sibling_boost,
            approved=True,
            is_starter_limit=True,
            approved_limit=COLD_START_LIMIT,
            explanation=explanation,
        )

    score = compute_score(db, agent)
    min_score = Decimal(lender.min_score_required)
    max_exposure = Decimal(lender.max_exposure_per_agent)
    threshold_cleared = score >= min_score

    if threshold_cleared:
        explanation = (
            f"score {score} clears policy minimum {min_score} -> "
            f"approved up to {max_exposure}"
        )
    else:
        explanation = f"score {score} below policy minimum {min_score} -> denied"

    return UnderwritingDecision(
        score_at_decision=score,
        policy_min_score=min_score,
        policy_max_exposure=max_exposure,
        is_cold_start=False,
        sibling_boost_applied=Decimal("0"),
        approved=threshold_cleared,
        is_starter_limit=False,
        approved_limit=max_exposure if threshold_cleared else Decimal("0"),
        explanation=explanation,
    )