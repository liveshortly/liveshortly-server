"use client";

import { useState } from "react";
import { useAdminGuard } from "@/lib/useAdminGuard";
import Button, { IconButton } from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Chip from "@/components/ui/Chip";
import Dialog from "@/components/ui/Dialog";
import EmptyState from "@/components/ui/EmptyState";
import Icon, { ICONS } from "@/components/ui/Icon";
import Menu from "@/components/ui/Menu";
import SessionMark from "@/components/ui/SessionMark";
import Skeleton from "@/components/ui/Skeleton";
import StatusBadge, { type BadgeStatus } from "@/components/ui/StatusBadge";
import Tooltip from "@/components/ui/Tooltip";

const STATUSES: BadgeStatus[] = ["live", "ended", "private", "link", "public", "feed", "shared"];

/** Component catalogue (admin only): every library component, so new pages
 *  are built from it. Toggle the theme to check both. */
export default function DesignPage() {
  const phase = useAdminGuard();
  const [dialog, setDialog] = useState<"dialog" | "sheet" | null>(null);
  if (phase !== "ok") return null;

  const row = { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" } as const;
  return (
    <div style={{ display: "grid", gap: 32, padding: "32px 0" }}>
      <h1 className="t-display">Components</h1>

      <section style={{ display: "grid", gap: 12 }}>
        <h2 className="t-caption">Button</h2>
        <div style={row}>
          <Button>Hud</Button>
          <Button variant="prominent">Prominent</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="ghost">Ghost</Button>
          <Button busy>Saving</Button>
          <Button disabled>Disabled</Button>
          <IconButton icon="plus" label="New session" />
          <Menu
            label="Session actions"
            icon="ellipsis"
            items={[
              { label: "Rename", onSelect: () => {} },
              { label: "Share…", onSelect: () => {} },
              { label: "Delete", onSelect: () => {}, destructive: true },
            ]}
          />
          <Tooltip text="Tooltip text">
            <Button>Hover me</Button>
          </Tooltip>
        </div>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <h2 className="t-caption">Status</h2>
        <div style={row}>
          {STATUSES.map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
          <SessionMark live />
          <SessionMark live={false} />
          <SessionMark live size={34} />
          <Chip>claude-sonnet</Chip>
          <Chip filled>3</Chip>
        </div>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <h2 className="t-caption">Surfaces</h2>
        <div style={row}>
          <Card style={{ padding: 16 }}>Card</Card>
          <Card accent style={{ padding: 16 }}>
            Accent card
          </Card>
          <Button onClick={() => setDialog("dialog")}>Open dialog</Button>
          <Button onClick={() => setDialog("sheet")}>Open sheet</Button>
        </div>
        <Dialog
          open={dialog !== null}
          sheet={dialog === "sheet"}
          title={dialog === "sheet" ? "Share" : "End session"}
          onClose={() => setDialog(null)}
        >
          <p className="t-body">End “Fix the login bug”? The agent stops where it is.</p>
        </Dialog>
        <Card>
          <EmptyState icon="list.bullet" title="No sessions yet">
            Start one from the CLI and it shows up here.
          </EmptyState>
        </Card>
        <Card>
          <EmptyState icon="exclamationmark.triangle" title="Couldn’t load sessions" onRetry={() => {}}>
            Check your connection and try again.
          </EmptyState>
        </Card>
        <div style={{ display: "grid", gap: 6, maxWidth: 320 }}>
          <Skeleton width="40%" />
          <Skeleton width="70%" height={11} />
        </div>
      </section>

      <section style={{ display: "grid", gap: 12 }}>
        <h2 className="t-caption">Icons</h2>
        <div style={row}>
          {ICONS.map((n) => (
            <span key={n} title={n} style={{ display: "grid", justifyItems: "center", gap: 4, width: 96 }}>
              <Icon name={n} size={20} />
              <span className="t-footnote" style={{ color: "var(--fg-3)" }}>
                {n}
              </span>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
