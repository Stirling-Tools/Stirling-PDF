import { useTranslation } from "react-i18next";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { Stack, Paper, Group, Switch } from "@mantine/core";
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
              <InfoTooltip
                label={t(
                  "admin.settings.endpoints.defaultHideUnavailableTools.description",
                  "Remove disabled tools instead of showing them greyed out",
                )}
              />
            </Group>
          }
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
              <InfoTooltip
                label={t(
                  "admin.settings.endpoints.defaultHideUnavailableConversions.description",
                  "Remove disabled conversion options instead of showing them greyed out",
                )}
              />
            </Group>
          }
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
