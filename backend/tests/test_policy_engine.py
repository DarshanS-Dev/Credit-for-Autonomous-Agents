"""
test_policy_engine.py

Covers the lender-wide policy layer on top of underwriting_service.py's
per-agent decision (Section 4: lenders configure a risk policy once, and
the system auto-approves/denies against it in real time).

What's tested:
  1. A denial from underwriting short-circuits policy checks entirely
  2. A category the lender excludes blocks the loan even with a qualifying score
  3. A missing/None requested_category is treated as allowed
  4. An empty allowed_agent_categories list means "no restriction", not "allow nothing"
  5. current_platform_exposure() only counts APPROVED (live/disbursed) loans,
     not PENDING/REPAID/DEFAULTED
  6. A loan that would push total exposure past the lender's platform cap is denied
  7. A loan that fits within the cap is approved at the full underwriting limit
"""

from decimal import Decimal

from app.models import LoanStatus
from app.services.policy_engine import current_platform_exposure, evaluate_loan_request
from app.services.underwriting_service import UnderwritingDecision

from .conftest import make_agent, make_lender, make_loan, make_principal


def _approved_decision(limit=Decimal("100.00")):
    return UnderwritingDecision(
        score_at_decision=Decimal("80.00"),
        policy_min_score=Decimal("50.00"),
        policy_max_exposure=limit,
        is_cold_start=False,
        sibling_boost_applied=Decimal("0"),
        approved=True,
        is_starter_limit=False,
        approved_limit=limit,
        explanation="test fixture: approved",
    )


def _denied_decision():
    return UnderwritingDecision(
        score_at_decision=Decimal("10.00"),
        policy_min_score=Decimal("50.00"),
        policy_max_exposure=Decimal("100.00"),
        is_cold_start=False,
        sibling_boost_applied=Decimal("0"),
        approved=False,
        is_starter_limit=False,
        approved_limit=Decimal("0"),
        explanation="test fixture: denied",
    )


# ---------- Underwriting denial short-circuits ----------

def test_underwriting_denial_short_circuits_policy_checks(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    lender = make_lender(db_session)

    decision = evaluate_loan_request(db_session, lender, _denied_decision())

    assert decision.final_approved is False
    assert decision.final_limit == Decimal("0")


# ---------- Category fit ----------

def test_disallowed_category_blocks_loan_despite_qualifying_score(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    lender = make_lender(db_session, allowed_agent_categories=["data-labeling"])

    decision = evaluate_loan_request(
        db_session, lender, _approved_decision(), requested_category="crypto-trading"
    )

    assert decision.category_allowed is False
    assert decision.final_approved is False


def test_allowed_category_passes(db_session):
    lender = make_lender(db_session, allowed_agent_categories=["data-labeling"])

    decision = evaluate_loan_request(
        db_session, lender, _approved_decision(), requested_category="data-labeling"
    )

    assert decision.category_allowed is True
    assert decision.final_approved is True


def test_missing_category_is_treated_as_allowed(db_session):
    lender = make_lender(db_session, allowed_agent_categories=["data-labeling"])

    decision = evaluate_loan_request(db_session, lender, _approved_decision(), requested_category=None)

    assert decision.category_allowed is True
    assert decision.final_approved is True


def test_empty_allowed_categories_means_no_restriction(db_session):
    lender = make_lender(db_session, allowed_agent_categories=[])

    decision = evaluate_loan_request(
        db_session, lender, _approved_decision(), requested_category="anything-at-all"
    )

    assert decision.category_allowed is True
    assert decision.final_approved is True


# ---------- Platform exposure cap ----------

def test_current_platform_exposure_only_counts_approved_loans(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    lender = make_lender(db_session)

    make_loan(db_session, agent, lender, principal_amount=Decimal("50"),
              outstanding_balance=Decimal("50"), status=LoanStatus.APPROVED)
    make_loan(db_session, agent, lender, principal_amount=Decimal("999"),
              outstanding_balance=Decimal("999"), status=LoanStatus.PENDING)
    make_loan(db_session, agent, lender, principal_amount=Decimal("999"),
              outstanding_balance=Decimal("0"), status=LoanStatus.REPAID)
    make_loan(db_session, agent, lender, principal_amount=Decimal("999"),
              outstanding_balance=Decimal("0"), status=LoanStatus.DEFAULTED)

    exposure = current_platform_exposure(db_session, lender.id)

    assert exposure == Decimal("50")


def test_loan_denied_when_it_would_exceed_platform_cap(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    lender = make_lender(db_session, total_platform_exposure_cap=Decimal("100.00"))

    make_loan(db_session, agent, lender, principal_amount=Decimal("80"),
              outstanding_balance=Decimal("80"), status=LoanStatus.APPROVED)

    # existing exposure (80) + new loan (30) = 110 > cap of 100
    decision = evaluate_loan_request(db_session, lender, _approved_decision(limit=Decimal("30")))

    assert decision.would_exceed_platform_cap is True
    assert decision.final_approved is False
    assert decision.final_limit == Decimal("0")


def test_loan_approved_when_it_fits_within_platform_cap(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    lender = make_lender(db_session, total_platform_exposure_cap=Decimal("100.00"))

    make_loan(db_session, agent, lender, principal_amount=Decimal("50"),
              outstanding_balance=Decimal("50"), status=LoanStatus.APPROVED)

    # existing exposure (50) + new loan (30) = 80 <= cap of 100
    decision = evaluate_loan_request(db_session, lender, _approved_decision(limit=Decimal("30")))

    assert decision.would_exceed_platform_cap is False
    assert decision.final_approved is True
    assert decision.final_limit == Decimal("30")


def test_loan_that_lands_exactly_on_the_cap_is_approved_not_denied(db_session):
    """
    The code checks `projected_exposure > cap` (strictly greater than), so
    landing EXACTLY on the cap must be approved, not denied.
    """
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    lender = make_lender(db_session, total_platform_exposure_cap=Decimal("100.00"))

    make_loan(db_session, agent, lender, principal_amount=Decimal("70"),
              outstanding_balance=Decimal("70"), status=LoanStatus.APPROVED)

    # existing exposure (70) + new loan (30) = exactly 100 == cap
    decision = evaluate_loan_request(db_session, lender, _approved_decision(limit=Decimal("30")))

    assert decision.would_exceed_platform_cap is False
    assert decision.final_approved is True


def test_loan_that_lands_one_cent_over_the_cap_is_denied(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal)
    lender = make_lender(db_session, total_platform_exposure_cap=Decimal("100.00"))

    make_loan(db_session, agent, lender, principal_amount=Decimal("70"),
              outstanding_balance=Decimal("70"), status=LoanStatus.APPROVED)

    decision = evaluate_loan_request(db_session, lender, _approved_decision(limit=Decimal("30.01")))

    assert decision.would_exceed_platform_cap is True
    assert decision.final_approved is False


def test_lender_with_zero_existing_exposure_and_zero_cap_denies_any_positive_loan(db_session):
    lender = make_lender(db_session, total_platform_exposure_cap=Decimal("0.00"))

    decision = evaluate_loan_request(db_session, lender, _approved_decision(limit=Decimal("0.01")))

    assert decision.final_approved is False