/* eslint-disable react-hooks/set-state-in-effect */
"use client"

import { useState, useEffect } from "react"
import { motion, useReducedMotion, AnimatePresence } from "framer-motion"
import { MessageCircle } from "lucide-react"
import { useReplayableInView } from "@/hooks/useReplayableInView"
import { HighlightedTextByRows } from "@/components/landing/HighlightedTextByRows"

// The overwhelming questions women face - emotional, relatable, urgent
const questions = [
  {
    text: "Why am I suddenly gaining weight when I'm eating the same?",
    emphasis: "What is wrong with my body?"
  },
  {
    text: "Why can't I sleep through the night anymore?",
    emphasis: "Will I ever feel rested again?"
  },
  {
    text: "Why do I wake up completely drenched in sweat?",
    emphasis: "How do I make it stop?"
  },
  {
    text: "Why does sex suddenly hurt so much?",
    emphasis: "Is this permanent?"
  },
  {
    text: "Why do I feel so anxious all the time?",
    emphasis: "Am I losing my mind?"
  },
  {
    text: "Why does no one talk about this?",
    emphasis: "Why do I feel so alone?"
  },
]

// Fast spring config
const fastSpring = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
}

// Single Question Display - fast smooth crossfade
function QuestionDisplay({
  question,
  prefersReducedMotion,
}: {
  question: typeof questions[0]
  prefersReducedMotion: boolean
}) {
  return (
    <motion.div
      className="absolute inset-0 flex flex-col items-center justify-center text-center px-4"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{
        duration: prefersReducedMotion ? 0.15 : 0.35,
        ease: [0.4, 0, 0.2, 1],
      }}
    >
      {/* Question bubble */}
      <div className="relative max-w-lg w-full">
        {/* Subtle glow behind */}
        <div className="absolute inset-0 bg-pink-200/30 rounded-3xl blur-xl scale-105" />
        
        <motion.div 
          className="relative px-6 py-5 sm:px-8 sm:py-6 bg-card backdrop-blur-sm rounded-3xl shadow-lg shadow-pink-200/20 border border-pink-100/60"
          initial={{ y: 8 }}
          animate={{ y: 0 }}
          transition={fastSpring}
        >
          <MessageCircle className="w-5 h-5 sm:w-6 sm:h-6 text-pink-400 mx-auto mb-3" />
          
          {/* Main question */}
          <p className="text-lg sm:text-xl md:text-2xl font-medium text-foreground leading-relaxed mb-2">
            {question.text}
          </p>
          
          {/* Emotional emphasis */}
          <motion.p
            className="text-base sm:text-lg md:text-xl font-semibold text-rose-500 italic"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ 
              delay: prefersReducedMotion ? 0 : 0.25, 
              duration: 0.3,
            }}
          >
            {question.emphasis}
          </motion.p>
        </motion.div>
      </div>
    </motion.div>
  )
}

// Progress dots
function ProgressDots({
  total,
  current,
}: {
  total: number
  current: number
}) {
  return (
    <div className="flex items-center justify-center gap-2 mt-6">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          className="h-1.5 rounded-full bg-pink-200"
          animate={{
            width: i === current ? 24 : 6,
            backgroundColor: i === current ? "rgb(244 63 94)" : "rgb(252 231 243)",
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        />
      ))}
    </div>
  )
}

export default function QuestionStorm() {
  const prefersReducedMotion = useReducedMotion()
  const { ref, isInView, resetKey } = useReplayableInView<HTMLElement>({ amount: 0.4 })

  return (
    <section
      ref={ref}
      className="relative py-16 sm:py-20 md:py-24 px-4 sm:px-6 overflow-hidden"
      style={{
        background: "linear-gradient(180deg, #FDF2F8 0%, #FCE7F3 50%, #FDF2F8 100%)",
      }}
    >
      <QuestionStormInner
        key={resetKey}
        isInView={isInView}
        prefersReducedMotion={!!prefersReducedMotion}
      />
    </section>
  )
}

function QuestionStormInner({
  isInView,
  prefersReducedMotion,
}: {
  isInView: boolean
  prefersReducedMotion: boolean
}) {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)

  // Reset when leaving viewport
  useEffect(() => {
    if (!isInView) {
      setCurrentQuestionIndex(0)
    }
  }, [isInView])

  // Animation loop - cycle through questions
  useEffect(() => {
    if (!isInView) return

    if (prefersReducedMotion) {
      return
    }

    // Time per question
    const TIME_PER_QUESTION = 2500

    const interval = setInterval(() => {
      setCurrentQuestionIndex((prev) => (prev + 1) % questions.length)
    }, TIME_PER_QUESTION)

    return () => clearInterval(interval)
  }, [isInView, prefersReducedMotion])

  const currentQuestion = questions[currentQuestionIndex]

  return (
    <>
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-64 h-64 sm:w-96 sm:h-96 rounded-full bg-pink-200/20 blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-48 h-48 sm:w-80 sm:h-80 rounded-full bg-purple-200/20 blur-3xl" />
      </div>

      <div className="max-w-3xl mx-auto relative">
        {/* Header */}
        <motion.div
          className="text-center mb-8 sm:mb-10"
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold text-gray-900 leading-tight px-2">
            Your head is{" "}
            <HighlightedTextByRows
              text="full of questions"
              isInView={isInView}
              prefersReducedMotion={prefersReducedMotion}
              delayMs={200}
            />
          </h2>
          <p className="mt-3 text-muted-foreground text-sm sm:text-base">
            Questions you&apos;re afraid to ask out loud
          </p>
        </motion.div>

        {/* Main Animation Container */}
        <div
          className="relative mx-auto"
          style={{ minHeight: "220px" }}
        >
          {/* Questions - crossfade loop */}
          <AnimatePresence mode="wait">
            <QuestionDisplay
              key={currentQuestionIndex}
              question={currentQuestion}
              prefersReducedMotion={prefersReducedMotion}
            />
          </AnimatePresence>
        </div>

        {/* Progress dots */}
        <ProgressDots
          total={questions.length}
          current={currentQuestionIndex}
        />
      </div>
    </>
  )
}
