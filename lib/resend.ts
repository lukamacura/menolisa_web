import { Resend } from "resend";

let resendClient: Resend | null = null;

/**
 * Get or create Resend client (lazy initialization).
 * Requires RESEND_API_KEY in env.
 */
export function getResend(): Resend {
  if (resendClient) {
    return resendClient;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing RESEND_API_KEY. Set it in environment variables for email sequences."
    );
  }
  resendClient = new Resend(apiKey);
  return resendClient;
}

const DEFAULT_FROM = "MenoLisa <onboarding@menolisa.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://menolisa.com";

/**
 * Send one sequence email. Uses EMAIL_FROM from env or a default.
 * Body is HTML; use plain text or simple HTML.
 */
export async function sendSequenceEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ id: string | null; error: Error | null }> {
  const from = process.env.EMAIL_FROM ?? DEFAULT_FROM;
  const resend = getResend();
  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    html,
  });
  if (error) {
    return { id: null, error };
  }
  return { id: data?.id ?? null, error: null };
}

/** Sent to the user when Stripe checkout completes — trial starts, $0 charged. */
export async function sendTrialWelcomeEmail(to: string, name: string | null): Promise<void> {
  const greeting = name?.trim() || "there";
  const html = `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#333">
  <h2 style="color:#7c3aed">Your 3-day trial has started, ${greeting}! 🌸</h2>
  <p>Your card is saved — <strong>nothing has been charged yet.</strong> You'll get a reminder before your trial ends.</p>
  <p>Lisa is ready. Open the app, say hi, and log how you feel today — even one symptom helps her start spotting patterns for you.</p>
  <p style="margin:24px 0">
    <a href="${APP_URL}/dashboard/symptoms"
       style="background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
      Open the app
    </a>
  </p>
  <p>With love, the MenoLisa team 💕</p>
</div>`;
  await sendSequenceEmail(to, "Your 3-day trial has started — $0 charged today", html);
}

/** Sent to the user when Stripe actually charges them (day 3 + renewals). */
export async function sendChargeConfirmedEmail(to: string, name: string | null): Promise<void> {
  const greeting = name?.trim() || "there";
  const html = `
<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#333">
  <h2 style="color:#7c3aed">You've been charged, ${greeting} 💜</h2>
  <p>Thank you for staying with Lisa. Your subscription is active and she'll keep learning your patterns.</p>
  <p style="margin:24px 0">
    <a href="${APP_URL}/dashboard/symptoms"
       style="background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">
      Open MenoLisa
    </a>
  </p>
  <p style="font-size:13px;color:#888">To cancel or manage your subscription, go to Account in the app or reply to this email.</p>
  <p>With love, the MenoLisa team 💕</p>
</div>`;
  await sendSequenceEmail(to, "You've been charged — welcome to MenoLisa 💜", html);
}

/** Internal alert sent to ADMIN_NOTIFICATION_EMAIL when a notable event happens. */
export async function sendAdminNotification(subject: string, html: string): Promise<void> {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) return;
  await sendSequenceEmail(adminEmail, subject, html);
}
