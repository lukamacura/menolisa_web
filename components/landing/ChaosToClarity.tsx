/* eslint-disable react-hooks/set-state-in-effect */
"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { motion, useReducedMotion, AnimatePresence } from "framer-motion"
import { Sun, Wind, Moon, Heart, Sparkles } from "lucide-react"
import { useReplayableInView } from "@/hooks/useReplayableInView"
import { HighlightedTextByRows } from "@/components/landing/HighlightedTextByRows"

// Actionable tips with emotional content from knowledge base
const actionTips = [
  {
    id: "morning-light",
    icon: Sun,
    category: "Morning Ritual",
    tip: "Get 10–20 minutes of outdoor light within an hour of waking.",
    motivation: "Your body was built to follow the light.",
    color: "from-amber-400 to-orange-400",
    bgColor: "bg-amber-50",
    iconColor: "text-amber-500",
  },
  {
    id: "breathwork",
    icon: Wind,
    category: "Stress Relief",
    tip: "Try 4-7-8 breathing for 2–3 minutes when tension rises.",
    motivation: "You can't think your way out - but you can breathe through it.",
    color: "from-sky-400 to-blue-400",
    bgColor: "bg-sky-50",
    iconColor: "text-sky-500",
  },
  {
    id: "sleep-reset",
    icon: Moon,
    category: "Night Waking",
    tip: "If awake at 3am, breathe slowly and let your body feel heavy and supported.",
    motivation: "Night waking isn't failure. It's feedback.",
    color: "from-indigo-400 to-purple-400",
    bgColor: "bg-indigo-50",
    iconColor: "text-indigo-500",
  },
  {
    id: "movement",
    icon: Heart,
    category: "Daily Movement",
    tip: "Walk mindfully - focus on sights and sounds, not thoughts.",
    motivation: "Calm is a practice. Your body will learn it.",
    color: "from-rose-400 to-pink-400",
    bgColor: "bg-rose-50",
    iconColor: "text-rose-500",
  },
  {
    id: "evening",
    icon: Sparkles,
    category: "Evening Wind Down",
    tip: "Write one gratitude or release note before bed to offload stress.",
    motivation: "Release the day. Restore tonight.",
    color: "from-violet-400 to-fuchsia-400",
    bgColor: "bg-violet-50",
    iconColor: "text-violet-500",
  },
]

// Typewriter component with letter-by-letter animation
function TypewriterText({
  text,
  isActive,
  onComplete,
  className = "",
  typingSpeed = 35,
}: {
  text: string
  isActive: boolean
  onComplete?: () => void
  className?: string
  typingSpeed?: number
}) {
  const [displayedText, setDisplayedText] = useState("")
  const [isTyping, setIsTyping] = useState(false)
  const completedRef = useRef(false)

  useEffect(() => {
    if (!isActive) {
      setDisplayedText("")
      setIsTyping(false)
      completedRef.current = false
      return
    }

    setIsTyping(true)
    setDisplayedText("")
    completedRef.current = false
    
    let currentIndex = 0
    const interval = setInterval(() => {
      if (currentIndex < text.length) {
        setDisplayedText(text.slice(0, currentIndex + 1))
        currentIndex++
      } else {
        clearInterval(interval)
        setIsTyping(false)
        if (!completedRef.current) {
          completedRef.current = true
          onComplete?.()
        }
      }
    }, typingSpeed)

    return () => clearInterval(interval)
  }, [text, isActive, typingSpeed, onComplete])

  return (
    <span className={className}>
      {displayedText}
      {isTyping && (
        <motion.span
          className="inline-block w-0.5 h-[1em] bg-current ml-0.5 align-middle"
          animate={{ opacity: [1, 0] }}
          transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
        />
      )}
    </span>
  )
}

// Single tip card with animations
function TipCard({
  tip,
  isActive,
  onTypingComplete,
  prefersReducedMotion,
}: {
  tip: typeof actionTips[0]
  isActive: boolean
  onTypingComplete: () => void
  prefersReducedMotion: boolean
}) {
  const Icon = tip.icon
  const [showMotivation, setShowMotivation] = useState(false)
  const [tipComplete, setTipComplete] = useState(false)

  useEffect(() => {
    if (!isActive) {
      setShowMotivation(false)
      setTipComplete(false)
    }
  }, [isActive])

  const handleTipComplete = useCallback(() => {
    setTipComplete(true)
    // Small delay before showing motivation
    setTimeout(() => {
      setShowMotivation(true)
    }, 300)
  }, [])

  const handleMotivationComplete = useCallback(() => {
    // Wait a bit after motivation completes before calling parent
    setTimeout(() => {
      onTypingComplete()
    }, 1500)
  }, [onTypingComplete])

  if (prefersReducedMotion) {
    return (
      <div className="text-center px-4">
        <div className={`inline-flex items-center justify-center w-16 h-16 rounded-2xl ${tip.bgColor} mb-6`}>
          <Icon className={`w-8 h-8 ${tip.iconColor}`} />
        </div>
        <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">{tip.category}</p>
        <p className="text-xl sm:text-2xl md:text-3xl font-medium text-foreground leading-relaxed mb-6 max-w-2xl mx-auto">
          {tip.tip}
        </p>
        <p className="text-base sm:text-lg text-muted-foreground italic max-w-xl mx-auto">
          &ldquo;{tip.motivation}&rdquo;
        </p>
      </div>
    )
  }

  return (
    <motion.div
      className="text-center px-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
    >
      {/* Icon with gradient ring */}
      <motion.div
        className="relative inline-flex items-center justify-center mb-6"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.1 }}
      >
        <div className={`absolute inset-0 rounded-2xl bg-linear-to-br ${tip.color} opacity-20 blur-xl scale-150`} />
        <div className={`relative w-16 h-16 sm:w-20 sm:h-20 rounded-2xl ${tip.bgColor} flex items-center justify-center shadow-lg`}>
          <Icon className={`w-8 h-8 sm:w-10 sm:h-10 ${tip.iconColor}`} />
        </div>
      </motion.div>

      {/* Category label */}
      <motion.p
        className="text-xs uppercase tracking-widest text-muted-foreground mb-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        {tip.category}
      </motion.p>

      {/* Main tip with typewriter effect */}
      <div className="min-h-18 sm:min-h-20 md:min-h-24 flex items-center justify-center mb-6">
        <p className="text-xl sm:text-2xl md:text-3xl font-medium text-foreground leading-relaxed max-w-2xl">
          <TypewriterText
            text={tip.tip}
            isActive={isActive}
            onComplete={handleTipComplete}
            typingSpeed={30}
          />
        </p>
      </div>

      {/* Motivation quote with fade-in after tip completes */}
      <div className="min-h-12 sm:min-h-16">
        <AnimatePresence mode="wait">
          {tipComplete && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="max-w-xl mx-auto"
            >
              <p className="text-base sm:text-lg text-muted-foreground italic">
                &ldquo;<TypewriterText
                  text={tip.motivation}
                  isActive={showMotivation}
                  onComplete={handleMotivationComplete}
                  typingSpeed={25}
                />&rdquo;
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

// Progress indicator with smooth transitions
function ProgressBar({
  total,
  current,
  progress,
}: {
  total: number
  current: number
  progress: number
}) {
  return (
    <div className="flex items-center justify-center gap-2 mt-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="relative h-1.5 rounded-full bg-purple-200/50 overflow-hidden"
          style={{ width: i === current ? 48 : 8 }}
        >
          {i === current && (
            <motion.div
              className="absolute inset-y-0 left-0 bg-linear-to-r from-purple-400 to-pink-400 rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.1, ease: "linear" }}
            />
          )}
          {i < current && (
            <div className="absolute inset-0 bg-linear-to-r from-purple-400 to-pink-400 rounded-full" />
          )}
        </div>
      ))}
    </div>
  )
}

export default function ChaosToClarity() {
  const prefersReducedMotion = useReducedMotion()
  const { ref, isInView, resetKey } = useReplayableInView<HTMLElement>({ amount: 0.3 })

  return (
    <section
      ref={ref}
      className="relative py-16 sm:py-20 md:py-24 lg:py-28 px-4 overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #F5E6FF 0%, #E6D5FF 50%, #F5E6FF 100%)",
      }}
    >
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 sm:w-96 sm:h-96 rounded-full bg-purple-300/20 blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-48 h-48 sm:w-80 sm:h-80 rounded-full bg-pink-300/20 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-violet-200/10 blur-3xl" />
      </div>

      <ChaosToClarityInner
        key={resetKey}
        isInView={isInView}
        prefersReducedMotion={!!prefersReducedMotion}
      />
    </section>
  )
}

function ChaosToClarityInner({
  isInView,
  prefersReducedMotion,
}: {
  isInView: boolean
  prefersReducedMotion: boolean
}) {
  const [currentTipIndex, setCurrentTipIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [canAdvance, setCanAdvance] = useState(false)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // Reset when leaving viewport
  useEffect(() => {
    if (!isInView) {
      setCurrentTipIndex(0)
      setProgress(0)
      setCanAdvance(false)
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [isInView])

  // Handle progression after typing completes
  const handleTypingComplete = useCallback(() => {
    setCanAdvance(true)
  }, [])

  // Progress bar animation and auto-advance
  useEffect(() => {
    if (!isInView || !canAdvance) return

    if (prefersReducedMotion) {
      // For reduced motion, just advance after a delay
      const timeout = setTimeout(() => {
        setCurrentTipIndex((prev) => (prev + 1) % actionTips.length)
        setCanAdvance(false)
      }, 2000)
      return () => clearTimeout(timeout)
    }

    // Start progress bar animation
    setProgress(0)
    const duration = 500 // 0.5 second hold after typing completes
    const updateInterval = 50
    const incrementPerUpdate = (100 / duration) * updateInterval
    
    progressIntervalRef.current = setInterval(() => {
      setProgress((prev) => {
        const next = prev + incrementPerUpdate
        if (next >= 100) {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current)
          }
          // Advance to next tip
          setTimeout(() => {
            setCurrentTipIndex((prev) => (prev + 1) % actionTips.length)
            setProgress(0)
            setCanAdvance(false)
          }, 100)
          return 100
        }
        return next
      })
    }, updateInterval)

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [isInView, canAdvance, prefersReducedMotion])

  const currentTip = actionTips[currentTipIndex]

  return (
    <div className="max-w-4xl mx-auto relative">
      {/* Heading */}
      <motion.div
        className="text-center mb-12 sm:mb-16"
        initial={{ opacity: 0, y: 16 }}
        animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight px-2 sm:px-4">
          Small habits,{" "}
          <HighlightedTextByRows
            text="lasting change."
            isInView={isInView}
            prefersReducedMotion={prefersReducedMotion}
            delayMs={300}
          />
        </h2>
      </motion.div>

      {/* Main Animation Container */}
      <div
        className="relative mx-auto"
        style={{ minHeight: "320px" }}
      >
        <AnimatePresence mode="wait">
          <TipCard
            key={currentTip.id}
            tip={currentTip}
            isActive={isInView}
            onTypingComplete={handleTypingComplete}
            prefersReducedMotion={prefersReducedMotion}
          />
        </AnimatePresence>
      </div>

      {/* Progress indicator */}
      <ProgressBar
        total={actionTips.length}
        current={currentTipIndex}
        progress={canAdvance ? progress : 0}
      />

    </div>
  )
}
