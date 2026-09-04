import { useTranslation } from "react-i18next";
import { Stack, Paper, Text, Group, Switch } from "@mantine/core";
import PendingBadge from "@app/components/shared/config/PendingBadge";
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
        <Text size="xs" c="dimmed">
          {t(
            "admin.settings.endpoints.userDefaultsDescription",
            "Set default values for user preferences. Users can override these in their personal settings.",
          )}
        </Text>

        <Switch
          label={
            <Group gap="xs">
              <span>
                {t(
                  "admin.settings.endpoints.defaultHideUnavailableTools.label",
                  "Hide unavailable tools by default",
                )}
              </span>
              <PendingBadge
                show={isFieldPending("defaultHideUnavailableTools")}
              />
            </Group>
          }
          description={t(
            "admin.settings.endpoints.defaultHideUnavailableTools.description",
            "Remove disabled tools instead of showing them greyed out",
          )}
          checked={settings.defaultHideUnavailableTools || false}
          onChange={(e) => {
            if (!loginEnabled) return;
            setSettings({
              ...settings,
              defaultHideUnavailableTools: e.currentTarget.checked,
            });
          }}
          disabled={!loginEnabled}
        />

        <Switch
          label={
            <Group gap="xs">
              <span>
                {t(
                  "admin.settings.endpoints.defaultHideUnavailableConversions.label",
                  "Hide unavailable conversions by default",
                )}
              </span>
              <PendingBadge
                show={isFieldPending("defaultHideUnavailableConversions")}
              />
            </Group>
          }
          description={t(
            "admin.settings.endpoints.defaultHideUnavailableConversions.description",
            "Remove disabled conversion options instead of showing them greyed out",
          )}
          checked={settings.defaultHideUnavailableConversions || false}
          onChange={(e) => {
            if (!loginEnabled) return;
            setSettings({
              ...settings,
              defaultHideUnavailableConversions: e.currentTarget.checked,
            });
          }}
          disabled={!loginEnabled}
        />
      </Stack>
    </Paper>
  );
}
