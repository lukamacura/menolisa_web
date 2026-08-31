/**
 * Social-proof and before/after data shared by the /register diagnosis screen
 * and the paywall (`components/SocialProof.tsx`). One copy so both surfaces
 * show the same members, the same photos, and the same symptom copy rather
 * than drifting apart.
 */
import { PLAN_WEEKS } from "@/lib/pricing";

// ─── Social proof: the members, in their own words ──────────────────────────
// One square print of a member, plus the story she sent. The
// card rotates through this list (see `SocialProofPolaroid`), so the order here
// is the order she meets them. Two prints of the *same* face would be a
// transformation claim we cannot substantiate - these are different women, each
// speaking only for herself, which is why every card carries its own name, age
// and context rather than one caption over a slideshow.
//
// Rules for editing this list:
//  - `story` is verbatim. It is a person's testimonial, not copy - tighten it
//    with her, never in the repo.
//  - `pullQuote` must be a sentence that also appears in `story`. It is a
//    magazine pull-quote, not a second, stronger claim bolted on top.
//  - Nothing here may assert a timeline, a weight lost or a symptom resolved
//    that her own words do not. The copy Mary's card replaced said "finished
//    her plan last week"; hers does not say she has finished.
//  - `alt` describes the photograph that exists, not the one we wish we had.
//    Mary is holding her phone with the plan open; do not copy that sentence
//    onto a print where nobody is holding anything.
//  - **`draft: true` until her words are hers.** A face is a real person, and
//    words we wrote under one are fabricated proof - the single most expensive
//    thing to be caught doing on the one screen whose whole job is credibility.
//    `getSocialProofMembers()` drops draft entries from production builds, so
//    an unfinished card can be previewed in `npm run dev` and cannot ship.
export type SocialProofMember = {
  /** Stable key for the crossfade. Never rendered. */
  id: string;
  name: string;
  age: number;
  photo: string;
  alt: string;
  /** One line under her name on the print - her own framing of how it started. */
  context: string;
  pullQuote: string;
  story: string[];
  /** Her words are not confirmed yet. Dev-only; never rendered in production. */
  draft?: boolean;
};

export const SOCIAL_PROOF_MEMBERS: SocialProofMember[] = [
  {
    id: "mary",
    name: "Mary",
    age: 49,
    photo: "/proof/social.webp",
    alt: "Mary, a MenoLisa member, holding her phone with her plan open",
    context: "Menopause overnight, after a hysterectomy",
    pullQuote:
      "I finally feel like I have a plan instead of just trying to figure everything out on my own.",
    // `PLAN_WEEKS` is interpolated rather than typed out as "8-week" so the
    // quote can never name a plan length Stripe no longer sells. Same words
    // today.
    story: [
      "I entered menopause suddenly after a hysterectomy, and I felt completely overwhelmed by all the symptoms I was dealing with. I was frustrated by how unprepared I was for such a challenging physical and emotional transition.",
      `Then I discovered the MenoLisa app. I started asking questions, and for the first time, I began to understand what was actually happening to my body. I got a personalized ${PLAN_WEEKS}-week plan to help me work toward losing the 20 pounds I gained in the year after surgery.`,
      "Because I was struggling with fatigue, I started with movement snacks but gradually moved to the beginner program from there. The habit tracker has been a game-changer\u2014it helps me stay consistent with the everyday choices that matter, from nutrition and movement to relaxation.",
      "I finally feel like I have a plan instead of just trying to figure everything out on my own. I honestly don\u2019t think I could have stayed on track without MenoLisa.",
    ],
  },
  {
    id: "sally",
    name: "Sally",
    age: 46,
    photo: "/proof/social2.webp",
    alt: "Sally, a MenoLisa member",
    // Her own framing of how it started, condensed the way Mary's is. It stops
    // short of the clinician on purpose: her story says "my doctor never
    // brought it up" in her own words, which is hers to say, but printing it as
    // our caption turns a member's experience into our claim about her care.
    context: "Hot flashes and anxiety in her mid-40s, out of nowhere",
    pullQuote:
      "I don\u2019t feel like I just have to suffer through menopause anymore.",
    story: [
      "I was in my mid-40s when I suddenly started experiencing hot flashes, night sweats, and anxiety that seemed to come out of nowhere. I thought I was too young for menopause, and my doctor never brought it up.",
      "Then I discovered MenoLisa and decided to start tracking my symptoms and learning more about what was happening. For the first time, I understood what could be behind my symptoms, what I could do to manage them, and\u2014most importantly\u2014how to advocate for myself when talking to my doctor about HRT.",
      "I no longer feel confused or helpless when my symptoms show up. I understand my body better, I know what steps I can take, and I feel much more confident speaking up for myself.",
      "I don\u2019t feel like I just have to suffer through menopause anymore. MenoLisa helped me take back control.",
    ],
  },
];

/**
 * The members safe to show in this build. Draft entries - a real face with
 * copy nobody has confirmed she said - are visible while developing and
 * stripped from production. `process.env.NODE_ENV` is inlined identically on
 * both sides of the render, so this cannot cause a hydration mismatch.
 */
export function getSocialProofMembers(): SocialProofMember[] {
  const live = SOCIAL_PROOF_MEMBERS.filter((m) => !m.draft);
  if (process.env.NODE_ENV === "production") return live;
  return SOCIAL_PROOF_MEMBERS.length > 0 ? SOCIAL_PROOF_MEMBERS : live;
}

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
