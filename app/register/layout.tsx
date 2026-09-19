/**
 * **`/register` is a static file. Keep it that way.**
 *
 * This layout used to carry `export const dynamic = "force-dynamic"`, because
 * `RegisterPageContent` called `useSearchParams()` for Stripe's
 * `?phase=download&session_id=…` return. A dynamic API leaves two options and
 * both are bad for paid traffic: bail out of prerendering and bake the
 * <Suspense> *spinner* into the HTML, or render on demand and pay a serverless
 * invocation — and, on a cold lambda, a cold start — in front of the first byte
 * of every ad click. This route took the second. It is invisible in local
 * testing (warm TTFB is ~3ms) and it is charged to exactly the visitor the page
 * exists for: a cold click from an in-app browser on mobile data.
 *
 * The page now reads the query string with `readQueryParam()` (plain
 * `window.location.search`), which is not a dynamic API, so `/register`
 * prerenders to static HTML with question 1 already in it and is served from
 * the CDN edge with no function in the path.
 *
 * Anything that reintroduces a dynamic API here — `useSearchParams`, `cookies()`,
 * `headers()`, a `force-dynamic` export, an uncached fetch in a server
 * component — puts the invocation back. Confirm with `npm run build`: the route
 * table must show `○ /register` (static), never `ƒ` (dynamic).
 */
export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
