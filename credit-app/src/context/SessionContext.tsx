"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import {
  saveSession,
  loadSession,
  clearSession,
  type Session,
  type SessionRole,
} from "@/lib/session";

interface SessionContextValue {
  session: Session | null;
  isLoading: boolean;
  setSession: (session: Session) => void;
  logout: () => void;
  role: SessionRole | "operator" | null;
}

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setSessionState(loadSession());
    setIsLoading(false);
  }, []);

  const setSession = useCallback((next: Session) => {
    saveSession(next);
    setSessionState(next);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setSessionState(null);
  }, []);

  const role = session?.role ?? null;

  return (
    <SessionContext.Provider value={{ session, isLoading, setSession, logout, role }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}

/** Operator console has no logged-in user session — treat as its own role. */
export function useEffectiveRole(pathname: string): SessionRole | "operator" | null {
  const { role } = useSession();
  if (pathname.startsWith("/operator")) return "operator";
  return role;
}
