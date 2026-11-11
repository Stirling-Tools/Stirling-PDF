import type { ReactNode } from "react";

/** What the frame renders around both apps. The web has nothing to hold them back for. */
export function AppContentGate({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
