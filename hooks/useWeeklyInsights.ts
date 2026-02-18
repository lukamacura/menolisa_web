import { useState, useEffect, useCallback } from "react";
import type { WeeklyInsight } from "@/lib/insights/generateInsights";

interface WeeklyInsightsData {
  insights: WeeklyInsight[];
  weekStart: string;
  weekEnd: string;
  loading: boolean;
  error: string | null;
}

export function useWeeklyInsights() {
  const [data, setData] = useState<WeeklyInsightsData>({
    insights: [],
    weekStart: "",
    weekEnd: "",
    loading: true,
    error: null,
  });

  const fetchInsights = useCallback(async () => {
    try {
      setData(prev => ({ ...prev, loading: true, error: null }));
      
      const response = await fetch("/api/insights/weekly");
      
      if (!response.ok) {
        throw new Error("Failed to fetch weekly insights");
      }
      
      const result = await response.json();
      
      setData({
        insights: result.insights || [],
        weekStart: result.weekStart || "",
        weekEnd: result.weekEnd || "",
        loading: false,
        error: null,
      });
    } catch (err) {
      console.error("Error fetching weekly insights:", err);
      setData(prev => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : "Failed to load insights",
      }));
    }
  }, []);

  useEffect(() => {
    fetchInsights();
  }, [fetchInsights]);

  // Refetch when symptom logs are updated
  useEffect(() => {
    const handleUpdate = () => {
      fetchInsights();
    };
    
    window.addEventListener('symptom-log-updated', handleUpdate);
    return () => {
      window.removeEventListener('symptom-log-updated', handleUpdate);
    };
  }, [fetchInsights]);

  return {
    ...data,
    refetch: fetchInsights,
  };
}
