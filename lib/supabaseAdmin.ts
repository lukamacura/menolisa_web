import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseAdminClient: SupabaseClient<any> | null = null;

/**
 * Get or create Supabase admin client (lazy initialization)
 * This prevents build-time errors when environment variables aren't available
 */
export function getSupabaseAdmin(): SupabaseClient<any> {
  if (supabaseAdminClient) {
    return supabaseAdminClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error(
      "Missing Supabase environment variables. Please ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set."
    );
  }

  supabaseAdminClient = createClient(supabaseUrl, supabaseKey);
  return supabaseAdminClient;
}

