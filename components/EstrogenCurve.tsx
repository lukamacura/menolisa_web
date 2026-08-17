"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * The mechanism the results screen stakes its whole diagnosis on, drawn.
 *
 * The "why this is happening to you" card says her symptoms all trace back to
 * "estrogen rising and falling" - and until 2026-08-17 it said only that, in
 * one sentence, and moved on. That sentence is the load-bearing claim of the
 * entire funnel: it is what makes nine unrelated-feeling complaints into one
 * problem, and one problem is the only kind an 8-week plan can credibly sell
 * against. Asserting it in eleven words and illustrating nothing left the
 * screen's central argument as the least evidenced thing on it.
 *
 * It is also the only piece of *external* evidence the results screen can
 * carry. Everything else there - her score, her symptom tiles, her severity -
 * is her own self-report handed back to her, which proves the quiz was
 * listening but proves nothing about the world. This is the one block that
 * says something true independently of what she typed.
 *
 * Two paths, no axis numbers, no data claim:
 *
 *   steady   a regular premenopausal cycle - the rhythm she used to run on.
 *            Dashed and grey, because it is the reference, not the finding.
 *   erratic  perimenopause - same hormone, no longer predictable. Solid rose,
 *            drawn left to right, and filled down to the floor so the drops
 *            read as drops.
 *
 * Deliberately unlabelled on both axes. The pattern is the point and the
 * pattern is well documented; specific values are not, and printing a y-axis
 * would dress a general fact as a measurement of her. The caption says so out
 * loud, for the same reason the comparison card below it discloses that
 * "typical" is modelled: this screen only works if the sceptic can't catch it
 * overreaching once.
 *
 * Colour follows the screen's rule - rose is the load she is carrying now,
 * neutral ink is plain fact. The erratic line is rose; the steady line is not
 * green, because "before" is not the thing the plan sells her back.
 */

/* Geometry. The box is sized to the ink in it: the erratic line runs y=16..104
   and the floor sits at 106, so the swings reach the floor instead of floating
   above a rule with a band of nothing between them. That band was the bug -
   viewBox height used to be 120 with the baseline at 119, which drew a
   detached line under the chart with a visible hole above it. */
const VB_H = 110;
const FLOOR = 106;

const STEADY_PATH =
  "M 0 62 C 20 40, 40 40, 60 62 C 80 84, 100 84, 120 62 C 140 40, 160 40, 180 62 " +
  "C 200 84, 220 84, 240 62 C 260 40, 280 40, 300 62 L 320 62";

const ERRATIC_PATH =
  "M 0 78 C 12 70, 20 30, 34 26 C 48 22, 54 88, 70 92 C 84 96, 92 54, 106 50 " +
  "C 120 46, 128 70, 142 74 C 156 78, 160 18, 176 16 C 192 14, 198 96, 214 100 " +
  "C 228 104, 236 44, 250 40 C 264 36, 272 82, 286 86 C 298 90, 308 60, 320 56";

/** The same line, closed to the floor. It gives the swings a body, so the
    troughs read as drops rather than as a squiggle hanging in space. */
const ERRATIC_AREA = `${ERRATIC_PATH} L 320 ${FLOOR} L 0 ${FLOOR} Z`;

function LegendChip({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-0.5 w-4 rounded-full"
        style={
          dashed
            ? {
                backgroundImage: `repeating-linear-gradient(to right, ${color} 0 4px, transparent 4px 9px)`,
              }
            : { background: color }
        }
      />
      <span className="text-[10px] font-semibold text-[#5A5A5A]">{label}</span>
    </span>
  );
}

export function EstrogenCurve({ className }: { className?: string }) {
  const prefersReducedMotion = useReducedMotion();

  // Reduced motion gets both lines already drawn. `initial={false}` skips the
  // draw entirely rather than running it at zero duration.
  const draw = (delay: number) =>
    prefersReducedMotion
      ? { initial: false as const }
      : {
          initial: { pathLength: 0 },
          whileInView: { pathLength: 1 },
          viewport: { once: true, amount: 0.6 },
          transition: { duration: 1.1, delay, ease: [0.22, 1, 0.36, 1] as const },
        };

  // The steady line fades rather than draws. Animating `pathLength` makes
  // framer-motion own `strokeDasharray` - it writes the dash the draw needs
  // into the element's style, which beats the attribute - so a dashed path that
  // is also drawn silently renders solid. This line has to stay dashed: it is
  // the reference, and "before" reading as a second solid series is the whole
  // comparison lost.
  const fade = prefersReducedMotion
    ? { initial: false as const }
    : {
        initial: { opacity: 0 },
        whileInView: { opacity: 1 },
        viewport: { once: true, amount: 0.6 },
        transition: { duration: 0.5, delay: 0.1 },
      };

  return (
    <figure className={cn("rounded-xl border border-[#E8DDD9] bg-background p-3", className)}>
      <figcaption className="mb-2 text-[11px] font-bold leading-tight text-[#3D3D3D]">
        Same hormone. It just stopped keeping time.
      </figcaption>

      <svg
        viewBox={`0 0 320 ${VB_H}`}
        preserveAspectRatio="none"
        className="h-20 w-full sm:h-24"
        role="img"
        aria-label="Two lines comparing estrogen through a typical month. Before perimenopause the line rises and falls in a regular, even rhythm. During perimenopause the same hormone swings unpredictably, with sharp peaks and deep drops of different sizes."
      >
        <defs>
          <linearGradient id="estrogen-now-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#DB4F45" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#DB4F45" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* The floor, and the body sitting on it. */}
        <motion.path d={ERRATIC_AREA} fill="url(#estrogen-now-fill)" stroke="none" {...fade} />
        <line
          x1="0"
          y1={FLOOR}
          x2="320"
          y2={FLOOR}
          stroke="#E8DDD9"
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />

        <motion.path
          d={STEADY_PATH}
          fill="none"
          stroke="#B0B0B0"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray="4 5"
          vectorEffect="non-scaling-stroke"
          {...fade}
        />
        <motion.path
          d={ERRATIC_PATH}
          fill="none"
          stroke="#DB4F45"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          {...draw(0.35)}
        />
      </svg>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <LegendChip color="#B0B0B0" label="Before" dashed />
        <LegendChip color="#DB4F45" label="Now" />
      </div>

      <p className="mt-2 text-[10px] leading-snug text-[#9A9A9A]">
        Illustrative of the pattern in perimenopause, not a measurement of your levels.
      </p>
    </figure>
  );
}
