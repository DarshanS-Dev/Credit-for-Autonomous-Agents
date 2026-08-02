import { api } from "./client";
import type { SpendCheckResultOut, TaskFailureResultOut } from "./types";

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
  token?: string
): Promise<TaskFailureResultOut> {
  return api.post<TaskFailureResultOut>(
    `/repayment/task-failure/${agentId}`,
    {},
    { token }
  );
}

export function recordInflow(
  agentId: number,
  amount: number,
  token?: string
): Promise<unknown> {
  return api.post(`/repayment/inflow/${agentId}`, { amount }, { token });
}
