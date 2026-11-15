"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { abortSession, loginUrl, postTyping } from "@/lib/api";
import Button from "@/components/ui/Button";
import Icon from "@/components/ui/Icon";
import s from "./session.module.css";

const MAX_IMAGES = 3;
const MAX_EDGE = 1024; // px on the long edge after downscale
const MAX_B64 = 1.5 * 1024 * 1024; // hard cap on the data-URL string length

/** Decode a File into an HTMLImageElement, revoking the object URL after. */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => (URL.revokeObjectURL(url), resolve(img));
    img.onerror = () => (URL.revokeObjectURL(url), reject(new Error("decode failed")));
    img.src = url;
  });
}

/** Downscale to MAX_EDGE on the long side and re-encode as JPEG, dropping
 *  quality once if the base64 is still over the cap. Returns null when even
 *  the smaller encode exceeds MAX_B64 (base64 is ~4/3 of the raw bytes, so the
 *  cap matters). */
async function resizeToDataUrl(file: File): Promise<string | null> {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, w, h);
  for (const q of [0.85, 0.6]) {
    const url = canvas.toDataURL("image/jpeg", q);
    if (url.length <= MAX_B64) return url;
  }
  return null;
}

/** Mac composer (LSChatView.composer): surface with a rule above, a
 *  multi-line field, a round green send button, the typing line and hint. */
export default function Composer({
  sessionId,
  typing,
  focusSignal,
  onSend,
  busy,
  canStop,
}: {
  sessionId: string;
  /** "X is typing…" line, or null. */
  typing: string | null;
  /** Bumped to pull focus (a fresh input request). */
  focusSignal?: string | null;
  /** Echoes optimistically and resolves false when the server refused it.
   *  `images` are data URLs the server forwards to the agent and strips from
   *  the stored event. */
  onSend: (text: string, images?: string[]) => Promise<boolean>;
  /** The agent is mid-action — swaps Send for Stop. */
  busy?: boolean;
  /** The viewer may stop the agent (owner + live). */
  canStop?: boolean;
}) {
  const [text, setText] = useState("");
  const [failed, setFailed] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  // Pasted images, resized + capped, as data URLs (max MAX_IMAGES). The raw
  // base64 is never shown — only the [Image #N] chips reference it.
  const [images, setImages] = useState<string[]>([]);
  const [imgErr, setImgErr] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const lastPing = useRef(0);
  const showStop = !!canStop && !!busy;

  const onPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.items)
      .filter((it) => it.kind === "file" && it.type.startsWith("image/"))
      .map((it) => it.getAsFile())
      .filter((f): f is File => !!f);
    if (files.length === 0) return; // let text/other pastes through untouched
    e.preventDefault();
    setImgErr(null);
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return setImgErr(`Up to ${MAX_IMAGES} images.`);
    if (files.length > room) setImgErr(`Up to ${MAX_IMAGES} images.`);
    const urls: string[] = [];
    for (const f of files.slice(0, room)) {
      try {
        const url = await resizeToDataUrl(f);
        if (url) urls.push(url);
        else setImgErr("That image is too large, even after resizing.");
      } catch {
        setImgErr("Couldn't read that image.");
      }
    }
    if (urls.length) setImages((cur) => [...cur, ...urls].slice(0, MAX_IMAGES));
  };

  const removeImage = (i: number) => setImages((cur) => cur.filter((_, idx) => idx !== i));

  const stop = useCallback(async () => {
    setStopping(true);
    try {
      await abortSession(sessionId);
    } catch {
      /* 409 ended / 502 undeliverable — the busy state resolves on its own */
    } finally {
      setStopping(false);
    }
  }, [sessionId]);

  // Esc (outside a text input) or ⌘/Ctrl+. stops the agent while it works.
  useEffect(() => {
    if (!showStop) return;
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const esc = e.key === "Escape" && el?.tagName !== "INPUT";
      const dot = (e.metaKey || e.ctrlKey) && e.key === ".";
      if (esc || dot) {
        e.preventDefault();
        void stop();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showStop, stop]);

  useEffect(() => {
    if (focusSignal) ref.current?.focus();
  }, [focusSignal]);

  // Grow with the content, capped by CSS max-height.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const send = async (msg = text) => {
    const body = msg.trim();
    // Natural-reading placeholders so the comment references its images.
    const tags = images.map((_, i) => `[Image #${i + 1}]`).join(" ");
    const out = [body, tags].filter(Boolean).join(" ");
    if (!out) return;
    // Capture the data URLs before clearing; the server strips them from the
    // stored event, keeping only the [Image #N] placeholders in the text.
    const imgs = images;
    setText("");
    setImages([]);
    setImgErr(null);
    setFailed(null);
    if (!(await onSend(out, imgs.length ? imgs : undefined))) setFailed(out);
  };

  return (
    <div className={s.composer}>
      {typing && <span className={`${s.muted} t-caption`}>{typing}</span>}
      {failed && (
        <div className={`${s.errText} ${s.composerErr} t-callout`} role="alert">
          Couldn&apos;t send your message.
          <Button variant="ghost" onClick={() => send(failed)}>
            Retry
          </Button>
        </div>
      )}
      {images.length > 0 && (
        <div className={s.imgChips}>
          {images.map((src, i) => (
            <span key={i} className={s.imgChip}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" className={s.imgThumb} />
              <span className="t-caption">Image #{i + 1}</span>
              <button
                type="button"
                className={s.imgRemove}
                onClick={() => removeImage(i)}
                aria-label={`Remove image ${i + 1}`}
                title="Remove"
              >
                <Icon name="xmark" size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      {imgErr && (
        <span className={`${s.errText} t-caption`} role="alert">
          {imgErr}
        </span>
      )}
      <div className={s.composerRow}>
        <textarea
          ref={ref}
          className={`${s.field} t-body`}
          rows={1}
          value={text}
          placeholder="Message this session…"
          aria-label="Message this session"
          onPaste={onPaste}
          onChange={(e) => {
            setText(e.target.value);
            const now = Date.now();
            if (e.target.value.trim() && now - lastPing.current > 3000) {
              lastPing.current = now;
              postTyping(sessionId);
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        {showStop ? (
          <button
            type="button"
            className={`${s.send} ${s.stop}`}
            disabled={stopping}
            onClick={() => void stop()}
            aria-label="Stop the agent"
            title="Stop (Esc)"
          >
            <Icon name="stop.fill" size={13} />
          </button>
        ) : (
          <button
            type="button"
            className={s.send}
            disabled={!text.trim() && images.length === 0}
            onClick={() => send()}
            aria-label="Send to this session"
            title="Send (⏎)"
          >
            <Icon name="arrow.up" size={14} />
          </button>
        )}
      </div>
      <span className={`${s.muted} t-caption ${s.hint}`}>
        {showStop
          ? "Esc (or ⌘.) stops the agent · ⏎ sends a message"
          : "⏎ send · ⇧⏎ newline · goes to the agent as a viewer message"}
      </span>
    </div>
  );
}

/** Footer in place of the composer when the viewer can't comment. */
export function ReadOnlyFooter({ ended, signedOut }: { ended: boolean; signedOut: boolean }) {
  return (
    <div className={`${s.footer} t-callout`}>
      {ended ? (
        "Session ended — read only."
      ) : signedOut ? (
        <>
          <span>Watching as a guest.</span>
          <a className={s.signIn} href={loginUrl()}>
            Sign in to comment
          </a>
        </>
      ) : (
        "Read only — you can watch but not comment."
      )}
    </div>
  );
}
