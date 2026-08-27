/**
 * Every alert MenoLisa sends, and the exact words it sends.
 *
 * An alert is one piece of copy delivered twice — once as a row in
 * `notifications` (the app's Alerts tab) and once as an Expo push. The two are
 * never written separately: `sendAlert()` takes a single `AlertCopy` and uses
 * it for both, so the banner she taps and the row she lands on always say the
 * same thing. That is the whole point of this file existing.
 *
 * Voice rules for anything added here:
 * - Sentence case. No exclamation marks. No emoji.
 * - Never imply she failed. "Your plan is ready", not "You haven't done it".
 * - Say the thing in the notification itself. A body that ends in "tap to see"
 *   promises a destination, and half of these have nowhere better to go.
 * - One line each. A push truncates at roughly 100 characters on iOS.
 *
 * **Three of these kinds are retired.** `daily_nudge`, `streak_risk` and
 * `week_start` are now local notifications scheduled by the phone
 * (`src/lib/reminders` in the mobile app), because a cron can only fire at one
 * UTC wall time for everybody and can never cancel itself when she ticks the
 * box. Their entries stay in `ALERTS` so the rows they already wrote still
 * render in the Alerts tab with the right icon; their copy builders are gone,
 * and nothing may send them from here again.
 */

export type AlertKind =
  | "daily_nudge"
  | "streak_risk"
  | "week_start"
  | "weekly_recap"
  | "renewal"
  | "access_ending"
  | "payment_failed";

/** The one copy an alert is made of. Both channels get exactly this. */
export type AlertCopy = { title: string; body: string };

/**
 * Where tapping the push lands. `Account` opens the billing page on the web,
 * because subscriptions are managed there; everything else is a mobile route.
 *
 * `PlanContinue` is the renewal screen inside the app. Renewal is the one money
 * alert with nothing for her to do — the card is charged automatically — so
 * sending her to a billing page would be answering a question she did not ask,
 * next to a Cancel button. The alerts that *do* need her to act on billing
 * (`access_ending`, `payment_failed`) still go to `Account`.
 */
export type AlertScreen = "DailyLoop" | "Notifications" | "Account" | "PlanContinue";

type AlertSpec = {
  /** `notifications.type` — the app picks its icon and fallback title from this. */
  type: string;
  screen: AlertScreen;
  /**
   * Deliver even when she has turned notifications off.
   *
   * Only money qualifies: a card that failed and an access date about to pass
   * are things she asked to be told about by paying. Everything else respects
   * the switch, and the crons filter on it before they ever build copy.
   */
  alwaysDeliver?: boolean;
};

export const ALERTS: Record<AlertKind, AlertSpec> = {
  // Retired — see the header. Kept so historic rows still render.
  daily_nudge: { type: "reminder", screen: "DailyLoop" },
  streak_risk: { type: "reminder", screen: "DailyLoop" },
  week_start: { type: "reminder", screen: "DailyLoop" },
  weekly_recap: { type: "weekly_insights", screen: "Notifications" },
  renewal: { type: "trial", screen: "PlanContinue", alwaysDeliver: true },
  access_ending: { type: "trial", screen: "Account", alwaysDeliver: true },
  payment_failed: { type: "trial", screen: "Account", alwaysDeliver: true },
};

/** Distinct `notifications.type` values the alert system produces. */
export const ALERT_NOTIFICATION_TYPES: string[] = [
  ...new Set(Object.values(ALERTS).map((spec) => spec.type)),
];

/**
 * True for a notification this system produced.
 *
 * The web dashboard uses it to stay out of the way: these are written for the
 * phone, and popping them as browser toasts as well means she is told twice.
 */
export function isMobileAlert(row: { metadata?: { alert_kind?: string } | null }): boolean {
  const kind = row.metadata?.alert_kind;
  return !!kind && kind in ALERTS;
}

// ---------------------------------------------------------------------------
// Copy
//
// Every builder returns the finished strings. Nothing downstream may edit them,
// interpolate into them, or send a push with different wording.
// ---------------------------------------------------------------------------

/** "21 August" — no year, because every alert here is about the next few days. */
export function formatAlertDate(date: Date): string {
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" });
}

// The copy for `daily_nudge`, `streak_risk` and `week_start` now lives in
// `src/lib/reminders/copy.ts` in the mobile app, word for word — she has been
// reading those sentences since she subscribed, and moving where they are
// generated was not a reason to change what they say.

/**
 * Sunday evening, on the seven days behind her.
 *
 * Carries the finding itself rather than a link — there is no insights screen
 * on either client to send her to.
 */
export function weeklyRecapCopy(input: {
  activeDays: number;
  symptomCount: number;
  topSymptom: string | null;
}): AlertCopy {
  const { activeDays, symptomCount, topSymptom } = input;

  if (activeDays === 0 && symptomCount === 0) {
    return {
      title: "A quiet week",
      body: "Nothing logged these seven days. Whenever you are ready, I am here.",
    };
  }

  const days = `${activeDays} ${activeDays === 1 ? "day" : "days"} on your plan`;

  if (symptomCount === 0) {
    return { title: "Your week with Lisa", body: `${days}, and no symptoms logged.` };
  }

  const symptoms = `${symptomCount} ${symptomCount === 1 ? "symptom" : "symptoms"} logged`;
  return {
    title: "Your week with Lisa",
    body: topSymptom
      ? `${days}, ${symptoms}. ${topSymptom} showed up most.`
      : `${days}, and ${symptoms}.`,
  };
}

/** Three days before the card is charged again. Reassurance, not a warning. */
/**
 * Three days out from the charge — the moment she decides whether to keep going.
 *
 * This used to read "Your plan renews on the 14th / Nothing to do". Accurate,
 * and completely forgettable: it treated the one point in eight weeks where she
 * actively chooses to continue as a receipt. It is now the nudge back into the
 * app, and it still names the date, because a motivating line that hides the
 * charge is a dark pattern rather than a nudge.
 */
export function renewalCopy(renewsOn: Date, firstName: string | null): AlertCopy {
  return {
    title: firstName
      ? `${firstName}, your 8 weeks are nearly up`
      : "Your 8 weeks are nearly up",
    body: `Your plan renews on ${formatAlertDate(renewsOn)} and carries straight on. This is not the week to stop.`,
  };
}

/** Three days before a cancelled subscription's paid period runs out. */
export function accessEndingCopy(endsOn: Date): AlertCopy {
  return {
    title: `Your access ends on ${formatAlertDate(endsOn)}`,
    body: "Your plan and everything you have logged stay saved if you come back.",
  };
}

/** The card was declined. She keeps access while Stripe retries. */
export function paymentFailedCopy(): AlertCopy {
  return {
    title: "We could not take your payment",
    body: "Update your card to keep your plan. It takes a minute.",
  };
}
