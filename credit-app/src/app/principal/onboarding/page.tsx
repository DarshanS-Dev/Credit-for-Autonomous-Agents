"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Doodle } from "@/components/ui/Doodle";
import { motion } from "framer-motion";
import { gsap } from "gsap";
import { useSession } from "@/context/SessionContext";
import { createAgent, signAgentMandate, getAgentWallet } from "@/lib/api/agents";
import { signMandate } from "@/lib/crypto/mandate";
import { loadPrincipalKeypair } from "@/lib/session";
import { DEFAULT_MANDATE_BOUNDS } from "@/lib/constants";
import { formatCurrency, toNumber } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";

export default function PrincipalOnboarding() {
  const router = useRouter();
  const { session } = useSession();
  const [step, setStep] = useState(1);
  const [agentName, setAgentName] = useState("");
  const [description, setDescription] = useState("");
  const [createdAgentId, setCreatedAgentId] = useState<number | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [mandateSigned, setMandateSigned] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => createAgent(agentName, description),
    onSuccess: (agent) => {
      setCreatedAgentId(agent.id);
      setStep(2);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Failed to create agent");
    },
  });

  const signMutation = useMutation({
    mutationFn: async () => {
      if (!session || createdAgentId == null) throw new Error("Missing session or agent");
      const keypair = loadPrincipalKeypair(session.id);
      if (!keypair) throw new Error("No signing key found — log out and sign up again as principal");
      const signed = signMandate(
        keypair.privateKeyHex,
        session.id,
        createdAgentId,
        DEFAULT_MANDATE_BOUNDS
      );
      return signAgentMandate(createdAgentId, signed.bounds, signed.signatureB64, signed.issuedAtIso);
    },
    onSuccess: (data: any) => {
      setMandateSigned(true);
      if (data && data.api_key) {
        setApiKey(data.api_key);
      }
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Mandate signing failed");
    },
  });

  const walletMutation = useMutation({
    mutationFn: () => {
      if (createdAgentId == null) throw new Error("No agent");
      return getAgentWallet(createdAgentId);
    },
    onSuccess: (wallet) => {
      setWalletBalance(toNumber(wallet.spendable_balance));
      const curtain = document.createElement("div");
      curtain.className = "fixed inset-0 bg-base z-50 transform translate-x-full";
      document.body.appendChild(curtain);
      gsap.timeline({
        onComplete: () => {
          router.push("/principal/dashboard");
          setTimeout(() => curtain.remove(), 100);
        },
      })
        .to(curtain, { x: "0%", duration: 0.6, ease: "power4.inOut" })
        .to(curtain, { x: "-100%", duration: 0.6, ease: "power4.inOut" }, "+=0.2");
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Failed to load wallet");
    },
  });

  const handleCreateAgent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentName) return;
    createMutation.mutate();
  };

  return (
    <div className="flex-1 bg-editorial-grid py-12 px-6 font-mono text-text-primary">
      <div className="max-w-4xl mx-auto">
        <div className="mb-12 border-b border-text-secondary/15 pb-6">
          <h1 className="font-mono text-xs uppercase tracking-widest text-accent font-bold mb-3">
            Principal Onboarding
          </h1>
          <h2 className="font-mono text-3xl font-extrabold uppercase flex items-center gap-3">
            Issue a delegation credential <Doodle type="motion" size={24} />
          </h2>
        </div>

        {error && (
          <p className="mb-4 font-mono text-xs text-danger border border-danger/30 bg-danger/5 p-3">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-7 space-y-6">
            {step === 1 && (
              <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="bg-[#F5F5F0] border-2 border-text-primary p-8">
                <h3 className="font-mono text-sm font-bold uppercase mb-6">Step 1 — Register your agent</h3>
                <form onSubmit={handleCreateAgent} className="space-y-4">
                  <input
                    type="text"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value)}
                    placeholder="e.g. Content-Scheduler-09"
                    className="w-full px-4 py-3 bg-transparent border border-text-secondary/35 font-mono text-sm"
                    required
                  />
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Agent purpose..."
                    className="w-full h-24 px-4 py-3 bg-transparent border border-text-secondary/35 font-mono text-sm"
                  />
                  <Button type="submit" variant="primary" className="w-full" disabled={createMutation.isPending}>
                    {createMutation.isPending ? "Creating..." : "Continue to Mandate"}
                  </Button>
                </form>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="bg-[#F5F5F0] border-2 border-text-primary p-8">
                <h3 className="font-mono text-sm font-bold uppercase mb-4">Step 2 — Sign the delegation mandate</h3>
                <div className="bg-text-primary/5 p-4 border font-mono text-xs text-text-secondary mb-4">
                  <p><strong>Created Agent ID:</strong> {createdAgentId}</p>
                </div>
                <div className="bg-text-primary/5 p-4 border font-mono text-xs text-text-secondary mb-6">
                  <p>{DEFAULT_MANDATE_BOUNDS}</p>
                </div>
                {!mandateSigned ? (
                  <Button variant="primary" onClick={() => signMutation.mutate()} className="w-full" disabled={signMutation.isPending}>
                    {signMutation.isPending ? "Signing..." : "Sign Mandate"}
                  </Button>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-center gap-3 py-3 border-2 border-text-primary bg-text-primary/5 text-emerald-600">
                      <span>✔</span>
                      <span>Mandate signed. Credential link established.</span>
                    </div>
                    {apiKey && (
                      <div className="bg-text-primary/5 p-4 border text-left font-mono text-xs space-y-2">
                        <p className="break-all"><strong>Agent API Key (X-Agent-Key):</strong> <code>{apiKey}</code></p>
                        <p className="text-[10px] text-text-secondary">⚠️ Save this key now. It will not be shown again.</p>
                        <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(apiKey)}>
                          Copy Key
                        </Button>
                      </div>
                    )}
                    <Button variant="primary" onClick={() => setStep(3)} className="w-full">
                      Continue to Step 3
                    </Button>
                  </div>
                )}
              </motion.div>
            )}

            {step === 3 && (
              <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="bg-[#F5F5F0] border-2 border-text-primary p-8">
                <h3 className="font-mono text-sm font-bold uppercase mb-4">Step 3 — Confirm payout wallet</h3>
                <p className="text-sm text-text-secondary mb-6">
                  Wallet was auto-created at agent registration. Confirm to proceed.
                </p>
                {walletBalance != null ? (
                  <p className="font-mono text-sm">Balance: ${formatCurrency(walletBalance)}</p>
                ) : (
                  <Button variant="primary" onClick={() => walletMutation.mutate()} className="w-full" disabled={walletMutation.isPending}>
                    {walletMutation.isPending ? "Loading..." : "Confirm Wallet & Finish"}
                  </Button>
                )}
              </motion.div>
            )}
          </div>

          <div className="md:col-span-5">
            <Card role="principal" className="font-mono text-xs uppercase space-y-4">
              <h4 className="font-bold border-b pb-2">CREDENTIAL STATUS</h4>
              <div className="flex justify-between">
                <span>1. Agent Registration:</span>
                <span>{agentName ? "RESOLVED" : "PENDING"}</span>
              </div>
              <div className="flex justify-between">
                <span>2. Signed Mandate:</span>
                <span>{mandateSigned ? "RESOLVED" : "PENDING"}</span>
              </div>
              <div className="flex justify-between">
                <span>3. Wallet Confirmed:</span>
                <span>{walletBalance != null ? "RESOLVED" : "PENDING"}</span>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
