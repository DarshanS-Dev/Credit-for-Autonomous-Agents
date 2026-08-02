"use client";

import React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";
import { Icon } from "../ui/Icon";
import CardNav from "./CardNav";

export const Nav: React.FC = () => {
  const pathname = usePathname();
  const router = useRouter();
  const { session, logout } = useSession();

  const handleRoleSwitch = () => {
    logout();
    router.push("/login/role");
  };

  const role = pathname.startsWith("/operator")
    ? "operator"
    : session?.role ?? null;

  const showNav = pathname !== "/" && !pathname.startsWith("/login");

  if (!showNav) return null;

  let navItems = [];
  if (role === "principal") {
    navItems = [
      {
        label: "Principal Area",
        bgColor: "#FDF3C8",
        textColor: "#1B1722",
        links: [
          { label: "Dashboard", href: "/principal/dashboard" },
          { label: "Register Agent", href: "/principal/agents/add" },
        ],
      },
      {
        label: "Settings",
        bgColor: "#EAEAEA",
        textColor: "#1B1722",
        links: [{ label: "Account Info", href: "#" }],
      },
    ];
  } else if (role === "lender") {
    navItems = [
      {
        label: "Lender Ops",
        bgColor: "#FDF3C8",
        textColor: "#1B1722",
        links: [
          { label: "Live Activity", href: "/lender/dashboard" },
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
  } else {
    navItems = [
      {
        label: "Operator",
        bgColor: "#FDF3C8",
        textColor: "#1B1722",
        links: [{ label: "Console", href: "/operator" }],
      },
    ];
  }

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

  return (
    <div className="relative z-50 font-mono">
      <CardNav
        logoNode={logoNode}
        items={navItems}
        baseColor="#FDF3C8"
        menuColor="#1B1722"
        buttonBgColor="#1B1722"
        buttonTextColor="#F5F5F0"
        ctaText={role === "operator" ? "Exit Console" : "Switch Role"}
        onCtaClick={handleRoleSwitch}
      />
    </div>
  );
};
