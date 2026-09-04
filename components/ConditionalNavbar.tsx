"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase, hasAuthCookieHint } from "@/lib/supabaseClient";
import Navbar from "./Navbar";

export default function ConditionalNavbar() {
  const pathname = usePathname();
  // Paywall content starts right at the top of the viewport (no navbar-sized
  // top offset reserved for it) - the fixed navbar sat over the back
  // button/social-proof/headline instead of above them.
  const isRegisterPage = pathname?.startsWith("/register");
  const isPaywallPage = pathname?.startsWith("/paywall");
  // /admin is the sales desk — a password-gated single screen with its own
  // masthead. The marketing navbar sits above it doing nothing but taking
  // vertical space and offering a sign-in link the operator doesn't want.
  const isAdminPage = pathname?.startsWith("/admin");
  const hidden = isRegisterPage || isPaywallPage || isAdminPage;

  // Starts false so the prerendered HTML and the first client render agree.
  // The cookie hint below corrects it in the first effect - synchronously, off
  // document.cookie, with no import and no network - so a logged-in visitor
  // sees the signed-in navbar essentially immediately. The authoritative check
  // follows and can still overturn it.
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Nothing renders on the funnel routes, so don't wake the auth client
    // there: /register is the ad landing page and its job is to hydrate the
    // quiz, not to find out who she is. The funnel does its own session check.
    if (hidden) return;

    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    (async () => {
      // Cheap presentational guess first (see hasAuthCookieHint). This runs in
      // the synchronous prefix of the async function - same tick as the effect
      // body, just not lint-flagged as a cascading synchronous setState.
      if (hasAuthCookieHint()) setIsAuthenticated(true);

      const supabase = await getSupabase();
      if (!mounted) return;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!mounted) return;

      if (session) {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();
        if (mounted) setIsAuthenticated(!error && !!user);
      } else {
        setIsAuthenticated(false);
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (!mounted) return;
        if (event === "SIGNED_OUT" || !nextSession) {
          setIsAuthenticated(false);
          return;
        }
        supabase.auth.getUser().then(({ data: { user }, error }) => {
          if (mounted) setIsAuthenticated(!error && !!user);
        });
      });

      unsubscribe = () => subscription.unsubscribe();
      // The client may have resolved after unmount; tear down immediately.
      if (!mounted) unsubscribe();
    })();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [hidden]);

  if (hidden) {
    return null;
  }

  return (
    <header className="border-b border-white/10">
      <Navbar isAuthenticated={isAuthenticated} />
    </header>
  );
}
