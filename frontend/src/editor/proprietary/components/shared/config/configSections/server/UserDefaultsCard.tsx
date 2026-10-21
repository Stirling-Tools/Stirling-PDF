import { useTranslation } from "react-i18next";
import { Stack, Paper } from "@mantine/core";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { SettingsToggleRow } from "@app/components/shared/config/SettingsToggleRow";
import PendingBadge from "@app/components/shared/config/PendingBadge";
import "@app/components/shared/config/SettingsToggleRow.css";
import type { UiDefaultsCardProps } from "@app/components/shared/config/configSections/server/serverCardProps";
import type { ToolPanelMode } from "@app/constants/toolPanel";
import type { StartupView } from "@app/services/preferencesService";

/**
 * Starting values for four per-user preferences. Its own `ui` draft, kept apart
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

  const toolPanelLabel = t(
    "settings.general.defaultToolPickerMode",
    "Default tool picker mode",
  );
  const startupViewLabel = t(
    "settings.general.defaultStartupView",
    "Default view on launch",
  );

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

        <div className="settings-toggle">
          <div className="settings-toggle__row">
            <span className="settings-toggle__label">
              <span className="settings-toggle__title">{toolPanelLabel}</span>
              <PendingBadge show={isFieldPending("defaultToolPanelMode")} />
              <InfoTooltip
                label={t(
                  "settings.general.defaultToolPickerModeDescription",
                  "Choose whether the tool picker opens in fullscreen or sidebar by default",
                )}
              />
            </span>
            <SegmentedControl<ToolPanelMode>
              className="settings-toggle__control"
              ariaLabel={toolPanelLabel}
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
        </div>

        <div className="settings-toggle">
          <div className="settings-toggle__row">
            <span className="settings-toggle__label">
              <span className="settings-toggle__title">{startupViewLabel}</span>
              <PendingBadge show={isFieldPending("defaultStartupView")} />
              <InfoTooltip
                label={t(
                  "settings.general.defaultStartupViewDescription",
                  "Choose which view is active when the app starts",
                )}
              />
            </span>
            <SegmentedControl<StartupView>
              className="settings-toggle__control"
              ariaLabel={startupViewLabel}
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
        </div>
      </Stack>
    </Paper>
  );
}
