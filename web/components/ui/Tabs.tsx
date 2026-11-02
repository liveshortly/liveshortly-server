"use client";

import { useRef, type KeyboardEvent } from "react";
import s from "./ui.module.css";

/**
 * A tablist (WAI-ARIA tabs): one tab in the Tab order, arrows/Home/End move
 * between tabs and select them. Renders only the tabs; the caller renders the
 * selected panel with role="tabpanel" and aria-labelledby={tabId(prefix, value)}.
 */
export default function Tabs<T extends string>({
  label,
  idPrefix,
  tabs,
  value,
  onChange,
}: {
  label: string;
  idPrefix: string;
  tabs: readonly { id: T; label: string }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const onKey = (e: KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value);
    const next =
      e.key === "ArrowRight" ? (i + 1) % tabs.length
      : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length
      : e.key === "Home" ? 0
      : e.key === "End" ? tabs.length - 1
      : -1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].id);
    list.current?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  };
  return (
    <div ref={list} role="tablist" aria-label={label} className={s.tabs} onKeyDown={onKey}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={tabId(idPrefix, t.id)}
          aria-selected={t.id === value}
          tabIndex={t.id === value ? 0 : -1}
          className={`${s.tab} t-callout`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export const tabId = (prefix: string, id: string) => `${prefix}-tab-${id}`;
