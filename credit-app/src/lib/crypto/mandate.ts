// credit-app/src/lib/crypto/mandate.ts
"use client";

import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";

// @noble/ed25519 v2 requires wiring a sha512 implementation for its sync
// API (getPublicKey/sign/verify). Without this, calls throw at runtime.
ed.etc.sha512Sync = (...msgs: Uint8Array[]) => sha512(ed.etc.concatBytes(...msgs));

export interface GeneratedKeypair {
  privateKeyHex: string;
  publicKeyHex: string;
  publicKeyB64: string;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 ? `0${hex}` : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Generates a fresh Ed25519 keypair entirely in-browser. Mirrors what
 * credential_service.generate_keypair() does server-side for SEED-ONLY demo
 * accounts — here it's the real client-side flow: the private key is
 * returned to the caller to persist locally (session.ts) and is never sent
 * to the backend. Only publicKeyB64 is ever transmitted (at signup, as
 * Principal.public_key).
 */
export function generatePrincipalKeypair(): GeneratedKeypair {
  const privateKey = ed.utils.randomPrivateKey();
  const publicKey = ed.getPublicKey(privateKey);
  return {
    privateKeyHex: bytesToHex(privateKey),
    publicKeyHex: bytesToHex(publicKey),
    publicKeyB64: bytesToBase64(publicKey),
  };
}

/**
 * Byte-for-byte port of backend/app/services/credential_service.py's
 * canonicalize_mandate(). Must match exactly or verify_mandate() will
 * reject the signature — Ed25519 verification fails on any byte diff.
 *
 * Python:
 *   payload = {"principal_id": ..., "agent_id": ..., "bounds": ...,
 *              "issued_at": issued_at.astimezone(timezone.utc).isoformat()}
 *   json.dumps(payload, sort_keys=True, separators=(",", ":"))
 *
 * Key order alphabetical: agent_id, bounds, issued_at, principal_id.
 * issuedAtIso must already be the exact UTC ISO-8601 string this signature
 * is for (see buildIssuedAtIso below) — ASCII bounds text assumed; Python's
 * default ensure_ascii=True would \\u-escape non-ASCII chars where JS
 * JSON.stringify does not, so keep `bounds` to plain ASCII.
 */
export function canonicalizeMandate(
  principalId: number,
  agentId: number,
  bounds: string,
  issuedAtIso: string
): Uint8Array {
  const json =
    `{"agent_id":${agentId}` +
    `,"bounds":${JSON.stringify(bounds)}` +
    `,"issued_at":${JSON.stringify(issuedAtIso)}` +
    `,"principal_id":${principalId}}`;
  return new TextEncoder().encode(json);
}

/**
 * Formats a Date to match Python's `datetime.astimezone(timezone.utc).isoformat()`
 * as closely as JS timestamp precision allows (milliseconds, padded to
 * Python's 6-digit microsecond field) — e.g. "2026-08-02T04:39:22.308000+00:00".
 *
 * NOTE: the client-generated issued_at IS passed to and used by the backend.
 * `DelegationMandateSign.issued_at` (schemas.py) is accepted from the POST
 * body, passed directly into `verify_mandate()` (agents.py:121), and fed into
 * `canonicalize_mandate()` (credential_service.py:70) — so the byte string
 * the server re-verifies against is built from this exact value.
 * This function formats the timestamp to match Python's
 * `datetime.astimezone(timezone.utc).isoformat()` output precisely.
 */
export function buildIssuedAtIso(date: Date = new Date()): string {
  const iso = date.toISOString(); // "2026-08-02T04:39:22.308Z"
  const [datePart, msAndZ] = iso.split(".");
  const ms = msAndZ.replace("Z", "");
  const microseconds = `${ms}000`; // pad ms(3) -> "micro"(6), best precision JS has
  return `${datePart}.${microseconds}+00:00`;
}

export interface SignedMandate {
  bounds: string;
  issuedAtIso: string;
  signatureB64: string;
}

/**
 * Signs the canonical mandate payload with the principal's locally-held
 * private key. Returns everything the /agents/{id}/mandate endpoint needs
 * in its current schema (bounds, signature) plus the issuedAtIso we signed
 * against, in case a future schema update accepts it (see mandate.ts
 * top-of-file note and api/agents.ts).
 */
export function signMandate(
  privateKeyHex: string,
  principalId: number,
  agentId: number,
  bounds: string,
  issuedAtDate: Date = new Date()
): SignedMandate {
  const issuedAtIso = buildIssuedAtIso(issuedAtDate);
  const message = canonicalizeMandate(principalId, agentId, bounds, issuedAtIso);
  const signature = ed.sign(message, hexToBytes(privateKeyHex));
  return {
    bounds,
    issuedAtIso,
    signatureB64: bytesToBase64(signature),
  };
}

export { bytesToBase64, base64ToBytes, bytesToHex, hexToBytes };