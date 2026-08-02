"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Doodle } from "@/components/ui/Doodle";
import { gsap } from "gsap";
import { getLenderProfile, updateLenderPolicy } from "@/lib/api/lenders";
import { toNumber } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";

export default function LenderOnboarding() {
  const router = useRouter();

  const { data: profile } = useQuery({
    queryKey: ["lender", "me"],
    queryFn: getLenderProfile,
  });

  const [maxExposure, setMaxExposure] = useState(5000);
  const [totalCap, setTotalCap] = useState(50000);
  const [minScore, setMinScore] = useState(60);
  const [categories, setCategories] = useState<string[]>(["content", "arbitrage", "devops"]);
  const [initialized, setInitialized] = useState(false);
  const [policySaved, setPolicySaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (profile && !initialized) {
    setMaxExposure(toNumber(profile.max_exposure_per_agent) || 5000);
    setTotalCap(toNumber(profile.total_platform_exposure_cap) || 50000);
    setMinScore(toNumber(profile.min_score_required) || 60);
    setCategories(profile.allowed_agent_categories.length ? profile.allowed_agent_categories : categories);
    setInitialized(true);
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      updateLenderPolicy({
        max_exposure_per_agent: maxExposure,
        total_platform_exposure_cap: totalCap,
        min_score_required: minScore,
        allowed_agent_categories: categories,
      }),
    onSuccess: () => {
      setPolicySaved(true);
      setError(null);
      const curtain = document.createElement("div");
      curtain.className = "fixed inset-0 bg-base z-50 transform translate-x-full";
      document.body.appendChild(curtain);
      gsap.timeline({
        onComplete: () => {
          router.push("/lender/dashboard");
          setTimeout(() => curtain.remove(), 100);
        },
      })
        .to(curtain, { x: "0%", duration: 0.6, ease: "power4.inOut" })
        .to(curtain, { x: "-100%", duration: 0.6, ease: "power4.inOut" }, "+=0.2");
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Failed to save policy");
    },
  });

  const toggleCategory = (cat: string) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  return (
    <div className="flex-1 bg-editorial-grid py-12 px-6 font-mono text-text-primary">
      <div className="max-w-4xl mx-auto">
        <div className="mb-12 border-b border-text-secondary/15 pb-6">
          <h1 className="font-mono text-xs uppercase tracking-widest text-base font-bold mb-3">
            Lender Onboarding
          </h1>
          <h2 className="font-mono text-3xl font-extrabold uppercase flex items-center gap-3">
            Set your risk policy <Doodle type="sparkle" size={24} />
          </h2>
        </div>

        {error && <p className="mb-4 text-xs text-danger border border-danger/30 p-2">{error}</p>}

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-8 space-y-6">
            <Card role="none" className="space-y-4">
              <h3 className="font-mono text-sm font-bold uppercase">1. Exposure limits</h3>
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span>MAX EXPOSURE PER AGENT</span>
                  <span className="font-bold">${maxExposure.toLocaleString()}</span>
                </div>
                <input type="range" min={500} max={10000} step={500} value={maxExposure} onChange={(e) => setMaxExposure(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span>TOTAL PLATFORM CAP</span>
                  <span className="font-bold">${totalCap.toLocaleString()}</span>
                </div>
                <input type="range" min={5000} max={100000} step={5000} value={totalCap} onChange={(e) => setTotalCap(Number(e.target.value))} className="w-full" />
              </div>
            </Card>

            <Card role="none" className="space-y-4">
              <h3 className="font-mono text-sm font-bold uppercase">2. Score thresholds</h3>
              <div className="flex justify-between text-xs mb-2">
                <span>MINIMUM SCORE (0–100)</span>
                <span className="font-bold">{minScore}</span>
              </div>
              <input type="range" min={10} max={90} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-full" />
            </Card>

            <Card role="none" className="space-y-4">
              <h3 className="font-mono text-sm font-bold uppercase">3. Funded categories</h3>
              {["content", "arbitrage", "devops"].map((cat) => (
                <label key={cat} className="flex items-center gap-3 text-xs uppercase cursor-pointer">
                  <input type="checkbox" checked={categories.includes(cat)} onChange={() => toggleCategory(cat)} />
                  {cat}
                </label>
              ))}
            </Card>

            {!policySaved ? (
              <Button variant="primary" onClick={() => saveMutation.mutate()} className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save & Go to Dashboard"}
              </Button>
            ) : (
              <p className="text-center font-mono text-sm">Policy saved. Redirecting…</p>
            )}
          </div>

          <div className="md:col-span-4">
            <Card role="lender" className="font-mono text-xs uppercase space-y-3">
              <h4 className="font-bold border-b pb-2">POLICY PREVIEW</h4>
              <div>Single agent cap: ${maxExposure.toLocaleString()}</div>
              <div>Platform cap: ${totalCap.toLocaleString()}</div>
              <div>Min score: ≥ {minScore}</div>
              <div>Categories: {categories.join(", ") || "NONE"}</div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
