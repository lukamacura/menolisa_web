import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * The in-article call to action. The fixed <LandingCtaBar /> is always on
 * screen; this card sits at the two points where the article has just told
 * her what to do, so the quiz is offered as the next step rather than an ad.
 * Both go to /register - the blog links nowhere else into the product.
 */
export default function BlogQuizCta({
  heading,
  body,
  label = "Take the free quiz",
}: {
  heading: string;
  body: string;
  label?: string;
}) {
  return (
    <aside className="my-10 rounded-2xl border border-[#F2CFDD] bg-white/80 p-5 shadow-[0_12px_30px_-18px_rgba(194,67,127,0.45)] sm:p-6">
      <p className="text-lg font-bold text-[#2E2A2B]">{heading}</p>
      <p className="mt-2 text-[16px] leading-relaxed text-[#5B5557]">{body}</p>
      <Link
        href="/register"
        className="mt-4 inline-flex min-h-12 items-center gap-2 rounded-xl px-5 text-[16px] font-bold transition-transform hover:brightness-105 active:scale-[0.98]"
        // `color` inline: the unlayered global `a` rule in globals.css outranks
        // Tailwind's text utilities (same fix as LandingCtaBar).
        style={{
          color: "#FFFFFF",
          background: "linear-gradient(135deg, #E8487F 0%, #E8663A 100%)",
          boxShadow: "0 8px 20px -8px rgba(232, 72, 127, 0.65)",
        }}
      >
        {label}
        <ArrowRight className="h-4 w-4" strokeWidth={2.5} aria-hidden />
      </Link>
      <p className="mt-2 text-xs text-[#6B6B6B]">Free 2-minute quiz · No email needed</p>
    </aside>
  );
}
