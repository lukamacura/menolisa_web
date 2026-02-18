/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from "react"
import { useInView } from "framer-motion"

type Options = {
  amount?: number
}

/**
 * A small wrapper around framer-motion's `useInView` that supports replay on re-enter.
 * - `isInView` updates as the element enters/leaves the viewport (`once: false`)
 * - `resetKey` increments each time the element enters the viewport (useful to remount
 *   local animation state machines on re-enter)
 */
export function useReplayableInView<T extends Element>(
  options: Options = {}
): { ref: React.RefObject<T | null>; isInView: boolean; resetKey: number } {
  const ref = useRef<T | null>(null)
  const isInView = useInView(ref, {
    once: false,
    amount: options.amount ?? 0.3,
  })

  const [resetKey, setResetKey] = useState(0)
  const wasInView = useRef(false)

  useEffect(() => {
    // Increment only on the rising edge.
    if (isInView && !wasInView.current) {
      setResetKey((k) => k + 1)
    }
    wasInView.current = isInView
  }, [isInView])

  return useMemo(() => ({ ref, isInView, resetKey }), [isInView, resetKey])
}

