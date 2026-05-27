"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useInView, useReducedMotion } from "framer-motion"

type Props = {
  target: number
  className?: string
  formatter?: (n: number) => string
}

const defaultFormatter = (n: number) => n.toLocaleString("en-US")

// Fixed increment schedule, measured in ms of in-view time:
// +1 at 5s, +2 at 10s, +3 at 40s, then stop.
const SCHEDULE = [
  { at: 5000, inc: 1 },
  { at: 10000, inc: 2 },
  { at: 40000, inc: 3 },
]

// Shared store: one value across all <AnimatedCounter /> instances on the page.
// The counter is keyed by `target` (the initial value); first mount wins.
type Store = {
  value: number
  listeners: Set<() => void>
  viewers: number
  step: number
  elapsed: number
  lastStart: number | null
  timeout: ReturnType<typeof setTimeout> | null
}

const stores = new Map<number, Store>()

function getStore(target: number): Store {
  let s = stores.get(target)
  if (!s) {
    s = {
      value: target,
      listeners: new Set(),
      viewers: 0,
      step: 0,
      elapsed: 0,
      lastStart: null,
      timeout: null,
    }
    stores.set(target, s)
  }
  return s
}

function emit(s: Store) {
  s.listeners.forEach((l) => l())
}

function scheduleNext(s: Store) {
  if (s.timeout || s.step >= SCHEDULE.length) return
  const delay = Math.max(0, SCHEDULE[s.step].at - s.elapsed)
  s.lastStart = Date.now()
  s.timeout = setTimeout(() => {
    s.timeout = null
    s.elapsed = SCHEDULE[s.step].at
    s.value += SCHEDULE[s.step].inc
    s.step += 1
    s.lastStart = Date.now()
    emit(s)
    if (s.viewers > 0) scheduleNext(s)
  }, delay)
}

function startViewing(s: Store) {
  s.viewers += 1
  if (s.viewers === 1) scheduleNext(s)
}

function stopViewing(s: Store) {
  s.viewers = Math.max(0, s.viewers - 1)
  if (s.viewers === 0 && s.timeout) {
    clearTimeout(s.timeout)
    s.timeout = null
    if (s.lastStart != null) {
      s.elapsed += Date.now() - s.lastStart
      s.lastStart = null
    }
  }
}

export default function AnimatedCounter({
  target,
  className,
  formatter = defaultFormatter,
}: Props) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const isInView = useInView(ref, { once: false, amount: 0.5 })
  const prefersReducedMotion = useReducedMotion()
  const [mounted, setMounted] = useState(false)

  const store = getStore(target)

  const value = useSyncExternalStore(
    (cb) => {
      store.listeners.add(cb)
      return () => store.listeners.delete(cb)
    },
    () => store.value,
    () => target,
  )

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!mounted || !isInView || prefersReducedMotion) return
    startViewing(store)
    return () => stopViewing(store)
  }, [mounted, isInView, prefersReducedMotion, store])

  return (
    <span ref={ref} className={className}>
      {formatter(value)}
    </span>
  )
}
