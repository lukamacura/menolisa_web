import Image from "next/image";
import Link from "next/link";
import { MERRY } from "@/lib/blog";
import { PLAN_WEEKS } from "@/lib/pricing";

/**
 * How every blog post ends: the weight chain the funnel's results card
 * explains, then one line to the quiz.
 *
 * The words mirror `getWeightChain()` in lib/quiz-results-helpers.ts and the
 * results card's closing lines in app/register/page.tsx, so what she reads
 * here is what the quiz shows her. Change them together. One deliberate
 * difference: the trigger is stated for every stage at once, because the blog doesn't
 * know hers.
 */
const LINKS = [
  {
    label: "You're hungrier, and you burn less",
    why: "Your brain uses estrogen to help set appetite and metabolism. With less of it, hunger goes up and your body burns less at rest.",
  },
  {
    label: "Weight goes to your belly",
    why: "Estrogen used to send fat to your hips and thighs. With less of it, new fat settles around your belly instead.",
  },
  {
    label: "You're losing muscle",
    why: "Estrogen helped protect it. From your 40s on you lose a little every year unless you use it, and muscle burns calories even while you sit.",
  },
] as const;

export default function MechanismClose() {
  return (
    <section className="mt-14 rounded-3xl border border-[#E8DDD9] bg-white/85 p-5 shadow-[0_20px_45px_-28px_rgba(61,61,61,0.55)] sm:p-7">
      <h2 className="text-2xl font-bold leading-snug text-[#2E2A2B]">What&apos;s really going on</h2>
      <p className="mt-3 text-[16px] leading-relaxed text-[#5B5557]">
        <strong className="text-[#2E2A2B]">What sets it off: estrogen drops.</strong>{" "}It&apos;s rising
        and falling in perimenopause, and low for good after your last period. On its own it
        doesn&apos;t add a pound. It sets off three changes:
      </p>

      <ol className="mt-4 space-y-3">
        {LINKS.map((l, i) => (
          <li key={l.label} className="flex gap-3">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#FBE9F1] text-sm font-bold text-[#C2437F]">
              {i + 1}
            </span>
            <p className="text-[16px] leading-relaxed text-[#3D3739]">
              <strong className="text-[#2E2A2B]">{l.label}.</strong> {l.why}
            </p>
          </li>
        ))}
      </ol>

      <p className="mt-5 text-[16px] leading-relaxed text-[#3D3739]">
        <strong className="text-[#2E2A2B]">
          You can&apos;t turn estrogen back up on your own. But all three of these respond to what
          you do every day.
        </strong>{" "}
        It&apos;s also why dieting works against you now: cutting calories alone costs you muscle
        too, so you burn even less. Short strength workouts help you keep and rebuild that muscle,
        so that&apos;s where a MenoLisa plan starts.
      </p>

      <div className="mt-6 flex items-center gap-4 border-t border-[#E8DDD9] pt-5">
        <div className="relative h-[90px] w-[72px] shrink-0 overflow-hidden rounded-xl ring-1 ring-black/5">
          <Image
            src={MERRY.photo}
            alt="Merry holding the MenoLisa quiz on her phone"
            fill
            sizes="72px"
            className="object-cover object-[50%_60%]"
          />
        </div>
        <p className="text-[16px] font-semibold leading-snug text-[#2E2A2B]">
          <Link href="/register" className="underline decoration-2 underline-offset-4">
            Take the free 2-minute quiz
          </Link>{" "}
          to see how this plays out in your body, and get your {PLAN_WEEKS}-week plan built
          around it.
        </p>
      </div>
    </section>
  );
}
