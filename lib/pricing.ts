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
 * - **The money-back guarantee.** Removed 2026-09-09 across the paywall, the
 *   landing page, the FAQ, the welcome email and Terms §11 in one commit.
 *   **A refund promise on a marketing surface and Terms §11 move together, in
 *   both directions.**
 *
 * The risk reversal is no longer "you can cancel" — there is nothing to
 * cancel, which is itself the reassurance. See {@link GUARANTEE_HEADLINE}.
 *
 * Every price shown to a user, and every value reported to Meta, derives from
 * the constants here. Hardcoding a dollar figure in a component is how the
 * paywall and the Stripe receipt drift apart. **The paywall's price line and
 * Stripe Checkout's submit text are built from the same constant** — see
 * {@link PRICE_LINE} and {@link CHECKOUT_SUBMIT_TEXT}.
 *
 * {@link PLAN_ANCHOR_PRICE} is the one figure in this file that is never
 * charged: it is the paywall's strikethrough, and it exists only to make
 * {@link PLAN_PRICE} legible as a discount. See the block on it.
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
 * The struck-through "regular price", in USD.
 *
 * **Display only. Nothing is ever billed at this figure.** Stripe holds
 * exactly one price (`STRIPE_PRICE_PLAN`, {@link PLAN_PRICE}) and charges it on
 * every checkout, whether the countdown on the paywall is still running or ran
 * out an hour ago.
 *
 * The one rule that keeps an anchor and a clock safe: **every figure the page
 * shows is >= what Stripe will charge.** The worst case is then a woman who
 * braced for {@link PLAN_ANCHOR_PRICE} and is charged {@link PLAN_PRICE}.
 * Invert it — a second Stripe Price selected because a client-side timer says
 * "expired" — and her own system clock decides whether she pays double. That is
 * in the "decided against" table in CLAUDE.md and it stays there.
 *
 * Deliberately not a round multiple of {@link PLAN_PRICE}: an anchor at exactly
 * 2x reads as a sticker rather than as a price anything was sold at.
 */
export const PLAN_ANCHOR_PRICE = 50;

/** `29` against `50` → `42`, i.e. "42% OFF". Derived, never typed into copy. */
export const PLAN_DISCOUNT_PCT = Math.round(
  (1 - PLAN_PRICE / PLAN_ANCHOR_PRICE) * 100
);

/**
 * How long the paywall holds {@link PLAN_PRICE} before the countdown reaches
 * zero.
 *
 * **Thirty minutes, and do not shorten it without measuring how long the page
 * takes to read.** It was ten in an earlier life of this screen. The paywall is
 * ~2000px — headline, price card, finish board, week one, the included list,
 * the trust grid, the guarantee, social proof, the what-happens-next strip —
 * read on a phone, in an in-app browser, by a woman in her fifties. She
 * routinely spent longer on it than the window lasted, so the clock was
 * punishing the careful reader, who is the buyer. The return-from-Stripe path
 * made it worse: the deadline is per-tab (see `DEADLINE_KEY` in
 * `components/PaywallView.tsx`), so a woman who opened the card form, hesitated
 * and came back was the likeliest person to find it expired.
 *
 * What expiry does is therefore deliberately small: the band fades out and the
 * price stays {@link PLAN_PRICE}. It never resets (a timer caught resetting
 * takes the rest of the screen's credibility with it) and it never raises a
 * figure she is looking at.
 */
export const PLAN_DISCOUNT_WINDOW_MINUTES = 30;
export const PLAN_DISCOUNT_WINDOW_MS = PLAN_DISCOUNT_WINDOW_MINUTES * 60 * 1000;

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
 * The whole risk reversal. It used to be cancelling; there is nothing to
 * cancel now, and that is strictly better — "you will never be charged again"
 * is a fact about the charge rather than a promise about our behaviour, and it
 * needs no process, no email and no trust.
 */
export const NO_RENEWAL_COPY = `You are never charged again.`;

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
 * ── The guarantee, as she experiences it ──────────────────────────────────
 *
 * There is no money-back guarantee and there has not been one since
 * 2026-09-09. At {@link PLAN_PRICE} a refund clause asks her to imagine
 * emailing us and to picture the product failing, at the moment belief is
 * highest, over an amount she does not need a process to recover.
 *
 * What replaces it is the structure of the offer itself: one charge, no
 * subscription, no renewal. The objection this screen actually has to answer
 * is *"will this quietly keep taking my money?"* — and the honest answer is
 * that it cannot, because there is no second charge to stop.
 *
 * If a refund promise ever comes back here, Terms §11 changes in the same
 * commit. A guarantee printed on the paywall and absent from the Terms is a
 * misrepresentation, and that coupling is why they have moved together every
 * time.
 */
export const GUARANTEE_HEADLINE = `Everything, for one payment of ${formatPrice(PLAN_PRICE)}.`;

/**
 * The row inside the price card, as two halves — the claim and the support —
 * because the card bolds the first and not the second.
 *
 * **It is about speed now, not billing (2026-09-11).** It read "{PRICE} today,
 * and nothing after it. / No auto-renewal, no subscription, no second charge in
 * {PLAN_WEEKS} weeks." — sitting directly beneath a row that already said "No
 * subscription", so the two loudest objects on the price card made the same
 * point twice and the second one used three negations to do it. The row above
 * keeps the objection; this row answers the question she has immediately after
 * it, which is *what do I actually get, and when*. The answer — all of it, now
 * — is the best thing this screen can say and it was not being said anywhere.
 *
 * Two constants rather than one string the component splits on a full stop:
 * there was a single `GUARANTEE_INLINE` here and **nothing imported it**,
 * because the markup needed the halves separately and retyped them instead. An
 * unused export in the file whose whole job is to be the single source is
 * worse than no export — the next edit changes it and no surface moves.
 *
 * Named `UNLOCK_` and not `GUARANTEE_` on purpose: a constant called
 * GUARANTEE that says "everything unlocks now" is the drift this file exists
 * to stop.
 */
export const UNLOCK_INLINE_CLAIM = `Everything unlocks the moment you pay.`;
export const UNLOCK_INLINE_BODY = `Your plan starts building the second the payment lands — day 1 is ready by the time you open the app.`;

/**
 * The body of the full green card, low on the paywall and on the landing page.
 *
 * **The first sentence is bolded by both callers**, so it has to stand alone —
 * and both used to retype it in JSX instead of splitting this string, which is
 * the exact drift this file exists to prevent. {@link GUARANTEE_BODY_HEAD} and
 * {@link GUARANTEE_BODY_TAIL} do the split here, once.
 *
 * This is the designated place for the terms, so it is the one block allowed
 * to close on the billing fact. It carried three negations in one sentence
 * until 2026-09-11 ("we don't keep your card… no subscription to cancel…
 * nothing happens…"); it now spends its length on what {@link PLAN_PRICE} buys
 * and closes on one.
 */
export const GUARANTEE_BODY = `${formatPrice(PLAN_PRICE)} buys the whole ${PLAN_WEEKS} weeks. Every session, every week, Lisa whenever you need her and your symptom tracking — we don't keep your card, and there is no second charge.`;

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
 * are the same sentence.
 */
export const CHECKOUT_SUBMIT_TEXT = `${PRICE_LINE} ${NO_RENEWAL_COPY}`;

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
