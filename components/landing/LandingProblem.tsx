"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence, useReducedMotion } from "framer-motion"
import { useReplayableInView } from "@/hooks/useReplayableInView"
import { Check, FileText, MessageCircle, Send } from "lucide-react"
import { HighlightedTextByRows } from "@/components/landing/HighlightedTextByRows"

// Smooth spring config for premium feel
const smoothSpring = {
  type: "spring" as const,
  damping: 30,
  stiffness: 400,
}

const ultraSmoothSpring = {
  type: "spring" as const,
  damping: 40,
  stiffness: 350,
}

// ============================================
// Animation 1: Scattered Symptoms (Confusion)
// Message: "You know something's wrong"
// Visual: Symptoms floating chaotically with question marks
// ============================================
function ScatteredSymptomsAnimation({ 
  prefersReducedMotion,
  isInView 
}: { 
  prefersReducedMotion: boolean | null
  isInView: boolean
}) {
  const symptoms = [
    { id: "hot", label: "Hot Flash", x: 20, y: 25, delay: 0 },
    { id: "mood", label: "Mood Swing", x: 70, y: 20, delay: 0.1 },
    { id: "brain", label: "Brain Fog", x: 25, y: 70, delay: 0.2 },
    { id: "sleep", label: "Poor Sleep", x: 75, y: 65, delay: 0.3 },
    { id: "fatigue", label: "Fatigue", x: 50, y: 45, delay: 0.15 },
  ]

  if (prefersReducedMotion) {
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        {symptoms.map((s) => (
          <div
            key={s.id}
            className="absolute px-4 py-2 rounded-full bg-red-100 border border-red-200 text-sm font-medium text-red-800"
            style={{ left: `${s.x}%`, top: `${s.y}%`, transform: 'translate(-50%, -50%)' }}
          >
            {s.label}
          </div>
        ))}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-4xl text-red-400 font-bold">
          ?
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      {/* Symptom bubbles floating chaotically */}
      {symptoms.map((symptom, index) => (
        <motion.div
          key={symptom.id}
          className="absolute"
          style={{ left: `${symptom.x}%`, top: `${symptom.y}%` }}
          initial={{ opacity: 0, scale: 0, x: "-50%", y: "-50%" }}
          animate={isInView ? {
            opacity: 1,
            scale: 1,
            x: ["-50%", "-45%", "-55%", "-50%"],
            y: ["-50%", "-55%", "-45%", "-50%"],
            rotate: [-3, 3, -3],
          } : { opacity: 0, scale: 0 }}
          transition={{
            opacity: { duration: 0.5, delay: symptom.delay },
            scale: { ...smoothSpring, delay: symptom.delay },
            x: { duration: 4, repeat: Infinity, ease: "easeInOut", delay: index * 0.3 },
            y: { duration: 3.5, repeat: Infinity, ease: "easeInOut", delay: index * 0.2 },
            rotate: { duration: 3, repeat: Infinity, ease: "easeInOut", delay: index * 0.1 },
          }}
        >
          <div className="px-4 py-2 rounded-full bg-red-50 border-2 border-red-200 shadow-lg backdrop-blur-sm">
            <span className="text-sm font-semibold text-red-700">{symptom.label}</span>
          </div>
          
          {/* Floating question mark */}
          <motion.span
            className="absolute -top-3 -right-2 text-red-400 text-lg font-bold"
            animate={
              isInView
                ? { y: [0, -6, 0], opacity: [0.5, 1, 0.5] }
                : { y: 0, opacity: 0 }
            }
            transition={
              isInView
                ? { duration: 2, repeat: Infinity, delay: index * 0.15, ease: "easeInOut" }
                : { duration: 0 }
            }
          >
            ?
          </motion.span>
        </motion.div>
      ))}

      {/* Central large question mark */}
      <motion.div
        className="absolute left-1/2 top-1/2"
        initial={{ opacity: 0, scale: 0 }}
        animate={isInView ? { 
          opacity: [0, 0.3, 0.15, 0.3],
          scale: 1,
          rotate: [0, 5, -5, 0],
        } : { opacity: 0, scale: 0 }}
        transition={{
          opacity: { duration: 3, repeat: Infinity, ease: "easeInOut" },
          scale: { ...ultraSmoothSpring, delay: 0.3 },
          rotate: { duration: 4, repeat: Infinity, ease: "easeInOut" },
        }}
        style={{ x: "-50%", y: "-50%" }}
      >
        <span className="text-8xl font-bold text-red-300/50">?</span>
      </motion.div>

      {/* Subtle confusion lines */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
        <motion.path
          d="M 100 150 Q 200 100 300 180 Q 400 250 500 150"
          stroke="#ef4444"
          strokeWidth="2"
          fill="none"
          strokeDasharray="8 8"
          initial={{ pathLength: 0 }}
          animate={isInView ? { pathLength: [0, 1, 0] } : { pathLength: 0 }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.path
          d="M 150 250 Q 250 180 350 280 Q 450 150 550 220"
          stroke="#f87171"
          strokeWidth="2"
          fill="none"
          strokeDasharray="8 8"
          initial={{ pathLength: 0 }}
          animate={isInView ? { pathLength: [0, 1, 0] } : { pathLength: 0 }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
        />
      </svg>
    </div>
  )
}

// ============================================
// Animation 2: Organized Tracking
// Message: "Track it. See it organized."
// Visual: Phone screen with symptoms organizing into rows
// ============================================
function OrganizedTrackingAnimation({ 
  prefersReducedMotion,
  isInView 
}: { 
  prefersReducedMotion: boolean | null
  isInView: boolean
}) {
  const symptoms = [
    { id: "hot", label: "Hot Flash", color: "bg-orange-400" },
    { id: "mood", label: "Mood Swing", color: "bg-purple-400" },
    { id: "sleep", label: "Poor Sleep", color: "bg-blue-400" },
    { id: "fatigue", label: "Fatigue", color: "bg-green-400" },
  ]

  if (prefersReducedMotion) {
    return (
      <div className="relative w-full h-full flex items-center justify-center">
        <div className="w-64 bg-white rounded-3xl shadow-2xl p-4 border border-gray-100">
          <div className="h-8 bg-linear-to-r from-pink-400 to-orange-300 rounded-xl mb-4" />
          {symptoms.map((s) => (
            <div key={s.id} className="flex items-center gap-3 py-2 border-b border-gray-100">
              <div className={`w-3 h-3 rounded-full ${s.color}`} />
              <span className="text-sm text-gray-700">{s.label}</span>
              <Check className="w-4 h-4 text-green-500 ml-auto" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      {/* Phone mockup */}
      <motion.div
        className="relative w-64 sm:w-72 bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-200"
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={isInView ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 30, scale: 0.95 }}
        transition={ultraSmoothSpring}
      >
        {/* Phone header */}
        <motion.div
          className="h-12 bg-linear-to-r from-pink-400 to-orange-300 flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
        >
          <span className="text-white font-semibold text-sm">Today&apos;s Tracking</span>
        </motion.div>

        {/* Content area */}
        <div className="p-4 space-y-1">
          {symptoms.map((symptom, index) => (
            <motion.div
              key={symptom.id}
              className="flex items-center gap-3 py-3 px-3 rounded-xl"
              initial={{ opacity: 0, x: -30 }}
              animate={isInView ? { 
                opacity: 1, 
                x: 0,
                backgroundColor: ["rgba(0,0,0,0)", "rgba(249,250,251,1)", "rgba(249,250,251,1)"],
              } : { opacity: 0, x: -30 }}
              transition={{
                opacity: { duration: 0.4, delay: 0.4 + index * 0.15 },
                x: { ...smoothSpring, delay: 0.4 + index * 0.15 },
                backgroundColor: { duration: 0.3, delay: 0.6 + index * 0.15 },
              }}
            >
              {/* Color dot */}
              <motion.div
                className={`w-3 h-3 rounded-full ${symptom.color}`}
                initial={{ scale: 0 }}
                animate={isInView ? { scale: 1 } : { scale: 0 }}
                transition={{ ...smoothSpring, delay: 0.5 + index * 0.15 }}
              />
              
              {/* Label */}
              <span className="text-sm font-medium text-gray-700 flex-1">{symptom.label}</span>
              
              {/* Checkmark */}
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={isInView ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
                transition={{ ...smoothSpring, delay: 0.7 + index * 0.15 }}
              >
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
                  <Check className="w-4 h-4 text-green-600" />
                </div>
              </motion.div>
            </motion.div>
          ))}

          {/* Summary badge */}
          <motion.div
            className="mt-4 py-3 px-4 bg-linear-to-r from-pink-50 to-orange-50 rounded-xl border border-pink-100"
            initial={{ opacity: 0, y: 10 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={{ ...smoothSpring, delay: 1.3 }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-pink-700">4 symptoms logged today</span>
              <motion.div
                animate={isInView ? { scale: [1, 1.2, 1] } : {}}
                transition={{ duration: 0.5, delay: 1.5 }}
              >
                <span className="text-lg">✓</span>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      {/* Floating elements for polish */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-4 h-4 rounded-full bg-pink-200"
        animate={
          isInView
            ? { y: [0, -10, 0], opacity: [0.3, 0.6, 0.3] }
            : { y: 0, opacity: 0 }
        }
        transition={isInView ? { duration: 3, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-3 h-3 rounded-full bg-orange-200"
        animate={
          isInView
            ? { y: [0, -8, 0], opacity: [0.3, 0.6, 0.3] }
            : { y: 0, opacity: 0 }
        }
        transition={
          isInView
            ? { duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }
            : { duration: 0 }
        }
      />
    </div>
  )
}

// ============================================
// Animation 3: Take Control (Reports + Chat)
// Message: "Take control with real data"
// Visual: Document/report + chat bubble
// ============================================
function TakeControlAnimation({ 
  prefersReducedMotion,
  isInView 
}: { 
  prefersReducedMotion: boolean | null
  isInView: boolean
}) {
  const reportData = [
    { label: "Hot Flashes", value: "8 this week", trend: "↓ 23%" },
    { label: "Sleep Quality", value: "6.2 avg", trend: "↑ 15%" },
    { label: "Mood", value: "Good", trend: "Stable" },
  ]

  if (prefersReducedMotion) {
    return (
      <div className="relative w-full h-full flex items-center justify-center gap-6">
        {/* Report card */}
        <div className="w-52 bg-white rounded-2xl shadow-xl p-4 border border-gray-100">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
            <FileText className="w-5 h-5 text-pink-500" />
            <span className="font-semibold text-gray-800 text-sm">Your Report</span>
          </div>
          {reportData.map((item) => (
            <div key={item.label} className="flex justify-between py-1.5 text-xs">
              <span className="text-gray-600">{item.label}</span>
              <span className="font-medium text-gray-800">{item.value}</span>
            </div>
          ))}
        </div>
        
        {/* Chat bubble */}
        <div className="w-48 bg-pink-50 rounded-2xl p-4 border border-pink-100">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle className="w-4 h-4 text-pink-500" />
            <span className="text-xs font-semibold text-pink-700">Lisa</span>
          </div>
          <p className="text-xs text-gray-700">Ready to answer your questions 24/7</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <div className="flex items-center gap-4 sm:gap-6">
        {/* Professional Report Card */}
        <motion.div
          className="w-48 sm:w-56 bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100"
          initial={{ opacity: 0, x: -40, rotateY: -15 }}
          animate={isInView ? { opacity: 1, x: 0, rotateY: 0 } : { opacity: 0, x: -40, rotateY: -15 }}
          transition={ultraSmoothSpring}
          style={{ transformPerspective: 1000 }}
        >
          {/* Header */}
          <motion.div
            className="bg-linear-to-r from-pink-400 to-rose-400 p-3"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
          >
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-white" />
              <span className="font-semibold text-white text-sm">Symptom Report</span>
            </div>
          </motion.div>

          {/* Content */}
          <div className="p-4 space-y-3">
            {reportData.map((item, index) => (
              <motion.div
                key={item.label}
                className="flex items-center justify-between"
                initial={{ opacity: 0, x: -20 }}
                animate={isInView ? { opacity: 1, x: 0 } : { opacity: 0, x: -20 }}
                transition={{ ...smoothSpring, delay: 0.5 + index * 0.1 }}
              >
                <span className="text-xs text-gray-500">{item.label}</span>
                <div className="text-right">
                  <span className="text-sm font-semibold text-gray-800 block">{item.value}</span>
                  <motion.span
                    className={`text-xs ${item.trend.includes('↓') ? 'text-green-600' : item.trend.includes('↑') ? 'text-blue-600' : 'text-gray-500'}`}
                    initial={{ opacity: 0 }}
                    animate={isInView ? { opacity: 1 } : { opacity: 0 }}
                    transition={{ delay: 0.8 + index * 0.1 }}
                  >
                    {item.trend}
                  </motion.span>
                </div>
              </motion.div>
            ))}

            {/* Share button */}
            <motion.button
              className="w-full mt-3 py-2 bg-linear-to-r from-pink-500 to-rose-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2"
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
              transition={{ ...smoothSpring, delay: 1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <Send className="w-3 h-3" />
              Share with Doctor
            </motion.button>
          </div>
        </motion.div>

        {/* Chat with Lisa */}
        <motion.div
          className="w-44 sm:w-52"
          initial={{ opacity: 0, x: 40, rotateY: 15 }}
          animate={isInView ? { opacity: 1, x: 0, rotateY: 0 } : { opacity: 0, x: 40, rotateY: 15 }}
          transition={{ ...ultraSmoothSpring, delay: 0.2 }}
          style={{ transformPerspective: 1000 }}
        >
          {/* Lisa's avatar + name */}
          <motion.div
            className="flex items-center gap-2 mb-3"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : { opacity: 0 }}
            transition={{ delay: 0.5 }}
          >
            <div className="w-8 h-8 rounded-full bg-linear-to-br from-pink-400 to-rose-400 flex items-center justify-center shadow-md">
              <span className="text-white font-bold text-sm">L</span>
            </div>
            <span className="font-semibold text-gray-800 text-sm">Lisa</span>
          </motion.div>

          {/* Chat bubble */}
          <motion.div
            className="bg-linear-to-br from-pink-50 to-rose-50 rounded-2xl rounded-tl-sm p-4 border border-pink-100 shadow-lg"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={isInView ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
            transition={{ ...smoothSpring, delay: 0.6 }}
          >
            <motion.p
              className="text-sm text-gray-700 leading-relaxed"
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ delay: 0.8 }}
            >
              Have questions about your symptoms? I&apos;m here to help 24/7.
            </motion.p>
            
            {/* Typing indicator */}
            <motion.div
              className="flex gap-1 mt-3"
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : { opacity: 0 }}
              transition={{ delay: 1.2 }}
            >
              {[0, 1, 2].map((i) => (
                <motion.div
                  key={i}
                  className="w-2 h-2 rounded-full bg-pink-300"
                  animate={
                    isInView
                      ? { y: [0, -4, 0], opacity: [0.5, 1, 0.5] }
                      : { y: 0, opacity: 0 }
                  }
                  transition={
                    isInView
                      ? { duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }
                      : { duration: 0 }
                  }
                />
              ))}
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  )
}

// ============================================
// Supporting Components
// ============================================

function StepText({ step, isInView }: { step: number; isInView: boolean }) {
  const headlines = [
    "You have questions. Lots of them.",
    "Ask Lisa. Get real answers.",
    "Track symptoms. See patterns.",
  ]

  const headline = headlines[step - 1]

  return (
    <motion.div
      key={step}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="text-center"
    >
      <h3 className="text-2xl sm:text-3xl font-semibold text-gray-900">
        {headline}
      </h3>
    </motion.div>
  )
}

// ============================================
// Main Component
// ============================================
export default function LandingProblem() {
  const [currentStep, setCurrentStep] = useState(1)
  const prefersReducedMotion = useReducedMotion()
  const { ref, isInView } = useReplayableInView<HTMLElement>({ amount: 0.3 })

  useEffect(() => {
    if (prefersReducedMotion || !isInView) return

    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev % 3) + 1)
    }, 3000)

    return () => clearInterval(interval)
  }, [prefersReducedMotion, isInView])

  return (
    <section
      ref={ref}
      className="py-20 px-4"
      style={{
        background: "linear-gradient(135deg, #F5E6FF 0%, #FFE6F5 100%)",
      }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Heading */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-gray-900 leading-tight px-2 sm:px-4">
            The problem isn&apos;t menopause.<br />
            <HighlightedTextByRows
              text="It's not having answers."
              isInView={isInView}
              prefersReducedMotion={!!prefersReducedMotion}
              delayMs={500}
            />
          </h2>
        </motion.div>

        {/* Animation Container */}
        <div className="relative h-80 sm:h-[400px] mb-12 rounded-2xl overflow-hidden">
          <AnimatePresence mode="wait">
            {currentStep === 1 && (
              <motion.div
                key="step1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-0"
              >
                <ScatteredSymptomsAnimation prefersReducedMotion={prefersReducedMotion} isInView={isInView} />
              </motion.div>
            )}
            {currentStep === 2 && (
              <motion.div
                key="step2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-0"
              >
                <OrganizedTrackingAnimation prefersReducedMotion={prefersReducedMotion} isInView={isInView} />
              </motion.div>
            )}
            {currentStep === 3 && (
              <motion.div
                key="step3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="absolute inset-0"
              >
                <TakeControlAnimation prefersReducedMotion={prefersReducedMotion} isInView={isInView} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Step Indicators */}
        <div className="flex justify-center gap-3 mb-8">
          {[1, 2, 3].map((step) => (
            <button
              key={step}
              onClick={() => setCurrentStep(step)}
              className={`h-2 rounded-full transition-all duration-500 ease-out ${
                step === currentStep
                  ? "w-10 bg-linear-to-r from-pink-500 to-orange-400"
                  : "w-2 bg-gray-300 hover:bg-gray-400"
              }`}
              aria-label={`Go to step ${step}`}
            />
          ))}
        </div>

        {/* Text Content */}
        <div className="min-h-[72px] flex items-center justify-center">
          <AnimatePresence mode="wait">
            <StepText key={currentStep} step={currentStep} isInView={isInView} />
          </AnimatePresence>
        </div>

        {/* Trust Badge */}
        <motion.div
          className="border-t border-gray-300/50 pt-12 mt-12"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: false, amount: 0.3 }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          <div className="text-center">
            <p className="text-lg sm:text-xl text-gray-700">
              <strong>Research-backed education.</strong> Simple tracking. Real clarity within your first week.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
