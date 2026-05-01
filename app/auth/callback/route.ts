import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const error = requestUrl.searchParams.get("error");
  const errorCode = requestUrl.searchParams.get("error_code");
  const errorDescription = requestUrl.searchParams.get("error_description");

  const baseUrl = `${requestUrl.protocol}//${requestUrl.host}`;

  // Handle Supabase error parameters
  if (error || errorCode) {
    console.error("Auth callback: Error detected", { error, errorCode, errorDescription });
    
    let errorMessage = "Authentication failed. Please try again.";
    let errorType = "auth_callback_error";
    
    if (errorCode === "otp_expired") {
      errorMessage = "The password reset link has expired. Please request a new one.";
      errorType = "otp_expired";
    } else if (errorCode === "access_denied") {
      errorMessage = errorDescription 
        ? decodeURIComponent(errorDescription)
        : "Access denied. Please try again.";
    } else if (errorDescription) {
      errorMessage = decodeURIComponent(errorDescription);
    }
    
    return NextResponse.redirect(
      `${baseUrl}/login?error=${errorType}&message=${encodeURIComponent(errorMessage)}`
    );
  }

  if (!code) {
    console.error("Auth callback: No code parameter found");
    return NextResponse.redirect(
      `${baseUrl}/login?error=auth_callback_error&message=${encodeURIComponent("No authentication code provided. Please try again.")}`
    );
  }

  // Create temporary response for cookie handling
  const tempResponse = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          const isHttps = requestUrl.protocol === "https:";
          const sameSiteValue = isHttps
            ? (options.sameSite as "none" | "lax" | "strict" | undefined) ?? "none"
            : (options.sameSite as "lax" | "strict" | "none" | undefined) ?? "lax";
          const secureValue = sameSiteValue === "none" ? true : (options.secure ?? isHttps);
          
          tempResponse.cookies.set({
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
          tempResponse.cookies.set({
            name,
            value: "",
            ...options,
            path: options.path || "/",
          });
        },
      },
    }
  );

  try {
    // Exchange code for session
    console.log("Auth callback: Exchanging code for session...");
    const { error: exchangeError, data } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error("Auth callback: Exchange error:", exchangeError);
      return NextResponse.redirect(
        `${baseUrl}/login?error=auth_callback_error&message=${encodeURIComponent(exchangeError.message || "Authentication failed. Please try again.")}`
      );
    }

    if (!data.session || !data.user) {
      console.error("Auth callback: No session or user created");
      return NextResponse.redirect(
        `${baseUrl}/login?error=auth_callback_error&message=${encodeURIComponent("Session creation failed. Please try again.")}`
      );
    }

    console.log("Auth callback: Session created successfully for user:", data.user.id);

    // Ensure user profile exists (create if not)
    const { getSupabaseAdmin } = await import("@/lib/supabaseAdmin");
    const adminSupabase = getSupabaseAdmin();
    
    const { data: existingProfile, error: profileCheckError } = await adminSupabase
      .from("user_profiles")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle();
    
    if (profileCheckError && profileCheckError.code !== "PGRST116") {
      console.error("Auth callback: Error checking profile:", profileCheckError);
    }

    if (!existingProfile) {
      console.log("Auth callback: Creating user profile...");
      const { error: createError } = await adminSupabase
        .from("user_profiles")
        .insert([{ user_id: data.user.id }]);
      
      if (createError) {
        console.error("Auth callback: Error creating profile:", createError);
        // Continue anyway - profile can be created later via intake API
      } else {
        console.log("Auth callback: Profile created successfully");
      }
    }

    // Redirect: use ?next= path if provided (e.g. mobile bridge), otherwise dashboard
    const nextPath = requestUrl.searchParams.get("next");
    const safeNext = nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//") ? nextPath : null;
    const redirectUrl = safeNext
      ? `${baseUrl}${safeNext}${safeNext.includes("?") ? "&" : "?"}t=${Date.now()}`
      : `${baseUrl}/dashboard?auth=success&t=${Date.now()}`;
    console.log("Auth callback: Redirecting to", safeNext || "dashboard");

    // Copy cookies from temp response to final response
    const isHttps = requestUrl.protocol === "https:";
    const cookiesToSet = tempResponse.cookies.getAll();
    const finalResponse = NextResponse.redirect(redirectUrl);
    
    cookiesToSet.forEach((cookie) => {
      const sameSiteValue = isHttps
        ? (cookie.sameSite as "lax" | "strict" | "none" | undefined) ?? ("none" as const)
        : (cookie.sameSite as "lax" | "strict" | "none" | undefined) ?? ("lax" as const);
      const secureValue = sameSiteValue === "none" ? true : (cookie.secure ?? isHttps);
      
      finalResponse.cookies.set(cookie.name, cookie.value, {
        path: cookie.path || "/",
        maxAge: cookie.maxAge,
        expires: cookie.expires,
        httpOnly: cookie.httpOnly ?? true,
        secure: secureValue,
        sameSite: sameSiteValue,
      });
    });
    
    return finalResponse;
  } catch (error) {
    console.error("Auth callback: Exception:", error);
    const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred. Please try again.";
    return NextResponse.redirect(
      `${baseUrl}/login?error=auth_callback_error&message=${encodeURIComponent(errorMessage)}`
    );
  }
}
