"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getRedirectBaseUrl } from "@/lib/constants";
import { AlertCircle, Loader2, ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), [email]);
  const canSubmit = emailValid && !loading;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    setErr(null);
    setLoading(true);

    try {
      const redirectTo = `${getRedirectBaseUrl()}/auth/callback?next=${encodeURIComponent("/reset-password")}`;
      const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
        redirectTo,
      });

      if (error) {
        setErr(error.message || "Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      setSent(true);
    } catch (e) {
      console.error("Forgot password error:", e);
      setErr("An unexpected error occurred. Please try again.");
    }
    setLoading(false);
  }

  if (sent) {
    return (
      <main className="relative overflow-hidden mx-auto max-w-md p-6 sm:p-8 min-h-screen flex flex-col justify-center">
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-40">
          <div className="absolute -top-24 -left-24 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
          <div className="absolute -bottom-24 -right-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        </div>
        <div className="rounded-xl border border-foreground/15 bg-background/80 p-6 text-center">
          <h1 className="text-2xl font-bold tracking-tight mb-2">Check your email</h1>
          <p className="text-muted-foreground mb-4">
            If an account exists for <strong className="text-foreground">{email}</strong>, we&apos;ve sent a link to reset your password.
          </p>
          <p className="text-sm text-muted-foreground mb-6">
            Click the link in that email to set a new password. The link will open in your browser. If you don&apos;t see it, check your spam folder.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-primary font-semibold underline-offset-4 hover:opacity-80"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative overflow-hidden mx-auto max-w-md p-6 sm:p-8 min-h-screen flex flex-col justify-center">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 opacity-40">
        <div className="absolute -top-24 -left-24 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="mb-8">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3 text-balance">
          Forgot password?
        </h1>
        <p className="text-lg text-muted-foreground">
          Enter your email and we&apos;ll send you a link to reset your password on our website.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="email" className="mb-2 block text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            className="w-full rounded-xl border border-foreground/15 bg-background px-4 py-3 ring-offset-background placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={email.length > 0 && !emailValid}
            required
          />
        </div>

        <button
          className="group w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-sm ring-1 ring-inset ring-primary/20 transition hover:brightness-95 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
          type="submit"
          disabled={!canSubmit}
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Sending…
            </>
          ) : (
            "Send reset link"
          )}
        </button>
      </form>

      {err && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p>{err}</p>
        </div>
      )}

      <p className="mt-6 text-md text-muted-foreground text-center">
        <Link href="/login" className="inline-flex items-center gap-2 text-primary font-semibold underline-offset-4 hover:opacity-80">
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
