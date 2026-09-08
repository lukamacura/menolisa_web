/**
 * Create the $4.99/week price and the $3.99-off-once coupon, and deactivate
 * the old $59 / 8-week price. Idempotent: run it twice and it changes nothing.
 *
 *   npx tsx --env-file=.env.local scripts/stripe-weekly-price.ts
 *
 * It acts on whichever mode STRIPE_SECRET_KEY is in. Run it once against the
 * test key (local), once against the live key (put the live key in the env
 * for that one run), and copy the printed price id into STRIPE_PRICE_WEEKLY
 * in both places. Nothing is deleted — the old price is archived so existing
 * subscriptions keep resolving.
 */
import Stripe from "stripe";
import {
  FIRST_WEEK_COUPON_ID,
  FIRST_WEEK_DISCOUNT,
  WEEKLY_PRICE,
} from "../lib/pricing";

const PRODUCT_NAMES = ["MenoLisa 8 Week Plan", "MenoLisa 8-Week Plan"];
const LOOKUP_KEY = "menolisa_weekly_499";

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
        "Your personalized 8-week menopause plan — daily movement, nutrition, relaxation and habit steps built around your own symptoms, plus Lisa, your 24/7 AI menopause companion, and symptom tracking. Billed weekly. Cancel anytime from the app.",
      statement_descriptor: "MENOLISA",
    });
    console.log(`Created product ${product.id}`);
  } else {
    console.log(`Product: ${product.id} (${product.name})`);
  }

  // Weekly price
  const byKey = await stripe.prices.list({ lookup_keys: [LOOKUP_KEY], limit: 1 });
  let weekly = byKey.data[0];
  if (!weekly) {
    weekly = await stripe.prices.create({
      product: product.id,
      currency: "usd",
      unit_amount: Math.round(WEEKLY_PRICE * 100),
      recurring: { interval: "week", interval_count: 1 },
      nickname: `Weekly ($${WEEKLY_PRICE})`,
      lookup_key: LOOKUP_KEY,
    });
    console.log(`Created weekly price ${weekly.id}`);
  } else {
    console.log(`Weekly price: ${weekly.id}`);
  }
  if (
    weekly.unit_amount !== Math.round(WEEKLY_PRICE * 100) ||
    weekly.recurring?.interval !== "week" ||
    weekly.recurring?.interval_count !== 1
  ) {
    throw new Error(`Price ${weekly.id} does not match lib/pricing.ts — fix one of them`);
  }

  // Coupon: fixed id so code and both modes agree.
  try {
    const c = await stripe.coupons.retrieve(FIRST_WEEK_COUPON_ID);
    if (c.amount_off !== Math.round(FIRST_WEEK_DISCOUNT * 100) || c.duration !== "once") {
      throw new Error(
        `Coupon ${FIRST_WEEK_COUPON_ID} is ${c.amount_off} ${c.duration}, expected ${FIRST_WEEK_DISCOUNT * 100} once`
      );
    }
    console.log(`Coupon: ${c.id} ($${(c.amount_off ?? 0) / 100} off, ${c.duration})`);
  } catch (err) {
    if ((err as Stripe.errors.StripeError).code !== "resource_missing") throw err;
    const c = await stripe.coupons.create({
      id: FIRST_WEEK_COUPON_ID,
      name: "First week $1",
      amount_off: Math.round(FIRST_WEEK_DISCOUNT * 100),
      currency: "usd",
      duration: "once",
    });
    console.log(`Created coupon ${c.id}`);
  }

  // The weekly price becomes the product default first — Stripe refuses to
  // archive a product's default price.
  if (product.default_price !== weekly.id) {
    await stripe.products.update(product.id, { default_price: weekly.id });
    console.log(`Set ${weekly.id} as the product's default price`);
  }

  // Deactivate (never delete) every other active recurring price on the product.
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  for (const p of prices.data) {
    if (p.id === weekly.id) continue;
    await stripe.prices.update(p.id, { active: false });
    console.log(`Deactivated ${p.id} (${p.nickname ?? `${p.unit_amount} / ${p.recurring?.interval_count} ${p.recurring?.interval}`})`);
  }

  console.log(`\nSTRIPE_PRICE_WEEKLY=${weekly.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
