"use client";

import { useEffect, useState } from "react";
import GenAvatar from "@/components/Avatar";
import ConfirmPopover from "@/components/ConfirmPopover";
import { useAuth } from "@/components/AuthContext";
import { useHosts } from "@/components/HostsContext";
import { useTheme, type ThemeMode } from "@/components/ThemeProvider";
import { listTokens, revokeToken, type CliToken } from "@/lib/api";
import { timeAgo } from "@/lib/utils";
import styles from "./settings.module.css";

const SECTIONS = [
  ["account", "Account"],
  ["appearance", "Appearance"],
  ["notifications", "Notifications"],
  ["machines", "Machines"],
  ["connected", "Connected apps"],
] as const;

const THEMES: [ThemeMode, string][] = [
  ["system", "System"],
  ["light", "Light"],
  ["dark", "Dark"],
];

/**
 * Account settings. Only settings the server actually backs are shown; the
 * rest of LSW-17 (density, sharing defaults, API keys, export/delete) waits
 * for its API rather than shipping as dead controls.
 */
export default function SettingsPage() {
  const user = useAuth();
  const hosts = useHosts();
  const { mode, setMode } = useTheme();
  const [tokens, setTokens] = useState<CliToken[] | null>(null);
  const [tokErr, setTokErr] = useState(false);
  const [notif, setNotif] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    setNotif("Notification" in window ? Notification.permission : "unsupported");
    const ctrl = new AbortController();
    listTokens(ctrl.signal)
      .then(setTokens)
      .catch((e) => (e as Error).name !== "AbortError" && setTokErr(true));
    return () => ctrl.abort();
  }, []);

  const revoke = async (id: string) => {
    await revokeToken(id);
    setTokens((t) => t?.filter((x) => x.id !== id) ?? null);
  };

  return (
    <div className={styles.page}>
      <h1 className="t-display">Settings</h1>
      <nav aria-label="Settings sections" className={styles.toc}>
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="t-callout">
            {label}
          </a>
        ))}
      </nav>

      <section id="account" aria-labelledby="account-h" className={styles.section}>
        <h2 id="account-h" className="t-title">Account</h2>
        <div className={styles.account}>
          {user?.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.picture} alt="" width={56} height={56} className={styles.avatar} />
          ) : (
            <GenAvatar seed={user?.id ?? user?.name} size={56} title={user?.name ?? "Account"} />
          )}
          <dl className={styles.fields}>
            <dt className="t-caption">Name</dt>
            <dd className="t-body">{user?.name || "—"}</dd>
            <dt className="t-caption">Handle</dt>
            <dd className="t-mono">{user?.handle ? `@${user.handle}` : "—"}</dd>
            <dt className="t-caption">Email</dt>
            <dd className="t-body">{user?.email || "—"}</dd>
          </dl>
        </div>
        <p className={`t-callout ${styles.note}`}>
          Name, email and picture come from your Google account and update when you sign in.
        </p>
      </section>

      <section id="appearance" aria-labelledby="appearance-h" className={styles.section}>
        <h2 id="appearance-h" className="t-title">Appearance</h2>
        <fieldset className={styles.choices}>
          <legend className="t-headline">Theme</legend>
          {THEMES.map(([value, label]) => (
            <label key={value} className="t-body">
              <input
                type="radio"
                name="theme"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>
      </section>

      <section id="notifications" aria-labelledby="notifications-h" className={styles.section}>
        <h2 id="notifications-h" className="t-title">Notifications</h2>
        <div className={styles.row}>
          <div>
            <div className="t-headline">Browser notifications</div>
            <div className={`t-callout ${styles.note}`}>
              {notif === "granted"
                ? "On. Open sessions notify you when an agent needs approval."
                : notif === "denied"
                  ? "Blocked. Allow notifications for this site in your browser settings."
                  : notif === "unsupported"
                    ? "This browser does not support notifications."
                    : "Off. Turn on to hear about approval requests in open sessions."}
            </div>
          </div>
          {notif === "default" && (
            <button
              type="button"
              className={styles.button}
              onClick={async () => setNotif(await Notification.requestPermission())}
            >
              Turn on
            </button>
          )}
        </div>
      </section>

      <section id="machines" aria-labelledby="machines-h" className={styles.section}>
        <h2 id="machines-h" className="t-title">Machines</h2>
        <p className={`t-callout ${styles.note}`}>
          Machines running <code className="t-mono">live daemon</code> that are online now. To
          remove one, revoke its sign-in under Connected apps.
        </p>
        {hosts == null ? (
          <p className={`t-callout ${styles.note}`}>Checking…</p>
        ) : hosts.length === 0 ? (
          <p className={`t-callout ${styles.note}`}>No machines online.</p>
        ) : (
          <ul className={styles.list}>
            {hosts.map((h) => (
              <li key={h.id} className={styles.item}>
                <div className="t-headline">{h.name || h.hostname}</div>
                <div className={`t-callout ${styles.note}`}>
                  {h.os}/{h.arch} · {h.agents.join(", ") || "no agents"} · seen {timeAgo(h.seen_at)}
                </div>
                {h.dirs.length > 0 && (
                  <ul className={styles.dirs} aria-label={`Allowed directories on ${h.name || h.hostname}`}>
                    {h.dirs.map((d) => (
                      <li key={d} className="t-mono">{d}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section id="connected" aria-labelledby="connected-h" className={styles.section}>
        <h2 id="connected-h" className="t-title">Connected apps</h2>
        <p className={`t-callout ${styles.note}`}>
          CLIs and PocketAI devices signed in to your account. Revoking stops it refreshing; it is
          signed out within the hour.
        </p>
        {tokErr ? (
          <p role="alert" className={`t-callout ${styles.error}`}>Could not load connected apps.</p>
        ) : tokens == null ? (
          <p className={`t-callout ${styles.note}`}>Loading…</p>
        ) : tokens.length === 0 ? (
          <p className={`t-callout ${styles.note}`}>Nothing is signed in.</p>
        ) : (
          <ul className={styles.list}>
            {tokens.map((t) => (
              <li key={t.id} className={`${styles.item} ${styles.row}`}>
                <div>
                  <div className="t-headline">{t.label || "CLI"}</div>
                  <div className={`t-callout ${styles.note}`}>Last active {timeAgo(t.created_at)}</div>
                </div>
                <ConfirmPopover
                  label="Revoke"
                  message={`Sign out “${t.label || "CLI"}”? It will need to log in again.`}
                  confirmLabel="Revoke"
                  busyLabel="Revoking…"
                  onConfirm={() => revoke(t.id)}
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
