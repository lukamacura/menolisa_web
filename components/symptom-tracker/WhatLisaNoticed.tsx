"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Network, RefreshCw, ChevronDown, ChevronUp, FileText } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-card/60 ${className}`} />;
}

// Letter-by-letter reveal animation component
function AnimatedText({
  text,
  delay = 0,
  speed = 30,
  className = ""
}: {
  text: string;
  delay?: number;
  speed?: number;
  className?: string;
}) {
  const [displayedText, setDisplayedText] = useState("");
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    setDisplayedText("");
    setIsComplete(false);

    const timeout = setTimeout(() => {
      let currentIndex = 0;
      const interval = setInterval(() => {
        if (currentIndex < text.length) {
          setDisplayedText(text.slice(0, currentIndex + 1));
          currentIndex++;
        } else {
          setIsComplete(true);
          clearInterval(interval);
        }
      }, speed);

      return () => clearInterval(interval);
    }, delay);

    return () => clearTimeout(timeout);
  }, [text, delay, speed]);

  const renderTextWithBold = (textToRender: string) => {
    const parts = textToRender.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={index} className="font-semibold text-[#8B7E74]">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <span className={className}>
      {renderTextWithBold(displayedText)}
      {!isComplete && <span className="animate-pulse ml-0.5">|</span>}
    </span>
  );
}

interface ActionSteps {
  easy: string;
  medium: string;
  advanced: string;
}

interface Insight {
  patternHeadline: string;
  why: string;
  whatsWorking?: string | null;
  actionSteps: ActionSteps;
  doctorNote: string;
  trend: "improving" | "worsening" | "stable";
  whyThisMatters?: string;
  generatedAt?: string;
  dataPoints?: {
    symptomLogs: number;
    chatSessions: number;
    daysWindow: number;
  };
}

function getTrendColor(trend: string) {
  switch (trend) {
    case "improving":
      return "text-green-800 bg-green-100 border-green-200";
    case "worsening":
      return "text-amber-800 bg-amber-100 border-amber-200";
    default:
      return "text-gray-800 bg-gray-100 border-gray-200";
  }
}

function buildReportText(insight: Insight): string {
  const trendLabel = insight.trend === "improving" ? "Improving" : insight.trend === "worsening" ? "Needs attention" : "Stable";
  const date = insight.generatedAt ? new Date(insight.generatedAt).toLocaleDateString() : new Date().toLocaleDateString();
  const lines: string[] = [
    "═══════════════════════════════════",
    "  MENOLISA — YOUR HEALTH REPORT",
    `  Generated: ${date}`,
    "═══════════════════════════════════",
    "",
    `TREND: ${trendLabel.toUpperCase()}`,
    "",
    "─── WHAT LISA NOTICED ─────────────",
    insight.patternHeadline,
    "",
    insight.why,
  ];
  if (insight.whatsWorking) {
    lines.push("", "─── WHAT'S WORKING ────────────────", insight.whatsWorking);
  }
  lines.push(
    "",
    "─── WHAT YOU CAN TRY ──────────────",
    `Start here:         ${insight.actionSteps.easy}`,
    `A bit more energy:  ${insight.actionSteps.medium}`,
    `Go deeper:          ${insight.actionSteps.advanced}`,
    "",
    "─── FOR YOUR NEXT APPOINTMENT ─────",
    insight.doctorNote,
  );
  if (insight.whyThisMatters) {
    lines.push("", "─── WHY THIS MATTERS ──────────────", insight.whyThisMatters);
  }
  if (insight.dataPoints) {
    const { daysWindow, symptomLogs, chatSessions } = insight.dataPoints;
    lines.push("", "─── DATA SOURCES ──────────────────", `Based on ${daysWindow} days · ${symptomLogs} symptom logs · ${chatSessions} chats`);
  }
  lines.push("", "═══════════════════════════════════", "  menolisa.com", "═══════════════════════════════════");
  return lines.join("\n");
}

export default function WhatLisaNoticed() {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [whyExpanded, setWhyExpanded] = useState(false);
  const [whyMattersExpanded, setWhyMattersExpanded] = useState(false);

  const fetchInsight = async (refresh = false) => {
    try {
      if (refresh) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const url = refresh ? "/api/insights?refresh=true" : "/api/insights";
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error("Failed to fetch insight");
      }

      const { insight: insightData } = await response.json();

      if (typeof insightData === "string") {
        setInsight({
          patternHeadline: insightData.split('\n')[0] || "Lisa didn't have enough data yet to notice something specific.",
          why: insightData.substring(0, 200) || "Keep logging your symptoms and mood so Lisa can share what she notices.",
          whatsWorking: null,
          actionSteps: {
            easy: "Keep tracking so Lisa can spot what helps.",
            medium: "Try one small change this week and see if it helps.",
            advanced: "Build a consistent routine that supports your body."
          },
          doctorNote: "Symptom and mood tracking in progress. Can review with healthcare provider when ready.",
          trend: "stable",
          whyThisMatters: "When Lisa has a bit more data, she can point out things that might be useful to you and your healthcare team."
        });
      } else {
        setInsight(insightData);
      }
    } catch (err) {
      console.error("Error fetching insight:", err);
      setError("Failed to load insight");
      setInsight(null);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchInsight();
  }, []);

  const downloadReport = () => {
    if (!insight) return;
    const text = buildReportText(insight);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `menolisa-report-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Loading state
  if (loading) {
    return (
      <div className="bg-card backdrop-blur-lg rounded-2xl border border-border/30 shadow-xl mb-6 overflow-hidden">
        <Skeleton className="h-28 sm:h-36 md:h-44 lg:h-52 w-full rounded-none" />
        <div className="p-4 sm:p-6">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <Skeleton className="h-8 w-8 rounded-lg shrink-0" />
          </div>
          <div className="mb-4">
            <Skeleton className="h-6 w-full mb-2" />
            <Skeleton className="h-6 w-3/4" />
          </div>
          <div className="mb-4">
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-5/6" />
          </div>
          <div className="mb-4 p-3 rounded-xl bg-green-50/50 border border-green-200/50">
            <Skeleton className="h-4 w-full" />
          </div>
          <div className="mb-4">
            <Skeleton className="h-5 w-32 mb-3" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-6 w-24 rounded" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          </div>
          <div className="mb-4 p-3 rounded-xl bg-blue-50/50 border border-blue-200/50">
            <Skeleton className="h-4 w-40 mb-2" />
            <Skeleton className="h-4 w-full mb-1" />
            <Skeleton className="h-4 w-4/5" />
          </div>
          <div className="border-t border-border/30 pt-4">
            <Skeleton className="h-5 w-32" />
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !insight) {
    return (
      <div className="bg-card backdrop-blur-lg rounded-2xl border border-border/30 p-4 sm:p-6 shadow-xl mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Network className="h-8 w-8 text-pink-500" />
          <h3 className="text-2xl font-semibold text-card-foreground">What Lisa noticed</h3>
        </div>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  // Empty state
  if (!insight) {
    return (
      <div className="bg-card backdrop-blur-lg rounded-2xl border border-border/30 p-4 sm:p-6 shadow-xl mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Network className="h-8 w-8 text-pink-500 shrink-0" />
          <h3 className="text-2xl font-semibold text-card-foreground">What Lisa noticed</h3>
        </div>
        <p className="text-muted-foreground text-base leading-relaxed">
          Keep logging symptoms and Lisa will share what she noticed.
        </p>
      </div>
    );
  }

  const trendColor = getTrendColor(insight.trend);
  const { dataPoints } = insight;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-card backdrop-blur-lg rounded-2xl border border-white/30 shadow-xl mb-6 overflow-hidden"
    >
      {/* Banner illustration */}
      <div className="relative w-full h-28 sm:h-36 md:h-44 lg:h-52">
        <Image
          src="/lisa-noticed-banner.png"
          alt=""
          fill
          className="object-cover"
          aria-hidden="true"
          priority
        />
      </div>

      <div className="p-4 sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2 flex-wrap flex-1">
            <h3 className="text-2xl font-semibold text-card-foreground">What Lisa noticed</h3>
            <span className={`px-2 py-1 rounded-full text-xs font-medium border ${trendColor}`}>
              {insight.trend}
            </span>
          </div>
          <button
            onClick={() => fetchInsight(true)}
            disabled={isRefreshing}
            className="p-2 rounded-lg text-muted-foreground hover:bg-card/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            aria-label="Refresh what Lisa noticed"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* 1. Pattern Headline */}
        <motion.div
          className="mb-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <h4 className="text-lg sm:text-xl font-bold text-card-foreground leading-tight">
            <AnimatedText text={insight.patternHeadline} delay={200} speed={25} />
          </h4>
        </motion.div>

        {/* 2. Why — truncated with expand toggle */}
        <motion.div
          className="mb-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <p className={`text-muted-foreground text-base leading-relaxed ${!whyExpanded ? "line-clamp-2" : ""}`}>
            <AnimatedText text={insight.why} delay={400} speed={20} />
          </p>
          <button
            onClick={() => setWhyExpanded(!whyExpanded)}
            className="text-xs text-pink-500 hover:text-pink-600 transition-colors mt-1"
          >
            {whyExpanded ? "Show less" : "Read more"}
          </button>
        </motion.div>

        {/* 3. What's Working */}
        {insight.whatsWorking && (
          <motion.div
            className="mb-4 p-3 rounded-xl bg-green-50/50 border border-green-200/50"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.5 }}
          >
            <p className="text-green-700 text-sm font-medium">
              ✨ <AnimatedText text={insight.whatsWorking} delay={600} speed={20} />
            </p>
          </motion.div>
        )}

        {/* 4. Freshness bar */}
        {dataPoints && (
          <div className="mb-4 text-xs text-muted-foreground">
            Based on{" "}
            <span className="font-medium">{dataPoints.daysWindow} days</span>
            {"  ·  "}
            <span className="font-medium">{dataPoints.symptomLogs} logs</span>
            {"  ·  "}
            <span className="font-medium">{dataPoints.chatSessions} chats</span>
            <div className="mt-2 border-t border-border/30" />
          </div>
        )}

        {/* 5. Action Steps — badge on top, text below */}
        <motion.div
          className="mb-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.7 }}
        >
          <h5 className="text-sm font-semibold text-card-foreground mb-3">What you can try</h5>
          <div className="space-y-3">
            <motion.div
              className="flex flex-col gap-1"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.9 }}
            >
              <span className="px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-700 self-start">
                Start here
              </span>
              <p className="text-muted-foreground text-sm">
                <AnimatedText text={insight.actionSteps.easy} delay={1000} speed={18} />
              </p>
            </motion.div>
            <motion.div
              className="flex flex-col gap-1"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 1.1 }}
            >
              <span className="px-2 py-1 rounded text-xs font-semibold bg-amber-100 text-amber-700 self-start">
                A bit more energy
              </span>
              <p className="text-muted-foreground text-sm">
                <AnimatedText text={insight.actionSteps.medium} delay={1200} speed={18} />
              </p>
            </motion.div>
            <motion.div
              className="flex flex-col gap-1"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 1.3 }}
            >
              <span className="px-2 py-1 rounded text-xs font-semibold bg-pink-100 text-pink-700 self-start">
                Go deeper
              </span>
              <p className="text-muted-foreground text-sm">
                <AnimatedText text={insight.actionSteps.advanced} delay={1400} speed={18} />
              </p>
            </motion.div>
          </div>
        </motion.div>

        {/* 6. For your next appointment */}
        <motion.div
          className="mb-4 p-3 rounded-xl bg-blue-50/50 border border-blue-200/50"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 1.5 }}
        >
          <p className="text-xs font-semibold text-blue-700 mb-1">For your next appointment</p>
          <p className="text-blue-800 text-sm leading-relaxed">
            <AnimatedText text={insight.doctorNote} delay={1600} speed={18} />
          </p>
        </motion.div>

        {/* 7. Get full report */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 1.6 }}
          className="border-t border-border/30 pt-4 mb-2"
        >
          <button
            onClick={downloadReport}
            className="flex items-center justify-center gap-2 w-full text-sm font-medium text-pink-500 hover:text-pink-600 transition-colors py-1"
          >
            <FileText className="h-4 w-4" />
            Get full report
          </button>
        </motion.div>

        {/* 8. Why this matters (expandable) */}
        {insight.whyThisMatters && (
          <motion.div
            className="border-t border-border/30 pt-4"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 1.7 }}
          >
            <button
              onClick={() => setWhyMattersExpanded(!whyMattersExpanded)}
              className="flex items-center gap-2 w-full text-left text-sm font-semibold text-card-foreground hover:text-primary transition-colors"
            >
              {whyMattersExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
              <span>Why this matters</span>
            </button>
            <AnimatePresence>
              {whyMattersExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <p className="text-muted-foreground text-sm leading-relaxed mt-2 pl-6">
                    <AnimatedText text={insight.whyThisMatters} delay={0} speed={18} />
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
