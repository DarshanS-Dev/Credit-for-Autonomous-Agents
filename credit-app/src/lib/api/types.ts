// Shared API response types mirroring backend/app/schemas.py

export type AgentStatus = "active" | "revoked" | "defaulted" | "blacklisted";
export type LoanStatus = "pending" | "approved" | "denied" | "repaid" | "defaulted";
export type EventType =
  | "loan_approved"
  | "loan_denied"
  | "repayment_deducted"
  | "anomaly_flagged"
  | "revoked"
  | "defaulted";

export interface TokenResponse {
  access_token: string;
  token_type: string;
  role: "principal" | "lender";
  id: number;
}

export interface AgentOut {
  id: number;
  principal_id: number;
  name: string;
  status: AgentStatus;
  created_at: string;
}

export interface AgentRosterItem {
  id: number;
  name: string;
  status: AgentStatus;
  outstanding_balance: string | number;
}

export interface AgentDetailOut {
  id: number;
  name: string;
  status: AgentStatus;
  delegation_mandate: string;
  credential_active: boolean;
}

export interface WalletOut {
  id: number;
  agent_id: number;
  spendable_balance: string | number;
  updated_at: string;
}

export interface AgentScoreOut {
  agent_id: number;
  score: string | number;
  task_success_rate: string | number;
  spend_regularity: string | number;
  computed_at: string;
  is_cold_start: boolean;
}

export interface LenderOut {
  id: number;
  name: string;
  max_exposure_per_agent: string | number;
  total_platform_exposure_cap: string | number;
  min_score_required: string | number;
  allowed_agent_categories: string[];
  updated_at: string;
}

export interface ExposureStats {
  total_capital_out: string | number;
  active_count: number;
  starter_limit_count: number;
  defaulted_count: number;
}

export interface LoanOut {
  id: number;
  agent_id: number;
  principal_amount: string | number;
  outstanding_balance: string | number;
  status: LoanStatus;
  credit_limit_at_issuance: string | number;
  issued_at: string;
  due_at: string | null;
}

export interface LoanDecisionRationale {
  score_at_decision: string | number;
  policy_min_score: string | number;
  policy_max_exposure: string | number;
  threshold_cleared: boolean;
  explanation: string;
}

export interface StatusHistoryEntry {
  status: LoanStatus;
  changed_at: string;
}

export interface LoanDetailOut extends LoanOut {
  rationale: LoanDecisionRationale;
  status_history: StatusHistoryEntry[];
}

export interface EventOut {
  id: number;
  agent_id: number;
  loan_id: number | null;
  event_type: EventType;
  detail: string;
  created_at: string;
}

export interface SpendCheckResultOut {
  severity: "none" | "flagged" | "defaulted";
  reason: string | null;
  loan_id: number | null;
}

export interface TaskFailureResultOut {
  loan_id: number;
  agent_id: number;
  shortfall_before_clawback: string | number;
  total_clawed_back: string | number;
  final_write_off_amount: string | number;
  agent_status: string;
}

export function toNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null) return 0;
  return typeof value === "number" ? value : parseFloat(value);
}

export function formatCurrency(value: string | number): string {
  return toNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString();
  } catch {
    return iso;
  }
}

/** Map backend loan status to UI-friendly label */
export function loanStatusLabel(status: LoanStatus): string {
  if (status === "approved") return "active";
  return status;
}
