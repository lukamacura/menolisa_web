import { PLAN_PRICE, PLAN_WEEKS, formatPrice } from "@/lib/pricing";

// The funnel in the order she will meet it. Nothing is charged and no address
// is asked for until step 3, and the plan lives in the app, not on the web.
const STEPS = [
  {
    title: "Take the 2-minute check",
    body: "Quick questions, most of them one tap. No email, no card.",
  },
  {
    title: "See what's driving your symptoms",
    body: "Your results explain what's behind the symptom hitting you hardest, and what to start with.",
  },
  {
    title: `Get your ${PLAN_WEEKS}-week plan`,
    body: `Built from your answers. ${formatPrice(PLAN_PRICE)} once, then it's yours in the MenoLisa app on iPhone or Android.`,
  },
];

export default function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 px-4 py-14">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-3xl font-bold text-[#2E2A2B] sm:text-4xl">How it works</h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="rounded-2xl border border-[#E8DDD9] bg-[#FFFCF8] p-5 shadow-[0_2px_10px_-4px_rgba(61,61,61,0.12)]"
            >
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#FCE4EE] text-sm font-bold text-[#C2437F]">
                {i + 1}
              </span>
              <h3 className="mt-3 text-lg font-semibold text-[#2E2A2B]">{step.title}</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-[#5B5557]">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
