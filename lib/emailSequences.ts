import { buildEmailHtml } from "@/lib/resend";

const DASHBOARD_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://menolisa.com";

export type StepId =
  | "p-1" | "p-2" | "p-3" | "p-4" | "p-5" | "p-6"
  | "3-2" | "3-3" | "3-4" | "3-5";

export const EMAIL_SEQUENCE_STEPS: StepId[] = [
  "p-1", "p-2", "p-3", "p-4", "p-5", "p-6",
  "3-2", "3-3", "3-4", "3-5",
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
    html: buildEmailHtml(replace(template.html)),
  };
}

function btn(label: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin-top:28px">
  <tr>
    <td bgcolor="#7c3aed" style="background-color:#7c3aed;border-radius:10px">
      <a href="${url}" target="_blank"
         style="display:inline-block;padding:13px 28px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">
        ${label}
      </a>
    </td>
  </tr>
</table>`;
}

const PAYWALL_URL = `${DASHBOARD_URL}/register?phase=paywall`;

export const EMAIL_SEQUENCE_TEMPLATES: Record<StepId, EmailTemplate> = {

  // ── Pending-payment sequence: abandoned paywall, days 1–6 ──────────────

  "p-1": {
    subject: "Your plan is saved, {{name}}",
    html: `
<p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#2d1b3d">Hi {{name}},</p>
<p style="margin:0 0 16px">Just wanted to let you know your Menopause Score and personalized plan are saved. They will be here whenever you are ready.</p>
<p style="margin:0">No rush from me.</p>
${btn("See my plan", PAYWALL_URL)}`,
  },

  "p-2": {
    subject: "The thing most women do not realize about their symptoms",
    html: `
<p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#2d1b3d">Hi {{name}},</p>
<p style="margin:0 0 16px">Most women think their symptoms are separate problems. Hot flashes here. Brain fog there. Bad sleep somewhere else.</p>
<p style="margin:0 0 16px">They are usually the same thing showing up in different ways.</p>
<p style="margin:0">That is what makes menopause so hard to manage without tracking. When you can see the full picture, the pattern becomes obvious. And once you see it, you can actually do something about it.</p>`,
  },

  "p-3": {
    subject: "You are not imagining it, {{name}}",
    html: `
<p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#2d1b3d">Hi {{name}},</p>
<p style="margin:0 0 16px">I hear from so many women who have been told their symptoms are in their head. Or that this is just what getting older feels like. Or that they should push through.</p>
<p style="margin:0 0 16px">It is not in your head. It is measurable, it is real, and it gets better when you understand what is driving it.</p>
<p style="margin:0">That is what Lisa is here to help with.</p>`,
  },

  "p-4": {
    subject: "What Lisa spotted in the first week",
    html: `
<p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#2d1b3d">Hi {{name}},</p>
<p style="margin:0 0 16px">In the first week of tracking, most women find at least one surprise.</p>
<p style="margin:0 0 16px">A symptom they thought was random turns out to happen every time after a bad night of sleep. A mood shift that always shows up after certain foods. A pattern they had never connected before.</p>
<p style="margin:0">That is what Lisa does. She does not just log your symptoms. She connects them.</p>
${btn("Start my 3 days free", PAYWALL_URL)}`,
  },

  "p-5": {
    subject: "Nothing is charged until day 4, {{name}}",
    html: `
<p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#2d1b3d">Hi {{name}},</p>
<p style="margin:0 0 16px">I want to be direct about something.</p>
<p style="margin:0 0 16px">The 3-day trial means your card is saved but nothing is charged. Not on day 1. Not on day 2. Not on day 3. If you cancel at any point before day 4, you pay zero. It takes about 10 seconds from your account page.</p>
<p style="margin:0">No hoops.</p>
${btn("Start my free trial", PAYWALL_URL)}`,
  },

  "p-6": {
    subject: "Last one from me, {{name}}",
    html: `
<p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#2d1b3d">Hi {{name}},</p>
<p style="margin:0 0 16px">This is my last email.</p>
<p style="margin:0 0 16px">If this is not the right time, that is completely fine. Life gets busy. I get it.</p>
<p style="margin:0 0 24px">If you ever want to come back, your plan is still here. Just click below and you will be right where you left off.</p>
${btn("See my plan", PAYWALL_URL)}
<p style="margin:20px 0 0;color:#9d7ec9;font-size:13px">I hope you find the support you are looking for, wherever that comes from.</p>`,
  },

  // ── Paid user sequence ─────────────────────────────────────────────────

  "3-2": {
    subject: "3 ways to get more from Lisa",
    html: `
<p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#2d1b3d">Hi {{name}},</p>
<p style="margin:0 0 20px">Now that you are a few days in, here are three things that make the biggest difference:</p>
<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 24px">
  <tr>
    <td style="color:#7c3aed;font-weight:700;padding-right:14px;vertical-align:top;padding-bottom:14px;white-space:nowrap">1.</td>
    <td style="color:#2d1b3d;padding-bottom:14px">Log when something shifts, even briefly. The pattern usually hides in the small moments.</td>
  </tr>
  <tr>
    <td style="color:#7c3aed;font-weight:700;padding-right:14px;vertical-align:top;padding-bottom:14px;white-space:nowrap">2.</td>
    <td style="color:#2d1b3d;padding-bottom:14px">Check "What Lisa Noticed" regularly. She surfaces things that are easy to miss on your own.</td>
  </tr>
  <tr>
    <td style="color:#7c3aed;font-weight:700;padding-right:14px;vertical-align:top;white-space:nowrap">3.</td>
    <td style="color:#2d1b3d">Before your next doctor visit, ask Lisa to build a summary. Print it. Bring it. It changes the conversation.</td>
  </tr>
</table>
${btn("Open MenoLisa", DASHBOARD_URL)}`,
  },

  "3-3": {
    subject: "Give a friend 3 days with Lisa and get 50% off your next month",
    html: `
<p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#2d1b3d">Hi {{name}},</p>
<p style="margin:0 0 16px">If you know someone going through menopause who could use a companion that actually gets it, share Lisa with her.</p>
<p style="margin:0 0 16px">She gets a 3-day free trial. You get 50% off your next month when she signs up with your link.</p>
<p style="margin:0 0 4px">So many women feel alone in this. You do not have to be, and neither does she.</p>
${btn("Get your invite link", `${DASHBOARD_URL}/dashboard/account`)}
<p style="margin:16px 0 0;color:#9d7ec9;font-size:13px">Find your link in the app under Account &gt; Invite friends.</p>`,
  },

  "3-4": {
    subject: "{{name}}, how is it going with Lisa?",
    html: `
<p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#2d1b3d">Hi {{name}},</p>
<p style="margin:0 0 16px">Just checking in.</p>
<p style="margin:0 0 16px">I hope Lisa has been helpful. Spotting patterns, keeping your doctor summary up to date, being there when you need to talk things through.</p>
<p style="margin:0 0 16px">If there is anything we can do better, just reply to this email. I read every one.</p>
<p style="margin:0">Thank you for being here.</p>`,
  },

  "3-5": {
    subject: "Your subscription renews tomorrow",
    html: `
<p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#2d1b3d">Hi {{name}},</p>
<p style="margin:0 0 16px">Just a heads up. Your MenoLisa subscription renews on {{subscription_ends_at}}.</p>
<p style="margin:0 0 4px">You will keep full access to Lisa, your symptom history, and your doctor summary. If you ever want to change or cancel, it takes 30 seconds from your account page.</p>
${btn("Manage subscription", `${DASHBOARD_URL}/dashboard/account`)}`,
  },
};
