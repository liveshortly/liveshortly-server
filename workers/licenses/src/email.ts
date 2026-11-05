// Email sender (Resend). Never throws: returns whether it was delivered to Resend. One retry after
// EMAIL_RETRY_MS (5 s), failures are logged without the key and counted in D1 `email_failures`.
import { renderKeyMail, type MailKind } from "./email-template.ts";

export interface KeyMail {
  product: string;
  key: string;
  expiry: string | null;
}

export interface EmailEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  EMAIL_RETRY_MS?: string;
  DB?: any;
}

async function post(env: EmailEnv, to: string, m: { subject: string; text: string; html?: string }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM || "PocketAI <licenses@liveshortly.com>", to: [to], ...m }),
  });
  if (!res.ok) throw new Error(`resend status ${res.status}`); // status only: never echo bodies or keys
}

/** Send one message with a single retry. Logs only the subject and error, never the body. */
export async function sendMail(env: EmailEnv, to: string, m: { subject: string; text: string; html?: string }): Promise<boolean> {
  if (!env.RESEND_API_KEY) {
    console.log(`[email:test-mode] not sent (no RESEND_API_KEY) subject=${m.subject}`);
    return false;
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await post(env, to, m);
      return true;
    } catch (e) {
      console.error(`email attempt ${attempt + 1} failed: ${(e as Error).message}`);
      if (attempt === 0) await new Promise((r) => setTimeout(r, Number(env.EMAIL_RETRY_MS ?? 5000)));
    }
  }
  try {
    await env.DB?.prepare(
      "INSERT INTO email_failures (id, count, last_at) VALUES (1, 1, ?) ON CONFLICT(id) DO UPDATE SET count = count + 1, last_at = excluded.last_at",
    ).bind(new Date().toISOString()).run();
  } catch (e) {
    console.error("email_failures counter failed", (e as Error).message);
  }
  return false;
}

/** One email per key (each product has its own subject and steps). True only if all were sent. */
export async function sendKeys(env: EmailEnv, to: string, keys: KeyMail[], kind: MailKind = "purchase"): Promise<boolean> {
  let ok = keys.length > 0;
  for (const k of keys) ok = (await sendMail(env, to, renderKeyMail(k.product, k.key, k.expiry, kind))) && ok;
  return ok;
}
