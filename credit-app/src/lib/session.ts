// credit-app/src/lib/session.ts
"use client";

export type SessionRole = "principal" | "lender";

export interface Session {
  token: string;
  role: SessionRole;
  id: number;
  name: string;
  email: string;
}

const SESSION_KEY = "credit-agents:session";
const PRINCIPAL_KEYPAIR_PREFIX = "credit-agents:principal-keypair:";

// ---------- Session (auth token) ----------

export function saveSession(session: Session): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}

// ---------- Principal keypair ----------
// The principal's Ed25519 private key never leaves the browser (matches
// credential_service.py's stated trust model). Stored per-principal-id so
// switching accounts on the same device doesn't clobber a previous key.

export interface StoredKeypair {
  privateKeyHex: string;
  publicKeyHex: string;
}

export function savePrincipalKeypair(principalId: number, keypair: StoredKeypair): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    `${PRINCIPAL_KEYPAIR_PREFIX}${principalId}`,
    JSON.stringify(keypair)
  );
}

export function loadPrincipalKeypair(principalId: number): StoredKeypair | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(`${PRINCIPAL_KEYPAIR_PREFIX}${principalId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredKeypair;
  } catch {
    return null;
  }
}