import enum
from datetime import datetime

from sqlalchemy import (
    String,
    Numeric,
    ForeignKey,
    DateTime,
    Enum,
    JSON,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


# ---------- Enums ----------

class AgentStatus(str, enum.Enum):
    ACTIVE = "active"
    REVOKED = "revoked"
    DEFAULTED = "defaulted"
    BLACKLISTED = "blacklisted"


class LoanStatus(str, enum.Enum):
    PENDING = "pending"
    APPROVED = "approved"
    DENIED = "denied"
    REPAID = "repaid"
    DEFAULTED = "defaulted"


class TransactionType(str, enum.Enum):
    DISBURSEMENT = "disbursement"
    REPAYMENT = "repayment"
    TASK_PAYOUT = "task_payout"
    SPEND = "spend"
    CROSS_AGENT_CLAWBACK = "cross_agent_clawback"
    INSURANCE_CONTRIBUTION = "insurance_contribution"
    INSURANCE_PAYOUT = "insurance_payout"


class EventType(str, enum.Enum):
    LOAN_APPROVED = "loan_approved"
    LOAN_DENIED = "loan_denied"
    REPAYMENT_DEDUCTED = "repayment_deducted"
    ANOMALY_FLAGGED = "anomaly_flagged"
    REVOKED = "revoked"
    DEFAULTED = "defaulted"


# ---------- Tables ----------

class Principal(Base):
    __tablename__ = "principals"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    public_key: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    agents: Mapped[list["Agent"]] = relationship(back_populates="principal")


class Agent(Base):
    __tablename__ = "agents"

    id: Mapped[int] = mapped_column(primary_key=True)
    principal_id: Mapped[int] = mapped_column(ForeignKey("principals.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    delegation_mandate: Mapped[str] = mapped_column(String, nullable=False)  # signed credential blob
    status: Mapped[AgentStatus] = mapped_column(
        Enum(AgentStatus), default=AgentStatus.ACTIVE, nullable=False
    )
    vouching_enabled: Mapped[bool] = mapped_column(default=False, nullable=False)
    manual_credit_limit_override: Mapped[float | None] = mapped_column(
        Numeric(18, 2), nullable=True
    )
    # Lender-set custom credit ceiling for this specific agent, overriding
    # whatever underwriting_service/policy_engine would otherwise compute
    # at the next loan request. NULL means "no override, use the normal
    # score/policy-derived limit" -- this is deliberately opt-in per agent,
    # not a system-wide default. Only ever read at loan-request time
    # (loans.py); underwriting_service and policy_engine are untouched and
    # keep computing their own numbers regardless -- the override is
    # applied as a final clamp downstream of both, same pattern as
    # cold-start's flat limit.
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    principal: Mapped["Principal"] = relationship(back_populates="agents")
    wallet: Mapped["Wallet"] = relationship(back_populates="agent", uselist=False)
    loans: Mapped[list["Loan"]] = relationship(back_populates="agent")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="agent")
    score: Mapped["AgentScore"] = relationship(back_populates="agent", uselist=False)
    events: Mapped[list["Event"]] = relationship(back_populates="agent")


class Wallet(Base):
    __tablename__ = "wallets"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"), nullable=False, unique=True)
    spendable_balance: Mapped[float] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    agent: Mapped["Agent"] = relationship(back_populates="wallet")


class Loan(Base):
    __tablename__ = "loans"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"), nullable=False)
    lender_id: Mapped[int] = mapped_column(ForeignKey("lenders.id"), nullable=False)
    principal_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    interest_amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False, default=0)
    outstanding_balance: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    write_off_amount: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    approved_recipient: Mapped[str] = mapped_column(String(255), nullable=False)
    score_at_decision: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    policy_min_score_at_decision: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    status: Mapped[LoanStatus] = mapped_column(
        Enum(LoanStatus), default=LoanStatus.PENDING, nullable=False
    )
    credit_limit_at_issuance: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    agent: Mapped["Agent"] = relationship(back_populates="loans")
    lender: Mapped["Lender"] = relationship(back_populates="loans")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="loan")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"), nullable=False)
    loan_id: Mapped[int | None] = mapped_column(ForeignKey("loans.id"), nullable=True)
    type: Mapped[TransactionType] = mapped_column(Enum(TransactionType), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    agent: Mapped["Agent"] = relationship(back_populates="transactions")
    loan: Mapped["Loan"] = relationship(back_populates="transactions")


class AgentScore(Base):
    __tablename__ = "agent_scores"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"), nullable=False, unique=True)
    score: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    task_success_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    spend_regularity: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    agent: Mapped["Agent"] = relationship(back_populates="score")


class Lender(Base):
    __tablename__ = "lenders"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    max_exposure_per_agent: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    total_platform_exposure_cap: Mapped[float] = mapped_column(Numeric(18, 2), nullable=False)
    min_score_required: Mapped[float] = mapped_column(Numeric(6, 2), nullable=False)
    allowed_agent_categories: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    loans: Mapped[list["Loan"]] = relationship(back_populates="lender")


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    agent_id: Mapped[int] = mapped_column(ForeignKey("agents.id"), nullable=False)
    loan_id: Mapped[int | None] = mapped_column(ForeignKey("loans.id"), nullable=True)
    event_type: Mapped[EventType] = mapped_column(Enum(EventType), nullable=False)
    detail: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    agent: Mapped["Agent"] = relationship(back_populates="events")


class InsurancePool(Base):
    """
    Single-row table (id=1, seeded once via migration). Funded by a small
    skim off every successful repayment deduction (ledger_service.py); on
    default, drawn down (capped per-default) before the loss is written off,
    so a lender's exposure is protected two layers deep: cross-agent
    clawback first, then the insurance pool, then finally a bounded write-off.
    """
    __tablename__ = "insurance_pool"

    id: Mapped[int] = mapped_column(primary_key=True)
    balance: Mapped[float] = mapped_column(Numeric(18, 2), default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
