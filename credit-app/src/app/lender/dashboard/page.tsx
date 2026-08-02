"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/context/SessionContext";
import { getExposureStats } from "@/lib/api/lenders";
import { getOperatorEvents } from "@/lib/api/operator";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Doodle } from "@/components/ui/Doodle";
import { motion, AnimatePresence } from "framer-motion";
import { gsap } from "gsap";

export default function LenderDashboard() {
  const { session } = useSession();

  const { data: stats } = useQuery({
    queryKey: ['lender-exposure', session?.id],
    queryFn: () => getExposureStats(session?.token),
    enabled: !!session?.id,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['operator-events'],
    queryFn: () => getOperatorEvents(session?.token),
    refetchInterval: 5000,
    enabled: !!session?.id,
  });

  const [odometerValue, setOdometerValue] = useState(0);
  const odometerRef = useRef<HTMLSpanElement>(null);
  
  const loansCount = events.filter(e => e.event_type === 'loan_issued').length;

  useEffect(() => {
    if (loansCount !== odometerValue) {
      const obj = { value: odometerValue };
      gsap.to(obj, {
        value: loansCount,
        duration: 0.8,
        ease: "power2.out",
        onUpdate: () => {
          setOdometerValue(Math.floor(obj.value));
        },
      });
    }
  }, [loansCount, odometerValue]);

  const activeAgents = stats?.active_agents || 0;
  const defaultedAgents = stats?.defaulted_agents || 0;
  const starterLimitAgents = 0; // Not tracked directly on backend
  
  const totalCapitalOut = stats?.total_capital_out || 0;
  const platformCap = stats?.platform_exposure_cap || 0;

  const totalSegments = 10;
  const activeSegments = platformCap > 0 ? Math.min(
    totalSegments,
    Math.round((totalCapitalOut / platformCap) * totalSegments)
  ) : 0;

  return (
    <div className="flex-1 bg-editorial-grid py-10 px-6 font-mono text-text-primary">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-6">
          <div className="flex justify-between items-center border-b border-text-secondary/15 pb-6">
            <div>
              <h1 className="font-mono text-xs uppercase tracking-widest text-text-secondary mb-1">
                LENDER PANEL
              </h1>
              <h2 className="font-mono text-3xl font-extrabold text-text-primary uppercase">
                Live Activity
              </h2>
            </div>
            <div className="p-4 border-2 border-text-primary flex flex-col items-center justify-center min-w-[160px]">
              <span className="font-mono text-[9px] text-text-primary/70 uppercase tracking-wider mb-1 flex items-center gap-1">
                Loans Auto-Decided <Doodle type="scribble" size={12} />
              </span>
              <span ref={odometerRef} className="font-mono text-2xl font-bold text-text-primary">
                {odometerValue}
              </span>
            </div>
          </div>
          <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
            <AnimatePresence initial={false}>
              {events.length === 0 ? (
                <div className="text-center py-16 font-mono text-xs text-text-secondary">
                  No activity yet.
                </div>
              ) : (
                events.map((item) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.26 }}
                    className="p-4 bg-surface border border-text-secondary/10 flex items-center justify-between font-mono text-xs"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`h-2 w-2 rounded-full ${
                        item.event_type === "loan_issued" ? "bg-text-primary animate-pulse" :
                        item.event_type.includes("revoked") || item.event_type.includes("defaulted") ? "bg-danger" : "bg-text-secondary"
                      }`} />
                      <span className="text-text-primary border border-text-primary px-1">{item.event_type}</span>
                    </div>
                    <span className="text-[10px] text-text-secondary/60">{new Date(item.created_at).toLocaleString()}</span>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
        <div className="lg:col-span-4 space-y-6">
          <Card role="lender" className="space-y-6">
            <h3 className="font-mono text-sm font-bold uppercase tracking-wider text-text-primary border-b border-text-secondary/15 pb-2">
              Exposure
            </h3>
            <div className="grid grid-cols-2 gap-4 font-mono">
              <div>
                <span className="block text-[10px] text-text-secondary uppercase">Capital Out</span>
                <span className="text-lg font-bold text-text-primary">${totalCapitalOut.toLocaleString()}</span>
              </div>
              <div>
                <span className="block text-[10px] text-text-secondary uppercase">Exposure Cap</span>
                <span className="text-lg font-bold text-text-secondary">${platformCap.toLocaleString()}</span>
              </div>
            </div>
            <div className="space-y-2">
              <span className="block font-mono text-[9px] text-text-secondary/70 uppercase">Cap Allocation</span>
              <div className="flex gap-1.5 justify-between">
                {Array.from({ length: totalSegments }).map((_, i) => (
                    <span
                      key={i}
                      className={`h-5 w-3 rounded-none transition-all duration-300 ${
                        i < activeSegments 
                          ? ((totalCapitalOut / platformCap) > 0.8 ? "bg-danger" : "bg-text-primary") 
                          : "border border-text-primary bg-transparent"
                      }`}
                    />
                ))}
              </div>
            </div>
            <div className="border-t border-text-secondary/10 pt-4 grid grid-cols-3 gap-2 font-mono text-center text-xs">
              <div className="border-r border-text-secondary/10">
                <span className="block text-[9px] text-text-secondary uppercase">Active</span>
                <span className="font-bold text-base">{activeAgents}</span>
              </div>
              <div className="border-r border-text-secondary/10">
                <span className="block text-[9px] text-text-secondary uppercase">Starter</span>
                <span className="font-bold text-text-secondary">{starterLimitAgents}</span>
              </div>
              <div>
                <span className="block text-[9px] text-text-secondary uppercase">Defaulted</span>
                <span className="font-bold text-danger">{defaultedAgents}</span>
              </div>
            </div>
          </Card>
          <Card role="none" className="space-y-4">
            <h3 className="font-mono text-xs uppercase tracking-widest text-text-secondary font-bold border-b border-text-secondary/10 pb-2">
              Manage Rails
            </h3>
            <div className="space-y-2">
              <Link href="/lender/agents" className="flex items-center justify-between p-3 border-2 border-transparent hover:border-text-primary hover:translate-x-1 transition-all duration-200 group bg-[#F5F5F0]">
                <div className="font-mono text-xs">
                  <span className="font-bold text-text-primary block">AGENT DIRECTORY</span>
                  <span className="text-[10px] text-text-secondary">Evaluate agent metrics & detail</span>
                </div>
                <Icon name="chevron-right" size={16} className="text-text-secondary group-hover:text-accent" />
              </Link>
              <Link href="/lender/policy" className="flex items-center justify-between p-3 border-2 border-transparent hover:border-text-primary hover:translate-x-1 transition-all duration-200 group bg-[#F5F5F0]">
                <div className="font-mono text-xs">
                  <span className="font-bold text-text-primary block">RISK POLICY</span>
                  <span className="text-[10px] text-text-secondary">Manage algorithmic limits</span>
                </div>
                <Icon name="chevron-right" size={16} className="text-text-secondary group-hover:text-accent" />
              </Link>
              <Link href="/lender/anomalies" className="flex items-center justify-between p-3 border-2 border-transparent hover:border-text-primary hover:translate-x-1 transition-all duration-200 group bg-[#F5F5F0]">
                <div className="font-mono text-xs">
                  <span className="font-bold text-text-primary block">ANOMALY FEED</span>
                  <span className="text-[10px] text-text-secondary">Log of alerts & risk revocations</span>
                </div>
                <Icon name="chevron-right" size={16} className="text-text-secondary group-hover:text-accent" />
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
