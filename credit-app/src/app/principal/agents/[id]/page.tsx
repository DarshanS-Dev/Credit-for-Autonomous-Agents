"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { StatusDot } from "@/components/ui/StatusDot";
import { Modal } from "@/components/ui/Modal";
import { getAgentDetail, revokeAgentAsPrincipal } from "@/lib/api/agents";
import { listLoans, requestLoan } from "@/lib/api/loans";
import { formatCurrency, formatDateTime, loanStatusLabel, toNumber } from "@/lib/api/types";
import { DEFAULT_MANDATE_BOUNDS, DEMO_LENDER_ID } from "@/lib/constants";
import { ApiError } from "@/lib/api/client";

export default function PrincipalAgentDetail() {
  const params = useParams();
  const agentId = Number(params.id);
  const queryClient = useQueryClient();

  const [isRevokeModalOpen, setIsRevokeModalOpen] = useState(false);
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [loanAmount, setLoanAmount] = useState(500);
  const [lenderId, setLenderId] = useState(DEMO_LENDER_ID);
  const [recipient, setRecipient] = useState("approved-vendor.example");
  const [loanError, setLoanError] = useState<string | null>(null);

  const { data: agent, isLoading } = useQuery({
    queryKey: ["agent", agentId],
    queryFn: () => getAgentDetail(agentId),
    enabled: !Number.isNaN(agentId),
  });

  const { data: loans = [] } = useQuery({
    queryKey: ["loans", { agent_id: agentId }],
    queryFn: () => listLoans({ agent_id: agentId }),
    enabled: !Number.isNaN(agentId),
  });

  const revokeMutation = useMutation({
    mutationFn: () => revokeAgentAsPrincipal(agentId, "principal-initiated revocation"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent", agentId] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });

  const loanMutation = useMutation({
    mutationFn: () =>
      requestLoan(agentId, {
        lender_id: lenderId,
        principal_amount: loanAmount,
        approved_recipient: recipient,
        task_category: "content",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loans"] });
      setIsLoanModalOpen(false);
      setLoanError(null);
    },
    onError: (err) => {
      setLoanError(err instanceof ApiError ? err.message : "Loan request failed");
    },
  });

  if (isLoading) {
    return <div className="flex-1 flex items-center justify-center font-mono text-sm">Loading…</div>;
  }

  if (!agent) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 font-mono">
        <Icon name="broken-link" size={48} className="text-text-secondary mb-4" />
        <h2 className="text-xl uppercase font-bold">Agent Not Found</h2>
        <Link href="/principal/dashboard" className="mt-4">
          <Button variant="primary">Back to Dashboard</Button>
        </Link>
      </div>
    );
  }

  let mandateBounds = DEFAULT_MANDATE_BOUNDS;
  try {
    const parsed = JSON.parse(agent.delegation_mandate);
    if (parsed.bounds) mandateBounds = parsed.bounds;
  } catch {
    /* use default */
  }

  return (
    <div className="flex-1 bg-editorial-grid py-12 px-6">
      <div className="max-w-5xl mx-auto space-y-8">
        <Link href="/principal/dashboard" className="inline-flex items-center gap-2 font-mono text-xs uppercase text-text-secondary hover:text-text-primary">
          <Icon name="arrow-left" size={14} /> Back to Dashboard
        </Link>

        <div className="flex flex-col md:flex-row justify-between items-start gap-6 border-b border-text-secondary/15 pb-6">
          <div className="flex items-center gap-3">
            <h1 className="font-mono text-3xl font-extrabold uppercase">{agent.name}</h1>
            <StatusDot status={agent.status} pulse={agent.status === "defaulted"} />
          </div>
          <div className="flex gap-2">
            {agent.credential_active && (
              <Button variant="primary" onClick={() => setIsLoanModalOpen(true)}>
                Request Loan
              </Button>
            )}
            {agent.status !== "revoked" && agent.status !== "defaulted" && (
              <Button variant="danger" onClick={() => setIsRevokeModalOpen(true)}>
                Revoke Credential
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-4">
            <Card role="principal" className="space-y-4">
              <h3 className="font-mono text-xs uppercase font-bold border-b pb-2">DELEGATION CREDENTIAL</h3>
              <div className="font-mono text-xs text-text-secondary space-y-3">
                <div>
                  <span className="block text-[10px] uppercase">Status</span>
                  <span className="font-bold">{agent.credential_active ? "ACTIVE" : agent.status.toUpperCase()}</span>
                </div>
                <div>
                  <span className="block text-[10px] uppercase">Authorization bounds</span>
                  <p className="mt-1">{mandateBounds}</p>
                </div>
              </div>
            </Card>
          </div>

          <div className="md:col-span-8">
            <Card role="none" className="space-y-6">
              <h3 className="font-mono text-xs uppercase font-bold border-b pb-2">LOAN HISTORY</h3>
              {loans.length === 0 ? (
                <p className="py-12 text-center text-sm text-text-secondary border border-dashed">No loans yet.</p>
              ) : (
                <table className="w-full font-mono text-xs">
                  <thead>
                    <tr className="border-b text-text-secondary uppercase">
                      <th className="pb-3 text-left">ID</th>
                      <th className="pb-3 text-left">Amount</th>
                      <th className="pb-3 text-left">Status</th>
                      <th className="pb-3 text-left">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loans.map((loan) => (
                      <tr key={loan.id} className="border-b border-text-secondary/5">
                        <td className="py-3">#{loan.id}</td>
                        <td className="py-3 font-bold">${formatCurrency(loan.principal_amount)}</td>
                        <td className="py-3 uppercase">{loanStatusLabel(loan.status)}</td>
                        <td className="py-3 text-text-secondary">{formatDateTime(loan.issued_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isRevokeModalOpen}
        onClose={() => setIsRevokeModalOpen(false)}
        title="Revoke this agent's credential?"
        description="This agent will immediately lose authorization. This cannot be undone."
        confirmLabel="Revoke"
        cancelLabel="Cancel"
        onConfirm={() => revokeMutation.mutate()}
        severity="danger"
      />

      <Modal
        isOpen={isLoanModalOpen}
        onClose={() => setIsLoanModalOpen(false)}
        title="Request a loan"
        description="Auto-underwriting runs immediately — no human approval per loan."
        confirmLabel={loanMutation.isPending ? "Submitting…" : "Submit Request"}
        cancelLabel="Cancel"
        onConfirm={() => loanMutation.mutate()}
        closeOnConfirm={false}
      >
        <div className="space-y-3 font-mono text-xs mt-4">
          <label className="block">
            <span className="uppercase text-text-secondary">Amount ($)</span>
            <input
              type="number"
              value={loanAmount}
              onChange={(e) => setLoanAmount(Number(e.target.value))}
              className="w-full mt-1 px-3 py-2 border border-text-secondary/35 bg-transparent"
              min={1}
            />
          </label>
          <label className="block">
            <span className="uppercase text-text-secondary">Lender ID</span>
            <input
              type="number"
              value={lenderId}
              onChange={(e) => setLenderId(Number(e.target.value))}
              className="w-full mt-1 px-3 py-2 border border-text-secondary/35 bg-transparent"
            />
          </label>
          <label className="block">
            <span className="uppercase text-text-secondary">Approved recipient</span>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full mt-1 px-3 py-2 border border-text-secondary/35 bg-transparent"
            />
          </label>
          {loanError && <p className="text-danger">{loanError}</p>}
        </div>
      </Modal>
    </div>
  );
}
