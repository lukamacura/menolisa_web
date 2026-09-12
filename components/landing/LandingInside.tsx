import Image from "next/image";
import { SHOT_W, SHOT_H } from "@/lib/constants";
import { PLAN_HERO_SLIDES } from "@/lib/planShots";

/**
 * Real app screens, captioned in the funnel's own words (lib/planShots.ts).
 * The hero already shows Day 1, so this starts at the second frame. A swipe
 * row on phones, one grid row on desktop.
 */
export default function LandingInside() {
  const shots = PLAN_HERO_SLIDES.slice(1);

  return (
    <section id="inside" className="scroll-mt-24 px-4 py-14">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center text-3xl font-bold text-[#2E2A2B] sm:text-4xl">
          What&apos;s inside the app
        </h2>
        <p className="mt-2 text-center text-[#5B5557]">Real screens from MenoLisa.</p>

        <div className="-mx-4 mt-8 overflow-x-auto px-4 pb-3 snap-x snap-mandatory md:mx-0 md:overflow-visible md:px-0">
          <ul className="flex w-max gap-4 md:grid md:w-auto md:grid-cols-5">
            {shots.map((shot) => (
              <li key={shot.src} className="w-40 shrink-0 snap-start md:w-auto">
                <div className="rounded-[1.4rem] bg-[#1d1d1f] p-1 shadow-[0_16px_36px_-16px_rgba(61,61,61,0.55)]">
                  <div
                    className="overflow-hidden rounded-[1.15rem] bg-[#f5f5f7]"
                    style={{ aspectRatio: `${SHOT_W} / ${SHOT_H}` }}
                  >
                    <Image
                      src={shot.src}
                      alt={shot.alt}
                      width={SHOT_W}
                      height={SHOT_H}
                      sizes="(max-width: 768px) 160px, 190px"
                      className="h-auto w-full"
                    />
                  </div>
                </div>
                <p className="mt-2.5 text-center text-sm font-medium text-[#3D3D3D]">{shot.caption}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
