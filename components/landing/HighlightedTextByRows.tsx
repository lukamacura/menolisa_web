"use client"

import { motion } from "framer-motion"
import { useReplayableHighlight } from "@/hooks/useReplayableHighlight"

/**
 * Row-by-row highlight animation. Use \n in text to split into multiple rows;
 * each row sweeps in with a staggered delay. Single-line text stays inline.
 */
export function HighlightedTextByRows({
  text,
  isInView,
  prefersReducedMotion,
  delayMs = 500,
}: {
  text: string
  isInView: boolean
  prefersReducedMotion?: boolean | null
  delayMs?: number
}) {
  const shouldHighlight = useReplayableHighlight(!!(isInView && !prefersReducedMotion), {
    delayMs,
  })
  const lines = text.split("\n").filter(Boolean)
  const reduced = !!prefersReducedMotion

  if (lines.length === 0) return null

  const baseDelay = reduced ? 0 : 0.25
  const stagger = reduced ? 0 : 0.2
  const duration = reduced ? 0.2 : 0.5

  if (lines.length === 1) {
    return (
      <span className="relative inline-block">
        <span className="relative z-10">{lines[0]}</span>
        <motion.span
          className="absolute inset-0 bg-yellow-400/40 rounded pointer-events-none px-0.5"
          initial={{ scaleX: 0, transformOrigin: "left" }}
          animate={shouldHighlight ? { scaleX: 1 } : { scaleX: 0 }}
          transition={{
            duration,
            delay: shouldHighlight ? baseDelay : 0,
            ease: [0.4, 0, 0.2, 1],
          }}
          style={{ zIndex: 0 }}
        />
      </span>
    )
  }

  return (
    <>
      {lines.map((line, i) => (
        <span key={i} className="block">
          <span className="relative inline-block">
            <span className="relative z-10">{line}</span>
            <motion.span
              className="absolute inset-0 bg-yellow-400/40 rounded pointer-events-none px-0.5"
              initial={{ scaleX: 0, transformOrigin: "left" }}
              animate={shouldHighlight ? { scaleX: 1 } : { scaleX: 0 }}
              transition={{
                duration,
                delay: shouldHighlight ? baseDelay + i * stagger : 0,
                ease: [0.4, 0, 0.2, 1],
              }}
              style={{ zIndex: 0 }}
            />
          </span>
        </span>
      ))}
    </>
  )
}
