import { useTranslation } from "react-i18next";
import { Switch, Stack, Paper, Text, Group } from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={500} size="sm">
              {t(
                "admin.settings.privacy.enableAnalytics.label",
                "Enable Analytics",
              )}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "admin.settings.privacy.enableAnalytics.description",
                "Collect anonymous usage analytics to help improve the application",
              )}
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings?.enableAnalytics || false}
              onChange={(e) => {
                if (!loginEnabled) return;
                setSettings({
                  ...settings,
                  enableAnalytics: e.target.checked,
                });
              }}
              disabled={!loginEnabled}
              styles={getDisabledStyles()}
            />
            <PendingBadge show={isFieldPending("enableAnalytics")} />
          </Group>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={500} size="sm">
              {t(
                "admin.settings.privacy.metricsEnabled.label",
                "Enable Metrics",
              )}
            </Text>
            <Text size="xs" c="dimmed" mt={4}>
              {t(
                "admin.settings.privacy.metricsEnabled.description",
                "Enable collection of performance and usage metrics",
              )}
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings?.metricsEnabled || false}
              onChange={(e) => {
                if (!loginEnabled) return;
                setSettings({
                  ...settings,
                  metricsEnabled: e.target.checked,
                });
              }}
              disabled={!loginEnabled}
              styles={getDisabledStyles()}
            />
            <PendingBadge show={isFieldPending("metricsEnabled")} />
          </Group>
        </div>
      </Stack>
    </Paper>
  );
}
