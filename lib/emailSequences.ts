/**
 * Email sequence templates (Segment 2 & 3).
 * Source: EMAIL_SEQUENCES_SEGMENT_2_AND_3.md (marketing-expert).
 * Placeholders: {{name}}, {{top_problems}}, {{subscription_ends_at}}
 */

const DASHBOARD_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://menolisa.com";

export type StepId =
  | "2A1"
  | "2A2"
  | "2A3"
  | "2A4"
  | "2B1"
  | "2B2"
  | "2B3"
  | "3-1"
  | "3-2"
  | "3-3"
  | "3-4"
  | "3-5";

export const EMAIL_SEQUENCE_STEPS: StepId[] = [
  "2A1",
  "2A2",
  "2A3",
  "2A4",
  "2B1",
  "2B2",
  "2B3",
  "3-1",
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
  "2A1": {
    subject: "{{name}}, Lisa's ready for you",
    html: `<p>Hi {{name}}, you're in. Lisa has what you shared from your quiz—including {{top_problems}}. She's not a bot and she's not a textbook; she's built to get what you're going through.</p>
<p>We kept the trial short so you get to the good part fast—Lisa spotting patterns in your symptoms.</p>
<p>In the first 24 hours: open the app, say hi to Lisa, log how you feel today (even one symptom). The more you share in the next couple of days, the sooner she can say "here's what I'm noticing."</p>
<p><a href="${DASHBOARD_URL}">Open the app and say hi to Lisa</a></p>
<p>— The MenoLisa team</p>`,
  },
  "2A2": {
    subject: "How was your day? Lisa can use it.",
    html: `<p>{{name}}, if you haven't already—log how you felt today (even one symptom). Lisa uses that to start connecting the dots. By day 2 she often has a first "here's what I'm noticing" for you.</p>
<p>We built Lisa to get smarter with every log. No long forms—just tell her what's going on. She'll start spotting patterns your doctor doesn't have time to find.</p>
<p><a href="${DASHBOARD_URL}">Log today's symptoms</a></p>
<p>— The MenoLisa team</p>`,
  },
  "2A3": {
    subject: "Lisa noticed something about your symptoms",
    html: `<p>{{name}}, if you've logged a few times, Lisa may already have a first insight for you. Open the app and look for "What Lisa Noticed"—that's her starting to connect the dots in your data. She can also start a summary you can bring to your doctor.</p>
<p>That moment—when you see a pattern you didn't know was there—is what we built MenoLisa for. It's not just tracking; it's Pattern Intelligence. And it gets better the longer you use it.</p>
<p><a href="${DASHBOARD_URL}">See what Lisa noticed</a></p>
<p>— The MenoLisa team</p>`,
  },
  "2A4": {
    subject: "Your free access ends tonight—here's what happens next",
    html: `<p>{{name}}, your 3-day free access ends tonight. Lisa's only beginning to learn your patterns—by week 2 she usually finds 3–5 connections most women miss. If you're finding this useful, you can keep going for less than a copay a month.</p>
<p>$12/month or $79/year. No lock-in. Staying with Lisa means she keeps connecting the dots and you keep a summary ready for your doctor when you need it.</p>
<p><a href="${DASHBOARD_URL}/dashboard/settings">Continue with Lisa</a></p>
<p>Not now? You can resubscribe anytime from the app or menolisa.com.</p>
<p>— The MenoLisa team</p>`,
  },
  "2B1": {
    subject: "We miss you, {{name}}",
    html: `<p>{{name}}, your trial ended and we get it—life gets busy. If you ever felt like "finally, someone gets it" when you talked to Lisa, that doesn't have to be a one-time thing. She's the menopause companion who's there 24/7 and never dismisses what you're feeling.</p>
<p>Pattern Intelligence only gets better with more data. Come back and she'll keep connecting the dots and building a note for your doctor.</p>
<p><a href="${DASHBOARD_URL}">Open MenoLisa</a></p>
<p>— The MenoLisa team</p>`,
  },
  "2B2": {
    subject: "What to tell your doctor—and how Lisa helps",
    html: `<p>{{name}}, if you've ever left a doctor's office feeling unheard, you're not alone. Lisa builds a summary from your symptoms and patterns so you can bring something concrete: "Here's what's been going on." It's one way we help you feel prepared instead of dismissed.</p>
<p>You can pick up your trial anytime and keep building that summary.</p>
<p><a href="${DASHBOARD_URL}/dashboard/settings">Continue with Lisa</a></p>
<p>— The MenoLisa team</p>`,
  },
  "2B3": {
    subject: "Whenever you're ready, Lisa's here",
    html: `<p>{{name}}, we're not going to fill your inbox. Just one more note: if you ever want to come back to tracking your patterns with Lisa, we're here. $12/month, cancel anytime. Your data is still yours.</p>
<p>Lisa is the menopause companion who gets what you're going through—available 24/7. When you're ready, we'd love to have you back.</p>
<p><a href="${DASHBOARD_URL}">Open MenoLisa</a></p>
<p>— The MenoLisa team</p>`,
  },
  "3-1": {
    subject: "You're in—thank you, {{name}}",
    html: `<p>{{name}}, thank you for staying with Lisa. You're not just tracking symptoms—you're giving yourself a companion who actually learns your patterns and helps you show up prepared for your doctor. That matters.</p>
<p>Over the next weeks you'll see more "What Lisa Noticed" as she connects the dots. Use the doctor note whenever you have an appointment. If you ever have a question, just ask Lisa or reply to this email.</p>
<p><a href="${DASHBOARD_URL}">Open the app</a></p>
<p>— The MenoLisa team</p>`,
  },
  "3-2": {
    subject: "3 ways to get more from Lisa",
    html: `<p>{{name}}, now that you're a few days in, here are three things that make the biggest difference: (1) Log when something shifts—even briefly. (2) Check "What Lisa Noticed" regularly. (3) Ask Lisa to build a summary before a doctor visit—bring it with you.</p>
<p>The more you log, the more she spots—things like triggers and timing that are easy to miss on your own.</p>
<p><a href="${DASHBOARD_URL}">Open MenoLisa</a></p>
<p>— The MenoLisa team</p>`,
  },
  "3-3": {
    subject: "Give a friend 7 days with Lisa—get 50% off your next month",
    html: `<p>{{name}}, if you know someone who's going through menopause and could use a companion who actually gets it—share Lisa. They get a 7-day free trial. You get 50% off your next month when they sign up with your link.</p>
<p>So many women feel alone in this. You're not. And neither does she have to be. Send them your link from the app (Settings → Invite friends). When they start their trial, you'll get your discount.</p>
<p><a href="${DASHBOARD_URL}/dashboard/settings">Get your invite link</a></p>
<p>— The MenoLisa team</p>`,
  },
  "3-4": {
    subject: "{{name}}, how's it going with Lisa?",
    html: `<p>{{name}}, just checking in. We hope Lisa's been helpful—spotting patterns, keeping your doctor summary up to date, and being there when you need to talk it through. If there's anything we can do better, reply to this email.</p>
<p>You're part of a community of women who decided they deserved more than "it's just menopause." Thank you for being here.</p>
<p>— The MenoLisa team</p>`,
  },
  "3-5": {
    subject: "Your subscription renews soon—here's what you have with Lisa",
    html: `<p>{{name}}, your MenoLisa subscription will renew on {{subscription_ends_at}}. You'll keep full access to Lisa, Pattern Intelligence, and your doctor note. If you want to change or cancel, you can do it anytime from the link in your dashboard.</p>
<p>Thanks for staying with us. We're glad you're here.</p>
<p><a href="${DASHBOARD_URL}/dashboard/settings">Manage subscription</a></p>
<p>— The MenoLisa team</p>`,
  },
};
