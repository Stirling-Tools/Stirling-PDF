import type { ReactNode } from "react";

/** Whether first-run server setup is waiting on the current user. */
export function useServerSetupPending(): boolean {
  return false;
}

export interface ServerSetupGateProps {
  children: ReactNode;
  /** The account must replace its password; setup then opens on that card. */
  passwordChange?: { usingDefaultCredentials: boolean };
  /** Called once setup has set the new password. */
  onPasswordChanged?: () => void;
}

/** Shown while startup checks load; a build whose login hands over to setup
 *  keeps that hand-off's screen up. */
export function ServerSetupLoading() {
  return null;
}

/** Shows first-run server setup in place of the app while it is pending. */
export function ServerSetupGate({ children }: ServerSetupGateProps) {
  return <>{children}</>;
}
