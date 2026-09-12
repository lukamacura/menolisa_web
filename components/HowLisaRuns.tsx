"use client";

import { useMemo } from "react";
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
 * **No store listings, before the purchase (removed 2026-09-12).** Two
 * captured App Store / Google Play listings sat under the rows, meant as proof
 * the app is real. Each listing prints "Free · In-App Purchases" in Apple's and
 * Google's own chrome, one screen before a $29 web checkout, so the page itself
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
      body: `Your ${PLAN_WEEKS}-week plan, a habit tracker and a symptom tracker - already filled in, nothing to set up.`,
    },
    {
      title: "You tick off today",
      body: "Four small things, and one tap for how you felt. Two minutes, and you're done.",
    },
    {
      title: "Lisa reads what you logged",
      body: `She rewrites next week around your ${topLabel} - so the plan follows you, not a template.`,
    },
    {
      title: "And she's there at 2am",
      body: "Ask her anything, any hour. Straight answers, no waiting room.",
    },
  ];
}

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
        "rounded-2xl bg-card border-2 border-[#E8DDD9] p-4 shadow-md shadow-primary/5",
        className
      )}
    >
      <ul className="flex flex-col gap-3">
        {steps.map((step) => (
          <li key={step.title} className="flex gap-2.5">
            <span
              aria-hidden
              className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
            />
            <div className="min-w-0">
              <p className="text-xs font-bold text-[#3D3D3D] leading-tight">{step.title}</p>
              <p className="text-[11px] text-[#5A5A5A] leading-snug mt-0.5">{step.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
