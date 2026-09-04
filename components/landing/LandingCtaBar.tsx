"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * The landing page's one call to action, fixed to the bottom of the viewport.
 *
 * It replaces `<SwipeButton />` (deleted 2026-09-04): a drag-to-unlock control
 * with a pulsing glow, sitting on the screen that takes 100% of paid traffic.
 * A swipe is an invented gesture — it has to be discovered before it can be
 * used, and the audience is 45-60 on a phone.
 *
 * The look is the funnel's own forward-tap bar (`CTA_GRADIENT_STYLE` /
 * `CTA_GRADIENT_CLASS` in `app/register/page.tsx`), so the tap that starts the
 * quiz looks like every tap inside it. Keep the two in sync by hand — the
 * funnel's copy is not importable from here without pulling that whole module
 * into the landing bundle.
 */
export default function LandingCtaBar() {
  return (
    <div className="fixed bottom-0 inset-x-0 z-50 border-t border-foreground/10 bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-md w-full px-4 sm:px-6 py-3">
        <Link
          href="/register"
          className="w-full min-h-12 py-3.5 font-bold text-foreground rounded-xl transition-all flex items-center justify-center gap-2 hover:scale-[1.02] hover:shadow-lg"
          style={{
            background: "linear-gradient(135deg, #ff74b1 0%, #ffeb76 50%, #65dbff 100%)",
            boxShadow: "0 4px 15px rgba(255, 116, 177, 0.4)",
          }}
        >
          Build my 8 week plan
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
