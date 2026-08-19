"use client";

/** Browser-side `fbq` wrappers. Safe to call before the pixel script loads - the
 *  inline snippet installs a stub that queues calls until fbevents.js arrives.
 *
 *  Only five events are fired anywhere in the app; see the table in
 *  `lib/metaPixel.ts` for what they are and why the funnel's custom events are
 *  gone. */

import { META_PIXEL_ID } from "@/lib/metaPixel";

export type FbTrackParams = Record<string, unknown>;
export type FbTrackOptions = { eventID?: string };

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export function trackFb(
  eventName: string,
  params?: FbTrackParams,
  options?: FbTrackOptions
): void {
  if (typeof window === "undefined") return;
  try {
    window.fbq?.("track", eventName, params ?? {}, options ?? {});
  } catch (err) {
    console.error("Meta pixel track failed:", err);
  }
}

/**
 * Fires at most once per browser session for a given key, so a page refresh or a
 * StrictMode double-effect can't duplicate the event. Meta's event_id dedup is
 * the real backstop; this just keeps the client honest.
 *
 * Note what that dedup buys: "once per tab", not once per person. That is right
 * for a visit-scoped event like Purchase-on-landing, and was wrong for Lead -
 * which is why Lead moved server-side, keyed off the profile insert.
 */
export function trackFbOnce(
  key: string,
  eventName: string,
  params?: FbTrackParams,
  options?: FbTrackOptions
): void {
  if (typeof window === "undefined") return;
  const storageKey = `fb:sent:${key}`;
  try {
    if (window.sessionStorage.getItem(storageKey)) return;
    window.sessionStorage.setItem(storageKey, "1");
  } catch {
    // Private mode / storage disabled - fall through and fire anyway.
  }
  trackFb(eventName, params, options);
}

/**
 * Attaches the Supabase user id to every *subsequent* browser event as
 * advanced-matching `external_id`.
 *
 * This is the same identifier the three Conversions API events already send
 * (hashed, in `buildUserData`), and it is the only one the funnel has: she types
 * no email until Stripe. Without it the browser copies match on `_fbp`/`_fbc`/
 * IP/UA alone, so a browser `ViewContent` and a server `Lead` from the same
 * woman look like two strangers.
 *
 * Re-calling `init` for a pixel that is already initialised is Meta's documented
 * way to update advanced matching after a sign-in; it does not re-fire PageView.
 * The raw id is passed rather than a hash - Meta normalizes and hashes
 * `external_id` itself, and a Supabase uuid is already lower-case, so it lands
 * on the same digest `crypto.createHash("sha256")` produces server-side.
 *
 * Only events fired after this call carry it, which is why it runs as early as
 * the account exists (the anonymous sign-in) rather than at the paywall.
 */
export function identifyMetaUser(userId: string | null | undefined): void {
  if (typeof window === "undefined" || !userId) return;
  try {
    // Re-assert autoConfig BEFORE the re-init, in that order, exactly as the
    // base snippet does it.
    //
    // This is the only place in the app that calls `init` a second time, and
    // `autoConfig: false` is a per-pixel setting applied at init. Meta does not
    // document whether a re-init resets it, so we do not rely on the answer:
    // asserting it twice costs nothing, and being wrong costs a lot.
    //
    // What it costs, specifically, is Automatic Event Detection coming back on
    // — the thing that scans the DOM and fires standard events off button copy
    // with no fbq() call of ours. It has already happened once on this site
    // (phantom `Subscribe` off the paywall CTA, re-firing on every Framer
    // Motion re-render; see the block comment in `components/MetaPixel.tsx`),
    // and the two events it invents most readily are `Lead` and `Purchase`.
    //
    // Those phantoms carry no `event_id`, so they can never pair with our
    // copies — which is what an "improve deduplication" warning in Events
    // Manager looks like from the inside. `Lead` is the clean tell: ours is
    // server-only, so *any* browser Lead is not ours.
    window.fbq?.("set", "autoConfig", false, META_PIXEL_ID);
    window.fbq?.("init", META_PIXEL_ID, { external_id: userId });
  } catch (err) {
    console.error("Meta pixel identify failed:", err);
  }
}

/** Meta honours a click id for 90 days; match the cookie fbevents.js writes. */
const FBC_MAX_AGE_SEC = 90 * 24 * 60 * 60;

/** `fbclid` is base64url-ish. Anything else is not Meta's and never reaches a
 *  cookie - a value carrying `;` would let a crafted ad URL write a second,
 *  attacker-chosen cookie on our own domain. */
const FBCLID_PATTERN = /^[A-Za-z0-9._-]{1,400}$/;

function readCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`)
  );
  return match ? match[1] : null;
}

/**
 * Registrable domain, so our cookie lands in the same scope fbevents.js uses
 * (`.menolisa.com`) instead of shadowing it host-only on `www`. Returns null for
 * `localhost` and bare IPs, where a Domain attribute is invalid.
 */
function cookieDomain(): string | null {
  const host = window.location.hostname;
  if (host === "localhost" || /^[\d.]+$/.test(host)) return null;
  const labels = host.split(".");
  if (labels.length < 2) return null;
  return `.${labels.slice(-2).join(".")}`;
}

/**
 * Persists the ad click id from the landing URL into the `_fbc` cookie.
 *
 * fbevents.js does this itself - but only if it loaded, and the cohort the
 * Conversions API exists to recover is exactly the one where it didn't. For an
 * ad-blocked or ITP-restricted visitor both `_fbp` and `_fbc` are absent, so
 * every server event (`Lead`, `InitiateCheckout`, `Purchase`) falls back to
 * matching on IP and user-agent alone - Meta's weakest tier - for the clicks we
 * most need attributed.
 *
 * `fbclid` is a real Meta-issued click identifier, so reconstructing `_fbc` from
 * it recovers a genuine match. (We deliberately do *not* mint a `_fbp` the same
 * way: that one is browser-generated, so a value we invent matches nothing Meta
 * has ever seen and only adds a fake identifier to the payload.)
 *
 * Written before the pixel script has necessarily run, and idempotent: if
 * fbevents.js later writes its own `_fbc` for the same click it writes the same
 * fbclid. A *different* fbclid means a new ad click, which supersedes the old
 * attribution, so it overwrites - the same rule the real pixel follows.
 */
export function captureFbClickId(): void {
  if (typeof window === "undefined") return;
  try {
    const fbclid = new URLSearchParams(window.location.search).get("fbclid");
    if (!fbclid || !FBCLID_PATTERN.test(fbclid)) return;

    // `fb.<subdomainIndex>.<clickTime>.<fbclid>` - Meta parses the fbclid back
    // out of the last segment, which is the part that carries the match.
    const existing = readCookie("_fbc");
    if (existing && existing.endsWith(`.${fbclid}`)) return;

    const domain = cookieDomain();
    document.cookie = [
      `_fbc=fb.1.${Date.now()}.${fbclid}`,
      "path=/",
      `max-age=${FBC_MAX_AGE_SEC}`,
      "SameSite=Lax",
      ...(domain ? [`domain=${domain}`] : []),
      ...(window.location.protocol === "https:" ? ["Secure"] : []),
    ].join("; ");
  } catch (err) {
    console.error("Meta click id capture failed:", err);
  }
}
