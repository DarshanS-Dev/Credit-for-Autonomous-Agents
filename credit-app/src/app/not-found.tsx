"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";

export default function NotFound() {
  const [scrambledNum, setScrambledNum] = useState("###");

  useEffect(() => {
    let iteration = 0;
    const interval = setInterval(() => {
      const chars = "0123456789";
      const target = "404";
      const scrambled = target
        .split("")
        .map((char, index) => {
          if (index < iteration) return char;
          return chars[Math.floor(Math.random() * chars.length)];
        })
        .join("");

      setScrambledNum(scrambled);
      iteration += 1;
      
      if (iteration > target.length) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 min-h-[80vh] flex flex-col items-center justify-center p-6 bg-editorial-grid font-mono text-center space-y-6">
      <div className="text-text-secondary">
        <Icon name="broken-link" size={64} />
      </div>

      <h1 className="text-8xl font-extrabold text-accent leading-none tracking-tighter">
        {scrambledNum}
      </h1>

      <div className="max-w-md space-y-2">
        <h2 className="text-lg font-bold uppercase text-text-primary">
          Page not found
        </h2>
        <p className="text-sm text-text-secondary">
          The page you're looking for doesn't exist or may have moved.
        </p>
      </div>

      <div className="pt-4">
        <Link href="/">
          <Button variant="primary">Back to Dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
