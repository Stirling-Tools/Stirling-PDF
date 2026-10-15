import type { ServerSetupGateProps } from "@core/components/startup/ServerSetupGate";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { ServerSetupWizard } from "@app/components/serverSetup/ServerSetupWizard";

/**
 * Pending for an admin of a server with login on that has not finished setup.
 * Without login there is no admin and most of these settings do nothing, so
 * the wizard never shows. An older server that sends no flag is never pending.
 */
export function useServerSetupPending(): boolean {
  const { config } = useAppConfig();
  return (
    config?.enableLogin === true &&
    config.isAdmin === true &&
    config.setupCompleted === false
  );
}

export function ServerSetupGate({
  children,
  passwordChange,
  onPasswordChanged,
}: ServerSetupGateProps) {
  const pending = useServerSetupPending();
  const { refetch } = useAppConfig();

  // Setup stays up until the server reports it complete, never on a local flag:
  // while it is pending StartupSetup holds back the forced password screen, so
  // showing the app early would let a default password through.
  if (!pending) return <>{children}</>;
  return (
    <ServerSetupWizard
      passwordChange={passwordChange}
      onPasswordChanged={onPasswordChanged}
      onDone={() => void refetch()}
    />
  );
}
