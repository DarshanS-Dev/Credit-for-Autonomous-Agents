"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useSession } from "@/context/SessionContext";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { motion, AnimatePresence } from "framer-motion";
import { createAgent, signAgentMandate } from "@/lib/api/agents";
import { signMandate } from "@/lib/crypto/mandate";
import { loadPrincipalKeypair } from "@/lib/session";
import { DEFAULT_MANDATE_BOUNDS } from "@/lib/constants";
import { ApiError } from "@/lib/api/client";

export default function AddNewAgent() {
  const router = useRouter();
  const { session } = useSession();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isCompleted, setIsCompleted] = useState(false);
  const [createdAgent, setCreatedAgent] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!session) throw new Error("Not authenticated");
      const agent = await createAgent(name, description);
      const keypair = loadPrincipalKeypair(session.id);
      if (!keypair) throw new Error("No signing key — log out and sign up again");
      const signed = signMandate(keypair.privateKeyHex, session.id, agent.id, DEFAULT_MANDATE_BOUNDS);
      const res = await signAgentMandate(agent.id, signed.bounds, signed.signatureB64, signed.issuedAtIso);
      return res; // returns AgentMandateOut which contains api_key
    },
    onSuccess: (data) => {
      setCreatedAgent(data);
      setIsCompleted(true);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Failed to register agent");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;
    mutation.mutate();
  };

  return (
    <div className="flex-1 bg-editorial-grid py-12 px-6">
      <div className="max-w-xl mx-auto space-y-8">
        <Link href="/principal/dashboard" className="inline-flex items-center gap-2 font-mono text-xs uppercase text-text-secondary hover:text-text-primary">
          <Icon name="arrow-left" size={14} /> Back to Dashboard
        </Link>

        <Card role="principal" className="space-y-6">
          <div className="border-b border-text-secondary/15 pb-4">
            <h1 className="font-mono text-xs uppercase text-accent font-bold mb-2">ADD NEW AGENT</h1>
            <h2 className="font-mono text-2xl font-bold uppercase">Register New Agent</h2>
          </div>

          {error && <p className="font-mono text-xs text-danger border border-danger/30 p-2">{error}</p>}

          <AnimatePresence mode="wait">
            {!isCompleted ? (
              <motion.form key="form" onSubmit={handleSubmit} className="space-y-4" exit={{ opacity: 0 }}>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Agent name"
                  className="w-full px-4 py-3 bg-transparent border border-text-secondary/35 font-mono text-sm"
                  required
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description"
                  className="w-full h-24 px-4 py-3 bg-transparent border border-text-secondary/35 font-mono text-sm"
                />
                <Button type="submit" variant="primary" className="w-full" disabled={mutation.isPending}>
                  {mutation.isPending ? "Signing mandate…" : "Sign delegation mandate"}
                </Button>
              </motion.form>
            ) : (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-12 text-center space-y-6">
                <Icon name="key" size={32} className="mx-auto text-text-primary" />
                <p className="font-mono text-sm font-bold text-emerald-600 uppercase">Agent registered successfully!</p>
                
                <div className="bg-text-primary/5 p-4 border text-left font-mono text-xs space-y-2">
                  <p><strong>Agent ID:</strong> {createdAgent?.id}</p>
                  {createdAgent?.api_key && (
                    <>
                      <p className="break-all"><strong>API Key (X-Agent-Key):</strong> <code>{createdAgent.api_key}</code></p>
                      <p className="text-[10px] text-text-secondary">⚠️ Save this key now. It will not be shown again.</p>
                      <Button variant="outline" size="sm" onClick={() => navigator.clipboard.writeText(createdAgent.api_key)}>
                        Copy Key
                      </Button>
                    </>
                  )}
                </div>

                <Button variant="primary" className="w-full" onClick={() => router.push("/principal/dashboard")}>
                  Back to dashboard
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>
    </div>
  );
}
