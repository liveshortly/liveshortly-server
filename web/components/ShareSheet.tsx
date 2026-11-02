"use client";

import { useEffect, useId, useState } from "react";
import FeedCard from "@/components/FeedCard";
import Button, { IconButton } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import Dialog from "@/components/ui/Dialog";
import {
  createShare,
  deleteShare,
  isOpenLink,
  isPublished,
  listShares,
  patchSession,
  publishSession,
  sessionViewUrl,
  unpublishSession,
  type Session,
  type ShareGrant,
  type ShareRole,
  type Visibility,
} from "@/lib/api";
import s from "./ShareSheet.module.css";

/** Strings match Mac LSShareSheet.swift. */
const LEVELS: { key: Visibility; title: string; blurb: string }[] = [
  { key: "private", title: "Private", blurb: "Only you and people you invite below." },
  { key: "link", title: "Anyone with the link", blurb: "Not listed anywhere; the link is the key." },
  { key: "public", title: "Public", blurb: "Anyone with the link, and it can appear on the feed." },
  { key: "open", title: "Open", blurb: "Readable without signing in at all." },
];
const RANK: Record<Visibility, number> = { private: 0, link: 1, public: 2, open: 3 };

/** What changing access does, spelled out before it happens. */
function consequence(to: Visibility, published: boolean): string {
  const offFeed = published && RANK[to] < RANK.public ? " It also comes off the public feed." : "";
  switch (to) {
    case "private":
      return `Only you and the people you invite can open it. Anyone else loses access now.${offFeed}`;
    case "link":
      return `Anyone signed in who has the link can open it and see everything the agent did.${offFeed}`;
    case "public":
      return "Anyone signed in who has the link can open it and see everything the agent did, and it can be listed on the feed.";
    case "open":
      return "Anyone with the link can read the whole session without signing in, and link previews show its title.";
  }
}

const RECENT_KEY = "ls.share.recent";
const readRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};
const rememberRecent = (email: string) => {
  try {
    const next = [email, ...readRecent().filter((x) => x.toLowerCase() !== email.toLowerCase())];
    localStorage.setItem(RECENT_KEY, JSON.stringify(next.slice(0, 30)));
  } catch {
    /* per-browser convenience only */
  }
};
const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

/** Copy text; flips a "Copied" label for 1.5 s. */
function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
      return true;
    } catch {
      return false;
    }
  };
  return { copied, copy };
}

const attr = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * The one Share sheet (LSW-07): Who can open it, Link, Public feed, Invited
 * people — the four cards of Mac LSShareSheet — plus a web footer (Share to 𝕏,
 * embed code, handoff command). Every widening of access waits for an explicit
 * Apply/Publish with its consequence spelled out. Non-owners get the link and
 * the footer only.
 */
export default function ShareSheet({
  session,
  owner,
  onChanged,
  onClose,
}: {
  session: Session | null;
  owner: boolean;
  onChanged?: (s: Session) => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={session !== null} onClose={onClose} title="Share session" sheet>
      {session && <Sheet key={session.id} initial={session} owner={owner} onChanged={onChanged} />}
    </Dialog>
  );
}

function Sheet({
  initial,
  owner,
  onChanged,
}: {
  initial: Session;
  owner: boolean;
  onChanged?: (s: Session) => void;
}) {
  const [cur, setCur] = useState(initial);
  const [draft, setDraft] = useState<Visibility>(initial.visibility ?? "private");
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { copied, copy } = useCopy();
  const ids = useId();

  const vis = cur.visibility ?? "private";
  const published = isPublished(cur);
  const url = sessionViewUrl(cur.id);
  const title = cur.title?.trim() || "Untitled session";

  const act = async (what: string, fn: () => Promise<Session>) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const u = await fn();
      setCur(u);
      setDraft(u.visibility ?? "private");
      onChanged?.(u);
      return true;
    } catch {
      setErr(`Couldn't ${what} — try again.`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const applyVisibility = () =>
    act("change access", async () => {
      // The feed lists anything with published_at, whatever its visibility, so
      // narrowing below Public must unpublish first (that also sets private).
      if (published && RANK[draft] < RANK.public) {
        const u = await unpublishSession(cur.id);
        return draft === "private" ? u : patchSession(cur.id, { visibility: draft });
      }
      return patchSession(cur.id, { visibility: draft });
    });

  const setLinkRole = (role: ShareRole) =>
    role !== cur.link_role && act("change the link role", () => patchSession(cur.id, { link_role: role }));

  const publish = async () => {
    const wasOpen = vis === "open";
    // Publishing sets visibility to public server-side; keep an Open link open.
    const ok = await act("update the feed", async () => {
      const u = await publishSession(cur.id);
      return wasOpen ? patchSession(cur.id, { visibility: "open" }) : u;
    });
    if (ok) setConfirmPublish(false);
  };

  const tweet = () => {
    const text = `${title} — by @${cur.owner_handle}, live on LiveShortly`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const embed = `<iframe src="${attr(`${origin}/replay/${encodeURIComponent(cur.id)}`)}" title="${attr(title)}" width="100%" height="480" style="border:0" loading="lazy"></iframe>`;
  const handoff = `live handoff ${cur.id}`;

  return (
    <div className={s.stack}>
      {owner && (
        <Card className={s.card}>
          <fieldset className={s.fieldset} disabled={busy}>
            <legend className="t-caption">Who can open it</legend>
            {LEVELS.map((o) => (
              <label key={o.key} className={s.option}>
                <input
                  type="radio"
                  name={`${ids}-vis`}
                  checked={draft === o.key}
                  onChange={() => setDraft(o.key)}
                />
                <span className={s.optionText}>
                  <span className="t-body">
                    {o.title}
                    {vis === o.key && <span className={`${s.muted} t-callout`}> · current</span>}
                  </span>
                  <span className={`${s.muted} t-callout`}>{o.blurb}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {draft !== vis && (
            <div className={s.confirm} role="group" aria-label="Confirm access change">
              <p className="t-callout">{consequence(draft, published)}</p>
              <div className={s.row}>
                <Button variant="ghost" onClick={() => setDraft(vis)}>
                  Cancel
                </Button>
                <Button
                  variant={RANK[draft] > RANK[vis] ? "prominent" : "hud"}
                  busy={busy}
                  onClick={applyVisibility}
                >
                  Make it {LEVELS.find((o) => o.key === draft)?.title.toLowerCase()}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card className={s.card}>
        <span className="t-caption">Link</span>
        <div className={s.linkBox}>
          <span className={`${s.mono} t-mono`} title={url}>
            {url}
          </span>
          <Button onClick={() => copy("link", url)}>{copied === "link" ? "Copied" : "Copy"}</Button>
        </div>
        {vis === "private" ? (
          <p className={`${s.muted} t-callout`}>The link only works for you until access is widened above.</p>
        ) : owner ? (
          <fieldset className={s.fieldset}>
            <legend className="t-callout">People with the link can</legend>
            <div className={s.row}>
              {(
                [
                  ["viewer", "Watch"],
                  ["commenter", "Watch and comment"],
                ] as const
              ).map(([role, label]) => (
                <label key={role} className={s.inline}>
                  <input
                    type="radio"
                    name={`${ids}-role`}
                    checked={(cur.link_role ?? "viewer") === role}
                    onChange={() => setLinkRole(role)}
                  />
                  <span className="t-body">{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
      </Card>

      {owner && (
        <Card className={s.card}>
          <div className={s.row}>
            <span className="t-caption">Public feed</span>
            <span className={s.spacer} />
            {published ? (
              <Button busy={busy} onClick={() => act("update the feed", () => unpublishSession(cur.id))}>
                Remove
              </Button>
            ) : (
              <Button variant="prominent" disabled={busy || confirmPublish} onClick={() => setConfirmPublish(true)}>
                Publish
              </Button>
            )}
          </div>
          <p className={`${s.muted} t-callout`}>
            {published
              ? "Listed on the LiveShortly feed where anyone can find it. Removing it also makes it private."
              : "Publishing lists this session on the public feed for anyone to find."}
          </p>
          {confirmPublish && !published && (
            <div className={s.confirm} role="group" aria-label="Confirm publish">
              <p className="t-callout">
                Anyone can find this card on the feed
                {RANK[vis] < RANK.public ? ", and access widens to Public: anyone signed in can open it" : ""}.
              </p>
              <div className={s.row}>
                <Button variant="ghost" onClick={() => setConfirmPublish(false)}>
                  Cancel
                </Button>
                <Button variant="prominent" busy={busy} onClick={publish}>
                  Publish to the feed
                </Button>
              </div>
            </div>
          )}
          <div className={s.preview} inert aria-hidden>
            <FeedCard session={cur} />
          </div>
        </Card>
      )}

      {owner && <InvitedPeople sessionId={cur.id} />}

      {err && (
        <p className={`${s.err} t-callout`} role="alert">
          {err}
        </p>
      )}

      <div className={s.footer}>
        <div className={s.row}>
          <Button onClick={tweet}>Share to 𝕏</Button>
          <Button disabled={!isOpenLink(cur)} onClick={() => copy("embed", embed)}>
            {copied === "embed" ? "Copied" : "Copy embed code"}
          </Button>
        </div>
        {!isOpenLink(cur) && (
          <p className={`${s.muted} t-callout`}>
            Only Open sessions can be embedded or watched from 𝕏 without signing in.
          </p>
        )}
        <span className="t-callout">Continue in your terminal:</span>
        <div className={s.linkBox}>
          <code className={`${s.mono} t-mono`}>{handoff}</code>
          <Button onClick={() => copy("handoff", handoff)}>{copied === "handoff" ? "Copied" : "Copy"}</Button>
        </div>
      </div>
    </div>
  );
}

/** Card 4: grants by email (owner only). */
function InvitedPeople({ sessionId }: { sessionId: string }) {
  const [grants, setGrants] = useState<ShareGrant[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    listShares(sessionId, ctrl.signal)
      .then((r) => setGrants(r.results ?? []))
      .catch((e) => (e as Error).name !== "AbortError" && setErr("Couldn't load invited people."));
    return () => ctrl.abort();
  }, [sessionId]);

  const invite = async (email: string, role: ShareRole) => {
    setErr(null);
    try {
      const g = await createShare(sessionId, email, role);
      setGrants((cur) => [...cur.filter((x) => x.grantee_email.toLowerCase() !== email.toLowerCase()), g]);
      return true;
    } catch {
      setErr(`Couldn't invite ${email} — try again.`);
      return false;
    }
  };

  const remove = async (g: ShareGrant) => {
    setErr(null);
    try {
      await deleteShare(sessionId, g.id);
      setGrants((cur) => cur.filter((x) => x.id !== g.id));
    } catch {
      setErr(`Couldn't remove access for ${g.grantee_email}.`);
    }
  };

  return (
    <Card className={s.card}>
      <span className="t-caption">Invited people · {grants.length}</span>
      <InviteForm onInvite={invite} known={grants.map((g) => g.grantee_email)} />
      {grants.length === 0 ? (
        <p className={`${s.muted} t-callout`}>Nobody has been invited by name yet.</p>
      ) : (
        <ul className={s.people}>
          {grants.map((g) => (
            <li key={g.id} className={s.person}>
              <span className={`${s.email} t-body`} title={g.grantee_email}>
                {g.grantee_email}
              </span>
              <Chip>{g.role === "commenter" ? "COMMENT" : "WATCH"}</Chip>
              <IconButton icon="xmark" label={`Remove access for ${g.grantee_email}`} onClick={() => remove(g)} />
            </li>
          ))}
        </ul>
      )}
      {err && (
        <p className={`${s.err} t-callout`} role="alert">
          {err}
        </p>
      )}
    </Card>
  );
}

/** Email (autocomplete from past invites) + role + Invite. */
function InviteForm({
  onInvite,
  known = [],
}: {
  onInvite: (email: string, role: ShareRole) => Promise<boolean> | void;
  known?: string[];
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const listId = useId();
  useEffect(() => setRecent(readRecent()), []);
  const addr = email.trim();
  const suggestions = [...new Set(recent)].filter((r) => !known.some((k) => k.toLowerCase() === r.toLowerCase()));

  return (
    <form
      className={s.invite}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!validEmail(addr) || busy) return;
        setBusy(true);
        const ok = await onInvite(addr, role);
        setBusy(false);
        if (ok !== false) {
          rememberRecent(addr);
          setRecent(readRecent());
          setEmail("");
        }
      }}
    >
      <input
        type="email"
        className={`${s.input} t-body`}
        placeholder="name@example.com"
        aria-label="Email to invite"
        autoComplete="off"
        list={listId}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <datalist id={listId}>
        {suggestions.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>
      <select
        className={`${s.input} t-body`}
        aria-label="Invited role"
        value={role}
        onChange={(e) => setRole(e.target.value as ShareRole)}
      >
        <option value="viewer">Watch</option>
        <option value="commenter">Comment</option>
      </select>
      <Button type="submit" variant="prominent" busy={busy} disabled={!validEmail(addr)} aria-label="Invite this person">
        Invite
      </Button>
    </form>
  );
}

/** Bulk share from the session list: the same sheet, invite card only. */
export function BulkShareSheet({
  count,
  onClose,
  onInvite,
}: {
  count: number | null;
  onClose: () => void;
  onInvite: (email: string, role: ShareRole) => void;
}) {
  return (
    <Dialog
      open={count !== null}
      onClose={onClose}
      title={`Share ${count ?? 0} session${count === 1 ? "" : "s"}`}
      sheet
    >
      <Card className={s.card}>
        <span className="t-caption">Invite people</span>
        <InviteForm onInvite={onInvite} />
        <p className={`${s.muted} t-callout`}>Each selected session gets the same invite.</p>
      </Card>
    </Dialog>
  );
}
