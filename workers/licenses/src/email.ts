// Email sender. Resend when RESEND_API_KEY is set; otherwise log and skip
// (test mode), so the purchase flow still works end to end.

export interface KeyMail {
  product: string;
  key: string;
  expiry: string | null;
}

export interface EmailEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
}

const NAMES: Record<string, string> = { "pocketai-mac": "PocketAI Pro (Mac)", "ls-pro": "LiveShortly Pro" };

export async function sendKeys(env: EmailEnv, to: string, keys: KeyMail[]): Promise<void> {
  if (!keys.length) return;
  const text = [
    "Thanks for your purchase. Your licence key(s):",
    "",
    ...keys.map((k) => `${NAMES[k.product] ?? k.product}${k.expiry ? ` (valid until ${k.expiry.slice(0, 10)})` : ""}:\n${k.key}\n`),
    "PocketAI: open Settings > License on your Mac and paste the key. It works offline.",
    "LiveShortly: liveshortly.com > Account > Licences.",
    "",
    "Refunds within 14 days: reply to this email.",
  ].join("\n");

  if (!env.RESEND_API_KEY) {
    console.log(`[email:test-mode] to=${to}\n${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM || "PocketAI <licenses@getpocketai.app>",
      to: [to],
      subject: "Your licence key",
      text,
    }),
  });
  if (!res.ok) throw new Error(`resend ${res.status}: ${await res.text()}`);
}
