# Stripe product — the $1-then-$4.99/week plan

`scripts/stripe-weekly-price.ts` creates and archives everything below, in
whichever mode `STRIPE_SECRET_KEY` is in. Run it once per mode:

```bash
npx tsx --env-file=.env.local scripts/stripe-weekly-price.ts   # test mode (local key)
STRIPE_SECRET_KEY=sk_live_… npx tsx scripts/stripe-weekly-price.ts   # live mode, once
```

It prints the Price ID; put it in `STRIPE_PRICE_WEEKLY` locally and in Vercel.
The variable was renamed from `STRIPE_PRICE_8WEEK` on 2026-09-08 so a deploy
cannot pick up the archived $59 id by mistake.

## What it creates

| Object | Value |
|---|---|
| Product | `MenoLisa 8 Week Plan` (the existing product is reused if its name matches) |
| Price | `$4.99` USD, recurring, **weekly** (`interval = week`, `interval_count = 1`), lookup key `menolisa_weekly_499`. Set as the product's default price. |
| Coupon | id **`OuChKp3c`**, `$3.99` off, `once` — the same id in test and live, so the code (`FIRST_WEEK_COUPON_ID`) never has to know the mode |
| Old price | the $59 / 8-week price is **deactivated, not deleted** — existing subscriptions keep resolving |

`create-checkout` applies the coupon on every session (`discounts`), turns the
promo-code box off, sets no trial, and prints `CHECKOUT_SUBMIT_TEXT` under the
pay button — the same sentence the paywall shows. Every figure derives from
`lib/pricing.ts`; if Stripe and that file ever disagree the script throws.

The weekly interval is read back by the webhook's `planFromSubscription()`:
`interval === "week" && interval_count === 1` → `plan_type = "weekly"`. The
two historical `plan8w` rows still resolve.

## What existing subscribers see

Nothing changes for them. A subscription bills against the price stored on it,
not against whatever the product currently sells.
