/**
 * Social-proof and before/after data shared by the /register diagnosis screen
 * and the paywall (`components/SocialProof.tsx`). One copy so both surfaces
 * show the same woman, the same photos, and the same symptom copy rather than
 * drifting apart.
 */
import { PLAN_WEEKS } from "@/lib/pricing";

// ─── Social proof: one woman, one week past the end of the plan ─────────────
// The week count is PLAN_WEEKS + 1 on purpose - it has to read as *finished*,
// not *in progress*.
export const SOCIAL_PROOF_WEEKS = PLAN_WEEKS + 1;

// Two prints from the same roll, in order: the day she sat with the quiz, and
// the week she finished. `objectPosition` is the crop knob: both frames are a
// fixed 4:5 portrait, so swapping an asset means retuning that one string, not
// the layout.
export const SOCIAL_PROOF_PHOTOS = [
  {
    src: "/social_proof/social_proof2.webp",
    objectPosition: "50% 66%",
    badge: "Day 1",
    alt: "taking this quiz on her phone",
  },
  {
    src: "/social_proof/social_proof.webp",
    objectPosition: "58% 82%",
    badge: `Week ${SOCIAL_PROOF_WEEKS}`,
    alt: `${SOCIAL_PROOF_WEEKS} weeks later, on the beach`,
  },
];

export const SOCIAL_PROOF = {
  name: "Zoe",
  age: 48,
  quote: "I can finally fall asleep easily and wake up actually feeling rested.",
};

// ─── Before/after transformations, keyed by symptom ─────────────────────────
// Each image in /public/testimonials is one side-by-side shot: left = the hard
// "before", right = the calmer "after". Keyed by PROBLEM_OPTIONS ids so the
// cards shown match the symptoms she actually selected.
export type SymptomTransform = { image: string; label: string; before: string; after: string };

export const SYMPTOM_TRANSFORM: Record<string, SymptomTransform> = {
  hot_flashes:    { image: "/testimonials/hot_flashes.webp", label: "Hot flashes",    before: "Drenched, sleepless nights",        after: "Sleeping through, dry and cool" },
  sleep_issues:   { image: "/testimonials/sleep.webp",       label: "Sleep",          before: "Tossing and turning till 3am",      after: "Falling asleep and staying there" },
  brain_fog:      { image: "/testimonials/brain_fog.webp",   label: "Brain fog",      before: "Losing your train of thought",      after: "Words arriving when you need them" },
  mood_swings:    { image: "/testimonials/mood_swings.webp", label: "Mood swings",    before: "Snapping at the people you love",   after: "Feeling steady around the people you love" },
  weight_changes: { image: "/testimonials/weight_gain.webp", label: "Weight changes", before: "Nothing fitting like it used to",   after: "Your clothes fitting the way they should" },
  low_energy:     { image: "/testimonials/fatigue.webp",     label: "Fatigue",        before: "Running on empty by midday",        after: "Still having something left at 4pm" },
  anxiety:        { image: "/testimonials/anxiety.webp",     label: "Anxiety",        before: "A constant, low hum of worry",      after: "A quiet chest and a calmer day" },
  joint_pain:     { image: "/testimonials/joint_pain.webp",  label: "Joint pain",     before: "Stiff, aching mornings",            after: "Getting out of bed without bracing" },
  bloating:       { image: "/testimonials/bloating.webp",    label: "Bloating",       before: "Heavy and uncomfortable",           after: "Light and comfortable after meals" },
};

/** Representative fallback when there's no quiz context to personalize from
 * (e.g. the dashboard paywall for a lapsed subscriber). */
export const DEFAULT_SYMPTOM_TRANSFORM_IDS = ["hot_flashes", "sleep_issues", "brain_fog"];

/** Her selected symptoms that have a before/after image (capped, original order). */
export function getSymptomTransforms(topProblems: string[], n = 3): SymptomTransform[] {
  return topProblems
    .filter((id) => SYMPTOM_TRANSFORM[id])
    .slice(0, n)
    .map((id) => SYMPTOM_TRANSFORM[id]);
}
