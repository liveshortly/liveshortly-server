"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import Button from "./Button";
import Icon, { type IconName } from "./Icon";
import s from "./ui.module.css";

export type MenuItem = { label: string; onSelect: () => void; destructive?: boolean };

/**
 * A button that opens an action menu (role="menu"). Focus moves into the menu
 * on open; arrows / Home / End move between items (roving focus); Escape or
 * Tab closes it and Escape returns focus to the trigger; an outside click
 * closes it. With `icon` the trigger is icon-only and `label` is its name.
 */
export default function Menu({
  label,
  icon,
  items,
}: {
  label: string;
  icon?: IconName;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  const itemsEls = () =>
    Array.from(list.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]") ?? []);

  useEffect(() => {
    if (!open) return;
    itemsEls()[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onKey = (e: KeyboardEvent) => {
    const els = itemsEls();
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    const go = (n: number) => {
      e.preventDefault();
      els[(n + els.length) % els.length]?.focus();
    };
    if (e.key === "ArrowDown") go(i + 1);
    else if (e.key === "ArrowUp") go(i - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(els.length - 1);
    else if (e.key === "Escape") {
      setOpen(false);
      trigger.current?.focus();
    } else if (e.key === "Tab") setOpen(false);
  };

  return (
    <span ref={wrap} className={s.menuWrap}>
      <Button
        ref={trigger}
        variant="ghost"
        className={icon ? s.iconBtn : undefined}
        aria-label={icon ? label : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        {icon ? <Icon name={icon} /> : label}
      </Button>
      {open && (
        <ul ref={list} id={id} role="menu" aria-label={label} className={s.menu} onKeyDown={onKey}>
          {items.map((it) => (
            <li key={it.label} role="none">
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={`${s.menuItem} t-body${it.destructive ? ` ${s.menuItemDestructive}` : ""}`}
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                  it.onSelect();
                }}
              >
                {it.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  );
}
