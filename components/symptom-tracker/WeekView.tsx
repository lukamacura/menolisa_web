"use client";

import { useState, useMemo, useEffect } from "react";
import { ChevronDown, ChevronUp, Trash2, CircleDot } from "lucide-react";
import type { SymptomLog } from "@/lib/symptom-tracker-constants";
import { SEVERITY_LABELS } from "@/lib/symptom-tracker-constants";
import { formatDateSimple } from "@/lib/dateUtils";
import { getIconFromName } from "@/lib/symptomIconMapping";
import { motion, AnimatePresence } from "framer-motion";

interface WeekViewProps {
  logs: SymptomLog[];
  onLogClick?: (log: SymptomLog) => void;
  onDelete?: (log: SymptomLog) => void;
}

interface DayData {
  date: Date;
  dateKey: string;
  logs: SymptomLog[];
  worstSeverity: number | null; // null = no logs
  logCount: number;
  hasPeriod: boolean;
}

// Helper to get local date key (YYYY-MM-DD) without timezone issues
function getLocalDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function WeekView({ logs, onLogClick, onDelete }: WeekViewProps) {
  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [, forceUpdate] = useState(0);
  
  // Listen for symptom log updates to force re-render
  useEffect(() => {
    const handleUpdate = () => {
      forceUpdate(prev => prev + 1);
    };
    
    window.addEventListener('symptom-log-updated', handleUpdate);
    return () => {
      window.removeEventListener('symptom-log-updated', handleUpdate);
    };
  }, []);

  // Process logs for last 7 days
  const weekData = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6); // Include today, so 6 days ago
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // Filter logs from last 7 days
    const recentLogs = logs.filter((log) => {
      const logDate = new Date(log.logged_at);
      return logDate >= sevenDaysAgo && logDate <= today;
    });

    // Group by LOCAL date (not UTC) to avoid timezone issues
    const grouped: Record<string, SymptomLog[]> = {};
    recentLogs.forEach((log) => {
      const logDate = new Date(log.logged_at);
      const dateKey = getLocalDateKey(logDate);
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(log);
    });

    // Create day data for each of the last 7 days
    const daysData: DayData[] = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      const dateKey = getLocalDateKey(date);
      const dayLogs = grouped[dateKey] || [];
      
      const worstSeverity = dayLogs.length > 0
        ? Math.max(...dayLogs.map(log => log.severity))
        : null;

      const hasPeriod = dayLogs.some(log => log.symptoms?.name === 'Period');

      daysData.push({
        date,
        dateKey,
        logs: dayLogs.sort((a, b) => new Date(b.logged_at).getTime() - new Date(a.logged_at).getTime()),
        worstSeverity,
        logCount: dayLogs.length,
        hasPeriod,
      });
    }

    return daysData;
  }, [logs]);

  const getSeverityColor = (severity: number | null): string => {
    if (severity === null) return "bg-gray-300";
    if (severity === 1) return "bg-green-500";
    if (severity === 2) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getDayName = (date: Date): string => {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return dayNames[date.getDay()];
  };

  const toggleDay = (dateKey: string) => {
    setExpandedDay(expandedDay === dateKey ? null : dateKey);
  };

  return (
    <div className="space-y-4">
      {/* 7-day grid */}
      <div className="grid grid-cols-7 gap-2">
        {weekData.map((day) => {
          const todayKey = getLocalDateKey(new Date());
          const isToday = day.dateKey === todayKey;
          const isExpanded = expandedDay === day.dateKey;

          return (
            <div key={day.dateKey} className="flex flex-col items-center">
              <button
                onClick={() => toggleDay(day.dateKey)}
                className={`w-full rounded-lg p-2 cursor-pointer transition-all hover:bg-card/40 
                  ${isToday ? 'ring-2 ring-primary ring-opacity-50' : ''}
                  ${isExpanded ? 'bg-card/60' : ''}`}
                type="button"
                aria-label={`${getDayName(day.date)} ${day.date.getDate()}, ${day.logCount} logs`}
              >
                {/* Day name */}
                <div className="text-xs text-muted-foreground mb-1 text-center font-medium">
                  {getDayName(day.date)}
                </div>
                
                {/* Day number */}
                <div className="text-sm text-card-foreground mb-2 text-center font-semibold">
                  {day.date.getDate()}
                </div>

                {/* Severity dot */}
                <div className="flex justify-center mb-1 relative">
                  <div
                    className={`w-6 h-6 rounded-full ${getSeverityColor(day.worstSeverity)} 
                      ${day.logCount > 0 ? 'shadow-md' : 'border-2 border-gray-400'}`}
                  />
                  {/* Period indicator */}
                  {day.hasPeriod && (
                    <div className="absolute -bottom-1 -right-1 bg-pink-500 rounded-full p-0.5">
                      <CircleDot className="h-3 w-3 text-white" />
                    </div>
                  )}
                </div>

                {/* Log count badge */}
                {day.logCount > 0 && (
                  <div className="text-xs text-[#6B6B6B] text-center font-medium">
                    {day.logCount} log{day.logCount !== 1 ? 's' : ''}
                  </div>
                )}

                {/* Expand indicator */}
                {day.logCount > 0 && (
                  <div className="flex justify-center mt-1">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-[#6B6B6B]" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-[#6B6B6B]" />
                    )}
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Expanded day logs */}
      <AnimatePresence>
        {expandedDay && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-card backdrop-blur-lg rounded-xl p-4 border border-border/30 mt-2 space-y-2">
              {(() => {
                const day = weekData.find(d => d.dateKey === expandedDay);
                if (!day || day.logs.length === 0) return null;

                return (
                  <>
                    <h3 className="text-sm font-semibold text-[#8B7E74] mb-3">
                      {formatDateSimple(day.date.toISOString()).dateStr}
                    </h3>
                    {day.logs.map((log) => {
                      const SymptomIcon = getIconFromName(
                        log.symptoms?.icon || 'Activity'
                      );
                      const severityInfo = SEVERITY_LABELS[log.severity as keyof typeof SEVERITY_LABELS];
                      const SeverityIcon = severityInfo.icon;

                      return (
                        <div
                          key={log.id}
                          className="flex items-center gap-3 p-3 bg-card/40 backdrop-blur-md rounded-lg 
                            border border-border/30 hover:bg-card/60 transition-colors cursor-pointer"
                          onClick={() => onLogClick?.(log)}
                        >
                          <div className="flex-shrink-0">
                            <SymptomIcon className="h-5 w-5 text-[#3D3D3D]" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium text-[#3D3D3D] text-sm">
                                {log.symptoms?.name || "Unknown"}
                              </span>
                              <SeverityIcon
                                className={`h-4 w-4 ${
                                  log.severity === 1
                                    ? "text-green-600"
                                    : log.severity === 2
                                    ? "text-yellow-600"
                                    : "text-red-600"
                                }`}
                              />
                            </div>
                            <div className="text-xs text-[#6B6B6B]">
                              {new Date(log.logged_at).toLocaleTimeString([], {
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                              {log.triggers && log.triggers.length > 0 && (
                                <span className="ml-2">
                                  • {log.triggers.slice(0, 2).join(", ")}
                                  {log.triggers.length > 2 && "..."}
                                </span>
                              )}
                            </div>
                          </div>
                          {onDelete && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onDelete(log);
                              }}
                              className="flex-shrink-0 p-1 text-[#9A9A9A] hover:text-red-600 transition-colors cursor-pointer"
                              type="button"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
