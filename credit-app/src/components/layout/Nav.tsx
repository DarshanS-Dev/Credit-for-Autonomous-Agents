"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { Icon } from "../ui/Icon";
import CardNav from "./CardNav";

type EffectiveRole = "principal" | "lender" | "operator" | null;

export const Nav: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { session, isLoading, logout } = useSession();

  const handleLogout = () => {
    logout();
    router.push("/");
  };

  // Pages where the nav should never render at all.
  const showNav =
    pathname !== "/" &&
    !pathname.startsWith("/login") &&
    pathname !== "/error" &&
    pathname !== "/not-found" &&
    pathname !== "/permission-denied";

  // ---- Role resolution ----
  const effectiveRole: EffectiveRole = useMemo(() => {
    if (pathname.startsWith("/operator")) return "operator";
    if (pathname.startsWith("/principal")) return "principal";
    if (pathname.startsWith("/lender")) return "lender";
    return session?.role ?? null;
  }, [pathname, session?.role]);

  // ---- navItems ----
  const navItems = useMemo(() => {
    if (effectiveRole === "principal") {
      return [
        {
          label: "Principal Area",
          bgColor: "#FDF3C8",
          textColor: "#1B1722",
          links: [
            { label: "Dashboard", href: "/principal/dashboard" },
            { label: "Register Agent", href: "/principal/agents/add" },
            { label: "Upload History", href: "/principal/upload-cv" },
          ],
        },
        {
          label: "Settings",
          bgColor: "#EAEAEA",
          textColor: "#1B1722",
          links: [{ label: "Account Info", href: "#" }],
        },
      ];
    }

    if (effectiveRole === "lender") {
      return [
        {
          label: "Lender Ops",
          bgColor: "#FDF3C8",
          textColor: "#1B1722",
          links: [
            { label: "Live Activity", href: "/lender/dashboard" },
            { label: "Marketplace", href: "/lender/marketplace" },
            { label: "Directory", href: "/lender/agents" },
            { label: "Loans", href: "/lender/loans" },
          ],
        },
        {
          label: "Risk & Policy",
          bgColor: "#EAEAEA",
          textColor: "#1B1722",
          links: [
            { label: "Risk Policy", href: "/lender/policy" },
            { label: "Anomalies", href: "/lender/anomalies" },
          ],
        },
      ];
    }

    if (effectiveRole === "operator") {
      return [
        {
          label: "Operator",
          bgColor: "#FDF3C8",
          textColor: "#1B1722",
          links: [{ label: "Console", href: "/operator" }],
        },
      ];
    }

    return [];
  }, [effectiveRole]);

  const logoNode = (
    <Link href="/" className="flex items-center gap-2 group" style={{ textDecoration: "none" }}>
      <span className="font-mono text-lg font-bold tracking-tighter text-text-primary transition-colors group-hover:text-base">
        CREDIT<span className="text-accent">*</span>
      </span>
      <span className="font-mono text-[10px] uppercase text-text-secondary border border-text-secondary/25 px-1 py-0.5 select-none hidden md:block">
        agents-v1
      </span>
    </Link>
  );

  if (!showNav) return null;

  const roleNeedsSession = effectiveRole === null;
  if (roleNeedsSession && isLoading) {
    return null;
  }

  return (
    <div className="relative z-50 font-mono">
      <CardNav
        logoNode={logoNode}
        items={navItems}
        baseColor="#FDF3C8"
        menuColor="#1B1722"
        buttonBgColor="#1B1722"
        buttonTextColor="#F5F5F0"
        ctaText={effectiveRole === "operator" ? "Exit Console" : "Logout"}
        onCtaClick={handleLogout}
      />
    </div>
  );
};
