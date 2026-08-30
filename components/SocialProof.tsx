"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { motion, MotionConfig, useReducedMotion, type Variants } from "framer-motion";
import { Check, ChevronDown, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { HighlightSweep } from "@/components/HighlightSweep";
import { PLAN_WEEKS } from "@/lib/pricing";
import {
  DEFAULT_SYMPTOM_TRANSFORM_IDS,
  SOCIAL_PROOF,
  getSymptomTransforms,
} from "@/lib/testimonials";

/** Hand-drawn arrow curving down-right, from the caption into the photo. */
function CaptionArrow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 56"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d="M4 6c15-1 27 5 31 15 3 8 0 18-7 27" />
      <path d="M38 45l-10 3 1-11" />
    </svg>
  );
}

/** Height of the collapsed story, in px - roughly four lines, so the first
 *  paragraph breaks mid-thought under the fade rather than closing neatly.
 *  A preview that ends on a full stop is a preview nobody opens. */
const STORY_COLLAPSED_PX = 86;

/** The note card's paper. The print on top of it is pure white, so the card
 *  has to be a shade warmer or the two whites merge into one slab. The fade
 *  mask over the collapsed story is painted in this exact colour, so change
 *  both or neither. */
const PAPER = "#FDF8F5";
const PAPER_TRANSPARENT = "rgba(253, 248, 245, 0)";

const EASE = [0.22, 1, 0.36, 1] as const;

const stage: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.04 } },
};

const rise: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
};

/** The print lands rather than fades: dropped in, over-rotated, settling to
 *  -2deg. It is the one element on the block worth animating properly - a
 *  photograph that arrives reads as something a person handed you. */
const drop: Variants = {
  hidden: { opacity: 0, y: 28, scale: 0.93, rotate: -7 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    rotate: -2,
    transition: { type: "spring", stiffness: 130, damping: 15, mass: 0.9 },
  },
};

const pop: Variants = {
  hidden: { opacity: 0, scale: 0.6 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.32, ease: EASE } },
};

/** A strip of washi tape holding one corner of the print to the page. */
function Tape({ className }: { className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute h-5 w-16 rounded-[2px] shadow-sm",
        "bg-[rgba(233,222,199,0.78)] ring-1 ring-black/5",
        "before:absolute before:inset-0 before:rounded-[2px] before:bg-linear-to-b before:from-white/45 before:to-transparent",
        className
      )}
    />
  );
}

/**
 * The one human face on the page. Everything around it is her own numbers and
 * her own plan; this is the only block that says someone else already walked
 * it. Deliberately one woman rather than a wall of five-star cards - a wall
 * reads as marketing, one print reads as a person.
 *
 * Three parts, in the order she reads them:
 *
 *   1. the print - a square photo, taped to the page, of a member holding the
 *      app. Proof and product shot in one frame, which is why it is the hero
 *      and why it is never cropped to a portrait.
 *   2. the quote - one sentence, big. If she reads nothing else on this block,
 *      this is the sentence she leaves with.
 *   3. the story - the full testimonial, folded to four lines behind a fade.
 *      Long-form proof converts the sceptic and costs the scanner nothing, but
 *      only while it is folded: 200 words of body copy dropped into a paywall
 *      scroll is a wall she scrolls past, not a story she reads.
 *
 * Reduced motion is honored through `<MotionConfig reducedMotion="user">`,
 * which drops the transform half of every animation below and keeps the fades.
 * That indirection is the point: `useReducedMotion()` returns `false` on the
 * server and `true` on a client that asked for it, so branching *markup* on it
 * - a different `initial`, a variant swapped for `undefined`, an element
 * rendered only one way - is a guaranteed hydration mismatch. The hook and the
 * `reduced` prop may drive `transition` (never serialized, never compared) and
 * nothing else. Do not reintroduce a `still ? ... : ...` on a rendered prop.
 */
export function SocialProofPolaroid({ reduced = false }: { reduced?: boolean }) {
  const prefersReducedMotion = useReducedMotion();
  const still = reduced || !!prefersReducedMotion;

  const [open, setOpen] = useState(false);
  const storyId = useId();

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        variants={stage}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mb-5"
      >
        <motion.div variants={rise} className="flex items-end gap-1.5 px-1">
          <p className="flex-1 font-script text-2xl sm:text-3xl leading-tight text-[#3D3D3D]">
            This is {SOCIAL_PROOF.name}. She started right where you are.
          </p>
          <CaptionArrow className="relative z-10 w-8 h-10 sm:w-9 sm:h-11 shrink-0 -mb-1 text-primary" />
        </motion.div>

        <div className="mx-auto mt-2 w-full max-w-[360px]">
          {/* The print. Square, so it gets a square print's frame: even borders
              and a deep chin for the caption. It sits above the note card and
              overlaps it, which is what makes the two read as one object lying
              on a page rather than two stacked components. */}
          <motion.figure
            variants={drop}
            className="relative z-10 mx-auto w-[228px] sm:w-[248px] rounded-[3px] bg-white p-2.5 pb-1.5 shadow-[0_18px_34px_-14px_rgba(0,0,0,0.45)] ring-1 ring-black/5"
          >
            <Tape className="-top-2.5 -left-4 -rotate-[24deg]" />
            <Tape className="-top-2.5 -right-4 rotate-[19deg]" />

            <div className="relative aspect-square overflow-hidden rounded-[2px] bg-[#E8DDD9] ring-1 ring-black/[0.07]">
              <Image
                src={SOCIAL_PROOF.photo}
                alt={SOCIAL_PROOF.alt}
                fill
                sizes="230px"
                className="object-cover"
              />
              {/* One slow gloss across the print as it settles - the light
                  moving on a photograph you have just picked up. Once, on view,
                  never on a loop: a repeating shine is a banner ad. */}
              <motion.span
                aria-hidden="true"
                initial={{ x: "-160%" }}
                whileInView={{ x: "160%" }}
                viewport={{ once: true }}
                transition={{ delay: 0.5, duration: 1.15, ease: "easeInOut" }}
                className="pointer-events-none absolute inset-y-0 w-2/3 -skew-x-12 bg-linear-to-r from-transparent via-white/30 to-transparent"
              />
            </div>

            <figcaption className="px-1 pt-2 pb-0.5 text-center">
              <span className="block font-script text-xl leading-none text-[#3D3D3D]">
                {SOCIAL_PROOF.name}, {SOCIAL_PROOF.age}
              </span>
              <span className="mt-1.5 block text-[9.5px] font-semibold uppercase leading-[1.4] tracking-[0.07em] text-[#9A9A9A]">
                {SOCIAL_PROOF.context}
              </span>
            </figcaption>
          </motion.figure>

          {/* The note card, tucked under the print's chin. */}
          <motion.div
            variants={rise}
            style={{ backgroundColor: PAPER }}
            className="-mt-4 rounded-2xl border border-[#E8DDD9] px-4 pb-4 pt-9 shadow-sm"
          >
            <motion.div variants={stage} className="flex justify-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <motion.span key={i} variants={pop} className="flex">
                  <Star className="h-3.5 w-3.5 fill-[#F5A623] text-[#F5A623]" />
                </motion.span>
              ))}
            </motion.div>

            <motion.p
              variants={rise}
              className="mt-2.5 text-balance text-center text-[17px] sm:text-lg font-bold leading-[1.4] text-[#3D3D3D]"
            >
              &ldquo;{SOCIAL_PROOF.pullQuote}&rdquo;
            </motion.p>

            <div className="mx-auto my-3 h-px w-12 bg-[#E8DDD9]" />

            {/* The story, collapsed. framer measures `height: "auto"`, so the
                paragraphs stay in the DOM in both states - a screen reader and a
                crawler get the whole testimonial either way. */}
            <motion.div
              id={storyId}
              initial={false}
              animate={{ height: open ? "auto" : STORY_COLLAPSED_PX }}
              transition={still ? { duration: 0 } : { duration: 0.5, ease: EASE }}
              className="relative overflow-hidden"
            >
              <div className="space-y-2.5 text-[13.5px] leading-[1.65] text-[#5A5A5A]">
                {SOCIAL_PROOF.story.map((para) => (
                  <p key={para.slice(0, 24)}>{para}</p>
                ))}
              </div>
              <motion.span
                aria-hidden="true"
                animate={{ opacity: open ? 0 : 1 }}
                transition={still ? { duration: 0 } : { duration: 0.35, ease: EASE }}
                className="pointer-events-none absolute inset-x-0 bottom-0 h-11"
                style={{
                  backgroundImage: `linear-gradient(to top, ${PAPER}, ${PAPER} 22%, ${PAPER_TRANSPARENT})`,
                }}
              />
            </motion.div>

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-controls={storyId}
              className="mx-auto mt-3 flex items-center gap-1.5 rounded-full border border-[#E8DDD9] bg-white px-3.5 py-1.5 text-[12.5px] font-bold text-[#5A5A5A] shadow-xs transition-colors hover:bg-[#F7F0EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {open ? "Show less" : `Read ${SOCIAL_PROOF.name}’s full story`}
              <motion.span
                animate={{ rotate: open ? 180 : 0 }}
                transition={still ? { duration: 0 } : { duration: 0.3, ease: EASE }}
                className="flex"
              >
                <ChevronDown className="h-4 w-4" strokeWidth={2.75} />
              </motion.span>
            </button>
          </motion.div>

          <motion.p
            variants={rise}
            className="mt-2 px-1 text-center text-[10px] leading-snug text-[#9A9A9A]"
          >
            {SOCIAL_PROOF.name}&rsquo;s own words. Individual experiences vary.
          </motion.p>
        </div>
      </motion.div>
    </MotionConfig>
  );
}

/**
 * Before/after cards for up to 3 symptoms, same red/green split-image
 * treatment as the /register diagnosis screen. Personalizes to `topProblems`
 * when given; falls back to a representative set when there's no quiz
 * context to draw from (the dashboard paywall for a lapsed subscriber never
 * has her answers).
 */
export function SymptomOutcomeCards({
  topProblems,
}: {
  topProblems?: string[];
}) {
  const transforms = getSymptomTransforms(
    topProblems && topProblems.length > 0 ? topProblems : DEFAULT_SYMPTOM_TRANSFORM_IDS,
    3
  );
  if (transforms.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      className="mb-4"
    >
      <h2 className="text-3xl sm:text-4xl font-bold text-[#3D3D3D] leading-tight mb-3 px-1">
        What <HighlightSweep>{PLAN_WEEKS} weeks with Lisa</HighlightSweep> can look like
      </h2>
      <div className="flex overflow-x-auto snap-x snap-mandatory gap-3 -mx-4 sm:-mx-6 px-4 sm:px-6 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {transforms.map((t, i) => (
          <motion.div
            key={t.image}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.08 }}
            className="rounded-2xl bg-white border-2 border-[#E8DDD9] overflow-hidden shadow-sm shrink-0 snap-center w-[82%]"
          >
            {/* Image with red/green tint halves and matching labels */}
            <div className="relative">
              <Image
                src={t.image}
                alt={`${t.label}: before and after with MenoLisa`}
                width={1000}
                height={546}
                className="w-full object-cover"
              />
              <div className="absolute inset-y-0 left-0 w-1/2 bg-red-500/20 pointer-events-none" />
              <div className="absolute inset-y-0 right-0 w-1/2 bg-green-500/20 pointer-events-none" />
              <div className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-white/70" />
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-red-500 text-[10px] font-bold text-white tracking-wide shadow-sm">
                Right now
              </span>
              <span className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-green-600 text-[10px] font-bold text-white tracking-wide shadow-sm">
                With Lisa
              </span>
              <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/95 pl-1 pr-2 py-0.5 shadow-md">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-600">
                  <Check className="w-2.5 h-2.5 text-white" strokeWidth={3.5} />
                </span>
                <span className="text-[9px] font-bold text-green-700 tracking-wide">
                  8 week plan
                </span>
              </span>
            </div>

            {/* Two equal columns - red before, green after */}
            <div className="p-3">
              <p className="text-xs font-bold text-[#3D3D3D] mb-2 text-center">{t.label}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-red-50 border border-red-200 px-2.5 py-2">
                  <p className="text-[10px] font-semibold text-red-500 mb-0.5 uppercase tracking-wide">Right now</p>
                  <p className="text-[11px] text-red-800 leading-snug">{t.before}</p>
                </div>
                <div className="rounded-xl bg-green-50 border border-green-200 px-2.5 py-2">
                  <p className="text-[10px] font-semibold text-green-600 mb-0.5 uppercase tracking-wide">With Lisa</p>
                  <p className="text-[11px] text-green-800 leading-snug">{t.after}</p>
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
      <p className="text-[10px] text-[#9A9A9A] mt-2 px-1 leading-snug">
        Illustrative. Individual experiences vary &mdash; MenoLisa helps you track and understand your
        symptoms with guidance, it&apos;s not a medical treatment.
      </p>
    </motion.div>
  );
}
