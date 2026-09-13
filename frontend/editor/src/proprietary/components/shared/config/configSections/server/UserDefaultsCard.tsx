import { useTranslation } from "react-i18next";
import { Group, Stack, Paper, Text } from "@mantine/core";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import type { UiDefaultsCardProps } from "@app/components/shared/config/configSections/server/serverCardProps";
import type { ToolPanelMode } from "@app/constants/toolPanel";
import type { StartupView } from "@app/services/preferencesService";

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

  const toolPanelModeValue: ToolPanelMode =
    settings.defaultToolPanelMode === "fullscreen" ? "fullscreen" : "sidebar";
  const startupViewValue: StartupView =
    settings.defaultStartupView === "read" ||
    settings.defaultStartupView === "automate"
      ? settings.defaultStartupView
      : "tools";

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

        <div>
          <Text size="sm" fw={500} mb={4}>
            <Group gap="xs">
              <span>
                {t(
                  "admin.settings.general.defaultToolPickerMode.label",
                  "Default tool picker mode",
                )}
              </span>
              <PendingBadge show={isFieldPending("defaultToolPanelMode")} />
            </Group>
          </Text>
          <Text size="xs" c="dimmed" mb="xs">
            {t(
              "admin.settings.general.defaultToolPickerMode.description",
              "Choose whether the tool picker opens in fullscreen or sidebar by default",
            )}
          </Text>
          <SegmentedControl<ToolPanelMode>
            value={toolPanelModeValue}
            onChange={(value) => {
              if (!loginEnabled) return;
              setSettings({ ...settings, defaultToolPanelMode: value });
            }}
            options={[
              {
                label: t("settings.general.mode.sidebar", "Sidebar"),
                value: "sidebar",
              },
              {
                label: t("settings.general.mode.fullscreen", "Fullscreen"),
                value: "fullscreen",
              },
            ]}
            disabled={!loginEnabled}
          />
        </div>

        <div>
          <Text size="sm" fw={500} mb={4}>
            <Group gap="xs">
              <span>
                {t(
                  "admin.settings.general.defaultStartupView.label",
                  "Default view on launch",
                )}
              </span>
              <PendingBadge show={isFieldPending("defaultStartupView")} />
            </Group>
          </Text>
          <Text size="xs" c="dimmed" mb="xs">
            {t(
              "admin.settings.general.defaultStartupView.description",
              "Choose which view is active when the app starts",
            )}
          </Text>
          <SegmentedControl<StartupView>
            value={startupViewValue}
            onChange={(value) => {
              if (!loginEnabled) return;
              setSettings({ ...settings, defaultStartupView: value });
            }}
            options={[
              {
                label: t("settings.general.startupView.tools", "Tools"),
                value: "tools",
              },
              {
                label: t("settings.general.startupView.read", "Read"),
                value: "read",
              },
              {
                label: t("settings.general.startupView.automate", "Automate"),
                value: "automate",
              },
            ]}
            disabled={!loginEnabled}
          />
        </div>
      </Stack>
    </Paper>
  );
}
