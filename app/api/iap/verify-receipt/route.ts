import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

type AppleVerifyResponse = {
  status: number;
  latest_receipt_info?: Array<{
    product_id?: string;
    expires_date_ms?: string;
    original_transaction_id?: string;
    transaction_id?: string;
  }>;
  receipt?: {
    in_app?: Array<{
      product_id?: string;
      expires_date_ms?: string;
      original_transaction_id?: string;
      transaction_id?: string;
    }>;
  };
};

async function verifyWithApple(receiptData: string, useSandbox: boolean): Promise<AppleVerifyResponse> {
  const url = useSandbox
    ? "https://sandbox.itunes.apple.com/verifyReceipt"
    : "https://buy.itunes.apple.com/verifyReceipt";
  const password = process.env.APPLE_IAP_SHARED_SECRET;
  const payload: Record<string, unknown> = {
    "receipt-data": receiptData,
    "exclude-old-transactions": true,
  };
  if (password) payload.password = password;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Apple verifyReceipt failed: ${res.status}`);
  }
  return (await res.json()) as AppleVerifyResponse;
}

function getLatestReceiptItem(data: AppleVerifyResponse) {
  const items = data.latest_receipt_info?.length
    ? data.latest_receipt_info
    : data.receipt?.in_app ?? [];
  if (!items.length) return null;
  return [...items].sort((a, b) => {
    const aMs = Number(a.expires_date_ms ?? 0);
    const bMs = Number(b.expires_date_ms ?? 0);
    return bMs - aMs;
  })[0];
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = (await req.json().catch(() => ({}))) as {
      receiptData?: string;
      productId?: string;
      transactionId?: string;
    };
    if (!body.receiptData) {
      return NextResponse.json({ ok: false, error: "Missing receiptData" }, { status: 400 });
    }

    let verify = await verifyWithApple(body.receiptData, false);
    if (verify.status === 21007) verify = await verifyWithApple(body.receiptData, true);
    if (verify.status !== 0) {
      return NextResponse.json({ ok: false, error: "Receipt not valid", status: verify.status }, { status: 400 });
    }

    const latest = getLatestReceiptItem(verify);
    const expiresAtMs = Number(latest?.expires_date_ms ?? 0);
    const active = expiresAtMs > Date.now();
    const subscriptionEndsAt = expiresAtMs ? new Date(expiresAtMs).toISOString() : null;
    const productId = latest?.product_id ?? body.productId ?? null;

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from("user_trials").upsert(
      {
        user_id: user.id,
        account_status: active ? "paid" : "expired",
        subscription_ends_at: subscriptionEndsAt,
        subscription_canceled: !active && !!subscriptionEndsAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) {
      console.error("iap verify-receipt upsert failed:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      active,
      expiresAt: subscriptionEndsAt,
      productId,
      transactionId: latest?.transaction_id ?? body.transactionId ?? null,
      originalTransactionId: latest?.original_transaction_id ?? null,
    });
  } catch (err) {
    console.error("iap verify-receipt error:", err);
    return NextResponse.json({ ok: false, error: "Failed to verify receipt." }, { status: 500 });
  }
}

