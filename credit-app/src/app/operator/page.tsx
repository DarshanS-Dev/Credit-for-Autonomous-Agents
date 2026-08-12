"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getOperatorEvents,
  bootstrapDemoTokens,
  DemoTokens,
  revokeAgent,
  triggerPersona,
} from "@/lib/api/operator";
import { listLenderAgents, getExposureStats, getInsurancePool } from "@/lib/api/lenders";
import type { PersonaTriggerResult } from "@/lib/api/types";
import { Icon } from "@/components/ui/Icon";
import { Modal } from "@/components/ui/Modal";
import { motion, AnimatePresence } from "framer-motion";
import ShapeGrid from "@/components/ui/ShapeGrid";

const EVENT_DOT: Record<string, string> = {
  loan_approved: "bg-emerald-500",
  loan_denied: "bg-red-500",
  repayment_deducted: "bg-sky-500",
  anomaly_flagged: "bg-amber-500 animate-pulse",
  revoked: "bg-red-700",
  defaulted: "bg-red-700",
};

const EVENT_LABEL: Record<string, string> = {
  loan_approved: "text-emerald-700",
  loan_denied: "text-red-600",
  repayment_deducted: "text-sky-700",
  anomaly_flagged: "text-amber-700",
  revoked: "text-red-700",
  defaulted: "text-red-700",
};

const PERSONAS = [
  {
    id: "established" as const,
    label: "Established Agent",
    description: "Proven credit history · Above-threshold score",
    badge: "Good standing",
    badgeBg: "bg-emerald-100 text-emerald-800",
    bg: "bg-[#FDF3C8]",
    hover: "hover:bg-[#f5e497]",
    shadow: "shadow-[4px_4px_0px_rgba(27,23,34,1)]",
  },
  {
    id: "new" as const,
    label: "New Agent",
    description: "No credit history · Cold-start borrowing limit",
    badge: "Cold start",
    badgeBg: "bg-sky-100 text-sky-800",
    bg: "bg-[#E9EDF6]",
    hover: "hover:bg-[#D8DDF0]",
    shadow: "shadow-[4px_4px_0px_rgba(27,23,34,1)]",
  },
  {
    id: "misbehaving" as const,
    label: "Misbehaving Agent",
    description: "Overspend → anomaly flag → default → insurance payout",
    badge: "High risk",
    badgeBg: "bg-red-100 text-red-800",
    bg: "bg-[#FDECEA]",
    hover: "hover:bg-[#f7d5d2]",
    shadow: "shadow-[4px_4px_0px_rgba(139,67,67,1)]",
  },
];

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
    queryKey: ["operator-events-console"],
    queryFn: () => getOperatorEvents(tokens?.lender.access_token),
    enabled: !!tokens?.lender.access_token,
    refetchInterval: 3000,
  });

  const { data: agents = [] } = useQuery({
    queryKey: ["lender-agents-console"],
    queryFn: () => listLenderAgents(tokens?.lender.access_token),
    enabled: !!tokens?.lender.access_token,
    refetchInterval: 5000,
  });

  const { data: stats } = useQuery({
    queryKey: ["lender-exposure-console"],
    queryFn: () => getExposureStats(tokens?.lender.access_token),
    enabled: !!tokens?.lender.access_token,
    refetchInterval: 5000,
  });

  const { data: insurancePool } = useQuery({
    queryKey: ["insurance-pool-console"],
    queryFn: () => getInsurancePool(),
    refetchInterval: 5000,
  });

  const handleTrigger = async (type: "established" | "new" | "misbehaving") => {
    setLoadingPersona(type);
    try {
      const result = await triggerPersona(type);
      setLastResult(result);
      setSuccessPersona(type);
      queryClient.invalidateQueries({ queryKey: ["operator-events-console"] });
      queryClient.invalidateQueries({ queryKey: ["lender-agents-console"] });
      queryClient.invalidateQueries({ queryKey: ["insurance-pool-console"] });
      setTimeout(() => setSuccessPersona(null), 3000);
    } finally {
      setLoadingPersona(null);
    }
  };

  const handleKillSwitch = async () => {
    if (!selectedAgentId || !tokens) return;
    try {
      await revokeAgent(parseInt(selectedAgentId, 10), tokens.lender.access_token);
      queryClient.invalidateQueries({ queryKey: ["lender-agents-console"] });
    } finally {
      setIsKillModalOpen(false);
      setSelectedAgentId("");
    }
  };

  const selectableAgents = agents.filter((a) => a.status.toLowerCase() !== "revoked");
  const affectedLoansCount = selectedAgentId
    ? events.filter((e) => e.agent_id === parseInt(selectedAgentId, 10) && e.event_type === "loan_approved").length
    : 0;

  return (
    <div className="relative min-h-screen bg-[#F5F5F0] pt-24 pb-20 px-4 md:px-10 font-mono text-text-primary">
      {/* Subtle background */}
      <div className="fixed inset-0 z-0 pointer-events-none opacity-30">
        <ShapeGrid speed={0.2} squareSize={40} direction="diagonal" borderColor="rgba(27,23,34,0.05)" hoverFillColor="#FDF3C8" shape="square" hoverTrailAmount={2} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto space-y-10">

        {/* ── Page Header ── */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-2 border-text-primary pb-8">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-accent mb-2">
              Demo Management Surface
            </p>
            <h1 className="text-4xl md:text-5xl font-extrabold uppercase tracking-tight leading-none">
              Operator Console
            </h1>
            <p className="text-sm text-text-primary/60 mt-2 max-w-lg">
              Trigger agent personas, watch live system outcomes, and revoke agent credentials in real time.
            </p>
          </div>

        </div>

        {/* ── 4 Live Metric Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            { label: "Active Agents", value: stats?.active_count ?? "—", sub: "Currently earning", bg: "bg-[#FDF3C8]", rot: "-rotate-1", valueColor: "text-text-primary" },
            { label: "Defaulted", value: stats?.defaulted_count ?? "—", sub: "Credential terminated", bg: "bg-[#FDECEA]", rot: "rotate-1", valueColor: "text-red-700" },
            { label: "Capital Deployed", value: `$${Number(stats?.total_capital_out ?? 0).toLocaleString()}`, sub: "Across all active loans", bg: "bg-[#E9EDF6]", rot: "-rotate-[0.5deg]", valueColor: "text-[#017587]" },
            { label: "Insurance Pool", value: `$${Number(insurancePool?.balance ?? 0).toLocaleString()}`, sub: "Available for payouts", bg: "bg-[#F0F0EA]", rot: "rotate-[0.5deg]", valueColor: "text-text-primary" },
          ].map((card) => (
            <div key={card.label} className={`relative ${card.bg} border-2 border-text-primary rounded-2xl p-5 shadow-[5px_5px_0px_rgba(27,23,34,1)] ${card.rot}`}>
              {/* Perforation dots */}
              <div className="absolute top-2.5 left-0 w-full flex justify-between px-6 pointer-events-none">
                {[0, 1, 2].map(i => <div key={i} className="w-2 h-2 rounded-sm bg-text-primary/15" />)}
              </div>
              <div className="mt-2">
                <p className="text-xs font-bold uppercase tracking-wider text-text-primary/60 mb-2">{card.label}</p>
                <p className={`text-3xl font-extrabold ${card.valueColor}`}>{card.value}</p>
                <p className="text-xs text-text-primary/50 mt-1">{card.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Main Content: Triggers left, Feed right ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

          {/* ── LEFT COL: Persona Triggers + Kill Switch ── */}
          <div className="lg:col-span-4 space-y-6">

            {/* Persona Triggers */}
            <div className="border-2 border-text-primary rounded-2xl shadow-[6px_6px_0px_rgba(27,23,34,1)] overflow-hidden">
              {/* Header */}
              <div className="bg-text-primary px-6 py-5">
                <h2 className="text-lg font-extrabold uppercase tracking-wide text-[#F5F5F0]">Scenario Simulator</h2>
                <p className="text-sm text-[#F5F5F0]/50 mt-1 leading-snug">
                  Pick a scenario to fire a complete agent lifecycle through the protocol.
                </p>
              </div>

              {/* How it works strip */}
              <div className="bg-[#FDF3C8] border-b-2 border-text-primary px-6 py-3 flex items-center gap-3">
                <span className="text-xs font-bold uppercase tracking-wider text-text-primary/60">Flow:</span>
                {["Create", "Score", "Lend", "Repay / Default"].map((step, i, arr) => (
                  <React.Fragment key={step}>
                    <span className="text-xs font-bold text-text-primary bg-white/70 border border-text-primary/20 px-2 py-0.5 rounded-md">{step}</span>
                    {i < arr.length - 1 && <span className="text-text-primary/30 text-xs">→</span>}
                  </React.Fragment>
                ))}
              </div>

              {/* Scenario Cards */}
              <div className="bg-[#F5F5F0] p-4 space-y-3">
                {PERSONAS.map((p, idx) => (
                  <button
                    key={p.id}
                    onClick={() => handleTrigger(p.id)}
                    disabled={!!loadingPersona || !tokens}
                    className={`w-full ${p.bg} ${p.hover} border-2 border-text-primary rounded-xl overflow-hidden text-left ${p.shadow} active:shadow-none active:translate-x-0.5 active:translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed group`}
                  >
                    {/* Scenario header row */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-text-primary/15">
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-lg bg-text-primary text-[#F5F5F0] text-xs font-extrabold flex items-center justify-center flex-shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-extrabold text-text-primary leading-none">{p.label}</p>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${p.badgeBg} mt-0.5 inline-block`}>{p.badge}</span>
                        </div>
                      </div>
                      <div className="shrink-0">
                        {loadingPersona === p.id ? (
                          <span className="animate-spin inline-block h-5 w-5 border-2 border-text-primary/30 border-t-text-primary rounded-full" />
                        ) : successPersona === p.id ? (
                          <span className="text-emerald-600 font-extrabold text-xl">✓</span>
                        ) : (
                          <Icon name="chevron-right" size={18} className="text-text-primary/40 group-hover:text-text-primary transition-colors" />
                        )}
                      </div>
                    </div>
                    {/* Scenario description */}
                    <div className="px-4 py-2.5">
                      <p className="text-xs text-text-primary/65 leading-relaxed">{p.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Kill Switch */}
            <div className="border-2 border-red-500 rounded-2xl shadow-[6px_6px_0px_rgba(139,67,67,1)] overflow-hidden">
              {/* Header */}
              <div className="bg-red-700 px-6 py-5">
                <div className="flex items-center gap-3 mb-1">
                  <Icon name="warning" size={20} className="text-white flex-shrink-0" />
                  <h2 className="text-lg font-extrabold uppercase tracking-wide text-white">Emergency Revoke</h2>
                </div>
                <p className="text-sm text-white/55 leading-snug">
                  Immediately terminate an agent's credentials outside the normal lifecycle. This action is permanent.
                </p>
              </div>

              {/* Warning notice */}
              <div className="bg-red-50 border-b border-red-200 px-5 py-3 flex items-start gap-2">
                <span className="text-red-500 mt-0.5 text-xs">⚠</span>
                <p className="text-xs text-red-700 leading-relaxed">
                  Any open loans from this agent will be immediately flagged. Insurance pool may be triggered if outstanding balance exceeds coverage.
                </p>
              </div>

              <div className="bg-[#FDECEA] p-5 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-text-primary mb-2">
                    Select Agent to Revoke
                    <span className="ml-2 font-normal text-text-primary/50 text-xs">({selectableAgents.length} available)</span>
                  </label>
                  <select
                    value={selectedAgentId}
                    onChange={(e) => setSelectedAgentId(e.target.value)}
                    className="w-full px-4 py-3 bg-[#F5F5F0] border-2 border-red-300 rounded-xl text-text-primary text-sm font-mono focus:border-red-600 outline-none transition-all"
                  >
                    <option value="">— Select target agent —</option>
                    {selectableAgents.map((a) => (
                      <option key={a.id} value={a.id}>#{a.id} · {a.name} · {a.status}</option>
                    ))}
                  </select>
                  {selectableAgents.length === 0 && (
                    <p className="text-xs text-red-600/70 mt-2 bg-red-100 border border-red-200 rounded-lg px-3 py-2">
                      No revocable agents on the network. Run a persona scenario first to create agents.
                    </p>
                  )}
                </div>

                <button
                  onClick={() => setIsKillModalOpen(true)}
                  disabled={!selectedAgentId}
                  className="w-full px-4 py-3.5 bg-red-700 text-white font-extrabold text-sm uppercase tracking-wider border-2 border-red-800 rounded-xl shadow-[3px_3px_0px_rgba(139,67,67,1)] hover:bg-red-800 active:shadow-none active:translate-y-0.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  🔴 Fire Kill Switch
                </button>
              </div>
            </div>

          </div>

          {/* ── RIGHT COL: Last Result + Live Feed ── */}
          <div className="lg:col-span-8 space-y-6">

            {/* Last Trigger Result */}
            <AnimatePresence>
              {lastResult && (
                <motion.div
                  key={lastResult.agent_id + lastResult.persona}
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  className="bg-[#E9EDF6] border-2 border-text-primary rounded-2xl shadow-[5px_5px_0px_rgba(27,23,34,1)] overflow-hidden"
                >
                  <div className="px-6 py-4 border-b-2 border-text-primary flex items-center justify-between bg-text-primary">
                    <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#F5F5F0]">Last Trigger Result</h3>
                    <button onClick={() => setLastResult(null)} className="text-white/40 hover:text-white transition-colors p-1">
                      <Icon name="x" size={16} />
                    </button>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                      <div className="bg-[#F5F5F0] border border-text-primary/20 rounded-xl px-4 py-3">
                        <p className="text-xs text-text-primary/50 uppercase font-bold mb-1">Persona</p>
                        <p className="text-sm font-extrabold capitalize">{lastResult.persona}</p>
                      </div>
                      <div className="bg-[#F5F5F0] border border-text-primary/20 rounded-xl px-4 py-3">
                        <p className="text-xs text-text-primary/50 uppercase font-bold mb-1">Agent #{lastResult.agent_id}</p>
                        <p className="text-sm font-extrabold capitalize">{lastResult.agent_status}</p>
                      </div>
                      {lastResult.loan_id && (
                        <div className="bg-[#F5F5F0] border border-text-primary/20 rounded-xl px-4 py-3">
                          <p className="text-xs text-text-primary/50 uppercase font-bold mb-1">Loan #{lastResult.loan_id}</p>
                          <p className="text-sm font-extrabold capitalize">{lastResult.loan_status}</p>
                        </div>
                      )}
                    </div>
                    {lastResult.is_cold_start && (
                      <span className="inline-block bg-accent/20 border border-accent/40 px-3 py-1 text-xs font-bold uppercase rounded-lg mb-3">Cold-Start Allocation</span>
                    )}
                    <p className="text-sm text-text-primary/70 leading-relaxed">{lastResult.explanation}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Live Event Feed */}
            <div className="bg-[#F0F0EA] border-2 border-text-primary rounded-2xl shadow-[6px_6px_0px_rgba(27,23,34,1)] overflow-hidden">
              <div className="px-6 py-4 border-b-2 border-text-primary bg-[#FDF3C8] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-extrabold uppercase tracking-wide">Live Event Feed</h2>
                  <span className="flex items-center gap-1.5 text-xs text-emerald-700 font-bold">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
                    Auto-refreshing
                  </span>
                </div>
                <span className="text-sm font-bold text-text-primary/50">{events.length} events</span>
              </div>

              <div className="max-h-[480px] overflow-y-auto divide-y-2 divide-text-primary/10">
                {events.length === 0 ? (
                  <div className="py-20 text-center">
                    <p className="text-base font-bold text-text-primary/40 uppercase tracking-wider">No events yet</p>
                    <p className="text-sm text-text-primary/30 mt-2">Trigger a persona to generate live events</p>
                  </div>
                ) : (
                  events.map((item) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-start gap-4 px-6 py-4 hover:bg-[#FDF3C8]/60 transition-colors"
                    >
                      {/* Status dot */}
                      <div className="shrink-0 mt-1">
                        <span className={`block h-3 w-3 rounded-full ${EVENT_DOT[item.event_type] ?? "bg-text-primary/30"}`} />
                      </div>

                      {/* Event body */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`text-xs font-extrabold uppercase tracking-wide ${EVENT_LABEL[item.event_type] ?? "text-text-primary"}`}>
                            {item.event_type.replace(/_/g, " ")}
                          </span>
                          <span className="text-xs text-text-primary/40 font-mono">
                            Agent #{item.agent_id}
                          </span>
                        </div>
                        <p className="text-sm text-text-primary/70 leading-snug">{item.detail}</p>
                      </div>

                      {/* Timestamp */}
                      <div className="shrink-0 text-xs text-text-primary/40 font-mono pt-0.5">
                        {new Date(item.created_at).toLocaleTimeString()}
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Revocation Modal */}
      <Modal
        isOpen={isKillModalOpen}
        onClose={() => setIsKillModalOpen(false)}
        title="Fire Credential Kill Switch?"
        description="Revoke this agent's credential now? This bypasses the scripted flow and cannot be undone."
        confirmLabel="Fire Kill Switch"
        cancelLabel="Cancel"
        onConfirm={handleKillSwitch}
        severity="danger"
      >
        <div className="p-5 bg-red-50 border-l-4 border-red-600 text-text-primary font-mono text-sm mb-4 rounded-r-xl">
          <p className="font-extrabold text-red-700 mb-2 text-base">⚠ Blast Radius</p>
          <p className="text-sm">This will permanently revoke <strong>Agent #{selectedAgentId}</strong>.</p>
          {affectedLoansCount > 0 && (
            <p className="mt-2 font-bold text-red-700">This will affect {affectedLoansCount} active loan(s).</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
