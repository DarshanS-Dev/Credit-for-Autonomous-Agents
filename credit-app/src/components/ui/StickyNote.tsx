import React from "react";

interface StickyNoteProps {
  rotationDeg?: number;
  bgColor?: string;
  shadow?: string;
  children: React.ReactNode;
  className?: string;
}

export function StickyNote({
  rotationDeg = 0,
  bgColor = "bg-[var(--primary-yellow)]",
  shadow = "shadow-[4px_4px_0px_rgba(31,36,42,1)]",
  children,
  className = "",
}: StickyNoteProps) {
  return (
    <div
      className={`p-4 border-2 border-text-primary ${bgColor} ${shadow} transition-transform hover:scale-105 ${className}`}
      style={{ transform: `rotate(${rotationDeg}deg)` }}
    >
      {children}
    </div>
  );
}
