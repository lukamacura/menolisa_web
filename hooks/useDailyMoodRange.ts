import { useState, useEffect } from 'react';
import type { DailyMood } from './useDailyMood';

interface UseDailyMoodRangeResult {
  moods: DailyMood[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useDailyMoodRange(startDate: string, endDate: string): UseDailyMoodRangeResult {
  const [moods, setMoods] = useState<DailyMood[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMoods = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch moods for date range
      const response = await fetch(`/api/daily-mood?startDate=${startDate}&endDate=${endDate}`, {
        method: 'GET',
        cache: 'no-store',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch daily moods');
      }

      const { data } = await response.json();
      setMoods(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setMoods([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (startDate && endDate) {
      fetchMoods();
    }
  }, [startDate, endDate]);

  return {
    moods,
    loading,
    error,
    refetch: fetchMoods,
  };
}
