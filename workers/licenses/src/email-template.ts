// COM-11: pure renderer for licence emails. Table layout + inline CSS (email clients ignore the rest),
// 560px, light + dark via prefers-color-scheme. No images, no tracking pixels, nothing hotlinked.

export type MailKind = "purchase" | "free" | "resend";

const PRODUCTS: Record<string, { name: string; app: boolean }> = {
  "pocketai-mac": { name: "PocketAI Pro", app: true },
  "ls-pro": { name: "LiveShortly Pro", app: false },
};
const SITE = "https://pocket.liveshortly.com";
const ACCENT = "#1E764A";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function plan(product: string, expiry: string | null, kind: MailKind) {
  const name = PRODUCTS[product]?.name ?? product;
  const d = expiry ? new Date(expiry) : null;
  const until = d && !isNaN(+d)
    ? `Valid until ${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })} ${d.getUTCFullYear()}`
    : "Never expires";
  return { name, pill: kind === "free" ? `Free test licence · ${until}` : until };
}

export function renderKeyMail(product: string, key: string, expiry: string | null, kind: MailKind = "purchase") {
  const { name, pill } = plan(product, expiry, kind);
  const app = PRODUCTS[product]?.app ?? false;
  const subject = `Your ${name} licence key`;
  const intro = kind === "free" ? "Here is your free test licence key." : kind === "resend" ? "As requested, here is your key again." : "Thanks for buying. Here is your key.";
  const steps = app
    ? ["Open PocketAI on your Mac", "Go to Settings → Licence", "Paste the key and press Activate"]
    : ["Sign in at liveshortly.com", "Go to Account → Licences", "Paste the key and press Add"];
  const why = kind === "purchase" ? "you bought a licence" : "a licence was requested for this address";
  const link = `${SITE}/licence?key=${encodeURIComponent(key)}`;
  const preheader = "Your key is inside. It works offline.";

  const text = [
    subject, "", intro, "", `${name} · ${pill}`, "", key, "",
    ...(app ? [`Open in PocketAI: ${link}`, ""] : []),
    ...steps.map((s, i) => `${i + 1}. ${s}`), "",
    "The key works offline; select it and copy.",
    "Refunds within 14 days: reply to this email. Support: " + SITE + "/support",
    `Sent because ${why}. licenses@liveshortly.com`,
  ].join("\n");

  const font = `-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`;
  const btn = app
    ? `<tr><td align="center" style="padding:20px 0 4px"><a href="${esc(link)}" style="display:inline-block;background:${ACCENT};color:#ffffff;font:600 16px/44px ${font};height:44px;padding:0 28px;border-radius:22px;text-decoration:none" class="btn">Open in PocketAI</a></td></tr>`
    : "";
  const stepRows = steps
    .map((s, i) => `<tr><td width="28" valign="top" style="padding:6px 0;font:600 15px/24px ${font};color:${ACCENT}">${i + 1}</td><td style="padding:6px 0;font:16px/24px ${font}" class="fg">${esc(s)}</td></tr>`)
    .join("");

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><title>${esc(subject)}</title>
<style>:root{color-scheme:light dark}@media (prefers-color-scheme:dark){.bg{background:#121110!important}.card{background:#1a1916!important;border-color:#2c2a25!important}.fg{color:#ebe8e0!important}.mut{color:#a8a399!important}.keybox{background:#121110!important;border-color:#2c2a25!important;color:#ebe8e0!important}.pill{background:#1d3a2c!important;color:#7fd6a8!important}.btn{background:#3db27e!important;color:#0d0d0c!important}}</style></head>
<body class="bg" style="margin:0;padding:0;background:#f3f1e9">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="bg" style="background:#f3f1e9"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px">
<tr><td style="padding:0 4px 16px;font:700 18px/1 ${font};color:#1a1916" class="fg"><span style="color:${ACCENT}">&#9679;</span>&nbsp; ${app ? "PocketAI" : "LiveShortly"}</td></tr>
<tr><td class="card" style="background:#ffffff;border:1px solid #e3e0d5;border-radius:16px;padding:28px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
<tr><td style="font:700 24px/1.25 ${font};color:#1a1916;padding-bottom:6px" class="fg">Your ${esc(name)} licence</td></tr>
<tr><td style="font:16px/1.5 ${font};color:#55524a;padding-bottom:18px" class="mut">${esc(intro)}</td></tr>
<tr><td style="padding-bottom:10px"><span class="pill" style="display:inline-block;background:#e4f2ea;color:${ACCENT};font:600 13px/1 ${font};padding:7px 12px;border-radius:999px">${esc(name)} · ${esc(pill)}</span></td></tr>
<tr><td class="keybox" style="background:#faf9f4;border:1px solid #e3e0d5;border-radius:12px;padding:14px;font:13px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:#1a1916;word-break:break-all"><code style="font:inherit;user-select:all">${esc(key)}</code></td></tr>
<tr><td style="font:14px/1.5 ${font};color:#6a675e;padding-top:8px" class="mut">Select the key and copy. It works offline.</td></tr>
${btn}
<tr><td style="padding-top:22px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${stepRows}</table></td></tr>
</table></td></tr>
<tr><td style="padding:18px 8px 0;font:13px/1.5 ${font};color:#6a675e" class="mut">Refunds within 14 days: just reply to this email. Need help? <a href="${SITE}/support" style="color:${ACCENT}">${SITE.replace("https://", "")}/support</a><br>Sent because ${why}. licenses@liveshortly.com</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, html, text };
}
