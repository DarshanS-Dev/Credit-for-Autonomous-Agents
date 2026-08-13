"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/context/SessionContext";
import { getAgentLenderView, getAgentScore, getAgentWallet, setCreditLimit, getAgentTransactions } from "@/lib/api/agents";
import { listLoans } from "@/lib/api/loans";
import { revokeAgent } from "@/lib/api/operator-actions";
import { recordInflow, declareTaskFailure } from "@/lib/api/repayment";
import { formatCurrency, formatDateTime, toNumber } from "@/lib/api/types";
import type { TransactionOut } from "@/lib/api/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusDot } from "@/components/ui/StatusDot";
import { Modal } from "@/components/ui/Modal";
import { motion, AnimatePresence } from "framer-motion";

export default function LenderAgentDetail() {
  const params = useParams();
  const router = useRouter();
  const { session } = useSession();
  const queryClient = useQueryClient();
  
  const idStr = Array.isArray(params.id) ? params.id[0] : params.id;
  const agentId = idStr ? parseInt(idStr, 10) : 0;

  const [activeTab, setActiveTab] = useState<"loans" | "ledger">("loans");
  const [newLimit, setNewLimit] = useState(0); // Actually global, but kept for UI
  const [isBlacklistModalOpen, setIsBlacklistModalOpen] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);

  const { data: agent, isLoading: agentLoading } = useQuery({
    queryKey: ['agent-lender-view', agentId],
    queryFn: () => getAgentLenderView(agentId),
    enabled: !!agentId,
  });

  const { data: scoreData } = useQuery({
    queryKey: ['agent-score', agentId],
    queryFn: () => getAgentScore(agentId),
    enabled: !!agentId,
  });

  const { data: walletData } = useQuery({
    queryKey: ['agent-wallet', agentId],
    queryFn: () => getAgentWallet(agentId),
    enabled: !!agentId,
  });

  const { data: loans = [] } = useQuery({
    queryKey: ['agent-loans', agentId],
    queryFn: () => listLoans({ agent_id: agentId }),
    enabled: !!agentId,
  });

  const { data: transactions = [] } = useQuery({
    queryKey: ['agent-transactions', agentId],
    queryFn: () => getAgentTransactions(agentId),
    enabled: !!agentId,
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeAgent(agentId, session?.token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-lender-view', agentId] });
      setIsBlacklistModalOpen(false);
    }
  });

  const creditLimitMutation = useMutation({
    mutationFn: () => setCreditLimit(agentId, newLimit || null),
    onSuccess: () => {
      alert(newLimit ? `Agent credit limit set to $${newLimit.toLocaleString()}` : 'Credit limit override cleared');
      queryClient.invalidateQueries({ queryKey: ['agent-lender-view', agentId] });
    }
  });

  const [inflowAmount, setInflowAmount] = useState(100);
  const [agentApiKey, setAgentApiKey] = useState(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem(`credit-agents:agent-key:${agentId}`) || "";
    }
    return "";
  });

  const inflowMutation = useMutation({
    mutationFn: () => recordInflow(agentId, inflowAmount, session?.token, agentApiKey || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-wallet', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent-transactions', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent-loans', agentId] });
    }
  });

  const taskFailureMutation = useMutation({
    mutationFn: () => declareTaskFailure(agentId, session?.token, agentApiKey || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-lender-view', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent-wallet', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent-transactions', agentId] });
      queryClient.invalidateQueries({ queryKey: ['agent-loans', agentId] });
    }
  });

  if (agentLoading) {
    return <div className="flex-1 flex items-center justify-center py-20"><Icon name="refresh-cw" className="animate-spin" /></div>;
  }

  if (!agent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 bg-editorial-grid font-mono">
        <Icon name="broken-link" size={48} className="text-text-secondary mb-4" />
        <h2 className="text-xl uppercase font-bold text-text-primary">Agent Not Found</h2>
        <Link href="/lender/dashboard" className="mt-4">
          <Button variant="primary">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  const handleBlacklist = () => {
    revokeMutation.mutate();
  };

  const handleUpdateLimit = () => {
    creditLimitMutation.mutate();
  };

  const scoreVal = scoreData ? toNumber(scoreData.score) : 0;
  const taskSuccessRate = scoreData ? toNumber(scoreData.task_success_rate) : 0;
  const spendRegularity = scoreData ? toNumber(scoreData.spend_regularity) : 0;
  const isColdStart = scoreData ? scoreData.is_cold_start : false;
  const isRevokedOrDefaulted = agent.status.toLowerCase() === "revoked" || agent.status.toLowerCase() === "defaulted";

  const signalProgressBars = [
    { label: "Overall Score", val: scoreVal, key: "overall", desc: "Aggregated agent risk score (0-100)." },
    { label: "Task Success Rate", val: taskSuccessRate, key: "task_success", desc: "Percentage of tasks completed successfully." },
    { label: "Spend Regularity", val: spendRegularity, key: "spend_regularity", desc: "Consistency and predictability of spending patterns." },
  ];

  return (
    <div className="flex-1 bg-editorial-grid py-12 px-6">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Back navigation */}
        <Link 
          href="/lender/dashboard"
          className="inline-flex items-center gap-2 font-mono text-xs uppercase text-text-secondary hover:text-text-primary transition-colors"
        >
          <Icon name="arrow-left" size={14} />
          <span>Back to Lender Dashboard</span>
        </Link>

        {/* Page title and state indicators */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-text-secondary/15 pb-6 gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-mono text-3xl font-extrabold text-text-primary uppercase">
                {agent.name}
              </h1>
              <StatusDot status={agent.status.toLowerCase()} pulse={agent.status.toLowerCase() === "defaulted"} />
            </div>
            <p className="text-sm text-text-secondary mt-1 uppercase font-mono text-xs tracking-wider">
              AGENT ID: {agent.id}
            </p>
          </div>

          {!isRevokedOrDefaulted && (
            <Button variant="danger" onClick={() => setIsBlacklistModalOpen(true)}>
              Revoke / Blacklist
            </Button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left: Score breakdown */}
          <div className="lg:col-span-6 space-y-6">
            <Card role="lender" className="space-y-6">
              <h3 className="font-mono text-xs uppercase tracking-widest text-text-secondary font-bold border-b border-text-secondary/10 pb-2">
                Score breakdown
              </h3>

              {/* Progress bars with tooltips */}
              <div className="space-y-6">
                {signalProgressBars.map((sig, idx) => (
                  <div key={sig.key} className="space-y-2 relative">
                    <div className="flex justify-between items-center font-mono text-xs text-text-secondary">
                      <div className="flex items-center gap-1.5">
                        <span>{sig.label.toUpperCase()}</span>
                        
                        <button 
                          onMouseEnter={() => setActiveTooltip(sig.key)}
                          onMouseLeave={() => setActiveTooltip(null)}
                          className="text-text-secondary/60 hover:text-text-primary transition-colors text-[10px] cursor-help"
                        >
                          [?]
                        </button>
                      </div>
                      <span className="font-bold text-text-primary">{sig.val}/100</span>
                    </div>

                    <AnimatePresence>
                      {activeTooltip === sig.key && (
                        <motion.div
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 5 }}
                          className="absolute z-20 bg-text-primary text-surface p-3 font-mono text-[10px] border border-surface/20 shadow-xl max-w-xs bottom-full mb-1"
                        >
                          <p>{sig.desc}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="h-2 w-full bg-text-secondary/10 rounded-sm overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${sig.val}%` }}
                        transition={{ delay: idx * 0.08, duration: 0.5, ease: "easeOut" }}
                        className="h-full bg-text-primary"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {isColdStart && (
                <div className="bg-accent/10 border border-accent/30 p-4 font-mono text-xs text-text-primary">
                  [!] Cold-start indicator active — No history found. Starter limit applied automatically.
                </div>
              )}
            </Card>

            {/* Credit limit adjust panel */}
            {!isRevokedOrDefaulted && (
              <>
                <Card role="none" className="space-y-4">
                  <h3 className="font-mono text-xs uppercase tracking-widest text-text-secondary font-bold border-b border-text-secondary/10 pb-2">
                    Controls
                  </h3>
                  <div className="space-y-3 font-mono text-xs">
                    <div>
                      <label className="block text-text-secondary uppercase mb-2">Agent credit limit override</label>
                      <div className="flex gap-3">
                        <input
                          type="number"
                          value={newLimit}
                          onChange={(e) => setNewLimit(Number(e.target.value))}
                          className="flex-1 px-3 py-2 bg-transparent border border-text-secondary/35 text-text-primary font-mono text-sm"
                          min="0"
                        />
                        <Button variant="primary" onClick={handleUpdateLimit} className="py-2" disabled={creditLimitMutation.isPending}>
                          Apply
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card role="none" className="space-y-4">
                  <h3 className="font-mono text-xs uppercase tracking-widest text-text-secondary font-bold border-b border-text-secondary/10 pb-2">
                    Simulate Events
                  </h3>
                  <div className="space-y-3 font-mono text-xs">
                    <div>
                      <label className="block text-text-secondary uppercase mb-2">Agent API Key (Required for Simulation)</label>
                      <input
                        type="text"
                        value={agentApiKey}
                        onChange={(e) => setAgentApiKey(e.target.value)}
                        placeholder="sk_..."
                        className="w-full px-3 py-2 bg-transparent border border-text-secondary/35 text-text-primary font-mono text-sm mb-4"
                      />
                    </div>
                    <div>
                      <label className="block text-text-secondary uppercase mb-2">Task payout inflow amount</label>
                      <div className="flex gap-3">
                        <input
                          type="number"
                          value={inflowAmount}
                          onChange={(e) => setInflowAmount(Number(e.target.value))}
                          className="flex-1 px-3 py-2 bg-transparent border border-text-secondary/35 text-text-primary font-mono text-sm"
                          min="1"
                        />
                        <Button variant="primary" onClick={() => inflowMutation.mutate()} className="py-2" disabled={inflowMutation.isPending}>
                          Simulate Inflow
                        </Button>
                      </div>
                    </div>
                    <Button variant="danger" onClick={() => taskFailureMutation.mutate()} className="w-full py-2" disabled={taskFailureMutation.isPending}>
                      Declare Task Failure
                    </Button>
                  </div>
                </Card>
              </>
            )}
          </div>

          {/* Right: History ledger + Anomaly logs */}
          <div className="lg:col-span-6 space-y-6">

            {/* Loan lists/ledger tabs */}
            <Card role="none" className="space-y-4">
              <div className="flex justify-between border-b border-text-secondary/15 pb-2 font-mono text-xs">
                <div className="flex gap-4">
                  <button 
                    onClick={() => setActiveTab("loans")}
                    className={`font-bold pb-2 border-b-2 transition-colors uppercase ${
                      activeTab === "loans" ? "border-base text-text-primary" : "border-transparent text-text-secondary"
                    }`}
                  >
                    Loans
                  </button>
                  <button 
                    onClick={() => setActiveTab("ledger")}
                    className={`font-bold pb-2 border-b-2 transition-colors uppercase ${
                      activeTab === "ledger" ? "border-base text-text-primary" : "border-transparent text-text-secondary"
                    }`}
                  >
                    Wallet Ledger
                  </button>
                </div>
              </div>

              {activeTab === "loans" ? (
                loans.length === 0 ? (
                  <p className="font-mono text-xs text-text-secondary py-8 text-center border border-dashed border-text-secondary/20">
                    No loans.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {loans.map((l) => (
                      <Link href={`/lender/loans/${l.id}`} key={l.id} className="block group">
                        <div className="p-3 border border-text-secondary/15 hover:border-accent font-mono text-xs text-text-secondary flex justify-between items-center transition-all bg-[#F5F5F0]/70">
                          <div>
                            <span className="font-bold text-text-primary block">Loan #{l.id}</span>
                            <span>{new Date(l.issued_at).toLocaleDateString()}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-bold text-text-primary block">${l.principal_amount}</span>
                            <span className="uppercase text-[10px] text-accent font-bold group-hover:text-base">{l.status}</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )
              ) : (
                <div className="space-y-2 font-mono text-xs text-text-secondary">
                  <div className="p-3 border border-text-secondary/10 flex justify-between">
                    <span>Current spendable balance</span>
                    <span className="text-base font-bold">${walletData ? formatCurrency(walletData.spendable_balance) : '0.00'}</span>
                  </div>
                  {transactions.length === 0 ? (
                    <p className="py-4 text-center text-[11px] text-text-secondary/60 border border-dashed border-text-secondary/20">No transactions yet.</p>
                  ) : (
                    <div className="space-y-1 max-h-[300px] overflow-y-auto">
                      {transactions.map((tx: TransactionOut) => (
                        <div key={tx.id} className="p-2 border border-text-secondary/10 flex justify-between items-center bg-[#F5F5F0]/50">
                          <div>
                            <span className="font-bold text-text-primary block">{tx.type}</span>
                            <span className="text-[10px] text-text-secondary/60">{formatDateTime(tx.created_at)}</span>
                          </div>
                          <span className="font-bold text-text-primary">${formatCurrency(tx.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          </div>

        </div>

      </div>

      {/* Blacklist Modal */}
      <Modal
        isOpen={isBlacklistModalOpen}
        onClose={() => setIsBlacklistModalOpen(false)}
        title="Revoke / blacklist agent?"
        description="This agent will be immediately blacklisted and denied further credit. This cannot be undone."
        confirmLabel="Blacklist"
        cancelLabel="Cancel"
        onConfirm={handleBlacklist}
        severity="danger"
      />
    </div>
  );
}
