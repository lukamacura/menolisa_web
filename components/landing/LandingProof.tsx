import { SocialProofPolaroid } from "@/components/SocialProof";

/**
 * The same members, photos and words the funnel and paywall show
 * (lib/testimonials.ts). Draft entries never ship - see that file - so this
 * section can only ever print a story a member has confirmed.
 */
export default function LandingProof() {
  return (
    <section id="stories" className="scroll-mt-24 px-4 py-14">
      <div className="mx-auto max-w-md">
        <h2 className="text-center text-3xl font-bold text-[#2E2A2B] sm:text-4xl">
          In their own words
        </h2>
        <p className="mt-2 mb-8 text-center text-[#5B5557]">Women using MenoLisa.</p>
        <SocialProofPolaroid />
      </div>
    </section>
  );
}
