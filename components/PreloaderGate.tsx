"use client";

import { useEffect, useState } from "react";
import Preloader from "@/components/Preloader";

const MIN_DISPLAY_MS = 0; // No minimum so content shows as soon as ready
const MAX_WAIT_MS = 400; // Short fallback so we never block long

/**
 * Wraps Preloader and controls visibility based on page load.
 * Hides after DOMContentLoaded (or immediately if already ready) for faster LCP.
 */
export default function PreloaderGate() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    let hideTimeout: ReturnType<typeof setTimeout> | undefined;
    const start = Date.now();

    const hide = () => {
      if (!mounted) return;
      const elapsed = Date.now() - start;
      const delay = Math.max(0, MIN_DISPLAY_MS - elapsed);
      if (delay > 0) {
        hideTimeout = setTimeout(() => {
          if (mounted) setIsLoading(false);
        }, delay);
      } else {
        setIsLoading(false);
      }
    };

    const runHide = () => {
      if (typeof document !== "undefined" && (document.readyState === "interactive" || document.readyState === "complete")) {
        hide();
      } else if (typeof document !== "undefined") {
        document.addEventListener("DOMContentLoaded", hide);
      }
    };

    // Hide on next paint when doc already ready (e.g. client nav)
    if (typeof requestAnimationFrame !== "undefined") {
      requestAnimationFrame(runHide);
    } else {
      runHide();
    }

    const fallback = setTimeout(hide, MAX_WAIT_MS);

    return () => {
      mounted = false;
      if (hideTimeout) clearTimeout(hideTimeout);
      clearTimeout(fallback);
      if (typeof document !== "undefined") {
        document.removeEventListener("DOMContentLoaded", hide);
      }
    };
  }, []);

  return <Preloader isLoading={isLoading} />;
}
