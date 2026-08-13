/** Shared motion easing — ease-out-expo-ish. Use everywhere. */
export const EASE = [0.22, 1, 0.36, 1] as const;

export const THEME_EASE = "cubic-bezier(0.33, 0, 0.2, 1)";

export const pageEnter = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: EASE },
};

export const navPillSpring = { type: "spring" as const, stiffness: 390, damping: 34 };

export const staggerContainer = {
  animate: { transition: { staggerChildren: 0.04, delayChildren: 0.04 } },
};

export const staggerItem = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
};

export const hoverLift = { y: -1 };
export const tapPress = { scale: 0.98 };

export const chartTooltipStyle = {
  background: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 11,
  color: "hsl(var(--foreground))",
  boxShadow: "0 1px 2px rgb(15 23 42 / 0.04)",
  padding: "6px 8px",
} as const;
