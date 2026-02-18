import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
  "Access-Control-Max-Age": "86400",
};

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const { pathname } = req.nextUrl;

  // CORS preflight: must return 200 with CORS headers, no redirect (browser blocks redirect on preflight)
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 200, headers: CORS_HEADERS });
  }

  // API routes called with Bearer token (e.g. mobile app): skip cookie check; the route will validate the token
  if (pathname.startsWith("/api/") && req.headers.get("Authorization")?.startsWith("Bearer ")) {
    const response = NextResponse.next();
    Object.entries(CORS_HEADERS).forEach(([key, value]) => {
      response.headers.set(key, value);
    });
    return response;
  }

  // ✅ define protected areas
  const isProtected =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/chat/lisa") ||
    pathname.startsWith("/api/vectorshift") ||
    pathname.startsWith("/api/langchain-rag") ||
    pathname.startsWith("/api/symptoms");

  // allow everything else (including auth callback)
  if (!isProtected) return res;
  
  // Allow auth callback path - session will be restored client-side
  if (pathname.startsWith("/auth/callback")) {
    return res;
  }

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

  // Only allow if we have a valid user (no error and user exists)
  if (authError || !user) {
    // No valid session - redirect to login
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(url);
  }

  return res;
}

// ✅ run middleware only where needed
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/chat/lisa/:path*",
    "/api/vectorshift",
    "/api/langchain-rag",
    "/api/symptoms",
  ],
};
