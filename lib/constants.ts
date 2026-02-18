/**
 * Application constants
 */

// Site URL for email redirects and authentication callbacks
// Can be overridden with NEXT_PUBLIC_SITE_URL environment variable
// Defaults to http://localhost:3000 in development, https://womenreset.com for production
// IMPORTANT: This URL must be added to Supabase Authentication → URL Configuration → Redirect URLs
// The redirect URL format should be: ${SITE_URL}${AUTH_CALLBACK_PATH}
// Note: Both www and non-www should be added to Supabase redirect URLs
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 
  (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://womenreset.com");

// Auth callback path
export const AUTH_CALLBACK_PATH = "/auth/callback";

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
