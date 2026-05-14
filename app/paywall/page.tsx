"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { DisputedAccountBanner, PaywallView, type PaywallPlan } from "@/components/PaywallView";

export const dynamic = "force-dynamic";

type AccountStatusResponse = {
  state?: "trialing" | "active" | "canceling" | "past_due" | "ended" | "disputed";
  has_access?: boolean;
};

export default function PaywallPage() {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState<PaywallPlan>("annual");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gateLoading, setGateLoading] = useState(true);
  const [isDisputed, setIsDisputed] = useState(false);

  // Bounce users who don't belong here: unauthenticated → /login, has access → /dashboard.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!data.user) {
          if (!cancelled) router.replace("/login?redirectedFrom=/paywall");
          return;
        }
        const res = await fetch("/api/account/status", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) {
          if (!cancelled) setGateLoading(false);
          return;
        }
        const json = (await res.json()) as AccountStatusResponse;
        if (cancelled) return;
        if (json.has_access) {
          router.replace("/dashboard");
          return;
        }
        setIsDisputed(json.state === "disputed");
        setGateLoading(false);
      } catch {
        if (!cancelled) setGateLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleCheckout = async (plan: PaywallPlan) => {
    if (checkoutLoading) return;
    setError(null);
    setCheckoutLoading(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ plan, return_origin: origin || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not start checkout. Please try again.");
        setCheckoutLoading(false);
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError("Checkout could not be started. Please try again.");
      setCheckoutLoading(false);
    } catch {
      setError("Network error. Please try again.");
      setCheckoutLoading(false);
    }
  };

  if (gateLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-sm text-muted-foreground">Loading…</div>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen flex flex-col"
      style={{
        backgroundImage:
          "linear-gradient(135deg, #FDF2F8 0%, #FCE7F3 25%, #F5D0FE 50%, #E9D5FF 75%, #FDF2F8 100%)",
      }}
    >
      <div className="flex-1 flex flex-col px-4 sm:px-6 py-6 sm:py-10">
        <PaywallView
          selectedPlan={selectedPlan}
          onSelectPlan={setSelectedPlan}
          onCheckout={handleCheckout}
          checkoutLoading={checkoutLoading}
          error={error}
          banner={isDisputed ? <DisputedAccountBanner /> : undefined}
        />
      </div>
    </main>
  );
}
