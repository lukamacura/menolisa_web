/**
 * Exercise State Detectors
 * Detects low-energy states and overtraining signals for exercise persona
 */

/**
 * Detects if user is in a low-energy state
 * Looks for: fatigue, poor sleep, stress, overwhelm, bloating, low mood
 */
export function isLowEnergyState(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  const lowEnergyIndicators = [
    "fatigue",
    "tired",
    "exhausted",
    "worn out",
    "drained",
    "poor sleep",
    "slept badly",
    "slept poorly",
    "didn't sleep well",
    "insomnia",
    "stress",
    "stressed",
    "stressing",
    "overwhelm",
    "overwhelmed",
    "overwhelming",
    "bloating",
    "bloated",
    "low mood",
    "low energy",
    "no energy",
    "zero energy",
    "can't get motivated",
    "unmotivated",
    "feeling down",
    "feeling low",
  ];
  
  return lowEnergyIndicators.some(indicator => lowerText.includes(indicator));
}

/**
 * Detects if user is showing overtraining signals
 * Looks for: soreness >48h, joint pain, poor sleep after workouts, heavy fatigue, energy dips
 */
export function isOvertrainingSignal(text: string): boolean {
  const lowerText = text.toLowerCase();
  
  const overtrainingIndicators = [
    "sore for 3 days",
    "sore for 4 days",
    "sore for 5 days",
    "sore for a week",
    "still sore after",
    "soreness lasting",
    "soreness >48",
    "soreness more than 48",
    "joint pain",
    "joints hurt",
    "joints aching",
    "poor sleep after workout",
    "can't sleep after exercise",
    "insomnia after training",
    "heavy fatigue",
    "extreme fatigue",
    "energy dips",
    "energy crash",
    "crashing after workout",
    "exhausted for days",
    "recovery taking too long",
    "not recovering",
    "chronic soreness",
    "persistent pain",
  ];
  
  return overtrainingIndicators.some(indicator => lowerText.includes(indicator));
}

