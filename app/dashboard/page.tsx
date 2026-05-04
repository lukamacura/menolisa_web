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
    const qs = searchParams.toString();
    router.replace(qs ? `/dashboard/symptoms?${qs}` : "/dashboard/symptoms");
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
