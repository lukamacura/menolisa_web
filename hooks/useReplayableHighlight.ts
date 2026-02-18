/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react"

type Options = {
  delayMs?: number
}

/**
 * Drives a "sweep highlight" boolean that replays on re-enter.
 * - When `isInView` becomes true: after `delayMs`, `shouldHighlight` becomes true.
 * - When `isInView` becomes false: `shouldHighlight` resets to false immediately.
 */
export function useReplayableHighlight(isInView: boolean, options: Options = {}) {
  const [shouldHighlight, setShouldHighlight] = useState(false)

  useEffect(() => {
    if (!isInView) {
      setShouldHighlight(false)
      return
    }

    const t = setTimeout(() => setShouldHighlight(true), options.delayMs ?? 500)
    return () => clearTimeout(t)
  }, [isInView, options.delayMs])

  return shouldHighlight
}

