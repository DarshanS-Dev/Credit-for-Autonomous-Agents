"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "@/context/SessionContext";

const PROTECTED_PREFIXES = ["/principal", "/lender"];

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));

  useEffect(() => {
    if (isLoading || !isProtected) return;
    if (!session) {
      router.replace("/login/role");
    }
  }, [isLoading, isProtected, session, router]);

  if (isLoading && isProtected) {
    return (
      <div className="flex-1 flex items-center justify-center font-mono text-sm text-text-secondary">
        Loading session…
      </div>
    );
  }

  if (isProtected && !session) return null;

  return <>{children}</>;
}
