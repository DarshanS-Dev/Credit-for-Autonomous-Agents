import { api } from "./client";
import type { EventOut } from "./types";

export function getOperatorEvents(limit = 50): Promise<EventOut[]> {
  return api.get<EventOut[]>(`/operator/events?limit=${limit}`);
}

export function revokeAgent(
  agentId: number,
  reason = "manual operator revocation"
): Promise<{ agent_id: number; status: string }> {
  return api.post<{ agent_id: number; status: string }>(
    `/operator/agents/${agentId}/revoke?reason=${encodeURIComponent(reason)}`
  );
}
