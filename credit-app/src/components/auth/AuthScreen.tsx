"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { gsap } from "gsap";
import { motion, AnimatePresence } from "framer-motion";
import ShapeGrid from "@/components/ui/ShapeGrid";
import { Icon } from "@/components/ui/Icon";
import { useSession } from "@/context/SessionContext";
import { login, signup } from "@/lib/api/auth";
import { generatePrincipalKeypair } from "@/lib/crypto/mandate";
import { savePrincipalKeypair } from "@/lib/session";
import { ApiError } from "@/lib/api/client";
import type { SessionRole } from "@/lib/session";

type AuthMode = "login" | "signup";

export default function AuthScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setSession } = useSession();

  const roleParam = searchParams.get("role") as SessionRole | null;
  const role = roleParam === "principal" || roleParam === "lender" ? roleParam : null;

  const [mode, setMode] = useState<AuthMode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!role) {
      router.replace("/login/role");
    }
  }, [role, router]);

  useEffect(() => {
    if (!cardRef.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        cardRef.current,
        { y: 48, opacity: 0, scale: 0.97 },
        { y: 0, opacity: 1, scale: 1, duration: 0.85, ease: "power4.out" }
      );
    }, containerRef);
    return () => ctx.revert();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !role) return;

    if (mode === "signup" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      let tokenResponse;
      if (mode === "signup") {
        let publicKey: string | undefined;
        if (role === "principal") {
          const keypair = generatePrincipalKeypair();
          publicKey = keypair.publicKeyB64;
          tokenResponse = await signup({
            role,
            name,
            email,
            password,
            public_key: publicKey,
          });
          savePrincipalKeypair(tokenResponse.id, {
            privateKeyHex: keypair.privateKeyHex,
            publicKeyHex: keypair.publicKeyHex,
          });
        } else {
          tokenResponse = await signup({ role, name, email, password });
        }
      } else {
        tokenResponse = await login({ role, email, password });
      }

      setSession({
        token: tokenResponse.access_token,
        role: tokenResponse.role,
        id: tokenResponse.id,
        name: mode === "signup" ? name : email.split("@")[0],
        email,
      });

      gsap.to(cardRef.current, {
        scale: 0.98,
        opacity: 0.5,
        duration: 0.25,
        ease: "power2.in",
        onComplete: () => {
          router.push(role === "principal" ? "/principal/onboarding" : "/lender/onboarding");
        },
      });
    } catch (err) {
      setIsSubmitting(false);
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Authentication failed. Is the backend running?");
      }
    }
  };

  if (!role) return null;

  const isLogin = mode === "login";
  const roleLabel = role === "principal" ? "Principal" : "Lender";

  return (
    <div
      ref={containerRef}
      className="relative min-h-screen flex flex-col overflow-hidden bg-[#F5F5F0]"
    >
      <div className="absolute inset-0 z-0 pointer-events-none">
        <ShapeGrid
          speed={0.35}
          squareSize={32}
          direction="diagonal"
          borderColor="rgba(27,23,34,0.08)"
          hoverFillColor="#FDF3C8"
          shape="square"
          hoverTrailAmount={3}
        />
      </div>

      <div className="relative z-20 flex items-center justify-between px-6 md:px-12 py-6">
        <Link
          href="/login/role"
          className="font-mono text-sm font-bold tracking-tight text-text-primary hover:text-base transition-colors"
        >
          CREDIT<span className="text-accent">*</span>
        </Link>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-secondary font-bold hidden sm:block">
            Step 02 — Access ({roleLabel})
          </span>
          <div className="h-1 w-24 bg-text-primary/10 overflow-hidden">
            <motion.div
              className="h-full bg-accent"
              initial={{ width: "50%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 0.8, ease: [0.25, 1, 0.5, 1], delay: 0.3 }}
            />
          </div>
        </div>
      </div>

      <div className="relative z-10 flex-1 flex items-center justify-center px-4 md:px-8 pb-16 md:pb-12">
        <div
          ref={cardRef}
          className="w-full max-w-5xl min-h-[600px] md:min-h-[620px] relative border-2 border-text-primary overflow-hidden md:shadow-[12px_12px_0px_rgba(27,23,34,1)] bg-white"
        >
          <div className="hidden md:grid md:grid-cols-2 h-full min-h-[620px]">
            <motion.div
              className="relative flex flex-col justify-center px-10 lg:px-14 py-12 border-r-2 border-text-primary overflow-hidden"
              animate={{
                backgroundColor: isLogin ? "#FDF3C8" : "#017587",
                color: isLogin ? "#1F242A" : "#F5F5F0",
              }}
              transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={isLogin ? "left-cta" : "left-form"}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
                  className="relative z-10"
                >
                  {isLogin ? (
                    <CtaContent mode={mode} onToggle={() => setMode("signup")} />
                  ) : (
                    <AuthFormContent
                      mode={mode}
                      roleLabel={roleLabel}
                      showPassword={showPassword}
                      setShowPassword={setShowPassword}
                      isSubmitting={isSubmitting}
                      error={error}
                      name={name}
                      setName={setName}
                      email={email}
                      setEmail={setEmail}
                      password={password}
                      setPassword={setPassword}
                      confirmPassword={confirmPassword}
                      setConfirmPassword={setConfirmPassword}
                      onSubmit={handleSubmit}
                      dark
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>

            <motion.div
              className="relative flex flex-col justify-center px-10 lg:px-14 py-12 overflow-hidden"
              animate={{
                backgroundColor: isLogin ? "#017587" : "#FDF3C8",
                color: isLogin ? "#F5F5F0" : "#1F242A",
              }}
              transition={{ duration: 0.55, ease: [0.32, 0.72, 0, 1] }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={isLogin ? "right-form" : "right-cta"}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
                  className="relative z-10"
                >
                  {isLogin ? (
                    <AuthFormContent
                      mode={mode}
                      roleLabel={roleLabel}
                      showPassword={showPassword}
                      setShowPassword={setShowPassword}
                      isSubmitting={isSubmitting}
                      error={error}
                      name={name}
                      setName={setName}
                      email={email}
                      setEmail={setEmail}
                      password={password}
                      setPassword={setPassword}
                      confirmPassword={confirmPassword}
                      setConfirmPassword={setConfirmPassword}
                      onSubmit={handleSubmit}
                      dark
                    />
                  ) : (
                    <CtaContent mode={mode} onToggle={() => setMode("login")} />
                  )}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </div>

          <div className="md:hidden flex flex-col min-h-[600px]">
            <div className="flex-1 bg-base text-[#F5F5F0] px-6 py-10 flex flex-col justify-center">
              <AuthFormContent
                mode={mode}
                roleLabel={roleLabel}
                showPassword={showPassword}
                setShowPassword={setShowPassword}
                isSubmitting={isSubmitting}
                error={error}
                name={name}
                setName={setName}
                email={email}
                setEmail={setEmail}
                password={password}
                setPassword={setPassword}
                confirmPassword={confirmPassword}
                setConfirmPassword={setConfirmPassword}
                onSubmit={handleSubmit}
                dark
              />
            </div>
            <div className="bg-[#FDF3C8] border-t-2 border-text-primary px-6 py-8">
              <CtaContent
                mode={mode}
                onToggle={() => setMode(isLogin ? "signup" : "login")}
                compact
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthFormContent({
  mode,
  roleLabel,
  showPassword,
  setShowPassword,
  isSubmitting,
  error,
  name,
  setName,
  email,
  setEmail,
  password,
  setPassword,
  confirmPassword,
  setConfirmPassword,
  onSubmit,
  dark,
}: {
  mode: AuthMode;
  roleLabel: string;
  showPassword: boolean;
  setShowPassword: (v: boolean) => void;
  isSubmitting: boolean;
  error: string | null;
  name: string;
  setName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  password: string;
  setPassword: (v: string) => void;
  confirmPassword: string;
  setConfirmPassword: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  dark?: boolean;
}) {
  const isLogin = mode === "login";

  return (
    <div className="w-full max-w-sm mx-auto">
      <p
        className={`font-mono text-[10px] uppercase tracking-[0.25em] font-bold mb-3 ${
          dark ? "text-accent" : "text-base"
        }`}
      >
        {isLogin ? "Welcome back" : "Create account"} — {roleLabel}
      </p>
      <h1
        className={`font-mono text-3xl lg:text-4xl font-bold uppercase tracking-tight leading-none mb-2 ${
          dark ? "text-[#F5F5F0]" : "text-text-primary"
        }`}
      >
        {isLogin ? "Log In" : "Sign Up"}
      </h1>

      <form onSubmit={onSubmit} className="space-y-4 mt-8">
        {!isLogin && (
          <AuthField
            label="Full name"
            type="text"
            value={name}
            onChange={setName}
            placeholder="Jane Principal"
            autoComplete="name"
            dark={dark}
            required
          />
        )}
        <AuthField
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          placeholder="you@company.com"
          autoComplete="email"
          dark={dark}
          required
        />
        <AuthField
          label="Password"
          type={showPassword ? "text" : "password"}
          value={password}
          onChange={setPassword}
          placeholder="••••••••"
          autoComplete={isLogin ? "current-password" : "new-password"}
          dark={dark}
          required
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className={`p-1 transition-colors ${
                dark
                  ? "text-[#F5F5F0]/50 hover:text-accent"
                  : "text-text-secondary hover:text-base"
              }`}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <Icon name={showPassword ? "eye-off" : "eye"} size={18} />
            </button>
          }
        />
        {!isLogin && (
          <AuthField
            label="Confirm password"
            type={showPassword ? "text" : "password"}
            value={confirmPassword}
            onChange={setConfirmPassword}
            placeholder="••••••••"
            autoComplete="new-password"
            dark={dark}
            required
          />
        )}

        {error && (
          <p className="font-mono text-xs text-danger border border-danger/30 bg-danger/5 p-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="group w-full mt-2 px-8 py-4 bg-accent text-text-primary font-mono text-sm uppercase tracking-widest font-bold border-2 border-accent transition-all duration-300 hover:bg-transparent hover:text-accent disabled:opacity-60"
        >
          <span className="inline-flex items-center justify-center gap-3">
            {isSubmitting ? (
              <>
                <span className="h-4 w-4 border-2 border-text-primary/30 border-t-text-primary rounded-full animate-spin" />
                Verifying...
              </>
            ) : isLogin ? (
              <>Continue →</>
            ) : (
              <>Create account →</>
            )}
          </span>
        </button>
      </form>
    </div>
  );
}

function CtaContent({
  mode,
  onToggle,
  compact,
}: {
  mode: AuthMode;
  onToggle: () => void;
  compact?: boolean;
}) {
  const isLogin = mode === "login";

  return (
    <div
      className={`flex flex-col gap-6 w-full max-w-sm mx-auto ${
        compact ? "items-center text-center" : "items-start"
      }`}
    >
      <div className="h-14 w-14 bg-white border-2 border-text-primary shadow-[4px_4px_0px_rgba(27,23,34,1)] flex items-center justify-center shrink-0">
        <span className="text-2xl">{isLogin ? "👋" : "✦"}</span>
      </div>
      <div className={compact ? "text-center" : ""}>
        <h2 className="font-mono text-2xl lg:text-3xl font-bold uppercase tracking-wide mb-2 text-text-primary">
          {isLogin ? "Hello!" : "Already in?"}
        </h2>
        <p className="font-mono text-sm text-text-secondary leading-relaxed">
          {isLogin
            ? "Don't have an account yet? Create one to start."
            : "Already registered? Sign in to access your dashboard."}
        </p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="px-10 py-3.5 bg-white text-text-primary font-mono text-sm uppercase tracking-widest font-bold border-2 border-text-primary transition-all duration-300 hover:bg-text-primary hover:text-[#F5F5F0]"
      >
        {isLogin ? "Register" : "Log in"}
      </button>
    </div>
  );
}

function AuthField({
  label,
  type,
  value,
  onChange,
  placeholder,
  autoComplete,
  dark,
  trailing,
  required,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoComplete?: string;
  dark?: boolean;
  trailing?: React.ReactNode;
  required?: boolean;
}) {
  return (
    <div>
      <label
        className={`block font-mono text-[10px] uppercase tracking-[0.2em] font-bold mb-2 ${
          dark ? "text-[#F5F5F0]/60" : "text-text-secondary"
        }`}
      >
        {label}
      </label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required={required}
          className={`w-full px-4 py-3.5 font-mono text-sm border-2 transition-all duration-150 outline-none ${
            dark
              ? "bg-[#015f6e] border-[#F5F5F0]/20 text-[#F5F5F0] placeholder:text-[#F5F5F0]/30 focus:border-accent"
              : "bg-white border-text-primary/20 text-text-primary placeholder:text-text-secondary/40 focus:border-accent"
          }`}
        />
        {trailing && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">{trailing}</div>
        )}
      </div>
    </div>
  );
}
