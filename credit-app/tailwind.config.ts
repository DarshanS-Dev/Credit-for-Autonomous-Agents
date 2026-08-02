import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: "#017587",
        surface: "#E9EDF6",
        "text-primary": "#1F242A",
        "text-secondary": "#5B6064",
        accent: "#F0B419",
        danger: "#8B4343",
      },
      fontFamily: {
        mono: ["IBM Plex Mono", "monospace"],
        sans: ["Plus Jakarta Sans", "sans-serif"],
        display: ["Space Grotesk", "sans-serif"],
      },
      transitionTimingFunction: {
        DEFAULT: "cubic-bezier(0.25, 1, 0.5, 1)",
        spring: "cubic-bezier(0.25, 1, 0.5, 1)",
        swift: "cubic-bezier(0.32, 0.72, 0, 1)",
      },
    },
  },
  plugins: [],
};
export default config;
