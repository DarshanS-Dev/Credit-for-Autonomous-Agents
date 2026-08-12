"""
persona_misbehaving.py

Demo persona #3 (spec Section 10, item 3 / Section 7's "must be
live-demoed" default scenario): agent takes a loan, then attempts an
unauthorized payment (wrong recipient) -> instant default + revoke fires
-> status flips to defaulted on screen -> bounded write-off is shown
explicitly.

Deliberately does a real partial repayment FIRST (before the misuse) so
the insurance pool actually has a nonzero balance to draw from when
default is declared -- otherwise the insurance_payout in the demo output
would always show as 0, which undersells the risk-sharing feature.

Sequence:
1. Signup + agent + mandate (same as the other two personas)
2. Request loan -> approved
3. Simulate a legitimate partial inflow -> partial repayment, skims into
   insurance pool, loan stays open with reduced outstanding balance
4. Attempt a spend to a WRONG recipient -> monitoring_service catches it,
   declares the loan defaulted (cross-agent clawback attempted first,
   then insurance pool draw, then bounded write-off), and revokes the
   agent's credential
5. Confirm the agent is now unusable: any further loan/repayment call
   against it 403s, and the lender-facing view shows status=defaulted
"""

import requests

from personas.common import (
    banner, signup_principal, signup_lender, create_agent_with_mandate,
    request_loan, post, get, BASE_URL,
)


def main():
    banner("PERSONA 3: Misbehaving agent -> default + kill-switch")

    principal_token, principal_id, private_key_b64 = signup_principal("Demo Principal (Misbehaving)")
    lender_token, lender_id = signup_lender(
        "Demo Lender C",
        min_score=30.0,  # low bar -- this persona needs to get FUNDED first,
                         # the point of this script is what happens AFTER
        max_exposure=1000.0,
        platform_cap=100000.0,
        categories=[],
    )

    agent_id = create_agent_with_mandate(
        principal_token, principal_id, private_key_b64,
        name="Misbehaving-Agent-01",
    )

    approved_recipient = "cloud-compute-vendor.example"
    wrong_recipient = "attacker-controlled-address.example"

    print("\n  requesting loan...")
    loan = request_loan(
        agent_id, lender_id,
        principal_amount=500.0,
        approved_recipient=approved_recipient,
        task_category=None,
    )
    loan_id = loan["id"]
    print(f"  loan {loan_id} approved: limit={loan['credit_limit_at_issuance']}")
    assert loan["status"] == "approved"

    print("\n  simulating a legitimate partial inflow (funds insurance pool)...")
    ledger_entry = post(f"/repayment/inflow/{agent_id}", {"amount": 250.0}, token=None)
    print(f"  deducted={ledger_entry['amount_deducted']}  "
          f"released_to_agent={ledger_entry['amount_released_to_agent']}  "
          f"insurance_contribution={ledger_entry['insurance_contribution']}")

    pool_before = get("/lenders/insurance-pool")
    print(f"  insurance pool balance before default: {pool_before['balance']}")

    print(f"\n  attempting unauthorized payment to '{wrong_recipient}' "
          f"(approved recipient was '{approved_recipient}')...")
    spend_result = post(f"/repayment/spend/{agent_id}", {
        "amount": 100.0,
        "recipient": wrong_recipient,
    }, token=None)

    print(f"\n  RESULT: severity={spend_result['severity']}  reason={spend_result['reason']}")
    assert spend_result["severity"] == "defaulted", "expected wrong-recipient spend to trigger default"

    loan_detail = get(f"/loans/{loan_id}")
    print(f"\n  loan status after default: {loan_detail['status']}")
    print(f"  status history: {[h['status'] for h in loan_detail['status_history']]}")

    pool_after = get("/lenders/insurance-pool")
    print(f"  insurance pool balance after default: {pool_after['balance']}  "
          f"(drew {float(pool_before['balance']) - float(pool_after['balance']):.2f})")

    agent_view = get(f"/agents/{agent_id}/lender-view", token=lender_token)
    print(f"\n  agent status: {agent_view['status']}  "
          f"credential_active={agent_view['credential_active']}")
    assert agent_view["status"] == "defaulted"
    assert agent_view["credential_active"] is False

    print("\n  confirming kill-switch actually blocks further use "
          "(expect 403 on a fresh loan request)...")
    r = requests.post(
        f"{BASE_URL}/loans/{agent_id}",
        json={
            "agent_id": agent_id, "lender_id": lender_id,
            "principal_amount": 50.0, "approved_recipient": approved_recipient,
        },
    )
    print(f"  POST /loans/{agent_id} (post-revocation) -> {r.status_code}")
    assert r.status_code == 403, "expected revoked agent to be blocked by get_active_agent_with_valid_credential"

    print("\n  PASS: unauthorized payment -> instant default + revoke + bounded "
          "write-off, agent now fully locked out.")


if __name__ == "__main__":
    main()
