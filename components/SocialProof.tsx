"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { HighlightSweep } from "@/components/HighlightSweep";
import { PLAN_WEEKS } from "@/lib/pricing";
import {
  DEFAULT_SYMPTOM_TRANSFORM_IDS,
  SOCIAL_PROOF,
  SOCIAL_PROOF_PHOTOS,
  SOCIAL_PROOF_WEEKS,
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

/**
 * The one human face on the page. Everything around it is her own numbers and
 * her own plan; this is the only block that says someone else already walked
 * it. Deliberately one woman rather than a wall of five-star cards - a wall
 * reads as marketing, one polaroid reads as a person.
 */
export function SocialProofPolaroid({ reduced = false }: { reduced?: boolean }) {
  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      className="mb-5"
    >
      <div className="flex items-end gap-1.5 px-1">
        <p className="flex-1 font-script text-2xl sm:text-3xl leading-tight text-[#3D3D3D]">
          {SOCIAL_PROOF.name} took this same quiz {SOCIAL_PROOF_WEEKS} weeks ago
        </p>
        <CaptionArrow className="relative z-10 w-8 h-10 sm:w-9 sm:h-11 shrink-0 -mb-1 text-primary" />
      </div>

      {/* Two prints, same size on purpose - "Day 1" beside "Week 9" only reads as
          a comparison if neither one is the hero, and overlapping them buried the
          phone in the first shot, which is the only thing making it *this* quiz.
          The opposite tilts and the white borders do the rest: a square-cornered
          full-bleed photo reads as stock, a print reads as hers. */}
      <div className="mx-auto mt-1 flex w-full max-w-[330px] items-start justify-center gap-2.5">
        {SOCIAL_PROOF_PHOTOS.map((photo, i) => (
          <figure
            key={photo.src}
            className={cn(
              "w-1/2 rounded-sm bg-white p-1.5 pb-2 shadow-lg shadow-black/10 ring-1 ring-black/5",
              i % 2 === 0 ? "mt-3 rotate-[-3.5deg]" : "rotate-[2.5deg]"
            )}
          >
            <div className="relative aspect-4/5 overflow-hidden rounded-xs bg-[#E8DDD9]">
              <Image
                src={photo.src}
                alt={`${SOCIAL_PROOF.name}, ${photo.alt}`}
                fill
                sizes="180px"
                className="object-cover"
                style={{ objectPosition: photo.objectPosition }}
              />
            </div>
            <figcaption className="mt-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-[#9A9A9A]">
              {photo.badge}
            </figcaption>
          </figure>
        ))}
      </div>

      {/* Quote under the pair rather than on one print - it belongs to both. */}
      <p className="mx-auto mt-3.5 max-w-[300px] px-2 text-center font-script text-lg leading-snug text-[#3D3D3D]">
        &ldquo;{SOCIAL_PROOF.quote}&rdquo;
      </p>
      <p className="mx-auto mt-1 max-w-[300px] px-2 text-center text-[10px] font-semibold uppercase tracking-wide text-[#9A9A9A]">
        {SOCIAL_PROOF.name}, {SOCIAL_PROOF.age} &middot; finished her plan last week
      </p>
    </motion.div>
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
