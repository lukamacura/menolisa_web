"use client";

import { motion } from "framer-motion";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Pillar } from "./data/questions";
import { pillarLabel } from "./lib/state";
import { PILLAR_ICONS } from "./lib/pillarIcons";

type Props = {
  weak: Pillar[];
  strong: Pillar[];
  isAllStrong: boolean;
  onCta: () => void;
};

export default function ResultScreen({ weak, strong, isAllStrong, onCta }: Props) {
  const [pillarA, pillarB] = weak;
  const strongest = strong[0];
  const IconA = pillarA ? PILLAR_ICONS[pillarA] : null;
  const IconB = pillarB ? PILLAR_ICONS[pillarB] : null;

  return (
    <motion.div
      key="result"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex-1 flex flex-col px-5 pt-6 pb-8"
    >
      <span
        className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-full text-[11px] font-medium uppercase tracking-[0.16em] mb-4"
        style={{
          backgroundColor: "rgba(232,164,176,0.14)",
          color: "#F2C7CF",
          border: "1px solid rgba(232,164,176,0.28)",
        }}
      >
        <Sparkles size={12} strokeWidth={2.4} />
        Your meno map
      </span>
      <h1 className="text-2xl sm:text-3xl font-bold text-white leading-snug max-w-xl">
        {isAllStrong ? (
          "You're doing the foundation work."
        ) : strongest ? (
          <>
            You&apos;re already onto something with{" "}
            <span style={{ color: "#F2C7CF" }}>{pillarLabel(strongest)}</span>.
          </>
        ) : (
          "Here's where Lisa starts with you."
        )}
      </h1>
      <p className="mt-3 text-base text-white/75 max-w-xl">
        {isAllStrong
          ? "Lisa will refine the layered detail across all 6 pillars with you — sleep timing, supplement stacking, training periodisation."
          : `Where most women your stage see the fastest shifts is ${pillarLabel(pillarA)} and ${pillarLabel(pillarB)} — that's where Lisa starts.`}
      </p>

      <div
        className="mt-6 rounded-3xl p-6"
        style={{
          background:
            "linear-gradient(135deg, rgba(232,164,176,0.20) 0%, rgba(229,181,131,0.14) 100%)",
          border: "1px solid rgba(232,164,176,0.35)",
          boxShadow: "0 18px 50px -20px rgba(232,164,176,0.30)",
        }}
      >
        <p className="text-[11px] uppercase tracking-[0.18em] mb-3" style={{ color: "#F2C7CF" }}>
          Your meno focus areas
        </p>
        {pillarA && pillarB && IconA && IconB ? (
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/5 border border-white/10">
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #E5B583 0%, #E8A4B0 100%)", color: "#2D0F33" }}
              >
                <IconA size={16} strokeWidth={2.4} />
              </span>
              <span className="text-lg sm:text-xl font-semibold text-white">{pillarLabel(pillarA)}</span>
            </div>
            <span className="text-white/40 text-xl">+</span>
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-2xl bg-white/5 border border-white/10">
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #E5B583 0%, #E8A4B0 100%)", color: "#2D0F33" }}
              >
                <IconB size={16} strokeWidth={2.4} />
              </span>
              <span className="text-lg sm:text-xl font-semibold text-white">{pillarLabel(pillarB)}</span>
            </div>
          </div>
        ) : (
          <p className="text-2xl sm:text-3xl font-bold text-white">All 6 pillars active</p>
        )}
        <p className="text-sm text-white/60 mt-4">Mapped from your answers</p>
      </div>

      <ul className="mt-6 space-y-2.5 text-sm text-white/80">
        {[
          "Built with menopause specialists",
          "Personalised to your symptoms",
          "24/7 support — no appointments",
        ].map((item) => (
          <li key={item} className="flex items-center gap-2.5">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: "linear-gradient(135deg, #E5B583 0%, #E8A4B0 100%)",
                color: "#2D0F33",
              }}
              aria-hidden
            >
              <Check size={12} strokeWidth={3} />
            </span>
            {item}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onCta}
        style={{
          background: "linear-gradient(135deg, #E5B583 0%, #E8A4B0 100%)",
          color: "#2D0F33",
          touchAction: "manipulation",
          boxShadow: "0 14px 40px -10px rgba(232,164,176,0.55)",
        }}
        className="mt-7 w-full h-14 rounded-2xl font-semibold text-lg flex items-center justify-center gap-2 active:scale-[0.97] transition-transform focus:outline-none focus-visible:ring-4 focus-visible:ring-white/40"
      >
        Show me my plan
        <ArrowRight size={20} strokeWidth={2.6} />
      </button>
    </motion.div>
  );
}
