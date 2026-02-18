/**
 * Streak calculation and update logic
 */

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastLogDate: Date | null;
  totalLogs: number;
  totalGoodDays: number;
}

/**
 * Calculate streak based on logs
 * Returns the number of consecutive days with at least one log, counting backwards from today
 */
export function calculateStreak(logDates: Date[]): number {
  if (logDates.length === 0) return 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Get unique dates (one per day)
  const uniqueDates = Array.from(
    new Set(logDates.map(d => {
      const date = new Date(d);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    }))
  )
    .map(time => new Date(time))
    .sort((a, b) => b.getTime() - a.getTime()); // Most recent first

  let streak = 0;
  let checkDate = new Date(today);
  checkDate.setHours(0, 0, 0, 0);

  // Check if today has a log
  const todayHasLog = uniqueDates.some(date => date.getTime() === checkDate.getTime());
  if (!todayHasLog) {
    // If today doesn't have a log, start checking from yesterday
    checkDate.setDate(checkDate.getDate() - 1);
  }

  // Count consecutive days backwards
  for (let i = 0; i < 365; i++) {
    const hasLog = uniqueDates.some(date => {
      const logDate = new Date(date);
      logDate.setHours(0, 0, 0, 0);
      return logDate.getTime() === checkDate.getTime();
    });

    if (hasLog) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

/**
 * Calculate longest streak from logs
 */
export function calculateLongestStreak(logDates: Date[]): number {
  if (logDates.length === 0) return 0;

  // Get unique dates sorted
  const uniqueDates = Array.from(
    new Set(logDates.map(d => {
      const date = new Date(d);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    }))
  )
    .map(time => new Date(time))
    .sort((a, b) => a.getTime() - b.getTime()); // Oldest first

  if (uniqueDates.length === 0) return 0;

  let longestStreak = 1;
  let currentStreak = 1;

  for (let i = 1; i < uniqueDates.length; i++) {
    const prevDate = new Date(uniqueDates[i - 1]);
    const currentDate = new Date(uniqueDates[i]);
    const daysDiff = Math.floor((currentDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff === 1) {
      // Consecutive day
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      // Break in streak
      currentStreak = 1;
    }
  }

  return longestStreak;
}

/**
 * Update streak data when a new log is created
 */
export function updateStreakOnNewLog(
  existingStreak: StreakData,
  newLogDate: Date
): StreakData {
  const logDate = new Date(newLogDate);
  logDate.setHours(0, 0, 0, 0);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let newCurrentStreak = existingStreak.currentStreak;
  let newLastLogDate = existingStreak.lastLogDate;

  // Check if this is a new day
  if (!existingStreak.lastLogDate || 
      existingStreak.lastLogDate.getTime() !== logDate.getTime()) {
    newLastLogDate = logDate;

    // Check if this continues the streak
    if (existingStreak.lastLogDate) {
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const lastLogDateNormalized = new Date(existingStreak.lastLogDate);
      lastLogDateNormalized.setHours(0, 0, 0, 0);

      if (logDate.getTime() === today.getTime() || 
          logDate.getTime() === yesterday.getTime()) {
        // Today or yesterday - continue streak
        if (lastLogDateNormalized.getTime() === yesterday.getTime() ||
            lastLogDateNormalized.getTime() === today.getTime()) {
          newCurrentStreak = existingStreak.currentStreak + 1;
        } else {
          // Gap in streak - restart
          newCurrentStreak = 1;
        }
      } else {
        // More than a day ago - restart streak
        newCurrentStreak = 1;
      }
    } else {
      // First log
      newCurrentStreak = 1;
    }
  }

  const newLongestStreak = Math.max(existingStreak.longestStreak, newCurrentStreak);

  return {
    currentStreak: newCurrentStreak,
    longestStreak: newLongestStreak,
    lastLogDate: newLastLogDate,
    totalLogs: existingStreak.totalLogs + 1,
    totalGoodDays: existingStreak.totalGoodDays, // Good days are tracked separately
  };
}

