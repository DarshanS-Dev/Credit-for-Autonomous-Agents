"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

import { Icon } from "@/components/ui/Icon";
import HowItWorks, { Step } from "@/components/ui/how-it-works";
import ShapeGrid from "@/components/ui/ShapeGrid";

gsap.registerPlugin(ScrollTrigger);

export default function LandingPage() {
  const heroRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const introRef = useRef<HTMLParagraphElement>(null);
  const carouselSectionRef = useRef<HTMLDivElement>(null);
  const cyclingWordRef = useRef<HTMLSpanElement>(null);

  const footerRef = useRef<HTMLElement>(null);
  const footerLineRefs = useRef<(HTMLSpanElement | null)[]>([]);

  const words = ["collateral", "a contract", "legal recourse"];
  const [currentWordIndex, setCurrentWordIndex] = useState(0);

  // Kinetic typography entrance
  useEffect(() => {
    if (headlineRef.current && introRef.current) {
      const tl = gsap.timeline();
      tl.fromTo(
        headlineRef.current.querySelectorAll(".char-anim"),
        { y: 100, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, stagger: 0.05, ease: "power4.out" }
      );
      tl.fromTo(
        introRef.current,
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" },
        "-=0.4"
      );
    }
  }, []);

  // Cycling words morphing
  useEffect(() => {
    const interval = setInterval(() => {
      if (cyclingWordRef.current) {
        gsap.to(cyclingWordRef.current, {
          y: -20,
          opacity: 0,
          duration: 0.25,
          onComplete: () => {
            setCurrentWordIndex((prev) => (prev + 1) % words.length);
            gsap.fromTo(
              cyclingWordRef.current,
              { y: 20, opacity: 0 },
              { y: 0, opacity: 1, duration: 0.25 }
            );
          },
        });
      }
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Scroll-triggered animations
  useEffect(() => {
    // Footer text reveal — each word clips up
    const footerLines = footerLineRefs.current.filter(Boolean);
    if (footerLines.length) {
      gsap.fromTo(
        footerLines,
        { yPercent: 110, opacity: 0 },
        {
          yPercent: 0,
          opacity: 1,
          duration: 1.1,
          stagger: 0.08,
          ease: "power4.out",
          scrollTrigger: {
            trigger: footerRef.current,
            start: "top 85%",
            toggleActions: "play none none reverse",
          },
        }
      );
    }

    return () => {
      ScrollTrigger.getAll().forEach((t) => t.kill());
    };
  }, []);

  const footerWords = [
    "Credit",
    "for",
    "Autonomous",
    "Agents.",
  ];

  const howItWorksSteps: Step[] = [
    {
      title: "Delegate",
      description: "A principal issues a signed mandate authorizing their agent to act — one signature, no per-transaction approval required after.",
      colorTheme: "teal",
    },
    {
      title: "Authorize",
      description: "The agent's payout wallet grants scoped module authority, so repayment can be enforced automatically at the source.",
      colorTheme: "gold",
    },
    {
      title: "Underwrite",
      description: "Every request is scored against the agent's own behavior — task success, spend regularity, repayment history — not a credit file.",
      colorTheme: "teal",
    },
    {
      title: "Decide",
      description: "The score clears a lender's policy threshold in real time. Approved, starter-limited, or denied — sub-second, no human in the loop.",
      colorTheme: "gold",
    },
    {
      title: "Enforce",
      description: "Repayment deducts automatically from the custodial wallet on task payout. Deviation trips an anomaly flag; default trips revocation.",
      colorTheme: "teal",
    }
  ];

  return (
    <div className="flex flex-col min-h-screen">

      {/* ── 1. Hero ── */}
      <section
        ref={heroRef}
        className="h-screen min-h-[640px] text-text-primary px-8 lg:px-16 py-32 flex flex-col justify-between relative overflow-hidden border-b-2 border-text-primary/10"
      >
        {/* Animated ShapeGrid Background */}
        <div className="absolute inset-0 z-0 pointer-events-auto bg-[#F5F5F0]">
          <ShapeGrid
            speed={0.5}
            squareSize={32}
            direction="diagonal"
            borderColor="rgba(27,23,34,0.15)"
            hoverFillColor="#FDF3C8"
            shape="square"
            hoverTrailAmount={4}
          />
        </div>

        <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col justify-between relative z-10">
          {/* Top Info */}
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3 px-4 py-2 border-2 border-text-primary bg-[#FDF3C8] shadow-[4px_4px_0px_rgba(27,23,34,1)]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full bg-text-primary opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 bg-text-primary"></span>
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-primary font-bold">
                LIVE STATUS
              </span>
            </div>
            <div className="font-mono text-[10px] text-text-secondary max-w-xs text-right hidden md:block border-l-2 border-text-primary/20 pl-4">
              *Sub-second decisioning, enforced by policy — not judgment calls.
            </div>
          </div>

          {/* Main Headline */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 my-auto items-center">
            <div className="lg:col-span-8 relative">
              <h1
                ref={headlineRef}
                className="font-mono text-5xl md:text-7xl lg:text-8xl font-bold leading-none tracking-tight"
              >
                <div className="overflow-hidden inline-block mr-4">
                  <span className="char-anim inline-block">Credit</span>
                </div>
                <div className="overflow-hidden inline-block mr-4 relative">
                  <span className="char-anim inline-block bg-[#FDF3C8] px-4 border-2 border-text-primary transform -rotate-2 relative z-10">at</span>
                </div>
                <br />
                <div className="overflow-hidden inline-block mr-4 mt-2">
                  <span className="char-anim inline-block">machine</span>
                </div>
                <div className="overflow-hidden inline-block">
                  <span className="char-anim inline-block opacity-80">speed*</span>
                </div>
              </h1>
            </div>
            <div className="lg:col-span-4 flex flex-col items-start gap-6 lg:border-l-2 lg:border-text-primary/20 lg:pl-8">
              <p
                ref={introRef}
                className="text-lg text-text-secondary leading-relaxed font-mono"
              >
                Infrastructure that lends to AI agents in real time — no
                collateral, no contract, no human in the loop per transaction.
              </p>
              <Link 
                href="/login"
                className="group relative inline-flex items-center gap-4 px-10 py-4 bg-text-primary text-[#F5F5F0] font-mono text-sm uppercase tracking-widest font-bold border-2 border-text-primary transition-all duration-300 hover:bg-transparent hover:text-text-primary hover:shadow-[4px_4px_0px_rgba(27,23,34,1)]"
              >
                <span className="relative z-10">Log In</span>
                <span className="relative z-10 transition-transform duration-300 group-hover:translate-x-1">→</span>
              </Link>
            </div>
          </div>

          {/* Bottom Row */}
          <div className="flex flex-col md:flex-row items-start md:items-end justify-between w-full border-t-2 border-text-primary/10 pt-6">
            <span className="font-mono text-xs uppercase text-text-secondary/70 tracking-wider">
              Ledger Editorial Spec PS1
            </span>
            <span className="font-mono text-xs font-bold text-text-primary mt-2 md:mt-0 bg-text-primary/5 px-3 py-1 border border-text-primary/20">
              Live from the Operator Console
            </span>
          </div>
        </div>
      </section>

      {/* ── 2. Word-Morph Carousel ── */}
      <section
        ref={carouselSectionRef}
        className="min-h-screen text-text-primary flex flex-col justify-center items-center px-8 lg:px-16 py-32 relative overflow-hidden border-b-2 border-text-primary/10"
      >
        <div className="max-w-4xl text-center z-10 flex flex-col items-center gap-12">
          <h2 className="font-mono text-4xl md:text-6xl uppercase tracking-wider text-text-secondary leading-snug">
            Borrow without <br />
            <span
              ref={cyclingWordRef}
              className="text-text-primary font-bold inline-block border-b-4 border-[#F0B419] pb-2 min-w-[280px]"
            >
              {words[currentWordIndex]}
            </span>
          </h2>

          {/* Stacked Cards Visualizer */}
          <div className="relative w-full max-w-2xl h-[380px] flex items-center justify-center mt-6">
            
            {/* Card 1: Principal */}
            <div
              className={`absolute w-full p-8 border-2 border-text-primary transition-all duration-700 bg-[#F5F5F0] text-text-primary flex flex-col justify-between shadow-[8px_8px_0px_rgba(27,23,34,1)] ${
                currentWordIndex === 0
                  ? "scale-100 z-30 opacity-100 translate-y-0"
                  : "scale-90 z-10 opacity-40 translate-y-12 pointer-events-none"
              }`}
            >
              <div className="flex justify-between items-center border-b-2 border-text-primary/20 pb-4">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-text-secondary font-bold">
                  STEP 01 // DELEGATED IDENTITY
                </span>
                <Icon name="key" size={24} className="text-text-primary" />
              </div>
              <div className="py-6 space-y-4 text-left">
                <p className="font-mono text-xl md:text-2xl font-bold tracking-tight text-center uppercase">
                  Verifiable Mandate Established
                </p>
                <div className="grid grid-cols-2 gap-4 font-mono text-xs text-text-secondary border-t-2 border-text-primary/10 pt-4 max-w-md mx-auto">
                  <div>
                    <span className="block text-[10px] text-text-secondary/70 font-bold mb-1">SIGNING METHOD</span>
                    <span>Ed25519 Keypair</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-text-secondary/70 font-bold mb-1">BOUNDS ENFORCED</span>
                    <span>Max $5,000 / tx</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center border-t-2 border-text-primary/10 pt-4 font-mono text-[10px] text-text-secondary/80 font-bold">
                <span>STATUS: SECURED &amp; RUNNING</span>
                <span>COLLATERAL REQ: 0.00%</span>
              </div>
            </div>

            {/* Card 2: Decision */}
            <div
              className={`absolute w-full p-8 border-2 border-text-primary transition-all duration-700 bg-white text-text-primary flex flex-col justify-between shadow-[8px_8px_0px_rgba(27,23,34,1)] ${
                currentWordIndex === 1
                  ? "scale-100 z-30 opacity-100 translate-y-0"
                  : currentWordIndex === 0
                  ? "scale-95 z-20 opacity-60 translate-y-6 pointer-events-none"
                  : "scale-90 z-10 opacity-40 translate-y-12 pointer-events-none"
              }`}
            >
              <div className="flex justify-between items-center border-b-2 border-text-primary/20 pb-4">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-text-secondary font-bold">
                  STEP 02 // BEHAVIORAL UNDERWRITING
                </span>
                <Icon name="policy" size={24} className="text-text-primary" />
              </div>
              <div className="py-6 space-y-4 text-left">
                <p className="font-mono text-xl md:text-2xl font-bold tracking-tight text-center uppercase">
                  Real-Time Credit Decision
                </p>
                <div className="grid grid-cols-3 gap-4 font-mono text-xs text-text-secondary border-t-2 border-text-primary/10 pt-4 max-w-lg mx-auto">
                  <div>
                    <span className="block text-[10px] text-text-secondary/70 font-bold mb-1">LATENCY</span>
                    <span className="font-bold text-text-primary">42ms</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-text-secondary/70 font-bold mb-1">AGENT SCORE</span>
                    <span className="font-bold text-text-primary">0.88 / 1.0</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-text-secondary/70 font-bold mb-1">DECISION</span>
                    <span className="font-bold text-text-primary bg-[#FDF3C8] px-1 border border-text-primary">APPROVED</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center border-t-2 border-text-primary/10 pt-4 font-mono text-[10px] text-text-secondary/80 font-bold">
                <span>METHOD: STAGGERED DATA TRIGGERS</span>
                <span>RECOURSE: AUTOMATIC SWEEP</span>
              </div>
            </div>

            {/* Card 3: Kill Switch */}
            <div
              className={`absolute w-full p-8 border-2 border-text-primary transition-all duration-700 bg-[#FDF3C8] text-text-primary flex flex-col justify-between shadow-[8px_8px_0px_rgba(27,23,34,1)] ${
                currentWordIndex === 2
                  ? "scale-100 z-30 opacity-100 translate-y-0"
                  : "scale-95 z-20 opacity-60 translate-y-6 pointer-events-none"
              }`}
            >
              <div className="flex justify-between items-center border-b-2 border-text-primary/20 pb-4">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-text-secondary font-bold">
                  STEP 03 // MANDATE ENFORCEMENT
                </span>
                <Icon name="shield" size={24} className="text-text-primary" />
              </div>
              <div className="py-6 space-y-4 text-left">
                <p className="font-mono text-xl md:text-2xl font-bold tracking-tight text-center uppercase">
                  Instant Verification Fallback
                </p>
                <div className="grid grid-cols-2 gap-4 font-mono text-xs text-text-primary border-t-2 border-text-primary/20 pt-4 max-w-md mx-auto">
                  <div>
                    <span className="block text-[10px] text-text-secondary/80 font-bold mb-1">TRIGGER EVENT</span>
                    <span>Policy Deviation Detected</span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-text-secondary/80 font-bold mb-1">SWEEP DELAY</span>
                    <span>&lt; 150ms Execution</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-between items-center border-t-2 border-text-primary/20 pt-4 font-mono text-[10px] text-text-secondary/80 font-bold">
                <span>CREDENTIAL REVOKED</span>
                <span>WRITE-OFF: BOUNDED BY LIMIT</span>
              </div>
            </div>
          </div>

          {/* Dot Indicators */}
          <div className="flex gap-3 justify-center">
            {words.map((_, i) => (
              <span
                key={i}
                className={`h-2.5 w-2.5 transition-all duration-300 border border-text-primary ${
                  currentWordIndex === i ? "bg-text-primary scale-125" : "bg-transparent"
                }`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* ── 2.5 How it Works ── */}
      <section className="border-b-2 border-text-primary/10 bg-transparent py-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-8 lg:px-16 mb-20 text-center relative z-20">
          <h2 className="font-mono text-4xl md:text-5xl uppercase tracking-wider text-text-primary font-bold inline-block border-b-4 border-text-primary pb-2 bg-[#FDF3C8] px-4 shadow-[4px_4px_0px_rgba(27,23,34,1)] transform -rotate-1">
            How it works
          </h2>
        </div>
        <HowItWorks features={howItWorksSteps} />
      </section>

      {/* ── 3. Footer Reveal Section ── */}
      <section
        ref={footerRef}
        className="bg-[#FDF3C8] text-text-primary overflow-hidden border-t-2 border-text-primary/10"
      >
        {/* Big reveal headline */}
        <div className="px-8 lg:px-16 pt-40 pb-32 border-b-2 border-text-primary/10">
          <div className="max-w-7xl mx-auto">
            <div className="overflow-hidden mb-4">
              <span
                ref={(el) => { footerLineRefs.current[0] = el; }}
                className="inline-block font-mono text-xs uppercase tracking-[0.35em] text-text-secondary font-bold"
              >
                Ledger Editorial · PS1
              </span>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {footerWords.map((word, i) => (
                <div key={i} className="overflow-hidden py-2">
                  <span
                    ref={(el) => { footerLineRefs.current[i + 1] = el; }}
                    className={`inline-block font-mono text-5xl md:text-7xl lg:text-[7rem] font-bold uppercase leading-none tracking-tight ${word === "Agents." ? "bg-white px-4 border-4 border-text-primary" : "text-text-primary"}`}
                  >
                    {word}
                  </span>
                </div>
              ))}
            </div>
            <div className="overflow-hidden mt-8">
              <span
                ref={(el) => { footerLineRefs.current[footerWords.length + 1] = el; }}
                className="inline-block font-mono text-sm text-text-secondary max-w-lg leading-relaxed font-bold"
              >
                Real-time automated credit underwriting for autonomous AI agents.
                Enforced by policy. Zero human judgment per transaction.
              </span>
            </div>
          </div>
        </div>

        {/* Footer meta row */}
        <div className="px-8 lg:px-16 py-16 max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="overflow-hidden">
            <span
              ref={(el) => { footerLineRefs.current[footerWords.length + 2] = el; }}
              className="inline-block font-mono text-xs text-text-secondary uppercase tracking-widest font-bold"
            >
              Demo Only — Not a live lending product.
            </span>
          </div>
          <div className="overflow-hidden">
            <span
              ref={(el) => { footerLineRefs.current[footerWords.length + 3] = el; }}
              className="inline-flex items-center gap-6 font-mono text-xs text-text-secondary uppercase font-bold"
            >
              <Link href="/" className="hover:text-text-primary transition-colors">Product</Link>
              <Link href="/" className="hover:text-text-primary transition-colors">How it works</Link>
              <Link href="/login" className="hover:text-text-primary transition-colors border-b-2 border-text-primary pb-0.5">Log in →</Link>
            </span>
          </div>
        </div>
      </section>

    </div>
  );
}
