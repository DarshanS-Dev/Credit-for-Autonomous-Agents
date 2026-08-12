import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@/components/ui/Icon";
import { formatCurrency } from "@/lib/api/types";

interface ExposureDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  stats: {
    activeAgents: number;
    defaultedAgents: number;
    starterLimitAgents: number;
    totalCapitalOut: number;
    platformCap: number;
  };
  activeFilter: string | null;
  onFilterChange: (filter: string | null) => void;
}

export function ExposureDetailDrawer({
  isOpen,
  onClose,
  stats,
  activeFilter,
  onFilterChange,
}: ExposureDetailDrawerProps) {
  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    }
  }, [isOpen]);

  const { activeAgents, defaultedAgents, starterLimitAgents, totalCapitalOut, platformCap } = stats;
  const utilizationPercent = platformCap > 0 ? (totalCapitalOut / platformCap) * 100 : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 bg-[var(--navy)]/40 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          
          {/* Drawer */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed inset-y-0 right-0 w-full max-w-md bg-white border-l-4 border-text-primary shadow-[-8px_0_24px_rgba(31,36,42,0.15)] z-50 flex flex-col font-mono text-text-primary"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b-2 border-text-primary/10 bg-[#F5F5F0]">
              <h2 className="text-lg font-bold uppercase tracking-wider">Exposure Details</h2>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-text-primary/10 transition-colors"
                aria-label="Close drawer"
              >
                <Icon name="x" size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Capital Overview */}
              <div className="space-y-4">
                <h3 className="text-xs uppercase tracking-widest text-text-secondary font-bold">Capital Overview</h3>
                <div className="p-5 bg-[var(--cream)] border-2 border-text-primary shadow-[4px_4px_0px_rgba(31,36,42,1)] space-y-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <span className="block text-[10px] text-text-secondary uppercase mb-1">Total Capital Out</span>
                      <span className="text-3xl font-bold">${formatCurrency(totalCapitalOut)}</span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] text-text-secondary uppercase mb-1">Platform Cap</span>
                      <span className="text-xl font-bold text-text-secondary">${formatCurrency(platformCap)}</span>
                    </div>
                  </div>
                  
                  <div className="space-y-1 pt-2">
                    <div className="flex justify-between text-[10px] uppercase font-bold">
                      <span>Utilization</span>
                      <span>{utilizationPercent.toFixed(1)}%</span>
                    </div>
                    <div className="h-3 w-full bg-text-primary/10 overflow-hidden border border-text-primary/20">
                      <div 
                        className={`h-full ${utilizationPercent > 80 ? 'bg-[var(--status-red)]' : 'bg-[var(--status-teal)]'}`}
                        style={{ width: `${Math.min(utilizationPercent, 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Agent Status Filters */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs uppercase tracking-widest text-text-secondary font-bold">Agent Status</h3>
                  {activeFilter && (
                    <button 
                      onClick={() => onFilterChange(null)}
                      className="text-[10px] uppercase font-bold text-[var(--status-teal)] hover:underline"
                    >
                      Clear Filter
                    </button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 gap-3">
                  <button
                    onClick={() => onFilterChange(activeFilter === "active" ? null : "active")}
                    className={`flex items-center justify-between p-4 border-2 transition-all ${
                      activeFilter === "active" 
                        ? "border-text-primary bg-[var(--cream)] shadow-[4px_4px_0px_rgba(31,36,42,1)]" 
                        : "border-text-primary/20 hover:border-text-primary/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-[var(--status-teal)]" />
                      <span className="uppercase font-bold text-sm">Active</span>
                    </div>
                    <span className="text-xl font-bold">{activeAgents}</span>
                  </button>
                  
                  <button
                    onClick={() => onFilterChange(activeFilter === "starter" ? null : "starter")}
                    className={`flex items-center justify-between p-4 border-2 transition-all ${
                      activeFilter === "starter" 
                        ? "border-text-primary bg-[var(--cream)] shadow-[4px_4px_0px_rgba(31,36,42,1)]" 
                        : "border-text-primary/20 hover:border-text-primary/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-[var(--primary-yellow)]" />
                      <span className="uppercase font-bold text-sm">Starter Limit</span>
                    </div>
                    <span className="text-xl font-bold">{starterLimitAgents}</span>
                  </button>
                  
                  <button
                    onClick={() => onFilterChange(activeFilter === "defaulted" ? null : "defaulted")}
                    className={`flex items-center justify-between p-4 border-2 transition-all ${
                      activeFilter === "defaulted" 
                        ? "border-text-primary bg-[var(--cream)] shadow-[4px_4px_0px_rgba(31,36,42,1)]" 
                        : "border-text-primary/20 hover:border-text-primary/50"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 rounded-full bg-[var(--status-red)]" />
                      <span className="uppercase font-bold text-sm">Defaulted</span>
                    </div>
                    <span className="text-xl font-bold text-[var(--status-red)]">{defaultedAgents}</span>
                  </button>
                </div>
              </div>
            </div>
            
            <div className="p-6 border-t-2 border-text-primary/10 bg-[#F5F5F0]">
              <p className="text-[10px] text-text-secondary leading-relaxed">
                Clicking a status above will filter the Live Activity Feed on your dashboard to only show events related to agents in that state.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
