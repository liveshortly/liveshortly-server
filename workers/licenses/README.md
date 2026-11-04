# pocket-licenses (Cloudflare Worker)

Dodo Payments (merchant of record) webhook → mint an Ed25519-signed licence key →
store in D1 → email it. Design: getpocketai `strategy/07-qa-release-commerce.md`
(COM-05 v2, COM-06, COM-07).

- Account: **Rohitsehgal1994@gmail.com's Account** `f967de3e2bf49d36d3a9ff8669fed68a` (pinned in `wrangler.toml`). Never use any other account.
- Test: `https://licenses-test.getpocketai.app` (worker `pocket-licenses-test`, D1 `pocket-licenses-test`). Dodo **test mode** only.
- Production: `licenses.getpocketai.app` is defined but **not deployed**.

## Endpoints

| Route | What |
|---|---|
| `GET /health` | `{"ok":true}` |
| `POST /dodo` | Standard Webhooks signature check (5 min tolerance), dedupe on `webhook-id`, then: `payment.succeeded` → one key per mapped product in `product_cart`, email it; `refund.succeeded` → `refunded`; `dispute.opened` / `dispute.accepted` / `dispute.lost` → `revoked`. Returns 503 while `DODO_WEBHOOK_SECRET` is unset. |
| `GET /thanks?payment_id=…` | Shows the key(s) for that payment, or "check your email". Dodo appends `payment_id`, `status`, `email` to the redirect URL. |
| `GET /revoked.json` | Signed list of refunded/revoked licence ids (see format below). Cached 1 h. |
| `POST /resend {"email"}` | Re-emails that address's active keys. Max 3/h per email, 10/h per IP. Same answer whether or not keys exist. |
| `POST /issue` | Owner only, `Authorization: Bearer $ISSUE_TOKEN`. Body `{"email", "product": "pocketai-mac"\|"ls-pro", "days"?}`. Returns `{id, key, expiry}` and emails it. |

Product mapping (env vars in `wrangler.toml`): `PRODUCT_POCKETAI_PRO` → `pocketai-mac` (no expiry),
`PRODUCT_LS_PRO` → `ls-pro` (1 year, stacked on the buyer's latest active ls-pro expiry).

## Formats

**Licence key** (what `pocket-trust::verify_license_key` checks):
`key/<b64url(payload)>.<b64url(Ed25519 signature over the UTF-8 of "key/<b64url(payload)>")>`, no padding.

```json
{"account":{"id":"pocketai"},"product":{"id":"pocketai-mac"},"policy":{"id":"pro","duration":null},
 "license":{"id":"<uuid>","created":"<ISO UTC>","expiry":null},"limits":{"devices":5}}
```
`limits` (COM-06) is extra; pocket-trust ignores unknown fields. ls-pro: `product.id = "ls-pro"`,
`limits = {"storage_bytes":1073741824,"sessions":100}`.

**revoked.json** (new, nothing in pocket-trust parses it yet):
`{"ids":["<uuid>",…],"issued":"<ISO UTC>","sig":"<b64url>"}` where `sig` is Ed25519 (same licence key)
over the UTF-8 string `revoked/<issued>/<ids joined with ",">` (ids sorted). The app should verify `sig`,
then pass `ids` as `revoked_licenses`.

**Public key** for the app: `PUBLIC_KEY_TEST.txt` (hex, base64, Rust array). The app still has the
Keygen constants; COM-05 v2 swaps in this key and `account=pocketai`, `product=pocketai-mac`, `policy=pro`.

## Secrets (names only; `wrangler secret put NAME --env test`)

- `LICENSE_SIGNING_KEY`: Ed25519 PKCS#8 PEM. Offline backup `~/.pocketai/license-signing-key-test.pem`. Production gets its own key.
- `ISSUE_TOKEN`: bearer for `/issue`. Copy in `~/.pocketai/issue-token-test`. Replace with Cloudflare Access later.
- `DODO_WEBHOOK_SECRET`: `whsec_…` from Dodo. Unset = every webhook is rejected.
- `RESEND_API_KEY` (optional): unset = keys are logged (`wrangler tail --env test`) instead of emailed. `EMAIL_FROM` is a var.

## Rebuild from scratch

```sh
cd workers/licenses
wrangler whoami                                   # must list f967de3e…
node --test test/                                 # Node >= 23, no npm install
wrangler d1 create pocket-licenses-test           # put database_id in wrangler.toml [env.test]
wrangler d1 migrations apply pocket-licenses-test --env test --remote
# signing key (never print it):
umask 077; mkdir -p ~/.pocketai
node -e 'const c=require("crypto");const k=c.generateKeyPairSync("ed25519");process.stdout.write(k.privateKey.export({type:"pkcs8",format:"pem"}))' > ~/.pocketai/license-signing-key-test.pem
node -e 'const c=require("crypto");const p=c.createPublicKey(require("fs").readFileSync(process.argv[1]));console.log(Buffer.from(p.export({format:"jwk"}).x,"base64url").toString("hex"))' ~/.pocketai/license-signing-key-test.pem   # public key hex
node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("base64url"))' > ~/.pocketai/issue-token-test
wrangler deploy --env test
wrangler secret put LICENSE_SIGNING_KEY --env test < ~/.pocketai/license-signing-key-test.pem
wrangler secret put ISSUE_TOKEN --env test < ~/.pocketai/issue-token-test
curl https://licenses-test.getpocketai.app/health
curl -X POST https://licenses-test.getpocketai.app/issue -H "authorization: Bearer $(cat ~/.pocketai/issue-token-test)" \
  -d '{"email":"you@example.com","product":"pocketai-mac","days":90}'
wrangler tail --env test                          # live logs
```

Production (later): `wrangler d1 create pocket-licenses`, put its id in `[env.production]`, apply
migrations with `--env production --remote`, generate a **new** key to `~/.pocketai/license-signing-key-prod.pem`,
set the live Dodo product ids, put all secrets with `--env production`, then `wrangler deploy --env production`.

## Owner: remaining Dodo steps (test mode)

1. Product ids: confirm `PRODUCT_POCKETAI_PRO` / `PRODUCT_LS_PRO` in `wrangler.toml` `[env.test.vars]`
   (read from a screenshot, check `0` vs `O`), then `wrangler deploy --env test`.
2. Developers › Webhooks › Add endpoint: `https://licenses-test.getpocketai.app/dodo`, events
   `payment.succeeded`, `refund.succeeded`, `dispute.opened`, `dispute.accepted`, `dispute.lost`.
   Copy the signing secret, then `wrangler secret put DODO_WEBHOOK_SECRET --env test` (paste at the prompt).
3. Payment link / checkout redirect URL: `https://licenses-test.getpocketai.app/thanks`
   (Dodo appends `?payment_id=…&status=…&email=…`).
4. Buy with a Dodo test card, check `/thanks`, `wrangler tail --env test` (key is logged until Resend is set),
   then refund in the dashboard and check `/revoked.json`.
5. Email: create a Resend account, verify `getpocketai.app` (SPF/DKIM in Cloudflare DNS),
   `wrangler secret put RESEND_API_KEY --env test`.

## Known limits

- Any `refund.succeeded` (including partial) marks the licence refunded; refunds are manual (D139).
- `dispute.won` does not restore a revoked key; re-issue with `/issue`.
- `/thanks` trusts the unguessable `payment_id`; anyone holding the redirect URL sees the key.
- `activations` table is schema only (COM-06 device cap not built).
