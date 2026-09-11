/**
 * How /admin tells MenoLisa's money apart from every other product's.
 *
 * **The Stripe account is shared.** `charges.list()` returns every business's
 * income, and nothing on the admin panel may read it raw — account-wide
 * figures presented as MenoLisa revenue are worse than no figures at all.
 *
 * The boundary used to be the subscription: every MenoLisa payment was a
 * subscription to our price, so the customers holding one were exactly the
 * customers whose charges counted. **One-time payments have no subscription**
 * (2026-09-11), so that key is gone and this replaces it — `create-checkout`
 * stamps it on `payment_intent_data.metadata`, and a Charge carries its
 * PaymentIntent id, so the two can be joined without a second API walk.
 *
 * Keep the value stable. Changing it orphans every charge taken before the
 * change, which reads on the panel as revenue that vanished.
 */
export const PRODUCT_METADATA_KEY = "product";
export const PRODUCT_METADATA_VALUE = "menolisa";
