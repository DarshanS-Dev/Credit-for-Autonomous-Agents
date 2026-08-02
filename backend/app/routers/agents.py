"""
agents.py

Principal-side agent lifecycle (create -> sign delegation mandate -> view)
plus Lender-side read views into an agent (directory detail, score
breakdown, transaction ledger, credit limit override) and the principal's
own kill switch. Loan/repayment/spend actions live in loans.py and
repayment.py -- this router is identity + roster + lender-facing controls.

Ownership: every principal-scoped endpoint checks agent.principal_id ==
current_principal.id, returning 404 (not 403) on mismatch -- deliberately
indistinguishable from "doesn't exist" so a principal can't enumerate
other principals' agent ids by probing for a 403 vs 404 difference.
"""

import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Agent, AgentScore, Wallet, Transaction, AgentStatus as ModelAgentStatus
from app.schemas import (
    AgentCreate,
    AgentOut,
    AgentRosterItem,
    AgentDetailPrincipalOut,
    AgentRevokeRequest,
    DelegationMandateSign,
    WalletOut,
    AgentScoreOut,
    CreditLimitUpdate,
    TransactionOut,
)
from app.dependencies import get_current_principal, get_current_lender, revoke_agent
from app.services.credential_service import verify_mandate
from app.services import underwriting_service

router = APIRouter(prefix="/agents", tags=["agents"])


# ---------- Internal helpers ----------

def _get_owned_agent_or_404(db: Session, agent_id: int, principal_id: int) -> Agent:
    agent = (
        db.query(Agent)
        .filter(Agent.id == agent_id, Agent.principal_id == principal_id)
        .first()
    )
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")
    return agent


# ---------- Principal: create + mandate signing ----------

@router.post("", response_model=AgentOut, status_code=status.HTTP_201_CREATED)
def create_agent(
    payload: AgentCreate,
    principal=Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    """
    Step 1 of Onboarding: register the agent shell (name/description) with
    no delegation_mandate yet. The mandate is signed client-side against
    this agent's real id in a second call (sign_mandate below) -- the
    canonical payload includes agent_id, so the agent must exist first.

    payload.principal_id is ignored in favor of the authenticated
    principal's own id -- a principal should never be able to register an
    agent under someone else's account by editing a request body field.
    """
    agent = Agent(
        principal_id=principal.id,
        name=payload.name,
        delegation_mandate="",  # placeholder until sign_mandate is called
        status="active",
    )
    db.add(agent)
    db.commit()
    db.refresh(agent)

    # Every agent needs a wallet row to exist before any loan/repayment
    # code touches it -- created here so it's never a null-check elsewhere.
    db.add(Wallet(agent_id=agent.id, spendable_balance=0))
    db.commit()

    return agent


@router.post("/{agent_id}/mandate", response_model=AgentOut)
def sign_mandate(
    agent_id: int,
    payload: DelegationMandateSign,
    principal=Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    """
    Step 2 of Onboarding: principal has signed the canonical mandate
    payload client-side (their private key never reaches us), including
    the exact issued_at timestamp they signed against. We verify it once
    here using that same issued_at (NOT a freshly generated one -- using
    a new timestamp here would make verification fail against virtually
    every real signature) before persisting, and store the raw components
    as the JSON blob dependencies.py expects to re-verify on every future
    loan/repayment request.

    Rejects (422) if the signature doesn't verify against the principal's
    stored public_key -- this is the only place a bad mandate can be
    caught before it's trusted for the agent's whole lifetime.
    """
    agent = _get_owned_agent_or_404(db, agent_id, principal.id)

    valid = verify_mandate(
        public_key_b64=principal.public_key,
        signature_b64=payload.signature,
        principal_id=principal.id,
        agent_id=agent.id,
        bounds=payload.bounds,
        issued_at=payload.issued_at,
    )
    if not valid:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Mandate signature does not verify against principal's public key",
        )

    agent.delegation_mandate = json.dumps({
        "bounds": payload.bounds,
        "issued_at": payload.issued_at.isoformat(),
        "signature": payload.signature,
    })
    db.commit()
    db.refresh(agent)
    return agent


# ---------- Principal: roster + detail ----------

@router.get("", response_model=list[AgentRosterItem])
def list_my_agents(
    principal=Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    """
    Principal Dashboard roster. outstanding_balance is pulled from each
    agent's open loan if one exists, else 0 -- AgentRosterItem doesn't
    distinguish "no loan" from "fully repaid," both show as 0, which
    matches what the roster row actually needs to communicate.
    """
    agents = db.query(Agent).filter(Agent.principal_id == principal.id).all()

    from app.models import Loan, LoanStatus  # local import: avoids a
    # module-level circular concern with models.py re-exporting Loan

    rows = []
    for agent in agents:
        open_loan = (
            db.query(Loan)
            .filter(Loan.agent_id == agent.id, Loan.status == LoanStatus.APPROVED)
            .first()
        )
        rows.append(AgentRosterItem(
            id=agent.id,
            name=agent.name,
            status=agent.status,
            outstanding_balance=open_loan.outstanding_balance if open_loan else 0,
        ))
    return rows


@router.get("/{agent_id}", response_model=AgentDetailPrincipalOut)
def get_agent_detail(
    agent_id: int,
    principal=Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    """Principal/Agent Detail: credential info + status, for the Credential
    info section of that page. Loan history is a separate call (loans.py:
    GET /loans?agent_id=) -- kept split so this endpoint stays fast and
    this router doesn't need to import loan-listing logic."""
    agent = _get_owned_agent_or_404(db, agent_id, principal.id)
    return AgentDetailPrincipalOut(
        id=agent.id,
        name=agent.name,
        status=agent.status,
        delegation_mandate=agent.delegation_mandate,
        credential_active=agent.status == "active",
    )


@router.get("/{agent_id}/wallet", response_model=WalletOut)
def get_agent_wallet(
    agent_id: int,
    principal=Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    agent = _get_owned_agent_or_404(db, agent_id, principal.id)
    wallet = db.query(Wallet).filter(Wallet.agent_id == agent.id).first()
    if wallet is None:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Agent has no wallet row")
    return wallet


@router.post("/{agent_id}/revoke", response_model=AgentOut)
def principal_revoke_agent(
    agent_id: int,
    payload: AgentRevokeRequest = AgentRevokeRequest(),
    principal=Depends(get_current_principal),
    db: Session = Depends(get_db),
):
    """
    Principal/Agent Detail 'Agent controls -> Manually revoke the agent's
    delegation credential'. Distinct from the Operator Console's kill
    switch and from an automatic monitoring/task-failure default:

    - This one: voluntary, principal-initiated -> AgentStatus.REVOKED
    - Operator kill switch (admin.py): manual, intended-as-permanent ban
      -> AgentStatus.BLACKLISTED
    - Automatic (monitoring_service.py / repayment.py task-failure):
      behavior-triggered -> AgentStatus.DEFAULTED

    All three go through the same revoke_agent() so there's still exactly
    one function in the codebase that flips Agent.status.
    """
    agent = _get_owned_agent_or_404(db, agent_id, principal.id)
    agent = revoke_agent(
        db,
        agent_id=agent.id,
        reason=payload.reason,
        target_status=ModelAgentStatus.REVOKED,
    )
    db.commit()
    db.refresh(agent)
    return agent


# ---------- Lender-facing views ----------
# No ownership check by principal_id -- any authenticated lender can view
# any agent's public underwriting profile, same as the Agent Directory
# spec implies (lenders browse agents they don't own).

@router.get("/{agent_id}/lender-view", response_model=AgentDetailPrincipalOut)
def get_agent_for_lender(
    agent_id: int,
    lender=Depends(get_current_lender),
    db: Session = Depends(get_db),
):
    """
    Lender/Agent Detail identity section. Reuses AgentDetailPrincipalOut
    since the fields a lender needs to see (name, status, mandate,
    credential_active) are identical to the principal's own view -- score
    breakdown and loan/transaction history are separate endpoints
    (get_agent_score / get_agent_transactions below, and loans.py) to
    keep each response focused.
    """
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")
    return AgentDetailPrincipalOut(
        id=agent.id,
        name=agent.name,
        status=agent.status,
        delegation_mandate=agent.delegation_mandate,
        credential_active=agent.status == "active",
    )


@router.get("/{agent_id}/score", response_model=AgentScoreOut)
def get_agent_score(
    agent_id: int,
    lender=Depends(get_current_lender),
    db: Session = Depends(get_db),
):
    """
    Lender/Agent Detail score breakdown + Agent Directory cold-start
    indicator. Returns the stored AgentScore row if one exists.

    If no row exists, the agent is cold-start by definition (see
    underwriting_service.py) -- rather than 404ing, we return a synthetic
    AgentScoreOut using the same COLD_START_BASE_SCORE the underwriting
    service would use at decision time, with is_cold_start=True. This
    keeps the endpoint always-200 so the frontend can render the
    starter-limit badge inline instead of handling an error state, per
    the sitemap's "cold-start indicator" requirement.
    """
    score = db.query(AgentScore).filter(AgentScore.agent_id == agent_id).first()

    if score is None:
        agent = db.query(Agent).filter(Agent.id == agent_id).first()
        if agent is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")
        return AgentScoreOut(
            agent_id=agent_id,
            score=underwriting_service.COLD_START_BASE_SCORE,
            task_success_rate=0,
            spend_regularity=0,
            computed_at=datetime.now(timezone.utc),
            is_cold_start=True,
        )

    return AgentScoreOut(
        agent_id=score.agent_id,
        score=score.score,
        task_success_rate=score.task_success_rate,
        spend_regularity=score.spend_regularity,
        computed_at=score.computed_at,
        is_cold_start=False,
    )


@router.get("/{agent_id}/transactions", response_model=list[TransactionOut])
def get_agent_transactions(
    agent_id: int,
    lender=Depends(get_current_lender),
    db: Session = Depends(get_db),
):
    """
    Lender/Agent Detail 'Ledger of custodial wallet inflows and automatic
    repayment deductions'. No ownership restriction (same posture as
    get_agent_for_lender / get_agent_score above) -- a lender evaluating
    whether to fund an agent needs to see its full transaction history,
    not just loans it originated itself.

    Ordered newest-first to match how a ledger view is normally read.
    """
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")

    return (
        db.query(Transaction)
        .filter(Transaction.agent_id == agent_id)
        .order_by(Transaction.created_at.desc())
        .all()
    )


@router.put("/{agent_id}/credit-limit", response_model=AgentOut)
def set_agent_credit_limit(
    agent_id: int,
    payload: CreditLimitUpdate,
    lender=Depends(get_current_lender),
    db: Session = Depends(get_db),
):
    """
    Lender/Agent Detail 'manually adjust this agent's individual credit
    limit within policy bounds'. Stores a flat override on the agent row
    (Agent.manual_credit_limit_override) that loans.py applies as a final
    clamp on the NEXT loan request -- it does not touch any currently
    open loan, and does not itself validate against the lender's own
    max_exposure_per_agent (that check still happens the normal way, in
    policy_engine, at request time; this endpoint only sets what number
    gets used downstream of that).

    Passing credit_limit=null clears the override, reverting the agent to
    normal score/policy-derived limits.
    """
    agent = db.query(Agent).filter(Agent.id == agent_id).first()
    if agent is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Agent not found")

    agent.manual_credit_limit_override = payload.credit_limit
    db.commit()
    db.refresh(agent)
    return agent
