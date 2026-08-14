"use client";

import { TrialCard } from "@/components/TrialCard";
import { useDashboardTrialStatus } from "@/lib/dashboardTrialContext";

export const dynamic = "force-dynamic";

export default function AccountPage() {
  const trialStatus = useDashboardTrialStatus();

  return (
    <div className="mx-auto max-w-4xl w-full p-4 sm:p-6 md:p-8 pb-24 min-h-screen">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-foreground mb-2 sm:mb-3">
          Account
        </h1>
        <p className="text-sm sm:text-base text-muted-foreground max-w-xl">
          Plan, trial, and billing - update anytime below.
        </p>
      </div>

      <section aria-label="Plan and subscription">
        {trialStatus.loading ? (
          <div className="animate-pulse space-y-3 rounded-2xl border border-white/10 bg-gray-900 p-4 sm:p-6">
            <div className="h-6 w-40 rounded bg-white/10" />
            <div className="h-32 rounded-xl bg-white/10" />
            <div className="h-12 w-full rounded-xl bg-white/10" />
          </div>
        ) : (
          <TrialCard
            trial={{
              expired: trialStatus.expired,
              end: trialStatus.end,
              daysLeft: trialStatus.daysLeft,
              remaining: trialStatus.remaining,
            }}
            accountState={trialStatus.state}
            accountStatus={trialStatus.accountStatus}
            subscriptionCanceled={trialStatus.subscriptionCanceled}
            paymentFailedAt={trialStatus.paymentFailedAt}
            isThirdPartyProvider={trialStatus.isThirdPartyProvider}
          />
        )}
      </section>
    </div>
  );
}
