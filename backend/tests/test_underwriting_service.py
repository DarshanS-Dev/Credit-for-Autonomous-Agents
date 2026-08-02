"""
test_underwriting_service.py

Covers Section 6 of the spec: scoring without credit history, cold-start
handling, and the cross-agent reputation boost.

What's tested:
  1. compute_score() blends task_success_rate, spend_regularity, history
     length, and repayment history with the documented weights
  2. An agent with no resolved loans gets a neutral (50) repayment component,
     not zero -- "no data yet" != "bad at repaying"
  3. Cold-start agent (no AgentScore row) always gets the flat starter limit,
     never the policy-scaled limit -- even with a large sibling boost
  4. Cold-start sibling boost is capped at MAX_SIBLING_BOOST regardless of
     how high the siblings' scores are
  5. Cold-start sibling boost ignores siblings with vouching_enabled=False
  6. Warm-path agent (has AgentScore) is approved/denied purely against
     lender.min_score_required, with the full policy limit if approved
"""

from decimal import Decimal

from app.models import LoanStatus, Transaction, TransactionType
from app.services.underwriting_service import (
    COLD_START_LIMIT,
    MAX_SIBLING_BOOST,
    compute_score,
    make_underwriting_decision,
)

from .conftest import make_agent, make_agent_score, make_lender, make_loan, make_principal


# ---------- compute_score ----------

def test_compute_score_with_no_history_uses_neutral_repayment_component(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    make_agent_score(db_session, agent, task_success_rate=Decimal("0"), spend_regularity=Decimal("0"))

    score = compute_score(db_session, agent)

    # No transactions -> history component 0. No resolved loans -> repayment
    # component is the neutral midpoint (50), not 0.
    # score = 0*0.35 + 0*0.20 + 0*0.15 + 50*0.30 = 15.00
    assert score == Decimal("15.00")


def test_compute_score_full_marks_when_everything_maxed(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    make_agent_score(db_session, agent, task_success_rate=Decimal("100"), spend_regularity=Decimal("100"))

    # 20 transactions -> full marks on history-length component
    for _ in range(20):
        db_session.add(Transaction(agent_id=agent.id, type=TransactionType.TASK_PAYOUT, amount=Decimal("1.00")))
    db_session.flush()

    # One resolved, repaid loan -> full marks on repayment component
    lender = make_lender(db_session)
    make_loan(db_session, agent, lender, principal_amount=Decimal("10"),
              outstanding_balance=Decimal("0"), status=LoanStatus.REPAID)

    score = compute_score(db_session, agent)

    # 100*.35 + 100*.20 + 100*.15 + 100*.30 = 100.00
    assert score == Decimal("100.00")


def test_compute_score_recomputes_rather_than_trusting_stored_value(db_session):
    """
    Even if an AgentScore row has a stale `.score` value sitting in it, the
    function must always recompute overall score from raw signals -- never
    just return the stored `.score` column.
    """
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    # Stored score is deliberately wrong/stale (999) -- should be ignored.
    make_agent_score(db_session, agent, score=Decimal("999.00"),
                      task_success_rate=Decimal("0"), spend_regularity=Decimal("0"))

    score = compute_score(db_session, agent)

    assert score != Decimal("999.00")
    assert score == Decimal("15.00")


# ---------- Cold start ----------

def test_cold_start_agent_gets_flat_starter_limit(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)  # no AgentScore row -> cold start
    lender = make_lender(db_session, max_exposure_per_agent=Decimal("5000.00"),
                          min_score_required=Decimal("10.00"))

    decision = make_underwriting_decision(db_session, agent, lender)

    assert decision.is_cold_start is True
    assert decision.is_starter_limit is True
    assert decision.approved is True
    assert decision.approved_limit == COLD_START_LIMIT
    # Even though lender's max_exposure_per_agent is huge (5000), cold start
    # NEVER gets the policy-scaled limit -- only the flat conservative one.
    assert decision.approved_limit != lender.max_exposure_per_agent


def test_cold_start_sibling_boost_is_capped(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)  # cold start

    # Multiple vouching siblings all with a perfect score of 100.
    for i in range(3):
        sibling = make_agent(db_session, principal, name=f"Sibling{i}", vouching_enabled=True)
        make_agent_score(db_session, sibling, score=Decimal("100.00"))

    lender = make_lender(db_session)
    decision = make_underwriting_decision(db_session, agent, lender)

    assert decision.sibling_boost_applied == MAX_SIBLING_BOOST
    # Still routed to the flat starter limit, boost or no boost.
    assert decision.approved_limit == COLD_START_LIMIT


def test_cold_start_boost_ignores_non_vouching_siblings(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)  # cold start
    non_vouching_sibling = make_agent(db_session, principal, name="Sib", vouching_enabled=False)
    make_agent_score(db_session, non_vouching_sibling, score=Decimal("100.00"))

    lender = make_lender(db_session)
    decision = make_underwriting_decision(db_session, agent, lender)

    assert decision.sibling_boost_applied == Decimal("0")


def test_cold_start_with_no_siblings_gets_zero_boost(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    lender = make_lender(db_session)

    decision = make_underwriting_decision(db_session, agent, lender)

    assert decision.sibling_boost_applied == Decimal("0")
    assert decision.is_cold_start is True


# ---------- Warm path ----------

def test_warm_agent_above_threshold_is_approved_at_full_policy_limit(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    make_agent_score(db_session, agent, task_success_rate=Decimal("100"), spend_regularity=Decimal("100"))
    lender = make_lender(db_session, max_exposure_per_agent=Decimal("300.00"),
                          min_score_required=Decimal("10.00"))

    decision = make_underwriting_decision(db_session, agent, lender)

    assert decision.is_cold_start is False
    assert decision.approved is True
    assert decision.is_starter_limit is False
    assert decision.approved_limit == Decimal("300.00")


def test_warm_agent_below_threshold_is_denied(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    make_agent_score(db_session, agent, task_success_rate=Decimal("0"), spend_regularity=Decimal("0"))
    lender = make_lender(db_session, min_score_required=Decimal("90.00"))

    decision = make_underwriting_decision(db_session, agent, lender)

    assert decision.approved is False
    assert decision.approved_limit == Decimal("0")


# ---------- Boundary / edge cases ----------

def test_score_exactly_equal_to_min_required_is_approved_not_denied(db_session):
    """
    The comparison in the code is `score >= min_score`, so an agent whose
    score lands EXACTLY on the lender's threshold must be approved, not
    denied. This is the kind of off-by-one that's easy to get backwards.
    """
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    # task_success_rate=60, spend_regularity=60, no txns, no resolved loans
    # score = 60*.35 + 60*.20 + 0*.15 + 50*.30 = 21 + 12 + 0 + 15 = 48.00
    make_agent_score(db_session, agent, task_success_rate=Decimal("60"), spend_regularity=Decimal("60"))
    lender = make_lender(db_session, min_score_required=Decimal("48.00"))

    decision = make_underwriting_decision(db_session, agent, lender)

    assert decision.score_at_decision == Decimal("48.00")
    assert decision.approved is True  # >= not >


def test_score_one_cent_below_threshold_is_denied(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    make_agent_score(db_session, agent, task_success_rate=Decimal("60"), spend_regularity=Decimal("60"))
    lender = make_lender(db_session, min_score_required=Decimal("48.01"))

    decision = make_underwriting_decision(db_session, agent, lender)

    assert decision.approved is False


def test_history_length_component_scales_linearly_below_full_credit_count(db_session):
    """
    10 transactions (half of HISTORY_LENGTH_FULL_CREDIT_COUNT=20) should
    contribute half marks on that component, not zero and not full.
    """
    from app.models import Transaction, TransactionType

    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    make_agent_score(db_session, agent, task_success_rate=Decimal("0"), spend_regularity=Decimal("0"))
    for _ in range(10):
        db_session.add(Transaction(agent_id=agent.id, type=TransactionType.TASK_PAYOUT, amount=Decimal("1")))
    db_session.flush()

    score = compute_score(db_session, agent)

    # history component = (10/20)*100 = 50 -> contributes 50*0.15 = 7.50
    # repayment component (no resolved loans) = 50 -> contributes 50*0.30 = 15.00
    # total = 0 + 0 + 7.50 + 15.00 = 22.50
    assert score == Decimal("22.50")


def test_history_length_component_does_not_exceed_full_credit_past_the_threshold(db_session):
    """More than HISTORY_LENGTH_FULL_CREDIT_COUNT transactions must not give more than full marks."""
    from app.models import Transaction, TransactionType

    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    make_agent_score(db_session, agent, task_success_rate=Decimal("0"), spend_regularity=Decimal("0"))
    for _ in range(50):  # well past the 20-transaction full-credit threshold
        db_session.add(Transaction(agent_id=agent.id, type=TransactionType.TASK_PAYOUT, amount=Decimal("1")))
    db_session.flush()

    score = compute_score(db_session, agent)

    # history component capped at 100 -> 100*0.15 = 15.00; repayment neutral 50*0.30=15.00
    assert score == Decimal("30.00")


def test_repayment_history_component_reflects_mixed_repaid_and_defaulted_ratio(db_session):
    """3 repaid + 1 defaulted out of 4 resolved loans -> 75% repayment ratio."""
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    make_agent_score(db_session, agent, task_success_rate=Decimal("0"), spend_regularity=Decimal("0"))
    lender = make_lender(db_session)
    for _ in range(3):
        make_loan(db_session, agent, lender, principal_amount=Decimal("10"),
                  outstanding_balance=Decimal("0"), status=LoanStatus.REPAID)
    make_loan(db_session, agent, lender, principal_amount=Decimal("10"),
              outstanding_balance=Decimal("0"), status=LoanStatus.DEFAULTED)
    # a still-open loan must NOT count toward the ratio either way
    make_loan(db_session, agent, lender, principal_amount=Decimal("10"),
              outstanding_balance=Decimal("10"), status=LoanStatus.APPROVED)

    score = compute_score(db_session, agent)

    # repayment component = 75 -> 75*0.30 = 22.50; everything else 0
    assert score == Decimal("22.50")


def test_lender_with_zero_min_score_required_approves_any_warm_agent(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    make_agent_score(db_session, agent, task_success_rate=Decimal("0"), spend_regularity=Decimal("0"))
    lender = make_lender(db_session, min_score_required=Decimal("0.00"))

    decision = make_underwriting_decision(db_session, agent, lender)

    assert decision.approved is True