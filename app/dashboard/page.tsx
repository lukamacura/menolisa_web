"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WEB_APP_ENABLED } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * Inner component that uses useSearchParams - must be wrapped in Suspense for Next.js static generation.
 */
function DashboardRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Home is the tracker while the web app serves the product, and Account
    // once it doesn't — landing on a "get the app" wall would strand anyone
    // who came here to cancel.
    const target = WEB_APP_ENABLED ? "/dashboard/symptoms" : "/dashboard/account";
    const qs = searchParams.toString();
    router.replace(qs ? `${target}?${qs}` : target);
  }, [router, searchParams]);

  return null;
}

/**
 * Dashboard root: redirect to Home (symptoms page).
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardRedirect />
    </Suspense>
  );
}
