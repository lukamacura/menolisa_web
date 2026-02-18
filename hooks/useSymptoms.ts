import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import type { Symptom } from '@/lib/symptom-tracker-constants';

interface UseSymptomsResult {
  symptoms: Symptom[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useSymptoms(): UseSymptomsResult {
  const [symptoms, setSymptoms] = useState<Symptom[]>([]);
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
        setSymptoms([]);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchSymptoms = useCallback(async () => {
    // Don't fetch if no user
    if (!user) {
      setLoading(false);
      setSymptoms([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/symptoms', {
        method: 'GET',
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch symptoms');
      }

      const { data } = await response.json();
      setSymptoms(data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setSymptoms([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchSymptoms();
  }, [fetchSymptoms]);

  return {
    symptoms,
    loading,
    error,
    refetch: fetchSymptoms,
  };
}

