"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { getLenderProfile, updateLenderPolicy } from "@/lib/api/lenders";
import { toNumber } from "@/lib/api/types";
import { ApiError } from "@/lib/api/client";

export default function RiskPolicySettings() {
  const queryClient = useQueryClient();

  const { data: profile } = useQuery({
    queryKey: ["lender", "me"],
    queryFn: getLenderProfile,
  });

  const [maxExposure, setMaxExposure] = useState(5000);
  const [totalCap, setTotalCap] = useState(50000);
  const [minScore, setMinScore] = useState(60);
  const [categories, setCategories] = useState<string[]>(["content", "arbitrage", "devops"]);
  const [initialized, setInitialized] = useState(false);
  const [saveCompleted, setSaveCompleted] = useState(false);
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
      queryClient.invalidateQueries({ queryKey: ["lender"] });
      setSaveCompleted(true);
      setError(null);
      setTimeout(() => setSaveCompleted(false), 3000);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Save failed");
    },
  });

  const toggleCategory = (cat: string) => {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  return (
    <div className="flex-1 bg-editorial-grid py-10 px-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="border-b border-text-secondary/15 pb-6">
          <h1 className="font-mono text-xs uppercase text-text-secondary mb-1">RISK MANAGEMENT</h1>
          <h2 className="font-mono text-3xl font-extrabold uppercase">Risk Policy</h2>
          <p className="font-mono text-xs text-text-secondary mt-1 uppercase">Changes take effect immediately.</p>
        </div>

        {error && <p className="text-xs text-danger border border-danger/30 p-2">{error}</p>}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-6">
            <Card role="none" className="space-y-4">
              <h3 className="font-mono text-sm font-bold uppercase">Exposure limits</h3>
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span>MAX EXPOSURE PER AGENT</span>
                  <span>${maxExposure.toLocaleString()}</span>
                </div>
                <input type="range" min={500} max={10000} step={500} value={maxExposure} onChange={(e) => setMaxExposure(Number(e.target.value))} className="w-full" />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-2">
                  <span>TOTAL PLATFORM CAP</span>
                  <span>${totalCap.toLocaleString()}</span>
                </div>
                <input type="range" min={5000} max={100000} step={5000} value={totalCap} onChange={(e) => setTotalCap(Number(e.target.value))} className="w-full" />
              </div>
            </Card>

            <Card role="none" className="space-y-4">
              <h3 className="font-mono text-sm font-bold uppercase">Score thresholds</h3>
              <div className="flex justify-between text-xs mb-2">
                <span>MINIMUM SCORE (0–100)</span>
                <span>{minScore}</span>
              </div>
              <input type="range" min={10} max={90} step={5} value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} className="w-full" />
            </Card>

            <Card role="none" className="space-y-3">
              <h3 className="font-mono text-sm font-bold uppercase">Funded categories</h3>
              {["content", "arbitrage", "devops"].map((cat) => (
                <label key={cat} className="flex items-center gap-3 text-xs uppercase cursor-pointer">
                  <input type="checkbox" checked={categories.includes(cat)} onChange={() => toggleCategory(cat)} />
                  {cat}
                </label>
              ))}
            </Card>

            <div className="flex items-center gap-4">
              <Button variant="primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                Save Changes
              </Button>
              {saveCompleted && (
                <span className="font-mono text-xs text-base font-bold">✔ Saved. Enforced on future decisions.</span>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 lg:sticky lg:top-24">
            <Card role="lender" className="font-mono text-xs uppercase space-y-3">
              <h4 className="font-bold border-b pb-2">LIVE POLICY PREVIEW</h4>
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
