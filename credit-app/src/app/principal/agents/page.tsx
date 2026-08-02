"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listMyAgents } from "@/lib/api/agents";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { formatCurrency } from "@/lib/api/types";

export default function PrincipalAgentsPage() {
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agents", "mine"],
    queryFn: listMyAgents,
  });

  if (isLoading) {
    return <div className="max-w-7xl mx-auto p-8 font-mono text-sm">Loading…</div>;
  }

  return (
    <div className="max-w-7xl mx-auto p-8">
      <h1 className="font-mono text-4xl font-bold mb-8">Your Agents</h1>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <Card key={agent.id} className="flex flex-col p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-mono text-xl font-semibold">{agent.name}</h2>
              <StatusDot status={agent.status} />
            </div>
            <ul className="text-sm text-text-secondary space-y-1 mb-4">
              <li>
                Outstanding: <span className="font-medium">${formatCurrency(agent.outstanding_balance)}</span>
              </li>
            </ul>
            <Link href={`/principal/agents/${agent.id}`} className="mt-auto text-accent hover:underline">
              View Details →
            </Link>
          </Card>
        ))}
      </div>
      <div className="mt-8">
        <Link href="/principal/agents/add" className="text-accent hover:underline">
          + Add New Agent
        </Link>
      </div>
    </div>
  );
}
