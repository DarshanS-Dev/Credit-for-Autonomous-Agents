"""
simulate_agent_workflow_http.py

REAL HTTP version of the simulator. Unlike simulate_agent_workflow.py
(which talks straight to the DB via SessionLocal and never touches the
network), this script hits the actual deployed FastAPI endpoints exactly
the way a real autonomous agent client would -- including the X-Agent-Key
header that loans.py/repayment.py now require via
get_active_agent_with_key_and_credential.

This exercises the real auth path end to end:
    agent_id + raw api_key --(HTTP)--> /repayment/inflow/{agent_id}
    header: X-Agent-Key: <raw_key>
    -> 401 if key is wrong/missing
    -> 403 if agent has no key configured, or credential/status invalid
    -> 200 with the real ledger response otherwise

Prerequisites (all done via the GUI beforehand):
    1. Principal signs up, creates agent
    2. Principal signs the mandate -> response includes `api_key` ONCE.
       Copy it now -- there is no "view it again" endpoint.
    3. Principal uploads CSV history for the agent
    4. Principal (or GUI) requests a loan for the agent -- this ALSO
       requires the X-Agent-Key header, so the GUI must already be
       sending it at that step too, or the loan request itself will fail
       before this script ever runs.

Usage:
    python simulate_agent_workflow_http.py <agent_id> <api_key> [--anomaly] [--base-url URL]

Example:
    python simulate_agent_workflow_http.py 7 aBc123XyZ... --base-url https://your-app.onrender.com
"""

import sys
import time
import argparse
from decimal import Decimal

import requests


def print_heading(text):
    print("\n" + "=" * 60)
    print(f"  {text}")
    print("=" * 60 + "\n")


def print_step(step_num, description):
    print(f"\n[Step {step_num}] {description}")
    print("-" * 60)


def print_success(text):
    print(f"\u2713 {text}")


def print_info(text):
    print(f"\u2139 {text}")


def print_error(text):
    print(f"\u274c {text}")


class ApiClient:
    """Thin wrapper so every call carries the X-Agent-Key header and
    raises a clear, demo-friendly error message on non-2xx responses."""

    def __init__(self, base_url: str, agent_id: int, api_key: str):
        self.base_url = base_url.rstrip("/")
        self.agent_id = agent_id
        self.headers = {
            "Content-Type": "application/json",
            "X-Agent-Key": api_key,
        }

    def post(self, path: str, json_body: dict) -> dict:
        url = f"{self.base_url}{path}"
        resp = requests.post(url, json=json_body, headers=self.headers, timeout=30)
        if resp.status_code == 401:
            print_error("401 UNAUTHORIZED — X-Agent-Key header is missing or does not match this agent")
            resp.raise_for_status()
        if resp.status_code == 403:
            print_error(
                "403 FORBIDDEN — agent has no api_key configured, or its "
                "credential/status is no longer valid (revoked/defaulted/blacklisted)"
            )
            resp.raise_for_status()
        if resp.status_code == 404:
            print_error(f"404 NOT FOUND — check agent_id={self.agent_id} or the open-loan requirement")
            resp.raise_for_status()
        resp.raise_for_status()
        return resp.json()

    def get_json(self, path: str, params: dict | None = None) -> dict | list:
        url = f"{self.base_url}{path}"
        resp = requests.get(url, params=params or {}, timeout=30)
        resp.raise_for_status()
        return resp.json()


def get_open_loan(client: ApiClient) -> dict | None:
    """
    GET /loans?agent_id= is unauthenticated (no X-Agent-Key needed) so we
    can use it purely to display current loan status between steps --
    matches how loans.py's list_loans endpoint is actually wired.
    """
    loans = client.get_json("/loans", params={"agent_id": client.agent_id})
    for loan in loans:
        if loan["status"] == "approved":
            return loan
    return loans[0] if loans else None


def simulate_agent_earning_and_repaying(client: ApiClient):
    print_heading("AUTONOMOUS AGENT WORKFLOW SIMULATION (LIVE HTTP)")
    print(f"Base URL: {client.base_url}")
    print(f"Agent ID: {client.agent_id}")

    loan = get_open_loan(client)
    if loan is None:
        print_error("No loan found for this agent at all -- request one via the GUI first")
        return
    if loan["status"] != "approved":
        print_error(f"Agent's most recent loan is status={loan['status']}, not approved -- nothing to repay")
        return

    print(f"Loan #{loan['id']}: principal ${loan['principal_amount']}, "
          f"outstanding ${loan['outstanding_balance']}, status={loan['status']}")
    print()

    payouts = [
        ("task-2026-001", "120.00"),
        ("task-2026-002", "150.00"),
        ("task-2026-003", "100.00"),
        ("task-2026-004", "80.00"),
    ]

    for i, (task_id, payout_amount) in enumerate(payouts, start=1):
        print_step(i, f"Agent completes {task_id} and receives ${payout_amount}")

        result = client.post(
            f"/repayment/inflow/{client.agent_id}",
            {"amount": payout_amount},
        )

        print_info(f"Inflow received: ${result['inflow_amount']}")
        print_success(f"Repayment deducted: ${result['amount_deducted']}")
        print_success(f"Released to agent wallet: ${result['amount_released_to_agent']}")
        print_info(f"Insurance pool contribution: ${result['insurance_contribution']}")

        current_loan = get_open_loan(client)
        if current_loan:
            print(f"\n   Loan outstanding balance: ${current_loan['outstanding_balance']}")
            print(f"   Loan status: {current_loan['status'].upper()}")
            if current_loan["status"] == "repaid":
                print_success("\U0001F389 LOAN FULLY REPAID!")
                break

        time.sleep(2)

    print_heading("WORKFLOW COMPLETE")


def simulate_anomaly_detection(client: ApiClient):
    print_heading("OPTIONAL: ANOMALY DETECTION DEMO (LIVE HTTP)")
    print("\nWhat if the agent tried to spend to an UNAPPROVED recipient?\n")

    loan = get_open_loan(client)
    if loan is None or loan["status"] != "approved":
        print_error("No open approved loan to demonstrate against.")
        return

    print_step(1, "Agent attempts to send $500 to attacker.io")

    result = client.post(
        f"/repayment/spend/{client.agent_id}",
        {"amount": "500.00", "recipient": "attacker.io"},
    )

    print()
    print_success(f"Spend check severity: {result['severity'].upper()}")
    if result["severity"] == "defaulted":
        print_success("\u274c INSTANT DEFAULT + REVOCATION TRIGGERED")

    print("\nTry using the agent again to confirm it's locked out:")
    try:
        client.post(f"/repayment/inflow/{client.agent_id}", {"amount": "10.00"})
    except requests.HTTPError:
        print_success("Confirmed: agent can no longer act (401/403 on further use).")


def main():
    parser = argparse.ArgumentParser(description="Live HTTP agent workflow simulator")
    parser.add_argument("agent_id", type=int)
    parser.add_argument("api_key", type=str, help="Raw X-Agent-Key, captured once from POST /agents/{id}/mandate")
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--anomaly", action="store_true")
    args = parser.parse_args()

    client = ApiClient(args.base_url, args.agent_id, args.api_key)

    try:
        simulate_agent_earning_and_repaying(client)

        if args.anomaly:
            print("\nPress ENTER to see anomaly detection demo...", flush=True)
            input()
            simulate_anomaly_detection(client)

    except requests.HTTPError as e:
        print_error(f"Request failed: {e}")
        sys.exit(1)
    except requests.ConnectionError:
        print_error(f"Could not reach {args.base_url} -- is the backend awake? (Render free tier spins down)")
        sys.exit(1)


if __name__ == "__main__":
    main()