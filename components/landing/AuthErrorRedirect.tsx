"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Supabase sends some auth failures (an expired or denied link) back to the
 * site root with `?error=` / `?error_code=`. Forward them to /login, which is
 * the only screen that can do anything about them. Renders nothing; mount it
 * inside a <Suspense> because it reads search params.
 */
export default function AuthErrorRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get("error");
    const errorCode = searchParams.get("error_code");
    const errorDescription = searchParams.get("error_description");
    if (!error && !errorCode) return;

    let message = "Authentication failed. Please try again.";
    if (errorCode === "otp_expired") {
      message = "That sign-in link has expired. Please request a new code.";
    } else if (errorDescription) {
      message = decodeURIComponent(errorDescription);
    } else if (errorCode === "access_denied") {
      message = "Access denied. Please try again.";
    }
    router.replace(`/login?error=auth_callback_error&message=${encodeURIComponent(message)}`);
  }, [searchParams, router]);

  return null;
}
