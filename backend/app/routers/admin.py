"""
admin.py

Operator Console: single-screen surface for triggering scripted demo
personas and the manual kill switch. Does not implement persona logic
itself (that lives in personas/*.py, not built yet) -- these endpoints
are the thin HTTP surface those scripts will call through, plus the
live event feed and manual revoke action.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Event
from app.schemas import EventOut
from app.dependencies import revoke_agent

router = APIRouter(prefix="/operator", tags=["operator"])


@router.get("/events", response_model=list[EventOut])
def get_recent_events(limit: int = 50, db: Session = Depends(get_db)):
    """
    Operator Console live outcome feed + Lender Dashboard activity feed
    share this same underlying Event stream -- no persona/lender filter
    here since the Operator Console is meant to show everything
    happening platform-wide during the demo.
    """
    return (
        db.query(Event)
        .order_by(Event.created_at.desc())
        .limit(limit)
        .all()
    )


@router.post("/agents/{agent_id}/revoke")
def manual_revoke(agent_id: int, reason: str = "manual operator revocation", db: Session = Depends(get_db)):
    """
    Manual kill switch, independent of the scripted persona flow --
    calls the exact same revoke_agent() every automatic default path
    uses, per dependencies.py's own docstring guarantee.
    """
    agent = revoke_agent(db, agent_id=agent_id, reason=reason)
    db.commit()
    return {"agent_id": agent.id, "status": agent.status}