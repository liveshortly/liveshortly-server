"use client";

import { createContext, useContext } from "react";
import type { Me } from "@/lib/api";

/** The resolved principal from AuthGate's /api/me check, shared so nested
 *  layouts (e.g. the workspace shell) can read auth synchronously instead of
 *  re-fetching — which avoids remounting the page they wrap. `null` = anon. */
export const AuthContext = createContext<Me | null>(null);

export function useAuth(): Me | null {
  return useContext(AuthContext);
}
