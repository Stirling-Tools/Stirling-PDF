import { Center, Loader, Stack, Text, Button } from "@mantine/core";
import { useTranslation } from "react-i18next";

interface DesktopStartupScreenProps {
  /** True once startup has exceeded the grace period without becoming ready. */
  timedOut?: boolean;
  /** Called when the user clicks Retry after a timeout. Omit to hide the button. */
  onRetry?: () => void;
}

/**
 * Full-window loading state shown before the editor mounts.
 *
 * Covers two phases that both block on something other than the UI itself:
 *  1. Initial auth/connection-mode check (fast, local).
 *  2. The bundled Java backend starting up (local/SaaS mode only — see
 *     AppProviders' `backendReady` calculation).
 *
 * AppProviders keeps the native window hidden (`visible: false` in
 * tauri.conf.json) until this screen's `!showStartupScreen` condition is
 * met, so the very first thing the user ever sees is either this screen or
 * the finished editor — never a blank/white window, a URL bar, or a
 * partially-initialized UI.
 */
export function DesktopStartupScreen({
  timedOut = false,
  onRetry,
}: DesktopStartupScreenProps) {
  const { t } = useTranslation();

  return (
    <Center
      style={{ height: "100vh", width: "100vw" }}
      data-testid="desktop-startup-screen"
    >
      <Stack align="center" gap="sm">
        <Text size="xl" fw={700}>
          PDF Elite
        </Text>
        {timedOut ? (
          <>
            <Text size="sm" c="dimmed" ta="center" maw={360}>
              {t(
                "desktopStartup.timeout",
                "The backend is taking longer than expected to start.",
              )}
            </Text>
            {onRetry && (
              <Button onClick={onRetry} variant="light" size="sm">
                {t("desktopStartup.retry", "Retry")}
              </Button>
            )}
          </>
        ) : (
          <>
            <Loader size="sm" />
            <Text size="sm" c="dimmed">
              {t("desktopStartup.starting", "Starting up…")}
            </Text>
          </>
        )}
      </Stack>
    </Center>
  );
}
