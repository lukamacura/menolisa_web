"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Inner component that uses useSearchParams - must be wrapped in Suspense for Next.js static generation.
 */
function DashboardRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Account, unconditionally. Tracking lives in the app now, and the only
    // reason left to open the web dashboard is billing — landing anywhere else
    // would strand anyone who came here to cancel.
    const qs = searchParams.toString();
    router.replace(qs ? `/dashboard/account?${qs}` : "/dashboard/account");
  }, [router, searchParams]);

  return null;
}

/**
 * Dashboard root: redirect to Account.
 */
export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardRedirect />
    </Suspense>
  );
}
