import { useTranslation } from "react-i18next";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { Switch, Stack, Paper, Text, Group } from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
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
                "admin.settings.privacy.googleVisibility.label",
                "Google Visibility",
              )}{" "}
              <InfoTooltip
                label={t(
                  "admin.settings.privacy.googleVisibility.description",
                  "Allow search engines to index this application",
                )}
              />
            </Text>
          </div>
          <Group gap="xs">
            <Switch
              checked={settings?.googleVisibility || false}
              onChange={(e) => {
                if (!loginEnabled) return;
                setSettings({
                  ...settings,
                  googleVisibility: e.target.checked,
                });
              }}
              disabled={!loginEnabled}
              styles={getDisabledStyles()}
            />
            <PendingBadge show={isFieldPending("googleVisibility")} />
          </Group>
        </div>
      </Stack>
    </Paper>
  );
}
