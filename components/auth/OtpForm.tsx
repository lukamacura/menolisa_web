"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { AlertCircle, ArrowRight, Loader2, Mail } from "lucide-react";

type Mode = "login" | "register";
type Variant = "default" | "gradient";

type OtpFormProps = {
  mode: Mode;
  onSuccess: (user: User) => void | Promise<void>;
  initialEmail?: string;
  variant?: Variant;
  submitLabel?: string;
};

const RESEND_COOLDOWN_SECONDS = 60;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GRADIENT_STYLE: React.CSSProperties = {
  background: "linear-gradient(135deg, #ff74b1 0%, #ffeb76 50%, #65dbff 100%)",
  boxShadow: "0 4px 15px rgba(255, 116, 177, 0.4)",
};

function PrimaryButton({
  variant,
  disabled,
  loading,
  type = "button",
  children,
  onClick,
}: {
  variant: Variant;
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit";
  children: React.ReactNode;
  onClick?: () => void;
}) {
  if (variant === "gradient") {
    return (
      <button
        type={type}
        onClick={onClick}
        disabled={disabled}
        className="w-full py-3 sm:py-4 font-bold text-foreground rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] hover:shadow-lg"
        style={GRADIENT_STYLE}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
        {children}
      </button>
    );
  }
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="group w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-sm ring-1 ring-inset ring-primary/20 transition hover:brightness-95 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
    >
      {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
      {children}
    </button>
  );
}

export default function OtpForm({
  mode,
  onSuccess,
  initialEmail = "",
  variant = "default",
  submitLabel,
}: OtpFormProps) {
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const emailValid = useMemo(() => EMAIL_REGEX.test(email.trim()), [email]);
  const codeJoined = code.join("");
  const codeValid = codeJoined.length === 6 && /^\d{6}$/.test(codeJoined);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") {
      inputsRef.current[0]?.focus();
    }
  }, [step]);

  async function sendCode(targetEmail: string, isResend = false) {
    setErr(null);
    setInfo(null);
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: targetEmail,
        options: {
          shouldCreateUser: mode === "register",
        },
      });
      if (error) {
        const msg = error.message || "";
        if (mode === "login" && /Signups not allowed|user not found|invalid/i.test(msg)) {
          setErr("No account found for this email. Please sign up first.");
        } else if (/rate limit|too many/i.test(msg)) {
          setErr("Too many requests. Please wait a moment and try again.");
        } else {
          setErr(msg || "Could not send code. Please try again.");
        }
        return false;
      }
      setCooldown(RESEND_COOLDOWN_SECONDS);
      if (isResend) setInfo("New code sent. Check your inbox.");
      return true;
    } catch {
      setErr("Network error. Please check your connection and try again.");
      return false;
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!emailValid || loading) return;
    const ok = await sendCode(email.toLowerCase().trim(), false);
    if (ok) setStep("code");
  }

  async function handleVerify() {
    if (!codeValid || loading) return;
    setErr(null);
    setInfo(null);
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.toLowerCase().trim(),
        token: codeJoined,
        type: "email",
      });
      if (error || !data.user) {
        if (error && /expired|invalid/i.test(error.message)) {
          setErr("That code is invalid or expired. Request a new one.");
        } else {
          setErr(error?.message || "Could not verify code. Please try again.");
        }
        setCode(["", "", "", "", "", ""]);
        inputsRef.current[0]?.focus();
        return;
      }
      await onSuccess(data.user);
    } catch {
      setErr("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function setDigit(idx: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    setCode((prev) => {
      const next = [...prev];
      next[idx] = digit;
      return next;
    });
    if (digit && idx < 5) {
      inputsRef.current[idx + 1]?.focus();
    }
  }

  function handleKeyDown(idx: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && idx > 0) {
      inputsRef.current[idx - 1]?.focus();
    }
    if (e.key === "ArrowRight" && idx < 5) {
      inputsRef.current[idx + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    e.preventDefault();
    const next = ["", "", "", "", "", ""];
    for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
    setCode(next);
    const focusIdx = Math.min(pasted.length, 5);
    inputsRef.current[focusIdx]?.focus();
  }

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (codeValid && !loading) {
      handleVerify();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeJoined]);

  if (step === "email") {
    return (
      <form onSubmit={handleEmailSubmit} className="space-y-4" noValidate>
        <div>
          <label htmlFor="otp-email" className="mb-2 block text-sm font-medium text-foreground">
            Email
          </label>
          <input
            id="otp-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoFocus
            required
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-foreground/15 bg-background px-4 py-3 placeholder:text-muted-foreground/70 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
          />
        </div>

        <PrimaryButton
          type="submit"
          variant={variant}
          disabled={!emailValid || loading}
          loading={loading}
        >
          {loading
            ? "Sending code…"
            : submitLabel || (mode === "register" ? "Send my code" : "Send sign-in code")}
        </PrimaryButton>

        {err && (
          <div
            role="alert"
            className="rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error flex items-start gap-3"
          >
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p>{err}</p>
          </div>
        )}

        <p className="text-xs text-muted-foreground text-center">
          We&apos;ll email you a 6-digit code. No password needed.
        </p>
      </form>
    );
  }

  return (
    <div className="space-y-5">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-3">
          <Mail className="w-6 h-6 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground mb-1">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We sent a 6-digit code to <strong className="text-foreground">{email}</strong>
        </p>
      </div>

      <div className="flex justify-center gap-2" onPaste={handlePaste}>
        {code.map((digit, idx) => (
          <input
            key={idx}
            ref={(el) => {
              inputsRef.current[idx] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            value={digit}
            onChange={(e) => setDigit(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            disabled={loading}
            aria-label={`Digit ${idx + 1}`}
            className="w-11 h-14 sm:w-12 sm:h-14 rounded-xl border border-foreground/15 bg-background text-center text-2xl font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all disabled:opacity-60"
          />
        ))}
      </div>

      <PrimaryButton
        variant={variant}
        disabled={!codeValid || loading}
        loading={loading}
        onClick={handleVerify}
      >
        {loading ? "Verifying…" : "Verify code"}
        {!loading && <ArrowRight className="w-5 h-5" />}
      </PrimaryButton>

      {err && (
        <div
          role="alert"
          className="rounded-xl border border-error/30 bg-error/10 p-4 text-sm text-error flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          <p>{err}</p>
        </div>
      )}

      {info && !err && (
        <p role="status" className="text-sm text-muted-foreground text-center">
          {info}
        </p>
      )}

      <div className="flex flex-col items-center gap-2 text-sm">
        <button
          type="button"
          onClick={() => sendCode(email.toLowerCase().trim(), true)}
          disabled={cooldown > 0 || loading}
          className="text-primary font-medium hover:underline underline-offset-4 disabled:opacity-50 disabled:no-underline disabled:cursor-not-allowed"
        >
          {cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}
        </button>
        <button
          type="button"
          onClick={() => {
            setStep("email");
            setCode(["", "", "", "", "", ""]);
            setErr(null);
            setInfo(null);
          }}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          Use a different email
        </button>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Code expires in 60 minutes. Check spam if you don&apos;t see it.
      </p>
    </div>
  );
}
