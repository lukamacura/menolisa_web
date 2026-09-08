"use client";

import { useState } from "react";
import { Check, Loader2, Mail } from "lucide-react";

/**
 * The optional email field on the results screen (2026-09-08).
 *
 * "Save your results and plan." It is optional and it is not the login: the
 * address she types at Stripe is what her account is bound to
 * (`resolveCheckoutAccount`), and this one lands in `user_profiles.email`
 * only — see `POST /api/auth/save-email`. Placed on results rather than on
 * the name step because results has more traffic than the paywall and sits
 * after the payoff rather than between her and it.
 */
export function ResultsEmailCapture({ className = "" }: { className?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const submit = async () => {
    const value = email.trim();
    if (!value || state === "saving") return;
    setState("saving");
    setMessage(null);
    try {
      const res = await fetch("/api/auth/save-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMessage(typeof data.error === "string" ? data.error : "Couldn't save that. Please try again.");
        return;
      }
      setState("saved");
    } catch {
      setState("error");
      setMessage("Network error. Please try again.");
    }
  };

  if (state === "saved") {
    return (
      <div className={`rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 ${className}`}>
        <span className="inline-flex items-center gap-2 font-semibold">
          <Check className="h-4 w-4" /> Saved. Your results and plan are yours to come back to.
        </span>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-[#E8DDD9] bg-white px-4 py-3.5 ${className}`}>
      <p className="text-sm font-bold text-[#3D3D3D] leading-tight">Save your results and plan.</p>
      <p className="mt-0.5 text-xs text-[#7A7A7A]">Optional. No newsletter, no password.</p>
      <form
        className="mt-2.5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="relative min-w-0 flex-1">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9A9A]" />
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (state === "error") setState("idle");
            }}
            className="w-full rounded-xl border-2 border-foreground/15 bg-background py-2.5 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <button
          type="submit"
          disabled={state === "saving" || !email.trim()}
          className="shrink-0 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {state === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </button>
      </form>
      {message && <p className="mt-1.5 text-xs text-red-600">{message}</p>}
    </div>
  );
}
