/**
 * Formats the health-summary API report as readable plain text.
 * Used for .txt download (web) and share/copy (mobile).
 * Week-by-week is narrative (no column table) for readability.
 */

export interface HealthSummaryReport {
  userName: string | null;
  dateRange: { start: string; end: string };
  atAGlance: {
    daysTracked: number;
    totalDays: number;
    trackingPercentage: number;
    totalSymptoms: number;
    goodDays: number;
    mostCommonSymptoms: string;
    typicalSeverity: number;
  };
  topSymptoms: Array<{
    name: string;
    count: number;
    avgSeverity?: number;
    mostSeverity: number;
    trend: string;
  }>;
  patterns: string[];
  weekByWeek?: {
    weeks: Array<{ week: number; symptoms: number; avgSeverity: string; goodDays: number }>;
    symptomTrend: string;
    severityTrend: string;
    goodDaysTrend: string;
  };
  triggers: Array<{ name: string; percentage: number }>;
  exploreItems: string[];
}

function formatSeverity(severity: number): string {
  if (severity <= 1) return "Mild";
  if (severity <= 2) return "Moderate";
  return "Severe";
}

function formatTrend(trend: string): string {
  const lowerTrend = trend.toLowerCase();
  if (lowerTrend.includes("increas")) return "↑ Increasing";
  if (lowerTrend.includes("decreas")) return "↓ Decreasing";
  return "→ Stable";
}

function formatDateHeader(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  if (startDate.getMonth() === endDate.getMonth() && startDate.getFullYear() === endDate.getFullYear()) {
    const month = startDate.toLocaleDateString("en-US", { month: "long" });
    const startDay = startDate.toLocaleDateString("en-US", { day: "numeric" });
    const endFormatted = endDate.toLocaleDateString("en-US", { day: "numeric", year: "numeric" });
    return `${month} ${startDay} - ${endFormatted}`;
  }
  const startFormatted = startDate.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  const endFormatted = endDate.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  return `${startFormatted} - ${endFormatted}`;
}

function generateProgressBar(count: number, maxCount: number, maxLength: number = 30): string {
  const ratio = maxCount > 0 ? count / maxCount : 0;
  const filled = Math.round(ratio * maxLength);
  return "█".repeat(filled) + "░".repeat(maxLength - filled);
}

export function formatHealthSummaryReport(report: HealthSummaryReport): string {
  const maxSymptomCount =
    report.topSymptoms && report.topSymptoms.length > 0
      ? Math.max(...report.topSymptoms.map((s) => s.count))
      : 1;

  const weekByWeekSection =
    report.weekByWeek && report.weekByWeek.weeks.length > 0
      ? (() => {
          const { weeks, symptomTrend, severityTrend, goodDaysTrend } = report.weekByWeek;
          const lines = weeks.map(
            (w) =>
              `Week ${w.week}: ${w.symptoms} symptoms logged, average severity ${w.avgSeverity}, ${w.goodDays} good days.`
          );
          const overall =
            weeks.length >= 2 && (symptomTrend || severityTrend || goodDaysTrend)
              ? `\nOverall: ${[symptomTrend && `Symptoms trend ${symptomTrend}`, severityTrend && `Severity ${severityTrend}`, goodDaysTrend && `Good days ${goodDaysTrend}`].filter(Boolean).join(". ")}.`
              : weeks.length === 1
                ? "\nOnly one week in this range; keep tracking for trends."
                : "";
          return `WEEK BY WEEK
───────────────────────────────────────────────────────────────

${lines.join("\n")}${overall}

`;
        })()
      : "";

  const topSymptomsSection =
    report.topSymptoms && report.topSymptoms.length > 0
      ? `YOUR TOP SYMPTOMS
───────────────────────────────────────────────────────────────

${report.topSymptoms
  .map((symptom) => {
    const progressBar = generateProgressBar(symptom.count, maxSymptomCount);
    const trend = formatTrend(symptom.trend);
    const mostSeverity = formatSeverity(symptom.mostSeverity);
    return `${symptom.name.padEnd(48)}${symptom.count} times
${progressBar}                     Most: ${mostSeverity}
Trend: ${trend}`;
  })
  .join("\n\n")}

`
    : "";

  const patternsSection = `PATTERNS FOUND
───────────────────────────────────────────────────────────────

${report.patterns && report.patterns.length > 0 ? report.patterns.map((p) => `  • ${p}`).join("\n") : "  Keep tracking - patterns become clearer with more data."}

`;

  const triggersSection = report.triggers && report.triggers.length > 0
    ? `COMMON TRIGGERS
───────────────────────────────────────────────────────────────

${report.triggers.map((t) => `  ${t.name.padEnd(20)} appeared in ${t.percentage}% of symptom logs`).join("\n")}

`
    : `COMMON TRIGGERS
───────────────────────────────────────────────────────────────

  No triggers logged yet. Adding triggers helps identify patterns.

`;

  return `
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


${topSymptomsSection}${patternsSection}${weekByWeekSection}${triggersSection}THINGS TO EXPLORE
───────────────────────────────────────────────────────────────

${(report.exploreItems || []).map((item) => `  □ ${item}`).join("\n")}


───────────────────────────────────────────────────────────────
Generated by MenoLisa • ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}

This summary is for personal reference only and does not 
constitute medical advice. Consult a healthcare provider 
for medical concerns.
───────────────────────────────────────────────────────────────
`.trim();
}
