/* eslint-disable react-hooks/set-state-in-effect */
"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { motion, useReducedMotion, AnimatePresence } from "framer-motion"
import { 
  Hand, 
  Check, 
  Plus,
  Flame,
  Moon,
  Heart,
  Calendar,
  TrendingDown,
  Sparkles,
  MessageCircle
} from "lucide-react"
import { useReplayableInView } from "@/hooks/useReplayableInView"
import { HighlightedTextByRows } from "@/components/landing/HighlightedTextByRows"

// Smooth spring configs
const smoothSpring = {
  type: "spring" as const,
  damping: 30,
  stiffness: 400,
}

const ultraSmoothSpring = {
  type: "spring" as const,
  damping: 35,
  stiffness: 350,
}

// Animation timing constants (in ms)
const TIMING = {
  CROSSFADE: 300,
  STEP_HOLD: 900,
  STEP_1_ANIMATION: 3500, // User question + typing + Lisa response
  STEP_2_ANIMATION: 1400,
  STEP_3_ANIMATION: 1400,
} as const

export default function HowItWorksSteps() {
  const prefersReducedMotion = useReducedMotion()
  const { ref, isInView, resetKey } = useReplayableInView<HTMLElement>({ amount: 0.3 })

  return (
    <section
      ref={ref}
      id="how-it-works"
      className="relative py-16 sm:py-20 px-4 overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #F5E6FF 0%, #E6D5FF 100%)",
      }}
    >
      <HowItWorksStepsInner
        key={resetKey}
        isInView={isInView}
        prefersReducedMotion={!!prefersReducedMotion}
      />
    </section>
  )
}

function HowItWorksStepsInner({
  isInView,
  prefersReducedMotion,
}: {
  isInView: boolean
  prefersReducedMotion: boolean
}) {
  const [currentStep, setCurrentStep] = useState(1)

  const getStepDuration = useCallback((step: number) => {
    const animationTimes = {
      1: TIMING.STEP_1_ANIMATION,
      2: TIMING.STEP_2_ANIMATION,
      3: TIMING.STEP_3_ANIMATION,
    }
    return animationTimes[step as keyof typeof animationTimes] + TIMING.STEP_HOLD
  }, [])

  useEffect(() => {
    if (!isInView || prefersReducedMotion) return

    const timeoutId = setTimeout(() => {
      setCurrentStep((prev) => (prev % 3) + 1)
    }, getStepDuration(currentStep) + TIMING.CROSSFADE)

    return () => clearTimeout(timeoutId)
  }, [isInView, prefersReducedMotion, currentStep, getStepDuration])

  return (
      <div className="max-w-[1200px] mx-auto">
        {/* Heading */}
        <motion.div
          className="text-center mb-10 sm:mb-14"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={ultraSmoothSpring}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-4 text-gray-900">
            <HighlightedTextByRows
              text="How It Works"
              isInView={isInView}
              prefersReducedMotion={prefersReducedMotion}
              delayMs={300}
            />
          </h2>
          <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto">
            Three steps to clarity
          </p>
        </motion.div>

        {/* Step Indicators */}
        <StepIndicators
          currentStep={currentStep}
          prefersReducedMotion={prefersReducedMotion}
          isInView={isInView}
          onSelect={setCurrentStep}
        />

        {/* Phone Frame Container */}
        <div className="flex justify-center my-6 sm:my-10">
          <div className="relative w-full max-w-[240px] sm:max-w-[260px]">
            <AnimatePresence mode="wait">
              {currentStep === 1 && (
                <ChatInterfacePhone
                  key="step-1"
                  prefersReducedMotion={prefersReducedMotion}
                  isInView={isInView}
                />
              )}
              {currentStep === 2 && (
                <SymptomTrackingPhone
                  key="step-2"
                  prefersReducedMotion={prefersReducedMotion}
                  isInView={isInView}
                />
              )}
              {currentStep === 3 && (
                <DataTimelinePhone
                  key="step-3"
                  prefersReducedMotion={prefersReducedMotion}
                  isInView={isInView}
                />
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Step Labels */}
        <StepLabels
          currentStep={currentStep}
          prefersReducedMotion={prefersReducedMotion}
          isInView={isInView}
        />
      </div>
  )
}

// ============================================
// Step Indicators
// ============================================
function StepIndicators({
  currentStep,
  prefersReducedMotion,
  isInView,
  onSelect,
}: {
  currentStep: number
  prefersReducedMotion: boolean
  isInView: boolean
  onSelect?: (step: number) => void
}) {
  return (
    <div className="flex justify-center gap-3 mb-6 sm:mb-8">
      {[1, 2, 3].map((step) => {
        const isActive = currentStep === step
        return (
          <motion.button
            key={step}
            type="button"
            onClick={() => onSelect?.(step)}
            aria-label={`Go to step ${step}`}
            className={`h-2 rounded-full transition-colors duration-300 ${
              isActive
                ? "bg-linear-to-r from-[#FF6B9D] to-[#FFA07A]"
                : "bg-gray-300 hover:bg-gray-400"
            }`}
            animate={isInView ? { width: isActive ? 40 : 8 } : { width: 8 }}
            transition={{ ...smoothSpring, duration: prefersReducedMotion ? 0 : 0.4 }}
          />
        )
      })}
    </div>
  )
}

// ============================================
// Step Labels
// ============================================
function StepLabels({
  currentStep,
  prefersReducedMotion,
  isInView,
}: {
  currentStep: number
  prefersReducedMotion: boolean
  isInView: boolean
}) {
  const stepTexts = [
    "Type your question. Lisa replies in seconds.",
    "Tap a symptom. Lisa learns your patterns.",
    "Your timeline, ready to share with your doctor.",
  ]

  return (
    <div className="mt-6 sm:mt-10 min-h-[56px] flex items-center justify-center">
      <AnimatePresence mode="wait">
        <motion.div
          key={`label-${currentStep}`}
          initial={{ opacity: 0, y: 10 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ ...smoothSpring, duration: prefersReducedMotion ? 0 : 0.4 }}
          className="text-center px-4"
        >
          <p className="text-lg sm:text-xl md:text-2xl text-gray-700 font-semibold leading-tight">
            {stepTexts[currentStep - 1]}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ============================================
// Phone Frame (UNCHANGED)
// ============================================
function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative rounded-[2.5rem] border-[3px] border-gray-900 w-full aspect-9/18 shadow-2xl"
      style={{
        boxShadow:
          "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.05)",
      }}
    >
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-5 bg-gray-900 rounded-full z-10" />
      <div className="w-full h-full rounded-[2.25rem] bg-white overflow-hidden relative">
        <div className="w-full h-full pt-8 pb-12">{children}</div>
        {/* Home Indicator */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[107px] h-1 bg-gray-900 rounded-full z-10" />
      </div>
    </div>
  )
}

const phoneTransition = {
  initial: { opacity: 0, scale: 0.96 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
}

// ============================================
// Step 1: Symptom Tracking Phone (Enhanced)
// ============================================
function SymptomTrackingPhone({
  prefersReducedMotion,
  isInView,
}: {
  prefersReducedMotion: boolean
  isInView: boolean
}) {
  const [phase, setPhase] = useState(0)

  const symptoms = useMemo(() => [
    { id: "hot", label: "Hot Flash", icon: Flame, color: "bg-orange-100 text-orange-600" },
    { id: "sleep", label: "Poor Sleep", icon: Moon, color: "bg-indigo-100 text-indigo-600" },
    { id: "mood", label: "Mood Swing", icon: Heart, color: "bg-pink-100 text-pink-600" },
  ], [])

  useEffect(() => {
    if (!isInView) return
    if (prefersReducedMotion) {
      setPhase(6)
      return
    }
    setPhase(0)
    const timers: NodeJS.Timeout[] = []
    timers.push(setTimeout(() => setPhase(1), 100))   // Header
    timers.push(setTimeout(() => setPhase(2), 400))   // Symptom buttons
    timers.push(setTimeout(() => setPhase(3), 800))   // Finger appears
    timers.push(setTimeout(() => setPhase(4), 1200))  // Tap
    timers.push(setTimeout(() => setPhase(5), 1500))  // Selected card
    timers.push(setTimeout(() => setPhase(6), 1800))  // Checkmark
    return () => timers.forEach(clearTimeout)
  }, [isInView, prefersReducedMotion])

  const showHeader = phase >= 1
  const showButtons = phase >= 2
  const showFinger = phase >= 3 && phase < 5
  const buttonTapped = phase >= 4
  const showSelected = phase >= 5
  const showCheck = phase >= 6

  return (
    <motion.div
      variants={phoneTransition}
      initial="initial"
      animate={isInView ? "animate" : "initial"}
      exit="exit"
      transition={{ ...ultraSmoothSpring, duration: prefersReducedMotion ? 0 : 0.5 }}
      className="w-full"
    >
      <PhoneFrame>
        <div className="h-full p-4 flex flex-col gap-3 bg-gray-50">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={showHeader ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
            transition={{ ...smoothSpring, duration: prefersReducedMotion ? 0 : 0.3 }}
            className="h-11 bg-linear-to-r from-[#FF6B9D] to-[#FFA07A] rounded-xl flex items-center justify-center gap-2 shrink-0 shadow-sm"
          >
            <Plus className="w-4 h-4 text-white" />
            <span className="text-white text-sm font-semibold">Quick Log</span>
          </motion.div>

          {/* Symptom Selection Grid */}
          <div className="flex-1 flex flex-col gap-2">
            <motion.p
              initial={{ opacity: 0 }}
              animate={showButtons ? { opacity: 1 } : { opacity: 0 }}
              className="text-xs font-medium text-gray-500 px-1"
            >
              How are you feeling?
            </motion.p>
            
            <div className="grid grid-cols-1 gap-2 relative">
              {symptoms.map((symptom, index) => {
                const Icon = symptom.icon
                const isFirst = index === 0
                const isSelected = showSelected && isFirst
                
                return (
                  <motion.div
                    key={symptom.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={showButtons ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                    transition={{ 
                      ...smoothSpring, 
                      delay: prefersReducedMotion ? 0 : index * 0.08,
                    }}
                  >
                    <motion.button
                      className={`
                        w-full flex items-center gap-3 p-3 rounded-xl border-2 transition-colors
                        ${isSelected 
                          ? "bg-pink-50 border-[#FF6B9D]" 
                          : "bg-white border-gray-100 hover:border-gray-200"
                        }
                      `}
                      animate={buttonTapped && isFirst ? { scale: 0.97 } : { scale: 1 }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${symptom.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="text-sm font-medium text-gray-700">{symptom.label}</span>
                      
                      {/* Check indicator */}
                      <AnimatePresence>
                        {isSelected && (
                          <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="ml-auto"
                          >
                            <div className="w-5 h-5 rounded-full bg-[#FF6B9D] flex items-center justify-center">
                              <Check className="w-3 h-3 text-white" strokeWidth={3} />
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </motion.div>
                )
              })}

              {/* Finger Pointer */}
              <AnimatePresence>
                {showFinger && !prefersReducedMotion && (
                  <motion.div
                    className="absolute right-4 top-6 pointer-events-none"
                    initial={{ x: 40, opacity: 0 }}
                    animate={{ x: 0, opacity: 1, scale: buttonTapped ? 0.85 : 1 }}
                    exit={{ x: 40, opacity: 0 }}
                    transition={{ ...smoothSpring }}
                  >
                    <Hand className="h-7 w-7 text-[#FF6B9D] rotate-[-15deg]" />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Success Message */}
            <AnimatePresence>
              {showCheck && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={smoothSpring}
                  className="mt-auto p-3 bg-green-50 rounded-xl border border-green-100 flex items-center gap-3"
                >
                  <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
                    <Check className="h-4 w-4 text-white" strokeWidth={3} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-green-800">Logged!</p>
                    <p className="text-xs text-green-600">Hot Flash • Just now</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </PhoneFrame>
    </motion.div>
  )
}

// ============================================
// Step 2: Data Timeline Phone (Enhanced)
// ============================================
function DataTimelinePhone({
  prefersReducedMotion,
  isInView,
}: {
  prefersReducedMotion: boolean
  isInView: boolean
}) {
  const [phase, setPhase] = useState(0)
  const symptomDays = useMemo(() => [3, 7, 10, 14, 17, 21, 24], [])

  useEffect(() => {
    if (!isInView) return
    if (prefersReducedMotion) {
      setPhase(7)
      return
    }
    setPhase(0)
    const timers: NodeJS.Timeout[] = []
    timers.push(setTimeout(() => setPhase(1), 100))
    timers.push(setTimeout(() => setPhase(2), 400))
    timers.push(setTimeout(() => setPhase(3), 700))
    timers.push(setTimeout(() => setPhase(4), 950))
    timers.push(setTimeout(() => setPhase(5), 1200))
    timers.push(setTimeout(() => setPhase(6), 1450))
    timers.push(setTimeout(() => setPhase(7), 1700))
    return () => timers.forEach(clearTimeout)
  }, [isInView, prefersReducedMotion])

  const showHeader = phase >= 1
  const showCalendar = phase >= 2
  const visibleCount = Math.max(0, Math.min(phase - 2, 7))
  const showSummary = phase >= 7

  return (
    <motion.div
      variants={phoneTransition}
      initial="initial"
      animate={isInView ? "animate" : "initial"}
      exit="exit"
      transition={{ ...ultraSmoothSpring, duration: prefersReducedMotion ? 0 : 0.5 }}
      className="w-full"
    >
      <PhoneFrame>
        <div className="h-full p-4 flex flex-col gap-3 bg-gray-50">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={showHeader ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
            transition={{ ...smoothSpring }}
            className="h-11 bg-linear-to-r from-[#FF6B9D] to-[#FFA07A] rounded-xl flex items-center justify-center gap-2 shrink-0 shadow-sm"
          >
            <Calendar className="w-4 h-4 text-white" />
            <span className="text-white text-sm font-semibold">Your Timeline</span>
          </motion.div>

          {/* Calendar */}
          <div className="flex-1 flex flex-col justify-center">
            <AnimatePresence>
              {showCalendar && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...smoothSpring }}
                  className="bg-white rounded-xl p-3 shadow-sm"
                >
                  <div className="text-center text-sm font-semibold text-gray-700 mb-2">
                    January 2026
                  </div>

                  <div className="grid grid-cols-7 gap-1 mb-1">
                    {["S", "M", "T", "W", "T", "F", "S"].map((day, i) => (
                      <div key={i} className="text-[10px] font-medium text-center py-1 text-gray-400">
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: 28 }, (_, i) => {
                      const day = i + 1
                      const isSymptom = symptomDays.includes(day)
                      const idx = symptomDays.indexOf(day)
                      const isVisible = isSymptom && idx < visibleCount

                      return (
                        <div key={day} className="aspect-square relative flex items-center justify-center">
                          <motion.div
                            className={`
                              absolute inset-0.5 rounded-md flex items-center justify-center text-[11px] font-medium
                              ${isVisible ? "bg-[#FF6B9D] text-white shadow-sm" : "text-gray-600"}
                            `}
                            initial={isSymptom ? { scale: 0.5, opacity: 0 } : {}}
                            animate={isVisible ? { scale: 1, opacity: 1 } : {}}
                            transition={{ ...smoothSpring }}
                          >
                            {day}
                          </motion.div>
                          {!isSymptom && (
                            <span className="text-[11px] font-medium text-gray-500">{day}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {/* Summary */}
                  <AnimatePresence>
                    {showSummary && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ ...smoothSpring }}
                        className="mt-3 p-3 bg-linear-to-r from-pink-50 to-orange-50 rounded-xl border border-pink-100"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <TrendingDown className="w-4 h-4 text-green-600" />
                            <span className="text-xs font-bold text-gray-800">15 logged • 20% vs last month</span>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </PhoneFrame>
    </motion.div>
  )
}

// ============================================
// Step 1: Chat Interface Phone
// ============================================

// Rich text renderer for Lisa's styled responses
function RichText({ text }: { text: string }) {
  // Parse **bold** syntax
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <span key={i} className="font-bold text-amber-700">
              {part.slice(2, -2)}
            </span>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function ChatInterfacePhone({
  prefersReducedMotion,
  isInView,
}: {
  prefersReducedMotion: boolean
  isInView: boolean
}) {
  const [phase, setPhase] = useState(0)

  // User question and Lisa's response (concise)
  const userQuestion = "Why do I suddenly gain weight?"
  const lisaResponse = useMemo(() => [
    { 
      type: "intro", 
      content: "It's **like your body hit 'update software' at 45** without warning 💜" 
    },
    { 
      type: "highlight", 
      content: "As estrogen drops, you become **more insulin resistant** — storing more around the belly." 
    },
    { 
      type: "tips", 
      items: [
        "🏋️ Strength training",
        "🥗 Protein + fiber meals",
        "🌙 Protect your sleep",
      ]
    },
    { 
      type: "outro", 
      content: "Your metabolism isn't broken — it's adaptive 🌿" 
    },
  ], [])

  useEffect(() => {
    if (!isInView) return
    if (prefersReducedMotion) {
      setPhase(4)
      return
    }
    setPhase(0)
    const timers: NodeJS.Timeout[] = []
    timers.push(setTimeout(() => setPhase(1), 60))    // Header
    timers.push(setTimeout(() => setPhase(2), 300))   // User question appears
    timers.push(setTimeout(() => setPhase(3), 700))   // Lisa typing dots
    timers.push(setTimeout(() => setPhase(4), 1400))  // Lisa's response appears instantly
    return () => timers.forEach(clearTimeout)
  }, [isInView, prefersReducedMotion])

  const showHeader = phase >= 1
  const showUserQuestion = phase >= 2
  const showTyping = phase === 3
  const showMessage = phase >= 4

  return (
    <motion.div
      variants={phoneTransition}
      initial="initial"
      animate={isInView ? "animate" : "initial"}
      exit="exit"
      transition={{ ...ultraSmoothSpring, duration: prefersReducedMotion ? 0 : 0.5 }}
      className="w-full"
    >
      <PhoneFrame>
        <div className="h-full p-3 flex flex-col bg-gray-50">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={showHeader ? { opacity: 1, y: 0 } : { opacity: 0, y: -10 }}
            transition={{ ...smoothSpring }}
            className="h-10 bg-linear-to-r from-[#FF6B9D] to-[#FFA07A] rounded-xl flex items-center justify-center gap-2 shrink-0 shadow-sm"
          >
            <MessageCircle className="w-3.5 h-3.5 text-white" />
            <span className="text-white text-xs font-semibold">Chat with Lisa</span>
          </motion.div>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col py-2 min-h-0 overflow-hidden">
            {/* User Question */}
            {showUserQuestion && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ ...smoothSpring }}
                className="flex items-start gap-1.5 justify-end mb-2"
              >
                <div className="max-w-[88%]">
                  <div className="bg-[#FFE5F0] rounded-2xl rounded-tr-sm px-3 py-2 shadow-sm">
                    <p className="text-xs text-gray-800 font-medium">{userQuestion}</p>
                  </div>
                </div>
              </motion.div>
            )}

            <AnimatePresence mode="wait">
              {/* Typing Indicator */}
              {showTyping && (
                <motion.div
                  key="typing"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ ...smoothSpring }}
                  className="flex items-start gap-1.5"
                >
                  <div className="w-6 h-6 rounded-full bg-linear-to-br from-[#FF6B9D] to-[#FFA07A] flex items-center justify-center shrink-0 shadow-sm">
                    <span className="text-white text-[9px] font-bold">L</span>
                  </div>
                  <div className="bg-[#FFE5F0] rounded-2xl rounded-tl-sm px-3 py-2">
                    <div className="flex gap-1 items-center h-3">
                      {[0, 1, 2].map((i) => (
                        <motion.div
                          key={i}
                          className="w-1.5 h-1.5 bg-[#FF6B9D] rounded-full"
                          animate={isInView && !prefersReducedMotion ? { y: [0, -3, 0] } : { y: 0 }}
                          transition={
                            isInView && !prefersReducedMotion
                              ? { duration: 0.6, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }
                              : { duration: 0 }
                          }
                        />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Lisa's Rich Message */}
              {showMessage && (
                <motion.div
                  key="message"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...smoothSpring }}
                  className="flex items-start gap-1.5"
                >
                  {/* Avatar */}
                  <div className="w-6 h-6 rounded-full bg-linear-to-br from-[#FF6B9D] to-[#FFA07A] flex items-center justify-center shrink-0 shadow-sm">
                    <Sparkles className="w-3 h-3 text-white" />
                  </div>
                  
                  {/* Message Content */}
                  <div className="flex-1 max-w-[88%]">
                    <span className="text-[10px] font-semibold text-[#FF6B9D] ml-1 mb-0.5 block">Lisa</span>
                    <div className="bg-yellow-200 rounded-2xl rounded-tl-sm px-3 py-2.5 shadow-sm space-y-2">
                      {lisaResponse.map((item, index) => (
                        <div key={index}>
                          {item.type === "intro" && item.content && (
                            <p className="text-xs text-gray-800 leading-relaxed font-medium">
                              <RichText text={item.content} />
                            </p>
                          )}
                          {item.type === "explanation" && item.content && (
                            <p className="text-xs text-gray-700 leading-relaxed">
                              <RichText text={item.content} />
                            </p>
                          )}
                          {item.type === "highlight" && item.content && (
                            <div className="bg-white/60 rounded-lg px-2.5 py-2 border-l-2 border-amber-500">
                              <p className="text-xs text-gray-800 leading-relaxed">
                                <RichText text={item.content} />
                              </p>
                            </div>
                          )}
                          {item.type === "tips" && item.items && (
                            <div className="bg-white/40 rounded-lg p-2 space-y-1">
                              {item.items.map((tip, tipIdx) => (
                                <p key={tipIdx} className="text-[11px] text-gray-700 leading-snug font-medium">
                                  {tip}
                                </p>
                              ))}
                            </div>
                          )}
                          {item.type === "outro" && item.content && (
                            <p className="text-xs font-semibold text-amber-700 pt-0.5">
                              <RichText text={item.content} />
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </PhoneFrame>
    </motion.div>
  )
}
