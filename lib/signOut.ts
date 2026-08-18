import { getSupabase } from "@/lib/supabaseClient";

/**
 * Sign out of the web app, then navigate to `destination`.
 *
 * Two things here are load-bearing:
 *
 * - **Await the sign-out before navigating.** `signOut()` clears the
 *   `sb-*-auth-token` cookies only *after* its POST to `/auth/v1/logout`
 *   resolves. Kicking off a navigation first tears the document down
 *   mid-flight, so the cookies can survive the "log out" — `proxy.ts` still
 *   sees a valid session and `/dashboard` stays reachable by back-button.
 *   Whether it happened depended on network latency, which is exactly the kind
 *   of bug that looks intermittent.
 * - **`scope: "local"`.** The default is `"global"`, which revokes every
 *   refresh token the user holds — including the Expo app on her phone, where
 *   the actual product lives. Signing out of billing on the web must not sign
 *   her out of the app.
 *
 * A hard navigation rather than `router.push`, so the whole client tree is
 * rebuilt with the cookies actually gone. A soft push leaves every mounted
 * component holding state it derived while signed in.
 */
export async function signOutAndRedirect(destination = "/login") {
  try {
    const supabase = await getSupabase();
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Revoking failed (offline, Supabase down). Navigate anyway rather than
    // stranding her on a dead button — the session may outlive this, but the
    // alternative is a control that does nothing.
  }
  window.location.href = destination;
}
