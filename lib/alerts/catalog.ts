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
 */
export type AlertScreen = "DailyLoop" | "Notifications" | "Account";

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
  daily_nudge: { type: "reminder", screen: "DailyLoop" },
  streak_risk: { type: "reminder", screen: "DailyLoop" },
  week_start: { type: "reminder", screen: "DailyLoop" },
  weekly_recap: { type: "weekly_insights", screen: "Notifications" },
  renewal: { type: "trial", screen: "Account", alwaysDeliver: true },
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

/** Morning of a day she has not touched yet. */
export function dailyNudgeCopy(firstName: string | null): AlertCopy {
  return {
    title: "Today's plan is ready",
    body: firstName
      ? `${firstName}, your movement, nutrition and one calm moment are waiting.`
      : "Your movement, nutrition and one calm moment are waiting.",
  };
}

/**
 * Evening, when a run of three or more days is about to break.
 *
 * Deliberately not sent at one or two days: a "streak" that short is not yet
 * something she would be sad to lose, and naming it that early teaches her the
 * word means nothing.
 */
export function streakRiskCopy(streak: number): AlertCopy {
  return {
    title: `Your ${streak}-day streak is still going`,
    body: "One tick before bed keeps it alive.",
  };
}

/** Evening before the plan rolls into a new week. */
export function weekStartCopy(week: number, weekTitle: string | null): AlertCopy {
  return {
    title: `Week ${week} starts tomorrow`,
    body: weekTitle
      ? `${weekTitle}. Your plan updates in the morning.`
      : "Your plan updates in the morning.",
  };
}

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
export function renewalCopy(renewsOn: Date): AlertCopy {
  return {
    title: `Your plan renews on ${formatAlertDate(renewsOn)}`,
    body: "Nothing to do — Lisa keeps going from here.",
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
