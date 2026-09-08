# Weekly plan: $1 first week, then $4.99/week — trial removed, funnel instrumented to the bank

## Stripe
- New price `$4.99` USD recurring weekly on the product, set as its default; coupon **`OuChKp3c`** ($3.99 off, once) applied on every Checkout Session (`discounts`); no promo-code box (`allow_promotion_codes` cannot be sent alongside `discounts` — Stripe rejects it); no `trial_period_days`; `custom_text.submit` = "First week $1, then $4.99/week. Cancel anytime from the app. 14-day money-back guarantee."; `adaptive_pricing` off so a non-US visitor never sees "RSD 523.87 per week" against a paywall that said $4.99.
- Old $59 / 8-week price deactivated (not deleted). All of it is `scripts/stripe-weekly-price.ts`, idempotent, run once per mode. **Done in test mode. Live mode still needs one run with the live key, then `STRIPE_PRICE_WEEKLY` in Vercel** (renamed from `STRIPE_PRICE_8WEEK` on purpose).

![Stripe Checkout, fresh headless context](https://github.com/lukamacura/menolisa_web/blob/weekly-plan/docs/pr/2026-09-08-weekly-plan/stripe-checkout-incognito.png?raw=true)

## Paywall (`components/PaywallView.tsx`, rewritten)
Price line and sub-line are `PRICE_LINE` / `PRICE_SUBLINE` from `lib/pricing.ts`, the same constants Stripe's submit text is built from. Week 1 of her plan (her symptom, her goal, the four day-one tasks) sits above the price; the 8-week-blocks paragraph sits above the price card; countdown, anchor price and trial branches are gone; 14-day money-back card; exit question (30s idle or cursor-leaves-top, once per tab).

![Paywall](https://github.com/lukamacura/menolisa_web/blob/weekly-plan/docs/pr/2026-09-08-weekly-plan/paywall-full.png?raw=true)
![Exit question](https://github.com/lukamacura/menolisa_web/blob/weekly-plan/docs/pr/2026-09-08-weekly-plan/paywall-exit-question.png?raw=true)

## Name step (Q13)
Could not reproduce on a physical device (no iOS Safari / Android Chrome available here; Playwright's iPhone 13 and Pixel 5 emulations both advance cleanly and cannot show the software keyboard). Per the brief's fallback: the name is optional, "Skip for now" is the CTA when the box is empty, and the app collects it after purchase (`docs/mobile-app-changes.md` §26; `save-quiz` now writes only the keys it is sent on an update).

![iPhone 13](https://github.com/lukamacura/menolisa_web/blob/weekly-plan/docs/pr/2026-09-08-weekly-plan/name-step-iphone13.png?raw=true)
![Pixel 5, input focused](https://github.com/lukamacura/menolisa_web/blob/weekly-plan/docs/pr/2026-09-08-weekly-plan/name-step-pixel5-focused.png?raw=true)

## Email capture, tracking, funnel_events
- Results screen: optional "Save your results and plan." → `POST /api/auth/save-email` → `user_profiles.email` (never bound to `auth.users`; Stripe's address stays the login).
- Meta: `ViewContent` once per woman on the paywall, `InitiateCheckout` on the Checkout redirect, `Purchase` server-only from the webhook at `session.amount_total` ($1.00). `MetaPurchaseTracker` and `Subscribe` deleted.
- `funnel_events`: `checkout_opened`, `purchase_completed`, `subscription_canceled`, `payment_failed`, `paywall_exit` (+`detail`), keyed to the visit via `funnel_session_id` on Stripe metadata. `is_test` on `funnel_events` and `user_profiles`; `?qa=1` flags the whole chain; 10 existing test profiles and their visits flagged.

## /admin
Funnel by day (entered → Q2 → finished → paywall → checkout opened → paid, % lost per step), subscriptions by cohort week with week 1→2→3 retention, exit-question distribution, tests excluded everywhere.

![Admin after the $1 test purchase](https://github.com/lukamacura/menolisa_web/blob/weekly-plan/docs/pr/2026-09-08-weekly-plan/admin-after-test-purchase.png?raw=true)

## Verified (test mode)
Fresh headless Chromium → `/register` → 13 questions → results (email saved) → paywall → Stripe shows **$1.00** and **Then $4.99 per week starting next week** → 4242 card → `/register?phase=download` → `user_trials` paid / `plan_type weekly` / `plan_amount 499`, `funnel_events` `checkout_opened` + `purchase_completed`, sale visible on `/admin` → charge refunded, subscription cancelled; `customer.subscription.deleted` and `invoice.payment_failed` replayed against the local webhook (signed) → `subscription_canceled` / `payment_failed` rows. Migration `scripts/sql/2026-09-08-weekly-plan.sql` applied to the live database.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_016tEbbnnxzJv6Rg4hYJXUv2
