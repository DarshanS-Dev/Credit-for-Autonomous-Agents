import React from "react";

interface CardProps {
  role?: "principal" | "lender" | "none";
  className?: string;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ role = "none", className = "", children }) => {
  // Use a slight random-looking rotation, or just a fixed one for the sticky note feel
  const rotationClass = role === "principal" ? "-rotate-1" : role === "lender" ? "rotate-1" : "-rotate-[0.5deg]";

  return (
    <div className={`relative bg-[#FDF3C8] shadow-[4px_4px_12px_rgba(0,0,0,0.08)] p-8 text-text-primary ${rotationClass} ${className}`}>
      {/* 4 Flat Gray Squares (Perforations/Binding Marks) */}
      <div className="absolute top-2 left-0 w-full flex justify-between px-10">
        <div className="w-2.5 h-2.5 bg-gray-300/80"></div>
        <div className="w-2.5 h-2.5 bg-gray-300/80"></div>
        <div className="w-2.5 h-2.5 bg-gray-300/80"></div>
        <div className="w-2.5 h-2.5 bg-gray-300/80"></div>
      </div>
      
      <div className="mt-4">
        {children}
      </div>
    </div>
  );
};
