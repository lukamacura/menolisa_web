"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function MobileBridgePage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const raw = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const token = raw ? decodeURIComponent(raw) : "";

    // Where the app asked to land. The app opens this bridge for two different
    // reasons — "look at my account" and "buy another 8 weeks" — and the second
    // one has no business landing on the account card with one more tap to the
    // price. Same-origin paths only: a bare `/`, never `//host`.
    const requestedNext = new URLSearchParams(window.location.search).get("next");
    const next =
      requestedNext && requestedNext.startsWith("/") && !requestedNext.startsWith("//")
        ? requestedNext
        : null;

    if (!token) {
      setError("Missing session link. Open Account from the MenoLisa app again.");
      return;
    }

    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);

    fetch("/api/auth/mobile-web-handoff/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { error?: string; redirect?: string };
        if (!res.ok) {
          setError(
            typeof data.error === "string"
              ? data.error
              : "Could not sign you in. Try logging in on the website."
          );
          return;
        }
        const dest =
          next ??
          (typeof data.redirect === "string" && data.redirect.startsWith("/")
            ? data.redirect
            : "/dashboard/account");
        router.replace(dest);
      })
      .catch(() => setError("Network error. Try again."));
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center text-[#1F2937]">
      {error ? (
        <>
          <p className="text-base">{error}</p>
          <a href="/login" className="text-sm text-[#ff8da1] underline">
            Go to login
          </a>
        </>
      ) : (
        <p className="text-base">Signing you in…</p>
      )}
    </div>
  );
}
