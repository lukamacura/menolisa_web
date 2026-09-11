/**
 * Create the $29 **one-time** price and archive every other price on the
 * product. Idempotent: run it twice and it changes nothing.
 *
 *   npx tsx --env-file=.env.local scripts/stripe-plan-price.ts
 *
 * It acts on whichever mode STRIPE_SECRET_KEY is in. Run it once against the
 * test key (local), once against the live key (put the live key in the env for
 * that one run), and copy the printed price id into STRIPE_PRICE_PLAN in both
 * places. Nothing is deleted — old prices are archived so existing
 * subscriptions keep resolving against the price stored on them.
 *
 * **It creates no coupon and no recurring price.** The product is a single
 * $29 charge that buys 8 weeks of access; `create-checkout` runs Stripe in
 * `mode: "payment"`, so a price with a `recurring` block would be rejected
 * outright. The old `OuChKp3c` coupon is left alone in Stripe — nothing
 * references it, and deleting a coupon that historical invoices point at buys
 * nothing.
 *
 * The archived prices (the $59 block, the $4.99 weekly) stay archived rather
 * than deleted: existing subscriptions still bill against the price stored on
 * them.
 */
import Stripe from "stripe";
import { PLAN_PRICE, PLAN_WEEKS } from "../lib/pricing";

const PRODUCT_NAMES = ["MenoLisa 8 Week Plan", "MenoLisa 8-Week Plan"];
const LOOKUP_KEY = `menolisa_plan${PLAN_WEEKS}w_once_${PLAN_PRICE}`;

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
  const stripe = new Stripe(key);
  const live = key.startsWith("sk_live_");
  console.log(`Mode: ${live ? "LIVE" : "test"}`);

  // Product
  const products = await stripe.products.list({ limit: 100, active: true });
  let product = products.data.find((p) => PRODUCT_NAMES.includes(p.name));
  if (!product) {
    product = await stripe.products.create({
      name: PRODUCT_NAMES[0],
      description:
        `Your personalized ${PLAN_WEEKS}-week menopause plan — daily movement, nutrition, relaxation and habit steps built around your own symptoms, plus Lisa, your 24/7 AI menopause companion, and symptom tracking. One payment, ${PLAN_WEEKS} weeks of access. No subscription.`,
      statement_descriptor: "MENOLISA",
    });
    console.log(`Created product ${product.id}`);
  } else {
    console.log(`Product: ${product.id} (${product.name})`);
  }

  // The plan price: one charge, no `recurring` block at all.
  const byKey = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], limit: 1 });
  let plan = byKey.data[0];
  if (!plan) {
    plan = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: Math.round(PLAN_PRICE * 100),
      nickname: `${PLAN_WEEKS}-week plan, one-time ($${PLAN_PRICE})`,
      lookup_key: LOOKUP_KEY,
    });
    console.log(`Created one-time price ${plan.id}`);
  } else {
    console.log(`Plan price: ${plan.id}`);
  }
  // `recurring` must be absent. A recurring price here is rejected by Checkout
  // in payment mode, which is a 500 on the card form rather than a wrong
  // charge — loud, but only once someone taps.
  if (plan.unit_amount !== Math.round(PLAN_PRICE * 100) || plan.recurring) {
    throw new Error(
      `Price ${plan.id} does not match lib/pricing.ts (expected a one-time ${PLAN_PRICE * 100} price) — fix one of them`
    );
  }

  // The plan price becomes the product default first — Stripe refuses to
  // archive a product's default price.
  if (product.default_price !== plan.id) {
    await stripe.products.update(product.id, { default_price: plan.id });
    console.log(`Set ${plan.id} as the product's default price`);
  }

  // Deactivate (never delete) every other active price on the product — the
  // $59 block price, the $4.99 weekly price and the short-lived $29 recurring
  // one all live here.
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  for (const p of prices.data) {
    if (p.id === plan.id) continue;
    await stripe.prices.update(p.id, { active: false });
    console.log(
      `Deactivated ${p.id} (${p.nickname ?? `${p.unit_amount} / ${p.recurring?.interval_count} ${p.recurring?.interval}`})`
    );
  }

  console.log(`\nSTRIPE_PRICE_PLAN=${plan.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
