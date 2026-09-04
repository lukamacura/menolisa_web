"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { X } from "lucide-react";

/**
 * ── A push notification from Lisa, dropped over the top of a quiz screen. ──
 *
 * The funnel's largest single loss is the first screen: over the first clean
 * window, 231 sessions entered and 118 reached screen two. Forty-nine percent
 * of every ad dollar leaves before one tap. Nothing on that screen is broken —
 * she simply has not been given a reason to start, and a grid of symptom tiles
 * argues for itself only if you already trust the thing showing it.
 *
 * This is that reason, in one sentence, from a name and a face. It is
 * deliberately not another headline: a headline is the page talking, and the
 * page is what she is deciding whether to trust. It is dressed as the iOS
 * banner it is imitating — frosted material, app icon, app name, "now",
 * swipe-up-to-dismiss — because that is the one piece of chrome on her phone
 * she reads without deciding to, and it reads as a person rather than as a
 * page. It renders identically on Android: none of it depends on the OS, only
 * on CSS every mobile browser since 2021 supports (see the material note on
 * the card itself for the one property that degrades).
 *
 * Three rules hold it together, and each one is load-bearing:
 *
 *  1. **It can never eat a tap it did not ask for.** The overlay wrapper is
 *     `pointer-events-none`; only the banner itself opts back in, and only so
 *     that its close button and its swipe work. The screen it covers is the
 *     one where half the traffic is already leaving, so everything outside the
 *     card's own ~76px must stay live — an overlay that swallowed the first tap
 *     there would cost more than every nudge could ever return.
 *  2. **It never claims a number we cannot show.** See {@link QUIZ_NUDGES}.
 *  3. **The author is a real person or the brand's disclosed persona, never an
 *     invented human.** See {@link NUDGE_AUTHOR}.
 *
 * It shows once per step per visit, on the steps named in {@link QUIZ_NUDGES}
 * and nowhere else. A step with no entry renders nothing at all.
 */

/**
 * Who the note is from.
 *
 * **Lisa is the default because Lisa is real in the only sense that matters
 * here: she is the product's disclosed AI companion, named on the landing
 * page, in the app and in the privacy policy.** A note from her is the brand
 * speaking in the voice it already uses.
 *
 * A founder's note converts better than a coach's, and if you want that, put
 * *your own* name and role here — a real person, reachable at the support
 * address, who would stand behind the sentence. Do not invent one. A fabricated
 * owner with a stock portrait is a made-up human vouching for a health product
 * to women deciding whether to trust it with their symptoms, and it is the
 * single easiest thing on this funnel for a sceptic to disprove: one reverse
 * image search. Everything else on these screens is checkable, which is why
 * they work.
 *
 * `avatar` must be a real file in `public/`. If you swap the name, swap the
 * face; Lisa's portrait over someone else's name is the same problem twice.
 *
 * `app` is the notification's app name row — the product, not the person, the
 * same way a real banner names the app above the sender.
 */
export const NUDGE_AUTHOR = {
  name: "Lisa",
  role: "your coach",
  avatar: "/brand/lisa-profile.webp",
  app: "MenoLisa",
} as const;

/**
 * One line per screen, keyed by the `Step` values in `app/register/page.tsx`.
 *
 * **Every line here is checkable against this codebase, and that is the point.**
 * The obvious thing to write is a statistic — "women who answer honestly get 4x
 * better results" — and there is no such measurement anywhere in this product,
 * so it would be invented. Invented efficacy numbers in a menopause funnel are
 * the exact conduct behind the FTC's GoodRx and BetterHelp actions, and the
 * claim would sit ~90 seconds before a card form, which is where a regulator
 * looks first. It also does not survive the audience: a 50-year-old woman who
 * has been sold three things that did not work reads an unsourced multiple as
 * marketing, and the sentence spends trust instead of building it.
 *
 * What is left is stronger anyway, because all of it is true and she can feel
 * it being true as she goes: what the answer is used for, and who sees it.
 *
 * Keep them one sentence. This sits over a screen she is trying to read, in a
 * banner that clamps at three lines exactly as the real one does.
 */
export const QUIZ_NUDGES: Record<string, string> = {
  // Screen 1 — the ad's landing page, and the 49% loss. She has just arrived
  // from a creative that ended on "tap your symptom"; this says the tapping is
  // the point rather than a form to get through.
  q4_symptoms: "Tap anything that sounds like you, even what you've gotten used to.",

  // Screen 2 — the first screen that asks for something about her rather than
  // about how she feels, and the first place "why do you need this" arrives.
  q1_age: "No wrong answers here. Just tap what's closest.",

  // Height and weight, the one genuinely uncomfortable screen in the quiz.
  q_body: "Only you see this. A rough guess is fine.",

  // The only text input in the funnel, and the last question. The screen's own
  // sub-line already says no email is needed, so this takes the other half of
  // the cost: she does not have to hand over her real name to go on.
  q8_name: "Just a first name. A nickname works fine.",
};

/** How long after the screen settles the banner drops in. */
const NUDGE_DELAY_MS = 900;
/** How long it stays. Long enough to read twice at 50, short enough to leave. */
const NUDGE_VISIBLE_MS = 6000;

/**
 * Swipe-up-to-dismiss thresholds, matched to the gesture iOS actually accepts:
 * a short flick counts on velocity, a slow drag counts on distance. Anything
 * that satisfies neither springs back, so a stray scroll never dismisses it.
 */
const SWIPE_DISMISS_PX = 28;
const SWIPE_DISMISS_VELOCITY = 320;

export interface QuizNudgeProps {
  /** The current quiz step key. A step with no {@link QUIZ_NUDGES} entry renders nothing. */
  step: string;
  /**
   * Steps already shown this visit. Owned by the caller (a ref in the funnel)
   * so that going Back and forward through a screen does not replay the note —
   * she has read it, and a second showing reads as a glitch.
   */
  seen: Set<string>;
}

export function QuizNudge({ step, seen }: QuizNudgeProps) {
  const reduceMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);
  // Held so a dismiss cancels the auto-hide rather than racing it: without
  // this, the timer fires into an already-unmounted banner and (harmlessly but
  // pointlessly) re-runs the exit.
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const message = QUIZ_NUDGES[step];

  const dismiss = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    setVisible(false);
  }, []);

  const handleDragEnd = useCallback(
    (_e: unknown, info: PanInfo) => {
      if (info.offset.y < -SWIPE_DISMISS_PX || info.velocity.y < -SWIPE_DISMISS_VELOCITY) {
        dismiss();
      }
    },
    [dismiss]
  );

  useEffect(() => {
    if (!message || seen.has(step)) return;

    // Marked on schedule rather than on unmount: the note is "spent" for this
    // visit the moment it is due, so a fast tapper who leaves the screen before
    // it lands does not meet it again on the way back.
    seen.add(step);

    const show = setTimeout(() => setVisible(true), NUDGE_DELAY_MS);
    hideTimer.current = setTimeout(
      () => setVisible(false),
      NUDGE_DELAY_MS + NUDGE_VISIBLE_MS
    );
    return () => {
      clearTimeout(show);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setVisible(false);
    };
  }, [step, message, seen]);

  return (
    <AnimatePresence>
      {visible && message && (
        <motion.div
          // `pointer-events-none` on the wrapper is the rule this component
          // lives under - see the note at the top of the file. Only the card
          // below opts back in, so the full-width strip either side of it stays
          // transparent to taps.
          //
          // `top-0` plus the safe-area inset is what puts it where the real
          // banner sits on every device at once: 0 on Android and on a
          // flat-topped iPhone, ~59px under a Dynamic Island. z-50 clears the
          // funnel's own fixed CTA bar (z-30).
          className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-2.5 pt-[calc(env(safe-area-inset-top)+10px)]"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -120 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -120 }}
          transition={
            reduceMotion
              ? { duration: 0.2 }
              : // iOS drops the banner in on a spring with a touch of overshoot
                // and pulls it back out on a curve. A symmetric tween in both
                // directions is the tell that it is a web div.
                { type: "spring", stiffness: 420, damping: 34, mass: 0.9 }
          }
          // Announced once, politely. It is supplementary to the question, not
          // a replacement for it, so it must not interrupt the screen's own
          // heading being read.
          role="status"
          aria-live="polite"
        >
          <motion.div
            // The material. `backdrop-blur` is the one property here that is
            // not universal - an old Android in-app webview without
            // `backdrop-filter` gets the opaque white fallback and the banner
            // still reads, which is why the translucent value is behind
            // `supports-backdrop-filter:` rather than being the base.
            className="pointer-events-auto relative flex w-full max-w-sm cursor-default select-none items-start gap-2.5 rounded-[18px] bg-white py-2 pl-3 pr-11 shadow-[0_10px_28px_-10px_rgba(61,40,50,0.32),0_2px_8px_-4px_rgba(61,40,50,0.16)] ring-1 ring-black/[0.06] backdrop-blur-xl backdrop-saturate-150 supports-backdrop-filter:bg-white/78"
            // Swipe up to dismiss, the gesture the real banner teaches. Dragging
            // down does nothing (`dragConstraints` pins the bottom at 0), so a
            // downward swipe over the banner cannot drag it into the page.
            drag={reduceMotion ? false : "y"}
            dragDirectionLock
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0.6, bottom: 0 }}
            onDragEnd={handleDragEnd}
          >
            {/* The app icon, in the rounded square iOS gives every app rather
                than the circle a chat avatar would get - the banner names the
                app first and the sender second, and this is the half that says
                which app. */}
            <Image
              src={NUDGE_AUTHOR.avatar}
              alt=""
              width={30}
              height={30}
              className="mt-[1px] h-[30px] w-[30px] shrink-0 rounded-[7px] object-cover shadow-[0_1px_3px_rgba(61,40,50,0.22)]"
              draggable={false}
            />

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-[9.5px] font-semibold uppercase tracking-[0.07em] text-[#8E8A8C]">
                  {NUDGE_AUTHOR.app}
                  <span className="text-[#B4B0B2]"> · </span>
                  <span className="text-[#5E5A5C]">{NUDGE_AUTHOR.name}</span>
                  <span className="font-medium text-[#A9A5A7]"> · {NUDGE_AUTHOR.role}</span>
                </p>
                <span className="shrink-0 text-[9.5px] font-medium text-[#A9A5A7]">now</span>
                {/* The dismiss control. Real banners have no X - they are swiped
                    - so this exists for the phone that will not swipe and for
                    the woman who does not know the gesture. 24px of circle, with
                    the negative margins and the padded tap target giving it a
                    ~36px hit area: it shrank with the card, but the touch area
                    did not, because this sits on the screen that takes 100% of
                    paid traffic. */}
              </div>

              {/* Two lines, then an ellipsis, as the collapsed banner clamps.
                  Keep the lines in QUIZ_NUDGES short enough that it never has
                  to - at this size that is roughly 70 characters.

                  The sender's role leads the body rather than occupying a
                  heading row of its own. Three stacked rows made the card 90px
                  tall, which is taller than the gap between the top of the
                  screen and the question, so the banner covered the headline it
                  is supposed to sit on top of. Two rows clear it. */}
              <p className="mt-0.5 line-clamp-2 text-[12px] leading-[1.3] text-[#3D3D3D]">
                {message}
              </p>
            </div>

            {/* Absolutely placed, not part of the header row: a 36px touch
                target inside the flow set the row height and made the whole
                card ~12px taller than the gap above the question. The hit area
                is unchanged - only what it pushes around is. */}
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss notification"
              className="absolute right-1 top-1 flex h-9 w-9 items-center justify-center text-[#6F6A6D]"
            >
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-black/[0.06] transition-colors active:bg-black/[0.12]">
                <X className="h-3 w-3" strokeWidth={2.5} />
              </span>
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
