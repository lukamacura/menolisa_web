"use client";

/**
 * The phone-screenshot treatment, shared by the /register diagnosis screen and
 * the paywall's "Everything included" card.
 *
 * It lived inside app/register/page.tsx until the paywall needed the same three
 * shots. Two copies of a treatment this specific (bezel radius, tilt, crop, the
 * fade that hides the crop) drift apart within a release, and the one comparison
 * neither screen can afford is looking like two different products — so there is
 * one copy, here.
 */

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/** Intrinsic size of the /screenshots masters, and the default for <PhoneShot />.
 *  Passed to next/image so the reserved box matches the file's real aspect ratio;
 *  a shot from another set (the retired /diagnosys masters were 1080x2192) must
 *  pass its own dimensions or it letterboxes inside the reserved box. */
export const SHOT_W = 1320;
export const SHOT_H = 2868;

/** Exported because /register preloads these shots before the diagnosis screen
 *  mounts, and a preload has to declare the *same* layout width as the <img> or
 *  it warms a different candidate out of the srcset — i.e. downloads the shot
 *  twice and still shows the second one loading. Change it here only. */
export const PHONE_SHOT_SIZES = "(max-width: 480px) 55vw, 260px";

// A real app screenshot shown as physical evidence: phone-framed, tilted a few
// degrees and cropped by its stage so it reads as a photo of the product rather
// than a flat asset. Always paired with <ShotStage />, which does the clipping.
export function PhoneShot({
  src,
  alt,
  rotate = 0,
  delay = 0,
  className,
  width = SHOT_W,
  height = SHOT_H,
}: {
  src: string;
  alt: string;
  rotate?: number;
  delay?: number;
  className?: string;
  width?: number;
  height?: number;
}) {
  const prefersReducedMotion = useReducedMotion();
  return (
    <motion.div
      // `initial` is the same on the server and the client on purpose. It used
      // to branch on prefersReducedMotion, which reads false through hydration
      // and true immediately after — so a reduced-motion visitor got a hydration
      // mismatch on this element's inline style. Reduced motion is honoured by
      // collapsing the transition to zero instead: same end state, no travel.
      initial={{ opacity: 0, y: 26, rotate: rotate * 0.25 }}
      whileInView={{ opacity: 1, y: 0, rotate }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{
        duration: prefersReducedMotion ? 0 : 0.6,
        delay: prefersReducedMotion ? 0 : delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={cn(
        "shrink-0 rounded-[1.4rem] bg-white p-[3px] ring-1 ring-black/5 shadow-[0_16px_36px_-10px_rgba(61,61,61,0.45)]",
        className
      )}
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes={PHONE_SHOT_SIZES}
        className="w-full h-auto rounded-[1.25rem]"
      />
    </motion.div>
  );
}

/** Tinted stage that crops the phones at the bottom, so they peek in rather than
    dominate the card. `fadeFrom` should match the surface underneath. */
export function ShotStage({
  children,
  className,
  fadeFrom = "from-card",
}: {
  children: React.ReactNode;
  className?: string;
  fadeFrom?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden bg-linear-to-br from-primary/12 via-[#ffeb76]/12 to-info/12",
        className
      )}
    >
      <div className="flex items-start justify-center gap-2 px-4 pt-5">{children}</div>
      <div
        className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-linear-to-t to-transparent", fadeFrom)}
      />
    </div>
  );
}
