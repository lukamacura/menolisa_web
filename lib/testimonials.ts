/**
 * Social-proof and before/after data shared by the /register diagnosis screen
 * and the paywall (`components/SocialProof.tsx`). One copy so both surfaces
 * show the same woman, the same photo, and the same symptom copy rather than
 * drifting apart.
 */
import { PLAN_WEEKS } from "@/lib/pricing";

// ─── Social proof: one woman, in her own words ──────────────────────────────
// One square print of a member holding her plan, plus the story she sent.
// It replaced a Day-1/Week-9 pair on 2026-08-30: two prints of the same face is
// a transformation claim we cannot substantiate, and a photograph of a woman
// holding *this app* on *her* phone is the only proof on the page that is also
// a product shot.
//
// Rules for editing this block:
//  - `story` is verbatim. It is a person's testimonial, not copy - tighten it
//    with her, never in the repo.
//  - `pullQuote` must be a sentence that also appears in `story`. It is a
//    magazine pull-quote, not a second, stronger claim bolted on top.
//  - Nothing here may assert a timeline, a weight lost or a symptom resolved
//    that her own words do not. The copy this replaced said "finished her plan
//    last week"; hers does not say she has finished.
export const SOCIAL_PROOF = {
  name: "Mary",
  age: 49,
  photo: "/proof/social.webp",
  alt: "Mary, a MenoLisa member, holding her phone with her plan open",
  /** One line under her name on the print - her own framing of how it started. */
  context: "Menopause overnight, after a hysterectomy",
  pullQuote:
    "I finally feel like I have a plan instead of just trying to figure everything out on my own.",
  // `PLAN_WEEKS` is interpolated rather than typed out as "8-week" so the quote
  // can never name a plan length Stripe no longer sells. Same words today.
  story: [
    "I entered menopause suddenly after a hysterectomy, and I felt completely overwhelmed by all the symptoms I was dealing with. I was frustrated by how unprepared I was for such a challenging physical and emotional transition.",
    `Then I discovered the MenoLisa app. I started asking questions, and for the first time, I began to understand what was actually happening to my body. I got a personalized ${PLAN_WEEKS}-week plan to help me work toward losing the 20 pounds I gained in the year after surgery.`,
    "Because I was struggling with fatigue, I started with movement snacks but gradually moved to the beginner program from there. The habit tracker has been a game-changer\u2014it helps me stay consistent with the everyday choices that matter, from nutrition and movement to relaxation.",
    "I finally feel like I have a plan instead of just trying to figure everything out on my own. I honestly don\u2019t think I could have stayed on track without MenoLisa.",
  ],
};

// ─── Before/after transformations, keyed by symptom ─────────────────────────
// Each image in /public/testimonials is one side-by-side shot: left = the hard
// "before", right = the calmer "after". Keyed by PROBLEM_OPTIONS ids so the
// cards shown match the symptoms she actually selected.
export type SymptomTransform = { image: string; label: string; before: string; after: string };

export const SYMPTOM_TRANSFORM: Record<string, SymptomTransform> = {
  hot_flashes:    { image: "/proof/testimonials/hot_flashes.webp", label: "Hot flashes",    before: "Drenched, sleepless nights",        after: "Sleeping through, dry and cool" },
  sleep_issues:   { image: "/proof/testimonials/sleep.webp",       label: "Sleep",          before: "Tossing and turning till 3am",      after: "Falling asleep and staying there" },
  brain_fog:      { image: "/proof/testimonials/brain_fog.webp",   label: "Brain fog",      before: "Losing your train of thought",      after: "Words arriving when you need them" },
  mood_swings:    { image: "/proof/testimonials/mood_swings.webp", label: "Mood swings",    before: "Snapping at the people you love",   after: "Feeling steady around the people you love" },
  weight_changes: { image: "/proof/testimonials/weight_gain.webp", label: "Weight changes", before: "Nothing fitting like it used to",   after: "Your clothes fitting the way they should" },
  low_energy:     { image: "/proof/testimonials/fatigue.webp",     label: "Fatigue",        before: "Running on empty by midday",        after: "Still having something left at 4pm" },
  anxiety:        { image: "/proof/testimonials/anxiety.webp",     label: "Anxiety",        before: "A constant, low hum of worry",      after: "A quiet chest and a calmer day" },
  joint_pain:     { image: "/proof/testimonials/joint_pain.webp",  label: "Joint pain",     before: "Stiff, aching mornings",            after: "Getting out of bed without bracing" },
  bloating:       { image: "/proof/testimonials/bloating.webp",    label: "Bloating",       before: "Heavy and uncomfortable",           after: "Light and comfortable after meals" },
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
