import { api } from "./client";
import type {
  AgentOut,
  AgentRosterItem,
  AgentDetailOut,
  WalletOut,
  AgentScoreOut,
  TransactionOut,
} from "./types";

export function createAgent(name: string, description?: string): Promise<AgentOut> {
  return api.post<AgentOut>("/agents", {
    principal_id: 0, // ignored server-side; comes from JWT
    name,
    description: description ?? null,
  });
}

export async function signAgentMandate(
  agentId: number,
  bounds: string,
  signature: string,
  issuedAt: string
): Promise<AgentOut> {
  const result = await api.post<any>(`/agents/${agentId}/mandate`, {
    agent_id: agentId,
    bounds,
    issued_at: issuedAt,
    signature,
  });
  if (result && result.api_key) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(`credit-agents:agent-key:${agentId}`, result.api_key);
    }
  }
  return result;
}

export function listMyAgents(): Promise<AgentRosterItem[]> {
  return api.get<AgentRosterItem[]>("/agents");
}

export function getAgentDetail(agentId: number): Promise<AgentDetailOut> {
  return api.get<AgentDetailOut>(`/agents/${agentId}`);
}

export function getAgentWallet(agentId: number): Promise<WalletOut> {
  return api.get<WalletOut>(`/agents/${agentId}/wallet`);
}

export function getAgentLenderView(agentId: number): Promise<AgentDetailOut> {
  return api.get<AgentDetailOut>(`/agents/${agentId}/lender-view`);
}

export function getAgentScore(agentId: number): Promise<AgentScoreOut> {
  return api.get<AgentScoreOut>(`/agents/${agentId}/score`);
}

export function revokeAgentAsPrincipal(
  agentId: number,
  reason = "principal-initiated revocation"
): Promise<AgentOut> {
  return api.post<AgentOut>(`/agents/${agentId}/revoke`, { reason });
}

export function setCreditLimit(
  agentId: number,
  creditLimit: number | null
): Promise<AgentOut> {
  return api.put<AgentOut>(`/agents/${agentId}/credit-limit`, {
    credit_limit: creditLimit,
  });
}

export function getAgentTransactions(agentId: number): Promise<TransactionOut[]> {
  return api.get<TransactionOut[]>(`/agents/${agentId}/transactions`);
}

