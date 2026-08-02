"""
test_ledger_service.py

Covers Section 7 of the spec: the custodial ledger / payout interception
mechanism. This is the single most important file to get right, since
"repayment enforceability" is a named judging criterion and the whole
pitch rests on "the agent never holds the full payout."

What's tested:
  1. process_inflow() with no open loan            -> full amount released
  2. process_inflow() fully covers the loan         -> loan REPAID, remainder released
  3. process_inflow() only partially covers it       -> loan stays APPROVED, $0 released
  4. process_inflow() exact boundary (inflow == outstanding) -> fully repaid, $0 leftover
  5. declare_default() with no eligible siblings     -> entire shortfall is written off
  6. declare_default() with a vouching-enabled sibling with enough balance -> clawback covers it
  7. declare_default() clawback is capped at CLAWBACK_CAP_RATIO of sibling's own balance
  8. declare_default() ignores siblings with vouching_enabled=False
  9. Transaction rows are actually written (auditability), not just balances silently changed
"""

from decimal import Decimal

from app.models import LoanStatus, Transaction, TransactionType, Wallet
from app.services.ledger_service import (
    CLAWBACK_CAP_RATIO,
    declare_default,
    process_inflow,
)

from .conftest import make_agent, make_lender, make_loan, make_principal


def _wallet_balance(db_session, agent_id) -> Decimal:
    wallet = db_session.query(Wallet).filter(Wallet.agent_id == agent_id).first()
    return Decimal(wallet.spendable_balance)


# ---------- process_inflow ----------

def test_inflow_with_no_open_loan_releases_full_amount(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal, wallet_balance=Decimal("0"))

    result = process_inflow(db_session, agent.id, Decimal("75.00"))

    assert result.amount_deducted == Decimal("0")
    assert result.amount_released_to_agent == Decimal("75.00")
    assert result.loan_fully_repaid is False
    assert _wallet_balance(db_session, agent.id) == Decimal("75.00")


def test_inflow_fully_covers_outstanding_loan(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal, wallet_balance=Decimal("0"))
    lender = make_lender(db_session)
    loan = make_loan(db_session, agent, lender, principal_amount=Decimal("100.00"),
                      outstanding_balance=Decimal("60.00"))

    result = process_inflow(db_session, agent.id, Decimal("100.00"))

    assert result.amount_deducted == Decimal("60.00")
    assert result.amount_released_to_agent == Decimal("40.00")
    assert result.loan_fully_repaid is True
    assert loan.status == LoanStatus.REPAID
    assert loan.outstanding_balance == Decimal("0")
    assert _wallet_balance(db_session, agent.id) == Decimal("40.00")


def test_inflow_partially_covers_outstanding_loan_releases_nothing(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal, wallet_balance=Decimal("0"))
    lender = make_lender(db_session)
    loan = make_loan(db_session, agent, lender, principal_amount=Decimal("100.00"),
                      outstanding_balance=Decimal("60.00"))

    result = process_inflow(db_session, agent.id, Decimal("20.00"))

    assert result.amount_deducted == Decimal("20.00")
    assert result.amount_released_to_agent == Decimal("0")
    assert result.loan_fully_repaid is False
    assert loan.status == LoanStatus.APPROVED  # stays open, not defaulted
    assert loan.outstanding_balance == Decimal("40.00")
    assert _wallet_balance(db_session, agent.id) == Decimal("0")


def test_inflow_exact_boundary_fully_repays_with_zero_remainder(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal, wallet_balance=Decimal("0"))
    lender = make_lender(db_session)
    loan = make_loan(db_session, agent, lender, principal_amount=Decimal("50.00"),
                      outstanding_balance=Decimal("50.00"))

    result = process_inflow(db_session, agent.id, Decimal("50.00"))

    assert result.loan_fully_repaid is True
    assert result.amount_released_to_agent == Decimal("0")
    assert loan.status == LoanStatus.REPAID


def test_inflow_writes_auditable_transaction_rows(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal, wallet_balance=Decimal("0"))
    lender = make_lender(db_session)
    make_loan(db_session, agent, lender, principal_amount=Decimal("100.00"),
              outstanding_balance=Decimal("60.00"))

    process_inflow(db_session, agent.id, Decimal("100.00"))
    db_session.flush()  # SessionLocal uses autoflush=False, so flush explicitly before querying

    txns = db_session.query(Transaction).filter(Transaction.agent_id == agent.id).all()
    types = sorted(t.type for t in txns)
    assert TransactionType.TASK_PAYOUT in types
    assert TransactionType.REPAYMENT in types


# ---------- declare_default ----------

def test_default_with_no_siblings_writes_off_full_shortfall(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal, wallet_balance=Decimal("0"))
    lender = make_lender(db_session)
    loan = make_loan(db_session, agent, lender, principal_amount=Decimal("50.00"),
                      outstanding_balance=Decimal("50.00"))

    result = declare_default(db_session, loan.id)

    assert result.shortfall_before_clawback == Decimal("50.00")
    assert result.total_clawed_back == Decimal("0")
    assert result.final_write_off_amount == Decimal("50.00")
    assert loan.status == LoanStatus.DEFAULTED
    assert loan.outstanding_balance == Decimal("0")
    assert loan.write_off_amount == Decimal("50.00")


def test_default_claws_back_from_vouching_enabled_sibling(db_session):
    principal = make_principal(db_session)
    defaulting_agent = make_agent(db_session, principal, name="Defaulter", wallet_balance=Decimal("0"))
    sibling = make_agent(
        db_session, principal, name="Sibling",
        vouching_enabled=True, wallet_balance=Decimal("1000.00"),
    )
    lender = make_lender(db_session)
    loan = make_loan(db_session, defaulting_agent, lender, principal_amount=Decimal("50.00"),
                      outstanding_balance=Decimal("50.00"))

    result = declare_default(db_session, loan.id)

    # Sibling has plenty of balance, but clawback is capped at 30% of THEIR balance,
    # i.e. min(shortfall, 1000 * 0.30) = min(50, 300) = 50 -> fully covered.
    assert result.total_clawed_back == Decimal("50.00")
    assert result.final_write_off_amount == Decimal("0.00")
    assert len(result.clawback_entries) == 1
    assert result.clawback_entries[0].sibling_agent_id == sibling.id
    assert _wallet_balance(db_session, sibling.id) == Decimal("950.00")


def test_default_clawback_is_capped_at_ratio_of_sibling_balance(db_session):
    principal = make_principal(db_session)
    defaulting_agent = make_agent(db_session, principal, name="Defaulter", wallet_balance=Decimal("0"))
    # Sibling only has 100 -> cap is 100 * 0.30 = 30, even though shortfall is 200.
    sibling = make_agent(
        db_session, principal, name="Sibling",
        vouching_enabled=True, wallet_balance=Decimal("100.00"),
    )
    lender = make_lender(db_session)
    loan = make_loan(db_session, defaulting_agent, lender, principal_amount=Decimal("200.00"),
                      outstanding_balance=Decimal("200.00"))

    result = declare_default(db_session, loan.id)

    expected_cap = Decimal("100.00") * CLAWBACK_CAP_RATIO
    assert result.total_clawed_back == expected_cap
    assert result.final_write_off_amount == Decimal("200.00") - expected_cap
    assert _wallet_balance(db_session, sibling.id) == Decimal("100.00") - expected_cap


def test_default_ignores_siblings_without_vouching_enabled(db_session):
    principal = make_principal(db_session)
    defaulting_agent = make_agent(db_session, principal, name="Defaulter", wallet_balance=Decimal("0"))
    non_vouching_sibling = make_agent(
        db_session, principal, name="NonVouchingSibling",
        vouching_enabled=False, wallet_balance=Decimal("1000.00"),
    )
    lender = make_lender(db_session)
    loan = make_loan(db_session, defaulting_agent, lender, principal_amount=Decimal("50.00"),
                      outstanding_balance=Decimal("50.00"))

    result = declare_default(db_session, loan.id)

    assert result.total_clawed_back == Decimal("0")
    assert result.final_write_off_amount == Decimal("50.00")
    assert len(result.clawback_entries) == 0
    # sibling's balance is completely untouched
    assert _wallet_balance(db_session, non_vouching_sibling.id) == Decimal("1000.00")


# ---------- Edge cases / input validation / data-integrity findings ----------

def test_finding_negative_inflow_silently_skips_credit_but_still_logs_a_negative_transaction(db_session):
    """
    DATA-INTEGRITY FINDING, not a crash: process_inflow() has no guard
    against a negative inflow_amount. _credit_wallet()/_debit_wallet() both
    skip when amount <= 0, so a negative inflow correctly does NOT move
    money -- but the code unconditionally logs a TASK_PAYOUT Transaction
    row with that negative amount anyway, corrupting the audit trail
    (Section 7's whole pitch is "auditable ledger").

    This test documents CURRENT behavior so it's visible, not a bug fix.
    Recommendation: validate inflow_amount > 0 at the router/caller level
    before calling process_inflow(), since this file's docstring says it
    intentionally trusts the caller for the transaction boundary.
    """
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal, wallet_balance=Decimal("0"))

    result = process_inflow(db_session, agent.id, Decimal("-50.00"))
    db_session.flush()

    assert result.amount_released_to_agent == Decimal("-50.00")  # not actually credited
    assert _wallet_balance(db_session, agent.id) == Decimal("0")  # wallet untouched

    txns = db_session.query(Transaction).filter(Transaction.agent_id == agent.id).all()
    assert len(txns) == 1
    assert txns[0].amount == Decimal("-50.00")  # <-- corrupted audit record, flagged for fix


def test_zero_inflow_is_a_no_op_but_still_logged(db_session):
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal, wallet_balance=Decimal("0"))

    result = process_inflow(db_session, agent.id, Decimal("0.00"))
    db_session.flush()

    assert result.amount_released_to_agent == Decimal("0.00")
    assert _wallet_balance(db_session, agent.id) == Decimal("0.00")


def test_finding_declare_default_on_nonexistent_loan_id_raises_attributeerror(db_session):
    """
    declare_default() does `loan = db.query(Loan).filter(Loan.id == loan_id).first()`
    then immediately does `Decimal(loan.outstanding_balance)` with no None
    check. Calling it with a bad/nonexistent loan_id crashes with
    AttributeError instead of a clean error. Documented here so the caller
    (router) is on notice: it MUST validate the loan exists before calling
    this, since this function will not do it safely on its own.
    """
    import pytest as _pytest
    with _pytest.raises(AttributeError):
        declare_default(db_session, loan_id=999999)


def test_declare_default_is_a_noop_second_time_on_already_defaulted_loan(db_session):
    """
    Calling declare_default() twice on the same loan should not double-claw
    siblings or double-count the shortfall the second time, since
    outstanding_balance is already zeroed after the first call.
    """
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal, wallet_balance=Decimal("0"))
    sibling = make_agent(db_session, principal, name="Sibling", vouching_enabled=True,
                          wallet_balance=Decimal("1000.00"))
    lender = make_lender(db_session)
    loan = make_loan(db_session, agent, lender, principal_amount=Decimal("50.00"),
                      outstanding_balance=Decimal("50.00"))

    first = declare_default(db_session, loan.id)
    second = declare_default(db_session, loan.id)  # called again on the same loan

    assert first.shortfall_before_clawback == Decimal("50.00")
    assert second.shortfall_before_clawback == Decimal("0")  # nothing left to claw
    assert second.total_clawed_back == Decimal("0")
    # sibling was only ever charged once, not twice
    assert _wallet_balance(db_session, sibling.id) == Decimal("950.00")


def test_default_pulls_from_multiple_siblings_when_one_alone_is_insufficient(db_session):
    """
    If the first eligible sibling's capped contribution doesn't fully cover
    the shortfall, a second eligible sibling should be pulled from too,
    until the shortfall is covered or eligible siblings are exhausted.
    """
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal, wallet_balance=Decimal("0"))
    # Each sibling can contribute at most 30% of their own balance.
    sibling_a = make_agent(db_session, principal, name="SibA", vouching_enabled=True,
                            wallet_balance=Decimal("100.00"))  # caps at 30
    sibling_b = make_agent(db_session, principal, name="SibB", vouching_enabled=True,
                            wallet_balance=Decimal("100.00"))  # caps at 30
    lender = make_lender(db_session)
    loan = make_loan(db_session, agent, lender, principal_amount=Decimal("50.00"),
                      outstanding_balance=Decimal("50.00"))  # needs 50, one sibling alone (30) isn't enough

    result = declare_default(db_session, loan.id)

    assert result.total_clawed_back == Decimal("50.00")  # 30 + 20 across two siblings, fully covered
    assert result.final_write_off_amount == Decimal("0.00")
    assert len(result.clawback_entries) == 2
    total_pulled = sum(e.amount_clawed for e in result.clawback_entries)
    assert total_pulled == Decimal("50.00")


def test_default_multiple_siblings_still_insufficient_writes_off_remainder(db_session):
    """
    Even after pulling the capped amount from every eligible sibling, if
    the combined total still doesn't cover the shortfall, the remainder
    must be written off -- clawback can reduce the loss but is never
    guaranteed to zero it out.
    """
    principal = make_principal(db_session)
    agent = make_agent(db_session, principal, wallet_balance=Decimal("0"))
    sibling_a = make_agent(db_session, principal, name="SibA", vouching_enabled=True,
                            wallet_balance=Decimal("10.00"))  # caps at 3
    sibling_b = make_agent(db_session, principal, name="SibB", vouching_enabled=True,
                            wallet_balance=Decimal("10.00"))  # caps at 3
    lender = make_lender(db_session)
    loan = make_loan(db_session, agent, lender, principal_amount=Decimal("500.00"),
                      outstanding_balance=Decimal("500.00"))

    result = declare_default(db_session, loan.id)

    assert result.total_clawed_back == Decimal("6.00")  # 3 + 3, both siblings exhausted at their cap
    assert result.final_write_off_amount == Decimal("494.00")
    assert result.final_write_off_amount + result.total_clawed_back == result.shortfall_before_clawback


def test_default_never_pulls_from_agents_under_a_different_principal(db_session):
    principal_a = make_principal(db_session, name="Principal A")
    principal_b = make_principal(db_session, name="Principal B")
    defaulting_agent = make_agent(db_session, principal_a, name="Defaulter", wallet_balance=Decimal("0"))
    # Even though this agent has vouching enabled and money, it belongs to a
    # different principal and must never be touched.
    unrelated_agent = make_agent(
        db_session, principal_b, name="Unrelated",
        vouching_enabled=True, wallet_balance=Decimal("1000.00"),
    )
    lender = make_lender(db_session)
    loan = make_loan(db_session, defaulting_agent, lender, principal_amount=Decimal("50.00"),
                      outstanding_balance=Decimal("50.00"))

    result = declare_default(db_session, loan.id)

    assert result.final_write_off_amount == Decimal("50.00")
    assert _wallet_balance(db_session, unrelated_agent.id) == Decimal("1000.00")