"use client";

import { motion, AnimatePresence } from "framer-motion";

const SYMBOL_COLOR = "#D63384";

export interface PreloaderProps {
  isLoading: boolean;
}

/**
 * Minimalistic preloader with a custom menopause symbol:
 * female gender symbol (circle) with a pause icon (||) centered inside.
 * Smooth animations for healthcare/wellness applications.
 *
 * @example
 * ```tsx
 * const [loading, setLoading] = useState(true);
 * // ...
 * <Preloader isLoading={loading} />
 * // when ready: setLoading(false);
 * ```
 */
export default function Preloader({ isLoading }: PreloaderProps) {
  return (
    <AnimatePresence mode="wait">
      {isLoading && (
        <motion.div
          className="fixed inset-0 flex items-center justify-center bg-white/80 backdrop-blur-[2px]"
          style={{ zIndex: 9999 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          aria-live="polite"
          aria-busy="true"
          role="status"
        >
          <motion.div
            className="flex flex-col items-center justify-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{
              opacity: 1,
              scale: [1, 1.03, 1],
              rotate: [0, 360],
            }}
            exit={{
              opacity: 0,
              scale: 0.98,
              transition: { duration: 0.12, ease: "easeIn" },
            }}
            transition={{
              opacity: { duration: 0.3, ease: "easeOut" },
              scale: {
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              },
              rotate: {
                duration: 4,
                repeat: Infinity,
                ease: "linear",
              },
            }}
            style={{ willChange: "transform" }}
          >
            <svg
              viewBox="0 0 64 64"
              className="h-20 w-20 shrink-0 sm:h-24 sm:w-24"
              aria-hidden
            >
              {/* Circle (female symbol base) */}
              <circle
                cx="32"
                cy="32"
                r="24"
                fill="none"
                stroke={SYMBOL_COLOR}
                strokeWidth="2"
                strokeLinecap="round"
              />
              {/* Pause bars (||) centered inside the circle */}
              <motion.g
                animate={{ opacity: [0.6, 1, 0.6] }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                style={{ willChange: "opacity" }}
              >
                <rect
                  x="28"
                  y="24"
                  width="4"
                  height="16"
                  rx="1"
                  fill={SYMBOL_COLOR}
                />
                <rect
                  x="32"
                  y="24"
                  width="4"
                  height="16"
                  rx="1"
                  fill={SYMBOL_COLOR}
                />
              </motion.g>
            </svg>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
