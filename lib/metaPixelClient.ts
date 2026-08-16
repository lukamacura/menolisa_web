"use client";

/** Browser-side `fbq` wrappers. Safe to call before the pixel script loads - the
 *  inline snippet installs a stub that queues calls until fbevents.js arrives. */

import {
  META_QUIZ_STEP_EVENT,
  META_SCROLL_BUCKETS,
  META_SCROLL_EVENT,
  quizStepOnceKey,
  scrollDepthOnceKey,
  type MetaFunnelStep,
} from "@/lib/metaPixel";

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

/**
 * One `QuizStep` per question, carrying its index and id. Deduped per index, so
 * walking back and forward again reports nothing new - the number Events
 * Manager shows for index N is "women who ever reached question N", which is
 * exactly the denominator a drop curve needs.
 */
export function trackQuizStep(index: number, stepId: string, total: number): void {
  trackFbOnce(quizStepOnceKey(index), META_QUIZ_STEP_EVENT, {
    step_index: index + 1,
    step_id: stepId,
    step_total: total,
  });
}

/**
 * Scroll depth on the plan screen, reported once per bucket crossed. Called from
 * a scroll handler, so it must stay cheap: the buckets are a fixed four-element
 * array and `trackFbOnce` short-circuits on a sessionStorage hit.
 */
export function trackPlanScrollDepth(percent: number): void {
  for (const bucket of META_SCROLL_BUCKETS) {
    if (percent >= bucket) {
      trackFbOnce(scrollDepthOnceKey(bucket), META_SCROLL_EVENT, { depth: bucket });
    }
  }
}
