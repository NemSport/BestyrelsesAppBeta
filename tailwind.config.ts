import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        document: "var(--font-document)",
      },
      colors: {
        brand: "rgb(var(--brand-primary) / <alpha-value>)",
        "brand-hover": "rgb(var(--brand-primary-hover) / <alpha-value>)",
        secondary: "rgb(var(--brand-secondary) / <alpha-value>)",
        accent: "rgb(var(--brand-accent) / <alpha-value>)",
        canvas: "rgb(var(--brand-background) / <alpha-value>)",
        surface: "rgb(var(--brand-surface) / <alpha-value>)",
        subtle: "rgb(var(--brand-surface-subtle) / <alpha-value>)",
        ink: "rgb(var(--brand-text) / <alpha-value>)",
        muted: "rgb(var(--brand-text-muted) / <alpha-value>)",
        line: "rgb(var(--brand-border) / <alpha-value>)",
        "line-strong": "rgb(var(--brand-border-strong) / <alpha-value>)",
        danger: "rgb(var(--brand-danger) / <alpha-value>)",
        "danger-soft": "rgb(var(--brand-danger-soft) / <alpha-value>)",
        success: "rgb(var(--brand-success) / <alpha-value>)",
        "success-soft": "rgb(var(--brand-success-soft) / <alpha-value>)",
        warning: "rgb(var(--brand-warning) / <alpha-value>)",
        "warning-soft": "rgb(var(--brand-warning-soft) / <alpha-value>)",
        info: "rgb(var(--brand-info) / <alpha-value>)",
        "info-soft": "rgb(var(--brand-info-soft) / <alpha-value>)",
        progress: "rgb(var(--brand-progress) / <alpha-value>)",
        "progress-soft": "rgb(var(--brand-progress-soft) / <alpha-value>)",

        /* Compatibility aliases used by Phase 1.6-A1 and existing views. */
        forest: "rgb(var(--brand-primary) / <alpha-value>)",
        mist: "rgb(var(--brand-accent-soft) / <alpha-value>)",
        slate: {
          50: "rgb(var(--brand-surface-subtle) / <alpha-value>)",
          100: "rgb(var(--brand-accent-soft) / <alpha-value>)",
          300: "rgb(var(--brand-border-strong) / <alpha-value>)",
          400: "rgb(var(--brand-text-subtle) / <alpha-value>)",
          500: "rgb(var(--brand-text-muted) / <alpha-value>)",
          600: "rgb(var(--brand-text-muted) / <alpha-value>)",
          700: "rgb(var(--brand-secondary) / <alpha-value>)",
          900: "rgb(var(--brand-text) / <alpha-value>)",
          950: "rgb(var(--brand-primary) / <alpha-value>)",
        },
        red: {
          50: "rgb(var(--brand-danger-soft) / <alpha-value>)",
          100: "rgb(var(--brand-danger-soft) / <alpha-value>)",
          200: "rgb(var(--brand-danger) / 0.22)",
          400: "rgb(var(--brand-danger) / 0.72)",
          500: "rgb(var(--brand-danger) / <alpha-value>)",
          700: "rgb(var(--brand-danger) / <alpha-value>)",
          800: "rgb(var(--brand-danger) / <alpha-value>)",
        },
        emerald: {
          50: "rgb(var(--brand-success-soft) / <alpha-value>)",
          100: "rgb(var(--brand-success-soft) / <alpha-value>)",
          200: "rgb(var(--brand-success) / 0.2)",
          700: "rgb(var(--brand-success) / <alpha-value>)",
          800: "rgb(var(--brand-success) / <alpha-value>)",
        },
        amber: {
          50: "rgb(var(--brand-warning-soft) / <alpha-value>)",
          100: "rgb(var(--brand-warning-soft) / <alpha-value>)",
          200: "rgb(var(--brand-warning) / 0.22)",
          700: "rgb(var(--brand-warning) / <alpha-value>)",
          800: "rgb(var(--brand-warning) / <alpha-value>)",
          900: "rgb(var(--brand-warning) / <alpha-value>)",
        },
        blue: {
          50: "rgb(var(--brand-info-soft) / <alpha-value>)",
          100: "rgb(var(--brand-info-soft) / <alpha-value>)",
          200: "rgb(var(--brand-info) / 0.2)",
          700: "rgb(var(--brand-info) / <alpha-value>)",
          800: "rgb(var(--brand-info) / <alpha-value>)",
        },
        violet: {
          50: "rgb(var(--brand-progress-soft) / <alpha-value>)",
          800: "rgb(var(--brand-progress) / <alpha-value>)",
        },
        orange: {
          50: "rgb(var(--brand-warning-soft) / <alpha-value>)",
          800: "rgb(var(--brand-warning) / <alpha-value>)",
        },
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        dialog: "var(--shadow-dialog)",
      },
    },
  },
  plugins: [],
} satisfies Config;
