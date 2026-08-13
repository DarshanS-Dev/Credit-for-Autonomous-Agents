"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { gsap } from "gsap";
import { motion, AnimatePresence } from "framer-motion";
import ShapeGrid from "@/components/ui/ShapeGrid";
import { Icon } from "@/components/ui/Icon";
import { AgentMotionIllustration } from "@/components/ui/AgentMotionIllustration";
import { FeatureCarousel } from "@/components/ui/FeatureCarousel";
import { useSession } from "@/context/SessionContext";
import { login, signup } from "@/lib/api/auth";
import { generatePrincipalKeypair } from "@/lib/crypto/mandate";
import { savePrincipalKeypair } from "@/lib/session";
import { ApiError } from "@/lib/api/client";
import type { SessionRole } from "@/lib/session";
import { cn } from "@/lib/utils";

// Component export for demo compatibility
export const Component = () => {
    const [count, setCount] = useState(0);

    return (
        <div className={cn("flex flex-col items-center gap-4 p-4 rounded-lg bg-white border-2 border-text-primary shadow-[4px_4px_0px_rgba(27,23,34,1)]")}>
            <h1 className="text-2xl font-bold mb-2">Component Example</h1>
            <h2 className="text-xl font-semibold">{count}</h2>
            <div className="flex gap-2">
                <button className="px-4 py-2 border-2 border-text-primary bg-accent font-bold" onClick={() => setCount((prev) => prev - 1)}>-</button>
                <button className="px-4 py-2 border-2 border-text-primary bg-accent font-bold" onClick={() => setCount((prev) => prev + 1)}>+</button>
            </div>
        </div>
    );
};

type AuthMode = "login" | "signup";

export function AuthSwitch() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { setSession } = useSession();

    const roleParam = searchParams.get("role") as SessionRole | null;
    const role = roleParam === "principal" || roleParam === "lender" || roleParam === "operator" ? roleParam : null;

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
                { y: 32, opacity: 0, scale: 0.98 },
                { y: 0, opacity: 1, scale: 1, duration: 0.7, ease: "power4.out", delay: 0.3 }
            );
        }, containerRef);
        return () => ctx.revert();
    }, []);

    const handleModeSwitch = (newMode: AuthMode) => {
        if (newMode === mode) return;
        setError(null);
        setMode(newMode);

        // Subtle tactile card pulse feedback
        if (cardRef.current) {
            gsap.fromTo(
                cardRef.current,
                { scale: 0.99 },
                { scale: 1, duration: 0.35, ease: "back.out(2)" }
            );
        }
    };

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
            if (role === "operator") {
                tokenResponse = {
                    access_token: "operator-demo-token",
                    role: "operator",
                    id: 0,
                };
                await new Promise(r => setTimeout(r, 600));
            } else {
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
                        } as any);
                        savePrincipalKeypair(tokenResponse.id, {
                            privateKeyHex: keypair.privateKeyHex,
                            publicKeyHex: keypair.publicKeyHex,
                        });
                    } else {
                        tokenResponse = await signup({ role, name, email, password } as any);
                    }
                } else {
                    tokenResponse = await login({ role, email, password } as any);
                }
            }

            setSession({
                token: tokenResponse.access_token,
                role: tokenResponse.role as SessionRole,
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
                    if (role === "operator") {
                        router.push("/operator");
                    } else {
                        router.push(role === "principal" ? "/principal/onboarding" : "/lender/onboarding");
                    }
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
    const roleLabel = role === "principal" ? "Principal" : role === "lender" ? "Lender" : "Operator";

    return (
        <div
            ref={containerRef}
            className="relative min-h-screen flex flex-col overflow-hidden bg-[#F5F5F0]"
        >
            {/* Background shape grid */}
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

            {/* Header bar */}
            <div className="relative z-20 flex items-center justify-between px-6 md:px-12 py-6">
                <Link
                    href="/login/role"
                    className="font-mono text-sm font-bold tracking-tight text-text-primary hover:text-accent transition-colors flex items-center gap-1"
                >
                    CREDIT<span className="text-accent">*</span>
                </Link>
                <div className="flex items-center gap-3">
                    <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-secondary font-bold hidden sm:block">
                        Step 02 — Access ({roleLabel})
                    </span>
                    <div className="h-1 w-24 bg-text-primary/10 overflow-hidden rounded-full">
                        <motion.div
                            className="h-full bg-accent"
                            initial={{ width: "50%" }}
                            animate={{ width: "100%" }}
                            transition={{ duration: 0.8, ease: [0.25, 1, 0.5, 1], delay: 0.3 }}
                        />
                    </div>
                </div>
            </div>

            {/* Main split card container */}
            <div className="relative z-10 flex-1 flex items-center justify-center px-4 md:px-8 pb-16 md:pb-12">
                <div
                    ref={cardRef}
                    className="w-full max-w-4xl min-h-[580px] grid grid-cols-1 md:grid-cols-2 rounded-2xl border-2 border-text-primary shadow-[10px_10px_0px_rgba(27,23,34,1)] overflow-hidden bg-white"
                >
                    {/* Left Panel: Hero Motion Illustration & Showcase */}
                    <div className="relative bg-[#FDF3C8] border-b-2 md:border-b-0 md:border-r-2 border-text-primary p-6 md:p-8 flex flex-col justify-between overflow-hidden">
                        {/* Top Protocol Badge */}
                        <div className="flex justify-between items-center">
                            <span className="font-mono text-[9px] uppercase tracking-[0.2em] font-bold px-3 py-1 bg-white border border-text-primary rounded-full shadow-[2px_2px_0px_rgba(27,23,34,1)] text-[#017587]">
                                Protocol Auth
                            </span>
                            <span className="font-mono text-[9px] uppercase tracking-wider text-text-secondary font-bold">
                                {roleLabel} Tier
                            </span>
                        </div>

                        {/* Middle Animated Illustration */}
                        <AgentMotionIllustration mode={mode} />

                        {/* Bottom Feature Carousel */}
                        <FeatureCarousel />
                    </div>

                    {/* Right Panel: Authentication Form */}
                    <div className="p-8 md:p-10 flex flex-col justify-between bg-white relative">
                        <div className="w-full max-w-sm mx-auto my-auto">

                            {/* Header + Tactile Morphing Segmented Switcher */}
                            <div className="flex items-center justify-between gap-4 mb-8">
                                <div>
                                    <p className="font-mono text-[10px] uppercase tracking-[0.25em] font-bold text-accent mb-0.5">
                                        {roleLabel} Access Console
                                    </p>
                                    <AnimatePresence mode="wait">
                                        <motion.h1
                                            key={mode}
                                            initial={{ opacity: 0, y: -6 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: 6 }}
                                            transition={{ duration: 0.2 }}
                                            className="font-mono text-2xl lg:text-3xl font-bold uppercase tracking-tight text-text-primary"
                                        >
                                            {isLogin ? "Sign In" : "Register"}
                                        </motion.h1>
                                    </AnimatePresence>
                                </div>

                                {/* Animated Spring Sliding Pill Switcher */}
                                <div className="relative flex bg-[#F0F0EA] p-1 border-2 border-text-primary rounded-xl shadow-[2px_2px_0px_rgba(27,23,34,1)]">
                                    <button
                                        type="button"
                                        onClick={() => handleModeSwitch("login")}
                                        className={cn(
                                            "relative z-10 px-3 py-1.5 font-mono text-xs uppercase tracking-wider font-bold transition-colors duration-200",
                                            isLogin ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
                                        )}
                                    >
                                        {isLogin && (
                                            <motion.div
                                                layoutId="activeTabPill"
                                                className="absolute inset-0 bg-accent border border-text-primary rounded-lg z-[-1]"
                                                transition={{ type: "spring", stiffness: 450, damping: 32 }}
                                            />
                                        )}
                                        Sign In
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleModeSwitch("signup")}
                                        className={cn(
                                            "relative z-10 px-3 py-1.5 font-mono text-xs uppercase tracking-wider font-bold transition-colors duration-200",
                                            !isLogin ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
                                        )}
                                    >
                                        {!isLogin && (
                                            <motion.div
                                                layoutId="activeTabPill"
                                                className="absolute inset-0 bg-accent border border-text-primary rounded-lg z-[-1]"
                                                transition={{ type: "spring", stiffness: 450, damping: 32 }}
                                            />
                                        )}
                                        Join
                                    </button>
                                </div>
                            </div>

                            {/* Form */}
                            <form onSubmit={handleSubmit} className="space-y-3.5">
                                {/* Full Name Field (Animates height & opacity) */}
                                <AnimatePresence initial={false}>
                                    {!isLogin && (
                                        <motion.div
                                            key="name-field"
                                            initial={{ opacity: 0, height: 0, y: -10 }}
                                            animate={{ opacity: 1, height: "auto", y: 0 }}
                                            exit={{ opacity: 0, height: 0, y: -10 }}
                                            transition={{ duration: 0.25, ease: "easeInOut" }}
                                            className="overflow-hidden"
                                        >
                                            <label className="block font-mono text-[10px] uppercase tracking-[0.15em] font-bold mb-1.5 text-text-secondary">
                                                Full Name
                                            </label>
                                            <input
                                                type="text"
                                                value={name}
                                                onChange={(e) => setName(e.target.value)}
                                                placeholder="Jane Principal"
                                                autoComplete="name"
                                                required
                                                className="w-full px-4 py-3 font-mono text-sm border-2 rounded-xl bg-[#F0F0EA]/40 border-text-primary/20 text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:bg-white outline-none transition-all"
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Email Field */}
                                <div>
                                    <label className="block font-mono text-[10px] uppercase tracking-[0.15em] font-bold mb-1.5 text-text-secondary">
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="you@company.com"
                                        autoComplete="email"
                                        required
                                        className="w-full px-4 py-3 font-mono text-sm border-2 rounded-xl bg-[#F0F0EA]/40 border-text-primary/20 text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:bg-white outline-none transition-all"
                                    />
                                </div>

                                {/* Password Field */}
                                <div>
                                    <div className="flex justify-between items-center mb-1.5">
                                        <label className="block font-mono text-[10px] uppercase tracking-[0.15em] font-bold text-text-secondary">
                                            Password
                                        </label>
                                    </div>
                                    <div className="relative">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            autoComplete={isLogin ? "current-password" : "new-password"}
                                            required
                                            className="w-full px-4 py-3 pr-10 font-mono text-sm border-2 rounded-xl bg-[#F0F0EA]/40 border-text-primary/20 text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:bg-white outline-none transition-all"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-secondary hover:text-accent transition-colors"
                                            aria-label={showPassword ? "Hide password" : "Show password"}
                                        >
                                            <Icon name={showPassword ? "eye-off" : "eye"} size={16} />
                                        </button>
                                    </div>
                                </div>

                                {/* Confirm Password Field (Animates height & opacity) */}
                                <AnimatePresence initial={false}>
                                    {!isLogin && (
                                        <motion.div
                                            key="confirm-password-field"
                                            initial={{ opacity: 0, height: 0, y: -10 }}
                                            animate={{ opacity: 1, height: "auto", y: 0 }}
                                            exit={{ opacity: 0, height: 0, y: -10 }}
                                            transition={{ duration: 0.25, ease: "easeInOut" }}
                                            className="overflow-hidden"
                                        >
                                            <label className="block font-mono text-[10px] uppercase tracking-[0.15em] font-bold mb-1.5 text-text-secondary">
                                                Confirm Password
                                            </label>
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                placeholder="••••••••"
                                                autoComplete="new-password"
                                                required
                                                className="w-full px-4 py-3 font-mono text-sm border-2 rounded-xl bg-[#F0F0EA]/40 border-text-primary/20 text-text-primary placeholder:text-text-secondary/40 focus:border-accent focus:bg-white outline-none transition-all"
                                            />
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {error && (
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        className="flex items-center gap-3 border-2 border-danger bg-white px-4 py-3 shadow-[3px_3px_0px_rgba(139,67,67,1)] rounded-xl"
                                    >
                                        <Icon name="warning" size={18} className="shrink-0 text-danger" />
                                        <p className="font-mono text-xs font-bold text-danger">{error}</p>
                                    </motion.div>
                                )}

                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="group w-full mt-4 px-8 py-3.5 bg-text-primary text-white font-mono text-xs uppercase tracking-widest font-bold border-2 border-text-primary rounded-xl transition-all duration-300 hover:bg-accent hover:text-text-primary hover:shadow-[4px_4px_0px_rgba(27,23,34,1)] hover:-translate-y-0.5 active:translate-y-0 active:shadow-none disabled:opacity-60"
                                >
                                    <span className="inline-flex items-center justify-center gap-3">
                                        {isSubmitting ? (
                                            <>
                                                <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Authenticating...
                                            </>
                                        ) : isLogin ? (
                                            <>Sign In →</>
                                        ) : (
                                            <>Register Account →</>
                                        )}
                                    </span>
                                </button>
                            </form>

                            {/* Mode Toggle Link */}
                            <div className="text-center mt-6">
                                <span className="font-mono text-xs text-text-secondary">
                                    {isLogin ? "Are you new?" : "Already registered?"}{" "}
                                    <button
                                        type="button"
                                        onClick={() => handleModeSwitch(isLogin ? "signup" : "login")}
                                        className="font-bold text-[#017587] underline hover:text-accent transition-colors"
                                    >
                                        {isLogin ? "Create an Account" : "Sign In"}
                                    </button>
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default AuthSwitch;
