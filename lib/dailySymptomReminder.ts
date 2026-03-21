/**
 * Daily symptom-logging nudge from /api/cron/daily-reminders.
 * Kept in one place so dedupe, API POST guards, and web toast filtering stay aligned.
 */
export const DAILY_SYMPTOM_LOG_REMINDER_KIND = "daily_symptom_log" as const;

/** Titles returned by getDayOfWeekTitle in daily-reminders cron plus legacy client title. */
export const DAILY_SYMPTOM_LOG_REMINDER_TITLES = [
  "How's your body today?",
  "A new week, a fresh log",
  "End-of-week check-in",
  "Weekend check-in",
  "Time to check in",
] as const;

export function isDailySymptomLogReminderTitle(title: string): boolean {
  return (DAILY_SYMPTOM_LOG_REMINDER_TITLES as readonly string[]).includes(title);
}

export function isSuppressDailySymptomLogReminderToast(n: {
  type: string;
  title: string;
  metadata?: { reminder_kind?: string };
}): boolean {
  if (n.type !== "reminder") return false;
  if (n.metadata?.reminder_kind === DAILY_SYMPTOM_LOG_REMINDER_KIND) return true;
  return isDailySymptomLogReminderTitle(n.title);
}
