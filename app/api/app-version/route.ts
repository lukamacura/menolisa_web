import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/app-version
 * What the mobile app must be running, and what it could be running.
 *
 * ## Why this is a route and not a constant in the app
 *
 * A build that has already shipped cannot know a newer one exists. Whatever the
 * store installed is the whole world as far as that binary is concerned, so the
 * only way to tell a two-versions-old install that it is two versions old is to
 * have it ask. Hence one public, unauthenticated GET: it has to answer a client
 * that may be signed out, may be expired, and may be running code we no longer
 * support — none of which is a reason to withhold "please update".
 *
 * Nothing here is a secret. It is two version strings and two store links that
 * are already public listings.
 *
 * ## The two numbers
 *
 * - `minimum` — below this the app blocks. She cannot get past the update
 *   screen. Reserve it for builds that are genuinely broken against the current
 *   API: a contract change that would silently corrupt her data, a security
 *   fix. Locking a paying subscriber out of her plan is a real cost.
 * - `latest` — below this the app nudges: a dismissible card on the daily loop,
 *   which stays dismissed until a newer `latest` appears.
 *
 * Both default to the constants below and are overridden by env vars, so a
 * release can be enforced by changing configuration and redeploying rather than
 * editing this file. Setting neither leaves the feature inert.
 */

/** App Store id — matches `submit.production.ios.ascAppId` in the app's eas.json. */
const IOS_APP_ID = "6761130271";
/** Play package — matches `android.package` in the app's app.config.js. */
const ANDROID_PACKAGE = "com.menolisa.app";

/**
 * Fail open. `0.0.0` is below every version that has ever shipped, so an
 * unconfigured deploy blocks nobody — the failure we can least afford here is
 * locking the whole install base out over a typo.
 */
const DEFAULT_MINIMUM = "0.0.0";
/** The newest build in both stores. Bump on release, or set MOBILE_LATEST_VERSION. */
const DEFAULT_LATEST = "1.3.1";

/** Dotted numeric versions only — anything else is treated as unset. */
const VERSION_PATTERN = /^\d{1,5}(\.\d{1,5}){0,2}$/;

function readVersion(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value || !VERSION_PATTERN.test(value)) return null;
  return value;
}

/** Numeric segment compare. Missing segments count as 0, so "1.4" === "1.4.0". */
function compareVersions(a: string, b: string): number {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

export async function GET() {
  const minimum = readVersion(process.env.MOBILE_MIN_VERSION) ?? DEFAULT_MINIMUM;
  const configuredLatest = readVersion(process.env.MOBILE_LATEST_VERSION) ?? DEFAULT_LATEST;

  /**
   * `latest` can never be behind `minimum`. If it were, the app would block her
   * and then send her to a store listing that has nothing newer to install —
   * a dead end with no way out of it. Raising `latest` rather than lowering
   * `minimum` keeps the block working when only MOBILE_MIN_VERSION was set.
   */
  const latest =
    compareVersions(configuredLatest, minimum) < 0 ? minimum : configuredLatest;

  return NextResponse.json(
    {
      minimum,
      latest,
      ios_url: `https://apps.apple.com/app/menolisa/id${IOS_APP_ID}`,
      android_url: `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`,
    },
    {
      // Cheap enough to serve, but the app checks on every cold start and every
      // return to the foreground. Five minutes is short enough that flipping a
      // block reaches everyone quickly and long enough that it is not a hot path.
      headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
    }
  );
}
