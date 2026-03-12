'use client';

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import LandingHero from "@/components/landing/LandingHero";

// Section placeholder: fixed height reserves space to reduce layout shift (CLS)
function SectionPlaceholder({ className = "h-[280px]" }: { className?: string }) {
  return (
    <div className={`w-full ${className}`} role="status" aria-label="Loading" aria-busy="true" />
  );
}

// Lazy load below-the-fold components for better initial page load
const QuestionStorm = dynamic(() => import("@/components/landing/QuestionStorm"), {
  loading: () => <SectionPlaceholder className="h-[420px]" />
});
const ChaosToClarity = dynamic(() => import("@/components/landing/ChaosToClarity"), {
  loading: () => <SectionPlaceholder className="h-[420px]" />
});
const LandingProblem = dynamic(() => import("@/components/landing/LandingProblem"), {
  loading: () => <SectionPlaceholder className="h-[320px]" />
});
const HowItWorksSteps = dynamic(() => import("@/components/landing/HowItWorksSteps"), {
  loading: () => <SectionPlaceholder className="h-[480px]" />
});
const FeatureTheater = dynamic(() => import("@/components/landing/FeatureTheater"), {
  loading: () => <SectionPlaceholder className="h-[480px]" />
});
const LandingSocialProof = dynamic(() => import("@/components/landing/LandingSocialProof"), {
  loading: () => <SectionPlaceholder className="h-[260px]" />
});
const LandingPricing = dynamic(() => import("@/components/landing/LandingPricing"), {
  loading: () => <SectionPlaceholder className="h-[480px]" />
});
const LandingFAQ = dynamic(() => import("@/components/landing/LandingFAQ"), {
  loading: () => <SectionPlaceholder className="h-[320px]" />
});
const LandingFinalCTA = dynamic(() => import("@/components/landing/LandingFinalCTA"), {
  loading: () => <SectionPlaceholder className="h-[160px]" />
});
const LandingFooter = dynamic(() => import("@/components/landing/LandingFooter"), {
  loading: () => <SectionPlaceholder className="h-[180px]" />
});
const SwipeButton = dynamic(() => import("@/components/SwipeButton"));

const LANDING_GRADIENT = {
  backgroundImage: `linear-gradient(135deg, #FDF2F8 0%, #FCE7F3 25%, #F5D0FE 50%, #E9D5FF 75%, #FDF2F8 100%)`,
};

// Separate component that handles auth error params - needs Suspense boundary
function AuthErrorHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Handle Supabase auth errors that redirect to home page
  useEffect(() => {
    const error = searchParams.get("error");
    const errorCode = searchParams.get("error_code");
    const errorDescription = searchParams.get("error_description");

    if (error || errorCode) {
      let errorMessage = "Authentication failed. Please try again.";
      if (errorCode === "otp_expired") {
        errorMessage = "The password reset link has expired. Please request a new one.";
      } else if (errorCode === "access_denied") {
        errorMessage = errorDescription
          ? decodeURIComponent(errorDescription)
          : "Access denied. Please try again.";
      } else if (errorDescription) {
        errorMessage = decodeURIComponent(errorDescription);
      }
      router.replace(`/login?error=auth_callback_error&message=${encodeURIComponent(errorMessage)}`);
    }
  }, [searchParams, router]);

  return null;
}

export default function Home() {
  return (
    <main className="relative overflow-hidden min-h-screen" style={LANDING_GRADIENT}>
      {/* Auth error handler - wrapped in Suspense for useSearchParams */}
      <Suspense fallback={null}>
        <AuthErrorHandler />
      </Suspense>
      
      {/* Subtle Radial Spotlights */}
      <div 
        className="fixed inset-0 -z-10 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(ellipse at 30% 50%, rgba(252, 231, 243, 0.6) 0%, transparent 50%), radial-gradient(ellipse at 80% 30%, rgba(233, 213, 255, 0.5) 0%, transparent 40%)`
        }}
      />

      {/* Glassy Bubbles - Page-wide, 40% smaller */}
      <div className="fixed inset-0 z-5 pointer-events-none overflow-hidden" aria-hidden="true">
        {/* Large bubble - top right */}
        <div
          className="glassy-bubble animate-float-1-slow"
          style={{
            width: '108px',
            height: '108px',
            top: '10%',
            right: '20%',
            animationDelay: '0s'
          }}
        />

        {/* Medium bubble - top left */}
        <div
          className="glassy-bubble animate-float-2"
          style={{
            width: '84px',
            height: '84px',
            top: '20%',
            left: '10%',
            animationDelay: '2s'
          }}
        />

        {/* Small bubble - left side middle */}
        <div
          className="glassy-bubble animate-float-3-fast"
          style={{
            width: '42px',
            height: '42px',
            top: '50%',
            left: '5%',
            animationDelay: '5s'
          }}
        />

        {/* Medium bubble - bottom left */}
        <div
          className="glassy-bubble animate-float-1"
          style={{
            width: '96px',
            height: '96px',
            bottom: '25%',
            left: '15%',
            animationDelay: '3s'
          }}
        />

        {/* Small bubble - right side */}
        <div
          className="glassy-bubble animate-float-2-medium"
          style={{
            width: '54px',
            height: '54px',
            top: '35%',
            right: '8%',
            animationDelay: '7s'
          }}
        />

        {/* Large bubble - top center */}
        <div
          className="glassy-bubble animate-float-3-slow"
          style={{
            width: '90px',
            height: '90px',
            top: '8%',
            left: '45%',
            animationDelay: '1s'
          }}
        />

        {/* Medium bubble - bottom right */}
        <div
          className="glassy-bubble animate-float-1-fast"
          style={{
            width: '66px',
            height: '66px',
            bottom: '40%',
            right: '25%',
            animationDelay: '4s'
          }}
        />

        {/* Additional bubble - center right */}
        <div
          className="glassy-bubble animate-float-2"
          style={{
            width: '78px',
            height: '78px',
            top: '60%',
            right: '15%',
            animationDelay: '6s'
          }}
        />

        {/* Additional bubbles for better coverage */}
        <div
          className="glassy-bubble animate-float-3"
          style={{
            width: '60px',
            height: '60px',
            top: '75%',
            left: '30%',
            animationDelay: '8s'
          }}
        />

        <div
          className="glassy-bubble animate-float-1"
          style={{
            width: '72px',
            height: '72px',
            top: '30%',
            left: '70%',
            animationDelay: '9s'
          }}
        />

        <div
          className="glassy-bubble animate-float-2"
          style={{
            width: '48px',
            height: '48px',
            bottom: '10%',
            left: '50%',
            animationDelay: '10s'
          }}
        />
      </div>

      <div className="relative z-10">
        <LandingHero />
        <QuestionStorm />
        <ChaosToClarity />
        <LandingProblem />
        <HowItWorksSteps />
        <FeatureTheater />
        <LandingSocialProof />
        <LandingPricing />
        <LandingFAQ />
        <LandingFinalCTA />
        <LandingFooter />
        <SwipeButton variant="home" />
      </div>
    </main>
  );
}
