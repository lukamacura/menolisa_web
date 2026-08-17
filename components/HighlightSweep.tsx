"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Marker-pen sweep behind a word - the register funnel's headline highlight,
 * shared so the paywall carries the identical effect. Pass `active` to drive it
 * from a timer; leave it off and it sweeps when the line scrolls into view.
 *
 * Variants are not decoration - they carry the funnel's one colour rule:
 *
 *   primary  brand / the offer          ("your personalized 8-week plan")
 *   green    the gap, and what closes it
 *   rose     the load she is carrying now
 *   yellow   plain emphasis, no verdict attached
 *
 * `rose` exists for the results headline, where the swept phrase is the finding
 * about how she feels. Sweeping that in brand pink would paint the verdict in
 * the same ink as the CTA, which is the one thing on the page that must read as
 * "tap me" and nothing else.
 */
type SweepVariant = "primary" | "green" | "rose" | "yellow";

const SWEEP_INK: Record<SweepVariant, string> = {
  primary: "text-primary",
  green: "text-green-700",
  rose: "text-[#B23A31]",
  yellow: "text-[#3D3D3D]",
};

const SWEEP_WASH: Record<SweepVariant, string> = {
  primary: "bg-primary/20",
  green: "bg-green-500/20",
  rose: "bg-[#DB4F45]/15",
  yellow: "bg-yellow-300/60",
};

export function HighlightSweep({
  children,
  active,
  variant = "primary",
}: {
  children: React.ReactNode;
  active?: boolean;
  variant?: SweepVariant;
}) {
  const prefersReducedMotion = useReducedMotion();
  const controlled = active !== undefined;
  const on = !prefersReducedMotion && (controlled ? active : true);
  const sweep = {
    className: cn(
      "absolute inset-0 rounded-sm pointer-events-none px-0.5",
      SWEEP_WASH[variant]
    ),
  };

  return (
    <span className="relative inline-block">
      <span className={cn("relative z-10", SWEEP_INK[variant])}>{children}</span>
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
