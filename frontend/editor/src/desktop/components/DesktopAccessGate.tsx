import { ReactNode, useEffect, useState } from "react";
import { Center, Loader, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { Button } from "@app/ui/Button";
import { SetupWizard } from "@app/components/SetupWizard";
import { authService } from "@app/services/authService";
import {
  ConnectionConfig,
  connectionModeService,
} from "@app/services/connectionModeService";

/** Withholds the workbench and background file handlers until managed sign-in succeeds. */
export function DesktopAccessGate({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [config, setConfig] = useState<ConnectionConfig | null>(null);
  const [configError, setConfigError] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [revision, setRevision] = useState(0);
  const [authRevision, setAuthRevision] = useState(0);

  useEffect(
    () =>
      authService.subscribeToAuth((status) => {
        if (status === "unauthenticated") setAllowed(false);
        setAuthRevision((value) => value + 1);
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void connectionModeService
      .getCurrentConfig()
      .then((value) => {
        if (!cancelled) {
          setConfig(value);
          setConfigError(false);
        }
      })
      .catch(() => {
        if (!cancelled) setConfigError(true);
      });
    const unsubscribe = connectionModeService.subscribeToModeChanges(
      (value) => {
        setAllowed(false);
        setConfig(value);
      },
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [revision]);

  useEffect(() => {
    if (!config?.require_sign_in) return;
    let cancelled = false;
    let running = false;
    const check = async () => {
      const token = await authService.getAuthToken().catch(() => null);
      if (cancelled) return;
      if (!token || authService.isTokenExpiringSoon(token, 0))
        setAllowed(false);
      if (running) return;
      running = true;
      const valid = await authService.hasManagedSession().catch(() => false);
      if (!cancelled) {
        setAllowed(valid);
        setChecking(false);
      }
      running = false;
    };
    void check();
    const interval = window.setInterval(() => void check(), 15000);
    window.addEventListener("focus", check);
    window.addEventListener("jwt-available", check);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("focus", check);
      window.removeEventListener("jwt-available", check);
    };
  }, [config, authRevision, revision]);

  if (configError)
    return (
      <Center h="100%">
        <Stack>
          <Text>
            {t(
              "setup.error.policyUnavailable",
              "Unable to load your organisation's sign-in settings.",
            )}
          </Text>
          <Button onClick={() => setRevision((value) => value + 1)}>
            {t("common.retry", "Retry")}
          </Button>
        </Stack>
      </Center>
    );
  if (!config || (config.require_sign_in && checking))
    return (
      <Center h="100%">
        <Loader />
      </Center>
    );
  if (config.require_sign_in && !allowed)
    return <SetupWizard onComplete={() => setRevision((value) => value + 1)} />;
  return children;
}
