import { Resend } from "resend";
import {
  PLAN_PRICE,
  PLAN_WEEKS,
  RENEWAL_NOTICE_DAYS,
  formatPrice,
} from "@/lib/pricing";

let resendClient: Resend | null = null;

export function getResend(): Resend {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Missing RESEND_API_KEY.");
  resendClient = new Resend(apiKey);
  return resendClient;
}

const DEFAULT_FROM = "Merry | MenoLisa Founder <onboarding@menolisa.com>";
const APP_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://menolisa.com";

/**
 * Shared HTML wrapper for all transactional and sequence emails.
 * Pass body-only HTML (no <html>/<body> tags); this wraps it in the
 * branded template: warm cream page, purple header with logo, wave arch,
 * white body, Merry signature, lavender footer.
 */
export function buildEmailHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MenoLisa</title>
</head>
<body style="margin:0;padding:0;background-color:#fff8f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif">

<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fff8f5" style="background-color:#fff8f5">
  <tr>
    <td align="center" style="padding:40px 16px 48px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">

        <!-- Purple header with wordmark -->
        <tr>
          <td bgcolor="#7c3aed" style="background-color:#7c3aed;border-radius:20px 20px 0 0;padding:32px 40px 0;text-align:center">
            <p style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:0.5px;line-height:1.2">MenoLisa</p>
          </td>
        </tr>

        <!-- Wave arch: white dome over purple, transitions header to body -->
        <tr>
          <td bgcolor="#7c3aed" style="background-color:#7c3aed;padding:0;font-size:0;line-height:0;mso-line-height-rule:exactly">
            <div style="height:32px;background-color:#ffffff;border-radius:50% 50% 0 0 / 32px 32px 0 0"></div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff;padding:4px 40px 40px;color:#2d1b3d;font-size:15px;line-height:1.85">
            ${body}

            <!-- Signature -->
            <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:36px">
              <tr>
                <td style="border-top:1px solid #ede9fe;padding-top:22px">
                  <p style="margin:0 0 3px;font-weight:700;color:#7c3aed;font-size:15px">Merry</p>
                  <p style="margin:0;color:#a78bc4;font-size:13px">Founder, MenoLisa</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Wave arch: lavender dome over white, transitions body to footer -->
        <tr>
          <td bgcolor="#ffffff" style="background-color:#ffffff;padding:0;font-size:0;line-height:0;mso-line-height-rule:exactly">
            <div style="height:24px;background-color:#fdf4ff;border-radius:100% 100% 0 0 / 24px 24px 0 0"></div>
          </td>
        </tr>

        <!-- Footer strip -->
        <tr>
          <td bgcolor="#fdf4ff" style="background-color:#fdf4ff;border-radius:0 0 20px 20px;padding:16px 40px;text-align:center">
            <p style="margin:0;font-size:12px;color:#a78bc4">You received this as a MenoLisa member.</p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>

</body>
</html>`;
}

/**
 * The one place an email leaves the product. Every message below is
 * transactional — triggered by something that happened to her account, not by a
 * marketing schedule. There is no drip: she has no email until she pays, and
 * once she pays the app is where the relationship lives.
 */
export async function sendTransactionalEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ id: string | null; error: Error | null }> {
  const from = process.env.EMAIL_FROM ?? DEFAULT_FROM;
  const resend = getResend();
  const { data, error } = await resend.emails.send({ from, to, subject, html });
  if (error) return { id: null, error };
  return { id: data?.id ?? null, error: null };
}

/**
 * Sent when Stripe checkout completes. The customer has been charged at this
 * point — the 8-week plan has no trial, so there is no "nothing charged yet"
 * variant of this email.
 */
export async function sendWelcomeEmail(to: string, name: string | null): Promise<void> {
  const greeting = name?.trim() || "there";
  const subject = "Welcome to MenoLisa";
  const footerLine =
    "You can manage or cancel your subscription anytime from Account. Questions? Just reply to this email.";
  const body = `
<p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#2d1b3d">Hi ${greeting},</p>
<p style="margin:0 0 16px">Your subscription is active. Thank you for joining.</p>
<p style="margin:0 0 28px">Lisa is ready. Open the app, say hi, and log how you feel today. Even one symptom helps her start spotting patterns for you.</p>
<table cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td bgcolor="#7c3aed" style="background-color:#7c3aed;border-radius:10px">
      <a href="${APP_URL}/get-the-app" target="_blank"
         style="display:inline-block;padding:13px 28px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">
        Open MenoLisa
      </a>
    </td>
  </tr>
</table>
<p style="margin:24px 0 0;color:#9d7ec9;font-size:13px">${footerLine}</p>`;

  await sendTransactionalEmail(to, subject, buildEmailHtml(body));
}

/** Sent on every renewal charge after the first. */
export async function sendChargeConfirmedEmail(to: string, name: string | null): Promise<void> {
  const greeting = name?.trim() || "there";
  const body = `
<p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#2d1b3d">Hi ${greeting},</p>
<p style="margin:0 0 16px">Your subscription is active. Thank you for staying with Lisa.</p>
<p style="margin:0 0 28px">She will keep learning your patterns and building a clearer picture over time. The longer you log, the sharper her insights get.</p>
<table cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td bgcolor="#7c3aed" style="background-color:#7c3aed;border-radius:10px">
      <a href="${APP_URL}/get-the-app" target="_blank"
         style="display:inline-block;padding:13px 28px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">
        Open MenoLisa
      </a>
    </td>
  </tr>
</table>
<p style="margin:24px 0 0;color:#9d7ec9;font-size:13px">To cancel or manage your subscription, go to Account in the app or reply to this email.</p>`;

  await sendTransactionalEmail(
    to,
    "You've been charged. Welcome to MenoLisa.",
    buildEmailHtml(body)
  );
}

/**
 * Sent {@link RENEWAL_NOTICE_DAYS} days before the card is charged again.
 *
 * This is the only scheduled email left in the product, and it is here because
 * the week-8 renewal is the moment she is least sure the plan worked and most
 * likely to dispute the charge rather than cancel it. Warning her while she can
 * still act converts a chargeback into either a cancellation or a decision she
 * made on purpose — both better outcomes than a surprise. The paywall promises
 * this notice at the price, so it is also a claim we have to keep.
 *
 * Named amount, named date, and cancelling explicitly does not forfeit the weeks
 * already paid for — she should never feel the choice is "act now or lose it".
 */
export async function sendRenewalNoticeEmail(
  to: string,
  name: string | null,
  renewsAt: Date
): Promise<{ id: string | null; error: Error | null }> {
  const greeting = name?.trim() || "there";
  const when = renewsAt.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const body = `
<p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#2d1b3d">Hi ${greeting},</p>
<p style="margin:0 0 16px">A heads up with time to act on it: your MenoLisa subscription renews on <strong>${when}</strong>, and your card will be charged ${formatPrice(PLAN_PRICE)} for the next ${PLAN_WEEKS} weeks.</p>
<p style="margin:0 0 28px">If you would rather not continue, cancelling takes about 30 seconds and you keep everything you have already paid for through ${when}. Nothing to do if you are staying.</p>
<table cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td bgcolor="#7c3aed" style="background-color:#7c3aed;border-radius:10px">
      <a href="${APP_URL}/dashboard/account" target="_blank"
         style="display:inline-block;padding:13px 28px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">
        Manage subscription
      </a>
    </td>
  </tr>
</table>
<p style="margin:24px 0 0;color:#9d7ec9;font-size:13px">Questions about the charge? Just reply to this email.</p>`;

  return sendTransactionalEmail(
    to,
    `Your subscription renews in ${RENEWAL_NOTICE_DAYS} days`,
    buildEmailHtml(body)
  );
}

/** Internal alert sent to ADMIN_NOTIFICATION_EMAIL when a notable event happens. */
export async function sendAdminNotification(subject: string, html: string): Promise<void> {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) return;
  await sendTransactionalEmail(adminEmail, subject, html);
}
