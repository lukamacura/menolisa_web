import { createHmac, timingSafeEqual } from "crypto";

function base64urlEncode(data: Buffer | string): string {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  return buf
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64urlDecodeToBuffer(s: string): Buffer {
  let base64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  if (pad) base64 += "=".repeat(4 - pad);
  return Buffer.from(base64, "base64");
}

export type MobileWebHandoffPayload = {
  uid: string;
  rt: string;
  exp: number;
  iat: number;
};

export function signMobileWebHandoffPayload(payload: MobileWebHandoffPayload, secret: string): string {
  const header = { alg: "HS256", typ: "JWT" };
  const enc = `${base64urlEncode(JSON.stringify(header))}.${base64urlEncode(JSON.stringify(payload))}`;
  const sig = createHmac("sha256", secret).update(enc).digest();
  return `${enc}.${base64urlEncode(sig)}`;
}

export function verifyMobileWebHandoffToken(
  token: string,
  secret: string
): MobileWebHandoffPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  if (!h || !p || !s) return null;
  const enc = `${h}.${p}`;
  const expected = createHmac("sha256", secret).update(enc).digest();
  let sigBuf: Buffer;
  try {
    sigBuf = base64urlDecodeToBuffer(s);
  } catch {
    return null;
  }
  if (sigBuf.length !== expected.length || !timingSafeEqual(sigBuf, expected)) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(base64urlDecodeToBuffer(p).toString("utf8"));
  } catch {
    return null;
  }

  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.uid !== "string" || typeof o.rt !== "string") return null;
  if (typeof o.exp !== "number" || typeof o.iat !== "number") return null;
  if (o.exp < Math.floor(Date.now() / 1000)) return null;

  return { uid: o.uid, rt: o.rt, exp: o.exp, iat: o.iat };
}
