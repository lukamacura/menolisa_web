/**
 * Application constants
 */

// Site URL for email redirects and authentication callbacks.
// Set NEXT_PUBLIC_SITE_URL to override; defaults to localhost in development
// and the production domain otherwise. This is the single base-URL variable —
// there is no NEXT_PUBLIC_APP_URL any more.
// IMPORTANT: This URL must be added to Supabase Authentication → URL Configuration → Redirect URLs
// The redirect URL format should be: ${SITE_URL}${AUTH_CALLBACK_PATH}
// Note: Both www and non-www should be added to Supabase redirect URLs
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://menolisa.com");

// Auth callback path
export const AUTH_CALLBACK_PATH = "/auth/callback";

export const APP_STORE_URL =
  "https://apps.apple.com/de/app/menolisa/id6761130271?l=en-GB";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.menolisa.app&pcampaignid=web_share";

/**
 * Whether the web app still serves the product itself — symptom tracking, Lisa
 * chat, notifications.
 *
 * The product lives in the Expo app now; the web app's job is the /register
 * funnel that sells it, plus the two things a subscriber must be able to do
 * from a browser: cancel her subscription and delete her account. Those are
 * never gated on this flag — burying cancellation behind an app download is
 * both hostile and, in several jurisdictions, illegal.
 *
 * Off by default, so a missing env var hides the half-migrated surface rather
 * than exposing it. Set NEXT_PUBLIC_WEB_APP_ENABLED=true to bring it back —
 * the pages are still here, not deleted, precisely so this stays a one-variable
 * decision.
 *
 * Note this is a UI switch, not a security boundary: the API routes stay open
 * because the mobile app calls them. They enforce access on their own, per
 * request, via checkTrialExpired().
 */
export const WEB_APP_ENABLED = process.env.NEXT_PUBLIC_WEB_APP_ENABLED === "true";

/**
 * Gets the base URL for redirects based on the current environment.
 * In the browser, uses the current origin (e.g., http://localhost:3000 in dev).
 * On the server, uses SITE_URL from environment variables or defaults appropriately.
 */
export function getRedirectBaseUrl(): string {
  // Client-side: use the current origin (works for both localhost and production)
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  // Server-side: use SITE_URL (which now defaults to localhost:3000 in development)
  return SITE_URL;
}

/**
 * Gets the redirect URL with Android Intent support for Samsung devices.
 * This ensures links open in Chrome instead of Samsung Internet when possible.
 * 
 * @param baseUrl - The base URL for the redirect
 * @param callbackPath - The callback path (defaults to AUTH_CALLBACK_PATH)
 * @param queryParams - Optional query parameters to append
 * @returns The redirect URL, with Intent URL format for Android devices when appropriate
 */
export function getRedirectUrlWithIntent(
  baseUrl: string, 
  callbackPath: string = AUTH_CALLBACK_PATH,
  queryParams?: string
): string {
  const fullPath = queryParams ? `${callbackPath}${queryParams.startsWith('?') ? queryParams : `?${queryParams}`}` : callbackPath;
  const fullUrl = `${baseUrl}${fullPath}`;
  
  // Client-side: detect Android and use Intent URL to force Chrome
  if (typeof window !== "undefined") {
    const userAgent = navigator.userAgent;
    const isAndroid = /android/i.test(userAgent);
    const isSamsungBrowser = /SamsungBrowser/i.test(userAgent);
    const isChrome = /Chrome/i.test(userAgent) && !/SamsungBrowser/i.test(userAgent);
    
    // If on Android and using Samsung Internet (not Chrome), use Intent URL
    if (isAndroid && isSamsungBrowser && !isChrome) {
      try {
        const url = new URL(fullUrl);
        // Intent URL format to force Chrome
        // Format: intent://host#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=encoded_url;end
        const intentUrl = `intent://${url.host}${url.pathname}${url.search}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(fullUrl)};end`;
        return intentUrl;
      } catch (e) {
        // If URL parsing fails, return original URL
        console.warn("Failed to create Intent URL, using regular URL:", e);
        return fullUrl;
      }
    }
  }
  
  return fullUrl;
}
