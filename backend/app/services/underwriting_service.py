"""
underwriting_service.py

Owns Section 6 of the spec (scoring without credit history) and produces
the approve / starter-limit / deny decision for a loan request, checked
against the requesting lender's policy (Lender.min_score_required,
max_exposure_per_agent, allowed_agent_categories).

Scope boundaries (deliberate):
- This file OWNS the score formula. It computes the agent's score from
  task success rate, spending regularity, and repayment history -- all
  derived live from TaskRecord (CSV-imported task history) and Loan rows,
  never trusted as a pre-stored value.
- Transaction/task-record COUNT is not a weighted score component -- it
  is a confidence multiplier applied after the weighted raw score, pulling
  thin-history agents toward COLD_START_BASE_SCORE. This avoids a new
  agent with 2 lucky data points scoring as if it were proven.
- Cold-start is defined as "agent has zero TaskRecord rows" (not an
  AgentScore-row-exists check anymore -- AgentScore is now a cached
  result of this formula, not an independent input to it). Cold-start
  agents get a flat conservative starter limit, not a percentage of the
  lender's cap -- flat avoids edge cases where a lender's
  max_exposure_per_agent is huge.
- This service returns RAW decision data (score, thresholds, approved
  bool, limit, explanation string) -- it does NOT construct the
  LoanDecisionRationale Pydantic schema itself. The router assembles the
  schema from this output. Keeps this module DB/schema-agnostic and
  independently testable without importing app.schemas.
- Anomaly detection (Section 9 -- deviation from an agent's OWN ongoing
  baseline behavior) does NOT live here. That is ongoing monitoring, not
  a one-time loan-request decision, and belongs entirely in
  monitoring_service.py.

Cross-agent reputation sharing (cold-start innovation):
- Real principals run fleets of agents, not one agent in isolation.
- When an agent is cold-start, instead of underwriting it in a vacuum,
  we look at sibling agents under the same principal_id that DO have an
  AgentScore, and grant a small, capped trust boost off their average.
- This boost is capped low and only ever applied on top of the flat
  starter limit / cold-start score baseline -- it can raise a cold-start
  agent's effective score/limit modestly, it can never substitute for a
  real track record, and it never applies once the agent has its own
  TaskRecord-derived history (that's a one-time cold-start allowance,
  not a permanent subsidy).
- Only siblings with Agent.vouching_enabled == True are considered. The
  principal opts an agent into the fleet-trust pool (a single boolean,
  not a per-pair consent graph) -- vouching never happens silently for
  an agent the principal hasn't enrolled.
"""

import statistics
from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Agent, AgentScore, Lender, Loan, LoanStatus, TaskRecord


# ---------- Tunable constants ----------

# Flat conservative limit for any agent with no task history yet.
# Flat (not a % of lender's cap) so a lender with a huge max_exposure_per_agent
# doesn't accidentally hand a brand-new, unproven agent a large loan.
COLD_START_LIMIT = Decimal("50.00")

# A nominal score assigned to cold-start agents purely so they have SOME
# number to compare against policy.min_score_required. Also doubles as the
# baseline the confidence multiplier pulls thin-history agents toward.
COLD_START_BASE_SCORE = Decimal("40.00")

# Cross-agent reputation boost: capped so a strong sibling can meaningfully
# help but never fully vouch a brand-new agent into a high score.
MAX_SIBLING_BOOST = Decimal("15.00")

# Score formula weights (raw score, before confidence adjustment / gate).
# Repayment history dominates (the signal a lender actually cares about
# most), task success is secondary, spend regularity is a smaller
# stabilizing factor.
WEIGHT_TASK_SUCCESS = Decimal("0.35")
WEIGHT_SPEND_REGULARITY = Decimal("0.15")
WEIGHT_REPAYMENT_HISTORY = Decimal("0.50")

# Confidence multiplier: task-record count considered "full trust" in the
# raw score. Fewer records -> raw score gets pulled toward
# COLD_START_BASE_SCORE proportionally; 20+ records -> full trust, no pull.
CONFIDENCE_FULL_TRUST_COUNT = 20

# Spend regularity needs at least this many records to be judged with any
# confidence -- below this, neutral 50 rather than a noisy read on 1-4 points.
SPEND_REGULARITY_MIN_RECORDS = 5

# Spend regularity sub-weights: timing consistency matters more than amount
# consistency for "is this agent behaving predictably."
SPEND_REGULARITY_AMOUNT_WEIGHT = Decimal("0.40")
SPEND_REGULARITY_TIMING_WEIGHT = Decimal("0.60")

# Repayment hard gate: below this ratio, score is capped regardless of how
# good the other components are -- prevents "performs tasks well but
# consistently defaults" from ever reading as trustworthy.
REPAYMENT_GATE_THRESHOLD = Decimal("0.50")
REPAYMENT_GATE_CAP = Decimal("40.00")


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


# ---------- Component 1: Task success rate ----------

def _task_success_component(task_records: list[TaskRecord]) -> Decimal:
    """
    Completed (success=True) task -> success, anything else -> failure.
    No records -> neutral 50, not 0 -- absence of history isn't evidence
    of bad performance.
    """
    if not task_records:
        return Decimal("50")

    success_count = sum(1 for r in task_records if r.success)
    ratio = Decimal(success_count) / Decimal(len(task_records))
    return (ratio * Decimal("100")).quantize(Decimal("0.01"))


# ---------- Component 2: Spending regularity ----------

def _median_absolute_deviation(values: list[Decimal]) -> Decimal:
    """MAD: median of absolute deviations from the median. Less sensitive
    to a single outlier transaction than mean/stddev would be."""
    floats = [float(v) for v in values]
    med = statistics.median(floats)
    deviations = [abs(v - med) for v in floats]
    mad = statistics.median(deviations)
    return Decimal(str(mad))


def _consistency_score(values: list[Decimal]) -> Decimal:
    """
    Converts a list of numeric values into a 0-100 consistency score using
    median + MAD. Coefficient of variation (MAD / median) is mapped so
    low variation -> high score, high variation -> low score.
    """
    med = statistics.median([float(v) for v in values])
    if med == 0:
        # All-zero values (e.g. all amounts 0) -- degenerate case, treat
        # as maximally consistent rather than dividing by zero.
        return Decimal("100")

    mad = _median_absolute_deviation(values)
    relative_variation = mad / Decimal(str(abs(med)))

    # relative_variation of 0 -> 100 score; scales down to 0 as variation
    # grows, floored at 0. Divisor of 1.0 means "variation equal to the
    # median itself" already drives the score to 0 -- reasonable for a
    # 30hr calibration without a real distribution to tune against.
    score = (Decimal("1") - min(relative_variation, Decimal("1"))) * Decimal("100")
    return score.quantize(Decimal("0.01"))


def _spend_regularity_component(task_records: list[TaskRecord]) -> Decimal:
    """
    "Is this agent's spending behavior consistent?" Combines amount
    consistency (40%) and timing consistency (60%), each scored via
    median+MAD. Fewer than SPEND_REGULARITY_MIN_RECORDS -> neutral 50,
    not enough history to judge regularity with any confidence.
    """
    if len(task_records) < SPEND_REGULARITY_MIN_RECORDS:
        return Decimal("50")

    amounts = [r.amount for r in task_records]
    amount_score = _consistency_score(amounts)

    sorted_records = sorted(task_records, key=lambda r: r.completed_at)
    intervals = [
        Decimal(str((sorted_records[i].completed_at - sorted_records[i - 1].completed_at).total_seconds()))
        for i in range(1, len(sorted_records))
    ]
    timing_score = _consistency_score(intervals) if intervals else Decimal("50")

    combined = (
        amount_score * SPEND_REGULARITY_AMOUNT_WEIGHT
        + timing_score * SPEND_REGULARITY_TIMING_WEIGHT
    )
    return combined.quantize(Decimal("0.01"))


# ---------- Component 3: Repayment history ----------

def _repayment_history_component(db: Session, agent_id: int) -> tuple[Decimal, Decimal | None]:
    """
    Prior repayment history signal: fraction of the agent's past loans that
    reached REPAID status (as opposed to DEFAULTED). Loans still PENDING/
    APPROVED (i.e. currently active/open) are excluded -- they haven't
    resolved yet and shouldn't count as either a positive or negative
    signal.

    Returns (score_0_to_100, raw_ratio_or_None). raw_ratio is None when
    there's no resolved history yet -- the hard gate below only applies
    when we actually have a resolved ratio to gate on.
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
        return Decimal("50"), None

    repaid_count = sum(1 for loan in resolved_loans if loan.status == LoanStatus.REPAID)
    ratio = Decimal(repaid_count) / Decimal(len(resolved_loans))
    return (ratio * Decimal("100")).quantize(Decimal("0.01")), ratio


# ---------- Main score formula ----------

def compute_score(db: Session, agent: Agent) -> Decimal:
    """
    Compute the agent's current behavioral score.

    1. Raw score = weighted sum of task success, spend regularity,
       repayment history -- all derived live from TaskRecord/Loan rows.
    2. Confidence multiplier (based on TaskRecord count) pulls the raw
       score toward COLD_START_BASE_SCORE when history is thin, converging
       to the raw score at CONFIDENCE_FULL_TRUST_COUNT+ records.
    3. Repayment hard gate: if resolved repayment ratio < 50%, score is
       capped at REPAYMENT_GATE_CAP regardless of how good the other
       components are.
    """
    task_records = db.query(TaskRecord).filter(TaskRecord.agent_id == agent.id).all()

    task_success = _task_success_component(task_records)
    spend_regularity = _spend_regularity_component(task_records)
    repayment_score, repayment_ratio = _repayment_history_component(db, agent.id)

    raw_score = (
        task_success * WEIGHT_TASK_SUCCESS
        + spend_regularity * WEIGHT_SPEND_REGULARITY
        + repayment_score * WEIGHT_REPAYMENT_HISTORY
    )

    confidence = min(Decimal(len(task_records)) / Decimal(CONFIDENCE_FULL_TRUST_COUNT), Decimal("1"))
    scaled_score = confidence * raw_score + (Decimal("1") - confidence) * COLD_START_BASE_SCORE

    if repayment_ratio is not None and repayment_ratio < REPAYMENT_GATE_THRESHOLD:
        scaled_score = min(scaled_score, REPAYMENT_GATE_CAP)

    return scaled_score.quantize(Decimal("0.01"))


def recompute_and_store_score(db: Session, agent: Agent) -> AgentScore:
    """
    Recomputes the agent's score from current TaskRecord/Loan data and
    upserts the AgentScore row. Called after a CSV task-history upload
    (agents.py: POST /{agent_id}/upload-history) so the next loan request
    reads a fresh, real score instead of a stale/absent one.

    AgentScore.task_success_rate / spend_regularity are stored as a cache
    of the components that fed the score, for display purposes (Lender/
    Agent Detail score breakdown) -- compute_score() above never reads
    them back as inputs, it always recomputes from TaskRecord/Loan fresh.
    """
    task_records = db.query(TaskRecord).filter(TaskRecord.agent_id == agent.id).all()
    task_success = _task_success_component(task_records)
    spend_regularity = _spend_regularity_component(task_records)
    score = compute_score(db, agent)

    existing = db.query(AgentScore).filter(AgentScore.agent_id == agent.id).first()
    if existing:
        existing.score = score
        existing.task_success_rate = task_success
        existing.spend_regularity = spend_regularity
        row = existing
    else:
        row = AgentScore(
            agent_id=agent.id,
            score=score,
            task_success_rate=task_success,
            spend_regularity=spend_regularity,
        )
        db.add(row)

    db.flush()
    return row


# ---------- Cross-agent reputation boost (cold-start only) ----------

def _sibling_reputation_boost(db: Session, agent: Agent) -> Decimal:
    """
    Only ever called for cold-start agents (see make_underwriting_decision).
    Looks at sibling agents under the same principal that already have an
    AgentScore, and grants a small boost off their average score.

    Deliberately capped at MAX_SIBLING_BOOST regardless of how good the
    siblings' scores are, and only ever additive on top of
    COLD_START_BASE_SCORE -- a fleet of great agents can meaningfully help
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

    Cold-start path (agent has zero TaskRecord rows):
    - score = COLD_START_BASE_SCORE + capped sibling reputation boost
    - never fully "approved" against policy.min_score_required -- cold-start
      agents always get routed to the flat starter limit, never a
      policy-scaled limit, regardless of how favorable the sibling boost is.
      This keeps the "flat, conservative, capped" cold-start story intact
      even when reputation sharing is in play.

    Warm path (agent has at least one TaskRecord row):
    - score = compute_score(db, agent) -- confidence-scaled, gate-checked
    - approved if score >= lender.min_score_required, limit = min policy
      max_exposure_per_agent (category/exposure-amount fitting is handled
      by policy_engine.py / the router, not here)
    - denied otherwise, limit = 0
    """
    task_record_count = db.query(TaskRecord).filter(TaskRecord.agent_id == agent.id).count()
    is_cold_start = task_record_count == 0

    if is_cold_start:
        sibling_boost = _sibling_reputation_boost(db, agent)
        score = COLD_START_BASE_SCORE + sibling_boost

        explanation = (
            f"agent has no task history (cold start) -> "
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