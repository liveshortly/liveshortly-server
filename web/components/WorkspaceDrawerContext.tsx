"use client";

import { createContext, useContext } from "react";

/**
 * Lets a page nested inside the workspace shell (notably the mobile session
 * topbar's hamburger) open/close the session-history drawer whose state lives in
 * `(workspace)/layout.tsx`. Null when there's no workspace around the page —
 * e.g. an anonymous viewer watching an open session link gets no drawer, so the
 * topbar falls back to a plain back link.
 */
export type WorkspaceDrawer = {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
};

/** The drawer's element id, for the toggles' aria-controls. */
export const SIDEBAR_ID = "ws-sidebar";

export const WorkspaceDrawerContext = createContext<WorkspaceDrawer | null>(
  null,
);

export function useWorkspaceDrawer(): WorkspaceDrawer | null {
  return useContext(WorkspaceDrawerContext);
}
