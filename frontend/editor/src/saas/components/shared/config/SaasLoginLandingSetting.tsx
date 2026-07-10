import { Paper, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { usePreferences } from "@app/contexts/PreferencesContext";
import { useSaaSTeam } from "@app/contexts/SaaSTeamContext";
import type { LoginLandingView } from "@app/services/preferencesService";
import {
  isPortalAvailable,
  leadsRealTeam,
  loginLandingMode,
} from "@app/utils/loginLanding";

/**
 * Team-lead-only preference: where to land after signing in (processor vs
 * editor). Hidden for members and solo users, who can't reach the processor.
 */
export function SaasLoginLandingSetting() {
  const { t } = useTranslation();
  const { preferences, updatePreference } = usePreferences();
  const { teams } = useSaaSTeam();

  // Hidden unless the role-based landing is switched on (soft-release flag) and
  // the user is a real team lead with the processor available.
  if (
    loginLandingMode() !== "dynamic" ||
    !isPortalAvailable() ||
    !leadsRealTeam(teams)
  ) {
    return null;
  }

  return (
    <Paper withBorder p="md" radius="md">
      <div
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
              "Choose which app opens when you sign in to Stirling Cloud.",
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

export default SaasLoginLandingSetting;
