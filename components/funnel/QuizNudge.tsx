"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * ── A small note from a person, dropped over the top of a quiz screen. ──
 *
 * The funnel's largest single loss is the first screen: over the first clean
 * window, 231 sessions entered and 118 reached screen two. Forty-nine percent
 * of every ad dollar leaves before one tap. Nothing on that screen is broken —
 * she simply has not been given a reason to start, and a grid of symptom tiles
 * argues for itself only if you already trust the thing showing it.
 *
 * This is that reason, in one sentence, from a name and a face. It is
 * deliberately not another headline: a headline is the page talking, and the
 * page is what she is deciding whether to trust.
 *
 * Three rules hold it together, and each one is load-bearing:
 *
 *  1. **It can never eat a tap.** The whole overlay is `pointer-events-none`.
 *     The screen it covers is the one where half the traffic is already
 *     leaving, and an overlay that swallows the first tap there would cost
 *     more than every nudge could ever return. There is no close button for
 *     the same reason — it would need to accept a tap to work.
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
 */
export const NUDGE_AUTHOR = {
  name: "Lisa",
  role: "your coach",
  avatar: "/brand/lisa-profile.webp",
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
 * Keep them one sentence. This sits over a screen she is trying to read.
 */
export const QUIZ_NUDGES: Record<string, string> = {
  // Screen 1 — the ad's landing page, and the 49% loss. She has just arrived
  // from a creative that ended on "tap your symptom"; this says the tapping is
  // the point rather than a form to get through.
  q4_symptoms:
    "Tap everything that's been happening — even what you've learned to live with. Your plan is built from these.",

  // Screen 2 — the first screen that asks for something about her rather than
  // about how she feels, and the first place "why do you need this" arrives.
  q1_age:
    "There are no wrong answers here. The more honest you are, the better the plan fits.",

  // Height and weight, the one genuinely uncomfortable screen in the quiz.
  q_body: "Nobody sees this but you. It sets your starting point and nothing else.",
};

/** How long after the screen settles the note appears. */
const NUDGE_DELAY_MS = 900;
/** How long it stays. Long enough to read twice at 50, short enough to leave. */
const NUDGE_VISIBLE_MS = 6000;

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

  const message = QUIZ_NUDGES[step];

  useEffect(() => {
    if (!message || seen.has(step)) return;

    // Marked on schedule rather than on unmount: the note is "spent" for this
    // visit the moment it is due, so a fast tapper who leaves the screen before
    // it lands does not meet it again on the way back.
    seen.add(step);

    const show = setTimeout(() => setVisible(true), NUDGE_DELAY_MS);
    const hide = setTimeout(
      () => setVisible(false),
      NUDGE_DELAY_MS + NUDGE_VISIBLE_MS
    );
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
      setVisible(false);
    };
  }, [step, message, seen]);

  return (
    <AnimatePresence>
      {visible && message && (
        <motion.div
          // `pointer-events-none` is the rule this component exists under - see
          // the note at the top of the file. It is on the wrapper, so nothing
          // inside it can opt back in.
          className="pointer-events-none fixed inset-x-0 top-0 z-40 flex justify-center px-3 pt-[calc(8px+env(safe-area-inset-top))]"
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -24 }}
          animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -16 }}
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
          // Announced once, politely. It is supplementary to the question, not
          // a replacement for it, so it must not interrupt the screen's own
          // heading being read.
          role="status"
          aria-live="polite"
        >
          <div className="flex w-full max-w-md items-start gap-2.5 rounded-2xl border border-[#F0E3EA] bg-white/95 px-3 py-2.5 shadow-[0_8px_24px_-8px_rgba(61,61,61,0.28)] backdrop-blur">
            <Image
              src={NUDGE_AUTHOR.avatar}
              alt=""
              width={36}
              height={36}
              className="mt-0.5 h-9 w-9 shrink-0 rounded-full object-cover"
            />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9A9A9A]">
                {NUDGE_AUTHOR.name}
                <span className="font-normal normal-case tracking-normal">
                  {" "}
                  · {NUDGE_AUTHOR.role}
                </span>
              </p>
              <p className="mt-0.5 text-[13px] leading-snug text-[#3D3D3D]">{message}</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
