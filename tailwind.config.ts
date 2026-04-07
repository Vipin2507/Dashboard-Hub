import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      screens: {
        xs: "375px",
        /** Align custom name with `SIDEBAR_RAIL_BREAKPOINT_PX` / Tailwind `lg` */
        nav: "1024px",
      },
      /** Design tokens from `src/index.css` :root — use p-4, gap-3, m-6, etc. */
      spacing: {
        1: "var(--space-1)",
        2: "var(--space-2)",
        3: "var(--space-3)",
        4: "var(--space-4)",
        5: "var(--space-5)",
        6: "var(--space-6)",
        8: "var(--space-8)",
        10: "var(--space-10)",
        topbar: "var(--app-topbar-height)",
        sidebar: "var(--app-sidebar-width)",
      },
      fontSize: {
        xs: ["var(--text-xs)", { lineHeight: "var(--lh-tight)" }],
        sm: ["var(--text-sm)", { lineHeight: "var(--lh-normal)" }],
        base: ["var(--text-base)", { lineHeight: "var(--lh-normal)" }],
        md: ["var(--text-md)", { lineHeight: "var(--lh-normal)" }],
        lg: ["var(--text-lg)", { lineHeight: "var(--lh-normal)" }],
        xl: ["var(--text-xl)", { lineHeight: "var(--lh-tight)" }],
        "2xl": ["var(--text-2xl)", { lineHeight: "var(--lh-tight)" }],
      },
      lineHeight: {
        tight: "var(--lh-tight)",
        normal: "var(--lh-normal)",
        loose: "var(--lh-loose)",
      },
      borderRadius: {
        /** Maps `rounded-xl` to design token (16px); shadcn `lg`/`md`/`sm` still use `--radius` */
        xl: "var(--radius-xl)",
        "ds-sm": "var(--radius-sm)",
        "ds-md": "var(--radius-md)",
        "ds-lg": "var(--radius-lg)",
        "ds-xl": "var(--radius-xl)",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        hover: "var(--shadow-hover)",
      },
      maxWidth: {
        /** App content column (Part 0 page shell) */
        page: "var(--page-max-width)",
        "sidebar-drawer": "var(--app-sidebar-drawer-max)",
        "screen-xl": "1400px",
      },
      zIndex: {
        "app-backdrop": "var(--app-layout-z-backdrop)",
        "app-mobile-nav": "var(--app-layout-z-mobile-nav)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": { from: { height: "0" }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: "0" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
