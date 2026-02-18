"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { detectBrowser } from "@/lib/browserUtils";
import { AlertCircle, ExternalLink } from "lucide-react";
import Link from "next/link";

function OpenInChromeContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const authCode = searchParams.get("code");
  const nextParam = searchParams.get("next");
  const [browserInfo, setBrowserInfo] = useState<ReturnType<typeof detectBrowser> | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  
  useEffect(() => {
    const browser = detectBrowser();
    setBrowserInfo(browser);
    
    // If we have an auth code and user is already in Chrome, redirect immediately
    if (authCode && browser.isChrome && !browser.isSamsungBrowser) {
      setRedirecting(true);
      const callbackUrl = `/auth/callback?code=${authCode}${nextParam ? `&next=${encodeURIComponent(nextParam)}` : ''}`;
      router.push(callbackUrl);
    }
  }, [authCode, nextParam, router]);
  
  // If we have an auth code and user is in Samsung Internet, show instructions
  if (authCode && browserInfo?.isSamsungBrowser) {
    const callbackUrl = `/auth/callback?code=${authCode}${nextParam ? `&next=${encodeURIComponent(nextParam)}` : ''}`;
    const fullCallbackUrl = typeof window !== "undefined" 
      ? `${window.location.origin}${callbackUrl}`
      : `https://womenreset.com${callbackUrl}`;
    
    // Intent URL to force Chrome
    const intentUrl = `intent://womenreset.com${callbackUrl.replace('/auth/callback', '/auth/callback')}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(fullCallbackUrl)};end`;
    
    return (
      <main className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="max-w-md w-full space-y-6">
          <div className="text-center">
            <div className="rounded-full bg-orange-100 dark:bg-orange-900/20 p-4 inline-block mb-4">
              <AlertCircle className="w-8 h-8 text-orange-600 dark:text-orange-400" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">Open in Chrome</h1>
            <p className="text-muted-foreground">
              For the best experience, please open this link in Chrome.
            </p>
          </div>
          
          <div className="space-y-3">
            <a
              href={intentUrl}
              className="block w-full bg-primary text-primary-foreground py-3 px-4 rounded-xl font-semibold text-center hover:brightness-95 transition-all shadow-sm"
            >
              Open in Chrome
              <ExternalLink className="w-4 h-4 inline-block ml-2" />
            </a>
            
            <div className="rounded-xl border border-muted bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground mb-2 font-semibold">Or copy this link:</p>
              <div className="bg-background border border-border rounded-lg p-3 break-all text-xs font-mono text-muted-foreground">
                {fullCallbackUrl}
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(fullCallbackUrl);
                }}
                className="mt-2 text-xs text-primary hover:underline"
              >
                Copy link
              </button>
            </div>
          </div>
          
          <div className="rounded-xl border border-orange-400/30 bg-orange-50/80 dark:bg-orange-900/20 p-4 text-sm text-orange-700 dark:text-orange-400">
            <p className="font-semibold mb-1">Why this happens:</p>
            <p className="text-xs">
              Email links on Samsung devices often open in Samsung Internet instead of Chrome. Since browsers don&apos;t share cookies, your login session needs to be in the same browser.
            </p>
          </div>
          
          <div className="text-center">
            <Link 
              href="/login" 
              className="text-sm text-muted-foreground hover:text-foreground underline"
            >
              Back to login
            </Link>
          </div>
        </div>
      </main>
    );
  }
  
  // If already in Chrome, show redirecting message
  if (redirecting || (authCode && browserInfo?.isChrome)) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
          <p className="text-muted-foreground">Redirecting...</p>
        </div>
      </main>
    );
  }
  
  // No auth code or unknown browser state
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <p className="text-muted-foreground">No authentication link found.</p>
        <Link 
          href="/login" 
          className="text-primary hover:underline"
        >
          Go to login
        </Link>
      </div>
    </main>
  );
}

function LoadingFallback() {
  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="text-center space-y-4">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent"></div>
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </main>
  );
}

export default function OpenInChromePage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <OpenInChromeContent />
    </Suspense>
  );
}
