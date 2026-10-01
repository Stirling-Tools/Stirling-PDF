import type { ReactNode } from "react";

/** Hosted accounts use their identity provider's setup; there is no local server to configure. */
export function StartupSetup({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
