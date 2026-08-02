"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getOperatorEvents, triggerPersonaFlow, bootstrapDemoTokens, DemoTokens, revokeAgent } from "@/lib/api/operator";
import { listLenderAgents, getExposureStats } from "@/lib/api/lenders";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Doodle } from "@/components/ui/Doodle";
import { Modal } from "@/components/ui/Modal";
import { motion } from "framer-motion";

export default function OperatorConsole() {
  const queryClient = useQueryClient();
  const [tokens, setTokens] = useState<DemoTokens | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [isKillModalOpen, setIsKillModalOpen] = useState(false);

  const [loadingPersona, setLoadingPersona] = useState<string | null>(null);
  const [successPersona, setSuccessPersona] = useState<string | null>(null);

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

  const handleTrigger = async (type: "established" | "new" | "misbehaving" | "llm") => {
    if (!tokens || type === "llm") return;
    setLoadingPersona(type);
    try {
      await triggerPersonaFlow(type, tokens);
      setSuccessPersona(type);
      queryClient.invalidateQueries({ queryKey: ['operator-events-console'] });
      setTimeout(() => setSuccessPersona(null), 2000);
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

                {/* 4. Live model decider */}
                <Button 
                  variant="ghost" 
                  className="w-full flex items-center justify-between py-4 border border-text-secondary/35 text-text-primary opacity-50 cursor-not-allowed"
                  onClick={() => handleTrigger("llm")}
                  disabled={true}
                >
                  <span>Misbehaving agent — live model call</span>
                  <Icon name="lock" size={16} />
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
                      <option key={a.agent_id} value={a.agent_id} className="bg-surface text-text-primary">
                        {a.agent_name} ({a.status})
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 border-2 border-text-primary bg-transparent text-text-primary font-mono">
                <span className="block text-[9px] text-text-primary/70 uppercase">Active Agents</span>
                <span className="text-xl font-bold flex items-center gap-1">
                  {stats?.active_agents || 0} <Doodle type="motion" size={14} />
                </span>
              </div>
              <div className="p-4 border-2 border-text-primary bg-transparent text-text-primary font-mono">
                <span className="block text-[9px] text-text-primary/70 uppercase">Total Defaulted</span>
                <span className="text-xl font-bold text-danger">
                  {stats?.defaulted_agents || 0}
                </span>
              </div>
              <div className="p-4 border-2 border-text-primary bg-transparent text-text-primary font-mono">
                <span className="block text-[9px] text-text-primary/70 uppercase">Exposure Balance</span>
                <span className="text-xl font-bold flex items-center gap-1">
                  ${(stats?.total_capital_out || 0).toLocaleString()} <Doodle type="sparkle" size={14} />
                </span>
              </div>
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
                      <span className={`h-2 w-2 rounded-none ${
                        item.event_type === "loan_issued" ? "bg-text-primary" : 
                        item.event_type.includes("defaulted") || item.event_type.includes("revoked") ? "bg-danger" : "bg-text-secondary"
                      }`} />
                      <span className="text-text-primary border border-text-primary px-1">{item.event_type} - {item.details}</span>
                    </div>
                    <span className="text-[10px] text-text-secondary/60">{new Date(item.created_at).toLocaleString()}</span>
                  </motion.div>
                ))}
              </div>
            </Card>

          </div>

        </div>

      </div>

      {/* Revocation modal */}
      <Modal
        isOpen={isKillModalOpen}
        onClose={() => setIsKillModalOpen(false)}
        title="Fire Credential Kill Switch?"
        description="Revoke this agent's credential now? This bypasses the scripted flow and cannot be undone."
        confirmLabel="Fire Kill Switch"
        cancelLabel="Cancel"
        onConfirm={handleKillSwitch}
        severity="danger"
      />
    </div>
  );
}
