/**
 * Calendar helpers and streak math for daily_mood (date = YYYY-MM-DD in DB).
 */

export function addDaysToIsoDate(ymd: string, deltaDays: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

/**
 * Normalize DB date (date or timestamptz string) to YYYY-MM-DD.
 */
export function normalizeMoodDate(raw: string): string {
  return raw.split('T')[0];
}

/**
 * Consecutive calendar days with a mood log, counting backwards from endDate (inclusive).
 * If there is no log on endDate, streak is 0 (same-day check-in required to extend streak).
 */
export function computeMoodStreakFromDates(
  loggedDates: Iterable<string>,
  endDate: string,
): number {
  const set = new Set(
    [...loggedDates].map((d) => normalizeMoodDate(d)),
  );
  let streak = 0;
  let d = normalizeMoodDate(endDate);
  while (set.has(d)) {
    streak++;
    d = addDaysToIsoDate(d, -1);
  }
  return streak;
}
