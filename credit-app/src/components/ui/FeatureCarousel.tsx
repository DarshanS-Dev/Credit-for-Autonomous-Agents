"use client";

import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const SLIDES = [
    {
        id: 1,
        title: "Autonomous Agent Credit",
        description: "Delegated liquidity pipelines and credit limits tailored for autonomous AI agents.",
    },
    {
        id: 2,
        title: "Cryptographic Mandates",
        description: "Hardware-level key signing ensuring unalterable agent execution safety.",
    },
    {
        id: 3,
        title: "Real-Time Safeguards",
        description: "Automated risk evaluation telemetry protecting principal capital round-the-clock.",
    },
];

export const FeatureCarousel = () => {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % SLIDES.length);
        }, 4500);
        return () => clearInterval(timer);
    }, []);

    return (
        <div className="flex flex-col items-center text-center px-4 max-w-sm mx-auto">
            <div className="min-h-[75px] flex flex-col items-center justify-center">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentIndex}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
                        className="flex flex-col items-center gap-1.5"
                    >
                        <h2 className="font-mono text-lg font-bold uppercase tracking-tight text-text-primary">
                            {SLIDES[currentIndex].title}
                        </h2>
                        <p className="font-mono text-xs text-text-secondary leading-relaxed max-w-xs">
                            {SLIDES[currentIndex].description}
                        </p>
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* Pagination Dots */}
            <div className="flex items-center gap-2 mt-3">
                {SLIDES.map((slide, idx) => (
                    <button
                        key={slide.id}
                        onClick={() => setCurrentIndex(idx)}
                        className="p-1 focus:outline-none"
                        aria-label={`Go to slide ${idx + 1}`}
                    >
                        <motion.div
                            className={`rounded-full border border-text-primary ${idx === currentIndex ? "bg-[#017587]" : "bg-text-primary/20"
                                }`}
                            animate={{
                                width: idx === currentIndex ? 24 : 8,
                                height: 8,
                            }}
                            transition={{ duration: 0.3 }}
                        />
                    </button>
                ))}
            </div>
        </div>
    );
};

export default FeatureCarousel;
