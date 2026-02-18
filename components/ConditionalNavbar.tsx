"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Navbar from "./Navbar";

type ConditionalNavbarProps = {
  isAuthenticated: boolean;
};

export default function ConditionalNavbar({ isAuthenticated: initialIsAuthenticated }: ConditionalNavbarProps) {
  const pathname = usePathname();
  const isChatPage = pathname?.includes("/chat/lisa");
  // Start with server-side value - it's usually correct after redirect
  const [isAuthenticated, setIsAuthenticated] = useState(initialIsAuthenticated);

  // Check authentication state on client side - verify session is actually valid
  useEffect(() => {
    let mounted = true;

    // Check initial session - use getSession first (faster, uses cookies)
    const checkSession = async () => {
      try {
        // First check if session exists (faster, uses cookies directly)
        const { data: { session } } = await supabase.auth.getSession();
        
        if (mounted) {
          if (session) {
            // Session exists - verify user is valid
            const { data: { user }, error } = await supabase.auth.getUser();
            setIsAuthenticated(!error && !!user);
          } else {
            // No session - not authenticated
            setIsAuthenticated(false);
          }
        }
      } catch (error) {
        if (mounted) {
          setIsAuthenticated(false);
        }
      }
    };

    // Check immediately
    checkSession();

    // Listen for auth state changes - this will fire when session is established
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted) {
        // Update based on session and event
        if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
          // Session was established or refreshed - verify user
          supabase.auth.getUser().then(({ data: { user }, error }) => {
            if (mounted) {
              setIsAuthenticated(!error && !!user);
            }
          });
        } else if (event === "SIGNED_OUT") {
          setIsAuthenticated(false);
        } else if (session) {
          // Other events with session - verify user
          supabase.auth.getUser().then(({ data: { user }, error }) => {
            if (mounted) {
              setIsAuthenticated(!error && !!user);
            }
          });
        } else {
          setIsAuthenticated(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [initialIsAuthenticated]);

  useEffect(() => {
    const main = document.querySelector("main");
    if (main) {
      if (isChatPage) {
        main.classList.remove("pt-20");
      }
      // Removed automatic pt-20 addition - control padding via className in layout.tsx instead
    }
  }, [isChatPage]);

  if (isChatPage) {
    return null;
  }

  return (
    <header className="border-b border-white/10">
      <Navbar isAuthenticated={isAuthenticated} />
    </header>
  );
}

