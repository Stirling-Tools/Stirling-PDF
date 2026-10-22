import { useTranslation } from "react-i18next";
import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import { Stack, Paper } from "@mantine/core";
import type { PrivacyCardProps } from "@app/components/shared/config/configSections/security/securityCardProps";

/** Anonymous product analytics and the performance metrics endpoint. */
export function AnalyticsTrackingCard({
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
            "admin.settings.privacy.enableAnalytics.label",
            "Enable Analytics",
          )}
          info={t(
            "admin.settings.privacy.enableAnalytics.description",
            "Collect anonymous usage analytics to help improve the application",
          )}
          pending={isFieldPending("enableAnalytics")}
          checked={settings?.enableAnalytics || false}
          onChange={(checked) => {
            if (!loginEnabled) return;
            setSettings({
              ...settings,
              enableAnalytics: checked,
            });
          }}
          disabled={!loginEnabled}
          styles={getDisabledStyles()}
        />

        <SettingsToggleRow
          label={t(
            "admin.settings.privacy.metricsEnabled.label",
            "Enable Metrics",
          )}
          info={t(
            "admin.settings.privacy.metricsEnabled.description",
            "Enable collection of performance and usage metrics",
          )}
          pending={isFieldPending("metricsEnabled")}
          checked={settings?.metricsEnabled || false}
          onChange={(checked) => {
            if (!loginEnabled) return;
            setSettings({
              ...settings,
              metricsEnabled: checked,
            });
          }}
          disabled={!loginEnabled}
          styles={getDisabledStyles()}
        />
      </Stack>
    </Paper>
  );
}
