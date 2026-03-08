import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendSequenceEmail } from "@/lib/resend";
import {
  EMAIL_SEQUENCE_STEPS,
  EMAIL_SEQUENCE_TEMPLATES,
  renderTemplate,
  type StepId,
} from "@/lib/emailSequences";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min for many steps/recipients

type RecipientRow = {
  user_id: string;
  email: string;
  name: string | null;
  top_problems: string[] | null;
  severity: string | null;
  goal: string | null;
  trial_start: string | null;
  trial_end: string | null;
  account_status: string | null;
  subscription_ends_at: string | null;
  paid_at: string | null;
  updated_at: string;
  sent_steps: Record<string, string> | null;
};

/**
 * Cron: email sequences (Segment 2 trial/expired, Segment 3 paid).
 * Uses email_sequence_recipients and Resend. Run hourly (e.g. Vercel Cron).
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    let totalSent = 0;
    const errors: { step: string; user_id: string; error: string }[] = [];

    for (const step of EMAIL_SEQUENCE_STEPS) {
      const { data: rows, error: rpcError } = await supabase.rpc(
        "get_email_sequence_due",
        { p_step: step }
      );

      if (rpcError) {
        console.error(`email-sequences: get_email_sequence_due(${step})`, rpcError);
        errors.push({ step, user_id: "", error: rpcError.message });
        continue;
      }

      const recipients = (rows ?? []) as RecipientRow[];
      const template = EMAIL_SEQUENCE_TEMPLATES[step as StepId];

      for (const row of recipients) {
        const { subject, html } = renderTemplate(template, {
          name: row.name,
          top_problems: row.top_problems,
          subscription_ends_at: row.subscription_ends_at,
        });

        const { error: sendError } = await sendSequenceEmail(
          row.email,
          subject,
          html
        );

        if (sendError) {
          console.warn(`email-sequences: send failed`, step, row.user_id, sendError);
          errors.push({
            step,
            user_id: row.user_id,
            error: sendError.message,
          });
          continue;
        }

        const currentSteps = row.sent_steps ?? {};
        const nextSteps = {
          ...currentSteps,
          [step]: new Date().toISOString(),
        };

        const { error: updateError } = await supabase
          .from("email_sequence_recipients")
          .update({ sent_steps: nextSteps })
          .eq("user_id", row.user_id);

        if (updateError) {
          console.warn(`email-sequences: update sent_steps failed`, step, row.user_id, updateError);
          errors.push({
            step,
            user_id: row.user_id,
            error: `sent_steps update: ${updateError.message}`,
          });
          continue;
        }

        totalSent += 1;
      }
    }

    return NextResponse.json({
      ok: true,
      sent: totalSent,
      ...(errors.length > 0 && { errors }),
    });
  } catch (e) {
    console.error("email-sequences error:", e);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
