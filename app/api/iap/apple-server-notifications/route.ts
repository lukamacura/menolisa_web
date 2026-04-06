import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { writeSubscription } from "@/lib/subscriptionWrite";
import {
  verifyAppleJws,
  type AppleNotificationPayload,
  type AppleTransactionInfo,
  type AppleRenewalInfo,
} from "@/lib/appleJws";

export const runtime = "nodejs";

const EXPECTED_BUNDLE_ID = "com.menolisa.app";

/**
 * App Store Server Notifications V2 endpoint.
 *
 * Security:
 *  - Verifies the JWS signature against Apple Root CA - G3 (see lib/appleJws.ts).
 *  - Verifies the bundleId matches com.menolisa.app.
 *  - Returns 401 on signature failure or missing user mapping so Apple retries.
 *
 * Reconciliation:
 *  - Uses appAccountToken (set on the mobile side as the Supabase user UUID) as the lookup key.
 *  - Branches on notificationType to set account_status / subscription_canceled correctly.
 */
export async function POST(req: NextRequest) {
  let body: { signedPayload?: string };
  try {
    body = (await req.json()) as { signedPayload?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.signedPayload) {
    return NextResponse.json({ ok: false, error: "Missing signedPayload" }, { status: 400 });
  }

  // 1. Verify outer JWS.
  let notification: AppleNotificationPayload;
  try {
    notification = verifyAppleJws<AppleNotificationPayload>(body.signedPayload);
  } catch (err) {
    console.error("apple-server-notifications: outer JWS verification failed:", err);
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  // 2. Verify bundle id.
  if (notification.data?.bundleId && notification.data.bundleId !== EXPECTED_BUNDLE_ID) {
    console.error(
      "apple-server-notifications: bundleId mismatch",
      notification.data.bundleId
    );
    return NextResponse.json({ ok: false, error: "Bundle id mismatch" }, { status: 401 });
  }

  // 3. Verify and decode the inner signed transaction info.
  const signedTxn = notification.data?.signedTransactionInfo;
  if (!signedTxn) {
    // Some notification types (e.g. CONSUMPTION_REQUEST) don't carry a transaction.
    // Acknowledge so Apple stops retrying.
    return NextResponse.json({ ok: true, skipped: "no signedTransactionInfo" });
  }

  let transaction: AppleTransactionInfo;
  try {
    transaction = verifyAppleJws<AppleTransactionInfo>(signedTxn);
  } catch (err) {
    console.error("apple-server-notifications: signedTransactionInfo verification failed:", err);
    return NextResponse.json({ ok: false, error: "Invalid transaction signature" }, { status: 401 });
  }

  if (transaction.bundleId && transaction.bundleId !== EXPECTED_BUNDLE_ID) {
    return NextResponse.json({ ok: false, error: "Transaction bundle id mismatch" }, { status: 401 });
  }

  // Optional: decode renewal info if present.
  let renewal: AppleRenewalInfo | null = null;
  const signedRenewal = notification.data?.signedRenewalInfo;
  if (signedRenewal) {
    try {
      renewal = verifyAppleJws<AppleRenewalInfo>(signedRenewal);
    } catch (err) {
      console.error("apple-server-notifications: signedRenewalInfo verification failed:", err);
      // Non-fatal: continue with transaction info only.
    }
  }

  const userId = transaction.appAccountToken;
  if (!userId) {
    // TODO(legacy): once any pre-appAccountToken purchases exist, fall back to looking up
    // the user by original_transaction_id (which we now persist on every verify-receipt
    // call). For a brand-new app this is fine — every purchase comes with appAccountToken
    // because the mobile fix landed before launch. Returning 401 makes Apple retry.
    console.error(
      "apple-server-notifications: missing appAccountToken on transaction",
      transaction.originalTransactionId
    );
    return NextResponse.json({ ok: false, error: "No user mapping" }, { status: 401 });
  }

  // 4. Branch on notification type.
  const type = notification.notificationType ?? "";
  const expiresAtMs = Number(transaction.expiresDate ?? 0);
  const expiresAtIso = expiresAtMs ? new Date(expiresAtMs).toISOString() : null;
  const stillInPeriod = expiresAtMs > Date.now();

  let accountStatus: "paid" | "expired" | null = null;
  let subscriptionCanceled = false;

  switch (type) {
    case "SUBSCRIBED":
    case "DID_RENEW":
    case "OFFER_REDEEMED":
      accountStatus = stillInPeriod ? "paid" : "expired";
      subscriptionCanceled = false;
      break;

    case "DID_CHANGE_RENEWAL_STATUS":
      // Auto-renew toggled. User keeps access until expiresDate.
      accountStatus = stillInPeriod ? "paid" : "expired";
      subscriptionCanceled = renewal?.autoRenewStatus === 0;
      break;

    case "EXPIRED":
    case "GRACE_PERIOD_EXPIRED":
      accountStatus = "expired";
      subscriptionCanceled = true;
      break;

    case "REFUND":
    case "REVOKE":
      accountStatus = "expired";
      subscriptionCanceled = true;
      break;

    case "DID_FAIL_TO_RENEW":
      // Billing retry; user keeps access until expiresDate.
      accountStatus = stillInPeriod ? "paid" : "expired";
      subscriptionCanceled = false;
      break;

    default:
      // Acknowledge unknown types without writing.
      return NextResponse.json({ ok: true, skipped: `unhandled type: ${type}` });
  }

  // 5. Persist (conflict-aware).
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const result = await writeSubscription(supabaseAdmin, {
      userId,
      provider: "apple",
      active: accountStatus === "paid",
      expiresAt: expiresAtIso,
      canceled: subscriptionCanceled,
      productId: transaction.productId ?? null,
      originalTransactionId: transaction.originalTransactionId ?? null,
      // Don't overwrite latest_receipt from notifications — verify-receipt is the source of truth.
    });
    if (!result.written) {
      // Conflict with another provider — ack so Apple stops retrying.
      return NextResponse.json({ ok: true, skipped: "provider_conflict" });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to persist";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, type });
}
