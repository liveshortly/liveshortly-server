// node --test test/  (Node >= 23: runs .ts directly; node:sqlite stands in for D1)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { webcrypto } from "node:crypto";
import { b64decode, b64url, importSigningKey, mintKey, signRevoked, verifyWebhook } from "../src/crypto.ts";
import { renderKeyMail } from "../src/email-template.ts";
import worker, { mapProduct, type Env } from "../src/index.ts";

const enc = new TextEncoder();
console.log = () => {}; // silence test-mode email logs

async function keypair() {
  const kp = (await webcrypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const der = new Uint8Array(await webcrypto.subtle.exportKey("pkcs8", kp.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString("base64")}\n-----END PRIVATE KEY-----\n`;
  return { pem, pub: kp.publicKey };
}

// Verifier mirroring pocket-trust::verify_license_key (the Rust cross-check is in README).
async function verifyKey(key: string, pub: CryptoKey) {
  const dot = key.lastIndexOf(".");
  const message = key.slice(0, dot);
  assert.ok(message.startsWith("key/"));
  const ok = await webcrypto.subtle.verify("Ed25519", pub, b64decode(key.slice(dot + 1)), enc.encode(message));
  return ok ? JSON.parse(new TextDecoder().decode(b64decode(message.slice(4)))) : null;
}

function fakeD1() {
  const db = new DatabaseSync(":memory:");
  for (const f of ["0001_init", "0002_contacts"]) db.exec(readFileSync(new URL(`../migrations/${f}.sql`, import.meta.url), "utf8"));
  const stmt = (sql: string, args: unknown[] = []): any => ({
    bind: (...v: unknown[]) => stmt(sql, v),
    first: async () => db.prepare(sql).get(...(args as any[])) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args as any[])) }),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...(args as any[])).changes) } }),
  });
  return { prepare: (sql: string) => stmt(sql), raw: db };
}

const SECRET_BYTES = webcrypto.getRandomValues(new Uint8Array(24));
const WHSEC = "whsec_" + Buffer.from(SECRET_BYTES).toString("base64");

async function signedHeaders(body: string, id = "msg_1", ts = Math.floor(Date.now() / 1000), key = SECRET_BYTES) {
  const k = await webcrypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = Buffer.from(await webcrypto.subtle.sign("HMAC", k, enc.encode(`${id}.${ts}.${body}`))).toString("base64");
  return new Headers({ "webhook-id": id, "webhook-timestamp": String(ts), "webhook-signature": `v1,${sig}` });
}

test("mint + verify round trip, payload shape matches pocket-trust", async () => {
  const { pem, pub } = await keypair();
  const sk = await importSigningKey(pem);
  const lic = await mintKey(sk, "pocketai-mac", null);
  const p = await verifyKey(lic.key, pub);
  assert.deepEqual(p.account, { id: "pocketai" });
  assert.deepEqual(p.product, { id: "pocketai-mac" });
  assert.deepEqual(p.policy, { id: "pro", duration: null });
  assert.equal(p.license.id, lic.id);
  assert.equal(p.license.expiry, null);
  assert.match(lic.key, /^key\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  // tamper -> fails
  const t = lic.key.replace(/^key\/./, (m) => (m.endsWith("e") ? "key/f" : "key/e"));
  assert.equal(await verifyKey(t, pub), null);

  const rv = await signRevoked(sk, ["a", "b"], "2026-01-01T00:00:00.000Z");
  assert.ok(await webcrypto.subtle.verify("Ed25519", pub, b64decode(rv.sig), enc.encode("revoked/2026-01-01T00:00:00.000Z/a,b")));
});

test("standard webhooks signature: good, bad sig, old timestamp, multi-sig", async () => {
  const body = '{"type":"payment.succeeded"}';
  assert.ok(await verifyWebhook(WHSEC, await signedHeaders(body), body));
  assert.ok(!(await verifyWebhook(WHSEC, await signedHeaders(body), body + " ")), "body changed");
  assert.ok(!(await verifyWebhook(WHSEC, await signedHeaders(body, "msg_1", undefined, new Uint8Array(24)), body)), "wrong key");
  const old = Math.floor(Date.now() / 1000) - 301;
  assert.ok(!(await verifyWebhook(WHSEC, await signedHeaders(body, "msg_1", old), body)), "old timestamp");
  assert.ok(!(await verifyWebhook("", await signedHeaders(body), body)), "no secret");
  const h = await signedHeaders(body);
  h.set("webhook-signature", `v1,${b64url(new Uint8Array(32))} ${h.get("webhook-signature")}`);
  assert.ok(await verifyWebhook(WHSEC, h, body), "any matching v1 passes");
});

test("product mapping", () => {
  const env = { PRODUCT_POCKETAI_PRO: "pdt_a", PRODUCT_LS_PRO: "pdt_b" } as Env;
  assert.equal(mapProduct(env, "pdt_a"), "pocketai-mac");
  assert.equal(mapProduct(env, "pdt_b"), "ls-pro");
  assert.equal(mapProduct(env, "pdt_x"), null);
  assert.equal(mapProduct({} as Env, ""), null, "unset env maps nothing");
});

test("webhook flow: mint once (idempotent), refund revokes, unset secret rejects", async () => {
  const { pem, pub } = await keypair();
  const d1 = fakeD1();
  const env = { DB: d1, LICENSE_SIGNING_KEY: pem, DODO_WEBHOOK_SECRET: WHSEC, PRODUCT_POCKETAI_PRO: "pdt_a", PRODUCT_LS_PRO: "pdt_b" } as unknown as Env;
  const post = async (body: string, id: string, e = env) =>
    worker.fetch(new Request("https://x/dodo", { method: "POST", body, headers: await signedHeaders(body, id) }), e);

  const pay = JSON.stringify({
    type: "payment.succeeded",
    data: { payment_id: "pay_1", customer: { email: "A@b.co" }, product_cart: [{ product_id: "pdt_a" }, { product_id: "pdt_b" }] },
  });
  assert.equal((await post(pay, "evt_1")).status, 200);
  assert.deepEqual(await (await post(pay, "evt_1")).json(), { ok: true, duplicate: true });
  assert.equal((await post(pay, "evt_1_retry_new_id")).status, 200); // same payment, new event id
  const rows = d1.raw.prepare("SELECT * FROM licenses ORDER BY product").all() as any[];
  assert.equal(rows.length, 2, "one key per product per payment");
  assert.equal(rows[0].product, "ls-pro");
  assert.ok(Math.abs(Date.parse(rows[0].expiry) - Date.now() - 365 * 864e5) < 60e3, "ls-pro ~1y");
  assert.equal(rows[1].expiry, null);
  assert.equal(rows[1].email, "a@b.co");
  assert.ok(await verifyKey(rows[1].key, pub));

  const thanks = await (await worker.fetch(new Request("https://x/thanks?payment_id=pay_1"), env)).text();
  assert.ok(thanks.includes(rows[1].key));

  await post(JSON.stringify({ type: "refund.succeeded", data: { payment_id: "pay_1" } }), "evt_2");
  const rv = await (await worker.fetch(new Request("https://x/revoked.json"), env)).json();
  assert.deepEqual(rv.ids, rows.map((r) => r.id).sort());

  const bad = new Request("https://x/dodo", { method: "POST", body: pay, headers: await signedHeaders(pay, "evt_3", undefined, new Uint8Array(24)) });
  assert.equal((await worker.fetch(bad, env)).status, 401);
  assert.equal((await post(pay, "evt_4", { ...env, DODO_WEBHOOK_SECRET: "" } as Env)).status, 503);
});

test("issue requires token; resend is rate limited", async () => {
  const { pem, pub } = await keypair();
  const env = { DB: fakeD1(), LICENSE_SIGNING_KEY: pem, ISSUE_TOKEN: "t0k" } as unknown as Env;
  const issue = (auth: string) =>
    worker.fetch(new Request("https://x/issue", { method: "POST", headers: { authorization: auth }, body: '{"email":"o@x.co","days":90}' }), env);
  assert.equal((await issue("Bearer nope")).status, 401);
  const r = (await (await issue("Bearer t0k")).json()) as any;
  const p = await verifyKey(r.key, pub);
  assert.ok(Math.abs(Date.parse(p.license.expiry) - Date.now() - 90 * 864e5) < 60e3);

  const resend = () => worker.fetch(new Request("https://x/resend", { method: "POST", body: '{"email":"o@x.co"}' }), env);
  for (let i = 0; i < 3; i++) assert.equal((await resend()).status, 200);
  assert.equal((await resend()).status, 429);
});

// ---- COM-13 / COM-11 / COM-10 ----
const KEY = "key/eyJhIjoxfQ.sig_-9";
async function freeEnv(resendStatus = 200) {
  const { pem } = await keypair();
  const sent: any[] = [];
  const logs: string[] = [];
  const realFetch = globalThis.fetch, realLog = console.log, realErr = console.error;
  globalThis.fetch = (async (_u: any, init: any) => {
    sent.push(JSON.parse(init.body));
    return new Response("{}", { status: resendStatus });
  }) as any;
  console.log = (...a) => logs.push(a.join(" "));
  console.error = (...a) => logs.push(a.join(" "));
  const env = { DB: fakeD1(), LICENSE_SIGNING_KEY: pem, FREE_TEST_LICENCES: "1", RESEND_API_KEY: "re_x", EMAIL_RETRY_MS: "0", ISSUE_TOKEN: "t0k" } as unknown as Env;
  const free = (body: unknown, headers: Record<string, string> = {}) =>
    worker.fetch(new Request("https://x/free", { method: "POST", body: JSON.stringify(body), headers }), env);
  return { env, sent, logs, free, restore: () => { globalThis.fetch = realFetch; console.log = realLog; console.error = realErr; } };
}

test("/free twice sends two emails, same key, existing flag; contacts idempotent, opt-in default off", async () => {
  const t = await freeEnv();
  try {
    const a = (await (await t.free({ email: "U@x.co" })).json()) as any;
    const b = (await (await t.free({ email: "u@x.co", marketing_optin: true })).json()) as any;
    assert.equal(a.emailed, true);
    assert.equal(b.existing, true);
    assert.equal(b.key, a.key);
    assert.equal(t.sent.length, 2);
    assert.ok(t.sent[1].text.includes(a.key) && t.sent[1].html.includes(a.key));
    assert.equal(t.sent[0].subject, "Your PocketAI Pro licence key");
    const rows = (t.env.DB as any).raw.prepare("SELECT * FROM contacts").all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].email, "u@x.co");
    assert.equal(rows[0].marketing_optin, 1); // second call opted in
    const c = await t.free({ email: "n@x.co" });
    assert.equal((await c.json() as any).emailed, true);
    assert.equal((t.env.DB as any).raw.prepare("SELECT marketing_optin m FROM contacts WHERE email='n@x.co'").get().m, 0);
  } finally { t.restore(); }
});

test("Resend 403 still returns the key (emailed:false), counts the failure, key never logged", async () => {
  const t = await freeEnv(403);
  try {
    const r = await t.free({ email: "f@x.co" });
    assert.equal(r.status, 200);
    const j = (await r.json()) as any;
    assert.equal(j.emailed, false);
    assert.match(j.key, /^key\//);
    assert.equal(t.sent.length, 2, "one retry");
    assert.equal((t.env.DB as any).raw.prepare("SELECT count FROM email_failures").get().count, 1);
    assert.ok(t.logs.length > 0);
    assert.ok(!t.logs.some((l) => l.includes(j.key) || l.includes("re_x")), "no key or api key in logs");
  } finally { t.restore(); }
});

test("CORS: only the site origin (and localhost when allowed)", async () => {
  const t = await freeEnv();
  try {
    const pre = (o: string, env = t.env) => worker.fetch(new Request("https://x/free", { method: "OPTIONS", headers: { origin: o } }), env);
    const ok = await pre("https://pocket.liveshortly.com");
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get("access-control-allow-origin"), "https://pocket.liveshortly.com");
    assert.equal((await pre("https://evil.example")).status, 403);
    assert.equal((await pre("http://localhost:4000")).status, 403);
    assert.equal((await pre("http://localhost:4000", { ...t.env, ALLOW_LOCALHOST_CORS: "1" } as Env)).status, 204);
    const r = await t.free({ email: "c@x.co" }, { origin: "https://pocket.liveshortly.com" });
    assert.equal(r.headers.get("access-control-allow-origin"), "https://pocket.liveshortly.com");
    assert.equal((await t.free({ email: "d@x.co" }, { origin: "https://evil.example" })).headers.get("access-control-allow-origin"), null);
    assert.equal((t.env.DB as any).raw.prepare("SELECT source FROM contacts WHERE email='c@x.co'").get().source, "site-licence");
  } finally { t.restore(); }
});

test("contacts.csv needs the token and escapes; /forget removes the row via emailed link", async () => {
  const t = await freeEnv();
  try {
    await t.free({ email: 'we"ird,x@x.co' }); // passes regex, exercises escaping
    const get = (auth?: string) => worker.fetch(new Request("https://x/contacts.csv", { headers: auth ? { authorization: auth } : {} }), t.env);
    assert.equal((await get()).status, 401);
    assert.equal((await get("Bearer nope")).status, 401);
    const csv = await (await get("Bearer t0k")).text();
    assert.ok(csv.startsWith("email,source,product,first_seen,marketing_optin\r\n"));
    assert.ok(csv.includes('"we""ird,x@x.co",mac-app,pocketai-mac,'));

    t.sent.length = 0;
    await t.free({ email: "gone@x.co" });
    t.sent.length = 0;
    const fr = await worker.fetch(new Request("https://x/forget", { method: "POST", body: '{"email":"gone@x.co"}' }), t.env);
    assert.equal(fr.status, 200);
    const token = /token=([\w-]+)/.exec(t.sent[0].text)![1];
    assert.equal((await worker.fetch(new Request("https://x/forget", { method: "POST", body: '{"token":"bad"}' }), t.env)).status, 400);
    assert.equal((await worker.fetch(new Request("https://x/forget", { method: "POST", body: JSON.stringify({ token }) }), t.env)).status, 200);
    const raw = (t.env.DB as any).raw;
    assert.equal(raw.prepare("SELECT 1 FROM contacts WHERE email='gone@x.co'").get(), undefined);
    assert.equal(raw.prepare("SELECT COUNT(*) n FROM licenses WHERE email='gone@x.co'").get().n, 0);
    // unknown address: same answer, no mail
    t.sent.length = 0;
    await worker.fetch(new Request("https://x/forget", { method: "POST", body: '{"email":"nobody@x.co"}' }), t.env);
    assert.equal(t.sent.length, 0);
  } finally { t.restore(); }
});

test("renderKeyMail: exact key in html and text, null expiry, both products, escaping", () => {
  const m = renderKeyMail("pocketai-mac", KEY, null, "purchase");
  assert.equal(m.subject, "Your PocketAI Pro licence key");
  assert.ok(m.html.includes(`<code style="font:inherit;user-select:all">${KEY}</code>`));
  assert.ok(m.text.includes(`\n${KEY}\n`));
  assert.ok(m.html.includes("Never expires") && m.text.includes("Never expires"));
  assert.ok(m.html.includes("https://pocket.liveshortly.com/licence?key=") && m.html.includes("Open in PocketAI"));
  assert.ok(!/<img|pixel/i.test(m.html));
  const l = renderKeyMail("ls-pro", KEY, "2027-02-03T10:00:00.000Z", "resend");
  assert.equal(l.subject, "Your LiveShortly Pro licence key");
  assert.ok(l.html.includes("Valid until 3 Feb 2027") && !l.html.includes("Open in PocketAI"));
  const x = renderKeyMail('<b>"x"</b>', '<script>&"', null, "free");
  assert.ok(!x.html.includes("<script>") && !x.html.includes("<b>"));
  assert.ok(x.html.includes("&#60;script&#62;"));
});
