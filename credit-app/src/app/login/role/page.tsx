"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { gsap } from "gsap";
import { motion } from "framer-motion";
import { Icon } from "@/components/ui/Icon";
import type { SessionRole } from "@/lib/session";

type RoleOption = SessionRole | "operator";

const roleCards: Array<{
  key: RoleOption;
  label: string;
  title: string;
  description: string;
  icon: "key" | "policy" | "terminal";
  accent: string;
  tint: string;
  buttonClass: string;
  textClass: string;
  route: string;
}> = [
  {
    key: "principal",
    label: "Principal",
    title: "Manage Agents",
    description: "Register autonomous agents, issue delegation credentials, and configure bounds of mandate.",
    icon: "key",
    accent: "text-base",
    tint: "bg-[#F5F5F0]",
    buttonClass: "bg-text-primary text-[#F5F5F0]",
    textClass: "text-text-primary",
    route: "/login?role=principal",
  },
  {
    key: "lender",
    label: "Lender",
    title: "Set Policy",
    description: "Define risk thresholds, monitor auto-approved loans, and detect anomalies in real time.",
    icon: "policy",
    accent: "text-accent",
    tint: "bg-[#FDF3C8]",
    buttonClass: "bg-white text-text-primary",
    textClass: "text-text-primary",
    route: "/login?role=lender",
  },
  {
    key: "operator",
    label: "Operator",
    title: "Run Console",
    description: "Jump straight into the live demo console with self-bootstrapped tokens and no login step.",
    icon: "terminal",
    accent: "text-[#017587]",
    tint: "bg-[#EAF7F8]",
    buttonClass: "bg-[#017587] text-[#F5F5F0]",
    textClass: "text-text-primary",
    route: "/operator",
  },
];

export default function RoleSelectionPage() {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<RoleOption | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<Record<RoleOption, HTMLDivElement | null>>({
    principal: null,
    lender: null,
    operator: null,
  });
  const innerRefs = useRef<Record<RoleOption, HTMLDivElement | null>>({
    principal: null,
    lender: null,
    operator: null,
  });

  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.fromTo(
        progressRef.current,
        { scaleX: 0 },
        { scaleX: 0.5, duration: 0.8, ease: "power3.out", transformOrigin: "left center" }
      );
      gsap.fromTo(
        [innerRefs.current.principal, innerRefs.current.lender, innerRefs.current.operator],
        { y: 36, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, stagger: 0.1, ease: "power4.out", delay: 0.15 }
      );
    }, containerRef);
    return () => ctx.revert();
  }, []);

  const headerRef = useRef<HTMLDivElement>(null);

  const handleSelectRole = (role: RoleOption) => {
    if (selectedRole) return;
    setSelectedRole(role);

    const destination = role === "operator" ? "/operator" : `/login?role=${role}`;

    const tl = gsap.timeline({
      onComplete: () => router.push(destination),
    });

    const panels = [panelRefs.current.principal, panelRefs.current.lender, panelRefs.current.operator];
    const selectedPanel = panelRefs.current[role];

    // Fade and collapse top header so card takes 100% screen
    if (headerRef.current) {
      tl.to(headerRef.current, { opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, duration: 0.4, ease: "power2.inOut" }, 0);
    }

    // Fade out and fully collapse non-selected panels
    panels.forEach((panel) => {
      if (!panel || panel === selectedPanel) return;
      tl.to(panel, { 
        opacity: 0, 
        flex: 0,
        minHeight: 0,
        padding: 0,
        borderWidth: 0,
        duration: 0.4, 
        ease: "power2.inOut" 
      }, 0);
    });

    // Progress bar fills (happens in background now since header fades, but good for safety)
    if (progressRef.current) {
      tl.to(progressRef.current, { scaleX: 1, duration: 0.4, ease: "power2.inOut" }, 0);
    }

    // After panels expand, hold for a beat, then fade out the whole page
    tl.to(containerRef.current, { opacity: 0, duration: 0.3, ease: "power2.in" }, 0.6);
  };

  const activePanelClass = useMemo(() => {
    if (!selectedRole) return "";
    return "pointer-events-none";
  }, [selectedRole]);

  return (
    <div ref={containerRef} className="flex-1 min-h-screen flex flex-col relative overflow-hidden bg-text-primary">
      <div ref={headerRef} className="relative z-40 flex items-center justify-between px-6 md:px-12 py-6 bg-[#F5F5F0] border-b-2 border-text-primary/10 overflow-hidden">
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

      <div className="flex-1 flex flex-col lg:flex-row relative overflow-hidden">
        {roleCards.map((card) => {
          const isSelected = selectedRole === card.key;
          return (
            <div
              key={card.key}
              ref={(node) => {
                panelRefs.current[card.key] = node;
              }}
              onClick={() => handleSelectRole(card.key)}
              className={`relative flex-1 min-h-[32vh] lg:min-h-0 p-6 md:p-8 lg:p-10 border-b-2 lg:border-b-0 lg:border-r-2 border-text-primary last:border-r-0 last:border-b-0 overflow-hidden cursor-pointer transition-colors ${card.tint} ${
                !selectedRole || isSelected ? "" : "opacity-80"
              } ${activePanelClass}`}
            >
              <div
                ref={(node) => {
                  innerRefs.current[card.key] = node;
                }}
                className="relative z-20 flex h-full flex-col items-center justify-center text-center gap-5 max-w-sm mx-auto"
              >
                <motion.div
                  whileHover={!selectedRole ? { scale: 1.05, rotate: card.key === "principal" ? -2 : card.key === "lender" ? 2 : 0 } : {}}
                  className="h-16 w-16 bg-white border-2 border-text-primary shadow-[4px_4px_0px_rgba(27,23,34,1)] flex items-center justify-center"
                >
                  <Icon name={card.icon} size={32} />
                </motion.div>
                <div>
                  <span className={`font-mono text-[10px] uppercase tracking-[0.2em] font-bold mb-2 block ${card.accent}`}>
                    {card.label}
                  </span>
                  <h2 className="font-mono text-2xl md:text-3xl font-bold uppercase tracking-wider text-text-primary">
                    {card.title}
                  </h2>
                </div>
                <p className="text-sm font-mono text-text-secondary leading-relaxed">
                  {card.description}
                </p>
                <button
                  className={`px-8 py-3 font-mono text-sm uppercase tracking-widest font-bold border-2 border-text-primary ${card.buttonClass}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelectRole(card.key);
                  }}
                >
                  {card.key === "operator" ? "Open console" : `Continue as ${card.label}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
