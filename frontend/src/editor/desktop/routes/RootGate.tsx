import type { ReactNode } from "react";

/**
 * Desktop override: the editor owns the root (see the desktop EDITOR_BASENAME)
 * and the Processor opens from the rail, so "/" has nothing to route between.
 * Pass straight through.
 */
export function RootGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export default RootGate;
