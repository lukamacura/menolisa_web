"use client";

import { ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Check,
  Clock,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Star,
  Sunrise,
  Zap,
  CreditCard,
} from "lucide-react";
import AnimatedCounter from "@/components/landing/AnimatedCounter";
import { SocialProofPolaroid, SymptomOutcomeCards } from "@/components/SocialProof";
import {
  META_CURRENCY,
  PLAN_VALUE,
  newInitiateCheckoutEventId,
  viewContentEventId,
} from "@/lib/metaPixel";
import {
  PLAN_ADHERENCE_PCT,
  PLAN_ANCHOR_PRICE,
  PLAN_ANCHOR_PRICE_PER_DAY,
  PLAN_DISCOUNT_PCT,
  PLAN_DISCOUNT_WINDOW_MS,
  PLAN_ID,
  PLAN_PRICE,
  PLAN_PRICE_PER_DAY,
  PLAN_WEEKS,
  RENEWAL_NOTICE_DAYS,
  TRIAL_DAYS,
  formatChargeDate,
  formatPrice,
  trialEndDate,
} from "@/lib/pricing";
import { trackFb } from "@/lib/metaPixelClient";
import { HighlightSweep } from "@/components/HighlightSweep";
import { PlanFinishBoard } from "@/components/PlanFinishBoard";
import { PhoneShot, ShotStage, SHOT_W, SHOT_H } from "@/components/PhoneShots";
import { getOfferPromise } from "@/lib/planTimeline";

export interface PaywallViewProps {
  /**
   * Starts the Stripe checkout. Receives the `event_id` this component just
   * fired the browser InitiateCheckout with - pass it to `create-checkout` as
   * `meta_event_id` so the server copy dedups against it instead of
   * double-counting her.
   */
  onCheckout: (metaEventId: string) => void | Promise<void>;
  checkoutLoading: boolean;
  error?: string | null;
  /** Optional banner above the hero (e.g. "Account under review" for disputed). */
  banner?: ReactNode;
  /** Optional back link (e.g. return to the diagnosis page). */
  onBack?: () => void;
  /**
   * Her first name, when we have it. Used in exactly one place - the price hold
   * ("Linda, your $59 rate is held while you finish"). A generic hold reads as
   * site-wide theatre; the same sentence with her name in it reads as held for
   * something that is already hers. It is deliberately the only place: the
   * finish board above it carried her name too until 2026-08-17, and two
   * mail-merges inside one screen height undo what one of them buys.
   */
  firstName?: string;
  /**
   * Which funnel this paywall belongs to. Sent to Meta as `content_category` so
   * the registration funnel and the expired-account paywall stay separable in
   * Events Manager.
   */
  trackingSource?: "register" | "dashboard";
  /**
   * Her Supabase user id. Both callers have it before this component renders -
   * the funnel signed her in anonymously back on the calculating screen, and
   * `/paywall` resolved her session before it dropped the loader.
   *
   * It is what makes `ViewContent` a count of women rather than of mounts: it
   * keys the once-per-tab guard and derives the `event_id` that the Conversions
   * API copy independently derives too (`viewContentEventId`). Absent, the event
   * still fires from the browser - undeduplicated and with no server copy, which
   * is what the whole screen did until 2026-08-19.
   */
  userId?: string | null;
  /**
   * Her selected symptoms, when we have them (the /register funnel has just
   * asked). Personalizes the before/after outcome cards; the dashboard paywall
   * has no quiz to draw from, so it falls back to a representative set.
   */
  topProblems?: string[];
  /**
   * Her selected goal ids, when we have them. Only the first is used - the far
   * end of the finish line is the outcome *she* picked, not one we assigned.
   */
  goal?: string[];
  /**
   * Sell the free week (2026-09-04). True unless this account has already
   * held a subscription — the caller decides, because it is the caller that
   * knows her history (`/paywall` reads `previously_paid`; the funnel's
   * account is minutes old). False renders the $59-today paywall, and
   * `create-checkout` makes the same decision from the same facts so the copy
   * and the charge cannot disagree.
   */
  trialEligible?: boolean;
  /**
   * She has had her free week — a returning customer. One line at the price
   * says so, because a woman who saw "first week free" in the ad and meets a
   * $59 card form with no explanation reads it as a bait-and-switch.
   */
  welcomeBack?: boolean;
}

const PRICE = formatPrice(PLAN_PRICE);
const ANCHOR_PRICE = formatPrice(PLAN_ANCHOR_PRICE);
const PER_DAY = `$${PLAN_PRICE_PER_DAY.toFixed(2)}`;
const ANCHOR_PER_DAY = `$${PLAN_ANCHOR_PRICE_PER_DAY.toFixed(2)}`;

/**
 * Where the deadline lives. sessionStorage, not state: a reload must not hand
 * her a fresh 10 minutes, or the countdown is visibly theatre — and a timer that
 * is caught resetting takes the refund guarantee's credibility down with it,
 * which is the reason the first version of this countdown (with its one-tap "get
 * my discount back" button, which *did* visibly reset) was cut on 2026-08-12.
 * There is no reclaim button now: it runs down once per tab and stays down.
 *
 * Per-tab-session rather than localStorage, so someone coming back tomorrow
 * starts a new window instead of landing on a paywall that expired days ago.
 */
const DEADLINE_KEY = "menolisa:paywall-discount-deadline";

function readDeadline(): number {
  try {
    const stored = Number(window.sessionStorage.getItem(DEADLINE_KEY));
    // A stored deadline further out than the full window means a stale or
    // tampered value; treat it as absent rather than honoring it.
    if (Number.isFinite(stored) && stored > 0 && stored <= Date.now() + PLAN_DISCOUNT_WINDOW_MS) {
      return stored;
    }
  } catch {
    // sessionStorage can throw in private/blocked contexts.
  }
  return 0;
}

function writeDeadline(deadline: number) {
  try {
    window.sessionStorage.setItem(DEADLINE_KEY, String(deadline));
  } catch {
    // Non-fatal: the countdown just resets on reload.
  }
}

/** `585000` → `"09:45"`. */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

const subscribeToNothing = () => () => {};

/**
 * `false` on the server and through hydration, `true` after. The paywall can be
 * server-rendered, and by then sessionStorage may hold a half-spent deadline the
 * server knew nothing about — so the countdown has to sit out hydration rather
 * than disagree with the HTML. useSyncExternalStore is the one hook that flips
 * after hydration without a mismatch warning.
 */
function useHydrated() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false
  );
}

/**
 * Countdown on the discounted price. The deadline is resolved during the first
 * render rather than in an effect, so once hydrated the paywall paints the
 * stored countdown directly instead of flashing a full window first.
 *
 * `expired` changes copy and colour and nothing else — see
 * {@link PLAN_DISCOUNT_WINDOW_MS} for why the button and the invoice never move.
 */
function useDiscountWindow() {
  const hydrated = useHydrated();
  const [deadline] = useState(() =>
    typeof window === "undefined" ? 0 : readDeadline() || Date.now() + PLAN_DISCOUNT_WINDOW_MS
  );
  const [now, setNow] = useState(() => (typeof window === "undefined" ? 0 : Date.now()));

  // Persisting is an external-system write, which is what effects are for.
  useEffect(() => {
    if (deadline) writeDeadline(deadline);
  }, [deadline]);

  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= deadline) clearInterval(id);
    }, 1000);
    return () => clearInterval(id);
  }, [deadline]);

  const remainingMs =
    hydrated && deadline ? Math.max(0, deadline - now) : PLAN_DISCOUNT_WINDOW_MS;

  return { remainingMs, expired: remainingMs === 0 };
}

/**
 * The finish line moved into <PlanFinishBoard /> (components/PlanFinishBoard.tsx)
 * when it stopped being two dates and an arrow and became a chart with a needle
 * on it. The reasoning for both the block and its position lives there.
 */

// Scannable 2x2 grid, one promise per box. At the payment moment she scans
// rather than reads, so every box is a 2-3 word headline with one support line.
//
// Box 1 used to read "One payment / $59 covers all 8 weeks", which sat about
// 100px under the price card's "renews every 8 weeks" and flatly contradicted
// it. This grid is the part of the page she *scans* rather than reads, so the
// false half is the half that lands - and a subscriber who believed "one
// payment" disputes the week-8 charge. The reassurance she actually needs here
// is that the renewal is escapable, which is both true and stronger.
const trustLabels = (price: string, trial: boolean) => [
  trial
    ? {
        icon: CreditCard,
        bg: "bg-pink-100",
        fg: "text-pink-600",
        title: `$0 today`,
        sub: `Cancel in the free week and pay nothing`,
      }
    : {
        icon: CreditCard,
        bg: "bg-pink-100",
        fg: "text-pink-600",
        title: `Cancel before renewal`,
        sub: `and the ${price} is all you ever pay`,
      },
  {
    icon: Zap,
    bg: "bg-yellow-100",
    fg: "text-yellow-700",
    title: "Instant access",
    sub: "Your plan is ready now",
  },
  {
    icon: Check,
    bg: "bg-sky-100",
    fg: "text-sky-600",
    title: "Cancel in 2 taps",
    sub: "No calls, no hoops",
  },
  {
    icon: ShieldCheck,
    bg: "bg-green-100",
    fg: "text-green-700",
    title: "Stripe secured",
    sub: "We never see your card",
  },
];

export function PaywallView({
  onCheckout,
  checkoutLoading,
  error,
  banner,
  onBack,
  firstName,
  trackingSource,
  topProblems,
  goal,
  userId,
  trialEligible = false,
  welcomeBack = false,
}: PaywallViewProps) {
  const name = firstName?.trim() ?? "";
  // The first-charge date, rendered once per mount. `new Date()` at render is
  // fine here: Stripe computes the real trial_end at checkout a minute or two
  // later, and the day only differs if she taps across local midnight — the
  // welcome email and the account card carry Stripe's own date.
  const [chargeDate] = useState(() => formatChargeDate(trialEndDate()));
  // Same promise as the finish board's far end (lib/planTimeline.ts) - the
  // headline and the chart should name the same outcome.
  const promise = getOfferPromise(goal ?? []);

  // Display-only price window. `handleCheckoutClick` and `onCheckout` are
  // byte-identical either side of zero - she is charged PLAN_PRICE whether the
  // clock ran out or not. See the note at the bottom of this file before
  // touching that.
  const { remainingMs, expired } = useDiscountWindow();
  const livePrice = expired ? ANCHOR_PRICE : PRICE;
  const livePricePerDay = expired ? ANCHOR_PER_DAY : PER_DAY;

  // ViewContent: she has seen the offer. Reported twice, browser and server, and
  // counted once per woman rather than once per mount.
  //
  // Three guards stack, each covering what the one before it can't:
  //
  //   1. `viewTracked` - this mount. Cheap, and the only one that survives a
  //      browser with storage disabled.
  //   2. `sessionStorage` - this tab. The ref alone was the whole guard until
  //      2026-08-19, and a ref dies with the mount: `<PaywallView />` sits under
  //      `<AnimatePresence mode="wait" key={phase}>` in the funnel, so Back into
  //      the relief screen and forward again remounted it, as did returning from
  //      a cancelled Stripe checkout. It was reporting ~3x the number of Leads,
  //      which is why "reached the paywall" could not be divided by anything.
  //   3. Meta's own 48h dedup on `(event_name, event_id)` - every tab, every
  //      device. This is also the browser/server pair's dedup, which is why the
  //      id is derived from her user id rather than minted: see
  //      `viewContentEventId`.
  //
  // The beacon fires alongside the pixel, not instead of it, and neither waits
  // on the other - an ad blocker takes out fbevents.js, ITP takes out the
  // cookies, and this route is unaffected by both. `keepalive` so it survives
  // her tapping the CTA a moment later and the page navigating to Stripe.
  const viewTracked = useRef(false);
  useEffect(() => {
    if (viewTracked.current) return;
    viewTracked.current = true;

    const params = {
      content_name: "paywall",
      content_category: trackingSource,
      content_type: "product",
      value: PLAN_VALUE,
      currency: META_CURRENCY,
    };

    // No id to dedup on and no session for the beacon to authenticate. Report
    // the view rather than lose it, and accept the double count. Neither caller
    // reaches here in practice; see the `userId` prop.
    if (!userId) {
      trackFb("ViewContent", params);
      return;
    }

    const storageKey = `fb:vc:${userId}`;
    try {
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // Private mode / storage disabled - fall through and let guard 3 handle it.
    }

    trackFb("ViewContent", params, { eventID: viewContentEventId(userId) });

    void fetch(
      `/api/paywall-view${trackingSource ? `?source=${trackingSource}` : ""}`,
      { method: "POST", credentials: "include", keepalive: true }
    ).catch(() => {
      // The pixel copy already went. A failed beacon costs match quality on the
      // ad-blocked cohort, never the event.
    });
    // Mount-only by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // InitiateCheckout fires on the CTA - the moment she actually enters Stripe -
  // rather than on paywall view, so it reflects intent rather than exposure.
  //
  // Reported twice, browser and server, on one id minted here: this is the last
  // event before the money and the one delivery leans on while Purchase volume
  // is below learning-phase exit, so losing a third of it to ITP and ad blockers
  // is not affordable. `create-checkout` sends the server copy - see
  // `sendMetaInitiateCheckout`.
  const handleCheckoutClick = () => {
    const eventId = newInitiateCheckoutEventId();
    trackFb(
      "InitiateCheckout",
      {
        content_name: PLAN_ID,
        content_category: trackingSource,
        content_type: "product",
        value: PLAN_VALUE,
        currency: META_CURRENCY,
        num_items: 1,
      },
      { eventID: eventId }
    );
    return onCheckout(eventId);
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-y-auto -mx-4 sm:-mx-6 px-4 sm:px-6 pt-4 sm:pt-6 pb-[calc(168px+env(safe-area-inset-bottom))] relative [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="max-w-md mx-auto w-full flex flex-col"
      >
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="flex items-center gap-1 text-xs text-[#9A9A9A] hover:text-[#5A5A5A] mb-2 self-start transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </button>
        )}

        {banner && <div className="mb-3">{banner}</div>}

        {/* Social proof: stars + count */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex items-center justify-center gap-2 mb-2"
        >
          <div className="flex">
            {[0, 1, 2, 3, 4].map((i) => (
              <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            ))}
          </div>
          <span className="text-xs sm:text-sm font-semibold text-[#3D3D3D]">
            4.9 &middot;{" "}
            <AnimatedCounter
              target={12800}
              formatter={(n) => `${n.toLocaleString("en-US")}+`}
            />{" "}
            women
          </span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="text-center mb-2.5"
        >
          {/* Leads with the outcome she picked, not the mechanics of the offer -
              the same promise as the finish board's far end (lib/planTimeline.ts,
              getOfferPromise), so the headline and the chart name the same thing.
              Price cut and refund move to a subline underneath: still on screen
              with the price card, still the terms of the deal, just not what she
              reads first.

              **The refund left the headline on 2026-08-30.** It read "{promise}
              in 8 weeks or a full refund if it doesn't work", which spent the
              largest type on the page introducing the *possibility of failure*
              at the one moment belief is highest - she has just watched a plan
              built from her own answers and done a breathing exercise that
              worked. Risk reversal is a closer, not an opener: it answers "what
              if this doesn't work for me", and that question only exists after
              she wants it. The guarantee card ~400px below states the whole
              promise in full, on green, under a shield - which is where a
              sceptic goes looking for it anyway.

              What replaces it is the outcome and a date she can picture. "8
              weeks from today" rather than "in 8 weeks" for the same reason the
              finish board draws a calendar instead of writing "8 weeks": a
              duration is an abstraction and a deadline is an appointment. */}
          <h1 className="text-2xl sm:text-2xl font-bold text-[#3D3D3D] leading-tight text-balance">
            <HighlightSweep variant="green">{promise}</HighlightSweep>.
            <br />
            {PLAN_WEEKS} weeks from today.
          </h1>
          {/* It opened on "Start today" until the headline above ended on "from
              today" - the same word twice inside 20px, which reads as a typo
              rather than as emphasis. "Starts the moment you join" keeps the
              immediacy the line was there for and is the literal truth: the
              plan is generated during checkout, so it exists before she has
              finished downloading the app.

              It carried ", 50% off" in gradient type until 2026-09-03. With the
              countdown band, the badge and the strikethrough all inside the
              same first viewport, that made four discount signals on one
              screen - a clearance page, read by a woman who has just been told
              this plan was built from her own answers. The discount is now
              shown once, as a number (the strikethrough), and timed once (the
              band). Nothing else on the screen says "off". */}
          <p className="text-sm text-[#5A5A5A] mt-1">Starts the moment you join</p>
        </motion.div>

        {/* Her finish line, sitting above the price hold rather than between it
            and the price card: the hold and the price are a matched pair (same
            pink border, same urgency), and splitting them to insert this broke
            that read. Outcome, then hold, then number. */}
        <PlanFinishBoard topProblems={topProblems} goal={goal} className="mb-2.5" />

        {/* The price hold, with its clock. Pairs with the price card below -
            same pink border - so the number and the time left on it read as one
            object. Her name goes here and nowhere else on the screen (see the
            `firstName` prop): a generic hold is site-wide theatre, the same
            sentence with her name in it is held for something already hers.

            The seconds are `aria-hidden` and only the expiry is announced: a
            per-second live region reads the whole band aloud sixty times a
            minute, which is a screen reader jackhammer, not urgency. */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="flex items-center justify-center gap-2 rounded-xl border px-3 py-1.5 mb-2.5"
          style={
            expired
              ? { borderColor: "#E0D9D5", background: "#F7F4F2" }
              : {
                  borderColor: "#ff74b1",
                  background:
                    "linear-gradient(135deg, rgba(255,116,177,0.10) 0%, rgba(255,157,108,0.10) 100%)",
                }
          }
        >
          {expired ? (
            <>
              <Lock className="w-4 h-4 shrink-0 text-[#9A9A9A]" />
              <p className="text-xs sm:text-sm font-semibold text-[#7A7A7A]">
                {name ? `${name}, your ` : "Your "}
                {PLAN_DISCOUNT_PCT}% discount window has closed
              </p>
            </>
          ) : (
            <>
              <Clock className="w-4 h-4 shrink-0 text-[#ff74b1]" />
              <p className="text-xs sm:text-sm font-semibold text-[#3D3D3D]">
                {name ? `${name}, your ` : "Your "}
                <span className="font-extrabold text-[#ff74b1]">{PRICE}</span> rate is held
                for{" "}
                <span
                  aria-hidden
                  className="font-extrabold tabular-nums text-[#ff74b1]"
                >
                  {formatRemaining(remainingMs)}
                </span>
                {/* The digits are hidden from assistive tech and replaced with
                    minutes, read once at whatever moment she reaches the band.
                    A per-second announcement of "09:44, 09:43, ..." is noise,
                    not urgency. */}
                <span className="sr-only">
                  {Math.max(1, Math.ceil(remainingMs / 60000))} more minutes
                </span>
              </p>
            </>
          )}
          <span aria-live="polite" className="sr-only">
            {expired ? `Your ${PLAN_DISCOUNT_PCT}% discount window has closed.` : ""}
          </span>
        </motion.div>

        {/* Price card - the single plan, no choice to make */}
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.3 }}
          className="relative rounded-2xl border bg-white p-4 mb-4 shadow-sm"
          style={
            expired
              ? { borderColor: "#E0D9D5" }
              : {
                  borderColor: "#ff74b1",
                  backgroundImage:
                    "linear-gradient(135deg, rgba(255,116,177,0.06) 0%, rgba(255,235,118,0.04) 50%, rgba(101,219,255,0.06) 100%)",
                }
          }
        >
          <span
            className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 rounded-full text-[10px] sm:text-xs font-bold tracking-wide text-white shadow-md flex items-center gap-1 whitespace-nowrap"
            style={
              expired
                ? { background: "#9A9A9A" }
                : { background: "linear-gradient(135deg, #ff74b1 0%, #ff9d6c 100%)" }
            }
          >
            {expired ? (
              <>
                {PLAN_WEEKS} WEEK PLAN &middot; REGULAR PRICE
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3" />
                YOUR {PLAN_WEEKS} WEEK PLAN
              </>
            )}
          </span>

          {/* ── The number here is what Stripe will charge, not the per-day
              slice of it (2026-09-03). ──

              It was the per-day figure at 4xl — $1.05, against a struck-through
              $2.11 — with `{PRICE}` appearing exactly once on the whole screen,
              in 12px grey, three lines below. The sticky CTA said "Get my plan
              for $1.05/day" for all ~2000px of scroll. So the first time a woman
              saw the string "$59" was on the Stripe sheet, with a card field
              under it: a number 56x larger than the one she had been reading for
              two minutes, arriving at the exact moment she is deciding whether
              to trust us. Five checkouts opened and none completed.

              Per-day framing is not dishonest and it is not gone — it is the
              sub-line, which is where a reframing of a price belongs. The price
              is the price. The rule at the bottom of this file is unaffected:
              every figure shown is still >= what she is charged, and the
              expired branch still shows the anchor. */}
          {/* Ink, not gradient, and 3xl rather than 4xl (2026-09-03). A price
              is a fact, and the screen's colour rule gives facts ink; a
              pink-to-blue number is a sale sticker, and it was the loudest
              object in the first viewport on a page whose job is to be
              trusted. The number is still the biggest type on the card - it
              just no longer shouts. */}
          <div className="pt-2 text-center">
            {/* The free week (2026-09-04). The headline is the offer — a week
                at $0 — and the price is the second line, stated as what
                happens next rather than what happens now. Both figures are
                still on the card in the first viewport; a trial that hides the
                price it converts to is the shape of a complaint. The charge
                date is printed rather than "in 7 days", for the same reason
                the finish board draws a calendar: a date is an appointment. */}
            {trialEligible ? (
              <>
                <p className="text-2xl font-extrabold text-[#3D3D3D] leading-tight">
                  Your first week is free.
                </p>
                {/* ── Two dated rows, not three sentences (2026-09-04). ──
                    The headline used to be followed by three stacked lines of
                    prose - the "then" price, a dot-separated trio (no charge
                    until / cancel in one tap / money-back guarantee) and the
                    renewal paragraph below the anchor. Four paragraphs to say
                    two things, with "cancel anytime" appearing four times on
                    one screen (here, the trust grid, the small print and the
                    sticky bar) and the guarantee restated 400px above its own
                    green card.

                    A trial offer is two facts with dates on them, so it is
                    laid out as two dated rows and read rather than parsed:
                    today $0, from {chargeDate} the price. The interval and
                    the per-day framing hang off the date row where they
                    belong, and everything her eye needs to compare - $0 vs
                    $59 - is now in one right-hand column. */}
                <dl className="mt-3 overflow-hidden rounded-xl border border-[#EFE2E8] bg-white/70 text-left">
                  <div className="flex items-baseline justify-between gap-3 px-3 py-2">
                    <dt className="text-sm font-semibold text-[#3D3D3D]">Today</dt>
                    <dd className="text-sm font-extrabold tabular-nums text-[#15803D]">$0</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-[#F4EAEF] px-3 py-2">
                    <dt className="text-sm text-[#5A5A5A]">
                      From <b className="text-[#3D3D3D]">{chargeDate}</b>
                      <span className="block text-xs text-[#8A8A8A]">
                        every {PLAN_WEEKS} weeks &middot; about {livePricePerDay} a day
                      </span>
                    </dt>
                    <dd className="shrink-0 whitespace-nowrap text-sm">
                      {!expired && (
                        <span className="mr-1 font-medium text-[#9A9A9A] line-through">
                          {ANCHOR_PRICE}
                        </span>
                      )}
                      <span className="font-extrabold tabular-nums text-[#3D3D3D]">
                        {livePrice}
                      </span>
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <>
                <div className="flex items-baseline justify-center gap-2 flex-wrap">
                  {!expired && (
                    <span className="text-base text-[#9A9A9A] line-through font-medium">
                      {ANCHOR_PRICE}
                    </span>
                  )}
                  <span className="text-3xl font-extrabold text-[#3D3D3D] tabular-nums">
                    {livePrice}
                  </span>
                  <span className="text-sm text-[#5A5A5A] font-medium">
                    for {PLAN_WEEKS} weeks
                  </span>
                </div>
                <p className="mt-1 text-sm font-semibold text-[#5A5A5A]">
                  About {livePricePerDay} a day
                </p>
                {welcomeBack && (
                  <p className="mt-1.5 text-xs text-[#7A7A7A] leading-snug">
                    Welcome back &mdash; your plan starts today at {livePrice}. The free week is for
                    first-time members.
                  </p>
                )}
              </>
            )}

            {/* The only anchor on this card that exists outside this card.

                The strikethrough above it is {@link PLAN_ANCHOR_PRICE} - a
                "regular price" nothing is ever billed at, set at exactly twice
                the real one. It works on some readers and reads as invented to
                the rest, and the rest are the audience this product has: a
                round doubling is the shape of a made-up discount.

                So the price is also anchored against something she can check
                without us. A personal trainer is the right comparison and a
                doctor is the wrong one: the plan sells movement, food and
                wind-down coaching, and the moment the price is framed against a
                consultation the page is implying substitution for medical care -
                which /terms explicitly disclaims and which is not what she is
                buying. US personal training runs $60-100 an hour, so "more than
                the whole {PLAN_WEEKS} weeks" is true at the bottom of the range
                and true by a distance at the top.

                Quiet type, under the number rather than beside it. It is the
                justification she hands herself after she has already decided,
                not an argument competing with the figure. */}
            <p className="mt-1.5 text-xs text-[#5A5A5A]">
              Less than <b className="text-[#3D3D3D]">one hour with a personal trainer</b> — for
              all {PLAN_WEEKS} weeks.
            </p>

            {/* The renewal is stated at the price, not only in the small print
                under the button. She is agreeing to a subscription; burying
                that is how a week-8 charge turns into a chargeback.

                Stated, not headlined (2026-09-03). It was a bold text-sm line -
                the largest type on the card after the price itself - so the
                card read "$59 ... then $59 every 8 weeks" and the renewal was
                the second thing she learned about the offer. A subscription
                disclosure has to be present and legible; it does not have to
                be the argument. One plain line in the card's small type, with
                the notice and the exit in the same sentence.

                It is also repeated under the sticky CTA (see the bar at the
                bottom of this file), and that is deliberate rather than
                redundant: this card scrolls away and the bar does not, so
                without the second copy the renewal is disclosed on a screen she
                may not be looking at when she taps. Stripe's own sheet shows
                subscription terms next to the card field; the first time she
                reads "renews" must not be there. */}
            <p className="mt-2 text-xs text-[#7A7A7A] leading-snug">
              {trialEligible ? (
                <>
                  {/* The amount and the interval are stated in the rows above,
                      so this line is the two things they can't be: the notice
                      and the exit. */}
                  We email you 3 days before your first charge. Cancel any time
                  from your account &mdash; no email, no phone call.
                </>
              ) : (
                <>
                  Renews at {PRICE} every {PLAN_WEEKS} weeks. We email you {RENEWAL_NOTICE_DAYS} days
                  before, and you can cancel anytime.
                </>
              )}
            </p>

            {/* What Stripe will actually accept, shown as the card/wallet marks
                she recognizes. "Stripe secured" tells her the checkout is safe
                but not that her wallet works there - and Apple Pay / Google Pay
                are the difference between one tap and finding a card. */}
            <div className="mt-3 flex justify-center border-t border-[#F0E6E2] pt-3">
              <Image
                src="/badges/payment-methods.webp"
                alt="Visa, Mastercard, Google Pay and Apple Pay accepted"
                width={430}
                height={140}
                className="h-auto w-full max-w-[200px] object-contain"
              />
            </div>
          </div>
        </motion.div>

        {/* What's included - reminds her what she's paying for at the decision point */}
        <div
          className="rounded-2xl border p-4 mb-3"
          style={{
            borderColor: "#f0d071",
            background: "linear-gradient(135deg, rgba(245,197,24,0.08) 0%, rgba(255,235,118,0.12) 50%, rgba(245,197,24,0.06) 100%)",
            boxShadow: "0 0 16px rgba(245,197,24,0.18)",
          }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold text-[#3D3D3D] leading-tight mb-3">
            Everything included <HighlightSweep variant="yellow">for you</HighlightSweep>
          </h2>
          <ul className="space-y-2.5">
            {[
              {
                bold: `Personalized ${PLAN_WEEKS} week plan`,
                sub: "daily movement, nutrition, relaxation & habits",
              },
              { bold: "Lisa", sub: "your 24/7 menopause AI companion" },
              { bold: "Symptom tracking", sub: "with symptom history" },
            ].map((item) => (
              <li key={item.bold} className="flex items-start gap-2.5">
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-yellow-400/90 shrink-0 mt-0.5">
                  <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                </span>
                <span className="text-sm text-[#3D3D3D] leading-snug">
                  <strong>{item.bold}</strong>
                  <span className="text-[#6B6B6B]"> &mdash; {item.sub}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* The list above is three promises; this is the three promises as
              screens that exist. Same treatment as the /register plan card
              (components/PhoneShots.tsx) on purpose — a woman who walked the
              funnel should recognise these as the same product she was just
              shown, and one who landed here cold (the dashboard paywall) gets
              her only look at it before the card.

              The stage crops them and fades to the card's own yellow rather
              than to `--card`, since that is the surface underneath here. */}
          <div className="mt-3.5 -mx-1 overflow-hidden rounded-xl ring-1 ring-yellow-300/50">
            <ShotStage className="h-40" fadeFrom="from-[#FEFAEC]">
              <PhoneShot
                src="/screenshots/screen1.webp"
                alt="Day 1 of your plan in the MenoLisa app"
                rotate={-8}
                className="w-[30%] -mr-3 mt-3"
                width={SHOT_W}
                height={SHOT_H}
              />
              <PhoneShot
                src="/screenshots/screen3.webp"
                alt="Your habits in the MenoLisa app"
                rotate={0}
                delay={0.1}
                className="w-[32%] z-10"
                width={SHOT_W}
                height={SHOT_H}
              />
              <PhoneShot
                src="/screenshots/screen4.webp"
                alt="Streaks and badges in the MenoLisa app"
                rotate={8}
                delay={0.18}
                className="w-[30%] -ml-3 mt-3"
                width={SHOT_W}
                height={SHOT_H}
              />
            </ShotStage>
          </div>
          <p className="mt-2 text-center text-[11px] text-[#8A7F6B] leading-snug">
            Real screens from the app &mdash; yours the moment you join.
          </p>
        </div>

        {/* Trust boxes */}
        <div className="grid grid-cols-2 gap-2 mb-4">
          {trustLabels(livePrice, trialEligible).map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + i * 0.05 }}
                className="rounded-xl border bg-white px-3 py-2.5 shadow-sm"
                style={{ borderColor: "#E8DDD9" }}
              >
                <span
                  className={`inline-flex items-center justify-center w-7 h-7 rounded-full mb-1.5 ${item.bg}`}
                >
                  <Icon className={`w-4 h-4 ${item.fg}`} />
                </span>
                <p className="text-sm font-bold text-[#3D3D3D] leading-tight">{item.title}</p>
                <p className="text-xs text-[#7A7A7A] leading-snug mt-0.5">{item.sub}</p>
              </motion.div>
            );
          })}
        </div>

        {/* The 8-Week Guarantee - identical copy and layout to the diagnosis
            page's guarantee card, restated at the moment of payment. It covers
            exactly one billing period, and it is conditional on adherence: the
            condition is the argument, not fine print. "This works if you do it"
            is a stronger claim than "no questions asked", and it is the only
            version we can afford to honor. */}
        <div
          className="rounded-2xl border-2 border-green-300 bg-green-50 p-4 mb-4"
          style={{ boxShadow: "0 0 0 2px rgba(22,163,74,0.12), 0 8px 28px rgba(22,163,74,0.12)" }}
        >
          <div className="flex flex-col items-center text-center">
            <ShieldCheck className="w-12 h-12 text-green-600 shrink-0 mb-2" />
            <h2 className="text-base font-bold text-green-800 mb-2">
              The {PLAN_WEEKS} Week Guarantee
            </h2>
            <p className="text-sm text-[#3D3D3D] leading-relaxed">
              Follow <b>{PLAN_ADHERENCE_PCT}% of your plan</b> for {PLAN_WEEKS} weeks. If you still
              don’t feel better, we’ll{" "}
              <b className="text-green-700">refund you</b> in full.
            </p>
            <div className="w-16 h-px bg-green-300 my-3" />
            <p className="text-xs text-[#5A5A5A] leading-snug">
              Your plan counts itself as you tick off each day &mdash; nothing to submit, nothing to
              prove. Do the work and the risk is ours.
            </p>
          </div>
        </div>

        {/* Social proof + outcome cards, reused from the /register diagnosis
            screen (components/SocialProof.tsx) so the paywall carries the same
            proof even when reached directly (e.g. a lapsed dashboard user who
            never saw the diagnosis screen this session). */}
        <SocialProofPolaroid />
        <SymptomOutcomeCards topProblems={topProblems} />

        {/* What actually happens when she taps the button.

            The last unanswered objection on this page is not price and not
            trust - both are argued at length above. It is mechanical: she is
            about to pay $59 on a web page for a product that lives in an app
            she has not downloaded, and nothing here has told her how the one
            becomes the other. For a 45-60 audience "will I be able to actually
            set this up" is a real reason not to tap, and it is the cheapest
            objection in the funnel to kill because the answer is three steps
            long and entirely true.

            Deliberately last, at the foot of the scroll. It is the wrong thing
            to lead with (nobody needs setup instructions before they want the
            product) and the right thing to end on: it converts "should I buy
            this" into "what happens next", which is the question of someone who
            has already decided. It also gives a very long page an ending rather
            than a stop.

            Step 3 is the promise the download screen then has to keep - see the
            `download` phase in app/register/page.tsx, which names the email
            Stripe collected and sends her to /get-the-app. Do not write a step
            here that the post-checkout screen does not deliver. */}
        <div className="mb-4 rounded-2xl border border-[#E8DDD9] bg-white px-4 py-3.5">
          <p className="mb-2.5 text-center text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#B5ADA9]">
            What happens next
          </p>
          <ol className="space-y-2.5">
            {[
              {
                Icon: Lock,
                bold: "Secure checkout",
                sub: trialEligible
                  ? `Stripe saves your card — $0 today, nothing until ${chargeDate}.`
                  : "Stripe takes the payment — we never see your card.",
              },
              {
                Icon: Smartphone,
                bold: "Download the app",
                sub: "iPhone or Android. Sign in with the email you just used.",
              },
              {
                Icon: Sunrise,
                bold: "Day 1 is waiting",
                sub: "Your plan is already built. Start it tonight or tomorrow.",
              },
            ].map((step, i) => (
              <li key={step.bold} className="flex items-start gap-2.5">
                <span className="relative mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#16A34A]/10">
                  <step.Icon className="h-3.5 w-3.5 text-[#15803D]" strokeWidth={2.4} />
                  <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#16A34A] text-[9px] font-extrabold text-white">
                    {i + 1}
                  </span>
                </span>
                <span className="min-w-0 text-sm leading-snug text-[#3D3D3D]">
                  <strong>{step.bold}</strong>
                  <span className="block text-xs text-[#6B6B6B]">{step.sub}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-error/30 bg-error/10 p-3 text-sm text-error">
            {error}
          </div>
        )}
      </motion.div>

      {/* Sticky CTA bar - fixed to the bottom on every viewport */}
      <div className="fixed bottom-0 inset-x-0 z-40 border-t border-foreground/10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/85 px-4 pt-3 pb-[calc(10px+env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto w-full">
          <motion.button
            type="button"
            disabled={checkoutLoading}
            onClick={handleCheckoutClick}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            // Green, layered so it reads bright without failing contrast. The
            // base gradient travels through lighter greens (green-600 #16A34A
            // 50%) but keeps its darkest points under the label ends (green-700
            // #15803D at both corners, 4.9:1) so white text stays legible - a
            // fully pale green fill would drop under 4.5:1 everywhere the text
            // sits. On top, a lighter-green gloss highlight (green-400) fades
            // from the top edge, giving the fresh, lit look without touching the
            // text band. /register's pastel CTA can be light because it sits on
            // white; this one sits on a stack of pastel cards, so it stays
            // saturated to read as the one thing to press, and green echoes the
            // refund guarantee card above ("safe to press"). The green glow lifts
            // it off the page as one premium surface.
            className="relative w-full min-h-14 py-4 font-bold text-white rounded-2xl transition-all flex items-center justify-center gap-2 text-base sm:text-base disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden group"
            style={{
              background:
                "linear-gradient(180deg, rgba(134,239,172,0.45) 0%, rgba(134,239,172,0) 46%), linear-gradient(135deg, #15803D 0%, #16A34A 50%, #15803D 100%)",
              boxShadow:
                "0 0 28px rgba(34,197,94,0.50), 0 8px 26px rgba(21,128,61,0.38), 0 2px 8px rgba(21,128,61,0.25)",
            }}
          >
            <span
              aria-hidden
              className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out"
              style={{
                background:
                  "linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.55) 50%, transparent 70%)",
              }}
            />
            {checkoutLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Redirecting to checkout&hellip;
              </>
            ) : (
              <>
                <Lock className="w-4 h-4" />
                {/* The charge, not the per-day slice of it. This label is on
                    screen for the entire ~2000px scroll, so it is the single
                    most-read price on the page - and it used to be the one
                    number Stripe was never going to show her. With the trial
                    the charge today is $0 and the label says what she gets. */}
                {trialEligible ? "Start my free week" : <>Get my plan &middot; {livePrice}</>}
              </>
            )}
          </motion.button>
          {/* The terms she is agreeing to, on the element she agrees with.

              The price card carries the same sentence, but the card scrolls away
              and this bar does not. Stripe's sheet is where subscription terms
              appeared for the first time to anyone who tapped from further down
              the page; that is both a conversion break and the disclosure the
              auto-renewal statutes want made before the charge, not during it.

              One line, plain words, above the trust marks. The order inside it
              changed on 2026-09-03: it read "$59 today, then **$59 every 8
              weeks**. Cancel anytime." - the renewal in the only bold on the
              bar, 20px under the button, for the whole ~2000px of scroll. The
              last thing she reads before tapping was the charge she is most
              afraid of. Risk reversal is a closer, and under the button is the
              closing position, so the guarantee leads (it names the card ~700px
              up rather than restating its condition), the exit is second, and
              the renewal is still on the line - present, legible, unbolded.
              Stripe's sheet and the price card both say it again. */}
          <p className="text-[11px] sm:text-xs text-[#5A5A5A] text-center mt-2 leading-relaxed">
            {trialEligible ? (
              <>
                Reminder {RENEWAL_NOTICE_DAYS} days before &middot;{" "}
                {TRIAL_DAYS} days free &middot;{" "}
                <a href="/terms#free-trial" className="underline">
                  Cancel anytime
                </a>
              </>
            ) : (
              <>
                <b className="text-[#3D3D3D]">{PLAN_WEEKS} week guarantee</b> &middot; Cancel anytime
                &middot; Renews every {PLAN_WEEKS} weeks
              </>
            )}
          </p>
          <p className="text-[11px] sm:text-xs text-[#7A7A7A] text-center mt-1 sm:mt-1.5 leading-relaxed">
            <span className="inline-flex items-center justify-center gap-1 flex-wrap">
              <b>Safe & Secure</b> with
              <Image
                src="/badges/stripe.webp"
                alt="Stripe"
                width={200}
                height={83}
                className="inline-block h-3.5 w-auto align-middle -translate-y-px"
              />
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

/** Banner used for `disputed` users in the dashboard paywall. */
export function DisputedAccountBanner() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-800">
      <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
      <div>
        <strong className="block">Your account is under review.</strong>
        <span>
          A payment dispute was filed. Email{" "}
          <a className="underline" href="mailto:support@menolisa.com">
            support@menolisa.com
          </a>{" "}
          to resolve.
        </span>
      </div>
    </div>
  );
}

/**
 * Why the countdown is safe, and what must not be "fixed".
 *
 * At zero, every figure on this screen moves to the anchor - the badge, the
 * per-day number, the "Billed ... today" line, the trust box and the CTA label -
 * and `handleCheckoutClick` / `onCheckout` do not move at all. There is one
 * Stripe Price ({@link PLAN_PRICE}), so she is charged $59 either side of zero;
 * a Stripe page reading $59 after a paywall reading $118 is meant to feel to her
 * like the discount slipped through.
 *
 * Two properties make that defensible. Any change here has to keep both:
 *
 *  1. **The error is always in her favour.** Displayed >= charged, always. The
 *     page may understate what she pays and must never overstate it, and the
 *     "renews every {PLAN_WEEKS} weeks" + {@link RENEWAL_NOTICE_DAYS} disclosure
 *     sits on both branches. Nobody is out of pocket by a cent - which is what
 *     separates this from the FTC's false-urgency cases, all of which are
 *     overcharges.
 *  2. **Nothing about the money is client-controlled.** The deadline is in
 *     sessionStorage and the clock is hers, so `expired` is trivially forgeable.
 *     That is fine precisely because it buys nothing. Do **not** resolve the
 *     mismatch by selecting a second Stripe Price when `expired` - that inverts
 *     property 1 and lets a user's system clock decide whether she pays double.
 *     Real expiry pricing needs a server-side deadline and a charge derived from
 *     it.
 *
 * What did not come back with the clock is the reclaim button. The 2026-08-12
 * removal was about a timer that visibly reset on one tap, which is the tell
 * that a page is theatre - and doubt on this screen lands on the refund
 * guarantee. Hence {@link DEADLINE_KEY}: a reload does not hand her a fresh ten
 * minutes, and a stored deadline further out than the full window is discarded
 * as tampered.
 */
