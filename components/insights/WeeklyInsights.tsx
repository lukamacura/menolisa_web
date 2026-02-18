"use client";

import { useMemo, useState } from "react";
import { RefreshCw, Calendar, TrendingUp, Clock, CheckCircle2, BarChart3, Flame, Download, FileText } from "lucide-react";
import { useWeeklyInsights } from "@/hooks/useWeeklyInsights";
import { motion } from "framer-motion";

// Icon mapping for insight types
const insightIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  frequency: BarChart3,
  comparison: TrendingUp,
  consistency: Calendar,
  trigger_pattern: Flame,
  time_pattern: Clock,
  good_days: CheckCircle2,
  severity: BarChart3,
};

export default function WeeklyInsights() {
  const { insights, weekStart, weekEnd, loading, error, refetch } = useWeeklyInsights();
  const [isGenerating, setIsGenerating] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Format date range
  const dateRange = useMemo(() => {
    if (!weekStart || !weekEnd) return "";
    
    const start = new Date(weekStart);
    const end = new Date(weekEnd);
    
    const formatDate = (date: Date) => {
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    };
    
    return `${formatDate(start)} - ${formatDate(end)}`;
  }, [weekStart, weekEnd]);

  // Format severity helper
  const formatSeverity = (severity: number): string => {
    if (severity <= 1) return "Mild";
    if (severity <= 2) return "Moderate";
    return "Severe";
  };

  // Format trend helper
  const formatTrend = (trend: string): string => {
    const lowerTrend = trend.toLowerCase();
    if (lowerTrend.includes("increas")) return "↑ Increasing";
    if (lowerTrend.includes("decreas")) return "↓ Decreasing";
    return "→ Stable";
  };

  // Format date header helper
  const formatDateHeader = (start: string, end: string): string => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    // If same month, only show month once: "December 1 - 30, 2025"
    if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
      const month = startDate.toLocaleDateString("en-US", { month: "long" });
      const startDay = startDate.toLocaleDateString("en-US", { day: "numeric" });
      const endFormatted = endDate.toLocaleDateString("en-US", {
        day: "numeric",
        year: "numeric",
      });
      return `${month} ${startDay} - ${endFormatted}`;
    }
    
    // Different months
    const startFormatted = startDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
    });
    const endFormatted = endDate.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    return `${startFormatted} - ${endFormatted}`;
  };

  // Generate progress bar helper
  const generateProgressBar = (count: number, maxCount: number, maxLength: number = 30): string => {
    const ratio = maxCount > 0 ? count / maxCount : 0;
    const filled = Math.round(ratio * maxLength);
    return "█".repeat(filled) + "░".repeat(maxLength - filled);
  };

  // Handle generate summary
  const handleGenerateSummary = async () => {
    if (!weekStart || !weekEnd) return;

    try {
      setIsGenerating(true);
      setSummaryError(null);

      // Call health-summary API with current week date range
      const response = await fetch(
        `/api/health-summary?startDate=${weekStart}&endDate=${weekEnd}`
      );
      
      if (!response.ok) {
        throw new Error("Failed to generate summary");
      }

      const { report } = await response.json();

      // Calculate max count for progress bars
      const maxSymptomCount = report.topSymptoms && report.topSymptoms.length > 0
        ? Math.max(...report.topSymptoms.map((s: any) => s.count))
        : 1;

      // Build report text with same format as HealthSummaryButton
      const reportText = `
───────────────────────────────────────────────────────────────
                      MY HEALTH SUMMARY
                      
                    ${report.userName || ""}
                ${formatDateHeader(report.dateRange.start, report.dateRange.end)}
───────────────────────────────────────────────────────────────

AT A GLANCE
───────────────────────────────────────────────────────────────
Days Tracked:        ${report.atAGlance.daysTracked} of ${report.atAGlance.totalDays} days (${report.atAGlance.trackingPercentage}%)
Symptoms Logged:     ${report.atAGlance.totalSymptoms} entries
Good Days:           ${report.atAGlance.goodDays} days 🎉
Most Common:         ${report.atAGlance.mostCommonSymptoms}
Typical Severity:    ${formatSeverity(report.atAGlance.typicalSeverity)}


${report.topSymptoms && report.topSymptoms.length > 0 ? `YOUR TOP SYMPTOMS
───────────────────────────────────────────────────────────────

${report.topSymptoms.map((symptom: any, index: number) => {
  const progressBar = generateProgressBar(symptom.count, maxSymptomCount);
  const trend = formatTrend(symptom.trend);
  const mostSeverity = formatSeverity(symptom.mostSeverity);
  return `${symptom.name.padEnd(48)}${symptom.count} times
${progressBar}                     Most: ${mostSeverity}
Trend: ${trend}`;
}).join("\n\n")}

` : ""}${report.patterns && report.patterns.length > 0 ? `PATTERNS FOUND
───────────────────────────────────────────────────────────────

${report.patterns.map((pattern: string) => `  • ${pattern}`).join("\n")}

` : `PATTERNS FOUND
───────────────────────────────────────────────────────────────

  Keep tracking - patterns become clearer with more data.

`}${report.weekByWeek && report.weekByWeek.weeks.length > 0 ? `WEEK BY WEEK
───────────────────────────────────────────────────────────────

         ${report.weekByWeek.weeks.map((w: any) => `Week ${w.week}`).join("    ")}
         ${report.weekByWeek.weeks.map(() => "──────").join("    ")}
Symptoms    ${report.weekByWeek.weeks.map((w: any) => `${w.symptoms}`.padEnd(6)).join("    ")} ${report.weekByWeek.symptomTrend}
Avg Sev.    ${report.weekByWeek.weeks.map((w: any) => `${w.avgSeverity}`.padEnd(6)).join("    ")} ${report.weekByWeek.severityTrend}
Good Days   ${report.weekByWeek.weeks.map((w: any) => `${w.goodDays}`.padEnd(6)).join("    ")} ${report.weekByWeek.goodDaysTrend}

` : ""}${report.triggers && report.triggers.length > 0 ? `COMMON TRIGGERS
───────────────────────────────────────────────────────────────

${report.triggers.map((trigger: any) => `  ${trigger.name.padEnd(20)} appeared in ${trigger.percentage}% of symptom logs`).join("\n")}

` : `COMMON TRIGGERS
───────────────────────────────────────────────────────────────

  No triggers logged yet. Adding triggers helps identify patterns.

`}THINGS TO EXPLORE
───────────────────────────────────────────────────────────────

${report.exploreItems.map((item: string, i: number) => `  □ ${item}`).join("\n")}


───────────────────────────────────────────────────────────────
Generated by MenoLisa • ${new Date().toLocaleDateString("en-US", {
  month: "long",
  day: "numeric",
  year: "numeric",
})}

This summary is for personal reference only and does not 
constitute medical advice. Consult a healthcare provider 
for medical concerns.
───────────────────────────────────────────────────────────────
      `.trim();

      // Create and download file
      const blob = new Blob([reportText], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `health-summary-${weekStart}-${weekEnd}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : "Failed to generate summary");
    } finally {
      setIsGenerating(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="bg-card backdrop-blur-lg rounded-2xl border border-border/30 p-4 sm:p-6 shadow-xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded bg-card/60 animate-pulse" />
            <div className="h-7 w-48 bg-card/60 animate-pulse rounded" />
          </div>
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-4 w-full bg-card/60 animate-pulse rounded" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="bg-card backdrop-blur-lg rounded-2xl border border-border/30 p-4 sm:p-6 shadow-xl mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-pink-500" />
            <h3 className="text-2xl font-semibold text-card-foreground">Your Week at a Glance</h3>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  // Empty state
  if (insights.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-card backdrop-blur-lg rounded-2xl border border-border/30 p-4 sm:p-6 shadow-xl mb-6"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-8 w-8 text-pink-500" />
            <h3 className="text-2xl font-semibold text-card-foreground">Your Week at a Glance</h3>
          </div>
        </div>
        {dateRange && (
          <p className="text-sm text-muted-foreground mb-4">{dateRange}</p>
        )}
        <div className="text-center py-6">
          <p className="text-muted-foreground mb-2">Start tracking to see your weekly insights.</p>
          <p className="text-sm text-muted-foreground">Log your first symptom today.</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-card backdrop-blur-lg rounded-2xl border border-border/30 p-4 sm:p-6 shadow-xl mb-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="h-8 w-8 text-pink-500 shrink-0" />
            <h3 className="text-2xl font-semibold text-card-foreground">Your Week at a Glance</h3>
          </div>
          {dateRange && (
            <p className="text-sm text-muted-foreground ml-11">{dateRange}</p>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="p-2 rounded-lg text-muted-foreground hover:bg-card/80 transition-colors shrink-0"
          aria-label="Refresh insights"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Insights List */}
      <div className="space-y-3 mb-4">
        {insights.map((insight, index) => {
          const Icon = insightIcons[insight.type] || BarChart3;
          
          return (
            <motion.div
              key={`${insight.type}-${index}`}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              className="flex items-start gap-3 p-2 rounded-lg hover:bg-card/50 transition-colors"
            >
              <Icon className="h-5 w-5 text-pink-500 shrink-0 mt-0.5" />
              <p className="text-sm text-card-foreground flex-1">{insight.content}</p>
            </motion.div>
          );
        })}
      </div>

      {/* Get Summary Button */}
      <div className="flex items-center justify-between">
        <button
          onClick={handleGenerateSummary}
          disabled={isGenerating || !weekStart || !weekEnd}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs bg-card/40 hover:bg-card/60 backdrop-blur-md text-foreground font-medium rounded-lg transition-colors border border-border/30 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <FileText className="h-3.5 w-3.5 animate-pulse" />
              Generating...
            </>
          ) : (
            <>
              <Download className="h-3.5 w-3.5" />
              Get Summary
            </>
          )}
        </button>
        {summaryError && (
          <p className="text-xs text-red-500">{summaryError}</p>
        )}
      </div>
    </motion.div>
  );
}
