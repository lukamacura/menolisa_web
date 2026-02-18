import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface UserPreferences {
  current_streak?: number | null;
  longest_streak?: number | null;
  last_log_date?: string | null;
  total_logs?: number | null;
  total_good_days?: number | null;
}

export function useUserPreferences() {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPreferences() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setPreferences(null);
          return;
        }

        // Fetch user preferences
        const { data: prefData } = await supabase
          .from('user_preferences')
          .select('current_streak, longest_streak, last_log_date, total_logs, total_good_days')
          .eq('user_id', user.id)
          .single();

        setPreferences(prefData || null);
      } catch (error) {
        console.error('Error fetching user preferences:', error);
        setPreferences(null);
      } finally {
        setLoading(false);
      }
    }

    fetchPreferences();
  }, []);

  return { preferences, loading };
}

