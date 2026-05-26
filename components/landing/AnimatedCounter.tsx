"use client"

import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { useInView, useReducedMotion } from "framer-motion"

type Props = {
  target: number
  className?: string
  formatter?: (n: number) => string
}

const defaultFormatter = (n: number) => n.toLocaleString("en-US")

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Shared store: one value across all <AnimatedCounter /> instances on the page.
// The counter is keyed by `target` (the initial value); first mount wins.
type Store = {
  value: number
  listeners: Set<() => void>
  viewers: number
  timeout: ReturnType<typeof setTimeout> | null
}

const stores = new Map<number, Store>()

function getStore(target: number): Store {
  let s = stores.get(target)
  if (!s) {
    s = { value: target, listeners: new Set(), viewers: 0, timeout: null }
    stores.set(target, s)
  }
  return s
}

function emit(s: Store) {
  s.listeners.forEach((l) => l())
}

function scheduleTick(s: Store) {
  if (s.timeout) return
  // ~1 new user every 30–90s
  const delay = randInt(30000, 90000)
  s.timeout = setTimeout(() => {
    s.timeout = null
    s.value += 1
    emit(s)
    if (s.viewers > 0) scheduleTick(s)
  }, delay)
}

function startViewing(s: Store) {
  s.viewers += 1
  if (s.viewers === 1) scheduleTick(s)
}

function stopViewing(s: Store) {
  s.viewers = Math.max(0, s.viewers - 1)
  if (s.viewers === 0 && s.timeout) {
    clearTimeout(s.timeout)
    s.timeout = null
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
