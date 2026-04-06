import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/getAuthenticatedUser";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { writeSubscription } from "@/lib/subscriptionWrite";

export const runtime = "nodejs";

const EXPECTED_BUNDLE_ID = "com.menolisa.app";

type AppleVerifyResponse = {
  status: number;
  latest_receipt_info?: Array<{
    product_id?: string;
    expires_date_ms?: string;
    original_transaction_id?: string;
    transaction_id?: string;
  }>;
  receipt?: {
    bundle_id?: string;
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

    // Per Apple guidance: try production first; fall back to sandbox on 21007.
    // 21008 = production receipt sent to sandbox (we hit prod first so this is unexpected,
    // but handle it defensively in case Apple's reviewers exercise an edge path).
    let verify = await verifyWithApple(body.receiptData, false);
    if (verify.status === 21007) verify = await verifyWithApple(body.receiptData, true);
    else if (verify.status === 21008) verify = await verifyWithApple(body.receiptData, false);
    if (verify.status !== 0) {
      return NextResponse.json({ ok: false, error: "Receipt not valid", status: verify.status }, { status: 400 });
    }

    // Bundle ID check — refuse receipts from any other app.
    const bundleId = verify.receipt?.bundle_id;
    if (bundleId && bundleId !== EXPECTED_BUNDLE_ID) {
      console.error("verify-receipt: bundle_id mismatch", bundleId);
      return NextResponse.json(
        { ok: false, error: "Receipt does not belong to this app." },
        { status: 400 }
      );
    }

    const latest = getLatestReceiptItem(verify);
    const expiresAtMs = Number(latest?.expires_date_ms ?? 0);
    const active = expiresAtMs > Date.now();
    const subscriptionEndsAt = expiresAtMs ? new Date(expiresAtMs).toISOString() : null;
    const productId = latest?.product_id ?? body.productId ?? null;

    const supabaseAdmin = getSupabaseAdmin();
    try {
      const result = await writeSubscription(supabaseAdmin, {
        userId: user.id,
        provider: "apple",
        active,
        expiresAt: subscriptionEndsAt,
        canceled: !active && !!subscriptionEndsAt,
        productId,
        originalTransactionId: latest?.original_transaction_id ?? null,
        latestReceipt: body.receiptData,
      });
      if (!result.written) {
        return NextResponse.json(
          {
            ok: false,
            error: "already_subscribed",
            provider: result.existingProvider,
          },
          { status: 409 }
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to persist subscription";
      return NextResponse.json({ ok: false, error: message }, { status: 500 });
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

