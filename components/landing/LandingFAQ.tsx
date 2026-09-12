import { ChevronDown } from "lucide-react";
import {
  GUARANTEE_DAYS,
  PLAN_ACCESS_DAYS,
  PLAN_PRICE,
  PLAN_WEEKS,
  SUPPORT_EMAIL,
  formatPrice,
} from "@/lib/pricing";

// Each answer is a claim about this codebase - keep them checkable, the same
// rule the Terms and Privacy pages are written under (CLAUDE.md §4).
const FAQS = [
  {
    q: "Is the check really free?",
    a: "Yes. The check and your results are free, and we don't ask for your email. You only pay if you decide to unlock your plan.",
  },
  {
    q: "How much does the plan cost?",
    a: `${formatPrice(PLAN_PRICE)}, paid once, for your full ${PLAN_WEEKS}-week plan. Nothing renews and there is nothing to cancel. Your access runs for ${PLAN_ACCESS_DAYS} days, and you can come back for another block if you want one.`,
  },
  {
    q: "What if it's not for me?",
    a: `Then you get your money back. Email ${SUPPORT_EMAIL} within ${GUARANTEE_DAYS} days of paying and we'll refund the full ${formatPrice(PLAN_PRICE)}. No reason needed, no forms.`,
  },
  {
    q: "Where do I use my plan?",
    a: "In the MenoLisa app for iPhone and Android. After you join, you sign in with the email you used at checkout.",
  },
  {
    q: "Is Lisa a real person?",
    a: "No. Lisa is an AI trained on menopause research. She gives clear, research-backed information, not medical advice, and she'll tell you when a question is one for your doctor.",
  },
  {
    q: "Is my information private?",
    a: "Your answers, symptoms and plan stay in your account. We never send your health information to advertisers. The Privacy Policy has the details.",
  },
];

export default function LandingFAQ() {
  return (
    <section id="faq" className="scroll-mt-24 px-4 py-14">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-center text-3xl font-bold text-[#2E2A2B] sm:text-4xl">Questions</h2>
        <div className="mt-8 divide-y divide-[#E8DDD9] rounded-2xl border border-[#E8DDD9] bg-[#FFFCF8]">
          {FAQS.map((item) => (
            <details key={item.q} className="group px-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold text-[#2E2A2B] [&::-webkit-details-marker]:hidden">
                {item.q}
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-[#C2437F] transition-transform group-open:rotate-180"
                  aria-hidden
                />
              </summary>
              <p className="pb-4 text-[15px] leading-relaxed text-[#5B5557]">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
