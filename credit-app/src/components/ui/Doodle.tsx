import React from "react";

export type DoodleType = "scribble" | "sparkle" | "motion";

interface DoodleProps {
  type: DoodleType;
  className?: string;
  size?: number;
}

export const Doodle: React.FC<DoodleProps> = ({ type, className = "", size = 24 }) => {
  if (type === "scribble") {
    return (
      <svg 
        viewBox="0 0 32 32" 
        width={size} 
        height={size} 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
        className={`inline-block ${className}`}
        style={{ verticalAlign: "middle", marginBottom: "0.1em" }}
      >
        <path d="M10 8 C16 4, 24 6, 22 12 C20 18, 10 16, 12 22 C13 26, 20 25, 18 20" />
      </svg>
    );
  }

  if (type === "sparkle") {
    return (
      <svg 
        viewBox="0 0 24 24" 
        width={size * 0.75} 
        height={size * 0.75} 
        fill="currentColor"
        className={`inline-block ${className}`}
        style={{ verticalAlign: "middle", marginBottom: "0.1em" }}
      >
        <path d="M12 2 L14 10 L22 12 L14 14 L12 22 L10 14 L2 12 L10 10 Z" />
      </svg>
    );
  }

  if (type === "motion") {
    return (
      <svg 
        viewBox="0 0 24 24" 
        width={size * 0.75} 
        height={size * 0.75} 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round"
        fill="none"
        className={`inline-block ${className}`}
        style={{ verticalAlign: "middle", marginBottom: "0.1em" }}
      >
        <path d="M4 20 L9 12" />
        <path d="M9 21 L13 14" />
        <path d="M14 22 L17 17" />
      </svg>
    );
  }

  return null;
};
