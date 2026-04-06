import { createHash, createPublicKey, createVerify, X509Certificate } from "crypto";

/**
 * Apple Root CA - G3. Hardcoded; do not edit without re-verifying the fingerprint below.
 * Source: https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
 *
 * The fingerprint is checked on first use — any corruption (typo, line-ending change,
 * accidental edit) will throw loudly instead of silently breaking signature verification.
 */
const APPLE_ROOT_CA_G3_PEM = `-----BEGIN CERTIFICATE-----
MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwS
QXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9u
IEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcN
MTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBS
b290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9y
aXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49
AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtf
TjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517
IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySr
MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gA
MGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4
at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM
6BgD56KyKA==
-----END CERTIFICATE-----`;

const EXPECTED_FINGERPRINT_SHA256 =
  "63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79";

let _appleRoot: X509Certificate | null = null;
function getAppleRoot(): X509Certificate {
  if (_appleRoot) return _appleRoot;
  const cert = new X509Certificate(APPLE_ROOT_CA_G3_PEM);
  const fp = createHash("sha256").update(cert.raw).digest("hex").toUpperCase();
  const formatted = fp.match(/.{2}/g)!.join(":");
  if (formatted !== EXPECTED_FINGERPRINT_SHA256) {
    throw new Error(
      `Apple Root CA G3 fingerprint mismatch. Expected ${EXPECTED_FINGERPRINT_SHA256}, got ${formatted}. The hardcoded PEM in lib/appleJws.ts has been corrupted.`
    );
  }
  _appleRoot = cert;
  return cert;
}

function b64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(pad), "base64");
}

function derToPem(b64Der: string): string {
  const lines = b64Der.match(/.{1,64}/g)?.join("\n") ?? b64Der;
  return `-----BEGIN CERTIFICATE-----\n${lines}\n-----END CERTIFICATE-----`;
}

/**
 * Verifies an Apple JWS (App Store Server Notification V2 / signedTransactionInfo / signedRenewalInfo)
 * by:
 *   1. Parsing the x5c chain from the JWS protected header.
 *   2. Verifying the chain links up to Apple Root CA - G3.
 *   3. Verifying every cert in the chain is currently valid (notBefore/notAfter).
 *   4. Verifying the JWS signature with the leaf certificate's public key (ES256).
 *
 * Returns the decoded JSON payload on success, or throws.
 */
export function verifyAppleJws<T = Record<string, unknown>>(jws: string): T {
  const parts = jws.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWS format");
  const [headerB64, payloadB64, sigB64] = parts;

  const header = JSON.parse(b64urlDecode(headerB64).toString("utf8")) as {
    alg?: string;
    x5c?: string[];
  };
  if (header.alg !== "ES256") throw new Error(`Unsupported alg: ${header.alg}`);
  if (!header.x5c || header.x5c.length === 0) throw new Error("Missing x5c chain");

  const chain: X509Certificate[] = header.x5c.map((b64) => new X509Certificate(derToPem(b64)));

  const now = new Date();
  for (const cert of chain) {
    const notBefore = new Date(cert.validFrom);
    const notAfter = new Date(cert.validTo);
    if (now < notBefore || now > notAfter) {
      throw new Error(`Certificate expired or not yet valid: ${cert.subject}`);
    }
  }

  // Verify chain: each cert must be signed by the next; the last must be signed by Apple Root.
  for (let i = 0; i < chain.length - 1; i++) {
    if (!chain[i].verify(chain[i + 1].publicKey)) {
      throw new Error(`Chain verification failed at index ${i}`);
    }
  }
  if (!chain[chain.length - 1].verify(getAppleRoot().publicKey)) {
    throw new Error("Top of chain not signed by Apple Root CA - G3");
  }

  // Verify the JWS signature with the leaf cert's public key.
  // ES256 JWS signatures are raw R||S (64 bytes); Node's verifier expects DER-encoded ECDSA.
  const sigRaw = b64urlDecode(sigB64);
  if (sigRaw.length !== 64) throw new Error("Unexpected ES256 signature length");
  const r = sigRaw.subarray(0, 32);
  const s = sigRaw.subarray(32, 64);
  const sigDer = encodeEcdsaDer(r, s);

  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`, "ascii");
  const verifier = createVerify("SHA256");
  verifier.update(signingInput);
  verifier.end();
  const leafKey = createPublicKey(chain[0].publicKey.export({ type: "spki", format: "pem" }));
  const ok = verifier.verify(leafKey, sigDer);
  if (!ok) throw new Error("JWS signature verification failed");

  return JSON.parse(b64urlDecode(payloadB64).toString("utf8")) as T;
}

/** Encode raw R||S (each 32 bytes) into DER for Node's ECDSA verifier. */
function encodeEcdsaDer(r: Buffer, s: Buffer): Buffer {
  const trim = (buf: Buffer): Buffer => {
    let i = 0;
    while (i < buf.length - 1 && buf[i] === 0) i++;
    let out = buf.subarray(i);
    if (out[0] & 0x80) out = Buffer.concat([Buffer.from([0x00]), out]);
    return out;
  };
  const rT = trim(r);
  const sT = trim(s);
  const seqLen = 2 + rT.length + 2 + sT.length;
  return Buffer.concat([
    Buffer.from([0x30, seqLen]),
    Buffer.from([0x02, rT.length]),
    rT,
    Buffer.from([0x02, sT.length]),
    sT,
  ]);
}

// ---- Type helpers for Apple Server Notification V2 ----

export type AppleNotificationPayload = {
  notificationType?: string;
  subtype?: string;
  notificationUUID?: string;
  data?: {
    bundleId?: string;
    environment?: "Sandbox" | "Production";
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
  };
};

export type AppleTransactionInfo = {
  appAccountToken?: string;
  bundleId?: string;
  productId?: string;
  expiresDate?: number;
  originalTransactionId?: string;
  transactionId?: string;
  type?: string;
  revocationDate?: number;
  revocationReason?: number;
};

export type AppleRenewalInfo = {
  autoRenewStatus?: number;
  expirationIntent?: number;
  isInBillingRetryPeriod?: boolean;
  productId?: string;
};
