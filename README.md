# Credit for Autonomous Agents

Infrastructure and middleware that lets lenders extend short-term credit to autonomous AI agents that have no legal identity, credit history, or collateral. Every agent is cryptographically linked to an accountable human (the principal) through a signed delegation credential, underwritten using behavioral signals instead of a credit score, and repaid automatically at the wallet/ledger layer before funds ever reach the agent.

This repository contains the backend service: a FastAPI application backed by PostgreSQL, with identity verification, automated underwriting, policy enforcement, repayment interception, and instant revocation all implemented as pure API logic with no human approval step per loan.

## Problem

Every existing lending system assumes a human counterparty: a legal identity, a credit history, a signed contract. Autonomous AI agents that transact and complete paid work on their own have none of these, so they are structurally excluded from short-term credit even when they are otherwise capable of earning and repaying it.

## Solution

This platform replaces identity and credit history with two verifiable substitutes: a cryptographically signed delegation credential that ties every agent to an accountable human principal, and a behavioral score derived from the agent's own transaction history. Repayment is enforced programmatically at the wallet layer rather than relying on the agent's cooperation, and any resulting loss is bounded through cross-agent clawback and a shared insurance pool before it is ever written off.

## Table of Contents

- [Problem](#problem)
- [Solution](#solution)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Installation](#installation)
- [Configuration](#configuration)
- [Setup and Running the Project](#setup-and-running-the-project)
- [Usage](#usage)
- [API Endpoints](#api-endpoints)
- [Dependencies](#dependencies)
- [Future Enhancements](#future-enhancements)
- [Contributing](#contributing)

## Key Features

- **Signed Delegation Credentials** — Ed25519-signed mandates cryptographically bind each agent to an accountable principal and are re-verified on every request, not just at creation.
- **Behavioral Underwriting** — Loan decisions are computed from task success rate, spend regularity, transaction history, and repayment history, with no reliance on a traditional credit score.
- **Cold-Start Handling with Cross-Agent Reputation Sharing** — New agents receive a flat starter limit instead of rejection, with an optional, hard-capped reputation boost from vouching-enabled sibling agents.
- **Policy Engine** — Lenders enforce per-agent exposure limits, score thresholds, category restrictions, and a platform-wide exposure cap on top of the underwriting decision.
- **Ledger-Enforced Repayment** — All wallet activity flows through a single service that deducts outstanding balances from inflows before releasing funds to the agent.
- **Purpose-Mismatch Monitoring** — Spend attempts are validated against the loan's approved recipient; unauthorized payments trigger immediate default and revocation, while minor overspend is flagged for review.
- **Bounded Loss Containment** — Defaults are absorbed through capped cross-agent clawback, then a self-funded insurance pool, with only the residual amount recorded as a write-off.
- **Operator Console** — Scripted end-to-end demo scenarios, a manual kill switch, and a polling-based live event feed for platform-wide monitoring.

## Tech Stack

| Layer | Technology |
|---|---|
| Web framework | FastAPI |
| Database | PostgreSQL (Neon) |
| ORM | SQLAlchemy 2.0 |
| Migrations | Alembic |
| Validation / settings | Pydantic v2, pydantic-settings |
| Authentication | PyJWT, bcrypt |
| Cryptography | Ed25519 (`cryptography` library) |
| ASGI server | Uvicorn |
| Database driver | psycopg2-binary |

## Project Structure

```
.
├── alembic/
│   ├── env.py
│   └── versions/
│       ├── f6964da3a20b_initial_schema.py
│       ├── 7f77c36186ae_add_lender_platform_cap_and_loan_lender_.py
│       ├── 5310023e0c06_update_lender_platform_cap_and_loan_.py
│       ├── 92d46b3ac42a_add_loan_approved_recipient_and_event_.py
│       ├── 121ba659e2ce_add_loan_score_at_decision_and_policy_.py
│       └── 57c8f6008920_add_insurance_pool_loan_event_fields_.py
├── alembic.ini
├── app/
│   ├── __init__.py
│   ├── main.py                    # FastAPI app entrypoint, router registration
│   ├── config.py                  # Environment-driven settings
│   ├── database.py                # Engine, session factory, declarative base
│   ├── models.py                  # SQLAlchemy models
│   ├── schemas.py                 # Pydantic request/response DTOs
│   ├── dependencies.py            # Credential validation, auth, revoke_agent
│   ├── routers/
│   │   ├── auth.py                # Signup / login for both roles
│   │   ├── agents.py               # Agent lifecycle, mandate signing, lender views
│   │   ├── loans.py                # Loan request pipeline and read endpoints
│   │   ├── repayment.py            # Inflow processing, spend checks, task failure
│   │   ├── lenders.py              # Risk policy, exposure stats, agent directory
│   │   └── admin.py                # Operator console, kill switch, persona trigger
│   └── services/
│       ├── credential_service.py   # Ed25519 signing and verification (no DB access)
│       ├── underwriting_service.py # Score formula, cold-start, sibling boost
│       ├── policy_engine.py        # Category fit, platform exposure cap
│       ├── ledger_service.py       # Wallet ledger, repayment, default, insurance pool
│       ├── monitoring_service.py   # Spend purpose-mismatch detection
│       └── auth_service.py         # Password hashing, JWT issuance/verification
├── personas/
│   ├── __init__.py
│   ├── common.py                   # Shared HTTP helpers for persona scripts
│   ├── persona_established.py      # Established agent, clean history
│   ├── persona_new.py              # Brand-new agent, cold-start path
│   └── persona_misbehaving.py      # Loan, repayment, unauthorized spend, default
├── requirements.txt
└── .gitignore
```

## Installation

Clone the repository and set up a virtual environment.

```bash
git clone https://github.com/DarshanS-Dev/Credit-for-Autonomous-Agents.git
cd Credit-for-Autonomous-Agents/backend

python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

## Configuration

Settings are loaded from a `.env` file at the project root via `pydantic-settings`. Create a `.env` file with the following variables:

| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | required |
| `JWT_SECRET_KEY` | Secret key used to sign session JWTs | required |
| `JWT_ALGORITHM` | JWT signing algorithm | `HS256` |
| `JWT_EXPIRE_MINUTES` | Session token expiry, in minutes | `60` |
| `ENVIRONMENT` | Deployment environment label | `development` |
| `DEBUG` | Enable debug mode | `true` |

Session authentication (`auth_service.py`) uses a shared JWT secret and is unrelated to the Ed25519 delegation credentials used for agent authorization, which are generated and held client-side by the principal.

## Setup and Running the Project

Apply database migrations, then start the API server.

```bash
alembic upgrade head

uvicorn app.main:app --reload
```

The API is available at `http://localhost:8000`, with interactive documentation at `http://localhost:8000/docs`.

## Usage

### Running the demo personas

Three scripted end-to-end flows exercise the full API surface as a real client would, with the exception of one direct database seed step for historical data that has no corresponding write endpoint by design.

```bash
python -m personas.persona_established
python -m personas.persona_new
python -m personas.persona_misbehaving
```

Set `API_BASE_URL` if the server is not running on `http://localhost:8000`.

### Triggering scenarios through the API

The same three scenarios can be triggered server-side in a single request through the Operator Console:

```bash
curl -X POST http://localhost:8000/operator/persona-trigger \
  -H "Content-Type: application/json" \
  -d '{"persona": "established"}'
```

Valid values for `persona` are `established`, `new`, and `misbehaving`.

## API Endpoints

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| POST | `/auth/signup` | Create a principal or lender account |
| POST | `/auth/login` | Authenticate and receive a session token |

### Agents

| Method | Endpoint | Description |
|---|---|---|
| POST | `/agents` | Register a new agent under the authenticated principal |
| POST | `/agents/{agent_id}/mandate` | Verify and persist a signed delegation mandate |
| GET | `/agents` | List the authenticated principal's agents |
| GET | `/agents/{agent_id}` | Get credential and status detail for an owned agent |
| GET | `/agents/{agent_id}/wallet` | Get an owned agent's wallet balance |
| POST | `/agents/{agent_id}/revoke` | Principal-initiated voluntary credential revocation |
| GET | `/agents/{agent_id}/lender-view` | Lender-facing identity and status view |
| GET | `/agents/{agent_id}/score` | Behavioral score breakdown, including cold-start state |
| GET | `/agents/{agent_id}/transactions` | Full transaction ledger for an agent |
| PUT | `/agents/{agent_id}/credit-limit` | Lender override of an agent's individual credit limit |

### Loans

| Method | Endpoint | Description |
|---|---|---|
| POST | `/loans/{agent_id}` | Request a loan; runs underwriting and policy checks and disburses on approval |
| GET | `/loans/{loan_id}` | Full loan detail, including decision rationale and status history |
| GET | `/loans` | List loans, optionally filtered by agent or lender |

### Repayment

| Method | Endpoint | Description |
|---|---|---|
| POST | `/repayment/inflow/{agent_id}` | Simulate a task payout; auto-deducts against the open loan |
| POST | `/repayment/spend/{agent_id}` | Check a spend attempt's recipient and amount against the loan |
| POST | `/repayment/task-failure/{agent_id}` | Declare a task failure, triggering default and revocation |

### Lenders

| Method | Endpoint | Description |
|---|---|---|
| PUT | `/lenders/policy` | Create or update the authenticated lender's risk policy |
| GET | `/lenders/me` | Get the authenticated lender's profile |
| GET | `/lenders/exposure` | Get current exposure and agent status counts |
| GET | `/lenders/agents` | List all agents on the platform for underwriting review |
| GET | `/lenders/insurance-pool` | Get the live insurance pool balance |

### Operator

| Method | Endpoint | Description |
|---|---|---|
| GET | `/operator/events` | Poll the platform-wide event feed, optionally filtered |
| POST | `/operator/agents/{agent_id}/revoke` | Manual kill switch; blacklists an agent |
| POST | `/operator/persona-trigger` | Run a full scripted demo scenario in one request |

## Dependencies

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.35
psycopg2-binary==2.9.9
alembic==1.13.3
pydantic==2.9.2
pydantic-settings==2.5.2
python-dotenv==1.0.1
pyjwt==2.9.0
cryptography==43.0.1
websockets==13.1
python-multipart==0.0.12
pytest==8.3.3
httpx==0.27.2
bcrypt
```

## Future Enhancements

The following were scoped during design but are not implemented in the current codebase:

- **Live push updates.** The activity feed is currently polling-based (`GET /operator/events`); a WebSocket-based push implementation was scoped but deliberately not built.
- **Cooling-off tier.** A two-strike status between active and blacklisted, requiring a `default_count` field and a new agent status, was discussed but not implemented.
- **Dynamic interest by risk tier.** The `interest_amount` column exists on the loan model but is currently always zero; tiering logic based on the score at decision time was not implemented.
- **Task-type risk weighting.** Adjusting approved limits based on task category risk was considered and not pursued, as no task entity currently exists in the data model.
- **Multi-agent consensus verification and an explainability/appeal flow** were scoped and intentionally not built.
- Real KYC, real payment rail integration, and multi-lender marketplace bidding are outside the current scope of this system.

## Contributing

This project uses a feature-branch workflow, with backend and frontend developed on separate branches. When contributing:

1. Create a branch from `main` for your change.
2. Keep migrations sequential; do not edit a migration that has already been applied.
3. Run the persona scripts against a local instance before opening a pull request to confirm the end-to-end flow still passes.
4. Open a pull request describing the change and its effect on the API contract, if any.