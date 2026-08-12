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
  // Bug this fixes: previously `role` came ONLY from session.role, which is
  // hydrated from localStorage inside a useEffect (see SessionContext).
  // On first paint (and on any hard refresh) session is briefly null, so
  // role fell through to the operator nav on EVERY page until the effect
  // fired — causing the wrong navbar to flash on principal/lender pages.
  //
  // Fix: derive role from the URL first (the page you're actually on is
  // the strongest signal of what nav you should see), and only fall back
  // to session.role when the path itself doesn't indicate a role (e.g. a
  // shared/utility route). This also fixes the case where a lender is
  // logged in but has navigated to a /principal/* URL — the nav now
  // matches the page, not a stale/mismatched session value.
  const effectiveRole: EffectiveRole = useMemo(() => {
    if (pathname.startsWith("/operator")) return "operator";
    if (pathname.startsWith("/principal")) return "principal";
    if (pathname.startsWith("/lender")) return "lender";
    return session?.role ?? null;
  }, [pathname, session?.role]);

  // ---- navItems ----
  // Bug this fixes: navItems was rebuilt as a brand-new array literal on
  // EVERY render regardless of whether role actually changed. CardNav's
  // useLayoutEffect depends on [ease, items], so a new array reference on
  // every render tore down and rebuilt the GSAP timeline constantly,
  // which is what made the nav feel "stuck" or unresponsive after
  // navigating. Memoizing on effectiveRole means the timeline is only
  // rebuilt when the role actually changes.
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

    // effectiveRole === null: no session yet and not on a role-prefixed
    // route. Render an empty item set rather than guessing "operator" —
    // this is the other half of fixing the flash-of-wrong-nav bug below.
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

  // Bug this fixes: session hydration (loadSession()) happens inside a
  // useEffect in SessionContext, so on the very first client render
  // (and during SSR) `session` is null and `isLoading` is true. Rendering
  // the nav during that window on a /principal or /lender page is safe
  // now because effectiveRole is path-derived, but on ambiguous routes
  // (role coming only from session) we intentionally wait for hydration
  // to finish before deciding — otherwise we'd render an empty/wrong nav
  // for a split second even though a valid session exists in storage.
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
