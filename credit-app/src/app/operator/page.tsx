"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getOperatorEvents, triggerPersonaFlow, bootstrapDemoTokens, DemoTokens, revokeAgent, triggerPersona } from "@/lib/api/operator";
import { listLenderAgents, getExposureStats, getInsurancePool } from "@/lib/api/lenders";
import type { PersonaTriggerResult } from "@/lib/api/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Doodle } from "@/components/ui/Doodle";
import { Modal } from "@/components/ui/Modal";
import { StickyNote } from "@/components/ui/StickyNote";
import { motion } from "framer-motion";

export default function OperatorConsole() {
  const queryClient = useQueryClient();
  const [tokens, setTokens] = useState<DemoTokens | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [isKillModalOpen, setIsKillModalOpen] = useState(false);

  const [loadingPersona, setLoadingPersona] = useState<string | null>(null);
  const [successPersona, setSuccessPersona] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<PersonaTriggerResult | null>(null);

  useEffect(() => {
    bootstrapDemoTokens().then(setTokens);
  }, []);

  const { data: events = [] } = useQuery({
    queryKey: ['operator-events-console'],
    queryFn: () => getOperatorEvents(tokens?.lender.access_token),
    enabled: !!tokens?.lender.access_token,
    refetchInterval: 3000,
  });

  const { data: activeAgents = [] } = useQuery({
    queryKey: ['lender-agents-console'],
    queryFn: () => listLenderAgents(tokens?.lender.access_token),
    enabled: !!tokens?.lender.access_token,
    refetchInterval: 5000,
  });
  
  const { data: stats } = useQuery({
    queryKey: ['lender-exposure-console'],
    queryFn: () => getExposureStats(tokens?.lender.access_token),
    enabled: !!tokens?.lender.access_token,
    refetchInterval: 5000,
  });

  const { data: insurancePool } = useQuery({
    queryKey: ['insurance-pool-console'],
    queryFn: () => getInsurancePool(),
    refetchInterval: 5000,
  });

  const handleTrigger = async (type: "established" | "new" | "misbehaving" | "llm") => {
    if (type === "llm") return;
    setLoadingPersona(type);
    try {
      const result = await triggerPersona(type);
      setLastResult(result);
      setSuccessPersona(type);
      queryClient.invalidateQueries({ queryKey: ['operator-events-console'] });
      queryClient.invalidateQueries({ queryKey: ['lender-agents-console'] });
      queryClient.invalidateQueries({ queryKey: ['insurance-pool-console'] });
      setTimeout(() => setSuccessPersona(null), 3000);
    } finally {
      setLoadingPersona(null);
    }
  };

  const handleKillSwitch = async () => {
    if (!selectedAgentId || !tokens) return;
    try {
      await revokeAgent(parseInt(selectedAgentId, 10), tokens.lender.access_token);
      queryClient.invalidateQueries({ queryKey: ['lender-agents-console'] });
    } finally {
      setIsKillModalOpen(false);
      setSelectedAgentId("");
    }
  };

  const selectableAgents = activeAgents.filter((a) => a.status.toLowerCase() !== "revoked");
  
  const affectedLoansCount = selectedAgentId 
    ? events.filter(e => e.agent_id === parseInt(selectedAgentId, 10) && e.event_type === "loan_approved").length
    : 0;

  return (
    <div className="flex-1 bg-editorial-grid py-10 px-6 font-mono text-text-primary">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="border-b border-text-secondary/15 pb-6">
          <h1 className="font-mono text-xs uppercase tracking-widest text-accent font-bold mb-1">
            DEMO MANAGEMENT SURFACE
          </h1>
          <h2 className="font-mono text-3xl font-extrabold text-text-primary uppercase flex items-center gap-3">
            Operator Console <Doodle type="scribble" size={24} />
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left panel: Persona triggers */}
          <div className="lg:col-span-4 space-y-6">
            <Card role="principal" className="space-y-6">
              <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-text-primary border-b border-text-secondary/10 pb-2">
                Persona Triggers
              </h3>

              <div className="space-y-3 font-mono text-xs">
                {/* 1. Established agent */}
                <Button 
                  variant="primary" 
                  className="w-full flex items-center justify-between py-4"
                  onClick={() => handleTrigger("established")}
                  disabled={!!loadingPersona || !tokens}
                >
                  <span>Established agent — clean history</span>
                  {loadingPersona === "established" ? (
                    <span className="animate-spin h-4 w-4 border-2 border-surface border-t-transparent rounded-full" />
                  ) : successPersona === "established" ? (
                    <span className="text-accent font-bold">✔</span>
                  ) : (
                    <Icon name="chevron-right" size={16} />
                  )}
                </Button>

                {/* 2. New agent */}
                <Button 
                  variant="primary" 
                  className="w-full flex items-center justify-between py-4 bg-accent text-text-primary hover:text-surface"
                  onClick={() => handleTrigger("new")}
                  disabled={!!loadingPersona || !tokens}
                >
                  <span>New agent — no history</span>
                  {loadingPersona === "new" ? (
                    <span className="animate-spin h-4 w-4 border-2 border-text-primary border-t-transparent rounded-full" />
                  ) : successPersona === "new" ? (
                    <span className="font-bold">✔</span>
                  ) : (
                    <Icon name="chevron-right" size={16} />
                  )}
                </Button>

                {/* 3. Misbehaving agent */}
                <Button 
                  variant="danger" 
                  className="w-full flex items-center justify-between py-4"
                  onClick={() => handleTrigger("misbehaving")}
                  disabled={!!loadingPersona || !tokens}
                >
                  <span>Misbehaving agent</span>
                  {loadingPersona === "misbehaving" ? (
                    <span className="animate-spin h-4 w-4 border-2 border-surface border-t-transparent rounded-full" />
                  ) : successPersona === "misbehaving" ? (
                    <span className="font-bold">✔</span>
                  ) : (
                    <Icon name="chevron-right" size={16} />
                  )}
                </Button>
              </div>
            </Card>

            {/* Manual Override revocation panel */}
            <Card role="none" className="space-y-4 border border-danger/20">
              <h3 className="font-mono text-xs uppercase tracking-widest text-danger font-bold border-b border-danger/10 pb-2">
                Manual Override
              </h3>
              
              <div className="space-y-3 font-mono text-xs">
                <div>
                  <label className="block text-text-secondary uppercase mb-2">Select Agent</label>
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="w-full px-3 py-2 bg-transparent border border-text-secondary/35 text-text-primary font-mono text-xs uppercase focus:outline-none"
                  >
                    <option value="" className="bg-surface text-text-primary">-- Select active agent --</option>
                    {selectableAgents.map((a) => (
                      <option key={a.id} value={a.id} className="bg-surface text-text-primary">
                        {a.name} ({a.status})
                      </option>
                    ))}
                  </select>
                </div>

                <Button 
                  variant="danger" 
                  onClick={() => setIsKillModalOpen(true)}
                  disabled={!selectedAgentId}
                  className="w-full py-2"
                >
                  Fire Kill Switch
                </Button>
              </div>
            </Card>
          </div>

          {/* Right panel: Live outcomes feed & Status metrics */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Exposure Status metrics */}
            <div className="flex flex-wrap md:grid md:grid-cols-3 gap-6">
              <StickyNote rotationDeg={-1} bgColor="bg-[var(--primary-yellow)]">
                <span className="block text-[9px] text-text-primary/70 uppercase">Active Agents</span>
                <span className="text-xl font-bold flex items-center gap-1">
                  {stats?.active_count || 0} <Doodle type="motion" size={14} />
                </span>
              </StickyNote>
              <StickyNote rotationDeg={1} bgColor="bg-[var(--cream)]">
                <span className="block text-[9px] text-text-primary/70 uppercase">Total Defaulted</span>
                <span className="text-xl font-bold text-[var(--status-red)]">
                  {stats?.defaulted_count || 0}
                </span>
              </StickyNote>
              <StickyNote rotationDeg={-2} bgColor="bg-[var(--status-teal)]" className="text-white">
                <span className="block text-[9px] text-white/70 uppercase">Exposure Balance</span>
                <span className="text-xl font-bold flex items-center gap-1">
                  ${(stats?.total_capital_out || 0).toLocaleString()} <Doodle type="sparkle" size={14} />
                </span>
              </StickyNote>
            </div>

            {/* Live outcome events stream list */}
            <Card role="none" className="space-y-4">
              <h3 className="font-mono text-xs uppercase tracking-widest text-text-secondary font-bold border-b border-text-secondary/10 pb-2">
                Live outcome feed
              </h3>

              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {events.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="p-3 border-b border-text-primary/10 flex items-center justify-between font-mono text-xs bg-transparent"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${
                        item.event_type === "loan_approved" ? "bg-[var(--status-teal)] animate-pulse" : 
                        item.event_type.includes("defaulted") || item.event_type.includes("revoked") ? "bg-[var(--status-red)]" : 
                        item.event_type.includes("anomaly") ? "bg-[var(--primary-yellow)]" : "bg-text-secondary"
                      }`} />
                      <span className="text-text-primary border border-text-primary px-1">{item.event_type} - {item.detail}</span>
                    </div>
                    <span className="text-[10px] text-text-secondary/60">{new Date(item.created_at).toLocaleString()}</span>
                  </motion.div>
                ))}
              </div>
            </Card>

            {/* Insurance Pool */}
            <div className="p-4 border-2 border-accent bg-accent/5 text-text-primary font-mono">
              <span className="block text-[9px] text-text-primary/70 uppercase">Insurance Pool Balance</span>
              <span className="text-xl font-bold flex items-center gap-1">
                ${insurancePool ? Number(insurancePool.balance).toLocaleString() : '0'} <Doodle type="sparkle" size={14} />
              </span>
            </div>

            {/* Last Persona Result */}
            {lastResult && (
              <Card role="none" className="space-y-3 border border-accent/30">
                <h3 className="font-mono text-xs uppercase tracking-widest text-accent font-bold border-b border-accent/10 pb-2">
                  Last Trigger Result
                </h3>
                <div className="font-mono text-xs text-text-secondary space-y-2">
                  <div className="flex justify-between"><span className="uppercase">Persona</span><span className="font-bold text-text-primary">{lastResult.persona}</span></div>
                  <div className="flex justify-between"><span className="uppercase">Agent #{lastResult.agent_id}</span><span className="font-bold text-text-primary">{lastResult.agent_status}</span></div>
                  {lastResult.loan_id && <div className="flex justify-between"><span className="uppercase">Loan #{lastResult.loan_id}</span><span className="font-bold text-text-primary">{lastResult.loan_status}</span></div>}
                  {lastResult.is_cold_start && <span className="inline-block bg-accent/10 border border-accent/30 px-2 py-0.5 text-[10px] uppercase font-bold">Cold-start</span>}
                  <p className="text-[11px] text-text-secondary border-t border-text-secondary/10 pt-2 mt-1">{lastResult.explanation}</p>
                </div>
              </Card>
            )}

          </div>

        </div>

      </div>

      {/* Revocation modal */}
      <Modal
        isOpen={isKillModalOpen}
        onClose={() => setIsKillModalOpen(false)}
        title="Fire Credential Kill Switch?"
        description={`Revoke this agent's credential now? This bypasses the scripted flow and cannot be undone.`}
        confirmLabel="Fire Kill Switch"
        cancelLabel="Cancel"
        onConfirm={handleKillSwitch}
        severity="danger"
      >
        <div className="p-4 bg-[var(--status-red)]/10 border-l-4 border-[var(--status-red)] text-text-primary font-mono text-sm mb-4">
          <p className="font-bold text-[var(--status-red)] mb-1">Blast Radius:</p>
          <p>This will permanently revoke Agent #{selectedAgentId}.</p>
          {affectedLoansCount > 0 && (
            <p className="mt-1 font-bold">This will affect {affectedLoansCount} known active loan(s).</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
