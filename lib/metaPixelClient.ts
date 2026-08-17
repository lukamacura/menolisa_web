"use client";

/** Browser-side `fbq` wrappers. Safe to call before the pixel script loads - the
 *  inline snippet installs a stub that queues calls until fbevents.js arrives.
 *
 *  Only five events are fired anywhere in the app; see the table in
 *  `lib/metaPixel.ts` for what they are and why the funnel's custom events are
 *  gone. */

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
