"use client";

import React from "react";
import { LazyMotion, domAnimation, m } from "motion/react";

interface CardProps {
  number: string;
  title: string;
  description: string;
  colorTheme?: "teal" | "gold" | "orange" | "blue" | "purple";
  className?: string;
  rotate?: string;
  colors?: {
    bg: string;
    text: string;
    border: string;
  };
}

const Pin = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path stroke="none" d="M0 0h24v24H0z" fill="none" />
    <path d="M16 3a1 1 0 0 1 .117 1.993l-.117 .007v4.764l1.894 3.789a1 1 0 0 1 .1 .331l.006 .116v2a1 1 0 0 1 -.883 .993l-.117 .007h-4v4a1 1 0 0 1 -1.993 .117l-.007 -.117v-4h-4a1 1 0 0 1 -.993 -.883l-.007 -.117v-2a1 1 0 0 1 .06 -.34l.046 -.107l1.894 -3.791v-4.762a1 1 0 0 1 -.117 -1.993l.117 -.007h8z" />
  </svg>
);

const Card = ({
  number,
  title,
  description,
  colorTheme = "teal",
  className,
  rotate,
  colors: customColors,
}: CardProps) => {
  const defaultBgColors: Record<string, string> = {
    teal: "bg-[#E0F2F1]", // Light pastel teal
    gold: "bg-[#FDF3C8]", // Sticky note yellow
    orange: "bg-orange-50",
    blue: "bg-blue-50",
    purple: "bg-purple-50",
  };
  const defaultTextColors: Record<string, string> = {
    teal: "text-text-primary",
    gold: "text-text-primary",
    orange: "text-orange-500",
    blue: "text-blue-600",
    purple: "text-purple-600",
  };
  const defaultBorderColors: Record<string, string> = {
    teal: "border-text-primary border-2",
    gold: "border-text-primary border-2",
    orange: "border-orange-200 border-2",
    blue: "border-blue-200 border-2",
    purple: "border-purple-200 border-2",
  };

  const bgColor = customColors?.bg || defaultBgColors[colorTheme];
  const textColor = customColors?.text || defaultTextColors[colorTheme];
  const borderColor = customColors?.border || defaultBorderColors[colorTheme];

  return (
    <div
      className={`relative w-full md:w-[320px] transition-transform duration-300 hover:z-30 hover:scale-105 ${rotate} ${className}`}
    >
      {/* Outer editorial box */}
      <div className="bg-[#F5F5F0] p-3 border-2 border-text-primary shadow-[8px_8px_0px_rgba(27,23,34,1)]">
        <Pin className={`w-8 h-8 ${textColor} z-20 mb-4 mx-auto`} />
        
        {/* Inner content box */}
        <div
          className={`${bgColor} ${borderColor} p-[15px] h-full flex flex-col relative overflow-hidden`}
        >
          <span
            className={`${textColor} text-3xl font-mono font-bold mb-4`}
          >
            {number}
          </span>
          <h3 className="text-xl font-mono font-bold uppercase tracking-wider text-text-primary mb-3">
            {title}
          </h3>
          <p className="text-text-secondary font-mono text-sm leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
};

export interface Step {
  title: string;
  description: string;
  colorTheme?: "teal" | "gold" | "orange" | "blue" | "purple";
  colors?: {
    bg: string;
    text: string;
    border: string;
  };
}

export interface StepPosition {
  className?: string;
  rotate?: string;
}

export interface HowItWorksProps {
  features?: Step[];
  className?: string;
  stepPositions?: StepPosition[];
}

const DEFAULT_CARD_POSITIONS: StepPosition[] = [
  { className: "md:absolute md:top-0 md:left-[10%]", rotate: "rotate-3" },
  {
    className: "md:absolute md:top-[120px] md:right-[10%]",
    rotate: "-rotate-2",
  },
  { className: "md:absolute md:top-[450px] md:left-[12%]", rotate: "rotate-4" },
  {
    className: "md:absolute md:top-[570px] md:right-[8%]",
    rotate: "-rotate-3",
  },
  { className: "md:absolute md:top-[850px] md:left-[10%]", rotate: "rotate-2" },
];

export default function HowItWorks({
  features,
  className,
  stepPositions,
}: HowItWorksProps) {
  // Use the provided features or fallback to an empty array
  const data = features && features.length > 0 ? features : [];
  const positions = stepPositions || DEFAULT_CARD_POSITIONS;

  // Since we have 5 steps, the height is approximately 1130px
  let height = 1130;
  if (data.length === 1) height = 400;
  else if (data.length === 2) height = 450;
  else if (data.length === 3) height = 800;
  else if (data.length === 4) height = 900;
  else height = 1130;

  return (
    <LazyMotion features={domAnimation}>
      <div
        className={`bg-transparent max-md:pt-10 max-md:pb-25 md:py-20 px-8 relative ${className}`}
      >
        {/* We removed the explicit grid backgrounds here because the editorial layout already has them globally on the body */}
        
        <div className="max-w-6xl mx-auto relative z-10">
          <div
            className="relative w-full max-w-[1000px] mx-auto flex flex-col space-y-12 md:space-y-0 md:block h-auto md:h-[var(--md-height)]"
            style={{ "--md-height": `${height}px` } as React.CSSProperties}
          >
            {data.length > 1 && (
              <svg
                className="absolute top-0 left-0 w-full h-full pointer-events-none hidden md:block z-0"
                viewBox={`0 0 1000 ${height}`}
                preserveAspectRatio="none"
              >
                {(() => {
                  const pathD = data.reduce((acc, _, index) => {
                    if (index >= data.length - 1) return acc;
                    if (index === 0)
                      return "M 290 150 C 500 150, 550 270, 710 270"; // 1 -> 2
                    if (index === 1)
                      return acc + " C 850 270, 500 350, 290 450"; // 2 -> 3
                    if (index === 2)
                      return acc + " C 290 600, 550 720, 750 720"; // 3 -> 4
                    if (index === 3)
                      return acc + " C 950 720, 500 800, 290 850"; // 4 -> 5
                    return acc;
                  }, "");
                  return (
                    <m.path
                      d={pathD}
                      stroke="#1B1722"
                      className="text-text-primary"
                      strokeWidth="2"
                      strokeDasharray="8 6"
                      fill="none"
                      strokeLinecap="round"
                      vectorEffect="non-scaling-stroke"
                      initial={{ strokeDashoffset: 0 }}
                      animate={{
                        strokeDashoffset: -140, // Multiple of 14 (8+6) for seamless loop
                      }}
                      transition={{
                        duration: 3,
                        repeat: Infinity,
                        ease: "linear",
                      }}
                    />
                  );
                })()}
              </svg>
            )}

            {data.map((step, index) => {
              const position = positions[index % positions.length];

              return (
                <Card
                  key={step.title}
                  number={`0${index + 1}`}
                  title={step.title}
                  description={step.description}
                  colorTheme={step.colorTheme || "teal"}
                  colors={step.colors}
                  rotate={position.rotate}
                  className={position.className}
                />
              );
            })}
          </div>
        </div>
      </div>
    </LazyMotion>
  );
}
