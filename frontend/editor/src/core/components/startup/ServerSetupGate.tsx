import type { ReactNode } from "react";

/** Whether first-run server setup is waiting on the current user. */
export function useServerSetupPending(): boolean {
  return false;
}

export interface ServerSetupGateProps {
  children: ReactNode;
  /**
   * The signed-in account must replace its password. Setup then ends by
   * setting it, in place of the separate first-login password screen.
   */
  passwordChange?: { usingDefaultCredentials: boolean };
  /** Called once setup has set the new password. */
  onPasswordChanged?: () => void;
}

/** Shows first-run server setup in place of the app while it is pending. */
export function ServerSetupGate({ children }: ServerSetupGateProps) {
  return <>{children}</>;
}
