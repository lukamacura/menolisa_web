"use client";

import { useState, useEffect } from "react";

/**
 * Detects mobile viewport (touch/coarse pointer or narrow width).
 * Used for video preload="none" and other mobile-specific optimizations.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      setIsMobile(
        window.matchMedia("(pointer: coarse)").matches ||
          window.innerWidth < 768
      );
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}
