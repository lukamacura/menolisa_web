import { PLAN_WEEKS } from "@/lib/pricing";

/**
 * Screenshots of the plan itself, shared by the /register diagnosis screen
 * (`<PlanHeroCarousel />`) and the landing page. One copy, so the two surfaces
 * can never describe the same frame in different words.
 *
 * Every master in /screenshots is used, here or by the paywall. Two rules worth
 * keeping when the next batch of captures lands, both learned from the three
 * that were deleted rather than wired in:
 *
 * - **Capture a day with work done on it.** Two of them were `day` and
 *   `nutrition` caught with the tasks untouched (0/4, 0/10, 0/1). These frames
 *   are proof that the plan runs, and an empty checklist argues the opposite.
 * - **A screen that restates a slide is not a slide.** The third was the
 *   "Achievement unlocked" modal - the best-looking frame of the set, and the
 *   same point `rewards` already makes with confetti over it.
 *
 * SHOT_W / SHOT_H (the intrinsic size of the masters) live in lib/constants.ts.
 */
export const PLAN_SHOTS = {
  day: "/screenshots/screen1.webp",
  movement: "/screenshots/movement.webp",
  nutrition: "/screenshots/screen2.webp",
  habits: "/screenshots/screen3.webp",
  progress: "/screenshots/progress.webp",
  rewards: "/screenshots/screen4.webp",
};

export type PlanSlide = { src: string; caption: string; alt: string };

/**
 * The screens in the order she needs them: the day she gets, then the surfaces
 * that run it. Order is the argument - it runs outward from one day to eight
 * weeks, and each slide answers the objection the one before it raises:
 *
 *   day       the whole offer in one frame - four pillars, real progress
 *   movement  "what is a session, actually?" - three moves, about five minutes,
 *             which is the answer to the fear that this needs a gym and an hour
 *   nutrition "so what do I eat?" - a list, with a reason on every row
 *   habits    "and the rest of my life?" - one small thing, her pick
 *   progress  "where does this go?" - the eight weeks the headline promises,
 *             drawn, with the three pillars tracked separately
 *   rewards   "but will I keep doing it?" - the objection she only arrives at
 *             once she has believed all of the above, which is why it is last
 */
export const PLAN_HERO_SLIDES: ReadonlyArray<PlanSlide> = [
  {
    src: PLAN_SHOTS.day,
    caption: "Day 1, already built",
    alt: `Day 1 of your personalized ${PLAN_WEEKS}-week plan in the MenoLisa app, showing movement, nutrition, relaxation and habit tasks`,
  },
  {
    src: PLAN_SHOTS.movement,
    caption: "Five minutes, not an hour",
    alt: "A movement session in the MenoLisa app: three exercises, about five minutes, with a start button",
  },
  {
    src: PLAN_SHOTS.nutrition,
    caption: "What to eat today, as a list",
    alt: "The nutrition list for today in the MenoLisa app, with each row explained",
  },
  {
    src: PLAN_SHOTS.habits,
    caption: "One small habit at a time",
    alt: "Your habits in the MenoLisa app, with suggestions you can add",
  },
  {
    src: PLAN_SHOTS.progress,
    caption: `All ${PLAN_WEEKS} weeks, tracked`,
    alt: `Progress across all ${PLAN_WEEKS} weeks in the MenoLisa app, with movement, nutrition and relaxation tracked separately`,
  },
  {
    src: PLAN_SHOTS.rewards,
    caption: "Streaks that keep you going",
    alt: "Streaks, levels and badges in the MenoLisa app",
  },
];
