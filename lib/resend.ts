import { Resend } from "resend";

let resendClient: Resend | null = null;

export function getResend(): Resend {
  if (resendClient) return resendClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Missing RESEND_API_KEY.");
  resendClient = new Resend(apiKey);
  return resendClient;
}

const DEFAULT_FROM = "Merry | MenoLisa Founder <onboarding@menolisa.com>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://menolisa.com";

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

        <!-- Purple header with logo -->
        <tr>
          <td bgcolor="#7c3aed" style="background-color:#7c3aed;border-radius:20px 20px 0 0;padding:32px 40px 0;text-align:center">
            <img src="${APP_URL}/paywall.png" width="96" alt="MenoLisa"
                 style="display:block;margin:0 auto;border:0;max-width:96px;height:auto" />
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

export async function sendSequenceEmail(
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

/** Sent when Stripe checkout completes — trial starts, $0 charged. */
export async function sendTrialWelcomeEmail(to: string, name: string | null): Promise<void> {
  const greeting = name?.trim() || "there";
  const body = `
<p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#2d1b3d">Hi ${greeting},</p>
<p style="margin:0 0 16px">Your 3-day trial has started. Nothing has been charged yet.</p>
<p style="margin:0 0 28px">Lisa is ready. Open the app, say hi, and log how you feel today. Even one symptom helps her start spotting patterns for you.</p>
<table cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td bgcolor="#7c3aed" style="background-color:#7c3aed;border-radius:10px">
      <a href="${APP_URL}/dashboard/symptoms" target="_blank"
         style="display:inline-block;padding:13px 28px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">
        Open MenoLisa
      </a>
    </td>
  </tr>
</table>
<p style="margin:24px 0 0;color:#9d7ec9;font-size:13px">You will get a reminder before your trial ends. Questions? Just reply to this email.</p>`;

  await sendSequenceEmail(
    to,
    "Your 3-day trial has started. Nothing charged today.",
    buildEmailHtml(body)
  );
}

/** Sent when Stripe actually charges them (day 3 conversion + renewals). */
export async function sendChargeConfirmedEmail(to: string, name: string | null): Promise<void> {
  const greeting = name?.trim() || "there";
  const body = `
<p style="margin:0 0 16px;font-size:17px;font-weight:600;color:#2d1b3d">Hi ${greeting},</p>
<p style="margin:0 0 16px">Your subscription is active. Thank you for staying with Lisa.</p>
<p style="margin:0 0 28px">She will keep learning your patterns and building a clearer picture over time. The longer you log, the sharper her insights get.</p>
<table cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td bgcolor="#7c3aed" style="background-color:#7c3aed;border-radius:10px">
      <a href="${APP_URL}/dashboard/symptoms" target="_blank"
         style="display:inline-block;padding:13px 28px;color:#ffffff;font-weight:600;font-size:15px;text-decoration:none">
        Open MenoLisa
      </a>
    </td>
  </tr>
</table>
<p style="margin:24px 0 0;color:#9d7ec9;font-size:13px">To cancel or manage your subscription, go to Account in the app or reply to this email.</p>`;

  await sendSequenceEmail(
    to,
    "You've been charged. Welcome to MenoLisa.",
    buildEmailHtml(body)
  );
}

/** Internal alert sent to ADMIN_NOTIFICATION_EMAIL when a notable event happens. */
export async function sendAdminNotification(subject: string, html: string): Promise<void> {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (!adminEmail) return;
  await sendSequenceEmail(adminEmail, subject, html);
}
