import { api } from "./client";
import type { SpendCheckResultOut, TaskFailureResultOut, RepaymentLedgerEntry } from "./types";

export function checkSpend(
  agentId: number,
  amount: number,
  recipient: string,
  token?: string
): Promise<SpendCheckResultOut> {
  return api.post<SpendCheckResultOut>(
    `/repayment/spend/${agentId}`,
    { amount, recipient },
    { token }
  );
}

export function declareTaskFailure(
  agentId: number,
  token?: string,
  agentKey?: string
): Promise<TaskFailureResultOut> {
  return api.post<TaskFailureResultOut>(
    `/repayment/task-failure/${agentId}`,
    {},
    { token, agentKey }
  );
}

export function recordInflow(
  agentId: number,
  amount: number,
  token?: string,
  agentKey?: string
): Promise<RepaymentLedgerEntry> {
  return api.post<RepaymentLedgerEntry>(`/repayment/inflow/${agentId}`, { amount }, { token, agentKey });
}

