import { Suspense } from "react";
import AuthErrorRedirect from "@/components/landing/AuthErrorRedirect";
import LandingHero from "@/components/landing/LandingHero";
import LandingHowItWorks from "@/components/landing/LandingHowItWorks";
import LandingInside from "@/components/landing/LandingInside";
import LandingProof from "@/components/landing/LandingProof";
import LandingOffer from "@/components/landing/LandingOffer";
import LandingFAQ from "@/components/landing/LandingFAQ";
import LandingFooter from "@/components/landing/LandingFooter";
import LandingCtaBar from "@/components/landing/LandingCtaBar";

/**
 * The public landing page. Its only job is to send her into the /register
 * funnel: the fixed <LandingCtaBar /> is the one call to action, and nothing
 * on the page links anywhere else into the product.
 */
export default function Home() {
  return (
    <main
      className="min-h-screen"
      style={{ background: "linear-gradient(180deg, #FBE9F1 0%, #FDF4F1 28%, #FFFCF8 60%)" }}
    >
      <Suspense fallback={null}>
        <AuthErrorRedirect />
      </Suspense>
      <LandingHero />
      <LandingHowItWorks />
      <LandingInside />
      <LandingProof />
      <LandingOffer />
      <LandingFAQ />
      <LandingFooter />
      <LandingCtaBar />
    </main>
  );
}
