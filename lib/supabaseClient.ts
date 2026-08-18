import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * The browser Supabase client, loaded on demand.
 *
 * This module used to export a ready-made `supabase` const built at import
 * time. That is convenient and it cost the ad funnel 52KB gzipped: a static
 * `createBrowserClient` import pulls GoTrue, PostgREST and Realtime into
 * whatever chunk touches it, and `<ConditionalNavbar />` touches it from the
 * root layout — so every route, including `/register`, downloaded and parsed
 * the whole auth stack before the first question could be tapped.
 *
 * Nothing needs it during render. Every call site in the app is inside an
 * event handler or an effect (sign-in, sign-out, `getUser`, the funnel's
 * end-of-quiz `signInAnonymously`), so `await getSupabase()` is always
 * reachable and the import lands in a lazy chunk instead of the entry.
 *
 * Keep it that way. A single top-level `import { supabase }` anywhere in a
 * client component undoes this for every page that renders that component.
 */
let client: SupabaseClient | null = null;
let pending: Promise<SupabaseClient> | null = null;

export function getSupabase(): Promise<SupabaseClient> {
  if (client) return Promise.resolve(client);
  // One in-flight import shared by concurrent callers: two effects racing on
  // mount must not build two clients (two GoTrue instances means two token
  // refresh loops fighting over the same cookie).
  pending ??= import("@supabase/ssr").then(({ createBrowserClient }) => {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    return client;
  });
  return pending;
}

/**
 * Cheap "is there probably a session" test for first paint.
 *
 * Reads the `sb-*-auth-token` cookie directly instead of waking the auth
 * client. This is a hint, not proof — the cookie may be expired and it is
 * trivially forgeable — so it may only drive presentation (which nav links to
 * show). Anything that grants access must await `getSupabase()` and verify.
 */
export function hasAuthCookieHint(): boolean {
  if (typeof document === "undefined") return false;
  return /(^|;\s*)sb-[^=]*-auth-token(\.\d+)?=[^;]/.test(document.cookie);
}
