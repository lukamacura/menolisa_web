import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The rest of a list, going out of focus.
 *
 * One row is shown plainly and everything under it fades out: rising blur,
 * falling opacity, and a mask that takes the stack to nothing at its bottom
 * edge. It is used on the paywall's week-1 card and on the funnel's week and
 * session reward boards, and it is one component on purpose - three copies of
 * a blur ladder drift, and the effect only reads as deliberate while every
 * surface fades at the same rate.
 *
 * **What is behind the blur is always real.** This is her own week, at the
 * resolution of a page she has not turned yet - never a placeholder list, and
 * never rows invented to make the stack look longer. The caller states in
 * words how much is under there, so nothing claims more than it holds.
 *
 * The whole stack is `aria-hidden`: a screen reader would otherwise read out,
 * in full, exactly what the sighted page is withholding - both a contradiction
 * and a worse experience than the one-line summary the caller prints beside it.
 * It is inert to pointer and selection for the same reason.
 */

/**
 * How far each row past the first is out of focus. Two ladders rather than
 * one: blur alone at a readable opacity reads as broken rendering, and opacity
 * alone reads as disabled. Together they read as depth. They flatten at the end
 * so a long list does not vanish outright - the mask is what closes it out.
 */
const BLUR_STEPS = [1.6, 3.2, 4.6, 5.5];
const FADE_STEPS = [0.72, 0.5, 0.36, 0.3];

const MASK =
  "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0) 100%)";

export function BlurStack({
  items,
  className,
  itemClassName,
  /** `ul` when the items are `<li>` - keeps the markup legal on either caller. */
  as = "div",
}: {
  items: ReactNode[];
  className?: string;
  itemClassName?: string;
  as?: "div" | "ul";
}) {
  if (!items.length) return null;
  const Item = as;
  return (
    <div
      aria-hidden
      className={cn("pointer-events-none relative select-none overflow-hidden", className)}
      style={{ WebkitMaskImage: MASK, maskImage: MASK }}
    >
      {items.map((node, i) => (
        <Item
          key={i}
          className={itemClassName}
          style={{
            filter: `blur(${BLUR_STEPS[Math.min(i, BLUR_STEPS.length - 1)]}px)`,
            opacity: FADE_STEPS[Math.min(i, FADE_STEPS.length - 1)],
          }}
        >
          {node}
        </Item>
      ))}
    </div>
  );
}
