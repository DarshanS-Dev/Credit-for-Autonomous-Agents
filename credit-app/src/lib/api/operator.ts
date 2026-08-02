"use client";

import { login, signup } from "./auth";
import { requestLoan } from "./loans";
import { checkSpend } from "./repayment";
import { api } from "./client";
import {
  DEMO_LENDER_ID,
  DEMO_LENDER_EMAIL,
  DEMO_LENDER_PASSWORD,
  DEMO_PRINCIPAL_EMAIL,
  DEMO_PRINCIPAL_PASSWORD,
  DEFAULT_MANDATE_BOUNDS,
} from "@/lib/constants";
import { generatePrincipalKeypair, signMandate } from "@/lib/crypto/mandate";
import {
  savePrincipalKeypair,
  loadPrincipalKeypair,
  type StoredKeypair,
} from "@/lib/session";
import type { AgentOut, TokenResponse } from "./types";

const DEMO_TOKENS_KEY = "credit-agents:demo-tokens";

export interface DemoTokens {
  principal: TokenResponse;
  lender: TokenResponse;
}

export async function bootstrapDemoTokens(): Promise<DemoTokens> {
  if (typeof window !== "undefined") {
    const cached = window.sessionStorage.getItem(DEMO_TOKENS_KEY);
    if (cached) {
      try {
        return JSON.parse(cached) as DemoTokens;
      } catch {
        /* refresh below */
      }
    }
  }

  const principal = await login({
    role: "principal",
    email: DEMO_PRINCIPAL_EMAIL,
    password: DEMO_PRINCIPAL_PASSWORD,
  }).catch(() => signupDemoPrincipal());

  const lender = await login({
    role: "lender",
    email: DEMO_LENDER_EMAIL,
    password: DEMO_LENDER_PASSWORD,
  }).catch(() => signupDemoLender());

  const tokens: DemoTokens = { principal, lender };
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(DEMO_TOKENS_KEY, JSON.stringify(tokens));
  }
  return tokens;
}

async function signupDemoPrincipal(): Promise<TokenResponse> {
  const keypair = generatePrincipalKeypair();
  const result = await signup({
    role: "principal",
    name: "Demo Principal",
    email: DEMO_PRINCIPAL_EMAIL,
    password: DEMO_PRINCIPAL_PASSWORD,
    public_key: keypair.publicKeyB64,
  });
  savePrincipalKeypair(result.id, {
    privateKeyHex: keypair.privateKeyHex,
    publicKeyHex: keypair.publicKeyHex,
  });
  return result;
}

async function signupDemoLender(): Promise<TokenResponse> {
  return signup({
    role: "lender",
    name: "Demo Lender",
    email: DEMO_LENDER_EMAIL,
    password: DEMO_LENDER_PASSWORD,
  });
}

export type PersonaType = "established" | "new" | "misbehaving";

const PERSONA_CONFIG: Record<
  PersonaType,
  { namePrefix: string; amount: number; recipient: string; category: string }
> = {
  established: {
    namePrefix: "Stable-Procure",
    amount: 2500,
    recipient: "vendor-supply-chain.example",
    category: "content",
  },
  new: {
    namePrefix: "Cold-Start",
    amount: 200,
    recipient: "dataset-packager.example",
    category: "devops",
  },
  misbehaving: {
    namePrefix: "Erratic-Trader",
    amount: 1500,
    recipient: "defi-pool.example",
    category: "arbitrage",
  },
};

async function createAgentWithToken(
  name: string,
  principalToken: string
): Promise<AgentOut> {
  return api.post<AgentOut>(
    "/agents",
    { principal_id: 0, name },
    { token: principalToken }
  );
}

async function signMandateWithToken(
  agentId: number,
  principalId: number,
  principalToken: string
): Promise<void> {
  let keypair: StoredKeypair | null = loadPrincipalKeypair(principalId);
  if (!keypair) {
    const generated = generatePrincipalKeypair();
    keypair = {
      privateKeyHex: generated.privateKeyHex,
      publicKeyHex: generated.publicKeyHex,
    };
    savePrincipalKeypair(principalId, keypair);
  }

  const signed = signMandate(
    keypair.privateKeyHex,
    principalId,
    agentId,
    DEFAULT_MANDATE_BOUNDS
  );

  await api.post(
    `/agents/${agentId}/mandate`,
    { agent_id: agentId, bounds: signed.bounds, signature: signed.signatureB64 },
    { token: principalToken }
  );
}

/** Create agent → sign mandate → request loan; misbehaving also triggers spend check. */
export async function triggerPersonaFlow(
  persona: PersonaType,
  tokens: DemoTokens
): Promise<{ agentId: number; loanId?: number }> {
  const cfg = PERSONA_CONFIG[persona];
  const suffix = Date.now().toString().slice(-4);
  const principalToken = tokens.principal.access_token;
  const principalId = tokens.principal.id;

  const agent = await createAgentWithToken(`${cfg.namePrefix}-${suffix}`, principalToken);
  await signMandateWithToken(agent.id, principalId, principalToken);

  const loan = await requestLoan(
    agent.id,
    {
      lender_id: DEMO_LENDER_ID,
      principal_amount: cfg.amount,
      approved_recipient: cfg.recipient,
      task_category: cfg.category,
    },
    principalToken
  );

  if (persona === "misbehaving" && loan.status === "approved") {
    await checkSpend(
      agent.id,
      cfg.amount * 2,
      "unverified-smart-contract.evil",
      principalToken
    );
  }

  return { agentId: agent.id, loanId: loan.id };
}

export { getOperatorEvents, revokeAgent, triggerPersona } from "./operator-actions";
