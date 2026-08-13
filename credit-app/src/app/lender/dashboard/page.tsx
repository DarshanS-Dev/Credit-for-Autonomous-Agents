"use client";

import React, { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/context/SessionContext";
import { getInsurancePool } from "@/lib/api/lenders";
import { getOperatorEvents } from "@/lib/api/operator";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/Icon";
import { Doodle } from "@/components/ui/Doodle";
import { LiveActivityFeed } from "@/components/lender/LiveActivityFeed";
import { gsap } from "gsap";
import { formatCurrency } from "@/lib/api/types";

export default function LenderDashboard() {
  const { session } = useSession();

  const { data: insurancePool } = useQuery({
    queryKey: ['insurance-pool', session?.id],
    queryFn: () => getInsurancePool(),
    enabled: !!session?.id,
    refetchInterval: 10000,
  });

  const { data: events = [] } = useQuery({
    queryKey: ['operator-events'],
    queryFn: () => getOperatorEvents(session?.token),
    refetchInterval: 5000,
    enabled: !!session?.id,
  });

  const [odometerValue, setOdometerValue] = useState(0);
  const odometerRef = useRef<HTMLSpanElement>(null);

  const loansCount = events.filter(e => e.event_type === 'loan_approved').length;

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
          <LiveActivityFeed events={events} />
        </div>
        <div className="lg:col-span-4 space-y-6">
          {/* Insurance Pool */}
          <Card role="none" className="space-y-3 border border-accent/30">
            <h3 className="font-mono text-xs uppercase tracking-widest text-accent font-bold border-b border-accent/10 pb-2">
              Insurance Pool
            </h3>
            <div className="font-mono">
              <span className="block text-[9px] text-text-secondary uppercase">Pool Balance</span>
              <span className="text-xl font-bold text-text-primary">
                ${insurancePool ? formatCurrency(insurancePool.balance) : '0.00'}
              </span>
              {insurancePool?.updated_at && (
                <span className="block text-[9px] text-text-secondary/60 mt-1">
                  Updated: {new Date(insurancePool.updated_at).toLocaleString()}
                </span>
              )}
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
