# app/schemas.py
from datetime import datetime
from decimal import Decimal
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from enum import Enum


# ---------- Enums (mirror models.py) ----------

class AgentStatus(str, Enum):
    active = "active"
    revoked = "revoked"
    defaulted = "defaulted"
    blacklisted = "blacklisted"


class LoanStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    denied = "denied"
    repaid = "repaid"
    defaulted = "defaulted"


class TransactionType(str, Enum):
    disbursement = "disbursement"
    repayment = "repayment"
    task_payout = "task_payout"
    spend = "spend"
    cross_agent_clawback = "cross_agent_clawback"
    insurance_contribution = "insurance_contribution"
    insurance_payout = "insurance_payout"


class EventType(str, Enum):
    loan_approved = "loan_approved"
    loan_denied = "loan_denied"
    repayment_deducted = "repayment_deducted"
    anomaly_flagged = "anomaly_flagged"
    revoked = "revoked"
    defaulted = "defaulted"


# ---------- Base config ----------

class ORMBase(BaseModel):
    model_config = ConfigDict(from_attributes=True)

# ---------- Auth ----------

class Role(str, Enum):
    principal = "principal"
    lender = "lender"


class SignupRequest(BaseModel):
    role: Role
    name: str
    email: str
    password: str
    public_key: Optional[str] = None  # required if role == principal


class LoginRequest(BaseModel):
    role: Role
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Role
    id: int

# ---------- Principal ----------

class PrincipalCreate(BaseModel):
    name: str
    public_key: str  # base64/hex-encoded Ed25519 public key


class PrincipalOut(ORMBase):
    id: int
    name: str
    public_key: str
    created_at: datetime


# ---------- Agent ----------
# Covers: Principal/Onboarding, Principal/Add New Agent, Principal/Dashboard roster,
# Principal/Agent Detail, Lender/Agent Directory + Agent Detail

class AgentCreate(BaseModel):
    principal_id: int
    name: str
    description: Optional[str] = None


class DelegationMandateSign(BaseModel):
    """Payload the principal signs to create the agent<->principal link."""
    agent_id: int
    bounds: str  # human-readable terms of authorization shown at Onboarding step
    issued_at: datetime
    signature: str  # Ed25519 signature over the canonical mandate payload


class AgentOut(ORMBase):
    id: int
    principal_id: int
    name: str
    status: AgentStatus
    created_at: datetime


class AgentRosterItem(ORMBase):
    """Principal Dashboard: agent roster row."""
    id: int
    name: str
    status: AgentStatus
    outstanding_balance: Decimal


class AgentDetailPrincipalOut(ORMBase):
    """Principal/Agent Detail: credential info + loan history summary."""
    id: int
    name: str
    status: AgentStatus
    delegation_mandate: str
    credential_active: bool


# ---------- Wallet ----------

class WalletOut(ORMBase):
    id: int
    agent_id: int
    spendable_balance: Decimal
    updated_at: datetime


# ---------- AgentScore ----------
# Covers: Lender/Agent Detail score breakdown, cold-start indicator

class AgentScoreOut(ORMBase):
    agent_id: int
    score: Decimal
    task_success_rate: Decimal
    spend_regularity: Decimal
    computed_at: datetime
    is_cold_start: bool = Field(
        description="True if agent has no meaningful history; drives starter-limit UI badge"
    )


# ---------- Lender ----------
# Covers: Lender/Onboarding: Set Risk Policy, Lender/Risk Policy Settings

class LenderPolicyUpdate(BaseModel):
    max_exposure_per_agent: Decimal
    total_platform_exposure_cap: Decimal
    min_score_required: Decimal
    allowed_agent_categories: list[str]


class LenderOut(ORMBase):
    id: int
    name: str
    max_exposure_per_agent: Decimal
    total_platform_exposure_cap: Decimal
    min_score_required: Decimal
    allowed_agent_categories: list[str]
    updated_at: datetime


# ---------- Loan ----------
# Covers: Loan Detail — decision rationale is the critical piece for "trust design"

class LoanRequest(BaseModel):
    agent_id: int
    lender_id: int
    principal_amount: Decimal
    approved_recipient: str
    task_category: Optional[str] = None


class LoanDecisionRationale(BaseModel):
    """Rendered directly on Lender/Loan Detail — plain-language rule applied."""
    score_at_decision: Decimal
    policy_min_score: Decimal
    policy_max_exposure: Decimal
    threshold_cleared: bool
    explanation: str  # e.g. "score 0.72 within policy range 0.6-0.9 -> approved"


class LoanOut(ORMBase):
    id: int
    agent_id: int
    principal_amount: Decimal
    outstanding_balance: Decimal
    status: LoanStatus
    credit_limit_at_issuance: Decimal
    issued_at: datetime
    due_at: Optional[datetime] = None


class LoanDetailOut(LoanOut):
    """Full Loan Detail page payload: summary + rationale + status history."""
    rationale: LoanDecisionRationale
    status_history: list["StatusHistoryEntry"]


class StatusHistoryEntry(BaseModel):
    status: LoanStatus
    changed_at: datetime


# ---------- Transaction / Repayment ledger ----------
# Covers: Loan Detail repayment ledger, Lender/Agent Detail transaction history

class TransactionOut(ORMBase):
    id: int
    agent_id: int
    loan_id: Optional[int] = None
    type: TransactionType
    amount: Decimal
    created_at: datetime


class RepaymentLedgerEntry(BaseModel):
    """One inflow event: what came in, what got deducted, what was released."""
    inflow_amount: Decimal
    amount_deducted: Decimal
    amount_released_to_agent: Decimal
    insurance_contribution: Decimal = Decimal("0")
    write_off_amount: Optional[Decimal] = Field(
        default=None,
        description="Set only when payout was spent/unavailable before deduction (bounded loss case)"
    )
    created_at: datetime


# ---------- Event / Anomaly / Alerts ----------
# Covers: Lender Dashboard live feed, Anomaly & Alerts Feed, Operator Console outcome feed

class EventOut(ORMBase):
    id: int
    agent_id: int
    loan_id: Optional[int] = None
    event_type: EventType
    detail: str
    created_at: datetime


class AnomalyFlag(BaseModel):
    agent_id: int
    baseline_amount: Decimal
    observed_amount: Decimal
    deviation_multiple: Decimal  # e.g. 5.2 -> "5.2x baseline"
    flagged_at: datetime


# ---------- Repayment router responses ----------

class SpendCheckResultOut(BaseModel):
    """Response for POST /repayment/spend/{agent_id}. Purely informational
    -- no money moves on this call, see repayment.py docstring."""
    severity: str  # "none" | "flagged" | "defaulted"
    reason: Optional[str] = None
    loan_id: Optional[int] = None


class TaskFailureResultOut(BaseModel):
    """Response for POST /repayment/task-failure/{agent_id}."""
    loan_id: int
    agent_id: int
    shortfall_before_clawback: Decimal
    total_clawed_back: Decimal
    insurance_payout: Decimal
    final_write_off_amount: Decimal
    agent_status: str


# ---------- Insurance Pool ----------

class InsurancePoolOut(BaseModel):
    """Live pool balance for the Lender Dashboard 'growing pool' visual
    and the Operator Console default-absorption demo moment."""
    balance: Decimal
    updated_at: datetime


# ---------- Operator Console ----------

class PersonaTrigger(BaseModel):
    persona: str  # "established" | "new" | "misbehaving"


class ExposureStats(BaseModel):
    """Lender Dashboard + Operator Console exposure summary."""
    total_capital_out: Decimal
    active_count: int
    starter_limit_count: int
    defaulted_count: int


LoanDetailOut.model_rebuild()