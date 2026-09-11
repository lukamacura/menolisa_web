# Stripe product — the $29 one-time, 8-week plan

**It is not a subscription.** One charge of $29 buys 8 weeks of access and
nothing renews: Checkout runs in `mode: "payment"`, no Subscription object is
created, and `customer.subscription.*` never fires for a new customer.

`scripts/stripe-plan-price.ts` creates and archives everything below, in
whichever mode `STRIPE_SECRET_KEY` is in. Run it once per mode:

```bash
npx tsx --env-file=.env.local scripts/stripe-plan-price.ts   # test mode (local key)
STRIPE_SECRET_KEY=sk_live_… npx tsx scripts/stripe-plan-price.ts   # live mode, once
```

It prints the Price ID; put it in `STRIPE_PRICE_PLAN` locally and in Vercel.
**Vercel does not apply an env change until you redeploy.**

The variable name has changed twice and neither old name is reused:
`STRIPE_PRICE_8WEEK` held the archived $59 price and `STRIPE_PRICE_WEEKLY` the
archived $4.99 weekly one. A stale value under a reused name charges a figure no
surface prints — the one payment bug a customer discovers on her statement
rather than on the page.

## What it creates

| Object | Value |
|---|---|
| Product | `MenoLisa 8 Week Plan` (the existing product is reused if its name matches) |
| Price | `$29` USD, **one-time — no `recurring` block**, lookup key `menolisa_plan8w_once_29`. Set as the product's default price. |
| Coupon | **none** |
| Old prices | every other active price on the product is **deactivated, not deleted** — existing subscriptions keep resolving |

A recurring price here is rejected by Checkout in payment mode, so the script
throws if `recurring` is present.

## What `create-checkout` sends

- `mode: "payment"` — one charge, no subscription.
- `customer_creation: "always"` — **required.** Payment mode creates no Customer
  by default, and without one a purchase leaves no record to look up in support
  and nothing for `/admin` to attribute a charge to.
- `payment_intent_data.metadata.product` — the product boundary. The Stripe
  account is shared, and with no subscription to key off this is the only way
  `/admin` can tell MenoLisa's charges from another product's.
- No `discounts`, no trial, promo-code box off.
- `custom_text.submit` — `CHECKOUT_SUBMIT_TEXT`, the same sentence the paywall
  shows. Every figure derives from `lib/pricing.ts`.

## Access

Stripe supplies no period end for a one-time payment, so **we compute the
cutoff**: `fulfillCheckout` writes `subscription_ends_at = now +
PLAN_ACCESS_DAYS` (56 days). Nothing later overwrites it, because no renewal
webhook is coming. `getAccountState()` fails closed on a `paid` row with no
cutoff, so that write is what stands between a paying customer and a lockout.

## What existing subscribers see

Nothing changes for them. A subscription bills against the price stored on it,
not against whatever the product currently sells — so the weekly subscribers
keep being billed $4.99 a week, and the two `plan8w` rows keep their 8-week
cycle, until they cancel or are migrated by hand. `plan_type = "weekly"` is
still handled everywhere, including its 7-day fallback period.
