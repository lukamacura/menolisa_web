"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { DisputedAccountBanner, PaywallView } from "@/components/PaywallView";
import { PLAN_ID } from "@/lib/pricing";
import type { AccountState } from "@/lib/getAccountState";

export const dynamic = "force-dynamic";

type AccountStatusResponse = {
  state?: AccountState;
  has_access?: boolean;
};

export default function PaywallPage() {
  const router = useRouter();
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

  const handleCheckout = async () => {
    if (checkoutLoading) return;
    setError(null);
    setCheckoutLoading(true);
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // `from_registration` is about where checkout *returns*, not where it
        // started: success lands on `/register?phase=download` (get the app,
        // here is the address you log in with) and cancel comes back here. The
        // alternative, `/checkout/success`, still tells her to open Lisa on the
        // web dashboard — a product that was deleted in 2026-08-14.
        body: JSON.stringify({
          plan: PLAN_ID,
          from_registration: true,
          return_origin: origin || undefined,
        }),
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
          onCheckout={handleCheckout}
          checkoutLoading={checkoutLoading}
          error={error}
          banner={isDisputed ? <DisputedAccountBanner /> : undefined}
          trackingSource="dashboard"
        />
      </div>
    </main>
  );
}
