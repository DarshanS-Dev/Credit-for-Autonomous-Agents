"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { motion } from "framer-motion";

export default function PermissionDenied() {
  return (
    <div className="flex-1 min-h-[80vh] flex flex-col items-center justify-center p-6 bg-editorial-grid font-mono text-center space-y-6">
      
      {/* Scale-in shield icon */}
      <motion.div 
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
        className="text-danger"
      >
        <Icon name="shield" size={64} />
      </motion.div>

      {/* Blur-in text reveal */}
      <motion.div 
        initial={{ filter: "blur(10px)", opacity: 0 }}
        animate={{ filter: "blur(0px)", opacity: 1 }}
        transition={{ duration: 0.45 }}
        className="max-w-md space-y-2"
      >
        <h2 className="text-xl font-bold uppercase text-text-primary">
          Access restricted
        </h2>
        <p className="text-sm text-text-secondary">
          This page belongs to a different role. You don't have permission to view it.
        </p>
      </motion.div>

      <div className="pt-4">
        <Link href="/">
          <Button variant="primary">Back to your dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
