/**
 * Forces the funnel to be server-rendered per request.
 *
 * `RegisterPageContent` calls `useSearchParams()` (for Stripe's
 * `?phase=download&session_id=…` return). Under static prerendering Next
 * cannot know those values, so it bails out of the enclosing <Suspense> and
 * bakes the *fallback* — the "Loading…" spinner — into the HTML, leaving the
 * whole funnel to render on the client. That trades a fast TTFB for a blank
 * first paint, which is the wrong way round for paid traffic: the start screen
 * is what the ad promised and it should be in the first byte.
 *
 * Rendering on demand keeps the start screen in the HTML. The cost is a
 * function invocation per ad click. To get both — static HTML *and* real
 * content — the `?phase=download` return has to stop being a query param on
 * this route (see the note in page.tsx); until then, content wins.
 */
export const dynamic = "force-dynamic";

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
