import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { SymptomLog } from '@/lib/symptom-tracker-constants';

interface UseSymptomLogsResult {
  logs: SymptomLog[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSymptomLogs(days: number = 30): UseSymptomLogsResult {
  const [logs, setLogs] = useState<SymptomLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);

  // Get user on mount and listen for auth changes
  useEffect(() => {
    // Get initial user
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser(data.user);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setUser(session.user);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setLogs([]);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchLogs = useCallback(async () => {
    // Don't fetch if no user
    if (!user) {
      setLoading(false);
      setLogs([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/symptom-logs?days=${days}`, {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch symptom logs');
      }

      const { data } = await response.json();
      setLogs(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [days, user]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return {
    logs,
    loading,
    error,
    refetch: fetchLogs,
  };
}

