import Link from "next/link";
import { Check, ShieldCheck } from "lucide-react";
import {
  GUARANTEE_BODY_HEAD,
  GUARANTEE_BODY_TAIL,
  GUARANTEE_HEADLINE,
  PLAN_BLOCKS_COPY,
  PLAN_PRICE,
  PLAN_WEEKS,
  WHAT_YOU_GET,
  formatPrice,
} from "@/lib/pricing";

/**
 * The offer, stated plainly. Every figure and every row comes from
 * lib/pricing.ts - the same constants the paywall, Stripe and Terms §11 use -
 * so this card cannot promise something checkout does not charge or the
 * Terms do not honor. "No subscription" is said once, beside the number.
 */
export default function LandingOffer() {
  return (
    <section id="pricing" className="scroll-mt-24 px-4 py-14">
      <div className="mx-auto max-w-xl">
        <h2 className="text-center text-3xl font-bold text-[#2E2A2B] sm:text-4xl">
          What you get
        </h2>

        <div className="mt-8 rounded-3xl border border-[#E8DDD9] bg-[#FFFCF8] p-6 shadow-[0_10px_30px_-14px_rgba(61,61,61,0.25)] sm:p-8">
          <p className="text-xs font-bold uppercase tracking-wider text-[#C2437F]">
            Your {PLAN_WEEKS}-week plan
          </p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-5xl font-extrabold text-[#2E2A2B]">{formatPrice(PLAN_PRICE)}</span>
            <span className="text-[15px] font-medium text-[#5B5557]">one payment · no subscription</span>
          </div>

          <ul className="mt-6 space-y-3.5">
            {WHAT_YOU_GET.map((item) => (
              <li key={item.bold} className="flex items-start gap-3">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#2F9E6B]">
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} aria-hidden />
                </span>
                <span className="text-[15px] leading-snug text-[#3D3D3D]">
                  <strong className="font-semibold text-[#2E2A2B]">{item.bold}</strong>
                  <span className="mt-0.5 block text-sm text-[#6B6B6B]">{item.sub}</span>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-2xl border border-[#BFE3CF] bg-[#EEF8F2] p-4">
            <p className="flex items-center gap-2 font-semibold text-[#1F6B47]">
              <ShieldCheck className="h-5 w-5" aria-hidden />
              {GUARANTEE_HEADLINE}
            </p>
            <p className="mt-1.5 text-sm leading-relaxed text-[#2F5A44]">
              <strong>{GUARANTEE_BODY_HEAD}</strong> {GUARANTEE_BODY_TAIL}{" "}
              <Link href="/terms#money-back" prefetch={false} className="underline underline-offset-2">
                Terms
              </Link>
            </p>
          </div>

          <p className="mt-4 text-center text-xs leading-relaxed text-[#6B6B6B]">{PLAN_BLOCKS_COPY}</p>
        </div>

        <p className="mt-5 text-center text-sm text-[#5B5557]">
          Your plan is built from the free check, so that&apos;s where it starts. You&apos;ll see your
          results before any price.
        </p>
      </div>
    </section>
  );
}
