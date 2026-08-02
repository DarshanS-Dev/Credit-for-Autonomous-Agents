/** Canonical mandate bounds text — must stay ASCII for JSON canonicalization parity with Python. */
export const DEFAULT_MANDATE_BOUNDS =
  "[MANDATE TERM A] Maximum credit requested per request: $5,000. " +
  "[MANDATE TERM B] Automated repayment wallet sweep allowed at task success. " +
  "[MANDATE TERM C] Principal remains human point of contact for dispute resolution.";

export const PENDING_ROLE_KEY = "credit-agents:pending-role";

/** Demo lender id for loan requests when no public lender list exists. */
export const DEMO_LENDER_ID = Number(
  process.env.NEXT_PUBLIC_DEMO_LENDER_ID ?? "1"
);

export const DEMO_PRINCIPAL_EMAIL =
  process.env.NEXT_PUBLIC_DEMO_PRINCIPAL_EMAIL ?? "demo-principal@credit.local";
export const DEMO_PRINCIPAL_PASSWORD =
  process.env.NEXT_PUBLIC_DEMO_PRINCIPAL_PASSWORD ?? "demo-principal";

export const DEMO_LENDER_EMAIL =
  process.env.NEXT_PUBLIC_DEMO_LENDER_EMAIL ?? "demo-lender@credit.local";
export const DEMO_LENDER_PASSWORD =
  process.env.NEXT_PUBLIC_DEMO_LENDER_PASSWORD ?? "demo-lender";
