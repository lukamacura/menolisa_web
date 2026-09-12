import Image from "next/image";
import { Check } from "lucide-react";
import { SHOT_W, SHOT_H } from "@/lib/constants";
import { PLAN_HERO_SLIDES } from "@/lib/planShots";
import { PLAN_WEEKS } from "@/lib/pricing";

// Each one is checkable: the check and her results render before the paywall,
// and Stripe is the first thing that asks for an address.
const PROMISES = ["Free 2-minute check", "No email needed", "Results before any price"];

/**
 * The headline is the funnel's screen-1 headline, word for word, so the page
 * she lands on and the screen she taps into make the same promise.
 */
export default function LandingHero() {
  const day = PLAN_HERO_SLIDES[0];

  return (
    <section id="LandingHero" className="px-4 pt-24 pb-12 sm:pt-28">
      <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-[1.15fr_1fr]">
        <div className="text-center md:text-left">
          <p className="inline-flex rounded-full border border-[#E8DDD9] bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-[#C2437F]">
            For perimenopause &amp; menopause
          </p>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.1] text-[#2E2A2B] sm:text-5xl">
            Find out what&apos;s driving your symptoms
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-[#5B5557]">
            Answer a few one-tap questions and get a personalized {PLAN_WEEKS}-week
            plan for movement, food, calm and sleep, built around the symptom
            hitting you hardest.
          </p>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm font-medium text-[#3D3D3D] md:justify-start">
            {PROMISES.map((p) => (
              <li key={p} className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-[#2F9E6B]" strokeWidth={3} aria-hidden />
                {p}
              </li>
            ))}
          </ul>
        </div>

        <figure className="mx-auto w-full max-w-60">
          <div className="rounded-[1.9rem] bg-[#1d1d1f] p-1.5 shadow-[0_28px_60px_-20px_rgba(61,61,61,0.6)]">
            <div
              className="overflow-hidden rounded-[1.6rem] bg-[#f5f5f7]"
              style={{ aspectRatio: `${SHOT_W} / ${SHOT_H}` }}
            >
              <Image
                src={day.src}
                alt={day.alt}
                width={SHOT_W}
                height={SHOT_H}
                sizes="(max-width: 768px) 60vw, 240px"
                className="h-auto w-full"
                priority
              />
            </div>
          </div>
          <figcaption className="mt-3 text-center text-sm font-medium text-[#6B6B6B]">
            {day.caption}
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
