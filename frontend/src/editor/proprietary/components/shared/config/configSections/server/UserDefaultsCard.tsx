import { useTranslation } from "react-i18next";
import { Stack, Paper } from "@mantine/core";
import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import type { UiDefaultsCardProps } from "@app/components/shared/config/configSections/server/serverCardProps";

/**
 * Starting values for two per-user preferences. Its own `ui` draft, kept apart
 * from the System card's ui.* keys so each save still sends only what changed.
 */
export function UserDefaultsCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
}: UiDefaultsCardProps) {
  const { t } = useTranslation();

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <SettingsToggleRow
          label={t(
            "admin.settings.endpoints.defaultHideUnavailableTools.label",
            "Hide unavailable tools by default",
          )}
          info={t(
            "admin.settings.endpoints.defaultHideUnavailableTools.description",
            "Remove disabled tools instead of showing them greyed out",
          )}
          pending={isFieldPending("defaultHideUnavailableTools")}
          checked={settings.defaultHideUnavailableTools || false}
          onChange={(checked) => {
            if (!loginEnabled) return;
            setSettings({
              ...settings,
              defaultHideUnavailableTools: checked,
            });
          }}
          disabled={!loginEnabled}
        />

        <SettingsToggleRow
          label={t(
            "admin.settings.endpoints.defaultHideUnavailableConversions.label",
            "Hide unavailable conversions by default",
          )}
          info={t(
            "admin.settings.endpoints.defaultHideUnavailableConversions.description",
            "Remove disabled conversion options instead of showing them greyed out",
          )}
          pending={isFieldPending("defaultHideUnavailableConversions")}
          checked={settings.defaultHideUnavailableConversions || false}
          onChange={(checked) => {
            if (!loginEnabled) return;
            setSettings({
              ...settings,
              defaultHideUnavailableConversions: checked,
            });
          }}
          disabled={!loginEnabled}
        />
      </Stack>
    </Paper>
  );
}
