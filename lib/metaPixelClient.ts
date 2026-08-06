"use client";

/** Browser-side `fbq` wrappers. Safe to call before the pixel script loads - the
 *  inline snippet installs a stub that queues calls until fbevents.js arrives. */

import type { MetaFunnelStep } from "@/lib/metaPixel";

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
 * Fires one of the funnel steps, at most once per session. Keeping the event name
 * and its dedup key paired in `META_FUNNEL_STEPS` is what stops a call site from
 * reporting the right event under the wrong key.
 */
export function trackFunnelStep(step: MetaFunnelStep, params?: FbTrackParams): void {
  trackFbOnce(step.onceKey, step.name, params);
}
