/**
 * Email sequence templates (Segment 2 & 3).
 * Source: EMAIL_SEQUENCES_SEGMENT_2_AND_3.md (marketing-expert).
 * Placeholders: {{name}}, {{top_problems}}, {{subscription_ends_at}}
 */

const DASHBOARD_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://menolisa.com";

export type StepId =
  | "3-2"
  | "3-3"
  | "3-4"
  | "3-5";

export const EMAIL_SEQUENCE_STEPS: StepId[] = [
  "3-2",
  "3-3",
  "3-4",
  "3-5",
];

export interface EmailTemplate {
  subject: string;
  html: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Replace placeholders in template with recipient data.
 */
export function renderTemplate(
  template: EmailTemplate,
  data: {
    name: string | null;
    top_problems: string[] | null;
    subscription_ends_at: string | null;
  }
): EmailTemplate {
  const name = data.name?.trim() || "there";
  const topProblems = data.top_problems?.length
    ? data.top_problems.slice(0, 2).join(" and ")
    : "what you shared";
  const renewalDate = data.subscription_ends_at
    ? new Date(data.subscription_ends_at).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const replace = (s: string) =>
    s
      .replace(/\{\{name\}\}/g, escapeHtml(name))
      .replace(/\{\{top_problems\}\}/g, escapeHtml(topProblems))
      .replace(/\{\{subscription_ends_at\}\}/g, escapeHtml(renewalDate));

  return {
    subject: replace(template.subject),
    html: replace(template.html),
  };
}

/**
 * Templates per step. Body is minimal HTML for readability.
 */
export const EMAIL_SEQUENCE_TEMPLATES: Record<StepId, EmailTemplate> = {
  "3-2": {
    subject: "3 ways to get more from Lisa",
    html: `<p>{{name}}, now that you're a few days in, here are three things that make the biggest difference:</p>
<ol>
  <li>Log when something shifts, even briefly. ✏️</li>
  <li>Check "What Lisa Noticed" regularly. 👀</li>
  <li>Ask Lisa to build a summary before a doctor visit and bring it with you. 📋</li>
</ol>
<p>The more you log, the more she spots. Things like triggers and timing that are easy to miss on your own. 🔍</p>
<p><a href="${DASHBOARD_URL}">Open MenoLisa</a></p>
<p>With love, the MenoLisa team 💕</p>`,
  },
  "3-3": {
    subject: "Give a friend 3 days with Lisa and get 50% off your next month 🎁",
    html: `<p>{{name}}, if you know someone who's going through menopause and could use a companion who actually gets it, share Lisa. They get a 3-day free trial. You get 50% off your next month when they sign up with your link. 🎁</p>
<p>So many women feel alone in this. You're not. And neither does she have to be. 💛</p>
<p>Send them your link from the app (Account &gt; Invite friends). When they start their trial, you'll get your discount automatically.</p>
<p><a href="${DASHBOARD_URL}/dashboard/account">Get your invite link</a></p>
<p>With love, the MenoLisa team 💕</p>`,
  },
  "3-4": {
    subject: "{{name}}, how's it going with Lisa?",
    html: `<p>{{name}}, just checking in. 💛</p>
<p>We hope Lisa's been helpful: spotting patterns, keeping your doctor summary up to date, and being there when you need to talk things through. If there's anything we can do better, just reply to this email.</p>
<p>You're part of a community of women who decided they deserved more than "it's just menopause." Thank you for being here. 💛</p>
<p>With love, the MenoLisa team 💕</p>`,
  },
  "3-5": {
    subject: "Your subscription renews soon. Here's what you still have with Lisa 💙",
    html: `<p>{{name}}, just a heads up: your MenoLisa subscription will renew on {{subscription_ends_at}}. 💙</p>
<p>You'll keep full access to Lisa, Pattern Intelligence, and your doctor note. If you ever want to change or cancel, it's easy, just head to your dashboard.</p>
<p>Thanks for staying with us. We're really glad you're here. 💕</p>
<p><a href="${DASHBOARD_URL}/dashboard/account">Manage subscription</a></p>
<p>With love, the MenoLisa team 💕</p>`,
  },
};
