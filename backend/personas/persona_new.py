"""
persona_new.py

Demo persona #2 (spec Section 10, item 2): brand-new agent, no history
-> requests loan -> gets a small conservative starter limit (cold-start
handling), NOT a flat rejection.

No history seeding at all here -- that's the entire point of this persona.
Straight signup -> agent -> mandate -> loan request, all through the real API.
"""

from personas.common import (
    banner, signup_principal, signup_lender, create_agent_with_mandate, request_loan, get,
)
from app.services.underwriting_service import COLD_START_LIMIT


def main():
    banner("PERSONA 2: Brand-new agent, no history (cold start)")

    principal_token, principal_id, private_key_b64 = signup_principal("Demo Principal (New)")
    lender_token, lender_id = signup_lender(
        "Demo Lender B",
        min_score=60.0,  # deliberately above COLD_START_BASE_SCORE (40) so a
                         # cold-start agent could never accidentally clear the
                         # bar the "warm" way -- it MUST go through the
                         # starter-limit path to get funded at all
        max_exposure=500.0,
        platform_cap=100000.0,
        categories=[],
    )

    agent_id = create_agent_with_mandate(
        principal_token, principal_id, private_key_b64,
        name="New-Agent-01",
    )

    print("\n  requesting loan for brand-new agent (no AgentScore row exists)...")
    loan = request_loan(
        agent_id, lender_id,
        principal_amount=200.0,  # deliberately more than COLD_START_LIMIT, to
                                 # show the approved limit is capped at the flat
                                 # starter amount regardless of what was requested
        approved_recipient="cloud-compute-vendor.example",
        task_category=None,
    )

    print(f"\n  RESULT: status={loan['status']}  limit={loan['credit_limit_at_issuance']}")
    print(f"  rationale: {loan['rationale']['explanation']}")
    assert loan["status"] == "approved", "expected cold-start agent to still be approved (starter limit)"
    assert float(loan["credit_limit_at_issuance"]) == float(COLD_START_LIMIT), (
        "expected flat COLD_START_LIMIT, not a policy-scaled limit"
    )

    score = get(f"/agents/{agent_id}/score", token=lender_token)
    print(f"  score endpoint: is_cold_start={score['is_cold_start']}  score={score['score']}")
    assert score["is_cold_start"] is True, "brand-new agent should show as cold-start"

    print(f"\n  PASS: new agent got flat starter limit ({COLD_START_LIMIT}), not rejected.")


if __name__ == "__main__":
    main()
