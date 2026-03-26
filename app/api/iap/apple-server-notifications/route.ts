import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

function decodeJwtPayload<T = Record<string, unknown>>(jwt: string): T | null {
  const parts = jwt.split(".");
  if (parts.length < 2) return null;
  const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
  try {
    const json = Buffer.from(padded, "base64").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}

type DecodedNotification = {
  data?: {
    signedTransactionInfo?: string;
  };
};

type DecodedTransaction = {
  appAccountToken?: string;
  expiresDate?: number;
};

/**
 * App Store Server Notifications v2 endpoint.
 * For now, we decode the signed payload and update user_trials when appAccountToken maps to user_id.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { signedPayload?: string };
    if (!body.signedPayload) {
      return NextResponse.json({ ok: false, error: "Missing signedPayload" }, { status: 400 });
    }

    const notification = decodeJwtPayload<DecodedNotification>(body.signedPayload);
    const signedTxn = notification?.data?.signedTransactionInfo;
    const transaction = signedTxn ? decodeJwtPayload<DecodedTransaction>(signedTxn) : null;
    const userId = transaction?.appAccountToken;
    const expiresAt = transaction?.expiresDate
      ? new Date(Number(transaction.expiresDate)).toISOString()
      : null;
    const active = !!(transaction?.expiresDate && Number(transaction.expiresDate) > Date.now());

    if (userId) {
      const supabaseAdmin = getSupabaseAdmin();
      const { error } = await supabaseAdmin.from("user_trials").upsert(
        {
          user_id: userId,
          account_status: active ? "paid" : "expired",
          subscription_ends_at: expiresAt,
          subscription_canceled: !active && !!expiresAt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (error) {
        console.error("apple-server-notifications upsert failed:", error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("apple-server-notifications error:", err);
    return NextResponse.json({ ok: false, error: "Failed to process notification." }, { status: 500 });
  }
}

