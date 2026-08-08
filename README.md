This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Stripe (Payments)

Checkout uses Stripe. Set these in `.env.local` (and in Vercel for production):

- `STRIPE_SECRET_KEY` – Stripe secret key (test or live)
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` – Publishable key (optional for hosted Checkout)
- `STRIPE_PRICE_8WEEK` – Price ID for the $59 / 8-week plan (e.g. `price_xxx`)

Get the **Price ID** from Stripe Dashboard → Products → open the product → copy the Price ID.
The price must be recurring with `interval = week` and `interval_count = 8`; the webhook reads
that interval back to tag the subscription as `plan8w`, so a price with any other interval will
be recorded as an unknown plan. There is one plan and no free trial — the card is charged in
full at checkout. Prices shown in the UI come from `lib/pricing.ts`; keep `PLAN_PRICE` in sync
with the Stripe price.

**Webhook (required for marking users as paid and adding subscription period):**

1. In Stripe Dashboard → Developers → Webhooks → Add endpoint.
2. URL must be the **same domain your users actually use** (e.g. `https://menolisa.com/api/stripe/webhook`). If the webhook points at a different or broken domain, payments will succeed but users will not be marked as paid and will not get access.
3. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copy the **Signing secret** and set `STRIPE_WEBHOOK_SECRET` in your env.

For local testing use [Stripe CLI](https://stripe.com/docs/stripe-cli): `stripe listen --forward-to localhost:3000/api/stripe/webhook` and use the printed signing secret.

**Redirects:** After checkout, users are sent back to the same origin they started from (e.g. your app at menolisa.com → back to menolisa.com/dashboard). Ensure your app domain is in the allowed list (menolisa.com, localhost, or set `NEXT_PUBLIC_SITE_URL`).

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
