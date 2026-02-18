import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export const runtime = "nodejs";

/**
 * Server-side token verification endpoint
 * Handles Supabase's token_hash directly - NO PKCE REQUIRED!
 * Works across different browsers (solves Samsung Internet / Chrome issue)
 * 
 * Email template should use:
 * {{ .SiteURL }}/auth/verify?token_hash={{ .TokenHash }}&type=magiclink
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type") || "magiclink";
  const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;
  const isHttps = requestUrl.protocol === "https:";

  // Helper to create error redirect
  const errorRedirect = (error: string, message: string) => {
    return NextResponse.redirect(
      `${baseUrl}/login?error=${error}&message=${encodeURIComponent(message)}`
    );
  };

  // Check for token_hash (from Supabase email template)
  if (!tokenHash) {
    console.error("Verify: No token_hash provided");
    return errorRedirect(
      "invalid_token",
      "No verification token provided. Please request a new magic link."
    );
  }

  console.log("Verify: Processing token_hash verification...");

  try {
    // Create server client to set cookies
    const tempResponse = NextResponse.next();

    const supabaseServer = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value;
          },
          set(name: string, value: string, options: CookieOptions) {
            tempResponse.cookies.set({
              name,
              value,
              ...options,
              sameSite: "lax",
              secure: isHttps,
              httpOnly: options.httpOnly ?? true,
              path: options.path || "/",
            });
          },
          remove(name: string, options: CookieOptions) {
            tempResponse.cookies.set({
              name,
              value: "",
              ...options,
              path: options.path || "/",
              maxAge: 0,
            });
          },
        },
      }
    );

    // Verify the token_hash directly - NO PKCE REQUIRED!
    // This is the magic - verifyOtp with token_hash works without code_verifier
    console.log("Verify: Verifying token_hash...");
    const { data: verifyData, error: verifyError } = await supabaseServer.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as "magiclink" | "email",
    });

    if (verifyError) {
      console.error("Verify: Token verification error:", verifyError);
      
      // Handle specific error cases
      if (verifyError.message?.includes("expired")) {
        return errorRedirect(
          "otp_expired",
          "This link has expired. Please request a new magic link."
        );
      }
      if (verifyError.message?.includes("invalid") || verifyError.message?.includes("Token")) {
        return errorRedirect(
          "invalid_token",
          "This link is invalid or has already been used. Please request a new magic link."
        );
      }
      
      return errorRedirect(
        "auth_error",
        verifyError.message || "Authentication failed. Please try again."
      );
    }

    if (!verifyData.session || !verifyData.user) {
      console.error("Verify: No session created");
      return errorRedirect(
        "session_error",
        "Failed to create session. Please try again."
      );
    }

    console.log("Verify: Session created for user:", verifyData.user.id);

    // Get admin client for profile/trial management
    const supabaseAdmin = getSupabaseAdmin();

    // Ensure user profile exists
    const { data: existingProfile } = await supabaseAdmin
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", verifyData.user.id)
      .maybeSingle();

    if (!existingProfile) {
      console.log("Verify: Creating user profile...");
      const { error: profileError } = await supabaseAdmin
        .from("user_profiles")
        .insert([{ user_id: verifyData.user.id }]);

      if (profileError) {
        console.error("Verify: Profile creation error:", profileError);
        // Continue anyway - profile can be created later
      }
    }

    // Ensure user_trials entry exists
    const { data: existingTrial } = await supabaseAdmin
      .from("user_trials")
      .select("user_id")
      .eq("user_id", verifyData.user.id)
      .maybeSingle();

    if (!existingTrial) {
      console.log("Verify: Creating user trial...");
      const nowIso = new Date().toISOString();
      await supabaseAdmin.from("user_trials").insert({
        user_id: verifyData.user.id,
        trial_start: nowIso,
        trial_days: 3,
        account_status: "trial",
      });
    }

    // Redirect to dashboard with session cookies
    const finalRedirectUrl = `${baseUrl}/dashboard?auth=success&t=${Date.now()}`;
    console.log("Verify: Redirecting to:", finalRedirectUrl);

    const finalResponse = NextResponse.redirect(finalRedirectUrl);

    // Copy cookies from temp response
    tempResponse.cookies.getAll().forEach((cookie) => {
      finalResponse.cookies.set(cookie.name, cookie.value, {
        path: cookie.path || "/",
        maxAge: cookie.maxAge,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly ?? true,
        secure: isHttps,
        sameSite: "lax",
      });
    });

    return finalResponse;
  } catch (error) {
    console.error("Verify: Unexpected error:", error);
    return errorRedirect(
      "unexpected_error",
      "An unexpected error occurred. Please try again."
    );
  }
}
