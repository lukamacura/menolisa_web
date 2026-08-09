"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Marker-pen sweep behind a word - the register funnel's headline highlight,
 * shared so the paywall carries the identical effect. Pass `active` to drive it
 * from a timer; leave it off and it sweeps when the line scrolls into view.
 */
export function HighlightSweep({
  children,
  active,
  variant = "primary",
}: {
  children: React.ReactNode;
  active?: boolean;
  variant?: "primary" | "green" | "yellow";
}) {
  const prefersReducedMotion = useReducedMotion();
  const controlled = active !== undefined;
  const on = !prefersReducedMotion && (controlled ? active : true);
  const sweep = {
    className: cn(
      "absolute inset-0 rounded-sm pointer-events-none px-0.5",
      variant === "green"
        ? "bg-green-500/20"
        : variant === "yellow"
          ? "bg-yellow-300/60"
          : "bg-primary/20"
    ),
  };

  return (
    <span className="relative inline-block">
      <span
        className={cn(
          "relative z-10",
          variant === "green"
            ? "text-green-700"
            : variant === "yellow"
              ? "text-[#3D3D3D]"
              : "text-primary"
        )}
      >
        {children}
      </span>
      {controlled ? (
        <motion.span
          {...sweep}
          initial={{ scaleX: 0, transformOrigin: "left" }}
          animate={on ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          style={{ zIndex: 0, willChange: on ? "transform" : "auto" }}
        />
      ) : (
        <motion.span
          {...sweep}
          initial={{ scaleX: 0, transformOrigin: "left" }}
          whileInView={on ? { scaleX: 1 } : { scaleX: 0 }}
          viewport={{ once: true, amount: 0.8 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1], delay: 0.15 }}
          style={{ zIndex: 0 }}
        />
      )}
    </span>
  );
}
