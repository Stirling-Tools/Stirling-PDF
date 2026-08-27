import { useEffect, useState } from "react";
import { Paper, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { usePreferences } from "@app/contexts/PreferencesContext";
import type { LoginLandingView } from "@app/services/preferencesService";
import {
  fetchRootDestination,
  isPortalAvailable,
  loginLandingMode,
} from "@app/utils/loginLanding";
import { useProcessorEnabled } from "@app/hooks/useProcessorEnabled";

/**
 * Processor-user preference: where to land after signing in (processor vs
 * editor). Shown only to users who default to the processor (see
 * fetchRootDestination); hidden for members and solo users. Shared by all
 * flavors.
 */
export function LoginLandingSetting() {
  const { t } = useTranslation();
  const { preferences, updatePreference } = usePreferences();
  const processorEnabled = useProcessorEnabled();
  const [eligible, setEligible] = useState(false);

  // Only look up eligibility when the control could actually show; skip the
  // request entirely in soft-release / no-portal builds and on editor-only
  // servers, where "Processor" would name a product that isn't running.
  const active =
    processorEnabled && loginLandingMode() === "dynamic" && isPortalAvailable();
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void fetchRootDestination().then((destination) => {
      if (!cancelled) setEligible(destination === "processor");
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  if (!active || !eligible) {
    return null;
  }

  return (
    <Paper withBorder p="md" radius="md">
      <div
        id="setting-login-landing"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "1rem",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <Text fw={500} size="sm">
            {t("settings.general.loginLanding.title", "After signing in")}
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            {t(
              "settings.general.loginLanding.description",
              "Choose which app opens when you sign in.",
            )}
          </Text>
        </div>
        <SegmentedControl
          value={preferences.loginLandingView}
          onChange={(val: string) =>
            updatePreference("loginLandingView", val as LoginLandingView)
          }
          options={[
            {
              label: t("settings.general.loginLanding.processor", "Processor"),
              value: "processor",
            },
            {
              label: t("settings.general.loginLanding.editor", "Editor"),
              value: "editor",
            },
          ]}
        />
      </div>
    </Paper>
  );
}

export default LoginLandingSetting;
