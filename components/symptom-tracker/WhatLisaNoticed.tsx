"use client";

import { useState, useEffect } from "react";
import { Network, RefreshCw, ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
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

  // Render text with bold formatting, handling partial bold markers during animation
  const renderTextWithBold = (textToRender: string) => {
    // Split by complete bold markers (**text**)
    const parts = textToRender.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        // Complete bold text
        const boldText = part.slice(2, -2);
        return (
          <strong key={index} className="font-semibold text-[#8B7E74]">
            {boldText}
          </strong>
        );
      } else if (part.includes("**")) {
        // Partial bold marker (during animation) - show as regular text
        return <span key={index}>{part}</span>;
      }
      // Regular text
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

export default function WhatLisaNoticed() {
  const [insight, setInsight] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [copiedNote, setCopiedNote] = useState(false);

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
      
      // Handle both old format (string) and new format (object)
      if (typeof insightData === "string") {
        // Legacy format - convert to new structure with Lisa-noticed copy
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

  const handleRefresh = () => {
    fetchInsight(true);
  };

  const toggleExpand = () => {
    setIsExpanded(prev => !prev);
  };

  const copyDoctorNote = async (note: string) => {
    try {
      await navigator.clipboard.writeText(note);
      setCopiedNote(true);
      setTimeout(() => setCopiedNote(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="bg-card backdrop-blur-lg rounded-2xl border border-border/30 p-4 sm:p-6 shadow-xl mb-6">
        {/* Header skeleton */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3 flex-1">
            <Skeleton className="h-8 w-8 rounded" />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Skeleton className="h-7 w-48" />
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            </div>
          </div>
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>

        {/* Pattern headline skeleton */}
        <div className="mb-4">
          <Skeleton className="h-6 w-full mb-2" />
          <Skeleton className="h-6 w-3/4" />
        </div>

        {/* Why section skeleton */}
        <div className="mb-4">
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-5/6" />
        </div>

        {/* What's working skeleton */}
        <div className="mb-4 p-3 rounded-xl bg-green-50/50 border border-green-200/50">
          <Skeleton className="h-4 w-full" />
        </div>

        {/* Action steps skeleton */}
        <div className="mb-4">
          <Skeleton className="h-5 w-32 mb-3" />
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-6 w-12 rounded shrink-0" />
                <Skeleton className="h-4 w-full flex-1" />
              </div>
            ))}
          </div>
        </div>

        {/* Doctor note skeleton */}
        <div className="mb-4 p-3 rounded-xl bg-blue-50/50 border border-blue-200/50">
          <Skeleton className="h-4 w-40 mb-2" />
          <Skeleton className="h-4 w-full mb-1" />
          <Skeleton className="h-4 w-4/5" />
        </div>

        {/* Why this matters skeleton */}
        <div className="border-t border-border/30 pt-4">
          <Skeleton className="h-5 w-32" />
        </div>
      </div>
    );
  }

  // Error state
  if (error && !insight) {
    return (
      <div className="bg-card backdrop-blur-lg rounded-2xl border border-border/30 p-4 sm:p-6 shadow-xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Network className="h-8 w-8 text-pink-500" />
            <h3 className="text-2xl font-semibold text-card-foreground">What Lisa noticed</h3>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  // No insight available - show empty state card
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-card backdrop-blur-lg rounded-2xl border border-white/30 p-4 sm:p-6 shadow-xl mb-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 flex-1">
          <Network className="h-8 w-8 text-pink-500 shrink-0" />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-2xl font-semibold text-card-foreground">What Lisa noticed</h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium border ${trendColor}`}>
                {insight.trend}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-lg text-muted-foreground hover:bg-card/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          aria-label="Refresh what Lisa noticed"
        >
          <RefreshCw
            className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {/* Pattern Headline */}
      <motion.div 
        className="mb-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1 }}
      >
        <h4 className="text-lg sm:text-xl font-bold text-card-foreground leading-tight">
          <AnimatedText 
            text={insight.patternHeadline} 
            delay={200}
            speed={25}
          />
        </h4>
      </motion.div>

      {/* The Why */}
      <motion.div 
        className="mb-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        <p className="text-muted-foreground text-base leading-relaxed">
          <AnimatedText 
            text={insight.why} 
            delay={400}
            speed={20}
          />
        </p>
      </motion.div>

      {/* What's Working */}
      {insight.whatsWorking && (
        <motion.div 
          className="mb-4 p-3 rounded-xl bg-green-50/50 border border-green-200/50"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.5 }}
        >
          <p className="text-green-700 text-sm font-medium">
            ✨ <AnimatedText 
              text={insight.whatsWorking} 
              delay={600}
              speed={20}
            />
          </p>
        </motion.div>
      )}

      {/* Action Steps */}
      <motion.div 
        className="mb-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.7 }}
      >
        <h5 className="text-sm font-semibold text-card-foreground mb-3">What You Can Try:</h5>
        <div className="space-y-2">
          <motion.div 
            className="flex items-start gap-3"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.9 }}
          >
            <span className="px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-700 shrink-0 mt-0.5">
              Easy
            </span>
            <p className="text-muted-foreground text-sm flex-1">
              <AnimatedText 
                text={insight.actionSteps.easy} 
                delay={1000}
                speed={18}
              />
            </p>
          </motion.div>
          <motion.div 
            className="flex items-start gap-3"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 1.1 }}
          >
            <span className="px-2 py-1 rounded text-xs font-semibold bg-amber-200 text-amber-700 shrink-0 mt-0.5">
              Medium
            </span>
            <p className="text-[#6B6B6B] text-sm flex-1">
              <AnimatedText 
                text={insight.actionSteps.medium} 
                delay={1200}
                speed={18}
              />
            </p>
          </motion.div>
          <motion.div 
            className="flex items-start gap-3"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 1.3 }}
          >
            <span className="px-2 py-1 rounded text-xs font-semibold bg-red-200 text-pink-700 shrink-0 mt-0.5">
              Advanced
            </span>
            <p className="text-[#6B6B6B] text-sm flex-1">
              <AnimatedText 
                text={insight.actionSteps.advanced} 
                delay={1400}
                speed={18}
              />
            </p>
          </motion.div>
        </div>
      </motion.div>

      {/* Doctor Note */}
      <motion.div 
        className="mb-4 p-3 rounded-xl bg-blue-50/50 border border-blue-200/50"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 1.5 }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-xs font-semibold text-blue-700 mb-1">For Your Healthcare Provider:</p>
            <p className="text-blue-800 text-sm leading-relaxed">
              <AnimatedText 
                text={insight.doctorNote} 
                delay={1600}
                speed={18}
              />
            </p>
          </div>
          <button
            onClick={() => copyDoctorNote(insight.doctorNote)}
            className="p-1.5 rounded-lg hover:bg-blue-100/50 transition-colors shrink-0"
            aria-label="Copy doctor note"
          >
            {copiedNote ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : (
              <Copy className="h-4 w-4 text-blue-600" />
            )}
          </button>
        </div>
      </motion.div>

      {/* Why This Matters (Expandable) */}
      {insight.whyThisMatters && (
        <motion.div 
          className="border-t border-border/30 pt-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 1.7 }}
        >
          <button
            onClick={toggleExpand}
            className="flex items-center gap-2 w-full text-left text-sm font-semibold text-card-foreground hover:text-primary transition-colors"
          >
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
            <span>Why this matters</span>
          </button>
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <p className="text-muted-foreground text-sm leading-relaxed mt-2 pl-6">
                  <AnimatedText 
                    text={insight.whyThisMatters} 
                    delay={0}
                    speed={18}
                  />
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </motion.div>
  );
}
