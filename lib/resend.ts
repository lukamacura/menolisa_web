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
