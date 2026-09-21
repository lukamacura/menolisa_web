"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLAN_WEEKS } from "@/lib/pricing";

/**
 * How the plan actually gets run - the loop, stated.
 *
 * This block used to be three icon rows with a title and a line of body copy
 * each: a feature list. A feature list answers "what do you get", and by this
 * point in the funnel she has already been shown that (block 1 is the plan
 * itself, with real app shots). What she has *not* been told is what the days
 * are like - what she does, what the app does, and in what order.
 *
 * It played that as a four-step animated sequence until 2026-09-09 - a
 * travelling spotlight, a numbered rail that filled and rewound, one step lit
 * at a time. Two things were wrong with it on this screen: the numbers made a
 * loop look like a checklist she completes once, and everything that moved sat
 * ~1500px into a page she is reading on a phone, so the beat she happened to
 * scroll into was the one she read. It is four static rows now. Nothing here
 * needs to be watched to be understood.
 *
 * **Drawn as a note pinned to the board (2026-09-21).** Same paper, rules and
 * tape as <PlanFinishBoard /> on the paywall - warm white, faintly ruled, two
 * strips of yellow tape - so the two surfaces read as one person's pinboard.
 * Each row is a ticked line on the note rather than a bullet: the point of
 * the block is that these are already done for her.
 *
 * **No store listings, before the purchase (removed 2026-09-12).** Two
 * captured App Store / Google Play listings sat under the rows, meant as proof
 * the app is real. Each listing prints "Free · In-App Purchases" in Apple's and
 * Google's own chrome, one screen before a $19 web checkout, so the page itself
 * suggested the cheaper route: leave, search the store, and buy (or not) there
 * — outside the funnel, outside attribution, and without the plan her quiz
 * built. The store badges live on the post-checkout download screen, which is
 * the one place they belong. Do not bring a listing back above the paywall.
 */

type Step = { title: string; body: string };

function buildSteps(topLabel: string): Step[] {
  return [
    {
      title: "It all lives in one app",
      body: `Your ${PLAN_WEEKS}-week plan, a habit tracker and a symptom tracker, already filled in. Nothing to set up.`,
    },
    {
      title: "You tick off today",
      body: "Four small things, then one tap for how you felt. Nothing to plan, nothing to remember.",
    },
    // "The app", not "Lisa" (2026-09-14): before checkout the name means
    // nothing, and the funnel now names the plan and the app everywhere it
    // used to name her. The AI disclosure lives in Terms §1 only (2026-09-20:
    // the word is off every marketing surface, the FAQ included).
    {
      title: "The app reads what you logged",
      body: `It builds next week from what you actually did, with your ${topLabel} in mind. Your plan, not a template.`,
    },
    {
      title: "And it's there at 2am",
      body: "Ask anything, any hour. Straight answers, no waiting room.",
    },
  ];
}

/** The tape strips <PlanFinishBoard /> uses, verbatim, so the two boards are
 *  held down by the same roll. */
const TAPE_STYLE = {
  background: "rgba(255,235,118,0.55)",
  boxShadow: "0 1px 2px rgba(61,61,61,0.12)",
} as const;

export function HowLisaRuns({
  topLabel,
  className,
}: {
  /** Her worst symptom, lowercased, as it reads after "around your …". */
  topLabel: string;
  className?: string;
}) {
  const steps = useMemo(() => buildSteps(topLabel), [topLabel]);

  return (
    <div
      className={cn(
        // pt-5: the tape overhangs the top edge, so the first line needs room
        // under it.
        "relative rounded-2xl border px-4 pt-5 pb-3 shadow-sm",
        className
      )}
      style={{
        borderColor: "#E8DDD9",
        // Paper: warm white, faintly ruled at 24px - the same sheet as the
        // finish board. `leading-6` on the rows below sits the text on the
        // rules rather than across them.
        backgroundColor: "#FFFDF8",
        backgroundImage:
          "repeating-linear-gradient(180deg, transparent 0 23px, rgba(61,61,61,0.045) 23px 24px)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -top-1.5 left-5 h-4 w-11 -rotate-6 rounded-[2px]"
        style={TAPE_STYLE}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -top-1.5 right-5 h-4 w-11 rotate-6 rounded-[2px]"
        style={TAPE_STYLE}
      />

      <ul className="flex flex-col gap-2">
        {steps.map((step) => (
          <li key={step.title} className="flex gap-2.5">
            <span
              aria-hidden
              className="mt-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-green-600/15"
            >
              <Check className="h-2.5 w-2.5 text-green-700" strokeWidth={3} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#3D3D3D] leading-6">{step.title}</p>
              <p className="text-[11px] text-[#5A5A5A] leading-snug -mt-0.5">{step.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
