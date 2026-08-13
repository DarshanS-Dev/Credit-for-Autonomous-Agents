// credit-app/src/lib/api/client.ts
"use client";

import { loadSession } from "@/lib/session";

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, detail: unknown) {
    const message =
      typeof detail === "string"
        ? detail
        : detail && typeof detail === "object" && "detail" in (detail as any)
        ? String((detail as any).detail)
        : `Request failed with status ${status}`;
    super(message);
    this.status = status;
    this.detail = detail;
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** Explicit bearer token override — used by operator.ts which juggles two identities. */
  token?: string;
  /** Skip attaching Authorization header entirely (signup/login). */
  skipAuth?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, token, skipAuth = false } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (!skipAuth) {
    const bearer = token ?? loadSession()?.token;
    if (bearer) headers["Authorization"] = `Bearer ${bearer}`;
  }

  if (typeof window !== "undefined" && method === "POST") {
    let matchedAgentId: string | null = null;
    if (path.startsWith("/loans/")) {
      const parts = path.split("/");
      if (parts.length === 3 && /^\d+$/.test(parts[2])) {
        matchedAgentId = parts[2];
      }
    } else if (path.startsWith("/repayment/")) {
      const parts = path.split("/");
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last)) {
        matchedAgentId = last;
      }
    }
    if (matchedAgentId) {
      const agentKey = window.localStorage.getItem(`credit-agents:agent-key:${matchedAgentId}`);
      if (agentKey) {
        headers["X-Agent-Key"] = agentKey;
      }
    }
  }

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await res.json().catch(() => null) : null;

  if (!res.ok) {
    throw new ApiError(res.status, payload);
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "method" | "body">) =>
    apiFetch<T>(path, { ...options, method: "PUT", body }),
};