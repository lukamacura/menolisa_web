"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { BookOpen, Target, Users } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import { useReplayableInView } from "@/hooks/useReplayableInView"
import AnimatedCounter from "@/components/landing/AnimatedCounter"

// Breakpoint detection for tablet-specific optimizations
function useDeviceType(): "mobile" | "tablet" | "desktop" {
  const [deviceType, setDeviceType] = useState<"mobile" | "tablet" | "desktop">("desktop")

  useEffect(() => {
    const check = () => {
      const width = window.innerWidth
      const isCoarse = window.matchMedia("(pointer: coarse)").matches

      if (width < 768 || (isCoarse && width < 768)) {
        setDeviceType("mobile")
      } else if (width < 1024 || (isCoarse && width < 1280)) {
        setDeviceType("tablet")
      } else {
        setDeviceType("desktop")
      }
    }
    check()
    window.addEventListener("resize", check, { passive: true })
    return () => window.removeEventListener("resize", check)
  }, [])

  return deviceType
}

// Single high-converting headline - pain point + relief framing
// highlight: use \n to separate rows; each row gets its own highlight sweep
const heroContent = {
  headline: {
    before: "Finally understand",
    highlight: "what's happening\nto your body",
    after: ""
  },
  subheadline: "Stop second-guessing every symptom. Get research-backed answers in seconds, track symptoms in 30 seconds a day, and walk into your doctor's office with real data - not guesses."
}

// Animated highlight per row with sweep effect - row by row
// Using will-change for GPU acceleration
function HighlightedRow({
  children,
  isActive,
  prefersReducedMotion,
  delay = 0.25,
}: {
  children: React.ReactNode
  isActive: boolean
  prefersReducedMotion: boolean
  delay?: number
}) {
  return (
    <span className="relative inline-block">
      <span className="relative z-10">{children}</span>
      <motion.span
        className="absolute inset-0 bg-yellow-400/50 rounded-sm pointer-events-none px-0.5"
        initial={{ scaleX: 0, transformOrigin: "left" }}
        animate={isActive && !prefersReducedMotion ? { scaleX: 1 } : { scaleX: 0 }}
        transition={{
          duration: 0.5,
          delay: prefersReducedMotion ? 0 : delay,
          ease: [0.4, 0, 0.2, 1],
        }}
        style={{ 
          zIndex: 0,
          willChange: isActive ? "transform" : "auto",
        }}
      />
    </span>
  )
}

// Headline component with animation - optimized for LCP
// CRITICAL: h1 starts VISIBLE (opacity: 1) for fast LCP
// Only animate on content change (exit/enter), not initial render
function AnimatedHeadline({
  content,
  isActive,
  prefersReducedMotion
}: {
  content: typeof heroContent['headline']
  isActive: boolean
  prefersReducedMotion: boolean
}) {
  return (
    <motion.h1 
      className="text-3xl sm:text-4xl md:text-[2.75rem] lg:text-6xl font-extrabold leading-tight text-foreground px-2 sm:px-0"
      style={{ 
        textShadow: '0 2px 10px rgba(255, 255, 255, 0.5)',
        width: '100%',
        maxWidth: '100%',
        minWidth: '0',
        wordWrap: 'break-word',
        overflowWrap: 'break-word',
      }}
      // LCP FIX: Start visible immediately (opacity: 1, y: 0)
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ 
        duration: prefersReducedMotion ? 0.2 : 0.4, 
        ease: [0.16, 1, 0.3, 1] 
      }}
    >
      {content.before && <span>{content.before} </span>}
      {content.highlight.split("\n").filter(Boolean).map((line, i) => (
        <span key={i} className="block">
          <HighlightedRow
            isActive={isActive}
            prefersReducedMotion={prefersReducedMotion}
            delay={0.25 + i * 0.2}
          >
            {line}
          </HighlightedRow>
        </span>
      ))}
      {content.after && <span> {" "}{content.after}</span>}
    </motion.h1>
  )
}

// Subheadline component with animation - optimized for LCP
// CRITICAL: Starts VISIBLE for fast perceived load
function AnimatedSubheadline({ 
  text,
  prefersReducedMotion 
}: { 
  text: string
  prefersReducedMotion: boolean
}) {
  return (
    <motion.p 
      className="text-base sm:text-lg md:text-xl lg:text-2xl text-muted-foreground leading-relaxed max-w-2xl mx-auto md:mx-0 px-2 sm:px-0"
      style={{ 
        width: '100%',
        maxWidth: '100%',
        minWidth: '0',
        wordWrap: 'break-word',
        overflowWrap: 'break-word',
      }}
      // LCP FIX: Start visible immediately
      initial={{ opacity: 1, y: 0 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ 
        duration: prefersReducedMotion ? 0.2 : 0.4, 
        ease: [0.16, 1, 0.3, 1] 
      }}
    >
      {text}
    </motion.p>
  )
}

export default function LandingHero() {
  const prefersReducedMotion = useReducedMotion()
  const { ref: sectionRef, isInView, resetKey } = useReplayableInView<HTMLElement>({ amount: 0.35 })
  const deviceType = useDeviceType()

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen flex items-center justify-center pt-20 sm:pt-24 md:pt-28 pb-12 sm:pb-16 md:pb-20 overflow-x-hidden"
      style={{
        width: '100%',
        maxWidth: '100vw',
        minWidth: '0',
        boxSizing: 'border-box',
        // Safe area padding for iPads and notched devices - responsive padding that scales down on very small screens
        paddingLeft: "max(env(safe-area-inset-left, 0px), clamp(0.75rem, 2vw, 1.5rem))",
        paddingRight: "max(env(safe-area-inset-right, 0px), clamp(0.75rem, 2vw, 1.5rem))",
        paddingBottom: "max(env(safe-area-inset-bottom, 0px), 3rem)",
      }}
    >
      <LandingHeroInner
        key={resetKey}
        isInView={isInView}
        prefersReducedMotion={!!prefersReducedMotion}
        deviceType={deviceType}
      />
    </section>
  )
}

function LandingHeroInner({
  isInView,
  prefersReducedMotion,
  deviceType,
}: {
  isInView: boolean
  prefersReducedMotion: boolean
  deviceType: "mobile" | "tablet" | "desktop"
}) {
  // Per-device sizing for the hero image
  const imageSizes =
    deviceType === "mobile"
      ? "(max-width: 640px) 90vw, 70vw"
      : deviceType === "tablet"
      ? "(max-width: 1024px) 50vw, 45vw"
      : "(max-width: 1280px) 45vw, 640px"

  return (
    <>
      {/* Corner Blobs - Only 2, very subtle - Reduced on mobile */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Blob 1 - Top Right Corner (behind mockups) */}
        <div
          className="absolute -top-10 sm:-top-20 -right-10 sm:-right-20 w-48 h-48 sm:w-96 sm:h-96 rounded-full"
          style={{
            background: `radial-gradient(circle, rgba(233, 213, 255, 0.4) 0%, transparent 70%)`,
            filter: 'blur(60px)',
            opacity: 0.08,
            pointerEvents: 'none'
          }}
        />

        {/* Blob 2 - Bottom Left Corner */}
        <div
          className="absolute -bottom-10 sm:-bottom-20 -left-10 sm:-left-20 w-40 h-40 sm:w-80 sm:h-80 rounded-full"
          style={{
            background: `radial-gradient(circle, rgba(252, 231, 243, 0.4) 0%, transparent 70%)`,
            filter: 'blur(50px)',
            opacity: 0.08,
            pointerEvents: 'none'
          }}
        />
      </div>

      {/* Main Content - Tablet-optimized grid */}
      <div className="relative z-10 w-full" style={{ width: '100%', maxWidth: 'min(100vw, 80rem)', minWidth: '0', marginLeft: 'auto', marginRight: 'auto', paddingLeft: '0', paddingRight: '0' }}>
        <div className="grid md:grid-cols-2 gap-6 sm:gap-8 md:gap-10 lg:gap-12 items-center w-full" style={{ width: '100%', maxWidth: '100%', minWidth: '0', boxSizing: 'border-box' }}>
          {/* Left: Text Content */}
          <div
            className="text-center md:text-left space-y-4 sm:space-y-5 md:space-y-6 relative z-20 w-full"
            style={{ width: '100%', minWidth: '0', maxWidth: '100%' }}
          >
            {/* Audience badge */}
            <div className="flex justify-center md:justify-start">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs sm:text-sm font-medium bg-primary/10 text-primary border border-primary/20">
                <span>🌸</span>
                For women in perimenopause &amp; menopause
              </span>
            </div>

            {/* Headline */}
            <div className="text-left">
              <AnimatedHeadline
                content={heroContent.headline}
                isActive={isInView}
                prefersReducedMotion={prefersReducedMotion}
              />
            </div>

            {/* Subheadline */}
            <div className="text-left">
              <AnimatedSubheadline
                text={heroContent.subheadline}
                prefersReducedMotion={prefersReducedMotion}
              />
            </div>

            {/* Trust Badges - Inline Strip - LCP optimized: visible immediately */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 sm:gap-4 md:gap-6 text-xs sm:text-sm text-muted-foreground pt-2 px-2 sm:px-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <BookOpen className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 text-primary shrink-0" />
                <span className="whitespace-nowrap">Research-backed</span>
              </div>
              <div className="hidden sm:block w-px h-3 sm:h-4 bg-border opacity-30" />
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 text-primary shrink-0" />
                <span className="whitespace-nowrap">Available 24/7</span>
              </div>
              <div className="hidden sm:block w-px h-3 sm:h-4 bg-border opacity-30" />
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 md:h-5 md:w-5 text-primary shrink-0" />
                <span className="whitespace-nowrap"><AnimatedCounter target={1728} /> trust Lisa</span>
              </div>
            </div>

            {/* Social Proof - LCP optimized: visible immediately */}
            <div 
              className="flex flex-col sm:flex-row items-center justify-center md:justify-start gap-2 sm:gap-3 pt-1 px-2 sm:px-0"
            >
              <div className="flex -space-x-2 shrink-0">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="w-7 h-7 sm:w-8 sm:h-8 md:w-10 md:h-10 rounded-full border-2 border-background"
                    style={{
                      background: `linear-gradient(135deg, var(--primary) 0%, var(--chart-1) 100%)`,
                      opacity: 0.8 - (i * 0.1)
                    }}
                  />
                ))}
              </div>
              <span className="text-xs sm:text-sm md:text-base text-muted-foreground text-center sm:text-left">
                Join <AnimatedCounter target={1728} className="font-semibold text-foreground" /> women who stopped guessing
              </span>
            </div>
          </div>

          {/* Right: Hero Image – per-device optimized */}
          <div className="relative z-10 w-full flex justify-center md:justify-end" style={{ width: '100%', maxWidth: '100%', minWidth: '0' }}>
            <motion.div
              className="relative w-full"
              style={{
                maxWidth: deviceType === "mobile" ? "22rem" : deviceType === "tablet" ? "28rem" : "40rem",
                aspectRatio: "1 / 1",
                willChange: "opacity, transform",
              }}
              initial={{ opacity: 0.9, y: 8, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                duration: prefersReducedMotion ? 0.15 : 0.4,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Image
                src="/hero.png"
                alt="Lisa app on phone"
                fill
                priority
                sizes={imageSizes}
                className="object-contain"
              />
            </motion.div>
          </div>
        </div>
      </div>
    </>
  )
}
