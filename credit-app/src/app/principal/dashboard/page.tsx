"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { StatusDot } from "@/components/ui/StatusDot";
import { Icon } from "@/components/ui/Icon";
import { Doodle } from "@/components/ui/Doodle";
import { motion } from "framer-motion";
import { gsap } from "gsap";
import { listMyAgents } from "@/lib/api/agents";
import { getOperatorEvents } from "@/lib/api/operator-actions";
import { formatCurrency, toNumber } from "@/lib/api/types";

export default function PrincipalDashboard() {
  const { data: agents = [], isLoading } = useQuery({
    queryKey: ["agents", "mine"],
    queryFn: listMyAgents,
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: () => getOperatorEvents(20),
    refetchInterval: 5000,
  });

  const anomalies = events.filter((e) => e.event_type === "anomaly_flagged");

  const calculatedTotal = agents.reduce((sum, a) => sum + toNumber(a.outstanding_balance), 0);
  const [totalBalance, setTotalBalance] = useState(0);

  useEffect(() => {
    const obj = { value: 0 };
    gsap.to(obj, {
      value: calculatedTotal,
      duration: 0.9,
      ease: "power2.out",
      onUpdate: () => setTotalBalance(Math.floor(obj.value)),
    });
  }, [calculatedTotal]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-sm text-text-secondary">
        Loading agents…
      </div>
    );
  }

  return (
    <div className="flex-1 bg-editorial-grid py-10 px-6 font-mono text-text-primary">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end border-b border-text-secondary/15 pb-6 gap-6">
            <div>
              <h1 className="font-mono text-xs uppercase tracking-widest text-text-secondary mb-1">
                PRINCIPAL CONSOLE
              </h1>
              <h2 className="font-mono text-3xl font-extrabold uppercase">Your Agents</h2>
            </div>
            <div className="p-6 min-w-[240px] border-2 border-text-primary">
              <span className="text-[10px] text-text-primary/70 uppercase block mb-1">
                Outstanding Balance
              </span>
              <span className="text-3xl font-bold flex items-center gap-2">
                ${totalBalance.toLocaleString()} <Doodle type="sparkle" size={16} />
              </span>
            </div>
          </div>

          <div className="space-y-4">
            {agents.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-text-secondary/30 p-8">
                <Icon name="directory" className="mx-auto text-text-secondary mb-4" size={48} />
                <h3 className="font-mono text-lg font-bold uppercase mb-2">No agents yet</h3>
                <Link href="/principal/agents/add">
                  <Button variant="primary">Add your first agent</Button>
                </Link>
              </div>
            ) : (
              agents.map((agent, index) => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Card role="none" className="hover:border-accent transition-all">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      <div className="flex items-center gap-3">
                        <h3 className="font-mono text-base font-bold uppercase border border-text-primary px-1">
                          {agent.name}
                        </h3>
                        <StatusDot status={agent.status} pulse={agent.status === "defaulted"} />
                      </div>
                      <div className="flex items-center gap-6">
                        <span className="font-bold">${formatCurrency(agent.outstanding_balance)}</span>
                        <Link href={`/principal/agents/${agent.id}`}>
                          <button className="h-8 w-8 bg-text-secondary/5 hover:bg-accent/20 flex items-center justify-center">
                            <Icon name="chevron-right" size={16} />
                          </button>
                        </Link>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))
            )}
          </div>
        </div>

        <div className="lg:col-span-4">
          <Card role="principal" className="space-y-4">
            <h3 className="font-mono text-sm font-bold uppercase border-b pb-3">Alerts</h3>
            {anomalies.length === 0 ? (
              <p className="py-8 text-center text-xs text-text-secondary">No alerts.</p>
            ) : (
              anomalies.map((e) => (
                <div key={e.id} className="p-3 border-l-2 border-danger bg-danger/5 text-xs">
                  <span className="font-bold uppercase">Agent #{e.agent_id}</span>
                  <p className="text-[11px] mt-1">{e.detail}</p>
                </div>
              ))
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
