import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

interface UserProfile {
  name?: string | null;
  email?: string;
}

export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setProfile(null);
          return;
        }

        // Fetch user profile
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('name')
          .eq('user_id', user.id)
          .single();

        setProfile({
          name: profileData?.name || null,
          email: user.email || undefined,
        });
      } catch (error) {
        console.error('Error fetching user profile:', error);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, []);

  return { profile, loading };
}

