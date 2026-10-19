import { useEffect } from "react";
import type { ServerSetupGateProps } from "@core/components/startup/ServerSetupGate";
import { useAppConfig } from "@app/contexts/AppConfigContext";
import { ServerSetupWizard } from "@app/components/serverSetup/ServerSetupWizard";
import { SetupSignInScreen } from "@app/components/serverSetup/SetupScreen";
import {
  clearSetupSignIn,
  isSetupSignInPending,
} from "@app/components/serverSetup/setupSignInHandoff";

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

/** Keeps the automatic first sign-in's card up while startup checks load. */
export function ServerSetupLoading() {
  return isSetupSignInPending() ? <SetupSignInScreen /> : null;
}

export function ServerSetupGate({
  children,
  passwordChange,
  onPasswordChanged,
}: ServerSetupGateProps) {
  const pending = useServerSetupPending();
  const { config, loading, refetch } = useAppConfig();
  // The default login is an admin, so a config without isAdmin is still the
  // one from before sign-in.
  const signedInConfig = !loading && config?.isAdmin === true;
  // Straight after the automatic first sign-in, hold its card until the
  // signed-in config arrives rather than flash the editor, then let go.
  const holdingSignIn = !pending && !signedInConfig && isSetupSignInPending();

  useEffect(() => {
    if (signedInConfig && !pending) clearSetupSignIn();
  }, [signedInConfig, pending]);

  // Setup stays up until the server reports it complete, never on a local flag:
  // while it is pending StartupSetup holds back the forced password screen, so
  // showing the app early would let a default password through.
  if (holdingSignIn) return <SetupSignInScreen />;
  if (!pending) return <>{children}</>;
  return (
    <ServerSetupWizard
      passwordChange={passwordChange}
      onPasswordChanged={onPasswordChanged}
      onDone={() => void refetch()}
    />
  );
}
