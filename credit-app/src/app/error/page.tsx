"use client";

import React, { useEffect, useRef } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { gsap } from "gsap";

export default function ErrorPage() {
  const containerRef = useRef<HTMLDivElement>(null);

  // Signature curtain reveal animation
  useEffect(() => {
    if (containerRef.current) {
      gsap.fromTo(
        containerRef.current,
        { clipPath: "inset(0 0 100% 0)", opacity: 0 },
        { clipPath: "inset(0 0 0% 0)", opacity: 1, duration: 0.55, ease: "power4.out" }
      );
    }
  }, []);

  return (
    <div 
      ref={containerRef}
      className="flex-1 min-h-[80vh] flex flex-col items-center justify-center p-6 bg-editorial-grid font-mono text-center space-y-6"
    >
      <div className="text-danger">
        <Icon name="warning" size={64} />
      </div>

      <div className="max-w-md space-y-2">
        <h2 className="text-xl font-bold uppercase text-text-primary">
          Something went wrong
        </h2>
        <p className="text-sm text-text-secondary">
          An unexpected error occurred. You can retry or return to your dashboard.
        </p>
      </div>

      <div className="flex gap-4 pt-4">
        <Button variant="ghost" onClick={() => window.location.reload()}>
          Retry
        </Button>
        <Link href="/">
          <Button variant="primary">Back to dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
