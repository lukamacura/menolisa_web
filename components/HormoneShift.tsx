"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * The mechanism the results screen stakes its diagnosis on - as a picture.
 *
 * The "why this is happening to you" card says her symptoms all trace back to
 * "estrogen rising and falling". That sentence is the load-bearing claim of the
 * whole funnel: it turns nine unrelated-feeling complaints into one problem, and
 * one problem is the only kind an 8-week plan can credibly sell against.
 *
 * This used to be <EstrogenCurve />, a two-line SVG chart. A chart asks her to
 * read an axis, decode a legend and infer the point. She is 45-60, mid-funnel,
 * on a phone, and she has already scrolled past a score. She is not studying a
 * dataset - she is looking for someone who understands what is happening to her.
 * An illustration lands in the time she actually gives it.
 *
 * No caption. The card around it already says what the picture shows - "they
 * all trace back to the same thing: estrogen rising and falling" - and the
 * figure claims nothing about her own levels for a footnote to walk back. A
 * disclaimer under a drawing that isn't presented as data is just another line
 * of small grey type between her and the plan.
 *
 * If the asset is missing the whole figure removes itself rather than leaving a
 * broken-image box in the middle of the card - the card's argument still stands
 * without it, and half a picture is worse than none.
 */
export function HormoneShift({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  return (
    <figure className={cn("overflow-hidden rounded-xl", className)}>
      <div className="relative aspect-[16/10] w-full">
        <Image
          src="/results/hormones.webp"
          alt="An illustration of the hormonal swings of perimenopause: what used to be a steady monthly rhythm has become unpredictable."
          fill
          sizes="(max-width: 480px) 92vw, 420px"
          className="object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    </figure>
  );
}
