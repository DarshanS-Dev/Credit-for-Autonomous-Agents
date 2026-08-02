import { api } from "./client";
import type {
  AgentOut,
  AgentRosterItem,
  AgentDetailOut,
  WalletOut,
  AgentScoreOut,
} from "./types";

export function createAgent(name: string, description?: string): Promise<AgentOut> {
  return api.post<AgentOut>("/agents", {
    principal_id: 0, // ignored server-side; comes from JWT
    name,
    description: description ?? null,
  });
}

export function signAgentMandate(
  agentId: number,
  bounds: string,
  signature: string
): Promise<AgentOut> {
  return api.post<AgentOut>(`/agents/${agentId}/mandate`, {
    agent_id: agentId,
    bounds,
    signature,
  });
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
