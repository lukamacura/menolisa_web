"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { useSymptomLogs } from "@/hooks/useSymptomLogs";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useUserPreferences } from "@/hooks/useUserPreferences";

export default function PersonalizedGreeting() {
  const { logs } = useSymptomLogs(30);
  const { profile, loading: profileLoading } = useUserProfile();
  const { preferences, loading: preferencesLoading } = useUserPreferences();

  // Time-based greeting with specific time ranges

  const isNightTime = useMemo(() => {
    const hour = new Date().getHours();
    return hour >= 22 || hour < 6;
  }, []);

  // Get display name (prefer name from profile, fallback to email if available)
  const displayName = useMemo(() => {
    if (profile?.name) return profile.name;
    if (profile?.email) {
      // Extract first part of email before @
      return profile.email.split('@')[0];
    }
    return null;
  }, [profile]);

  // Get streak from user_preferences (preferred) or calculate from logs (fallback)
  const streak = useMemo(() => {
    if (preferences?.current_streak !== null && preferences?.current_streak !== undefined) {
      return preferences.current_streak;
    }
    
    // Fallback: calculate from logs
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let streak = 0;
    
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() - i);
      checkDate.setHours(0, 0, 0, 0);
      
      const hasLog = logs.some((log) => {
        const logDate = new Date(log.logged_at);
        logDate.setHours(0, 0, 0, 0);
        return logDate.getTime() === checkDate.getTime();
      });
      
      if (hasLog) {
        streak++;
      } else {
        if (i === 0) continue; // Allow today to be empty
        break;
      }
    }
    
    return streak;
  }, [preferences, logs]);

  // Build greeting text - friendly and casual, like a friend
  const greetingText = useMemo(() => {
    if (!displayName) {
      // No name available - use casual friendly greetings
      const casualGreetings = [
        "Hey there! How are you doing?",
        "Hi! What's going on?",
        "Hey! How can I help?",
        "Hi! What's on your mind?",
        "Hey! How are you feeling?",
      ];
      return casualGreetings[Math.floor(Math.random() * casualGreetings.length)];
    }
    
    // With name - use friendly, casual greetings
    const friendlyGreetings = [
      `Hey ${displayName}! How are you doing?`,
      `Hi ${displayName}! What's going on?`,
      `Hey ${displayName}! How can I help?`,
      `Hi there, ${displayName}! What's on your mind?`,
      `Hey ${displayName}! How are you feeling?`,
      `Hi ${displayName}! What's up?`,
      `Hey ${displayName}! Good to see you. What's happening?`,
      `Hi ${displayName}! I'm here - what's going on?`,
    ];
    
    // Special handling for night time
    if (isNightTime) {
      const nightGreetings = [
        `Hey ${displayName}. Can't sleep?`,
        `Hi ${displayName}. Still up?`,
        `Hey ${displayName}. What's keeping you up?`,
      ];
      return nightGreetings[Math.floor(Math.random() * nightGreetings.length)];
    }
    
    // Random friendly greeting for any time of day
    return friendlyGreetings[Math.floor(Math.random() * friendlyGreetings.length)];
  }, [displayName, isNightTime]);

  // Letter animation state (must be before early returns)
  const [displayedText, setDisplayedText] = useState("");
  const [isAnimating, setIsAnimating] = useState(true);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!greetingText) return;

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    setDisplayedText("");
    setIsAnimating(true);

    let currentIndex = 0;
    intervalRef.current = setInterval(() => {
      if (currentIndex < greetingText.length) {
        setDisplayedText(greetingText.slice(0, currentIndex + 1));
        currentIndex++;
      } else {
        setIsAnimating(false);
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      }
    }, 25); // Slightly faster for smoother feel

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [greetingText]);

  if (profileLoading || preferencesLoading) {
    return (
      <div className="mb-6">
        <div className="h-8 w-64 bg-[#E8E0DB]/30 rounded animate-pulse mb-2" />
        <div className="h-4 w-48 bg-[#E8E0DB]/30 rounded animate-pulse" />
      </div>
    );
  }

  return (
    <div className="mb-6">
      <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold text-[#8B7E74] mb-2">
        {displayedText.split("").map((char, index) => (
          <span
            key={index}
            className={`inline-block ${
              isAnimating && index === displayedText.length - 1
                ? "animate-pulse"
                : ""
            }`}
            style={{
              animationDelay: `${index * 0.03}s`,
            }}
          >
            {char === " " ? "\u00A0" : char}
          </span>
        ))}
        {isAnimating && <span className="inline-block w-0.5 h-5 sm:h-6 md:h-7 bg-[#8B7E74] animate-pulse ml-1" />}
      </h2>
    </div>
  );
}

