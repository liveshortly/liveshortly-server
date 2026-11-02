"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import s from "./install.module.css";

const KEY = "ls.install.os";

/** Per-OS tabs. Every panel is in the server HTML (inactive ones `hidden`);
 *  the choice is remembered, and a first visit guesses from the browser. */
export default function OsTabs({
  tabs,
}: {
  tabs: { id: string; label: string; panel: ReactNode }[];
}) {
  const [active, setActive] = useState(tabs[0].id);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(KEY);
    } catch {}
    const ua = navigator.userAgent;
    const guess = /Windows/.test(ua) ? "windows" : /Linux|X11/.test(ua) && !/Android/.test(ua) ? "linux" : null;
    const pick = [saved, guess].find((id) => tabs.some((t) => t.id === id));
    if (pick) setActive(pick);
  }, [tabs]);

  const choose = (id: string) => {
    setActive(id);
    try {
      localStorage.setItem(KEY, id);
    } catch {}
  };

  const onKey = (e: React.KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    const n = (i + d + tabs.length) % tabs.length;
    choose(tabs[n].id);
    refs.current[n]?.focus();
  };

  return (
    <div>
      <div role="tablist" aria-label="Operating system" className={s.tabs}>
        {tabs.map((t, i) => (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`os-tab-${t.id}`}
            aria-controls={`os-panel-${t.id}`}
            aria-selected={active === t.id}
            tabIndex={active === t.id ? 0 : -1}
            className={s.tab}
            onClick={() => choose(t.id)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`os-panel-${t.id}`}
          aria-labelledby={`os-tab-${t.id}`}
          hidden={active !== t.id}
          className={s.panel}
        >
          {t.panel}
        </div>
      ))}
    </div>
  );
}
