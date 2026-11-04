"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import ConfirmPopover from "@/components/ConfirmPopover";
import {
  addLicence,
  ApiError,
  listLicences,
  me as fetchMe,
  removeLicence,
  type Licence,
  type Me,
} from "@/lib/api";
import { fmtBytes } from "@/lib/utils";
import styles from "../settings.module.css";

const PRODUCTS: Record<string, string> = {
  "ls-pro": "LiveShortly Pro",
  "pocketai-mac": "PocketAI Mac",
};

const planName = (p?: string) =>
  p === "ls_pro" ? "LiveShortly Pro" : p === "custom" ? "Custom" : "Free";

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: "medium" }) : "Never expires";

/** Account › Licences: add a LiveShortly Pro key, see the plan and its limits. */
export default function LicencesPage() {
  const [user, setUser] = useState<Me | null>(null);
  const [licences, setLicences] = useState<Licence[] | null>(null);
  const [loadErr, setLoadErr] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [m, l] = await Promise.all([fetchMe(signal), listLicences(signal)]);
      setUser(m);
      setLicences(l);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setLoadErr(true);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await addLicence(key.trim());
      setKey("");
      setMsg({ ok: true, text: `Licence added. You are on ${planName(r.plan)}.` });
      await load();
    } catch (err) {
      setMsg({
        ok: false,
        text: err instanceof ApiError ? err.message : "Could not add the licence. Try again.",
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await removeLicence(id);
    await load();
  };

  const sessionLimit = user?.session_limit ?? 0;
  const exempt = !!user?.quota_exempt;

  return (
    <div className={styles.page}>
      <Link href="/settings" className={`t-callout ${styles.back}`}>
        ← Settings
      </Link>
      <h1 className="t-display">Licences</h1>

      <section aria-labelledby="plan-h" className={styles.section}>
        <h2 id="plan-h" className="t-title">Your plan</h2>
        {user == null ? (
          <p className={`t-callout ${styles.note}`}>{loadErr ? "" : "Loading…"}</p>
        ) : (
          <>
            <p className="t-headline">{planName(user.plan)}</p>
            <p className={`t-body ${styles.note}`}>
              {exempt
                ? "This account has no storage or session limits."
                : `You can keep ${sessionLimit > 0 ? `up to ${sessionLimit} sessions` : "any number of sessions"} and ${fmtBytes(user.storage_limit_bytes ?? 0)} of session data. You have ${user.sessions ?? 0} sessions and ${fmtBytes(user.storage_bytes_used ?? 0)} stored now.`}
            </p>
            {/* Buy LiveShortly Pro: omitted until prices are live (LSW-44). No live links yet. */}
          </>
        )}
      </section>

      <section aria-labelledby="add-h" className={styles.section}>
        <h2 id="add-h" className="t-title">Add licence</h2>
        <form onSubmit={add}>
          <label htmlFor="licence-key" className="t-callout">
            Paste your LiveShortly Pro licence key
          </label>
          <textarea
            id="licence-key"
            className={`t-mono ${styles.keyInput}`}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="key/…"
            spellCheck={false}
            autoComplete="off"
            aria-describedby="licence-msg"
            required
          />
          <button type="submit" className={styles.button} disabled={busy || key.trim() === ""}>
            {busy ? "Checking…" : "Add licence"}
          </button>
        </form>
        <p
          id="licence-msg"
          role={msg?.ok === false ? "alert" : "status"}
          className={`t-callout ${msg?.ok === false ? styles.error : styles.note}`}
        >
          {msg?.text}
        </p>
      </section>

      <section aria-labelledby="list-h" className={styles.section}>
        <h2 id="list-h" className="t-title">Your licences</h2>
        {loadErr ? (
          <p role="alert" className={`t-callout ${styles.error}`}>Could not load your licences.</p>
        ) : licences == null ? (
          <p className={`t-callout ${styles.note}`}>Loading…</p>
        ) : licences.length === 0 ? (
          <p className={`t-callout ${styles.note}`}>No licences yet. You are on the Free plan.</p>
        ) : (
          <ul className={styles.list}>
            {licences.map((l) => (
              <li key={l.id} className={`${styles.item} ${styles.row}`}>
                <div>
                  <div className="t-headline">
                    {PRODUCTS[l.product] ?? l.product}{" "}
                    <span className="t-mono">…{l.last4}</span>
                  </div>
                  <div className={`t-callout ${styles.note}`}>
                    {l.status === "active"
                      ? `Active · ${l.expiry ? `expires ${fmtDate(l.expiry)}` : fmtDate(null)}`
                      : l.status === "expired"
                        ? `Expired ${fmtDate(l.expiry)}`
                        : "Revoked (refunded or disputed). Your data is kept; limits are back to Free."}
                  </div>
                </div>
                <ConfirmPopover
                  label="Remove"
                  message="Remove this licence? You can add the key again later."
                  confirmLabel="Remove"
                  busyLabel="Removing…"
                  onConfirm={() => remove(l.id)}
                  compact
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
