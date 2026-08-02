import { api } from "./client";
import type { LoanOut, LoanDetailOut } from "./types";

export interface LoanRequestPayload {
  lender_id: number;
  principal_amount: number;
  approved_recipient: string;
  task_category?: string;
}

export function requestLoan(
  agentId: number,
  payload: LoanRequestPayload,
  token?: string
): Promise<LoanDetailOut> {
  return api.post<LoanDetailOut>(
    `/loans/${agentId}`,
    { agent_id: agentId, ...payload },
    { token }
  );
}

export function getLoanDetail(loanId: number): Promise<LoanDetailOut> {
  return api.get<LoanDetailOut>(`/loans/${loanId}`);
}

export function listLoans(params?: {
  agent_id?: number;
  lender_id?: number;
}): Promise<LoanOut[]> {
  const search = new URLSearchParams();
  if (params?.agent_id != null) search.set("agent_id", String(params.agent_id));
  if (params?.lender_id != null) search.set("lender_id", String(params.lender_id));
  const qs = search.toString();
  return api.get<LoanOut[]>(`/loans${qs ? `?${qs}` : ""}`);
}
