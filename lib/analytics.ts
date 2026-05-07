type AnalyticsProps = Record<string, unknown>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export function track(event: string, props: AnalyticsProps = {}) {
  if (typeof window === "undefined") return;

  if (process.env.NODE_ENV !== "production") {
    console.log(`[analytics] ${event}`, props);
  }

  // TODO: wire to chosen provider (PostHog / GA4 / Vercel).
  if (typeof window.gtag === "function") {
    window.gtag("event", event, props);
  } else if (Array.isArray(window.dataLayer)) {
    window.dataLayer.push({ event, ...props });
  }
}
