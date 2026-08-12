import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { EventOut } from "@/lib/api/types";
import { formatTime } from "@/lib/api/types";

interface LiveActivityFeedProps {
  events: EventOut[];
}

export function LiveActivityFeed({ events }: LiveActivityFeedProps) {
  return (
    <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
      <AnimatePresence initial={false}>
        {events.length === 0 ? (
          <div className="text-center py-16 font-mono text-xs text-text-secondary">
            No activity yet.
          </div>
        ) : (
          events.map((item) => {
            let badgeColor = "bg-text-secondary";
            let borderColor = "border-text-secondary/10";
            
            if (item.event_type === "loan_approved") {
              badgeColor = "bg-[var(--status-teal)] animate-pulse";
              borderColor = "border-[var(--status-teal)]/20";
            } else if (item.event_type.includes("revoked") || item.event_type.includes("defaulted")) {
              badgeColor = "bg-[var(--status-red)]";
              borderColor = "border-[var(--status-red)]/20";
            } else if (item.event_type.includes("anomaly")) {
              badgeColor = "bg-[var(--primary-yellow)]";
              borderColor = "border-[var(--primary-yellow)]/20";
            }

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.26 }}
                className={`p-3 bg-[var(--cream)] border-l-4 ${borderColor} border-t border-r border-b border-t-text-secondary/10 border-r-text-secondary/10 border-b-text-secondary/10 flex items-center justify-between font-mono text-xs hover:shadow-[4px_4px_0px_rgba(27,23,34,0.05)] transition-shadow`}
                style={{ borderLeftColor: badgeColor.includes('teal') ? 'var(--status-teal)' : badgeColor.includes('red') ? 'var(--status-red)' : badgeColor.includes('yellow') ? 'var(--primary-yellow)' : 'var(--text-secondary)' }}
              >
                <div className="flex items-center gap-4 flex-1">
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${badgeColor}`} />
                  <div className="flex flex-col gap-1 w-full max-w-[280px]">
                    <span className="text-text-primary font-bold">{item.event_type.toUpperCase().replace('_', ' ')}</span>
                    <span className="text-[10px] text-text-secondary truncate">{item.detail}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0 ml-4">
                  <span className="text-text-primary font-bold">
                    {item.loan_id ? `L-${item.loan_id}` : `A-${item.agent_id}`}
                  </span>
                  <span className="text-[10px] text-text-secondary/60">
                    {formatTime(item.created_at)}
                  </span>
                </div>
              </motion.div>
            );
          })
        )}
      </AnimatePresence>
    </div>
  );
}
