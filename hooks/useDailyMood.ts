import { useState, useEffect } from 'react';

export interface DailyMood {
  id: string;
  user_id: string;
  date: string;
  mood: number; // 1=Rough, 2=Okay, 3=Good, 4=Great
  created_at: string;
  updated_at: string;
}

interface UseDailyMoodResult {
  mood: DailyMood | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  setMood: (mood: number, date?: string) => Promise<void>;
}

export function useDailyMood(date?: string): UseDailyMoodResult {
  const [mood, setMoodState] = useState<DailyMood | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const targetDate = date || new Date().toISOString().split('T')[0];

  const fetchMood = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/daily-mood?date=${targetDate}`, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch daily mood');
      }

      const { data } = await response.json();
      setMoodState(data || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setMoodState(null);
    } finally {
      setLoading(false);
    }
  };

  const setMood = async (moodValue: number, dateParam?: string) => {
    try {
      setError(null);

      const response = await fetch('/api/daily-mood', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mood: moodValue,
          date: dateParam || targetDate,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save daily mood');
      }

      const { data } = await response.json();
      setMoodState(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      throw err;
    }
  };

  useEffect(() => {
    fetchMood();
  }, [targetDate]);

  return {
    mood,
    loading,
    error,
    refetch: fetchMood,
    setMood,
  };
}
