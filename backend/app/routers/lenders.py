"""
lenders.py

Lender-side policy management and dashboard reads. Policy CRUD reuses
the same endpoint for both Onboarding: Set Risk Policy and Risk Policy
Settings (spec treats them as the same underlying data, just different
entry points in the sitemap) -- no separate "create" vs "update" path,
since every lender row already exists (created zeroed-out at signup,
per auth.py) and this always just overwrites it.
"""

from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Agent, AgentScore, Loan, LoanStatus, AgentStatus
from app.schemas import LenderPolicyUpdate, LenderOut, ExposureStats, AgentRosterItem
from app.dependencies import get_current_lender
from app.services import policy_engine

from app.services.underwriting_service import COLD_START_LIMIT

router = APIRouter(prefix="/lenders", tags=["lenders"])


@router.put("/policy", response_model=LenderOut)
def update_policy(
    payload: LenderPolicyUpdate,
    lender=Depends(get_current_lender),
    db: Session = Depends(get_db),
):
    """
    Single endpoint for both Onboarding: Set Risk Policy and Risk Policy
    Settings -- same fields, effective immediately (no draft/confirm step),
    matching the sitemap's "Save confirmation and effective-immediately
    notice" note on Risk Policy Settings.
    """
    lender.max_exposure_per_agent = payload.max_exposure_per_agent
    lender.total_platform_exposure_cap = payload.total_platform_exposure_cap
    lender.min_score_required = payload.min_score_required
    lender.allowed_agent_categories = payload.allowed_agent_categories
    db.commit()
    db.refresh(lender)
    return lender


@router.get("/me", response_model=LenderOut)
def get_my_lender_profile(lender=Depends(get_current_lender)):
    return lender


@router.get("/exposure", response_model=ExposureStats)
def get_exposure_stats(
    lender=Depends(get_current_lender),
    db: Session = Depends(get_db),
):
    """
    Lender Dashboard + Operator Console exposure summary. active_count /
    defaulted_count are global agent-status counts (not scoped to this
    lender specifically, since Agent doesn't carry a lender_id -- an
    agent can borrow from multiple lenders over its lifetime) --
    starter_limit_count and total_capital_out ARE lender-scoped, since
    those come from this lender's own Loan rows.
    """
    total_capital_out = policy_engine.current_platform_exposure(db, lender.id)

    starter_limit_count = (
        db.query(Loan)
        .filter(
            Loan.lender_id == lender.id,
            Loan.status == LoanStatus.APPROVED,
            Loan.credit_limit_at_issuance == COLD_START_LIMIT,  # COLD_START_LIMIT
        )
        .count()
    )
    active_count = db.query(Agent).filter(Agent.status == AgentStatus.ACTIVE).count()
    defaulted_count = db.query(Agent).filter(Agent.status == AgentStatus.DEFAULTED).count()

    return ExposureStats(
        total_capital_out=total_capital_out,
        active_count=active_count,
        starter_limit_count=starter_limit_count,
        defaulted_count=defaulted_count,
    )


@router.get("/agents", response_model=list[AgentRosterItem])
def agent_directory(
    lender=Depends(get_current_lender),
    db: Session = Depends(get_db),
):
    """
    Agent Directory: every agent that's interacted with the platform,
    not just this lender's own borrowers (a lender browses agents to
    decide whether to lend, so this must include agents with no loan
    from this lender yet). Reuses AgentRosterItem -- same shape the
    Principal Dashboard roster uses, since directory rows need the same
    id/name/status/outstanding_balance fields.
    """
    agents = db.query(Agent).all()
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