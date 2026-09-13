import { useTranslation } from "react-i18next";
import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import { Stack, Paper } from "@mantine/core";
import type { PrivacyCardProps } from "@app/components/shared/config/configSections/security/securityCardProps";

/** Whether search engines are allowed to index this instance. */
export function SearchEngineVisibilityCard({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
  getDisabledStyles,
}: PrivacyCardProps) {
  const { t } = useTranslation();

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <SettingsToggleRow
          label={t(
            "admin.settings.privacy.googleVisibility.label",
            "Google Visibility",
          )}
          info={t(
            "admin.settings.privacy.googleVisibility.description",
            "Allow search engines to index this application",
          )}
          pending={isFieldPending("googleVisibility")}
          checked={settings?.googleVisibility || false}
          onChange={(checked) => {
            if (!loginEnabled) return;
            setSettings({
              ...settings,
              googleVisibility: checked,
            });
          }}
          disabled={!loginEnabled}
          styles={getDisabledStyles()}
        />
      </Stack>
    </Paper>
  );
}
