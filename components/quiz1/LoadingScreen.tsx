"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";

export default function LoadingScreen() {
  return (
    <motion.div
      key="loading"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex-1 flex flex-col items-center justify-center px-6 text-center"
      role="status"
      aria-live="polite"
    >
      <div className="relative w-24 h-24 flex items-center justify-center">
        <motion.span
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(232,164,176,0.55) 0%, rgba(229,181,131,0.25) 55%, transparent 75%)",
          }}
          animate={{ scale: [1, 1.25, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="relative w-16 h-16 rounded-full flex items-center justify-center"
          style={{
            background: "linear-gradient(135deg, #E5B583 0%, #E8A4B0 100%)",
            color: "#2D0F33",
            boxShadow: "0 12px 40px -8px rgba(232,164,176,0.55)",
          }}
          animate={{ rotate: [0, 360] }}
          transition={{ duration: 3.6, repeat: Infinity, ease: "linear" }}
        >
          <Sparkles size={26} strokeWidth={2.4} />
        </motion.div>
      </div>
      <p className="mt-8 text-lg text-white/85">Lisa is mapping your profile…</p>
      <p className="mt-2 text-sm text-white/50">Reading across 6 pillars</p>
    </motion.div>
  );
}
