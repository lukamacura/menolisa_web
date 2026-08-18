/**
 * `LoginForm` reads `?redirectedFrom`, `?error`, `?message` and `?email` with
 * `useSearchParams()`. Statically prerendered, that bails out of the page's
 * <Suspense> and ships the spinner fallback as the HTML, so the sign-in form
 * only exists after hydration.
 *
 * This must live in a layout: `page.tsx` is a `"use client"` module and route
 * segment config is ignored there. It had `export const dynamic` for a while
 * and it did nothing — the root layout's `cookies()` call was making every
 * route dynamic anyway, which hid it.
 */
export const dynamic = "force-dynamic";

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
