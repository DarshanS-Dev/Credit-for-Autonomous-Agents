import { api } from "./client";
import type { EventOut, PersonaTriggerResult } from "./types";

export function getOperatorEvents(tokenOrLimit?: string | number, limit = 50): Promise<EventOut[]> {
  if (typeof tokenOrLimit === "number") {
    return api.get<EventOut[]>(`/operator/events?limit=${tokenOrLimit}`);
  }
  return api.get<EventOut[]>(`/operator/events?limit=${limit}`, {
    token: tokenOrLimit,
  });
}

export function revokeAgent(
  agentId: number,
  reasonOrToken?: string,
): Promise<{ agent_id: number; status: string }> {
  // If it looks like a JWT token (contains dots), use it as auth token
  const isToken = reasonOrToken && reasonOrToken.includes(".");
  const token = isToken ? reasonOrToken : undefined;
  const reason = isToken ? "manual operator revocation" : (reasonOrToken ?? "manual operator revocation");
  return api.post<{ agent_id: number; status: string }>(
    `/operator/agents/${agentId}/revoke?reason=${encodeURIComponent(reason)}`,
    undefined,
    { token },
  );
}

export function triggerPersona(
  persona: "established" | "new" | "misbehaving"
): Promise<PersonaTriggerResult> {
  return api.post<PersonaTriggerResult>("/operator/persona-trigger", { persona });
}
