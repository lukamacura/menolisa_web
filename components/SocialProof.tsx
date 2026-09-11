"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type FocusEvent as ReactFocusEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import Image from "next/image";
import { motion, MotionConfig, useReducedMotion, type Variants } from "framer-motion";
import { ChevronDown, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { getSocialProofMembers, type SocialProofMember } from "@/lib/testimonials";

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

/**
 * How long one member holds the card before the next one fades in, folded.
 *
 * Eight seconds, not five. The slot she is actually reading is the pull quote
 * - a full sentence, set at 17px, above a name, an age and a line of context -
 * and five seconds is a glance, not a read. For the audience this card is
 * written for it was fast enough to swap *mid-sentence*, which does not read
 * as a second woman arriving; it reads as the page having lost her place.
 */
const ROTATE_MS = 8000;

/**
 * And how long it holds with the full story open.
 *
 * Opening a story used to stop the card dead, forever - which sounds
 * considerate and is not: the one woman who has shown she wants to read these
 * is the one the card then guarantees never meets the others. So it keeps
 * going, three times slower.
 *
 * **This number is a reading-speed bet and it is the weakest thing on the
 * block.** The stories run 600-900 characters; at the 200 wpm a 45-60 audience
 * reads unfamiliar prose at, that is 40-60 seconds, so 25 will move the card
 * on a woman who is still in paragraph three - the exact mid-sentence swap
 * `ROTATE_MS` was raised to avoid. It is set low deliberately, because the
 * cost of being wrong is asymmetric: too slow and she simply reads on and taps
 * a dot, too fast and she loses her place. Raise it to 45000 the moment
 * anything suggests women are reading to the end.
 */
const ROTATE_OPEN_MS = 25000;
/** The crossfade itself. Long enough not to blink, short enough not to muddy. */
const CROSSFADE_S = 0.6;

/**
 * Crossfades one slot of the card between members without moving anything.
 *
 * Every member's copy is rendered at once, stacked in a single CSS grid cell,
 * and only `opacity` changes - so the slot is permanently as tall and as wide
 * as its longest occupant and the swap costs the browser one composited layer
 * per member, no layout, no reflow. That is the whole reason the print, the
 * caption, the quote and the button label can change while the card around
 * them does not so much as twitch: an `AnimatePresence` swap would collapse
 * the slot to nothing between the two, and animating `height` would drag the
 * note card, the divider and the footnote with it on every tick.
 *
 * The cost is that the inactive copy is in the DOM, so it is `aria-hidden` and
 * inert - a screen reader gets exactly one testimonial, the visible one.
 *
 * `only` renders the active member alone, for the one slot where the stack
 * would show: the expanded story, whose height is `auto` and would otherwise
 * take the tallest story's height with a gap under the shorter one. Safe
 * because rotation is paused for as long as the story is open.
 */
function Swap({
  index,
  items,
  className,
  cellClassName,
  only = false,
  still = false,
  scale = false,
}: {
  index: number;
  items: { key: string; node: ReactNode }[];
  className?: string;
  cellClassName?: string;
  /** Render only the active member (see above). */
  only?: boolean;
  still?: boolean;
  /** Add a hair of scale to the incoming copy. For the print only. */
  scale?: boolean;
}) {
  const shown = only ? [items[index]] : items;
  return (
    <div className={cn("grid", className)}>
      {shown.map((item, i) => {
        const active = only || i === index;
        return (
          <motion.div
            key={item.key}
            style={{ gridArea: "1 / 1" }}
            /* `only` renders one node, so a member change is an unmount and a
               remount rather than two stacked opacities - which without an
               enter animation is a hard cut, and the card now advances
               underneath an open story. Safe to branch on: `only` is passed
               `open`, which is `false` on the server and on the first client
               render, so the serialized `initial` is the same either way. */
            initial={only ? { opacity: 0 } : false}
            animate={{ opacity: active ? 1 : 0, scale: scale && !active ? 1.03 : 1 }}
            transition={still ? { duration: 0 } : { duration: CROSSFADE_S, ease: EASE }}
            aria-hidden={active ? undefined : true}
            className={cn(cellClassName, !active && "pointer-events-none")}
          >
            {item.node}
          </motion.div>
        );
      })}
    </div>
  );
}

/**
 * Which member the card is showing, and when it is allowed to move on.
 *
 * It holds still whenever moving would interrupt her rather than reward her:
 * while a *mouse* is over the card or keyboard focus is inside it, while the
 * tab is in the background, and permanently for anyone who asked for reduced
 * motion - for whom the card is simply the first member's, exactly as it was
 * before this rotated. Any of those resets the clock rather than resuming a
 * part-spent one, so leaving the card always buys a full read of the next
 * woman.
 *
 * **The hover pause is mouse-only, and that is a bug fix, not a nicety.**
 * Pointer events fire for touch, so on a phone every scroll that began with a
 * finger on the card was a `pointerenter` followed by a `pointerleave` - a
 * pause and a resume, and because a resume restarts the full `ROTATE_MS`, the
 * clock went back to zero each time. A woman reading the card on the device
 * most of this traffic arrives on could scroll it into view, read it, and
 * never once see the second woman. Worse, mobile browsers hold the hover state
 * after a tap until something else is tapped, so a single tap could stop the
 * rotation for good. `pointerType` is the whole fix: a mouse means she is
 * hovering to read, a finger means she is scrolling past.
 *
 * **Opening a story slows the card, it no longer stops it** (`ROTATE_OPEN_MS`).
 * Freezing on expand had the same shape as the touch bug: the most engaged
 * reader on the block was the one guaranteed never to meet the members after
 * the first.
 *
 * **Once she steers, the timer never starts again** (`took`). Tapping a dot or
 * swiping the card is her saying which woman she wants to read, and a carousel
 * that pulls the page out from under that is the single most-complained-about
 * behaviour of the pattern. It is also what makes this card conform to WCAG
 * 2.2.2: auto-updating content needs a mechanism to stop it, and pausing on
 * hover and focus alone gives a touch user - most of this traffic - no
 * mechanism at all. The controls are that mechanism, and they are the only
 * mechanism, which is why they are always visible rather than revealed on
 * hover.
 *
 * A resumed timer is a *fresh* `ROTATE_MS`, never the remainder of the
 * interrupted one, so `running` is exported for the progress fill in
 * `MemberDots` to restart on. A bar that picked up where it stopped would be
 * lying about when the card moves.
 */
function useMemberRotation(
  count: number,
  expanded: boolean,
  still: boolean,
  restMs: number
) {
  const [index, setIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [paused, setPaused] = useState(false);
  const [took, setTook] = useState(false);

  useEffect(() => {
    const onVisibility = () => setHidden(document.visibilityState === "hidden");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const running = count > 1 && !took && !still && !paused && !hidden;
  const intervalMs = expanded ? ROTATE_OPEN_MS : restMs;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % count),
      intervalMs
    );
    return () => window.clearInterval(id);
  }, [running, count, intervalMs]);

  // A member removed under us (a draft entry stripped from a production build)
  // must never leave the card pointing at nothing.
  const safeIndex = index % Math.max(count, 1);

  // Wraps, so the arrow keys and a swipe past either end land somewhere real.
  const goTo = useCallback(
    (next: number) => {
      if (count < 1) return;
      setTook(true);
      setIndex(((next % count) + count) % count);
    },
    [count]
  );

  return {
    index: safeIndex,
    running,
    intervalMs,
    steered: took,
    goTo,
    hold: {
      // See the note above: a finger is not a hover.
      onPointerEnter: (e: ReactPointerEvent) => {
        if (e.pointerType === "mouse") setPaused(true);
      },
      onPointerLeave: (e: ReactPointerEvent) => {
        if (e.pointerType === "mouse") setPaused(false);
      },
      // Keyboard focus pauses; a *click* must not. Without the
      // `:focus-visible` test, clicking "Read her full story" left focus
      // parked on that button, which pinned `paused` true for the rest of the
      // visit - so the slow expanded cadence below would never have run on a
      // desktop at all. A mouse user is already covered by the hover pause
      // above, and it releases when she moves off the card, which is exactly
      // when the slow clock should start.
      onFocusCapture: (e: ReactFocusEvent) => {
        const t = e.target as HTMLElement;
        if (typeof t.matches === "function" && t.matches(":focus-visible")) {
          setPaused(true);
        }
      },
      onBlurCapture: () => setPaused(false),
    },
  };
}

/** Far enough that a tap, or the horizontal drift of a vertical scroll, is
 *  never mistaken for a swipe. */
const SWIPE_MIN_PX = 48;

/** A horizontal swipe on the card, and nothing else.
 *
 *  Deliberately touch-only and deliberately not framer's `drag`: the card must
 *  not move under her thumb, because the print is taped to the page and a
 *  taped photograph that slides is a carousel pretending to be a scrapbook.
 *  The gesture only has to be *available* - the dots are what advertise that
 *  there is more than one woman. Nothing calls `preventDefault`, so vertical
 *  scrolling through the paywall is untouched, and the axis test rejects the
 *  diagonal drift of a scroll that happens to start on the card. */
function useSwipe(onSwipe: (direction: 1 | -1) => void) {
  const start = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: ReactTouchEvent) => {
      const t = e.touches[0];
      start.current = t ? { x: t.clientX, y: t.clientY } : null;
    },
    onTouchEnd: (e: ReactTouchEvent) => {
      const from = start.current;
      start.current = null;
      const t = e.changedTouches[0];
      if (!from || !t) return;
      const dx = t.clientX - from.x;
      const dy = t.clientY - from.y;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.3) return;
      onSwipe(dx < 0 ? 1 : -1);
    },
  };
}

/**
 * The one piece of furniture on the card that is a control rather than a
 * decoration: how many women there are, which one this is, and how to get to
 * the others.
 *
 * The card used to swap in silence. A crossfade with nothing around it does not
 * read as "here is the next member" - it reads as the page having changed its
 * mind, and it strands anyone who looked up mid-quote with no way back to the
 * woman she was reading. Three failures in one, and all three are the same
 * missing thing: no indication that the content is a set.
 *
 * Why this shape and not the alternatives:
 *
 *  - **Dots, not arrows.** Arrows say "there is more in that direction" and
 *    nothing about how much; dots say "four, and you are on the first", which
 *    is the fact that decides whether she waits. At four members the whole set
 *    still fits with room to spare; past about six it would not, and this
 *    becomes an arrows-and-a-counter problem rather than a dots one.
 *  - **The active dot fills.** A static dot tells her where she is, a filling
 *    one tells her what is about to happen - which is what turns an
 *    unannounced swap into an expected one. When the timer is not running the
 *    same bar is simply full: "this is the one you are on", with no countdown
 *    being claimed. It never freezes part-filled, because a paused bar implies
 *    it will resume from there and a resumed timer here starts over.
 *  - **Names in the label, not on screen.** Rendering "Mara / Taryn / …" as
 *    tabs would out-shout the note card and grow the block; the screen reader
 *    gets the names anyway, where a bare "slide 2" is useless.
 *
 * Every control clears the 24x24px minimum target size by a comfortable
 * margin - this is a 45-60 audience on a phone - which is why the button is a
 * transparent 24x36 box around a 6px dot rather than a 6px button.
 */
function MemberDots({
  members,
  index,
  running,
  durationMs,
  onSelect,
  className,
}: {
  members: SocialProofMember[];
  index: number;
  running: boolean;
  /** The live interval, so the fill and the swap finish together. */
  durationMs: number;
  onSelect: (next: number) => void;
  className?: string;
}) {
  if (members.length < 2) return null;

  return (
    <div
      role="group"
      aria-label="Member stories"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          onSelect(index + 1);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          onSelect(index - 1);
        }
      }}
      className={cn("flex items-center justify-center", className)}
    >
      {members.map((m, i) => {
        const active = i === index;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(i)}
            aria-label={`${m.name}, ${m.age} \u2014 story ${i + 1} of ${members.length}`}
            aria-current={active ? "true" : undefined}
            className="group flex h-9 min-w-6 items-center justify-center px-1 focus-visible:outline-none"
          >
            <span
              className={cn(
                "relative block h-1.5 overflow-hidden rounded-full",
                "transition-[width,background-color] duration-300 ease-out",
                "ring-offset-2 group-focus-visible:ring-2 group-focus-visible:ring-primary/50",
                active
                  ? "w-7 bg-[#E8DDD9]"
                  : "w-1.5 bg-[#DDD2CC] group-hover:bg-[#C4B5AD]"
              )}
            >
              {active && (
                /* One element in both states, differing only in how long it
                   takes to fill: `initial` is what gets serialized, so a
                   reduced-motion client renders the identical first frame the
                   server did and this cannot mismatch on hydration. The key is
                   the restart - a resumed timer is a fresh `ROTATE_MS`, so the
                   fill has to begin again rather than sit where the pause left
                   it - and so does opening a story, which stretches the same
                   bar over `ROTATE_OPEN_MS`. Keys are not markup, so none of
                   this can mismatch on hydration. */
                <motion.span
                  key={`${index}-${running}-${durationMs}`}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={
                    running
                      ? { duration: durationMs / 1000, ease: "linear" }
                      : { duration: 0 }
                  }
                  style={{ transformOrigin: "left" }}
                  className="absolute inset-0 block rounded-full bg-primary"
                />
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

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
 * The human faces on the page. Everything around it is her own numbers and her
 * own plan; this is the only block that says someone else already walked it.
 * Deliberately one woman at a time rather than a wall of five-star cards - a
 * wall reads as marketing, one print reads as a person - and the card rotates
 * through `getSocialProofMembers()` so she meets more than one of them without
 * the block growing a second inch.
 *
 * Three parts, in the order she reads them:
 *
 *   1. the print - a square photo, taped to the page, of a member. Mara's is
 *      also a product shot, taken holding the app, which is why the print is
 *      the hero of the block and why it is never cropped to a portrait.
 *   2. the quote - one sentence, big. If she reads nothing else on this block,
 *      this is the sentence she leaves with.
 *   3. the story - the full testimonial, folded to four lines behind a fade.
 *      Long-form proof converts the sceptic and costs the scanner nothing, but
 *      only while it is folded: 200 words of body copy dropped into a paywall
 *      scroll is a wall she scrolls past, not a story she reads.
 *   4. the controls - one dot per member under the card, the live one filling
 *      over
 *      `ROTATE_MS`. They exist because the rotation was otherwise
 *      unannounced:
 *      nothing said the card was a set of women rather than one, nothing
 *      warned her a swap was coming, and nothing got her back to the woman she
 *      had been half-way through. See `MemberDots`.
 *
 * **What rotates and what does not.** The paper, the tape, the stars, the
 * divider, the button and the footnote are furniture and never move; only the
 * print, the name, the caption, the quote, the story and the button's name
 * change, and they all change together on one clock so the card reads as one
 * woman being replaced by another rather than six independent tickers. Every
 * changing slot is a `<Swap>`, i.e. a fixed-size grid cell crossfading on
 * `opacity` alone - see that component for why the alternatives (an
 * `AnimatePresence` swap, an animated `height`) both move the page.
 *
 * It stops when moving would interrupt her: story open, pointer or focus
 * inside the card, tab in the background, or reduced motion - and for the rest
 * of the visit the moment she picks a woman herself, by dot, arrow key or
 * swipe. See `useMemberRotation`. With one member (a production build where
 * every other entry is still `draft`) there is no timer and no dots at all,
 * and this is byte-for-byte the card it was before.
 *
 * Reduced motion is honored through `<MotionConfig reducedMotion="user">`,
 * which drops the transform half of every animation below and keeps the fades.
 * That indirection is the point: `useReducedMotion()` returns `false` on the
 * server and `true` on a client that asked for it, so branching *markup* on it
 * - a different `initial`, a variant swapped for `undefined`, an element
 * rendered only one way - is a guaranteed hydration mismatch. The hook and the
 * `reduced` prop may drive `transition` (never serialized, never compared) and
 * the rotation timer, and nothing else. Do not reintroduce a
 * `still ? ... : ...` on a rendered prop.
 */
/**
 * `rotateMs` exists because the card lives on two screens with very different
 * dwell times, and one interval cannot serve both.
 *
 * On the paywall she is scrolling a ~2000px page and the card is one block on
 * it, so `ROTATE_MS` (8s) is a read, as its own note argues. On
 * `reward_social_proof` it is the whole screen and she leaves as soon as she
 * has read it - measured at a handful of seconds - so at 8s the second woman
 * arrives after she is gone and the board shows a still photograph of one
 * person. Four members at 8s is 32 seconds to meet them all, on a screen with
 * a Continue button under it.
 *
 * The floor stays a read rather than a glance: this shortens the hold, it does
 * not turn the card into a slideshow.
 */
export function SocialProofPolaroid({
  reduced = false,
  rotateMs = ROTATE_MS,
}: {
  reduced?: boolean;
  rotateMs?: number;
}) {
  const prefersReducedMotion = useReducedMotion();
  const still = reduced || !!prefersReducedMotion;

  const [open, setOpen] = useState(false);
  const storyId = useId();

  /**
   * The expanded height, measured rather than left to `height: "auto"`.
   *
   * "auto" was fine while opening a story stopped the card: the target changed
   * once, framer measured once, done. Now that the card advances underneath an
   * open story, the target would stay the string "auto" across a member change
   * and framer has no reason to re-run an animation whose target did not
   * change - so the container would keep the pixel height of the *previous*
   * woman's story and clip the next one, or leave a slab of blank paper under
   * it. A number changes when the story changes, so the card follows it.
   *
   * Reset to null on every toggle: while folded the story `Swap` renders every
   * member stacked, so what is measured is the tallest, not the active one.
   * Null means "animate to auto for one frame and let the observer correct
   * it", which is right on the way open and harmless on the way closed.
   */
  const [openHeight, setOpenHeight] = useState<number | null>(null);
  const storyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = storyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // setState in an observer callback, not in the effect body - this is the
    // subscribe-to-an-external-system shape, not a cascading render.
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setOpenHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toggleStory = () => {
    setOpenHeight(null);
    setOpen((v) => !v);
  };

  const members = useMemo(() => getSocialProofMembers(), []);
  const { index, running, intervalMs, steered, goTo, hold } = useMemberRotation(
    members.length,
    open,
    still,
    rotateMs
  );
  const swipe = useSwipe((direction) => goTo(index + direction));
  const member = members[index];

  return (
    <MotionConfig reducedMotion="user">
      <motion.div
        variants={stage}
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, amount: 0.2 }}
        className="mb-5"
        {...hold}
      >
        <motion.div variants={rise} className="flex items-end gap-1.5 px-1">
          <Swap
            index={index}
            still={still}
            className="flex-1"
            items={members.map((m) => ({
              key: m.id,
              node: (
                <p className="font-script text-2xl sm:text-3xl leading-tight text-[#3D3D3D]">
                  This is {m.name}. She started right where you are.
                </p>
              ),
            }))}
          />
          <CaptionArrow className="relative z-10 w-8 h-10 sm:w-9 sm:h-11 shrink-0 -mb-1 text-primary" />
        </motion.div>

        <div className="mx-auto mt-2 w-full max-w-[360px]" {...swipe}>
          {/* The print. Square, so it gets a square print's frame: even borders
              and a deep chin for the caption. It sits above the note card and
              overlaps it, which is what makes the two read as one object lying
              on a page rather than two stacked components. It lands once, on
              view; the women after the first arrive by crossfade inside the
              frame, because re-dropping the print every five seconds would
              turn one photograph handed to you into a slideshow. */}
          <motion.figure
            variants={drop}
            className="relative z-10 mx-auto w-[228px] sm:w-[248px] rounded-[3px] bg-white p-2.5 pb-1.5 shadow-[0_18px_34px_-14px_rgba(0,0,0,0.45)] ring-1 ring-black/5"
          >
            <Tape className="-top-2.5 -left-4 -rotate-[24deg]" />
            <Tape className="-top-2.5 -right-4 rotate-[19deg]" />

            <div className="relative aspect-square overflow-hidden rounded-[2px] bg-[#E8DDD9] ring-1 ring-black/[0.07]">
              {/* Every print is mounted, so the next one is decoded long
                  before its turn - a crossfade into an image that has not
                  loaded is a grey square, on the one element that is the
                  proof. */}
              <Swap
                index={index}
                still={still}
                scale
                className="absolute inset-0"
                cellClassName="relative"
                items={members.map((m) => ({
                  key: m.id,
                  node: (
                    <Image
                      src={m.photo}
                      alt={m.alt}
                      fill
                      sizes="248px"
                      className="object-cover"
                    />
                  ),
                }))}
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
              <Swap
                index={index}
                still={still}
                items={members.map((m) => ({
                  key: m.id,
                  node: (
                    <>
                      <span className="block font-script text-xl leading-none text-[#3D3D3D]">
                        {m.name}, {m.age}
                      </span>
                      <span className="mt-1.5 block text-[9.5px] font-semibold uppercase leading-[1.4] tracking-[0.07em] text-[#9A9A9A]">
                        {m.context}
                      </span>
                    </>
                  ),
                }))}
              />
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

            <motion.div variants={rise} className="mt-2.5">
              <Swap
                index={index}
                still={still}
                items={members.map((m) => ({
                  key: m.id,
                  node: (
                    <p className="text-balance text-center text-[17px] sm:text-lg font-bold leading-[1.4] text-[#3D3D3D]">
                      &ldquo;{m.pullQuote}&rdquo;
                    </p>
                  ),
                }))}
              />
            </motion.div>

            {/* The dots stand where the hairline divider used to, and do its
                job as well as their own.

                They were under the whole card, which on the phone this block
                is designed for put them off the bottom of the screen: the
                print alone is ~300px, the note card another ~230, so by the
                time she could see the control telling her there were two more
                women, she had already scrolled past the two more women. A
                control that only appears after the content it controls is not
                a control. Here they sit in the note card's own furniture band,
                a few lines under the quote, visible the moment the card is.

                It is the divider slot and not somewhere higher because
                everything above it is load-bearing: the print is the hero and
                must not be pushed down the fold, and the stars are the
                credibility furniture the quote reads out of. This was the one
                piece of pure decoration on the card, and a row of dots
                separates a quote from a story at least as well as a 12px
                hairline did. */}
            {members.length > 1 ? (
              <MemberDots
                members={members}
                index={index}
                running={running}
                durationMs={intervalMs}
                onSelect={goTo}
                className="my-1.5"
              />
            ) : (
              <div className="mx-auto my-3 h-px w-12 bg-[#E8DDD9]" />
            )}

            {/* The story, collapsed. framer measures `height: "auto"`, so the
                paragraphs stay in the DOM in both states - a screen reader and a
                crawler get the whole testimonial either way. `only={open}`
                keeps the expanded card honest about its own height: the stack
                is as tall as the longest story, which is invisible behind an
                86px clamp and a gap of dead paper once she opens it. */}
            <motion.div
              id={storyId}
              initial={false}
              animate={{ height: open ? openHeight ?? "auto" : STORY_COLLAPSED_PX }}
              transition={still ? { duration: 0 } : { duration: 0.5, ease: EASE }}
              className="relative overflow-hidden"
            >
              <div ref={storyRef}>
                <Swap
                  index={index}
                  still={still}
                  only={open}
                  items={members.map((m) => ({
                    key: m.id,
                    node: (
                      <div className="space-y-2.5 text-[13.5px] leading-[1.65] text-[#5A5A5A]">
                        {m.story.map((para) => (
                          <p key={para.slice(0, 24)}>{para}</p>
                        ))}
                      </div>
                    ),
                  }))}
                />
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
              onClick={toggleStory}
              aria-expanded={open}
              aria-controls={storyId}
              className="mx-auto mt-3 flex items-center gap-1.5 rounded-full border border-[#E8DDD9] bg-white px-3.5 py-1.5 text-[12.5px] font-bold text-[#5A5A5A] shadow-xs transition-colors hover:bg-[#F7F0EC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              {/* Swapped rather than interpolated so the pill does not resize
                  under her thumb mid-crossfade: the label slot is always as
                  wide as the longest name. */}
              {open ? (
                "Show less"
              ) : (
                <Swap
                  index={index}
                  still={still}
                  items={members.map((m) => ({
                    key: m.id,
                    node: <span>Read {m.name}&rsquo;s full story</span>,
                  }))}
                />
              )}
              <motion.span
                animate={{ rotate: open ? 180 : 0 }}
                transition={still ? { duration: 0 } : { duration: 0.3, ease: EASE }}
                className="flex"
              >
                <ChevronDown className="h-4 w-4" strokeWidth={2.75} />
              </motion.span>
            </button>
          </motion.div>

          {/* Silent while the card is driving itself - a live region that
              announces every automatic swap is a screen reader talking over
              the page. It speaks only once she has taken the wheel, which is
              exactly when she is owed the answer to "who did I just land on?".
              Keyed to `steered` rather than `running`: `running` folds in
              reduced motion, and reduced motion differs between the server
              render and the first client one. `steered` starts `false` on both
              sides and only ever changes after hydration, in response to her. */}
          {members.length > 1 && member && (
            <p className="sr-only" aria-live={steered ? "polite" : "off"}>
              {`${member.name}, ${member.age} \u2014 story ${index + 1} of ${members.length}`}
            </p>
          )}

          <motion.div variants={rise} className="mt-2 px-1">
            <Swap
              index={index}
              still={still}
              items={members.map((m) => ({
                key: m.id,
                node: (
                  <p className="text-center text-[10px] leading-snug text-[#9A9A9A]">
                    {m.name}&rsquo;s own words. Individual experiences vary.
                  </p>
                ),
              }))}
            />
          </motion.div>
        </div>
      </motion.div>
    </MotionConfig>
  );
}
