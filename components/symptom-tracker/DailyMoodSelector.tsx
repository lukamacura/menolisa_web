"use client";

import { useMemo } from "react";
import { Frown, Meh, Smile, Star } from "lucide-react";
import { useDailyMood } from "@/hooks/useDailyMood";

const MOOD_OPTIONS = [
  { value: 1, icon: Frown, label: "Rough", color: "bg-red-500/20 border-red-500/50 text-red-700" },
  { value: 2, icon: Meh, label: "Okay", color: "bg-yellow-500/20 border-yellow-500/50 text-yellow-700" },
  { value: 3, icon: Smile, label: "Good", color: "bg-green-500/20 border-green-500/50 text-green-700" },
  { value: 4, icon: Star, label: "Great", color: "bg-emerald-500/20 border-emerald-500/50 text-emerald-700" },
] as const;

interface DailyMoodSelectorProps {
  date?: string; // Optional date, defaults to today
}

export default function DailyMoodSelector({ date }: DailyMoodSelectorProps) {
  const { mood, loading, setMood } = useDailyMood(date);

  const selectedMood = useMemo(() => {
    return mood?.mood || null;
  }, [mood]);

  const handleMoodClick = async (moodValue: number) => {
    try {
      await setMood(moodValue, date);
    } catch (error) {
      console.error("Failed to set mood:", error);
    }
  };

  if (loading) {
    return (
      <div className="bg-card backdrop-blur-lg rounded-2xl p-4 border border-border/30">
        <div className="animate-pulse space-y-3">
          <div className="h-5 w-32 bg-card/60 rounded"></div>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 flex-1 bg-card/60 rounded-xl"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card backdrop-blur-lg rounded-2xl p-4 sm:p-5 border border-border/30 shadow-xl">
      <h3 className="text-base sm:text-lg font-semibold text-card-foreground mb-3 sm:mb-4">
        How's today going?
      </h3>
      <div className="flex flex-wrap gap-2 sm:gap-3">
        {MOOD_OPTIONS.map((option) => {
          const isSelected = selectedMood === option.value;
          const IconComponent = option.icon;
          return (
            <button
              key={option.value}
              data-mood={option.value}
              onClick={() => handleMoodClick(option.value)}
              className={`flex-1 min-w-[80px] sm:min-w-[100px] px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl 
                         border-2 transition-all cursor-pointer
                         flex flex-col items-center gap-1 sm:gap-1.5
                         ${
                           isSelected
                             ? `${option.color} border-opacity-100 scale-[1.02] shadow-md font-semibold`
                             : "bg-card/40 border-border/30 text-muted-foreground hover:bg-card/60 hover:border-border/40"
                         }`}
              type="button"
            >
              <IconComponent className={`h-6 w-6 sm:h-7 sm:w-7 ${
                isSelected 
                  ? option.value === 1 
                    ? "text-red-700" 
                    : option.value === 2 
                    ? "text-yellow-700" 
                    : option.value === 3 
                    ? "text-green-700" 
                    : "text-emerald-700"
                  : "text-muted-foreground"
              }`} />
              <span className="text-xs sm:text-sm font-medium">{option.label}</span>
            </button>
          );
        })}
      </div>
      {selectedMood && (
        <p className="text-sm text-muted-foreground mt-3 text-center">
          You said today was <strong>{MOOD_OPTIONS.find(m => m.value === selectedMood)?.label}</strong>
        </p>
      )}
    </div>
  );
}
