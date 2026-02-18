"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { Eye, EyeOff, AlertCircle, Loader2, CheckCircle } from "lucide-react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  const passwordValid = useMemo(() => password.length >= 8, [password]);
  const match = useMemo(() => password === confirm && confirm.length > 0, [password, confirm]);
  const canSubmit = passwordValid && match && !loading;

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setCheckingSession(false);
      if (!session) {
        router.replace("/login?error=session_expired&message=" + encodeURIComponent("Please request a new password reset link."));
      }
    });
  }, [router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;

    setErr(null);
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        setErr(error.message || "Failed to update password. Please try again.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      await supabase.auth.signOut();
      setTimeout(() => {
        router.push("/login?message=" + encodeURIComponent("Password updated. You can sign in with your new password."));
      }, 1500);
    } catch (e) {
      console.error("Reset password error:", e);
      setErr("An unexpected error occurred. Please try again.");
      setLoading(false);
    }
  }

  if (checkingSession) {
    return (
      <main className="relative mx-auto max-w-md p-6 sm:p-8 min-h-screen flex flex-col justify-center">
        <div className="flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
        <p className="text-center text-muted-foreground mt-4">Loading…</p>
      </main>
    );
  }

  if (success) {
    return (
      <main className="relative overflow-hidden mx-auto max-w-md p-6 sm:p-8 min-h-screen flex flex-col justify-center">
        <div className="rounded-xl border border-foreground/15 bg-background/80 p-6 text-center">
          <CheckCircle className="w-12 h-12 text-green-600 dark:text-green-400 mx-auto mb-4" />
          <h1 className="text-2xl font-bold tracking-tight mb-2">Password updated</h1>
          <p className="text-muted-foreground">Redirecting you to sign in…</p>
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
          Set new password
        </h1>
        <p className="text-lg text-muted-foreground">
          Enter your new password below. Use at least 8 characters.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="password" className="mb-2 block text-sm font-medium text-foreground">
            New password
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              autoComplete="new-password"
              className="w-full rounded-xl border border-foreground/15 bg-background px-4 py-3 pr-12 ring-offset-background placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
              type={showPassword ? "text" : "password"}
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={password.length > 0 && !passwordValid}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          {password.length > 0 && password.length < 8 && (
            <p className="text-xs text-muted-foreground mt-1">Password must be at least 8 characters</p>
          )}
        </div>

        <div>
          <label htmlFor="confirm" className="mb-2 block text-sm font-medium text-foreground">
            Confirm password
          </label>
          <input
            id="confirm"
            name="confirm"
            autoComplete="new-password"
            className="w-full rounded-xl border border-foreground/15 bg-background px-4 py-3 ring-offset-background placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
            type="password"
            placeholder="Confirm your new password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            aria-invalid={confirm.length > 0 && !match}
          />
          {confirm.length > 0 && !match && (
            <p className="text-xs text-destructive mt-1">Passwords do not match</p>
          )}
        </div>

        <button
          className="group w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-sm ring-1 ring-inset ring-primary/20 transition hover:brightness-95 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
          type="submit"
          disabled={!canSubmit}
        >
          {loading ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Updating…
            </>
          ) : (
            "Update password"
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
        <Link href="/login" className="text-primary font-semibold underline-offset-4 hover:opacity-80">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
