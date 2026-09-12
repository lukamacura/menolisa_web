"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useMotionValue,
  useMotionValueEvent,
  useReducedMotion,
  type MotionValue,
} from "framer-motion";
import { Check, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { PLAN_PILLARS, planPhaseForWeek } from "@/lib/planPillars";
import { PLAN_DAYS } from "@/lib/planTimeline";
import { PLAN_WEEKS } from "@/lib/pricing";

/**
 * The plan, playing on a phone.
 *
 * Two acts, in the order she'd live them:
 *
 *   1. `today` - today's four tasks, ticking themselves off one by one. The
 *                screen opens on her name and the size of the ask: the plan is
 *                already built and it costs about fifteen minutes.
 *   2. `weeks` - the same phone, one screen over: 56 days filling in week by
 *                week through the three phases, ending on a finished plan.
 *
 * ── The scroll, and why it is gone (2026-09-12) ──────────────────────────────
 *
 * All of this used to play inside a parchment scroll (`/illustrations/offer.webp`)
 * that unrolled on arrival, with a first act that wrote her name onto the paper
 * in script under a wax seal. Three things were wrong with it and only the
 * first is aesthetic:
 *
 * - **The parchment was the wrong object.** What she buys runs on the phone in
 *   her hand, every morning, for 56 days. A sealed scroll says "certificate";
 *   the product says "open the app and do four things". The render was also 27KB
 *   of illustration downloaded twice over (the bottom roll is the same file
 *   painted back on top) and `priority`, i.e. competing with the hero for the
 *   first bytes on the screen that has to land fastest.
 * - **It cost the phone two thirds of its size.** The phone was pinned inside
 *   the paper's bounds at 56% of the scroll's width - ~190px - so the one thing
 *   on the screen worth reading was the smallest thing on it. Standalone it is
 *   `PHONE_MAX_PX` wide, and the task rows are legible at 45-60 eyesight
 *   without the reader leaning in.
 * - **Act 1 spent 3.4 seconds on packaging.** Her name in script is a lovely
 *   moment and it delivered nothing: the name is already on the screen twice
 *   (the h1 above, and the tasks are hers). The act that replaced it is the
 *   product doing its job, and act 2 - the whole 8-week arc - now arrives ~3.5s
 *   sooner, which matters on a block she may scroll past.
 *
 * What survived deliberately: it is still a **film, not a widget**. Nothing
 * here is tappable, draggable or focusable - she is mid-funnel reading a pitch,
 * and a control she has to discover is a control that mostly goes undiscovered
 * while stealing the taps meant for the CTA. The whole subtree is
 * `pointer-events-none` and exposed to assistive tech as a single labelled
 * image.
 *
 * Cost, because this plays on a sales page on a mid-range phone:
 *
 * - **One clock.** Both acts are driven off one `progress` motion value. The
 *   segment bar *is* that value (transform only, no renders), and the act flips
 *   when it reaches 1. One thing to pause, one thing to reset.
 * - **It only runs while she can see it.** `useInView` gates the clock and the
 *   CSS day-fill together, so a scrolled-past stage costs nothing.
 * - **Renders are counted.** Both screens derive their state from `progress`
 *   and call `setState` only when the derived value actually changes: 4 renders
 *   for the tick-off, 8 for the week counter. The 56 day dots re-render never -
 *   they are CSS animations with a per-dot delay (see `.plan-day` in
 *   globals.css).
 * - **No blur, anywhere.** Animated `filter: blur()` is the one effect here
 *   that reliably drops frames on mobile; the act transitions use opacity and
 *   transform only.
 * - **No images at all.** The phone, its status bar and both screens are CSS
 *   boxes and two lucide glyphs, so this block adds nothing to the page's
 *   download weight.
 *
 * **The entrance.** The stage mounts with the plan block, which sits roughly a
 * viewport above where it actually lands, so anything that animates on mount
 * draws itself below the fold and she arrives on a still. The scroll used to
 * solve this by staying shut until she got there; the phone does the same thing
 * with one latched observer - it does not exist on the page until `ARM_AMOUNT`
 * of the stage is in front of her, and only then does the act clock start. It
 * happens once per session: scrolling away and back never replays the entrance,
 * and scrolling away mid-act pauses the clock rather than playing to an empty
 * room.
 */

type ActId = "today" | "weeks";

/* Holds. The whole loop runs ~9s, down from ~15s when a sealed-scroll act sat
   in front of these two - which is a long time to hold a reader who is
   mid-scroll on a sales page.

   Act 1 is 400ms longer than it was inside the scroll: its header now carries
   her name and the size of the ask, and she needs a beat to read that before
   the first row ticks (see TICK_START_MS).

   The captions are one short line each. They used to run to a full sentence of
   copy apiece, which is a second thing to read under a picture that is already
   saying it, and the block under the phone had to reserve two lines of height
   for them. The picture makes the point; the caption only has to name it. */
const ACTS: { id: ActId; label: string; hold: number; caption: string }[] = [
  {
    id: "today",
    label: "A day on the plan",
    hold: 4600,
    caption: "Four small things a day.",
  },
  {
    id: "weeks",
    label: "The 8-week arc",
    hold: 4400,
    caption: "Eight weeks, three phases.",
  },
];

/* ── The entrance ───────────────────────────────────────────────────────────── */

/** How much of the stage has to be on screen before the phone arrives.

    0.3 fired on a sliver - roughly the moment the frame cleared the fold, with
    the phone still under her thumb - so the entrance played at the bottom edge
    of the screen while she was still scrolling towards it. Half the stage puts
    the phone properly in front of her before it does anything. It has to stay
    reachable on the shortest viewport the funnel supports (375x557, less the
    fixed CTA), which it is by ~200px. */
const ARM_AMOUNT = 0.5;

/** A held beat between arriving and the phone rising in. Nothing on screen
    moves during it, which is the point: an animation that starts on the same
    frame the element crosses the threshold reads as triggered, and this one has
    to read as something she came upon. */
const ENTRY_DELAY_MS = 200;

/** The phone's width, standalone. At 244px the task labels land at ~10.7px and
    their sub-lines at ~8.8px - the floor for a 45-60 reader holding a phone.
    Anything wider and the frame starts pushing the block below the fold on the
    shortest phone the funnel supports (375x557, less the fixed CTA). */
const PHONE_MAX_PX = 244;

/** The frame's aspect ratio. 9 / 19.5 is a current iPhone - 393 x 852pt is
    9 : 19.52 - and it is the ratio because a phone mock that is not the shape
    of a phone stops being a phone and becomes a rounded rectangle with an app
    drawn in it. She is being shown the device she will run this on; the shape
    is the first thing that says so, before a single row is read.

    It was 9 / 15.5 (an iPhone-SE shape) until 2026-09-12, and that was a real
    trade rather than an oversight: at 9 / 17.8 inside the old parchment scroll
    both screens ran out of content about three quarters down, and standalone at
    PHONE_MAX_PX the same slack read as ~110px of empty cream - the largest
    element on the sales page arguing "the app is empty" on the screen that
    exists to argue the opposite. Squashing the frame closed the gap.

    The gap is now closed the other way, which is the honest way: the content
    grew into the phone instead of the phone shrinking onto the content. Both
    acts put their body on `flex-1` so slack splits above and below rather than
    pooling under the last row, the rows and the calendar dots carry the
    vertical rhythm a 19.5-tall screen actually has, and the two pieces of real
    iOS chrome this frame was missing - the Dynamic Island and the home
    indicator - take ~14cqw of it and earn it, because they are what the eye
    checks a phone mock against.

    Do not fix a future overflow by flattening this again. Inflating type to
    fill a flagship frame gives 18px task labels inside a phone, which stops
    reading as an app; squashing the frame gives a phone that is not a phone.
    Spend or reclaim the difference in vertical rhythm. */
const PHONE_ASPECT = "9 / 19.5";

/** The Dynamic Island, in real proportions off a 393pt iPhone: the pill is
    125 x 37pt (31.8% of the screen's width, and 9.4% of that width tall) and
    sits 11pt below the top edge. Everything here is a percentage of the *frame*
    (cqw), so the numbers below are those fractions taken against the screen's
    96.8cqw width rather than the frame's 100.

    It is not decoration. A phone drawn in 2026 with a clean top edge reads as
    an Android render or a generic "device frame" asset, and the whole job of
    this mock is to be recognisably the thing in her hand. */
const ISLAND = {
  width: "30.8cqw",
  height: "9.1cqw",
  top: "2.7cqw",
} as const;

/** The home indicator: 139 x 5pt, 8pt off the bottom edge, on the same 393pt
    reference. It is the other half of what makes the frame read as current. */
const HOME_BAR = {
  width: "34cqw",
  height: "1.15cqw",
  bottom: "2.1cqw",
} as const;

/* Act 1's beat sheet, in ms from the act's start. The rows land by ~0.75s and
   the header above them is two lines with her name in it, so the first tick
   waits until she has had a moment to read both. The four ticks have to finish
   with room to spare inside the act's hold, or "that's day one, done" flashes
   up as the act is already leaving. */
const TICK_START_MS = 1150;
const TICK_EVERY_MS = 620;

/* Act 2's beat sheet. Must stay in step with the per-dot delays below - the
   week counter reads off the same arithmetic the CSS delays are built from,
   and FILL_DOT_MS must match the `.plan-day` animation duration in
   globals.css. */
const FILL_START_MS = 340;
const FILL_SPAN_MS = 1850;
const FILL_DOT_MS = 220;
/** Gap between one day lighting up and the next. */
const FILL_STEP_MS = (FILL_SPAN_MS - FILL_DOT_MS) / (PLAN_DAYS - 1);

export function PlanStage({
  firstName,
  goalLabel,
  tasks,
  className,
}: {
  firstName?: string;
  /** Her #1 goal, lowercased, as it reads after "Goal:". */
  goalLabel: string;
  /**
   * Her real week-1 line per pillar key, from `buildWeekOneRows()`. Act 1 is a
   * mock of the app's Today screen, and the mock sits one screen in front of
   * the paywall's week-1 card - so if this shows the generic fallbacks while
   * that shows her week, the two adjacent screens disagree about what she is
   * buying. Missing keys fall back to `PlanPillar.task`.
   */
  tasks?: Record<string, string>;
  className?: string;
}) {
  const reduced = !!useReducedMotion();
  const stageRef = useRef<HTMLDivElement | null>(null);
  const inView = useInView(stageRef, { amount: 0.3 });
  const [index, setIndex] = useState(0);
  const progress = useMotionValue(0);
  const act = ACTS[index];

  /** Latches on first sight. `inView` above cannot do this job as well: it has
      to keep flipping, because it is what pauses the act clock. And re-playing
      the entrance every time she scrolls back onto the block would turn the
      arrival into a loop. Two IntersectionObservers on one element is what
      `once` is for. */
  const armed = useInView(stageRef, { once: true, amount: ARM_AMOUNT });

  const playing = inView && armed;

  /** The one clock. Resumes from wherever it was paused rather than restarting,
      so scrolling the stage out of view and back doesn't replay an act.
      It runs under reduced motion too - `reduced` decides *how* each act draws
      itself, not whether she gets to see it. With no controls left, stopping
      the clock there would strand her on act 1 and hide half the offer. Each
      act instead settles instantly and cross-fades. */
  useEffect(() => {
    if (!playing) return;
    const remaining = ACTS[index].hold * (1 - progress.get());
    const controls = animate(progress, 1, {
      duration: Math.max(0.4, remaining / 1000),
      ease: "linear",
      onComplete: () => {
        progress.set(0);
        setIndex((i) => (i + 1) % ACTS.length);
      },
    });
    return () => controls.stop();
  }, [playing, index, progress]);

  return (
    <div
      className={cn("px-4 pt-4", className)}
      role="img"
      aria-label={
        `${firstName ? `${firstName}'s` : "Your"} personalized ${PLAN_WEEKS} week plan: ` +
        `four small things to do each day - ${PLAN_PILLARS.map((p) => p.label.toLowerCase()).join(", ")} - ` +
        `across ${PLAN_WEEKS} weeks in three phases, designed to help you ${goalLabel}.`
      }
    >
      {/* The stage reserves the phone's height whether or not the phone has
          arrived yet, so the entrance never shifts the layout under her thumb. */}
      <div
        ref={stageRef}
        aria-hidden
        className="pointer-events-none relative mx-auto w-full select-none"
        style={{ maxWidth: PHONE_MAX_PX }}
      >
        <div className="w-full" style={{ aspectRatio: PHONE_ASPECT }}>
          {armed && (
            <PhoneMock
              screen={act.id}
              reduced={reduced}
              playing={playing}
              firstName={firstName}
              goalLabel={goalLabel}
              progress={progress}
              tasks={tasks}
            />
          )}
        </div>
      </div>

      {/* Progress. A read-out, not a control - it tells her the phone is
          playing and roughly how long the act has left. */}
      <div aria-hidden className="mt-4 flex items-center justify-center gap-2.5">
        {ACTS.map((a, i) => (
          <span key={a.id} className="block h-1 w-8 overflow-hidden rounded-full bg-[#E8DDD9] sm:w-10">
            {i === index ? (
              <motion.span
                className="block h-full w-full origin-left rounded-full bg-primary"
                style={{ scaleX: progress }}
              />
            ) : (
              <span
                className={cn(
                  "block h-full origin-left rounded-full bg-primary transition-[width] duration-300",
                  i < index ? "w-full" : "w-0"
                )}
              />
            )}
          </span>
        ))}
      </div>

      {/* One line, so the reserved height is one line.

          `mode="wait"`, unlike the screens above it. The phone can push two
          screens past each other because they are opaque and clipped; two lines
          of 10px grey type cross-fading in the same 20px box just print on top
          of each other, which is what this did - "Eight weeks, three phases."
          legibly overlaid on "Four small things a day." for a third of a
          second. Text swaps out, then in. The halves are quick enough (0.16s
          each) that the gap reads as a beat rather than as a missing caption,
          and they are deliberately shorter than the push above so the caption
          has landed by the time the new screen has. */}
      <div aria-hidden className="relative min-h-[20px] px-2">
        <AnimatePresence initial={false} mode="wait">
          <motion.p
            key={act.id}
            initial={reduced ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: reduced ? 0 : 0.16, ease: "easeOut" }}
            className="absolute inset-x-0 text-center text-[10px] leading-snug text-[#9A9A9A]"
          >
            {act.caption}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Read a value off the act clock, re-rendering only when it actually changes.
 * Every derived beat in here goes through this - it's the difference between
 * 4 renders an act and one per frame.
 */
function useActBeat<T>(progress: MotionValue<number>, hold: number, derive: (elapsed: number) => T): T {
  const [value, setValue] = useState(() => derive(progress.get() * hold));
  useMotionValueEvent(progress, "change", (p) => {
    const next = derive(p * hold);
    setValue((prev) => (Object.is(prev, next) ? prev : next));
  });
  return value;
}

/* ── The phone ──────────────────────────────────────────────────────────────── */

/**
 * Everything inside the phone is sized in `cqw` against the frame's own width,
 * so the mock is one design that scales with the column instead of a px layout
 * that overflows on a 320px screen.
 *
 * The two screens always travel the same way (out left, in from right) because
 * the loop only ever runs forwards.
 *
 * ── Why this is a push and not a cross-fade (2026-09-12) ────────────────────
 *
 * It was `opacity 0 -> 1` over `x: 24% -> 0`, i.e. a dissolve. For ~0.34s,
 * twice every nine seconds, that put two fully-detailed app screens at roughly
 * half opacity on top of each other - "Margaret, your tasks for today" reading
 * straight through "8 WEEKS" and the calendar grid. Caught mid-frame it looks
 * like a rendering bug, and it is the single least phone-like thing the mock
 * did: no device has ever shown two screens ghosting through one another.
 *
 * So both screens stay fully opaque and the outgoing one is *pushed* out while
 * the incoming one arrives, full width, clipped by the frame's own
 * `overflow-hidden`. That is exactly what a navigation push looks like on the
 * device this is imitating, it is impossible to catch in an unreadable state,
 * and it costs nothing extra - same two elements, same transform, one fewer
 * animated property.
 *
 * The easing is Apple's own navigation curve rather than a generic ease-out:
 * it leaves quickly, travels flat and settles long, which is what makes a
 * push read as weight rather than as a slide-in advert.
 */
const SCREEN_PUSH_EASE = [0.32, 0.72, 0, 1] as const;
const SCREEN_PUSH_MS = 0.52;

const screenVariants = {
  enter: { x: "100%" },
  center: { x: "0%" },
  exit: { x: "-100%" },
};

function PhoneMock({
  screen,
  reduced,
  playing,
  firstName,
  goalLabel,
  progress,
  tasks,
}: {
  screen: ActId;
  reduced: boolean;
  playing: boolean;
  firstName?: string;
  goalLabel: string;
  progress: MotionValue<number>;
  tasks?: Record<string, string>;
}) {
  return (
    <motion.div
      // A short rise, not the 110px climb it made out from behind the scroll's
      // bottom roll: there is nothing for it to emerge from any more, so a long
      // travel reads as a slide-in advert rather than as a device being held up.
      initial={reduced ? { opacity: 0 } : { opacity: 0, y: 22, scale: 0.965 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={
        reduced
          ? { duration: 0.2 }
          : {
              type: "spring",
              stiffness: 190,
              damping: 24,
              mass: 0.8,
              delay: ENTRY_DELAY_MS / 1000,
              opacity: { duration: 0.26, delay: ENTRY_DELAY_MS / 1000 },
            }
      }
      style={{ containerType: "inline-size" }}
      className="h-full w-full"
    >
      <div className="h-full rounded-[13.5cqw] bg-[#2C2420] p-[1.6cqw] shadow-[0_18px_38px_-14px_rgba(61,43,26,0.55)]">
        <div className="relative h-full overflow-hidden rounded-[12cqw] bg-[#FFFCF8] [-webkit-text-size-adjust:100%]">
          <StatusBar />
          <AnimatePresence initial={false}>
            <motion.div
              key={screen}
              variants={screenVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: reduced ? 0 : SCREEN_PUSH_MS, ease: SCREEN_PUSH_EASE }}
              className="absolute inset-0 flex flex-col px-[5.5cqw] pt-[15cqw] pb-[7cqw]"
            >
              {screen === "today" ? (
                <TodayScreen reduced={reduced} progress={progress} firstName={firstName} tasks={tasks} />
              ) : (
                <WeeksScreen
                  reduced={reduced}
                  playing={playing}
                  goalLabel={goalLabel}
                  progress={progress}
                />
              )}
            </motion.div>
          </AnimatePresence>

          {/* The Dynamic Island and the home indicator sit above both screens
              (z-20 over the status bar's z-10) so a screen pushing past
              underneath never travels over the hardware. That is the detail
              that sells it: on a real device the cutout is the display's
              physical edge, and anything sliding *over* it would read as a
              sticker on a picture of a phone. */}
          <span
            aria-hidden
            className="absolute left-1/2 z-20 -translate-x-1/2 rounded-full bg-[#0A0A0B]"
            style={{ width: ISLAND.width, height: ISLAND.height, top: ISLAND.top }}
          >
            {/* The front camera, which is the half of the Island people
                actually recognise - on an iPhone it is a lens sitting at the
                right end, just barely lighter than the cutout around it, with
                one small specular highlight. Two nested spans rather than an
                image, at the same cost as the rest of this mock: nothing. */}
            <span
              aria-hidden
              className="absolute right-[2.2cqw] top-1/2 block -translate-y-1/2 rounded-full bg-[#17171C]"
              style={{ width: "4.6cqw", height: "4.6cqw" }}
            >
              <span
                aria-hidden
                className="absolute left-[22%] top-[20%] block rounded-full bg-[#3A4560]/70"
                style={{ width: "1.3cqw", height: "1.3cqw" }}
              />
            </span>
          </span>

          <span
            aria-hidden
            className="absolute left-1/2 z-20 -translate-x-1/2 rounded-full bg-[#3D3D3D]/30"
            style={{
              width: HOME_BAR.width,
              height: HOME_BAR.height,
              bottom: HOME_BAR.bottom,
            }}
          />
        </div>
      </div>
    </motion.div>
  );
}

/** Decorative iOS status bar. Sits above the screens and never changes, so the
    two screens read as one device rather than two pictures.

    Its height is the Island's band (top inset + Island height) and its children
    centre inside that, which is how iOS actually lays this out - the clock and
    the indicators are optically centred on the cutout, not aligned to the top
    edge of the glass. Shipping the Island without moving this would have left
    9:41 sitting level with the pill's top corner, which is the sort of half-
    right detail that makes a mock look wrong without the reader being able to
    say why. The side insets widen to match: a 19.5-tall iPhone carries its
    status bar further in than a 15.5-tall one ever did. */
function StatusBar() {
  return (
    <div
      className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-[8cqw] text-[#3D3D3D]"
      style={{ height: `calc(${ISLAND.top} + ${ISLAND.height})` }}
    >
      <span className="text-[3.4cqw] font-bold tracking-tight">9:41</span>
      <span className="flex items-center gap-[1.4cqw] opacity-70">
        <span className="flex items-end gap-[0.5cqw]">
          {[1.4, 2, 2.6, 3.2].map((h) => (
            <span key={h} className="w-[0.9cqw] rounded-[0.4cqw] bg-current" style={{ height: `${h}cqw` }} />
          ))}
        </span>
        <span className="relative block h-[3.2cqw] w-[6cqw] rounded-[1cqw] border-[0.5cqw] border-current">
          <span className="absolute inset-[0.6cqw] rounded-[0.4cqw] bg-current" />
        </span>
      </span>
    </div>
  );
}

/* ── Act 1: today ───────────────────────────────────────────────────────────── */

const TODAY_HOLD = ACTS[0].hold;

/** The first line on the first screen, and the only personal thing left in the
    stage now that the sealed scroll is gone.

    It does three jobs in eight words: it uses her name (so the mock is *her*
    app rather than a product shot), it says the work is already done ("ready" -
    she is buying a finished plan, not a blank tracker she has to fill in), and
    the line under it prices the ask in the only currency she actually spends.
    That time figure is the objection this screen exists to answer: a woman of
    45-60 reading a plan on her phone is not asking whether it works, she is
    asking where the hour comes from.

    `±` rather than a flat "15 min" on purpose. Early weeks run below the full
    session length by design (the progression ladder), so an exact number here
    would be a promise the plan's own first fortnight does not keep. */
function todayGreeting(firstName?: string) {
  return `${firstName ? `${firstName}, your` : "Your"} tasks for today are ready!`;
}

const TODAY_EFFORT_LINE = "±15 min needed";

/** Today's four tasks, ticking themselves off one a beat. This is the product
    in one gesture - the same list, the same check, the same "day one, done" the
    tracker gives her. */
function TodayScreen({
  reduced,
  progress,
  firstName,
  tasks,
}: {
  reduced: boolean;
  progress: MotionValue<number>;
  firstName?: string;
  tasks?: Record<string, string>;
}) {
  const total = PLAN_PILLARS.length;
  const done = useActBeat(progress, TODAY_HOLD, (elapsed) => {
    if (reduced) return total;
    return Math.min(total, Math.max(0, Math.floor((elapsed - TICK_START_MS) / TICK_EVERY_MS) + 1));
  });
  const allDone = done === total;

  return (
    <>
      {/* The header. It replaced a "WEEK 1 OF 8" kicker over an 8cqw "TODAY" on
          2026-09-12: that was app chrome, and app chrome is the one thing a
          mock does not need in order to be convincing. Same two lines of
          height, her name and the size of the ask instead. */}
      <h3 className="text-[6.4cqw] font-extrabold leading-[1.15] tracking-tight text-[#3D3D3D]">
        {todayGreeting(firstName)}
      </h3>

      <div className="mt-[2.4cqw] flex items-baseline justify-between gap-[2cqw]">
        <p className="text-[3.6cqw] font-bold uppercase tracking-[0.14em] text-primary">
          {TODAY_EFFORT_LINE}
        </p>
        <span className="shrink-0 text-[3.6cqw] font-bold tabular-nums text-[#B9AEA6]">
          {done}/{total}
        </span>
      </div>

      <div className="mt-[3.4cqw] flex gap-[1.6cqw]">
        {PLAN_PILLARS.map((p, i) => (
          <span
            key={p.key}
            className={cn(
              "h-[1.9cqw] flex-1 rounded-full transition-colors duration-300",
              i < done ? "bg-primary" : "bg-[#EFE4DC]"
            )}
          />
        ))}
      </div>

      <ul className="mt-[4cqw] flex flex-1 flex-col justify-center gap-[5.2cqw]">
        {PLAN_PILLARS.map((p, i) => {
          const isDone = i < done;
          return (
            <motion.li
              key={p.key}
              initial={reduced ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduced ? 0 : 0.22 + i * 0.07, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className={cn(
                "flex w-full items-center gap-[3.4cqw] rounded-[5cqw] border px-[4cqw] py-[5.6cqw] text-left transition-colors duration-[260ms]",
                isDone ? "border-primary/35 bg-primary/8" : "border-[#EFE4DC] bg-white"
              )}
            >
              <span
                className={cn(
                  "inline-flex shrink-0 items-center justify-center rounded-[3.4cqw] transition-opacity duration-200",
                  "h-[15.5cqw] w-[15.5cqw]",
                  p.chip,
                  isDone && "opacity-55"
                )}
              >
                <p.icon className={cn("h-[8.2cqw] w-[8.2cqw]", p.tint)} strokeWidth={2.2} />
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-[4.4cqw] font-bold leading-tight transition-colors duration-200",
                    isDone ? "text-[#B9AEA6] line-through" : "text-[#3D3D3D]"
                  )}
                >
                  {p.label}
                </span>
                <span className="block truncate text-[3.6cqw] leading-tight text-[#B0A69E]">
                  {tasks?.[p.key] ?? p.task}
                </span>
              </span>

              <span
                className={cn(
                  "grid h-[9.2cqw] w-[9.2cqw] shrink-0 place-items-center rounded-full border-[0.95cqw] transition-colors duration-[260ms]",
                  isDone ? "border-primary bg-primary" : "border-[#E3D8D0] bg-white"
                )}
              >
                <AnimatePresence>
                  {isDone && (
                    <motion.span
                      initial={reduced ? false : { scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      transition={{ type: "spring", stiffness: 620, damping: 26 }}
                    >
                      <Check className="h-[4.8cqw] w-[4.8cqw] text-white" strokeWidth={4} />
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
            </motion.li>
          );
        })}
      </ul>

      {/* Fixed height so a row ticking off never moves the rows above it, and
          `mt-auto` so it sits on the bottom edge of the screen rather than
          directly under the list - whatever slack the frame has left over then
          ends up in one place, above a footer, instead of as a void below
          everything. */}
      <div className="relative mt-auto pt-[4.5cqw] h-[11cqw]">
        <AnimatePresence initial={false} mode="wait">
          {allDone && (
            <motion.p
              key="done"
              initial={reduced ? false : { opacity: 0, y: 8, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 26 }}
              className="absolute inset-x-0 flex items-center justify-center gap-[1.6cqw] rounded-[3.6cqw] bg-green-50 py-[2.4cqw] text-[3.8cqw] font-bold text-green-700 ring-1 ring-green-200"
            >
              <Sparkles className="h-[4.2cqw] w-[4.2cqw]" strokeWidth={2.4} />
              That&apos;s day one, done.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

/* ── Act 2: the eight weeks ─────────────────────────────────────────────────── */

const WEEKS_HOLD = ACTS[1].hold;

/** The 56 dots, precomputed once at module scope: which week they belong to,
    what color they land on, and when. Nothing in here depends on props. */
const PLAN_DAY_DOTS = Array.from({ length: PLAN_WEEKS }, (_, w) =>
  Array.from({ length: 7 }, (_, d) => ({
    color: planPhaseForWeek(w + 1).dot,
    delay: FILL_START_MS + (w * 7 + d) * FILL_STEP_MS,
  }))
);

/** 56 days filling in, week by week, through the three phases. The payoff for
    act 1: this is what those four taps a day add up to. The dots are CSS (see
    `.plan-day`); only the week badge and the phase line come off the clock, and
    they re-render 8 times in the act rather than 56. */
function WeeksScreen({
  reduced,
  playing,
  goalLabel,
  progress,
}: {
  reduced: boolean;
  playing: boolean;
  goalLabel: string;
  progress: MotionValue<number>;
}) {
  const week = useActBeat(progress, WEEKS_HOLD, (elapsed) => {
    if (reduced) return PLAN_WEEKS;
    const day = Math.floor((elapsed - FILL_START_MS) / FILL_STEP_MS) + 1;
    return Math.min(PLAN_WEEKS, Math.max(1, Math.ceil(day / 7)));
  });
  const finished = useActBeat(
    progress,
    WEEKS_HOLD,
    (elapsed) => reduced || elapsed >= FILL_START_MS + FILL_SPAN_MS
  );
  const phase = planPhaseForWeek(week);

  const gridStyle = useMemo(
    () => ({ "--plan-day-play": playing ? "running" : "paused" }) as React.CSSProperties,
    [playing]
  );

  return (
    <>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[3.4cqw] font-bold uppercase tracking-[0.2em] text-primary">Your plan</p>
          <h3 className="text-[9.4cqw] font-extrabold uppercase leading-none tracking-tight text-[#3D3D3D]">
            {PLAN_WEEKS} weeks
          </h3>
        </div>
        <span className="rounded-full bg-[#F6EEE8] px-[3cqw] py-[1.6cqw] text-[3.5cqw] font-bold tabular-nums text-[#7A6C62]">
          Week {week}
        </span>
      </div>

      {/* The calendar and the line under it centre in whatever the header and
          the goal strip leave them, so the frame's slack splits above and below
          the grid instead of pooling in one gap underneath it. */}
      <div className="flex flex-1 flex-col justify-center">
        <div className="mt-[5cqw] flex flex-col gap-[5.6cqw]" style={gridStyle}>
          {PLAN_DAY_DOTS.map((days, w) => (
            <div key={w} className="flex items-center gap-[2.4cqw]">
              <span className="w-[5.6cqw] shrink-0 text-[3.1cqw] font-bold tabular-nums text-[#C6BAB1]">
                W{w + 1}
              </span>
              <div className="flex gap-[2.4cqw]">
                {days.map((dot, d) => (
                  <span
                    key={d}
                    className={cn("plan-day h-[9cqw] w-[9cqw]", reduced && "plan-day--static")}
                    style={
                      {
                        "--plan-day-color": dot.color,
                        "--plan-day-delay": `${dot.delay}ms`,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Fixed height so the phase line and the finish badge trade places
            without the grid above them moving. */}
        <div className="relative mt-[5.5cqw] h-[10.5cqw]">
          <AnimatePresence initial={false} mode="wait">
            {finished ? (
              <motion.p
                key="done"
                initial={reduced ? false : { opacity: 0, y: 8, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 360, damping: 26 }}
                className="absolute inset-x-0 flex items-center justify-center gap-[1.6cqw] rounded-[3.6cqw] bg-green-50 py-[2.2cqw] text-[3.9cqw] font-bold text-green-700 ring-1 ring-green-200"
              >
                <Check className="h-[4.2cqw] w-[4.2cqw]" strokeWidth={3.4} />
                {PLAN_WEEKS} weeks. Done.
              </motion.p>
            ) : (
              <motion.p
                key={phase.label}
                initial={reduced ? false : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-x-0 flex items-center justify-center gap-[2cqw] text-[3.9cqw] font-semibold text-[#5A5A5A]"
              >
                <span
                  className="block h-[2.6cqw] w-[2.6cqw] rounded-full"
                  style={{ background: phase.dot }}
                />
                {phase.label}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Her own finish line, under the arc, on the bottom edge of the screen.
          The eight weeks are only worth anything as the thing she said she
          wanted back. */}
      <p className="mt-auto rounded-[3.6cqw] bg-[#FBF4EE] px-[3cqw] py-[3.2cqw] text-center text-[3.6cqw] font-semibold leading-snug text-[#8A7A6E]">
        <span className="uppercase tracking-[0.16em] text-[#C0B0A2]">Goal </span>
        {goalLabel}
      </p>
    </>
  );
}
