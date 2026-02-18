"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Heart, Sparkles, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";

const REDIRECT_DELAY_SEC = 8;

export default function CheckoutSuccessPage() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(REDIRECT_DELAY_SEC);

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(t);
          router.replace("/dashboard");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [router]);

  return (
    <div className="min-h-screen bg-linear-to-br from-background via-primary/5 to-accent/10 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="flex justify-center">
          <div className="rounded-full bg-primary/15 p-4 ring-4 ring-primary/20">
            <CheckCircle2 className="h-14 w-14 text-primary" strokeWidth={2} aria-hidden />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
            You&apos;re all set. Welcome.
          </h1>
          <p className="text-muted-foreground text-base sm:text-lg">
            Your subscription is live and Lisa is ready for you. You can explore your symptoms and insights whenever you like.
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-muted-foreground">
          <Heart className="h-5 w-5 text-primary/80" aria-hidden />
          <span className="text-sm">You&apos;re not alone in this. We&apos;re with you.</span>
        </div>

        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          This phase of life can feel overwhelming. You just took a real step for yourself. When you&apos;re ready, your dashboard is waiting with Lisa and your insights.
        </p>

        <div className="pt-4 space-y-4">
          <Link
            href="/dashboard"
            className="btn-landing-primary inline-flex items-center justify-center gap-2 w-full sm:w-auto min-w-[200px] px-6 focus:outline-none focus:ring-2 focus:ring-[#ff8da1] focus:ring-offset-2"
          >
            Take me to my dashboard
            <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
          {countdown > 0 && (
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              We&apos;ll take you there in {countdown} {countdown === 1 ? "second" : "seconds"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
