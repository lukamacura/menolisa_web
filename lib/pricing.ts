/**
 * The single paid product, in one place.
 *
 * MenoLisa sells one thing: a personalized {@link PLAN_WEEKS}-week plan for
 * {@link PLAN_PRICE}, **charged once** (2026-09-11). It is not a subscription.
 * There is no auto-renewal, no card kept on file for a later charge, and
 * nothing for her to cancel. Access runs {@link PLAN_ACCESS_DAYS} days from
 * purchase and then ends; if she wants another block she comes back and buys
 * one.
 *
 * **One price, one charge, one number.** That is the whole design, and it is a
 * reaction to what came before it:
 *
 * - A $59 block with a free trial (to 2026-09-08).
 * - $1 for the first week, then $4.99/week, on a plan that ran in 8-week
 *   blocks (2026-09-08 → 09-11). Three different durations on one screen: the
 *   paywall spent its largest type reconciling them, Terms §10.1 had to state
 *   outright that "the billing period and the plan block are different
 *   lengths", and `/admin` grew a cohort table whose rows were weeks and whose
 *   columns were also weeks but meant something else. It sold 74 quiz
 *   finishers and two saved cards, both cancelled.
 * - $29 auto-renewing every 8 weeks (2026-09-11, for part of a day).
 *
 * What is gone, deliberately, and must not come back on its own:
 *
 * - **Auto-renewal.** `create-checkout` runs Stripe in `mode: "payment"`. No
 *   Subscription object is created, so `customer.subscription.*` never fires
 *   for a new customer. Re-introducing recurring billing is a Terms change
 *   (§10 currently promises the opposite), not a price change.
 * - **The first-week discount and its coupon.** No `discounts` array.
 * - **The free trial.** `getAccountState()` has never known what a trial is.
 * - **The struck-through anchor and the countdown** (removed 2026-09-12). A
 *   "$50 → $29, 42% off, held for 30:00" block on an app she has never heard
 *   of reads as every scam page on the internet, to a cold 45-60 audience,
 *   and $50 was never a price anything was sold at — a former-price claim
 *   with no former price behind it. Do not bring back a strikethrough unless
 *   the product was genuinely sold at that figure.
 *
 * The risk reversal is the {@link GUARANTEE_DAYS}-day money-back guarantee
 * (back 2026-09-12), stated beside the price, on the sticky bar, on Stripe's
 * own submit text and in full in Terms §11. **A refund promise on a marketing
 * surface and Terms §11 move together, in both directions.** See
 * {@link GUARANTEE_HEADLINE}.
 *
 * Every price shown to a user, and every value reported to Meta, derives from
 * the constants here. Hardcoding a dollar figure in a component is how the
 * paywall and the Stripe receipt drift apart. **The paywall's price line and
 * Stripe Checkout's submit text are built from the same constant** — see
 * {@link PRICE_LINE} and {@link CHECKOUT_SUBMIT_TEXT}.
 *
 * Stripe side (`scripts/stripe-plan-price.ts` creates it):
 *   - Price: $29 USD, **one-time** (no `recurring`) → `STRIPE_PRICE_PLAN`.
 *   - No coupon, no trial, no promo-code box.
 */

/** Wire value for `plan` in POST /api/stripe/create-checkout and in Meta events. */
export const PLAN_ID = "plan8w" as const;
export type PlanId = typeof PLAN_ID;

/** Length of one plan block — and of the access one payment buys. */
export const PLAN_WEEKS = 8;

/**
 * What she pays, once, in USD. Must match the `unit_amount` on
 * `STRIPE_PRICE_PLAN`; `scripts/stripe-plan-price.ts` throws if they disagree.
 */
export const PLAN_PRICE = 29;

/**
 * The money-back window, in days from the day she paid (2026-09-12).
 *
 * Unconditional inside the window: no reason, no proof of use, one email.
 * Terms §11 states it in full and imports this constant, so the paywall, the
 * landing page, the FAQ, the welcome email, Stripe's submit text and the
 * contract cannot disagree about the number.
 *
 * Seven days (owner's call, 2026-09-12; it shipped at 30 for a few hours).
 * Long enough to open the app, see the plan her answers built and try week 1;
 * short enough that a refund cannot be claimed after most of the 56 days have
 * been used. Note the trade-off: weeks 1-2 are the plan's lightest (75-92% of
 * the sold session length), so she judges it on its gentlest week.
 */
export const GUARANTEE_DAYS = 7;

/**
 * Where a refund is requested, and **the** support address - not just the one
 * every buying surface names.
 *
 * Terms §11 makes this email the whole of the claim process, so it has to be
 * the same address everywhere a promise about money is made. Until 2026-09-12
 * it was one of three: `support@macurasolutions.us` here and in Terms,
 * `menolisahelp@gmail.com` on the download screen, `support@menolisa.com` in
 * the dispute banner and the billing-portal error. Two of those three were
 * printed *next to a contractual promise* - a refund claim sent to an address
 * nobody reads is a guarantee that does not exist, and she has no way to tell
 * which of the three is the real one.
 *
 * So every surface imports this, including /privacy and /contact, which used
 * to hold their own copies. Same rule as the price: one constant, no second
 * spelling for the next edit to miss.
 */
export const SUPPORT_EMAIL = "menolisahelp@gmail.com";

/**
 * How long one payment buys, in days.
 *
 * This is **the** access boundary now. Under the subscription plans Stripe
 * supplied a period end and this was only a fail-closed fallback; a one-time
 * payment has no period at all, so every paid row's `subscription_ends_at` is
 * computed from this and nothing else. Change it and you change what everyone
 * who pays from that moment on actually gets.
 */
export const PLAN_ACCESS_DAYS = PLAN_WEEKS * 7;

/** `59` → `"$59"`, `4.99` → `"$4.99"`. Whole dollars lose the pointless `.00`. */
export function formatPrice(amount: number): string {
  return `$${amount % 1 === 0 ? amount.toFixed(0) : amount.toFixed(2)}`;
}

/**
 * The offer, in the words the paywall and Stripe Checkout both use. One string,
 * two surfaces — {@link CHECKOUT_SUBMIT_TEXT} opens on this exact sentence, so
 * the last thing she reads on our page and the last thing she reads on Stripe's
 * are the same. Change it here or it is no longer true that they match.
 *
 * **This is the one place on the paywall the "not a subscription" fact is sold
 * rather than merely disclosed**, because the sticky bar is the only element on
 * screen when she taps — the price card has scrolled away by then. It said
 * "No subscription, no auto-renewal." until 2026-09-11, i.e. two negations out
 * of two sentences, on a page that went on to repeat them five more times.
 * One negation, and the space it freed goes to what the money buys. See the
 * note on repetition above {@link PRICE_SUBLINE}.
 */
export const PRICE_LINE = `${formatPrice(PLAN_PRICE)} once for your full ${PLAN_WEEKS}-week plan — everything included, no subscription.`;

/**
 * ── The rule these strings are written to (2026-09-11) ────────────────────
 *
 * **"Not a subscription" is stated once per screen, at the point of
 * commitment. Every other slot names what she gets.**
 *
 * The funnel had drifted the other way. One paywall carried the fact seven
 * times — the price-card row, the green row under it, this subline,
 * {@link PLAN_BLOCKS_COPY}, a trust-grid tile, the full green card, and the
 * sticky bar — plus twice more on the screen before it and twice more after
 * she had already paid. Two things go wrong when a negation is repeated that
 * often, and they compound:
 *
 * - **It is paid for in the only currency this page has.** Every line spent
 *   saying what will not happen is a line not spent on the plan, Lisa, or the
 *   tracker. She is deciding whether to buy something, and the page kept
 *   describing what it isn't.
 * - **Repetition plants the doubt it answers.** Nobody says "no subscription"
 *   six times about a product with no subscription. Said once beside the
 *   price it is a fact; said six times it reads as a page protesting, and the
 *   doubt lands on every other claim near it.
 *
 * So the fact lives in exactly two places: beside the number on the price card
 * (where the objection actually fires) and in {@link PRICE_LINE} on the sticky
 * bar and the Stripe sheet (where she commits, and where it doubles as
 * disclosure). Everything else here sells the deliverable.
 *
 * The line under the price, on the paywall — and now the deliverable rather
 * than a third phrasing of the same negation.
 */
export const PRICE_SUBLINE = `Your plan, Lisa and your symptom tracking unlock the moment you pay.`;

/**
 * ── The guarantee, as she experiences it (back 2026-09-12) ────────────────
 *
 * It was removed on 2026-09-09 on the argument that a refund clause makes her
 * picture the product failing. That argument holds for a warm buyer. It does
 * not hold for this traffic: a cold Instagram click, paying an unknown brand
 * on a web page for an app she has not seen, in women's health, where trust
 * is the whole sale. For her the question is not "will it work?" but "is this
 * a scam, and am I stuck if it is?" — and "no subscription" answers only the
 * second half. A money-back guarantee answers both, and it is the only
 * reassurance on the page she can check against a contract (Terms §11).
 *
 * Where it is stated, and why each place:
 *  - beside the price, in the price card — where the objection fires;
 *  - on the sticky bar and in Stripe's submit text ({@link CHECKOUT_SUBMIT_TEXT})
 *    — where she commits;
 *  - in the full green card low on the page — the terms, with a link to §11.
 *
 * **Terms §11 changes in the same commit as any change here.** A guarantee
 * printed on the paywall and absent from the Terms is a misrepresentation.
 */
export const GUARANTEE_HEADLINE = `${GUARANTEE_DAYS}-day money-back guarantee`;

/** The support line under the guarantee row in the price card. */
export const GUARANTEE_INLINE_BODY = `Not right for you? Email us within ${GUARANTEE_DAYS} days of paying and get all ${formatPrice(PLAN_PRICE)} back. No questions asked.`;

/**
 * The body of the full green card, low on the paywall and on the landing page.
 *
 * **The first sentence is bolded by both callers**, so it has to stand alone.
 * {@link GUARANTEE_BODY_HEAD} and {@link GUARANTEE_BODY_TAIL} do the split
 * here, once, so no caller retypes half of it in JSX.
 */
export const GUARANTEE_BODY = `If it isn't right for you, you get all ${formatPrice(PLAN_PRICE)} back. Email ${SUPPORT_EMAIL} within ${GUARANTEE_DAYS} days of paying — no reason needed, no forms — and the refund goes back to the way you paid.`;

/** The bolded opening clause of {@link GUARANTEE_BODY}. Split here, not in JSX. */
export const GUARANTEE_BODY_HEAD = GUARANTEE_BODY.slice(0, GUARANTEE_BODY.indexOf(". ") + 1);
/** Everything after it, run plain. */
export const GUARANTEE_BODY_TAIL = GUARANTEE_BODY.slice(GUARANTEE_BODY.indexOf(". ") + 2);

/**
 * What happens at the end — the answer to the one question the paywall's
 * headline raises and nothing else on the page answers: **what happens after
 * week {@link PLAN_WEEKS}?**
 *
 * Under the subscription plans this said the plan rebuilds itself and the next
 * block starts. It does not any more, and **saying so is not optional**: the
 * headline promises her outcome "{@link PLAN_WEEKS} weeks from now", so a
 * screen that left the ending unstated would be selling an open-ended product
 * she has not bought. A woman who discovers on day 57 that access has stopped,
 * having never been told, is a chargeback and a one-star review.
 *
 * It stays **disclosure, not a pitch**: small, centred and muted, below the
 * price and below Week 1. A comprehension task never goes in front of a
 * decision — it sat directly above the price until 2026-09-08 and was the last
 * thing she read before the number.
 *
 * The two negations it used to open on ("There's no subscription and no
 * auto-renewal, so…") are gone: by the time she reaches this paragraph the
 * price card has already made that point twice, and the sentence works without
 * them — the ending is disclosed either way.
 *
 * **The freed clause was not refilled, and that is the point.** Two rewrites
 * tried: naming the plan/Lisa/tracker triplet (already said by the price-card
 * row, by {@link PRICE_SUBLINE} and by the "Everything included" block — a
 * deliverable repeated four times is the negation problem in better clothes),
 * and "each week built on what you actually did" (which is the sentence
 * <WeekOneCard /> prints directly above this paragraph). This block is
 * disclosure. Disclosure that is also trying to sell reads as a disclaimer
 * being softened, so it stays two short sentences and nothing else.
 */
export const PLAN_BLOCKS_COPY = `Your ${PLAN_WEEKS} weeks start the day you join and run for ${PLAN_ACCESS_DAYS} days. When they are up your access ends, and you come back for another block only if you want one.`;

/**
 * Stripe Checkout `custom_text.submit`. Opens on {@link PRICE_LINE} verbatim so
 * the last thing she reads on our page and the last thing she reads on Stripe's
 * are the same sentence, and closes on the guarantee, because the Stripe sheet
 * is where the card goes in and the fear peaks.
 */
export const CHECKOUT_SUBMIT_TEXT = `${PRICE_LINE} ${GUARANTEE_HEADLINE}.`;

/**
 * What {@link PLAN_PRICE} buys, one row per thing she will open in the app.
 * Shared by the paywall ("What you get for $29") and the landing page. Each
 * line is checkable against the code, and must stay that way:
 *  - the plan: four pillars (lib/planPillars.ts) over PLAN_WEEKS weeks, built
 *    from her quiz answers, each week built on what she logged (history.ts);
 *  - the workouts: MOVEMENT_VOLUME sessions by level, daily walks from
 *    CARDIO_VOLUME, and an `exercise-clips` video on every move that has one
 *    (the walks, K01/K02, deliberately have none - hence "form", not "every");
 *  - breathing: the RELAXATION rows in lib/plan/catalog.ts, whose `use` lines
 *    are exactly these moments;
 *  - Lisa: /api/langchain-rag, disclosed as AI, safety-validated;
 *  - tracker + weekly recap: /api/symptom-logs and /api/cron/weekly-recap;
 *  - the doctor report: /api/doctor-report.
 * Do not add a row for a feature that does not ship.
 */
export const WHAT_YOU_GET: ReadonlyArray<{ bold: string; sub: string }> = [
  {
    bold: `Your ${PLAN_WEEKS}-week plan, built from your answers`,
    sub: "A short daily checklist for movement, food, calm and sleep - and each week builds on what you actually did.",
  },
  {
    bold: "Guided workouts at your level",
    sub: "Strength sessions and daily walks, with a short video for each move so you're never guessing at form.",
  },
  {
    bold: "Breathing for the hard moments",
    sub: "Timed exercises for a hot flash coming on, a 3am wake-up or a racing heart - plus a wind-down for bed.",
  },
  {
    bold: "Lisa, your AI menopause coach, 24/7",
    sub: "Ask anything and get a plain-English answer - and she'll tell you when it's one for your doctor.",
  },
  {
    bold: "Symptom tracker and a weekly recap",
    sub: "Log how you feel in seconds, and see your week's patterns every Sunday.",
  },
  {
    bold: "A report for your doctor",
    sub: "Your symptoms, summarised and ready to share at your next appointment.",
  },
];

export function isPlanId(value: unknown): value is PlanId {
  return value === PLAN_ID;
}

/**
 * `Sep 11` — or `Jan 3, 2027` once the year turns, so a December date never
 * reads as already past. US format: the campaign is US-only.
 */
export function formatChargeDate(d: Date, now: Date = new Date()): string {
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
