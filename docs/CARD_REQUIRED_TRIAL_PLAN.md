# Plan: Card-Required Free Trial in Registration Funnel

## Context

Today, the register flow is: quiz → email gate (creates account + free trial via `/api/auth/save-quiz`) → results → **download** (links to mobile app + dashboard). No card is collected. Users get a free 3-day trial with `trial_days: 3` written into `user_trials`, and the Stripe paywall only appears later via `PricingModal` once the trial expires.

We're tightening the funnel: a **credit card is now required** to start the free trial, using Stripe's built-in `subscription_data.trial_period_days`. This shifts to a "free-trial-with-card" model — higher intent at top of funnel, automatic conversion to paid at trial end, and lower CAC waste on tire-kickers. Goal labels like **"Cancel anytime"** / **"Cancel in 2 clicks"** must appear prominently to reduce signup friction.

**Decisions (from clarifying Qs):**
- Card collection sits **after the results page**, replacing the current `download` phase.
- Offer **both monthly and annual** plans (annual recommended), matching existing `PricingModal` UX.
- Keep **3-day trial** length.

## Approach

Insert a new `paywall` phase in `app/register/page.tsx` between `results` and `download`. The CTA on the results page changes from "Continue" to "Start my free trial" and triggers Stripe Checkout with `trial_period_days: 3` and `payment_method_collection: "always"`. On Stripe success, user is redirected back to `/register?phase=download` (existing download phase preserved). The previous "skip-to-dashboard" path is removed — card is **mandatory**.

### Why Stripe Checkout (hosted) over embedded Elements

- Already wired (`/api/stripe/create-checkout/route.ts` works for the post-trial paywall).
- PCI scope = zero (hosted page).
- Reuses existing webhook → `writeSubscription` path; `subscription.status === "trialing"` already maps to `account_status: "paid"` in `handleSubscriptionUpsert` (route.ts:175,185), which is what we want for trial users.
- Trade-off: extra redirect hop. Acceptable on web; acceptable for mobile because the existing flow already redirects to app stores afterward.

### Files to modify

1. **`app/api/stripe/create-checkout/route.ts`** — Add trial parameters to the Stripe session:
   - `subscription_data.trial_period_days = 3`
   - `subscription_data.trial_settings = { end_behavior: { missing_payment_method: "cancel" } }`
   - `payment_method_collection = "always"` (forces card capture even with trial)
   - Accept new optional body field `from_registration: true` so we can route success back to `/register?phase=download` (otherwise default `/checkout/success` stays for the existing post-trial paywall).
   - Keep existing referral coupon + double-subscribe guard logic untouched.

2. **`app/api/auth/save-quiz/route.ts`** (lines 99–114) — Stop pre-creating `account_status: "trial"` rows with `trial_days: 3`. Instead, insert a row with `account_status: "pending_payment"` (or similar sentinel) so `checkTrialExpired` immediately gates the dashboard until Stripe webhook flips it to `"paid"`. This prevents users who abandon the Stripe redirect from getting free dashboard access.
   - Verify `lib/checkTrialStatus.ts` treats unknown/non-paid statuses as expired (read it during impl; if not, add explicit check).

3. **`app/register/page.tsx`** — Three changes:
   - **Phase enum**: add `"paywall"` between `results` and `download`.
   - **Results page CTA** (around line 1150–1250 area, the "Next/Continue" button after results render): change label to **"Start my free trial"** and onClick → `setPhase("paywall")`.
   - **New `paywall` phase render block** (insert before existing `download` block at line 1352): plan toggle (Monthly/Annual), price display, "Start free trial" button → `POST /api/stripe/create-checkout` with `{ plan, from_registration: true, success_url: "${origin}/register?phase=download", cancel_url: "${origin}/register?phase=paywall" }`, then `window.location.href = data.url`.
     - Reuse copy/structure from `components/PricingModal.tsx` lines 380–430 (already has "Cancel anytime"/billed monthly labels).
     - Add prominent trust labels: **"Cancel anytime"**, **"Cancel in 2 clicks"**, **"Free for 3 days, then $X/mo"**, lock icon + "Secured by Stripe".
   - **URL param handling on mount**: read `?phase=download` (Stripe success return) and skip directly into download phase.
   - Remove the "Continue to web dashboard instead" link (lines 1399–1405) in `download` phase if we want to enforce card; or keep it — but `checkTrialExpired` will now block dashboard access anyway, so it's fine to leave.

4. **`app/api/stripe/webhook/route.ts`** — No code change needed. `handleSubscriptionUpsert` already handles `trialing` status → `account_status: "paid"` (line 175,185). Verify during implementation that `customer.subscription.created` is in the listened-events list; if not, add it. Also confirm `checkout.session.completed` fires correctly when a session completes with a trial (Stripe does fire it).

5. **`lib/checkTrialStatus.ts`** — Verify it returns expired/blocked for `account_status: "pending_payment"` so the dashboard is gated until webhook lands. If not, add the case.

### Edge cases to handle

- **User abandons Stripe Checkout**: account exists but `account_status: "pending_payment"`. Login → redirected to `/register?phase=paywall` (or just blocks dashboard via existing paywall enforcement). The `cancel_url` already returns to `/register?phase=paywall`.
- **Webhook delay**: success_url lands user on download phase before `account_status` is flipped. `handleCheckoutSessionCompleted` is synchronous-ish; Stripe usually delivers within seconds. Acceptable race — dashboard polls trial state on mount.
- **Existing free-trial users (already in `user_trials` with `trial`)**: don't migrate them. Only new signups go through the card-required path. Old users keep their grandfathered free trial until it expires and `PricingModal` triggers.
- **Mobile app users hitting these endpoints**: `from_registration` flag + `success_url`/`cancel_url` are explicit, so mobile flow is unaffected.

### Copy / labels (final)

Trust strip on paywall phase:
- ✓ **Cancel anytime**
- ✓ **Cancel in 2 clicks** — *Settings → Subscription → Cancel*
- ✓ **3 days free**, then $X/month
- 🔒 **Secured by Stripe**

CTA button: **"Start my 3-day free trial"** (subdued: *"You won't be charged today."*)

## Verification

1. `npm run dev`, walk through `/register` quiz → email gate → results → click "Start free trial" → Stripe Checkout → use Stripe test card `4242 4242 4242 4242`.
2. Confirm redirect lands on `/register?phase=download`.
3. In Supabase, `user_trials` row should have `account_status: "paid"`, `provider: "stripe"`, `stripe_subscription_id`, `subscription_ends_at` ≈ trial_end.
4. In Stripe dashboard, subscription status = `trialing`, trial_end = +3 days.
5. Cancel from Stripe portal → verify `subscription_canceled: true` in DB and dashboard still works until `subscription_ends_at`.
6. Test abandoned-checkout: cancel out → confirm `/dashboard` blocks via paywall.
7. Test existing user: log in with a pre-migration account, confirm flow is undisturbed.
8. Local Stripe webhook: `stripe listen --forward-to localhost:3000/api/stripe/webhook` during the test.
