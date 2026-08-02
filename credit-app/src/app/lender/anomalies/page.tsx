"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/context/SessionContext";
import { getOperatorEvents } from "@/lib/api/operator";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { motion, AnimatePresence } from "framer-motion";

export default function AnomalyFeed() {
  const { session } = useSession();

  const { data: events = [] } = useQuery({
    queryKey: ['operator-events'],
    queryFn: () => getOperatorEvents(session?.token),
    refetchInterval: 5000,
    enabled: !!session?.id,
  });

  const [severityFilter, setSeverityFilter] = useState<string>("ALL");

  // Derive anomalies from flagged events
  const anomalies = events.filter(e => e.event_type === "anomaly_flagged").map(e => ({
    id: e.id,
    agentName: "Agent", // We don't have agent name in EventOut, could fetch from listLenderAgents but skipping for now to match plan.
    severity: "high", // Mock severity as backend doesn't provide it
    description: e.details,
    date: new Date(e.created_at).toLocaleString()
  }));

  const filteredAnomalies = anomalies.filter(
    (an) => severityFilter === "ALL" || an.severity === severityFilter.toLowerCase()
  );

  // Extract action logs from activity feed (revocations and defaults)
  const actionLogs = events.filter(
    (item) => item.event_type.includes("revoked") || item.event_type.includes("defaulted")
  );

  return (
    <div className="flex-1 bg-editorial-grid py-10 px-6 font-mono text-text-primary">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="border-b border-text-secondary/15 pb-6">
          <h1 className="font-mono text-xs uppercase tracking-widest text-text-secondary mb-1">
            RISK FEED
          </h1>
          <h2 className="font-mono text-3xl font-extrabold text-text-primary uppercase">
            Anomalies & Alerts
          </h2>
        </div>

        {/* Filters */}
        <div className="flex gap-4 items-center bg-text-secondary/5 p-4 border border-text-secondary/10 font-mono text-xs">
          <span className="text-text-secondary uppercase">SEVERITY:</span>
          {["ALL", "HIGH", "MEDIUM", "LOW"].map((sev) => (
            <button
              key={sev}
              onClick={() => setSeverityFilter(sev)}
              className={`px-3 py-1 border-2 transition-all font-bold ${
                severityFilter === sev 
                  ? "bg-text-primary text-[#F5F5F0] border-text-primary" 
                  : "border-transparent text-text-secondary hover:text-text-primary hover:border-text-primary"
              }`}
            >
              {sev}
            </button>
          ))}
        </div>

        {/* Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Anomalies List */}
          <div className="lg:col-span-8 space-y-4">
            <Card role="none" className="space-y-4">
              <h3 className="font-mono text-xs uppercase tracking-widest text-text-secondary font-bold border-b border-text-secondary/10 pb-2">
                Flagged Deviations
              </h3>

              <div className="space-y-3">
                <AnimatePresence>
                  {filteredAnomalies.length === 0 ? (
                    <div className="text-center py-12 font-mono text-xs text-text-secondary">
                      No anomalies present.
                    </div>
                  ) : (
                    filteredAnomalies.map((an) => (
                      <motion.div
                        key={an.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-4 border border-danger/30 bg-danger/5 font-mono text-xs text-text-secondary flex justify-between items-start gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-text-primary uppercase">{an.agentName}</span>
                            <span className="text-[10px] bg-danger text-surface px-1.5 uppercase font-bold">
                              {an.severity}
                            </span>
                          </div>
                          <p className="text-[11px] text-text-secondary">{an.description}</p>
                        </div>
                        <span className="text-[10px] text-text-secondary/60 shrink-0">{an.date}</span>
                      </motion.div>
                    ))
                  )}
                </AnimatePresence>
              </div>
            </Card>
          </div>

          {/* Actions taken log */}
          <div className="lg:col-span-4 space-y-6">
            <Card role="lender" className="space-y-4">
              <h3 className="font-mono text-xs uppercase tracking-widest text-text-secondary font-bold border-b border-text-secondary/10 pb-2">
                Actions taken
              </h3>

              <div className="space-y-3 font-mono text-xs text-text-secondary">
                {actionLogs.length === 0 ? (
                  <p className="text-center py-8 text-[11px] text-text-secondary">No recent mitigations.</p>
                ) : (
                  actionLogs.map((log) => (
                    <div key={log.id} className="p-3 border border-text-secondary/10 bg-text-secondary/5 space-y-1">
                      <p className="text-text-primary font-bold">{log.event_type}</p>
                      <span className="block text-[9px] text-text-secondary/60 text-right">{new Date(log.created_at).toLocaleString()}</span>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

        </div>

      </div>
    </div>
  );
}
