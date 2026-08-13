"use client";

import React, { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@/components/ui/Icon";
import ShapeGrid from "@/components/ui/ShapeGrid";
import { useSession } from "@/context/SessionContext";
import { getLenderDirectory } from "@/lib/api/lenders";
import { LenderDirectoryEntry, formatCurrency, toNumber } from "@/lib/api/types";

const FALLBACK_LENDERS: LenderDirectoryEntry[] = [
    {
        id: 1,
        name: "Alpha Liquidity Vault",
        min_score_required: 650,
        max_exposure_per_agent: 50000,
        total_platform_exposure_cap: 250000,
        allowed_agent_categories: ["trading", "execution", "data_processing"],
    },
    {
        id: 2,
        name: "Apex Autonomous Pool",
        min_score_required: 700,
        max_exposure_per_agent: 100000,
        total_platform_exposure_cap: 500000,
        allowed_agent_categories: ["trading", "arbitrage"],
    },
    {
        id: 3,
        name: "Sentinel Capital Vault",
        min_score_required: 600,
        max_exposure_per_agent: 25000,
        total_platform_exposure_cap: 150000,
        allowed_agent_categories: ["data_processing", "execution", "e_commerce"],
    },
    {
        id: 4,
        name: "Vanguard Micro-Credit",
        min_score_required: 580,
        max_exposure_per_agent: 15000,
        total_platform_exposure_cap: 100000,
        allowed_agent_categories: ["execution", "general"],
    },
];

// Sticky note background variations (No pure white)
const STICKY_STYLES = [
    { bg: "bg-[#FDF3C8]", rotate: "rotate-1", accent: "#F0B419", pinBg: "bg-amber-400/40" },
    { bg: "bg-[#E9EDF6]", rotate: "-rotate-1", accent: "#017587", pinBg: "bg-sky-400/40" },
    { bg: "bg-[#F0F0EA]", rotate: "rotate-[0.5deg]", accent: "#1F242A", pinBg: "bg-slate-400/40" },
    { bg: "bg-[#FFF4D6]", rotate: "-rotate-[1deg]", accent: "#D97706", pinBg: "bg-yellow-400/40" },
];

export default function LenderMarketplacePage() {
    const { session } = useSession();
    const [lenders, setLenders] = useState<LenderDirectoryEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState<string>("all");

    useEffect(() => {
        async function loadDirectory() {
            try {
                setIsLoading(true);
                const data = await getLenderDirectory(session?.token);
                if (data && data.length > 0) {
                    setLenders(data);
                } else {
                    setLenders(FALLBACK_LENDERS);
                }
            } catch (err) {
                console.warn("Failed to fetch lender directory, using fallback data:", err);
                setLenders(FALLBACK_LENDERS);
            } finally {
                setIsLoading(false);
            }
        }
        loadDirectory();
    }, [session?.token]);

    // Extract all categories dynamically
    const categories = useMemo(() => {
        const set = new Set<string>();
        lenders.forEach((lender) => {
            lender.allowed_agent_categories?.forEach((cat) => set.add(cat));
        });
        return ["all", ...Array.from(set)];
    }, [lenders]);

    // Filter lenders
    const filteredLenders = useMemo(() => {
        return lenders.filter((lender) => {
            const matchesSearch =
                lender.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                lender.id.toString().includes(searchQuery);

            const matchesCategory =
                selectedCategory === "all" ||
                lender.allowed_agent_categories?.includes(selectedCategory);

            return matchesSearch && matchesCategory;
        });
    }, [lenders, searchQuery, selectedCategory]);

    // Aggregate stats
    const totalPlatformCap = useMemo(() => {
        return lenders.reduce((acc, curr) => acc + toNumber(curr.total_platform_exposure_cap), 0);
    }, [lenders]);

    const avgMinScore = useMemo(() => {
        if (lenders.length === 0) return 0;
        const sum = lenders.reduce((acc, curr) => acc + toNumber(curr.min_score_required), 0);
        return Math.round(sum / lenders.length);
    }, [lenders]);

    return (
        <div className="relative min-h-screen bg-[#F5F5F0] pt-24 pb-20 px-4 md:px-8 font-mono text-text-primary">
            {/* Background shape grid */}
            <div className="fixed inset-0 z-0 pointer-events-none opacity-40">
                <ShapeGrid
                    speed={0.25}
                    squareSize={36}
                    direction="diagonal"
                    borderColor="rgba(27,23,34,0.06)"
                    hoverFillColor="#FDF3C8"
                    shape="square"
                    hoverTrailAmount={2}
                />
            </div>

            <div className="relative z-10 max-w-7xl mx-auto space-y-8">
                {/* Header Section */}
                <div className="border-b border-text-primary/20 pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <span className="font-mono text-[9px] uppercase tracking-[0.2em] font-bold px-2.5 py-0.5 bg-[#FDF3C8] border border-text-primary rounded-full shadow-[2px_2px_0px_rgba(27,23,34,1)] text-[#017587]">
                                CAPITAL MARKETS
                            </span>
                            <span className="font-mono text-xs font-bold text-text-secondary uppercase">
                // LENDER DIRECTORY
                            </span>
                        </div>
                        <h1 className="font-mono text-3xl md:text-4xl font-extrabold uppercase tracking-tight text-text-primary">
                            Lender Marketplace
                        </h1>
                        <p className="font-mono text-xs md:text-sm text-text-secondary mt-1 max-w-2xl">
                            Explore registered liquidity providers, risk limits, and score requirements across the autonomous agent network.
                        </p>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-2 px-3.5 py-1.5 bg-[#FDF3C8] border-2 border-text-primary rounded-xl shadow-[3px_3px_0px_rgba(27,23,34,1)] text-xs font-bold text-text-primary">
                            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                            {lenders.length} Active Lenders
                        </span>
                    </div>
                </div>

                {/* Sticky Note Top Metrics Bar */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                    {/* Metric 1 */}
                    <div className="relative bg-[#FDF3C8] border-2 border-text-primary p-5 rounded-2xl shadow-[5px_5px_0px_rgba(27,23,34,1)] -rotate-1">
                        {/* Sticky perforations */}
                        <div className="absolute top-2 left-0 w-full flex justify-between px-6 pointer-events-none">
                            <div className="w-2 h-2 bg-text-primary/20 rounded-full" />
                            <div className="w-2 h-2 bg-text-primary/20 rounded-full" />
                            <div className="w-2 h-2 bg-text-primary/20 rounded-full" />
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-text-secondary font-bold mb-1">
                                    Active Lenders
                                </p>
                                <p className="text-2xl font-bold text-text-primary">
                                    {isLoading ? "..." : lenders.length}
                                </p>
                            </div>
                            <div className="w-10 h-10 rounded-xl bg-white/70 border-2 border-text-primary flex items-center justify-center text-text-primary shadow-sm">
                                <Icon name="directory" size={20} />
                            </div>
                        </div>
                    </div>

                    {/* Metric 2 */}
                    <div className="relative bg-[#E9EDF6] border-2 border-text-primary p-5 rounded-2xl shadow-[5px_5px_0px_rgba(27,23,34,1)] rotate-1">
                        <div className="absolute top-2 left-0 w-full flex justify-between px-6 pointer-events-none">
                            <div className="w-2 h-2 bg-text-primary/20 rounded-full" />
                            <div className="w-2 h-2 bg-text-primary/20 rounded-full" />
                            <div className="w-2 h-2 bg-text-primary/20 rounded-full" />
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-text-secondary font-bold mb-1">
                                    Platform Exposure Cap
                                </p>
                                <p className="text-2xl font-bold text-[#017587]">
                                    {isLoading ? "..." : `$${formatCurrency(totalPlatformCap)}`}
                                </p>
                            </div>
                            <div className="w-10 h-10 rounded-xl bg-accent border-2 border-text-primary flex items-center justify-center text-text-primary shadow-sm">
                                <Icon name="wallet" size={20} />
                            </div>
                        </div>
                    </div>

                    {/* Metric 3 */}
                    <div className="relative bg-[#F0F0EA] border-2 border-text-primary p-5 rounded-2xl shadow-[5px_5px_0px_rgba(27,23,34,1)] -rotate-[0.5deg]">
                        <div className="absolute top-2 left-0 w-full flex justify-between px-6 pointer-events-none">
                            <div className="w-2 h-2 bg-text-primary/20 rounded-full" />
                            <div className="w-2 h-2 bg-text-primary/20 rounded-full" />
                            <div className="w-2 h-2 bg-text-primary/20 rounded-full" />
                        </div>
                        <div className="mt-2 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] uppercase tracking-wider text-text-secondary font-bold mb-1">
                                    Avg Min Score
                                </p>
                                <p className="text-2xl font-bold text-text-primary">
                                    {isLoading ? "..." : `${avgMinScore} PTS`}
                                </p>
                            </div>
                            <div className="w-10 h-10 rounded-xl bg-[#FDF3C8] border-2 border-text-primary flex items-center justify-center text-[#017587] shadow-sm">
                                <Icon name="shield" size={20} />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Filter & Search Bar */}
                <div className="bg-[#FDF3C8]/60 border-2 border-text-primary p-4 rounded-2xl shadow-[6px_6px_0px_rgba(27,23,34,1)] flex flex-col md:flex-row gap-4 items-center justify-between">
                    {/* Search Input */}
                    <div className="relative w-full md:w-80">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search lender name or ID..."
                            className="w-full pl-9 pr-4 py-2.5 text-xs font-mono border-2 border-text-primary rounded-xl bg-[#F5F5F0] focus:bg-white outline-none transition-all"
                        />
                        <Icon name="terminal" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" />
                    </div>

                    {/* Category Filter Pills */}
                    <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
                        <span className="text-[10px] uppercase tracking-wider text-text-secondary font-bold shrink-0 mr-1">
                            Category:
                        </span>
                        {categories.map((cat) => {
                            const active = selectedCategory === cat;
                            return (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={`px-3 py-1.5 rounded-lg border-2 text-[10px] font-bold uppercase tracking-wider shrink-0 transition-all ${active
                                        ? "bg-text-primary text-[#F5F5F0] border-text-primary shadow-[2px_2px_0px_rgba(27,23,34,1)]"
                                        : "bg-[#F5F5F0] border-text-primary/30 text-text-secondary hover:border-text-primary hover:text-text-primary"
                                        }`}
                                >
                                    {cat.replace("_", " ")}
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Directory Cards (Sticky-note design) */}
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map((n) => (
                            <div
                                key={n}
                                className="h-64 bg-[#FDF3C8]/40 border-2 border-dashed border-text-primary/30 rounded-2xl animate-pulse"
                            />
                        ))}
                    </div>
                ) : filteredLenders.length === 0 ? (
                    <div className="bg-[#FDF3C8] border-2 border-text-primary rounded-2xl p-12 text-center shadow-[6px_6px_0px_rgba(27,23,34,1)]">
                        <Icon name="warning" size={32} className="mx-auto text-text-secondary mb-3" />
                        <h3 className="text-lg font-bold text-text-primary uppercase">No Lenders Found</h3>
                        <p className="text-xs text-text-secondary mt-1">
                            Try adjusting your search query or category filters.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <AnimatePresence>
                            {filteredLenders.map((lender, index) => {
                                const style = STICKY_STYLES[index % STICKY_STYLES.length];

                                return (
                                    <motion.div
                                        key={lender.id}
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.3, delay: index * 0.05 }}
                                        className={`relative ${style.bg} border-2 border-text-primary rounded-2xl shadow-[6px_6px_0px_rgba(27,23,34,1)] p-6 flex flex-col justify-between hover:shadow-[8px_8px_0px_rgba(27,23,34,1)] hover:-translate-y-1 transition-all ${style.rotate} group`}
                                    >
                                        {/* Sticky Note Top Perforations / Binding Marks */}
                                        <div className="absolute top-2 left-0 w-full flex justify-between px-6 pointer-events-none">
                                            <div className="w-2.5 h-2.5 bg-text-primary/15 rounded-sm" />
                                            <div className="w-2.5 h-2.5 bg-text-primary/15 rounded-sm" />
                                            <div className="w-2.5 h-2.5 bg-text-primary/15 rounded-sm" />
                                            <div className="w-2.5 h-2.5 bg-text-primary/15 rounded-sm" />
                                        </div>

                                        {/* Card Content */}
                                        <div className="mt-2">
                                            <div className="flex items-center justify-between gap-2 mb-3">
                                                <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 bg-white border border-text-primary rounded-md text-text-primary shadow-[1.5px_1.5px_0px_rgba(27,23,34,1)]">
                                                    Lender #{lender.id.toString().padStart(2, "0")}
                                                </span>
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Active Policy
                                                </span>
                                            </div>

                                            <h3 className="text-lg font-bold text-text-primary group-hover:text-[#017587] transition-colors mb-4">
                                                {lender.name}
                                            </h3>

                                            {/* Metrics Breakdown */}
                                            <div className="space-y-2.5 bg-white/80 border border-text-primary/20 rounded-xl p-3.5 mb-4 shadow-inner">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-text-secondary text-[11px]">Required Min Score:</span>
                                                    <span className="font-bold text-text-primary bg-[#F5F5F0] px-2 py-0.5 border border-text-primary/20 rounded">
                                                        {toNumber(lender.min_score_required)} PTS
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-text-secondary text-[11px]">Max Exposure / Agent:</span>
                                                    <span className="font-bold text-text-primary font-mono">
                                                        ${formatCurrency(lender.max_exposure_per_agent)}
                                                    </span>
                                                </div>
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="text-text-secondary text-[11px]">Total Platform Cap:</span>
                                                    <span className="font-bold text-[#017587] font-mono">
                                                        ${formatCurrency(lender.total_platform_exposure_cap)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Allowed Agent Categories */}
                                        <div>
                                            <p className="text-[10px] uppercase font-bold text-text-secondary tracking-wider mb-2">
                                                Approved Agent Categories
                                            </p>
                                            <div className="flex flex-wrap gap-1.5">
                                                {lender.allowed_agent_categories?.map((cat) => (
                                                    <span
                                                        key={cat}
                                                        className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 bg-white/90 border border-text-primary/30 rounded-md text-text-primary shadow-sm"
                                                    >
                                                        {cat.replace("_", " ")}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                )}
            </div>
        </div>
    );
}
