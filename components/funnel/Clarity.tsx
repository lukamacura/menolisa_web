"use client";

import Script from "next/script";
import { useEffect, useSyncExternalStore } from "react";
import { funnelSessionId, isQaSession } from "@/lib/funnelClient";

/**
 * Microsoft Clarity — session recordings, heatmaps and rage/dead-click
 * detection for the `/register` funnel only.
 *
 * `funnel_events` says *which* screen she left on; it cannot say what she did
 * on it for nine seconds first. That is the question this answers, and it is
 * a product-analytics tool, not an ad pixel — nothing here is a Meta event and
 * it must not become one (see "Why the funnel's custom events are gone" in
 * CLAUDE.md).
 *
 * Rules, each mirrored from `components/MetaPixel.tsx`:
 *
 * - **`lazyOnload`.** The tag is ~70KB from a second origin. It lands after the
 *   `load` event so it never shares the pipe with the nine LCP tiles. Do not
 *   move it to `afterInteractive` without re-running `npm run perf`.
 * - **Production only.** A dev walk must not land in the live project.
 * - **A `?qa=1` walk records nothing.** `/admin` drops QA rows; a QA recording
 *   in Clarity would still shape the heatmaps.
 * - **Global Privacy Control switches it off.** Clarity is analytics, not
 *   advertising, so GPC does not strictly bind it — but it sets a year-long
 *   `_clck` cookie and ships the DOM to Microsoft, and the cost of honoring the
 *   signal is a fraction of a percent of visits. Same shape as the pixel:
 *   the snippet is not installed at all.
 * - **Unset `NEXT_PUBLIC_CLARITY_PROJECT_ID` = off.** There is no fallback id.
 *
 * What a recording contains, and why the privacy policy names Microsoft
 * (§5.2, §6.2, §6.3): the funnel's answers are tapped tiles, so a recording
 * shows which symptom, age band, stage and goal she chose. That is health
 * data about a visit, held by a processor. The name box carries
 * `data-clarity-mask` so what she types is never captured whatever the
 * project's masking level is set to; the sliders are masked by Clarity's
 * default ("Balanced") level. Never call `clarity("identify", …)` with her
 * user id or email — the recording stays keyed to the visit, like
 * `funnel_events`, and is joined to it through the `funnel_session` tag.
 */
const CLARITY_ENABLED =
  process.env.NODE_ENV === "production" &&
  !!process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

const PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID ?? "";

type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] };

function gpcEnabled(): boolean {
  return (
    typeof navigator !== "undefined" &&
    (navigator as Navigator & { globalPrivacyControl?: boolean })
      .globalPrivacyControl === true
  );
}

/**
 * The queue stub the official snippet creates, created early so a call made
 * before the tag has loaded is queued rather than lost. The snippet's own
 * first line is `c[a]=c[a]||…`, so it adopts this stub and drains `q`.
 */
function clarityStub(): ClarityFn | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { clarity?: ClarityFn };
  if (!w.clarity) {
    const fn = function (...args: unknown[]) {
      (fn.q = fn.q || []).push(args);
    } as ClarityFn;
    w.clarity = fn;
  }
  return w.clarity;
}

function clientAllowed(): boolean {
  return CLARITY_ENABLED && !gpcEnabled() && !isQaSession();
}

/**
 * Tag the screen she is on, so recordings can be filtered by step ("show me
 * sessions that reached `paywall`") and jumped to it on the timeline. Called
 * from the same effect that pings `funnel_events`, with the same key, so the
 * two tools name a screen the same way. A no-op wherever the tag is off.
 */
export function tagClarityStep(step: string) {
  if (!clientAllowed()) return;
  const clarity = clarityStub();
  if (!clarity) return;
  try {
    clarity("set", "step", step);
    clarity("event", `step_${step}`);
  } catch {
    // Instrumentation must never be visible to the woman being instrumented.
  }
}

const NEVER_CHANGES = () => () => {};
const serverSnapshot = () => false;

export default function Clarity() {
  const allowed = useSyncExternalStore(
    NEVER_CHANGES,
    clientAllowed,
    serverSnapshot
  );

  useEffect(() => {
    if (!allowed) return;
    const id = funnelSessionId();
    const clarity = clarityStub();
    if (!id || !clarity) return;
    try {
      // The per-visit uuid `funnel_events` is keyed by — a recording and its
      // drop-off row can be matched, and neither is an account.
      clarity("set", "funnel_session", id);
    } catch {
      // Ignored, deliberately.
    }
  }, [allowed]);

  if (!allowed) return null;

  return (
    <Script id="ms-clarity" strategy="lazyOnload">
      {`
    (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
    })(window, document, "clarity", "script", "${PROJECT_ID}");
      `}
    </Script>
  );
}
