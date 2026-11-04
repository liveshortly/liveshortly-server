import { importSigningKey, mintKey, safeEqual, signRevoked, verifyWebhook, type Product } from "./crypto.ts";
import { sendKeys, type EmailEnv } from "./email.ts";

export interface Env extends EmailEnv {
  DB: D1Database;
  LICENSE_SIGNING_KEY: string;
  DODO_WEBHOOK_SECRET?: string;
  ISSUE_TOKEN?: string;
  FREE_TEST_LICENCES?: string;
  PRODUCT_POCKETAI_PRO?: string;
  PRODUCT_LS_PRO?: string;
}

// Minimal D1 surface we use (keeps tests runnable against node:sqlite).
interface D1Stmt {
  bind(...v: unknown[]): D1Stmt;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}
interface D1Database {
  prepare(sql: string): D1Stmt;
}

const YEAR_MS = 365 * 24 * 3600 * 1000;

export function mapProduct(env: Env, dodoProductId: string): Product | null {
  if (env.PRODUCT_POCKETAI_PRO && dodoProductId === env.PRODUCT_POCKETAI_PRO) return "pocketai-mac";
  if (env.PRODUCT_LS_PRO && dodoProductId === env.PRODUCT_LS_PRO) return "ls-pro";
  return null;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });

/** Mint, store and return a licence. ls-pro stacks on the buyer's latest active ls-pro expiry. */
async function issue(
  env: Env,
  o: { email: string; product: Product; provider: string; paymentId: string | null; days?: number | null },
) {
  const now = new Date();
  let expiry: Date | null = null;
  if (o.days) expiry = new Date(now.getTime() + o.days * 86400_000);
  else if (o.product === "ls-pro") {
    const row = await env.DB.prepare(
      "SELECT MAX(expiry) AS e FROM licenses WHERE email = ? AND product = 'ls-pro' AND status = 'active'",
    ).bind(o.email).first<{ e: string | null }>();
    const base = row?.e && Date.parse(row.e) > now.getTime() ? Date.parse(row.e) : now.getTime();
    expiry = new Date(base + YEAR_MS);
  }
  const lic = await mintKey(await importSigningKey(env.LICENSE_SIGNING_KEY), o.product, expiry, now);
  const r = await env.DB.prepare(
    "INSERT OR IGNORE INTO licenses (id, key, email, product, provider, provider_payment_id, created, expiry, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')",
  ).bind(lic.id, lic.key, o.email, o.product, o.provider, o.paymentId, lic.created, lic.expiry).run();
  return { ...lic, inserted: r.meta.changes > 0 };
}

export async function handleDodo(req: Request, env: Env): Promise<Response> {
  if (!env.DODO_WEBHOOK_SECRET) return json({ error: "webhook secret not configured" }, 503);
  const body = await req.text();
  if (!(await verifyWebhook(env.DODO_WEBHOOK_SECRET, req.headers, body))) return json({ error: "bad signature" }, 401);

  const eventId = req.headers.get("webhook-id")!;
  if (await env.DB.prepare("SELECT 1 FROM events WHERE provider_event_id = ?").bind(eventId).first())
    return json({ ok: true, duplicate: true });

  const evt = JSON.parse(body) as { type: string; data: any };
  const d = evt.data ?? {};
  switch (evt.type) {
    case "payment.succeeded": {
      const email = String(d.customer?.email ?? "").toLowerCase();
      const paymentId = String(d.payment_id ?? "");
      if (!email || !paymentId) return json({ error: "payment without email/payment_id" }, 400);
      for (const item of d.product_cart ?? []) {
        const product = mapProduct(env, item.product_id);
        if (!product) console.log(`unmapped product ${item.product_id} on ${paymentId}`);
        // UNIQUE(provider, payment, product) makes a replay a no-op even if the event row was lost.
        else await issue(env, { email, product, provider: "dodo", paymentId });
      }
      // Email every key of this payment; event is only recorded after this succeeds,
      // so a failed send is retried by Dodo.
      const { results } = await env.DB.prepare(
        "SELECT product, key, expiry FROM licenses WHERE provider = 'dodo' AND provider_payment_id = ?",
      ).bind(paymentId).all<{ product: string; key: string; expiry: string | null }>();
      await sendKeys(env, email, results);
      break;
    }
    case "refund.succeeded": // ponytail: any refund (incl. partial) revokes; refunds are manual (D139)
      await setStatus(env, d.payment_id, "refunded");
      break;
    case "dispute.opened":
    case "dispute.accepted":
    case "dispute.lost": // ponytail: dispute.won does not restore; re-issue via /issue if needed
      await setStatus(env, d.payment_id, "revoked");
      break;
    default:
      console.log(`ignored ${evt.type}`);
  }
  await env.DB.prepare("INSERT OR IGNORE INTO events (provider_event_id, received) VALUES (?, ?)")
    .bind(eventId, new Date().toISOString()).run();
  return json({ ok: true });
}

async function setStatus(env: Env, paymentId: unknown, status: "refunded" | "revoked") {
  if (!paymentId) return;
  await env.DB.prepare("UPDATE licenses SET status = ? WHERE provider = 'dodo' AND provider_payment_id = ?")
    .bind(status, String(paymentId)).run();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const PRODUCT_LABEL: Record<string, string> = { "pocketai-mac": "PocketAI Pro", "ls-pro": "LiveShortly Pro" };
const PRODUCT_STEPS: Record<string, string> = {
  "pocketai-mac": "On your Mac, open PocketAI &rsaquo; Settings &rsaquo; License and paste the key. It works offline.",
  "ls-pro": "On liveshortly.com, open Account &rsaquo; Licences and paste the key.",
};

// The page carries LiveShortly's design tokens (web/app/tokens.css) inline, so
// it matches the site without loading anything from it.
const THANKS_CSS = `
:root{--canvas:#f3f1e9;--surface:#faf9f4;--line:#e3e0d5;--fg:#1a1916;--fg-2:#55524a;--fg-3:#6a675e;--accent:#1f7a4d;--accent-fg:#fff;
--sans:-apple-system,BlinkMacSystemFont,"SF Pro Text",Inter,system-ui,"Segoe UI",sans-serif;--mono:"JetBrains Mono",ui-monospace,"SF Mono",Menlo,monospace;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--canvas:#121110;--surface:#1a1916;--line:#2c2a25;--fg:#ebe8e0;--fg-2:#a8a399;--fg-3:#8e8a81;--accent:#3db27e;--accent-fg:#0d0d0c;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--canvas);color:var(--fg);font:400 16px/1.5 var(--sans);-webkit-font-smoothing:antialiased}
main{max-width:36rem;margin:0 auto;padding:56px 16px}
.brand{font:600 14px/1 var(--sans);letter-spacing:.02em;color:var(--fg-2);text-decoration:none}.brand b{color:var(--accent)}
h1{font:700 28px/1.2 var(--sans);margin:28px 0 8px}p{margin:0 0 12px;color:var(--fg-2)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:20px;margin:24px 0}
.label{font:600 13px/1 var(--sans);text-transform:uppercase;letter-spacing:.06em;color:var(--fg-3);margin-bottom:10px}
.key{font:13px/1.5 var(--mono);word-break:break-all;background:var(--canvas);border:1px solid var(--line);border-radius:10px;padding:12px;user-select:all;color:var(--fg)}
.row{display:flex;gap:10px;align-items:center;margin-top:12px;flex-wrap:wrap}
button{font:600 14px/1 var(--sans);background:var(--accent);color:var(--accent-fg);border:0;border-radius:999px;padding:10px 16px;cursor:pointer}
.hint{font-size:14px;color:var(--fg-2);margin:0}.foot{font-size:13px;color:var(--fg-3);margin-top:32px}
.foot a,.pending a{color:var(--accent)}
`;

async function handleThanks(url: URL, env: Env): Promise<Response> {
  const paymentId = url.searchParams.get("payment_id") ?? "";
  const { results } = paymentId
    ? await env.DB.prepare(
        "SELECT product, key FROM licenses WHERE provider = 'dodo' AND provider_payment_id = ? AND status = 'active'",
      ).bind(paymentId).all<{ product: string; key: string }>()
    : { results: [] };
  const cards = results.map((r, i) => `
<section class="card">
  <div class="label">${esc(PRODUCT_LABEL[r.product] ?? r.product)} licence key</div>
  <div class="key" id="k${i}">${esc(r.key)}</div>
  <div class="row"><button type="button" data-copy="k${i}">Copy key</button>
  <p class="hint">${PRODUCT_STEPS[r.product] ?? ""}</p></div>
</section>`).join("");
  const body = results.length
    ? `<h1>Thank you</h1><p>Your purchase is complete. Keep this key somewhere safe; we've also emailed it to you.</p>${cards}`
    : `<h1>Thank you</h1><p class="pending">Your payment is being confirmed. Your key appears here in a few seconds, and it's emailed to you. <a href="">Refresh</a> if it doesn't show.</p>`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Thank you · PocketAI</title><style>${THANKS_CSS}</style></head><body><main>
<a class="brand" href="https://liveshortly.com"><b>●</b> LiveShortly · PocketAI</a>
${body}
<p class="foot">Lost your key? We can resend it to your purchase email. Refunds within 14 days: reply to the receipt email. <a href="https://liveshortly.com">liveshortly.com</a></p>
</main><script>
document.querySelectorAll("[data-copy]").forEach(b=>b.addEventListener("click",async()=>{
  const t=document.getElementById(b.dataset.copy).textContent;
  try{await navigator.clipboard.writeText(t);b.textContent="Copied";setTimeout(()=>b.textContent="Copy key",1500)}catch{}
}));
${results.length ? "" : "setTimeout(()=>location.reload(),5000);"}
</script></body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

async function handleRevoked(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare("SELECT id FROM licenses WHERE status != 'active' ORDER BY id").all<{ id: string }>();
  const body = await signRevoked(await importSigningKey(env.LICENSE_SIGNING_KEY), results.map((r) => r.id));
  return json(body, 200, { "Cache-Control": "public, max-age=3600" });
}

const RESEND_WINDOW_S = 3600;
const RESEND_LIMITS = { email: 3, ip: 10 };

async function handleResend(req: Request, env: Env): Promise<Response> {
  const { email: raw } = (await req.json().catch(() => ({}))) as { email?: string };
  const email = String(raw ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) return json({ error: "email required" }, 400);
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  const now = Math.floor(Date.now() / 1000);
  for (const [kind, subject] of [["email", `email:${email}`], ["ip", `ip:${ip}`]] as const) {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM resends WHERE subject = ? AND at > ?")
      .bind(subject, now - RESEND_WINDOW_S).first<{ n: number }>();
    if ((row?.n ?? 0) >= RESEND_LIMITS[kind]) return json({ error: "too many requests, try again later" }, 429);
  }
  await env.DB.prepare("INSERT INTO resends (subject, at) VALUES (?, ?), (?, ?)")
    .bind(`email:${email}`, now, `ip:${ip}`, now).run();
  await env.DB.prepare("DELETE FROM resends WHERE at < ?").bind(now - RESEND_WINDOW_S).run();
  const { results } = await env.DB.prepare(
    "SELECT product, key, expiry FROM licenses WHERE email = ? AND status = 'active'",
  ).bind(email).all<{ product: string; key: string; expiry: string | null }>();
  await sendKeys(env, email, results);
  // Same answer whether or not keys exist, so this can't be used to probe buyers.
  return json({ ok: true, message: "If that address has licences, they are on their way." });
}

async function handleIssue(req: Request, env: Env): Promise<Response> {
  const auth = req.headers.get("authorization") ?? "";
  if (!env.ISSUE_TOKEN || !(await safeEqual(auth, `Bearer ${env.ISSUE_TOKEN}`))) return json({ error: "unauthorized" }, 401);
  const b = (await req.json().catch(() => ({}))) as { email?: string; product?: string; days?: number };
  const email = String(b.email ?? "").trim().toLowerCase();
  const product = (b.product ?? "pocketai-mac") as Product;
  if (!email || !["pocketai-mac", "ls-pro"].includes(product)) return json({ error: "email and product (pocketai-mac|ls-pro) required" }, 400);
  if (b.days != null && !(Number.isFinite(b.days) && b.days > 0)) return json({ error: "days must be > 0" }, 400);
  const lic = await issue(env, { email, product, provider: "manual", paymentId: null, days: b.days ?? null });
  await sendKeys(env, email, [{ product, key: lic.key, expiry: lic.expiry }]);
  return json({ id: lic.id, key: lic.key, expiry: lic.expiry });
}

// Free 90-day test licences while PocketAI is in testing (owner, 2026-11-04).
// Only when FREE_TEST_LICENCES = "1" (test env); one active free key per
// email and product (asking again returns it), rate-limited per email and IP.
const FREE_DAYS = 90;
const FREE_LIMITS = { email: 3, ip: 5 };

async function handleFree(req: Request, env: Env): Promise<Response> {
  if (env.FREE_TEST_LICENCES !== "1") return json({ error: "free licences are not available" }, 404);
  const b = (await req.json().catch(() => ({}))) as { email?: string; product?: string };
  const email = String(b.email ?? "").trim().toLowerCase();
  const product = (b.product ?? "pocketai-mac") as Product;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "a valid email is required" }, 400);
  if (!["pocketai-mac", "ls-pro"].includes(product)) return json({ error: "unknown product" }, 400);
  const ip = req.headers.get("cf-connecting-ip") ?? "unknown";
  const now = Math.floor(Date.now() / 1000);
  for (const [kind, subject] of [["email", `free-email:${email}`], ["ip", `free-ip:${ip}`]] as const) {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM resends WHERE subject = ? AND at > ?")
      .bind(subject, now - 86400).first<{ n: number }>();
    if ((row?.n ?? 0) >= FREE_LIMITS[kind]) return json({ error: "too many requests today, try again tomorrow" }, 429);
  }
  await env.DB.prepare("INSERT INTO resends (subject, at) VALUES (?, ?), (?, ?)")
    .bind(`free-email:${email}`, now, `free-ip:${ip}`, now).run();
  const existing = await env.DB.prepare(
    "SELECT key, expiry FROM licenses WHERE email = ? AND product = ? AND provider = 'free' AND status = 'active' AND (expiry IS NULL OR expiry > ?) ORDER BY created DESC LIMIT 1",
  ).bind(email, product, new Date().toISOString()).first<{ key: string; expiry: string | null }>();
  if (existing) return json({ key: existing.key, expiry: existing.expiry, existing: true });
  const lic = await issue(env, { email, product, provider: "free", paymentId: null, days: FREE_DAYS });
  await sendKeys(env, email, [{ product, key: lic.key, expiry: lic.expiry }]);
  return json({ key: lic.key, expiry: lic.expiry });
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const route = `${req.method} ${url.pathname}`;
    try {
      switch (route) {
        case "GET /health": return json({ ok: true });
        case "POST /dodo": return await handleDodo(req, env);
        case "GET /thanks": return await handleThanks(url, env);
        case "GET /revoked.json": return await handleRevoked(env);
        case "POST /resend": return await handleResend(req, env);
        case "POST /issue": return await handleIssue(req, env);
        case "POST /free": return await handleFree(req, env);
        default: return json({ error: "not found" }, 404);
      }
    } catch (e) {
      console.error(route, e);
      return json({ error: "internal error" }, 500);
    }
  },
};
