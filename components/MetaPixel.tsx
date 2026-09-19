"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { META_PIXEL_ID } from "@/lib/metaPixel";
import { captureFbClickId, trackFb } from "@/lib/metaPixelClient";

/**
 * Localhost does not report into the live dataset.
 *
 * `META_PIXEL_ID` falls back to a hard-coded literal when the env var is unset,
 * and it is unset in `.env.local` - so every `npm run dev` session was firing
 * real PageView / ViewContent / InitiateCheckout into production, and a Stripe
 * *test-mode* checkout landing on `?phase=download` fired a real $59 Purchase.
 * Browser events need no access token, which is what makes this easy to miss:
 * the Conversions API side stays silent locally (no `META_CAPI_ACCESS_TOKEN`),
 * so those dev events also arrived unpaired - indistinguishable, from Meta's
 * side, from a deduplication fault.
 *
 * Gating the snippet is enough to stop all of them: `trackFb` and
 * `identifyMetaUser` both call through `window.fbq?.()`, so with no snippet
 * installed every call site in the app is already a no-op.
 *
 * `NODE_ENV` rather than `VERCEL_ENV` on purpose - preview deployments still
 * report, so a deployed branch can be tested end to end in Events Manager.
 */
const PIXEL_ENABLED = process.env.NODE_ENV === "production";

/**
 * Global Privacy Control, browser side.
 *
 * `navigator.globalPrivacyControl` is the DOM half of the same signal the server
 * reads as `Sec-GPC` (see `lib/privacySignals.ts`). Under the CPRA it is a valid
 * opt-out request from sharing for cross-context behavioral advertising, and
 * /privacy §6.4 states that we honor it.
 *
 * Honoring it means **not installing the snippet at all**, rather than
 * installing it and declining to call `fbq` afterwards: fbevents.js sets cookies
 * and contacts Meta on load, so a loaded-but-unused pixel is still the sharing
 * she opted out of. With no snippet installed every `trackFb` and
 * `identifyMetaUser` call site in the app is already a no-op, so this one gate
 * covers the browser copies of all four events.
 *
 * It has to be read in an effect. The property exists only in the browser, and
 * deciding during render would either crash SSR or hydrate a mismatched tree —
 * so the snippet mounts one tick later, which the script's own `lazyOnload`
 * strategy already implies.
 */
function gpcEnabled(): boolean {
  return (
    typeof navigator !== "undefined" &&
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true
  );
}

/**
 * Read through `useSyncExternalStore` rather than an effect-plus-setState.
 *
 * `navigator.globalPrivacyControl` is a browser value that does not change for
 * the life of the page, which is precisely the shape this hook exists for: the
 * server snapshot is `false` (render nothing), the client snapshot is the real
 * answer, and React reconciles the two without a hydration mismatch and without
 * the cascading re-render that setState-in-an-effect causes.
 */
const NEVER_CHANGES = () => () => {};
const clientSnapshot = () => PIXEL_ENABLED && !gpcEnabled();
const serverSnapshot = () => false;

export default function MetaPixel() {
  const pathname = usePathname();
  // The base snippet already fires the first PageView, so skip the initial run
  const isFirstRender = useRef(true);
  // False until the browser has been consulted, so nothing renders until we
  // know. Guessing wrong here means firing an event she opted out of.
  const allowed = useSyncExternalStore(
    NEVER_CHANGES,
    clientSnapshot,
    serverSnapshot
  );

  useEffect(() => {
    if (!allowed) return;
    // Before anything else: persist the ad click id off the landing URL, so the
    // Conversions API can still match this visit if fbevents.js never loads.
    // See `captureFbClickId` - this is the one match signal a blocked pixel
    // does not cost us.
    captureFbClickId();

    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    trackFb("PageView");
  }, [pathname, allowed]);

  if (!allowed) return null;

  return (
    <>
      {/*
        `autoConfig: false` must stay, and must come before `init`.

        With autoConfig on (Meta's default), fbevents.js runs Automatic Event
        Detection: it scans the DOM for buttons and links whose copy and page
        context look like a conversion and fires standard events - Subscribe,
        Lead, Contact - with no fbq() call in our source. On the paywall it was
        inferring Subscribe off the plan CTA and re-firing on every Framer Motion
        re-render, flooding Events Manager with dozens of phantom Subscribes and
        corrupting the funnel's step-to-step rates.

        Turning it off means every event in Events Manager is one we fired on
        purpose, and there are exactly five: PageView, Lead, ViewContent,
        InitiateCheckout, Purchase. It also disables Automatic Advanced Matching
        (form-field email/phone scraping), which we don't rely on - the
        Conversions API sends hashed match data instead, with the Supabase user
        id as external_id since the funnel collects no email before Stripe.

        If we ever want a real Subscribe, fire it explicitly from the webhook's
        subscription-confirmation branch, not from the browser.
      */}
      {/*
        `lazyOnload`, not `afterInteractive`. **This is a load-time decision and
        it is worth more than everything else on this page combined.**

        fbevents.js is 108KB and pulls a 136KB `signals/config` bundle behind it
        — 244KB of third-party JavaScript from a second origin, which is more
        than a third of everything `/register` transfers. Under
        `afterInteractive` that lands while the entrance is still painting, and
        it competes with the nine quiz tiles for a slow-4G pipe.

        Measured with Lighthouse (mobile, simulated slow 4G) on identical
        builds, the only variable being whether `connect.facebook.net` was
        blocked:

            with the pixel     LCP 5.8s   TBT  90ms   score 78
            without it         LCP 3.2s   TBT   0ms   score 93

        2.6 seconds of Largest Contentful Paint, on the screen that takes 100%
        of paid traffic and already loses a third of it before the first tap.

        What this does NOT cost, which is why it is safe:
          - **Nothing that earns money.** `Lead`, `ViewContent`,
            `InitiateCheckout` and `Purchase` are all sent server-side through
            the Conversions API. None of them is fired from this snippet.
          - **Not the click id.** `captureFbClickId()` above runs in a plain
            effect, independent of this script, so `_fbc` is written from the
            landing URL's `fbclid` at the usual time whether fbevents.js has
            loaded or not.

        What it does cost: the browser `PageView` fires after the load event
        rather than during it, so a visitor who leaves within a second or two
        may not register one, and `_fbp` is set late for her. `PageView` is not
        an AEM event and is not an optimization target (see the event table in
        `lib/metaPixel.ts`), and a visitor that fast converts nothing — so the
        trade was taken deliberately.

        Do not move this back to `afterInteractive` without re-running the
        measurement above.
      */}
      <Script id="fb-pixel" strategy="lazyOnload">
        {`
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window,document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('set', 'autoConfig', false, '${META_PIXEL_ID}');
    fbq('init', '${META_PIXEL_ID}');
    fbq('track', 'PageView');
        `}
      </Script>
      <noscript>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  );
}
