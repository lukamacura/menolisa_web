/**
 * Browser detection utilities
 * Helps identify browser mismatches, especially on Samsung devices
 */

export interface BrowserInfo {
  isAndroid: boolean;
  isSamsungBrowser: boolean;
  isChrome: boolean;
  isSafari: boolean;
  isFirefox: boolean;
  isMobile: boolean;
  browserName: string;
}

/**
 * Detect browser information from user agent
 */
export function detectBrowser(userAgent?: string): BrowserInfo {
  const ua = userAgent || (typeof window !== "undefined" ? navigator.userAgent : "");
  
  const isAndroid = /android/i.test(ua);
  const isSamsungBrowser = /SamsungBrowser/i.test(ua);
  const isChrome = /Chrome/i.test(ua) && !/SamsungBrowser/i.test(ua) && !/Edg/i.test(ua);
  const isSafari = /Safari/i.test(ua) && !/Chrome/i.test(ua) && !/SamsungBrowser/i.test(ua);
  const isFirefox = /Firefox/i.test(ua);
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(ua);
  
  let browserName = "Unknown";
  if (isSamsungBrowser) browserName = "Samsung Internet";
  else if (isChrome) browserName = "Chrome";
  else if (isSafari) browserName = "Safari";
  else if (isFirefox) browserName = "Firefox";
  else if (/Edg/i.test(ua)) browserName = "Edge";
  else if (/Opera|OPR/i.test(ua)) browserName = "Opera";
  
  return {
    isAndroid,
    isSamsungBrowser,
    isChrome,
    isSafari,
    isFirefox,
    isMobile,
    browserName,
  };
}

/**
 * Check if there's a potential browser mismatch issue
 * This happens when user registers in one browser but opens email link in another
 */
export function hasBrowserMismatchIssue(browserInfo: BrowserInfo): boolean {
  // On Android, if user is on Samsung Internet, they might have registered in Chrome
  return browserInfo.isAndroid && browserInfo.isSamsungBrowser;
}

/**
 * Get helpful message for browser mismatch
 */
export function getBrowserMismatchMessage(browserInfo: BrowserInfo): string {
  if (browserInfo.isAndroid && browserInfo.isSamsungBrowser) {
    return "You're using Samsung Internet, but you may have registered in Chrome. Please open the email link in the same browser where you registered, or copy the link and paste it into Chrome.";
  }
  return "Please make sure you're using the same browser where you registered or logged in.";
}

