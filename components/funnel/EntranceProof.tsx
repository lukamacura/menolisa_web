"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { Tape } from "@/components/Tape";
import { getSocialProofMembers } from "@/lib/testimonials";

/**
 * How long one woman holds the entrance before the next fades in.
 *
 * The same figure the reward board passes `<SocialProofPolaroid />`, for the
 * same reason: median dwell on screen 1 is 5-9 seconds, so at the paywall's
 * 8s the second woman would arrive after most visitors have tapped a tile
 * and the header would be one photograph. 4.5s is long enough to read a
 * two-line quote and short enough that a woman who hesitates meets a second
 * face before she leaves.
 */
const HOLD_MS = 4500;

/** The crossfade. Matches the polaroid's 0.6s so the two surfaces feel like
 *  the same object at two sizes. */
const FADE_CLASS = "transition-opacity duration-500 ease-out";

/**
 * The face beside the offer on the funnel's entrance.
 *
 * Screen 1 takes 100% of paid traffic and loses most of it before one tap.
 * Until 2026-09-20 the slot beside the headline held a 56px-wide phone
 * mockup, whose job was "this is an app, not a PDF" - and at 56px the Today
 * screen is an unreadable phone-shaped blob, so it did that job for nobody.
 * A member's face does something the mockup could not: a woman visibly in the
 * audience's own age range, in her own words, says "a real person already
 * walked this" - the one doubt a cold Instagram click carries that no clause
 * in the headline can answer.
 *
 * It is the paywall's polaroid at thumbnail size - same paper, same tape,
 * same tilt, same members from `lib/testimonials.ts`, same crossfade - so a
 * woman who reaches the paywall recognises the print rather than meeting a
 * second, unrelated set of faces. Two rules carry over from that card and one
 * is new:
 *
 *  - **Her words are hers.** The quote is `pullQuote`, a sentence that also
 *    appears verbatim in her story, chosen there and never retyped here. A
 *    face is a real person, and a sentence we wrote under one is fabricated
 *    proof on the screen whose whole job is the first tap. `draft` members
 *    never render in production - see `getSocialProofMembers()`.
 *  - **The frame is furniture; only the photograph and the quote change.**
 *    Every member's print and quote are mounted at once, stacked in one grid
 *    cell, and only `opacity` moves - so the header is permanently as tall as
 *    its longest quote and a swap never shifts the tile grid under her
 *    thumb. Re-dropping the print on every swap would make a photograph a
 *    slideshow.
 *  - **Weight leads.** The only live ad is a post-menopause weight-gain
 *    creative and 63% of finishers since 2026-09-13 tapped weight first, so
 *    the print she is guaranteed to see is the member whose caption is the
 *    weight (`leadWith: "weight_changes"`, the same ordering the reward board
 *    and paywall apply once she has tapped). There is one ad, so there is no
 *    parameter for this - change the constant when the creative changes.
 *
 * What must NOT be added here: stars, a rating or a member count. Those are
 * claims about a population and nothing sources them; a quote under a named
 * woman is a claim about her, made by her.
 *
 * Hydration: `index` starts at 0 on both sides and only the effect moves it;
 * reduced motion and the tab's visibility are read inside the effect, never
 * branched on in markup.
 */
export function EntranceProof({ children }: { children: ReactNode }) {
  const members = useMemo(() => getSocialProofMembers("weight_changes"), []);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (members.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let id: number | undefined;
    const stop = () => {
      if (id !== undefined) window.clearInterval(id);
      id = undefined;
    };
    const start = () => {
      stop();
      id = window.setInterval(
        () => setIndex((i) => (i + 1) % members.length),
        HOLD_MS
      );
    };
    // A backgrounded tab neither burns a timer nor swaps four women while she
    // is not looking; coming back restarts a full hold.
    const onVisibility = () =>
      document.visibilityState === "hidden" ? stop() : start();
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [members.length]);

  // A production build where every member is still `draft` renders the
  // headline alone rather than an empty frame.
  if (members.length === 0) return <div className="text-center">{children}</div>;

  const safeIndex = index % members.length;

  return (
    <div className="flex items-center gap-3 text-left">
      {/* The print. White paper, deep chin, two strips of tape, tilted the
          way the paywall's is. It is a photograph lying on the page, not an
          avatar in a circle - the circle is what every app's login screen
          does, and the point of the tape is that a person put this here. */}
      <figure className="relative w-[84px] shrink-0 -rotate-3 rounded-[3px] bg-white p-1.5 pb-3 shadow-[0_10px_20px_-10px_rgba(0,0,0,0.45)] ring-1 ring-black/5">
        <Tape size="sm" className="-top-1.5 -left-2.5 -rotate-[24deg]" />
        <Tape size="sm" className="-top-1.5 -right-2.5 rotate-[19deg]" />
        <div className="relative aspect-square overflow-hidden rounded-[2px] bg-[#E8DDD9] ring-1 ring-black/[0.07]">
          {members.map((m, i) => {
            const active = i === safeIndex;
            return (
              <Image
                key={m.id}
                src={m.photo}
                alt={m.alt}
                fill
                sizes="72px"
                // The first print sits beside the h1 above the fold, so it
                // paints with the tiles rather than after the scripts - the
                // same treatment the mockup it replaced had. The other three
                // are needed only after a 4.5s hold, so they keep the default
                // `lazy`: in Next 16 `loading="eager"` emits a preload, and
                // three extra preloads would share the pipe with the nine
                // tiles that are the LCP (verified: 13 preload links with
                // eager on all four, 10 with it on the first). Lazy images
                // inside the viewport still load once layout is done.
                loading={i === 0 ? "eager" : undefined}
                fetchPriority={i === 0 ? "high" : undefined}
                decoding={i === 0 ? "sync" : undefined}
                aria-hidden={active ? undefined : true}
                className={cn("object-cover", FADE_CLASS, active ? "opacity-100" : "opacity-0")}
              />
            );
          })}
        </div>
      </figure>

      <div className="min-w-0 flex-1">
        {children}
        {/* The quote slot: every member's sentence stacked in one cell, so
            the slot is as tall as the longest and nothing below it moves on
            a swap. `data-entrance-quote` is for the measurement script. */}
        <div data-entrance-quote className="mt-1 grid">
          {members.map((m, i) => {
            const active = i === safeIndex;
            return (
              <div
                key={m.id}
                style={{ gridArea: "1 / 1" }}
                aria-hidden={active ? undefined : true}
                className={cn(FADE_CLASS, !active && "pointer-events-none opacity-0")}
              >
                <p className="text-[12px] italic leading-[1.4] text-[#5A5A5A]">
                  &ldquo;{m.pullQuote}&rdquo;
                </p>
                <p className="font-script text-[15px] leading-tight text-[#3D3D3D]">
                  &mdash; {m.name}, {m.age}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
