"use client";

import { motion } from "framer-motion";
import { ArrowLeft, Check } from "lucide-react";
import { Question } from "./data/questions";
import { PILLAR_ICONS } from "./lib/pillarIcons";

type Props = {
  question: Question;
  index: number;
  total: number;
  selected?: string;
  canGoBack: boolean;
  onSelect: (optionId: string) => void;
  onBack: () => void;
};

export default function QuestionScreen({
  question,
  index,
  total,
  selected,
  canGoBack,
  onSelect,
  onBack,
}: Props) {
  const progress = ((index + 1) / total) * 100;
  const PillarIcon = PILLAR_ICONS[question.pillar];

  return (
    <motion.div
      key={`q-${index}`}
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.3 }}
      className="flex-1 flex flex-col px-5 pt-4 pb-8"
    >
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={onBack}
          disabled={!canGoBack}
          aria-label="Go back"
          style={{ touchAction: "manipulation" }}
          className="w-10 h-10 flex items-center justify-center rounded-full text-white/80 disabled:opacity-30 active:scale-95 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
        >
          <ArrowLeft size={22} />
        </button>
        <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: "linear-gradient(90deg, #E5B583 0%, #E8A4B0 100%)",
            }}
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          />
        </div>
        <span className="text-xs font-medium text-white/55 tabular-nums">
          {index + 1}/{total}
        </span>
      </div>

      <div
        className="inline-flex items-center gap-2 self-start px-3 py-1.5 rounded-full mb-4"
        style={{
          backgroundColor: "rgba(232,164,176,0.12)",
          border: "1px solid rgba(232,164,176,0.25)",
        }}
      >
        <PillarIcon size={14} strokeWidth={2.2} style={{ color: "#F2C7CF" }} />
        <p className="text-[11px] font-medium uppercase tracking-[0.16em]" style={{ color: "#F2C7CF" }}>
          {question.pillarLabel}
        </p>
      </div>
      <h2 className="text-2xl sm:text-3xl font-bold text-white leading-snug max-w-xl">
        {question.prompt}
      </h2>

      <div
        className="mt-7 flex flex-col gap-3"
        role="radiogroup"
        aria-label={question.prompt}
      >
        {question.options.map((option) => {
          const isSelected = selected === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(option.id)}
              style={{
                touchAction: "manipulation",
                borderColor: isSelected ? "#E8A4B0" : "rgba(255,255,255,0.08)",
                borderWidth: isSelected ? 2 : 1,
                background: isSelected
                  ? "linear-gradient(135deg, rgba(232,164,176,0.22) 0%, rgba(229,181,131,0.14) 100%)"
                  : "rgba(255,255,255,0.025)",
                boxShadow: isSelected ? "0 8px 28px -12px rgba(232,164,176,0.45)" : "none",
              }}
              className="min-h-[56px] w-full text-left px-4 py-3 rounded-2xl border text-white text-base flex items-center gap-3 active:scale-[0.97] transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            >
              <span
                className="shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                style={{
                  border: isSelected ? "none" : "1.5px solid rgba(255,255,255,0.30)",
                  background: isSelected
                    ? "linear-gradient(135deg, #E5B583 0%, #E8A4B0 100%)"
                    : "transparent",
                  color: "#2D0F33",
                }}
                aria-hidden
              >
                {isSelected && <Check size={12} strokeWidth={3.5} />}
              </span>
              <span className="flex-1">{option.label}</span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
