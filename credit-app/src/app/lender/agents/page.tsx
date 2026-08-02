"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/context/SessionContext";
import { listLenderAgents } from "@/lib/api/lenders";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { StatusDot } from "@/components/ui/StatusDot";
import { motion } from "framer-motion";

export default function AgentDirectory() {
  const { session } = useSession();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['lender-agents', session?.id],
    queryFn: () => listLenderAgents(session?.token),
    enabled: !!session?.id,
  });

  const filteredAgents = agents.filter((agent) => {
    return statusFilter === "ALL" || agent.status === statusFilter.toUpperCase();
  });

  return (
    <div className="flex-1 bg-editorial-grid py-10 px-6 font-mono text-text-primary">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="border-b border-text-secondary/15 pb-6">
          <h1 className="font-mono text-xs uppercase tracking-widest text-text-secondary mb-1">
            LENDER DATABASE
          </h1>
          <h2 className="font-mono text-3xl font-extrabold text-text-primary uppercase">
            Agent Directory
          </h2>
        </div>

        {/* Filters Rail */}
        <div className="flex flex-wrap gap-4 items-center bg-text-secondary/5 p-4 border border-text-secondary/10 font-mono text-xs">
          {/* Status Filters */}
          <div className="flex items-center gap-2 border-r border-text-secondary/15 pr-4 mr-2">
            <span className="text-text-secondary uppercase">STATUS:</span>
            {["ALL", "ACTIVE", "STARTER-LIMIT", "DEFAULTED"].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-1 border-2 transition-all font-bold ${
                  statusFilter === status 
                    ? "bg-text-primary text-[#F5F5F0] border-text-primary" 
                    : "border-transparent text-text-secondary hover:text-text-primary hover:border-text-primary"
                }`}
              >
                {status}
              </button>
            ))}
          </div>
        </div>

        {/* Directory Table */}
        <Card role="none" className="p-0 overflow-hidden">
          {isLoading ? (
            <div className="text-center py-20">
              <span className="animate-spin inline-block"><Icon name="refresh-cw" size={24} /></span>
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-20 font-mono text-sm text-text-secondary">
              No agents match these filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className="border-b border-text-secondary/15 text-text-secondary bg-text-secondary/5 uppercase">
                    <th className="p-4">AGENT</th>
                    <th className="p-4">STATUS</th>
                    <th className="p-4">OUTSTANDING BALANCE</th>
                    <th className="p-4">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAgents.map((agent, index) => (
                    <motion.tr
                      key={agent.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.03, duration: 0.4 }}
                      className="border-b border-text-secondary/10 hover:bg-text-secondary/5 transition-colors"
                    >
                      <td className="p-4 font-bold text-text-primary">
                        <div>
                          <span>{agent.name}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <StatusDot status={agent.status.toLowerCase()} pulse={agent.status === "defaulted"} />
                      </td>
                      <td className="p-4 font-bold text-text-primary">
                        ${Number(agent.outstanding_balance).toLocaleString()}
                      </td>
                      <td className="p-4">
                        <Link href={`/lender/agents/${agent.id}`}>
                          <button className="px-3 py-1.5 border border-text-secondary/20 hover:border-accent hover:text-accent uppercase text-[10px] font-bold transition-all">
                            Details
                          </button>
                        </Link>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}
