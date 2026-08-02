"""
persona_established.py

Demo persona #1 (spec Section 10, item 1): established agent, clean track
record -> requests loan -> approved instantly with a higher limit (NOT the
cold-start starter limit).

There is deliberately no API endpoint to write AgentScore or historical
Loan/Transaction rows directly -- those only ever come from real usage
(see underwriting_service.py's own docstring: "it does not just read a
precomputed value"). So this is the one persona that drops to a direct
DB session to seed a believable track record BEFORE the agent's first
real loan request, simulating "this agent has been operating for a
while already."

Everything else (signup, agent creation, mandate signing, loan request)
goes through the real HTTP API, same as the other two personas.
"""

from decimal import Decimal

from app.database import SessionLocal
from app.models import AgentScore, Transaction, TransactionType, Loan, LoanStatus

from personas.common import (
    banner, signup_principal, signup_lender, create_agent_with_mandate, request_loan, get,
)


def seed_established_history(agent_id: int, lender_id: int) -> None:
    """
    Direct DB seed (no API for this, by design). Gives the agent:
    - A prior AgentScore row so it's NOT cold-start
    - Enough Transaction rows to max out the history-length component
    - A resolved, fully REPAID prior loan so repayment-history component is strong
    """
    db = SessionLocal()
    try:
        db.add(AgentScore(
            agent_id=agent_id,
            score=Decimal("0"),  # recomputed fresh by underwriting_service anyway
            task_success_rate=Decimal("95.00"),
            spend_regularity=Decimal("90.00"),
        ))

        # Prior resolved loan, fully repaid -- feeds repayment_history_component.
        prior_loan = Loan(
            agent_id=agent_id,
            lender_id=lender_id,
            principal_amount=Decimal("100.00"),
            interest_amount=Decimal("0"),
            outstanding_balance=Decimal("0"),
            approved_recipient="cloud-compute-vendor.example",
            score_at_decision=Decimal("80.00"),
            policy_min_score_at_decision=Decimal("60.00"),
            status=LoanStatus.REPAID,
            credit_limit_at_issuance=Decimal("100.00"),
        )
        db.add(prior_loan)
        db.flush()

        # 20 transactions -> maxes out HISTORY_LENGTH_FULL_CREDIT_COUNT.
        for i in range(20):
            db.add(Transaction(
                agent_id=agent_id,
                loan_id=prior_loan.id if i % 4 == 0 else None,
                type=TransactionType.TASK_PAYOUT,
                amount=Decimal("10.00"),
            ))

        db.commit()
        print(f"  seeded: AgentScore row + 1 REPAID loan + 20 transactions for agent {agent_id}")
    finally:
        db.close()


def main():
    banner("PERSONA 1: Established agent, clean track record")

    principal_token, principal_id, private_key_b64 = signup_principal("Demo Principal (Established)")
    lender_token, lender_id = signup_lender(
        "Demo Lender A",
        min_score=60.0,
        max_exposure=500.0,
        platform_cap=100000.0,
        categories=[],  # empty = no restriction, per policy_engine.py
    )

    agent_id = create_agent_with_mandate(
        principal_token, principal_id, private_key_b64,
        name="Established-Agent-01",
    )

    seed_established_history(agent_id, lender_id)

    print("\n  requesting loan for established agent...")
    loan = request_loan(
        agent_id, lender_id,
        principal_amount=200.0,
        approved_recipient="cloud-compute-vendor.example",
        task_category=None,
    )

    print(f"\n  RESULT: status={loan['status']}  limit={loan['credit_limit_at_issuance']}")
    print(f"  rationale: {loan['rationale']['explanation']}")
    assert loan["status"] == "approved", "expected established agent to be approved (not denied)"
    assert not loan["rationale"].get("threshold_cleared") is False, "expected threshold cleared"

    score = get(f"/agents/{agent_id}/score", token=lender_token)
    print(f"  score endpoint: is_cold_start={score['is_cold_start']}  score={score['score']}")
    assert score["is_cold_start"] is False, "established agent should NOT show as cold-start"

    print("\n  PASS: established agent approved above starter-limit, not flagged cold-start.")


if __name__ == "__main__":
    main()
