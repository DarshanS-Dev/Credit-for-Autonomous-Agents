"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { usePathname } from "next/navigation";

/**
 * Minimal page transition — clean fade with a tiny upward shift.
 * No overlays, no wipes. Just a smooth, professional content swap.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
