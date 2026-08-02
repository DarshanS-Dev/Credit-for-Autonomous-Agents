"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { gsap } from "gsap";
import { motion } from "framer-motion";
import { Icon } from "@/components/ui/Icon";
import type { SessionRole } from "@/lib/session";

export default function RoleSelectionPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<SessionRole | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const leftPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const leftInnerRef = useRef<HTMLDivElement>(null);
  const rightInnerRef = useRef<HTMLDivElement>(null);
  const dividerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        progressRef.current,
        { scaleX: 0 },
        { scaleX: 0.5, duration: 0.8, ease: "power3.out", transformOrigin: "left center" }
      );
      gsap.fromTo(
        [leftInnerRef.current, rightInnerRef.current],
        { y: 40, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, stagger: 0.12, ease: "power4.out", delay: 0.15 }
      );
      gsap.fromTo(
        dividerRef.current,
        { scale: 0.8, opacity: 0, rotation: -4 },
        { scale: 1, opacity: 1, rotation: 2, duration: 0.6, ease: "back.out(1.4)", delay: 0.4 }
      );
    }, containerRef);
    return () => ctx.revert();
  }, []);

  const handleSelectRole = (role: SessionRole) => {
    if (selectedRole) return;
    setSelectedRole(role);

    const tl = gsap.timeline({
      onComplete: () => router.push(`/login?role=${role}`),
    });

    if (dividerRef.current) {
      tl.to(dividerRef.current, { opacity: 0, scale: 0.8, duration: 0.15, ease: "power2.out" }, 0);
    }

    if (role === "principal") {
      tl.to(leftPanelRef.current, { width: "100vw", duration: 0.65, ease: "power2.inOut" }, 0);
      tl.to(
        rightPanelRef.current,
        { width: "0vw", paddingLeft: 0, paddingRight: 0, duration: 0.65, ease: "power2.inOut" },
        0
      );
      tl.to(rightInnerRef.current, { opacity: 0, x: 24, duration: 0.25, ease: "power2.in" }, 0);
    } else {
      tl.to(rightPanelRef.current, { width: "100vw", duration: 0.65, ease: "power2.inOut" }, 0);
      tl.to(
        leftPanelRef.current,
        { width: "0vw", paddingLeft: 0, paddingRight: 0, duration: 0.65, ease: "power2.inOut" },
        0
      );
      tl.to(leftInnerRef.current, { opacity: 0, x: -24, duration: 0.25, ease: "power2.in" }, 0);
    }
  };

  return (
    <div ref={containerRef} className="flex-1 min-h-screen flex flex-col relative overflow-hidden">
      <div className="relative z-40 flex items-center justify-between px-6 md:px-12 py-6 bg-[#F5F5F0] border-b-2 border-text-primary/10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest font-bold text-text-secondary hover:text-text-primary transition-colors group"
        >
          <Icon name="arrow-left" size={16} className="transition-transform group-hover:-translate-x-1" />
          Home
        </Link>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-secondary font-bold hidden sm:block">
            Step 01 — Role
          </span>
          <div className="h-1 w-24 bg-text-primary/10 overflow-hidden">
            <div ref={progressRef} className="h-full w-full bg-accent origin-left" />
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden">
        <div
          ref={leftPanelRef}
          onClick={() => handleSelectRole("principal")}
          className={`w-full md:w-1/2 min-h-[45vh] md:min-h-0 bg-[#F5F5F0] flex flex-col justify-center items-center p-8 border-b-2 md:border-b-0 md:border-r-2 border-text-primary relative z-10 cursor-pointer overflow-hidden ${
            !selectedRole ? "hover:bg-white" : ""
          }`}
        >
          <div
            ref={leftInnerRef}
            className="max-w-sm text-center relative z-20 flex flex-col items-center gap-6 min-w-[320px]"
          >
            <motion.div
              whileHover={!selectedRole ? { scale: 1.05, rotate: -2 } : {}}
              className="h-16 w-16 bg-white border-2 border-text-primary shadow-[4px_4px_0px_rgba(27,23,34,1)] flex items-center justify-center"
            >
              <Icon name="key" size={32} />
            </motion.div>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-base font-bold mb-2 block">
                Principal
              </span>
              <h2 className="font-mono text-3xl font-bold uppercase tracking-wider">Manage Agents</h2>
            </div>
            <p className="text-sm font-mono text-text-secondary leading-relaxed">
              Register autonomous agents, issue delegation credentials, and configure bounds of mandate.
            </p>
            <button
              className="px-8 py-3 bg-text-primary text-[#F5F5F0] font-mono text-sm uppercase tracking-widest font-bold border-2 border-text-primary"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectRole("principal");
              }}
            >
              Continue as Principal
            </button>
          </div>
        </div>

        <div
          ref={rightPanelRef}
          onClick={() => handleSelectRole("lender")}
          className={`w-full md:w-1/2 min-h-[45vh] md:min-h-0 bg-[#FDF3C8] flex flex-col justify-center items-center p-8 relative z-10 cursor-pointer overflow-hidden ${
            !selectedRole ? "hover:bg-[#FFF6D4]" : ""
          }`}
        >
          <div
            ref={rightInnerRef}
            className="max-w-sm text-center relative z-20 flex flex-col items-center gap-6 min-w-[320px]"
          >
            <motion.div
              whileHover={!selectedRole ? { scale: 1.05, rotate: 2 } : {}}
              className="h-16 w-16 bg-white border-2 border-text-primary shadow-[4px_4px_0px_rgba(27,23,34,1)] flex items-center justify-center"
            >
              <Icon name="policy" size={32} />
            </motion.div>
            <div>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent font-bold mb-2 block">
                Lender
              </span>
              <h2 className="font-mono text-3xl font-bold uppercase tracking-wider">Set Policy</h2>
            </div>
            <p className="text-sm font-mono text-text-secondary leading-relaxed">
              Define risk thresholds, monitor auto-approved loans, and detect anomalies in real time.
            </p>
            <button
              className="px-8 py-3 bg-white text-text-primary font-mono text-sm uppercase tracking-widest font-bold border-2 border-text-primary"
              onClick={(e) => {
                e.stopPropagation();
                handleSelectRole("lender");
              }}
            >
              Continue as Lender
            </button>
          </div>
        </div>

        <div
          ref={dividerRef}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none z-30 font-mono text-[12px] font-bold bg-white px-6 py-3 border-2 border-text-primary shadow-[4px_4px_0px_rgba(27,23,34,1)] rotate-2 hidden md:block"
        >
          Select Role
        </div>
      </div>
    </div>
  );
}
