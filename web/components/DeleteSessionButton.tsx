"use client";

import ConfirmPopover from "@/components/ConfirmPopover";
import { deleteSession } from "@/lib/api";

/**
 * Owner-only "delete session" control. Deletion is permanent and irreversible
 * (it wipes the DB rows, Redis keys and the blob archive), so it confirms in a
 * popover before deleting. Calls onDeleted() on success.
 */
export default function DeleteSessionButton({
  id,
  onDeleted,
  compact = false,
}: {
  id: string;
  onDeleted?: () => void;
  compact?: boolean;
}) {
  return (
    <ConfirmPopover
      label="⌫ DELETE"
      triggerTitle="Delete this session permanently"
      message="Delete this session forever? This wipes its events, replay and archive — it can't be undone."
      confirmLabel="Delete forever"
      busyLabel="Deleting…"
      compact={compact}
      onConfirm={async () => {
        await deleteSession(id);
        onDeleted?.();
      }}
    />
  );
}
