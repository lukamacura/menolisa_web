import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { z } from "zod";
import { verifyMobileWebHandoffToken } from "@/lib/mobileWebHandoffJwt";

const bodySchema = z.object({
  token: z.string().min(1),
});

function attachSupabaseCookiesToResponse(
  request: NextRequest,
  response: NextResponse
): ReturnType<typeof createServerClient> {
  const requestUrl = new URL(request.url);
  const isHttps = requestUrl.protocol === "https:";

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          const sameSiteValue = isHttps
            ? (options.sameSite as "none" | "lax" | "strict" | undefined) ?? "none"
            : (options.sameSite as "lax" | "strict" | "none" | undefined) ?? "lax";
          const secureValue = sameSiteValue === "none" ? true : (options.secure ?? isHttps);
          response.cookies.set({
            name,
            value,
            ...options,
            sameSite: sameSiteValue,
            secure: secureValue,
            httpOnly: options.httpOnly ?? true,
            path: options.path || "/",
          });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value: "",
            ...options,
            path: options.path || "/",
          });
        },
      },
    }
  );
}

/**
 * Browser: completes mobile web handoff — sets Supabase cookie session, same pattern as /auth/callback.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.MOBILE_WEB_HANDOFF_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: "Handoff not configured" }, { status: 503 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    const json = await req.json();
    body = bodySchema.parse(json);
  } catch {
    return NextResponse.json({ error: "token is required" }, { status: 400 });
  }

  const payload = verifyMobileWebHandoffToken(body.token, secret);
  if (!payload) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabaseAnon = createClient(url, anonKey);

  const { data: refreshed, error: refreshError } = await supabaseAnon.auth.refreshSession({
    refresh_token: payload.rt,
  });

  if (
    refreshError ||
    !refreshed.session?.access_token ||
    !refreshed.session?.refresh_token ||
    !refreshed.user ||
    refreshed.user.id !== payload.uid
  ) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
  }

  const response = NextResponse.json({
    ok: true as const,
    redirect: "/dashboard/account",
  });

  const supabase = attachSupabaseCookiesToResponse(req, response);
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: refreshed.session.access_token,
    refresh_token: refreshed.session.refresh_token,
  });

  if (sessionError) {
    console.error("mobile-web-handoff complete: setSession", sessionError);
    return NextResponse.json({ error: "Could not create browser session" }, { status: 500 });
  }

  return response;
}
