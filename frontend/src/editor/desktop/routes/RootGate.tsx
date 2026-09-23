import type { ReactNode } from "react";

/**
 * Desktop override: the desktop app ships no processor, so there is nothing for
 * "/" to route between and the editor simply owns the root (see the desktop
 * EDITOR_BASENAME). Pass straight through.
 */
export function RootGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export default RootGate;
