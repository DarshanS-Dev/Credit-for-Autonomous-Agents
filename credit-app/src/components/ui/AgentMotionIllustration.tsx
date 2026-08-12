"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Icon } from "@/components/ui/Icon";

interface AgentMotionIllustrationProps {
    mode?: "login" | "signup";
}

export const AgentMotionIllustration: React.FC<AgentMotionIllustrationProps> = ({ mode = "login" }) => {
    const isLogin = mode === "login";

    return (
        <div className="relative w-full max-w-[320px] aspect-square flex items-center justify-center mx-auto my-2">
            {/* Outer Glow aura - shifts color based on mode */}
            <motion.div
                className="absolute inset-4 rounded-full blur-2xl opacity-60"
                animate={{
                    backgroundColor: isLogin ? "rgba(1, 117, 135, 0.15)" : "rgba(240, 180, 25, 0.25)",
                    scale: [1, 1.05, 1],
                }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Rotating Outer Ring (Clockwise) */}
            <motion.div
                className="absolute inset-0 border-2 border-dashed border-[#1F242A]/20 rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: isLogin ? 40 : 25, repeat: Infinity, ease: "linear" }}
            />

            {/* Rotating Middle Ring (Counter-Clockwise) */}
            <motion.div
                className="absolute inset-8 border border-text-primary/30 rounded-full"
                animate={{ rotate: -360 }}
                transition={{ duration: isLogin ? 25 : 15, repeat: Infinity, ease: "linear" }}
            />

            {/* Inner Accent Ring */}
            <motion.div
                className="absolute inset-16 border-2 border-accent/40 rounded-full"
                animate={{ rotate: 360 }}
                transition={{ duration: 15, repeat: Infinity, ease: "linear" }}
            />

            {/* Central Agent Core Node */}
            <motion.div
                className="relative z-10 w-24 h-24 bg-white border-2 border-text-primary rounded-2xl shadow-[4px_4px_0px_rgba(27,23,34,1)] flex flex-col items-center justify-center gap-1.5 overflow-hidden"
                animate={{ y: [-4, 4, -4], scale: [1, 1.02, 1] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
                <motion.div
                    className="w-10 h-10 rounded-xl bg-[#017587] text-white flex items-center justify-center shadow-inner"
                    animate={{ rotate: isLogin ? 0 : 180 }}
                    transition={{ duration: 0.5, ease: "backOut" }}
                >
                    <Icon name={isLogin ? "terminal" : "key"} size={22} className="text-accent" />
                </motion.div>

                <AnimatePresence mode="wait">
                    <motion.span
                        key={mode}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.2 }}
                        className="font-mono text-[9px] font-bold uppercase tracking-wider text-text-primary text-center px-1"
                    >
                        {isLogin ? "AGENT CORE" : "NEW MANDATE"}
                    </motion.span>
                </AnimatePresence>
            </motion.div>

            {/* Floating Badge 1: Cryptographic Mandate Status */}
            <motion.div
                className="absolute top-2 right-2 z-20 bg-white border-2 border-text-primary px-3 py-1.5 rounded-lg shadow-[3px_3px_0px_rgba(27,23,34,1)] flex items-center gap-2"
                animate={{ y: [-6, 6, -6], x: [-2, 2, -2] }}
                transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
            >
                <span className={`h-2 w-2 rounded-full ${isLogin ? "bg-emerald-500 animate-ping" : "bg-accent animate-pulse"}`} />
                <Icon name="key" size={14} className="text-[#017587]" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-tight text-text-primary">
                    {isLogin ? "Ed25519 Signed" : "Gen Keypair"}
                </span>
            </motion.div>

            {/* Floating Badge 2: Delegated Credit */}
            <motion.div
                className="absolute bottom-4 left-0 z-20 bg-accent border-2 border-text-primary px-3 py-1.5 rounded-lg shadow-[3px_3px_0px_rgba(27,23,34,1)] flex items-center gap-2"
                animate={{ y: [6, -6, 6], x: [2, -2, 2] }}
                transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
            >
                <Icon name="wallet" size={14} className="text-text-primary" />
                <span className="font-mono text-[10px] font-bold uppercase tracking-tight text-text-primary">
                    $100k Credit Line
                </span>
            </motion.div>

            {/* Floating Badge 3: Risk Policy Safeguard */}
            <motion.div
                className="absolute bottom-6 right-0 z-20 bg-white border-2 border-text-primary px-3 py-1 rounded-md shadow-[2px_2px_0px_rgba(27,23,34,1)] flex items-center gap-1.5"
                animate={{ y: [-5, 5, -5] }}
                transition={{ duration: 3.8, repeat: Infinity, ease: "easeInOut", delay: 0.2 }}
            >
                <Icon name="shield" size={12} className="text-danger" />
                <span className="font-mono text-[9px] font-bold uppercase text-text-primary">
                    Risk Policy OK
                </span>
            </motion.div>

            {/* Orbital Beam Pulses */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                <line x1="50%" y1="50%" x2="80%" y2="20%" stroke="#1F242A" strokeWidth="1.5" strokeDasharray="3 3" />
                <line x1="50%" y1="50%" x2="20%" y2="80%" stroke="#1F242A" strokeWidth="1.5" strokeDasharray="3 3" />
            </svg>
        </div>
    );
};

export default AgentMotionIllustration;
