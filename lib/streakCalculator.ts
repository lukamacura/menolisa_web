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

