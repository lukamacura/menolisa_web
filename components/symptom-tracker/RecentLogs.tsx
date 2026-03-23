"use client";

import { memo, useMemo } from "react";
import { Trash2, Calendar } from "lucide-react";
import { motion } from "framer-motion";
import type { SymptomLog } from "@/lib/symptom-tracker-constants";
import { SEVERITY_LABELS } from "@/lib/symptom-tracker-constants";
import { formatDateSimple } from "@/lib/dateUtils";
import { resolveSymptomLucideIcon } from "@/lib/symptomIconMapping";

interface RecentLogsProps {
  logs: SymptomLog[];
  loading?: boolean;
  onLogClick?: (log: SymptomLog) => void;
  onDelete?: (log: SymptomLog) => void;
}

// Generate daily summary for days with 5+ symptoms
function generateDailySummary(logsForDay: SymptomLog[]): string | null {
  if (logsForDay.length < 5) return null;

  // Find the date string for this day
  const dateStr = formatDateSimple(logsForDay[0].logged_at).dateStr;
  
  // Find symptom with highest severity
  const worstSymptom = logsForDay.reduce((worst, log) => {
    if (log.severity > (worst?.severity || 0)) {
      return log;
    }
    return worst;
  }, logsForDay[0]);

  const worstSymptomName = worstSymptom.symptoms?.name || "symptoms";
  
  return `${dateStr} was rough - you logged ${logsForDay.length} symptom${logsForDay.length > 1 ? 's' : ''}. ${worstSymptomName} hit hardest.`;
}

export default function RecentLogs({ logs, loading, onLogClick, onDelete }: RecentLogsProps) {

  // Helper to get local date key (YYYY-MM-DD) without timezone issues
  const getLocalDateKey = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Group logs by date and generate summaries
  const logsWithSummaries = useMemo(() => {
    // Group logs by LOCAL date (not UTC) to avoid timezone issues
    const grouped: Record<string, SymptomLog[]> = {};
    logs.slice(0, 10).forEach((log) => {
      const logDate = new Date(log.logged_at);
      const dateKey = getLocalDateKey(logDate);
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(log);
    });

    // Generate summaries for days with 5+ symptoms
    const summaries: Record<string, string> = {};
    Object.entries(grouped).forEach(([dateKey, dayLogs]) => {
      const summary = generateDailySummary(dayLogs);
      if (summary) {
        summaries[dateKey] = summary;
      }
    });

    // Create structure with logs and summary info
    interface LogWithSummary {
      log: SymptomLog;
      showSummaryBefore?: string; // Summary text to show before this log
    }

    const result: LogWithSummary[] = [];
    Object.entries(grouped)
      .sort(([a], [b]) => b.localeCompare(a)) // Sort dates descending
      .forEach(([dateKey, dayLogs]) => {
        // Sort logs within day by time (newest first)
        dayLogs.sort((a, b) => 
          new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()
        );
        // Add summary to first log of the day if it exists
        dayLogs.forEach((log, idx) => {
          result.push({
            log,
            showSummaryBefore: idx === 0 && summaries[dateKey] ? summaries[dateKey] : undefined,
          });
        });
      });

    return result;
  }, [logs]);

  // Animated List Item Component - simplified for smooth fade-in
  const AnimatedListItem = memo(function AnimatedListItem({
    children,
    index,
  }: {
    children: React.ReactNode;
    index: number;
  }) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          duration: 0.3,
          delay: index * 0.05, // Fast stagger: 50ms per item
          ease: [0.4, 0, 0.2, 1], // Smooth ease-in-out
        }}
      >
        {children}
      </motion.div>
    );
  });

  // Skeleton loading with fade transition
  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-xl border border-foreground/10 bg-background/60 backdrop-blur-lg p-4"
          >
            <div className="h-5 w-48 bg-foreground/10 rounded mb-3" />
            <div className="h-4 w-32 bg-foreground/10 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="rounded-xl border border-border/30 bg-card p-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-foreground/5">
          <svg
            className="h-8 w-8 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>
        <h3 className="mb-2 text-lg font-semibold text-foreground">
          No symptoms logged yet
        </h3>
        <p className="text-sm text-muted-foreground">
          Start tracking your symptoms to see them here.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="space-y-3"
    >
        {logsWithSummaries.map((item, index) => {
        const { log } = item;
        const { dateStr, timeStr } = formatDateSimple(log.logged_at);
        const symptomName = log.symptoms?.name || "Unknown";
        const symptomIconName = log.symptoms?.icon || "Activity";
        const SymptomIcon = resolveSymptomLucideIcon({
          name: symptomName,
          icon: symptomIconName,
        });

        return (
          <div key={log.id}>
            {item.showSummaryBefore && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-pink-200 bg-pink-50/50 p-3">
                <Calendar className="h-5 w-5 text-pink-600 shrink-0 mt-0.5" />
                <p className="text-md text-foreground font-bold leading-relaxed">
                  {item.showSummaryBefore}
                </p>
              </div>
            )}
            <AnimatedListItem index={index}>
              <div
                className="group rounded-xl border border-border backdrop-blur-md p-4 transition-colors hover:border-border/50 hover:bg-card/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <div 
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => onLogClick?.(log)}
                  >
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <SymptomIcon className="h-5 w-5 text-foreground shrink-0" />
                      <h3 className="text-base font-semibold text-foreground truncate">
                        {symptomName}
                      </h3>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        {(() => {
                          const severityInfo = SEVERITY_LABELS[log.severity as keyof typeof SEVERITY_LABELS];
                          const SeverityIcon = severityInfo?.icon;
                          if (!SeverityIcon) return null;
                          return (
                            <div className="flex items-center gap-1.5">
                              <SeverityIcon 
                                className={`h-4 w-4 ${
                                  log.severity === 1 
                                    ? 'text-green-500' 
                                    : log.severity === 2 
                                    ? 'text-yellow-500' 
                                    : 'text-red-500'
                                }`} 
                              />
                              <span className={`text-xs font-medium ${
                                log.severity === 1 
                                  ? 'text-green-600' 
                                  : log.severity === 2 
                                  ? 'text-yellow-600' 
                                  : 'text-red-600'
                              }`}>
                                {severityInfo.label}
                              </span>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{dateStr}</span>
                      {dateStr === "Today" && <span>•</span>}
                      {dateStr === "Today" && <span>{timeStr}</span>}
                    </div>
                    {log.triggers && log.triggers.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {log.triggers.map((trigger) => (
                          <span
                            key={trigger}
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 border border-blue-200"
                          >
                            {trigger}
                          </span>
                        ))}
                      </div>
                    )}
                    {log.notes && (
                      <p className="mt-2 text-sm text-foreground/80 line-clamp-2">
                        {log.notes}
                      </p>
                    )}
                  </div>
                  {onDelete && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(log);
                        }}
                        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary-light/50 hover:text-primary-dark"
                        aria-label="Delete symptom log"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </AnimatedListItem>
          </div>
        );
      })}
    </motion.div>
  );
}
