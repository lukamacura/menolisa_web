import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PLAN_WEEKS } from "@/lib/pricing";

/**
 * The landing page's one call to action, fixed to the bottom of the viewport.
 * Every path off this page into the product goes to /register - there is no
 * second CTA in the page body, because the bar is always on screen and a
 * duplicate button is just a second thing to read.
 *
 * It no longer mirrors the funnel's `CTA_GRADIENT_*` button (grey
 * `text-foreground` on pink→peach). Grey ink on that gradient read washed out,
 * so this one is white on a deeper pink→coral: #E8487F→#E8663A keeps white at
 * roughly 3.7:1 → 3.3:1 across the fill, which clears WCAG AA for large bold
 * text (the label is 17px bold). Lighten either stop and white stops passing.
 * The sub-line repeats the screen-1 promise she is about to see.
 */
export default function LandingCtaBar() {
  return (
    <div className="fixed bottom-0 inset-x-0 z-50 border-t border-[#E8DDD9] bg-[#FFFCF8]/95 backdrop-blur supports-backdrop-filter:bg-[#FFFCF8]/85 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto w-full max-w-md px-4 pt-3 pb-2.5">
        <Link
          href="/register"
          className="relative flex min-h-14 w-full items-center justify-center rounded-2xl px-14 text-[17px] font-bold tracking-[0.01em] text-white transition-transform hover:brightness-105 active:scale-[0.98]"
          // `color` is inline, not `text-white`: an unlayered global link rule
          // in globals.css outranks Tailwind's layered utilities and painted
          // the label pink.
          style={{
            color: "#FFFFFF",
            background: "linear-gradient(135deg, #E8487F 0%, #E8663A 100%)",
            boxShadow: "0 8px 20px -8px rgba(232, 72, 127, 0.65)",
            textShadow: "0 1px 1px rgba(110, 20, 50, 0.25)",
          }}
        >
          Build my {PLAN_WEEKS}-week plan
          <span
            className="absolute right-2 grid h-10 w-10 place-items-center rounded-xl bg-white/20"
            aria-hidden
          >
            <ArrowRight className="h-5 w-5" strokeWidth={2.5} />
          </span>
        </Link>
        <p className="mt-1.5 text-center text-xs text-[#6B6B6B]">
          Free 2-minute check · No email needed
        </p>
      </div>
    </div>
  );
}
