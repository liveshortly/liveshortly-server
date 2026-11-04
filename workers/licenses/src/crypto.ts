// Licence signing (format checked by pocket-trust::verify_license_key) and
// Standard Webhooks verification (Dodo). WebCrypto only, so it runs in the
// Worker and under `node --test` unchanged.

const enc = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64decode(s: string): Uint8Array {
  const std = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** LICENSE_SIGNING_KEY secret: PKCS#8 PEM (or bare base64 DER) Ed25519 private key. */
export async function importSigningKey(pem: string): Promise<CryptoKey> {
  const der = b64decode(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""));
  return crypto.subtle.importKey("pkcs8", der, { name: "Ed25519" }, false, ["sign"]);
}

async function sign(key: CryptoKey, message: string): Promise<string> {
  return b64url(new Uint8Array(await crypto.subtle.sign("Ed25519", key, enc.encode(message))));
}

export type Product = "pocketai-mac" | "ls-pro";

export interface Minted {
  id: string;
  key: string;
  created: string;
  expiry: string | null;
}

// COM-06: limits travel inside the signed key. pocket-trust ignores unknown fields.
const LIMITS: Record<Product, Record<string, number>> = {
  "pocketai-mac": { devices: 5 },
  "ls-pro": { storage_bytes: 1073741824, sessions: 100 },
};

/**
 * `key/<b64url(payload json)>.<b64url(Ed25519 over "key/<b64url payload>")>`
 * Field names match pocket-trust's LicensePayload.
 */
export async function mintKey(
  signingKey: CryptoKey,
  product: Product,
  expiry: Date | null,
  now = new Date(),
): Promise<Minted> {
  const id = crypto.randomUUID();
  const created = now.toISOString();
  const exp = expiry ? expiry.toISOString() : null;
  const payload = {
    account: { id: "pocketai" },
    product: { id: product },
    policy: { id: "pro", duration: null },
    license: { id, created, expiry: exp },
    limits: LIMITS[product],
  };
  const message = "key/" + b64url(enc.encode(JSON.stringify(payload)));
  return { id, key: `${message}.${await sign(signingKey, message)}`, created, expiry: exp };
}

/**
 * revoked.json: `{ids, issued, sig}` where
 * sig = b64url(Ed25519 over `revoked/<issued>/<ids joined by ",">`), same key as licences.
 */
export async function signRevoked(signingKey: CryptoKey, ids: string[], issued = new Date().toISOString()) {
  return { ids, issued, sig: await sign(signingKey, `revoked/${issued}/${ids.join(",")}`) };
}

/** Constant-time string compare (via SHA-256 digests so lengths don't leak). */
export async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([a, b].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))));
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let d = 0;
  for (let i = 0; i < u.length; i++) d |= u[i] ^ v[i];
  return d === 0;
}

export const WEBHOOK_TOLERANCE_S = 300;

/**
 * Standard Webhooks: signature header is space-separated `v1,<base64 HMAC-SHA256>`
 * over `{webhook-id}.{webhook-timestamp}.{raw body}`, key = base64 part of `whsec_...`.
 */
export async function verifyWebhook(
  secret: string,
  headers: Headers,
  body: string,
  nowS = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const id = headers.get("webhook-id");
  const ts = headers.get("webhook-timestamp");
  const sigs = headers.get("webhook-signature");
  if (!secret || !id || !ts || !sigs || !/^\d+$/.test(ts)) return false;
  if (Math.abs(nowS - Number(ts)) > WEBHOOK_TOLERANCE_S) return false;
  let keyBytes: Uint8Array;
  try {
    keyBytes = b64decode(secret.replace(/^whsec_/, ""));
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const data = enc.encode(`${id}.${ts}.${body}`);
  for (const part of sigs.split(" ")) {
    const [ver, sig] = part.split(",", 2);
    if (ver !== "v1" || !sig) continue;
    let sigBytes: Uint8Array;
    try {
      sigBytes = b64decode(sig);
    } catch {
      continue;
    }
    // subtle.verify compares in constant time
    if (await crypto.subtle.verify("HMAC", key, sigBytes, data)) return true;
  }
  return false;
}
