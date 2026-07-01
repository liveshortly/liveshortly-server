"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  PageHead,
  PanelBox,
  PlaceholderNote,
  PreviewBanner,
} from "@/components/preview";
import { getSession, type SessionDetail } from "@/lib/api";
import { summarizePayload, truncate } from "@/lib/utils";

/**
 * Blog Composer — Dev Story editor (design/blog-composer.html). 3 columns:
 * session source (REAL captured events you can reference), a prose editor
 * (local draft only — there is no composer backend yet, so nothing persists),
 * and publish settings (preview controls). Honest about not saving.
 */
export default function ComposePage() {
  const { id } = useParams<{ id: string }>();
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const ctrl = new AbortController();
    getSession(id, ctrl.signal)
      .then(setSession)
      .catch((e) => {
        if ((e as Error).name !== "AbortError")
          setErr("Could not load this session.");
      });
    return () => ctrl.abort();
  }, [id]);

  return (
    <div>
      <PageHead
        eyebrow="✎ BLOG COMPOSER"
        title="Compose a Dev Story"
        sub={session ? `from “${session.title || "untitled session"}”` : undefined}
        back={{ href: `/session/${id}`, label: "BACK TO SESSION" }}
      />

      <PreviewBanner>
        this editor is a design preview — drafts are not saved yet
      </PreviewBanner>

      {err ? (
        <div className="label" style={{ color: "var(--red)" }}>
          ⚠ {err}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 240px) minmax(0, 1fr) minmax(0, 260px)",
            gap: 16,
            alignItems: "start",
          }}
          className="compose-grid"
        >
          {/* LEFT — session source (real events) */}
          <PanelBox title="⌥ SESSION SOURCE" pad={false}>
            <div style={{ maxHeight: 520, overflowY: "auto" }}>
              {session == null ? (
                <div style={{ padding: 14 }}>
                  <PlaceholderNote label="LOADING…" />
                </div>
              ) : session.events.length === 0 ? (
                <div style={{ padding: 14 }}>
                  <PlaceholderNote label="NO EVENTS" />
                </div>
              ) : (
                session.events.slice(0, 60).map((e) => (
                  <div
                    key={e.id}
                    style={{
                      padding: "9px 12px",
                      borderBottom: "1px solid var(--hairline)",
                    }}
                  >
                    <div className="label" style={{ color: "var(--faint)" }}>
                      {e.event_type}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--muted)",
                        marginTop: 3,
                        lineHeight: 1.4,
                      }}
                    >
                      {truncate(summarizePayload(e.payload), 96)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </PanelBox>

          {/* CENTER — prose editor (local draft, not persisted) */}
          <div>
            <PanelBox
              title="✎ EDITOR"
              right={
                <span className="label" style={{ color: "var(--faint)" }}>
                  {draft.trim() ? `${draft.trim().split(/\s+/).length} words` : "draft"}
                </span>
              }
            >
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="# Write your dev story…&#10;&#10;Reference the session source on the left. Nothing here is saved yet — this is a design preview of the composer."
                spellCheck
                style={{
                  width: "100%",
                  minHeight: 420,
                  resize: "vertical",
                  border: "1px solid var(--hairline)",
                  background: "var(--bg)",
                  color: "var(--ink)",
                  fontFamily: "var(--font-mono)",
                  fontSize: 13,
                  lineHeight: 1.6,
                  padding: 12,
                  outline: "none",
                }}
              />
              <div className="label" style={{ color: "var(--amber)", marginTop: 8 }}>
                ◐ NOT SAVED — composer persistence is coming
              </div>
            </PanelBox>
          </div>

          {/* RIGHT — publish settings (preview controls) */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <PanelBox title="▲ PUBLISH">
              <Field label="Title">
                <input
                  defaultValue={session?.title ?? ""}
                  placeholder="Story title"
                  style={inputStyle}
                />
              </Field>
              <Field label="Visibility">
                <select style={inputStyle} defaultValue="private">
                  <option value="private">Private</option>
                  <option value="link">Anyone with the link</option>
                  <option value="public">Public feed</option>
                </select>
              </Field>
              <Field label="Tags">
                <input placeholder="go, sse, postgres" style={inputStyle} />
              </Field>
              <button
                type="button"
                disabled
                className="label"
                title="Composer backend coming soon"
                style={{
                  width: "100%",
                  marginTop: 6,
                  padding: "10px 12px",
                  border: "1px solid var(--hairline)",
                  background: "transparent",
                  color: "var(--faint)",
                  cursor: "not-allowed",
                }}
              >
                ▲ PUBLISH (COMING SOON)
              </button>
            </PanelBox>
            <PanelBox title="◱ COVER & SEO">
              <PlaceholderNote>
                Cover image and SEO preview will live here.
              </PlaceholderNote>
            </PanelBox>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--hairline)",
  background: "var(--bg)",
  color: "var(--ink)",
  fontFamily: "var(--font-mono)",
  fontSize: 12,
  padding: "8px 10px",
  outline: "none",
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block", marginBottom: 12 }}>
      <div className="label" style={{ marginBottom: 5 }}>
        {label}
      </div>
      {children}
    </label>
  );
}
