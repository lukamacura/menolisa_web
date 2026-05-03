import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { evaluateTrialStatus, type TrialRow } from "@/lib/checkTrialStatus";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

// Single source of truth for protected routes (also used by `config.matcher` below).
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/chat/lisa",
  "/api/vectorshift",
  "/api/langchain-rag",
  "/api/symptoms",
] as const;

function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
}

function applyCors(response: NextResponse) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  return response;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // CORS preflight: must return 200 with CORS headers, no redirect.
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
  }

  // API calls with Bearer token (mobile app): skip cookie check, route validates token.
  // CORS headers only apply on this branch — same-origin cookie requests don't need them.
  if (pathname.startsWith("/api/") && req.headers.get("Authorization")?.startsWith("Bearer ")) {
    return applyCors(NextResponse.next());
  }

  if (!isProtectedPath(pathname)) {
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return req.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          res.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          res.cookies.set({ name, value: "", ...options });
        },
      },
    }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(url);
  }

  // Payment gate: only enforce on UI routes (cookie-auth API routes do their own check).
  const needsPaymentGate =
    pathname.startsWith("/dashboard") || pathname.startsWith("/chat/lisa");

  if (needsPaymentGate) {
    const { data: trialRow } = await supabase
      .from("user_trials")
      .select("trial_start, trial_end, trial_days, account_status, subscription_ends_at")
      .eq("user_id", user.id)
      .maybeSingle();

    const decision = evaluateTrialStatus((trialRow as TrialRow | null) ?? null);

    if (decision !== "allow") {
      const url = req.nextUrl.clone();
      url.pathname = "/register";
      url.search = "";
      url.searchParams.set("phase", decision === "no-onboarding" ? "quiz" : "paywall");
      return NextResponse.redirect(url);
    }
  }

  return res;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/chat/lisa/:path*",
    "/api/vectorshift",
    "/api/langchain-rag",
    "/api/symptoms",
  ],
};
