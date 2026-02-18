import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

/**
 * Get authenticated user from request.
 * Supports both:
 * 1. Cookie-based auth (web app)
 * 2. Authorization: Bearer <token> (mobile app)
 */
export async function getAuthenticatedUser(req: NextRequest): Promise<User | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // 1. Try cookie-based session (web)
  const supabaseCookie = createServerClient(url, anonKey, {
    cookies: {
      get(name: string) {
        return req.cookies.get(name)?.value;
      },
      set() {},
      remove() {},
    },
  });

  const {
    data: { user: cookieUser },
    error: cookieError,
  } = await supabaseCookie.auth.getUser();

  if (!cookieError && cookieUser) {
    return cookieUser;
  }

  // 2. Try Bearer token (mobile)
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return null;
  }

  const supabaseBearer = createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const {
    data: { user: bearerUser },
    error: bearerError,
  } = await supabaseBearer.auth.getUser();

  if (bearerError || !bearerUser) {
    return null;
  }

  return bearerUser;
}
