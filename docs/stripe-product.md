# Stripe product — the $59 / 8-week plan

Copy for the single product that replaced the retired annual and monthly plans.
The Price ID this produces goes in `STRIPE_PRICE_8WEEK`.

## Product settings

**Name**
```
MenoLisa 8-Week Plan
```

**Description** (shown on the Checkout page, the invoice, and the customer portal)
```
Your personalized 8-week menopause plan — daily movement, nutrition, relaxation and habit steps built around your own symptoms, plus unlimited chat with Lisa, your 24/7 AI menopause companion, and symptom tracking that turns into doctor-ready reports. Renews every 8 weeks. Cancel anytime.
```

**Statement descriptor** (what she sees on her bank statement — keep it
recognizable or you buy yourself chargebacks)
```
MENOLISA
```

**Image** — reuse `public/paywall.webp`.

**Metadata** (optional, but makes Stripe reporting readable)
| Key | Value |
|---|---|
| `plan_id` | `plan8w` |
| `plan_weeks` | `8` |

## Price settings

| Field | Value |
|---|---|
| Pricing model | Standard, recurring |
| Amount | `59.00` USD |
| Billing period | **Custom → every 8 weeks** (`interval = week`, `interval_count = 8`) |
| Free trial | **None** — the card is charged in full at checkout |
| Tax behavior | Match whatever the retired prices used |

The 8-week interval is load-bearing, not cosmetic: the webhook's
`planFromSubscription()` reads `interval === "week" && interval_count === 8` back
off the price to tag the subscription `plan_type = "plan8w"`. A price created as
"every 2 months" instead will be recorded as an unknown plan and drop out of the
admin MRR split.

## After creating it

1. Copy the **Price ID** (`price_…`) into `STRIPE_PRICE_8WEEK` in `.env.local`
   and in Vercel → Project → Settings → Environment Variables.
2. Archive the old prices/products (archive, don't delete — existing
   subscriptions keep billing against them and their renewals still need to
   resolve).
3. Leave the webhook endpoint alone. The event list is unchanged.
4. If `PLAN_PRICE` in `lib/pricing.ts` ever disagrees with the Stripe amount, the
   paywall will quote a price Stripe doesn't charge. Change both together.

## What existing subscribers see

Nothing changes for them. Subscriptions already on the annual or monthly price
keep renewing at that price and interval — Stripe bills against the price stored
on the subscription, not against whatever the product currently sells. The
webhook still maps their `year`/`month` intervals to `annual`/`monthly`, and the
admin panel keeps them in a separate "Legacy plans" bucket. Migrating them to
$59/8 weeks would be a deliberate, separate job (and a price increase for the
annual cohort, so it needs notice).
