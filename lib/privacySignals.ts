/**
 * Global Privacy Control (https://globalprivacycontrol.org).
 *
 * GPC is a browser-level "do not share my personal information for
 * cross-context behavioral advertising" signal. Under the CPRA it is not
 * optional decoration: a business that shares personal information for
 * behavioral advertising must treat GPC as a valid opt-out request, and the
 * California AG's first CCPA enforcement action (Sephora, $1.2M, 2022) was
 * substantially about a business whose privacy policy claimed to honor it while
 * its pixels kept firing.
 *
 * MenoLisa shares the identifiers described in §6.1 of /privacy with Meta. That
 * is enough to bring the requirement into scope, so this is a compliance
 * control, not a courtesy — and §6.4 of the Privacy Policy states plainly that
 * we honor it. **These two files have to agree.** If this module is ever
 * bypassed, that sentence becomes a misrepresentation.
 *
 * The signal arrives two ways and both are handled:
 *   - `Sec-GPC: 1` request header  → server-side, read by {@link hasGpcOptOut}
 *   - `navigator.globalPrivacyControl === true` → browser, read by MetaPixel
 *
 * What it suppresses is advertising only. Sign-in, billing, plan generation and
 * every other part of the product are untouched — the opt-out must cost her
 * nothing, which is itself a CPRA non-discrimination requirement.
 */

/** The header a GPC-enabled browser sends on every request. */
const GPC_HEADER = "sec-gpc";

/** Stripe Checkout Session metadata key carrying the signal to the webhook. */
export const GPC_METADATA_KEY = "gpc_opt_out";

type HeaderReader = { headers: { get(name: string): string | null } };

/**
 * True when this request carries a GPC opt-out.
 *
 * The spec defines exactly one truthy value, `"1"`. Anything else — absent,
 * `"0"`, or malformed — is not an opt-out.
 */
export function hasGpcOptOut(req: HeaderReader): boolean {
  return req.headers.get(GPC_HEADER) === "1";
}

/**
 * Unpack the signal the browser's own request stashed on a Checkout Session.
 *
 * The Stripe webhook is server-to-server: by the time it runs, her browser and
 * its headers are long gone, so `Purchase` would otherwise report for a woman
 * who opted out. `create-checkout` runs inside her request and can see the
 * header, so it writes the answer down for the webhook to find — the same trick
 * `metaContextFrom` uses for `_fbp`/`_fbc`.
 */
export function gpcOptOutFromMetadata(
  metadata: Record<string, string> | null | undefined
): boolean {
  return metadata?.[GPC_METADATA_KEY] === "1";
}
