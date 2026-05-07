"use client";

import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Moon, Wind, Apple, Dumbbell, Pill, HeartPulse } from "lucide-react";

type Props = {
  onStart: () => void;
};

const PILLAR_PEEK = [
  { Icon: Moon, label: "Sleep" },
  { Icon: Wind, label: "Stress" },
  { Icon: Apple, label: "Nutrition" },
  { Icon: Dumbbell, label: "Movement" },
  { Icon: Pill, label: "Supplements" },
  { Icon: HeartPulse, label: "HRT" },
];

export default function HookScreen({ onStart }: Props) {
  return (
    <motion.div
      key="hook"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3 }}
      className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center"
    >
      <span
        className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium tracking-wide mb-6"
        style={{
          backgroundColor: "rgba(232,164,176,0.14)",
          color: "#F2C7CF",
          border: "1px solid rgba(232,164,176,0.30)",
        }}
      >
        <Sparkles size={13} strokeWidth={2.4} />
        60-second meno check
      </span>

      <h1 className="text-[2rem] sm:text-[2.5rem] font-bold leading-[1.1] tracking-[-0.01em] text-white max-w-md">
        Find your meno blind spot in 60 seconds.
      </h1>
      <p className="mt-5 text-base sm:text-lg text-white/85 max-w-md">
        Six questions across the six things that actually move the needle in menopause.
      </p>

      <div className="mt-7 flex items-center justify-center flex-wrap gap-2.5 max-w-sm">
        {PILLAR_PEEK.map(({ Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-medium"
            style={{
              backgroundColor: "rgba(255,255,255,0.06)",
              color: "rgba(255,255,255,0.78)",
              border: "1px solid rgba(255,255,255,0.10)",
            }}
          >
            <Icon size={12} strokeWidth={2.2} style={{ color: "#E8A4B0" }} />
            {label}
          </span>
        ))}
      </div>

      <button
        type="button"
        onClick={onStart}
        style={{
          background: "linear-gradient(135deg, #E5B583 0%, #E8A4B0 100%)",
          color: "#2D0F33",
          touchAction: "manipulation",
          boxShadow: "0 14px 40px -10px rgba(232,164,176,0.55)",
        }}
        className="mt-9 w-full max-w-sm h-14 rounded-2xl font-semibold text-lg flex items-center justify-center gap-2 active:scale-[0.97] transition-transform focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
      >
        Start
        <ArrowRight size={20} strokeWidth={2.6} />
      </button>

      <p className="mt-6 text-sm" style={{ color: "#F2C7CF" }}>
        Built with women in perimenopause and beyond.
      </p>
    </motion.div>
  );
}
