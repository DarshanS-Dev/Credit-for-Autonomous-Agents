import { api } from "./client";
import type { LenderOut, ExposureStats, AgentRosterItem } from "./types";

export interface LenderPolicyPayload {
  max_exposure_per_agent: number;
  total_platform_exposure_cap: number;
  min_score_required: number;
  allowed_agent_categories: string[];
}

export function getLenderProfile(): Promise<LenderOut> {
  return api.get<LenderOut>("/lenders/me");
}

export function updateLenderPolicy(payload: LenderPolicyPayload): Promise<LenderOut> {
  return api.put<LenderOut>("/lenders/policy", payload);
}

export function getExposureStats(token?: string): Promise<ExposureStats> {
  return api.get<ExposureStats>("/lenders/exposure", { token });
}

export function listLenderAgents(token?: string): Promise<AgentRosterItem[]> {
  return api.get<AgentRosterItem[]>("/lenders/agents", { token });
}
