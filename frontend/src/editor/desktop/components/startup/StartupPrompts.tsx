import type { ReactNode } from "react";

/**
 * Desktop override: the frame mounts the startup prompts once for both apps,
 * from the app's own config (see the desktop AppContentGate), so the cookie bar
 * and analytics follow the desktop app rather than whichever server the
 * Processor talks to. The editor's and the Processor's entries render only
 * what they wrap.
 */
export function StartupPrompts({ children }: { children?: ReactNode } = {}) {
  return <>{children}</>;
}
