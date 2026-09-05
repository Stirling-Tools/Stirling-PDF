import { useId } from "react";
import { InfoTooltip } from "@app/ui/InfoTooltip";
import { Paper, Select, Stack, Switch, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { usePreferences } from "@app/contexts/PreferencesContext";
import type { ToolPanelMode } from "@app/constants/toolPanel";
import {
  type StartupView,
  type ViewerZoomSetting,
} from "@app/services/preferencesService";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@app/styles/zIndex";

/** What the editor opens with, and which tools it bothers to list. */
export function EditorDefaultsCard() {
  const { t } = useTranslation();
  // Each setting is a row of label text next to a bare control, so the controls
  // are named by pointing at that text rather than by a <label> association.
  const labelIds = useId();
  const viewerZoomLabelId = `${labelIds}-viewer-zoom`;
  const hideToolsLabelId = `${labelIds}-hide-tools`;
  const hideConversionsLabelId = `${labelIds}-hide-conversions`;
  const { preferences, updatePreference } = usePreferences();

  return (
    <Paper withBorder p="md" radius="md">
      <Stack gap="md">
        <div
          id="setting-tool-picker-mode"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={500} size="sm">
              {t(
                "settings.general.defaultToolPickerMode",
                "Default tool picker mode",
              )}{" "}
              <InfoTooltip
                label={t(
                  "settings.general.defaultToolPickerModeDescription",
                  "Choose whether the tool picker opens in fullscreen or sidebar by default",
                )}
              />
            </Text>
          </div>
          <SegmentedControl
            value={preferences.defaultToolPanelMode}
            onChange={(val: string) =>
              updatePreference("defaultToolPanelMode", val as ToolPanelMode)
            }
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
          />
        </div>
        <div
          id="setting-startup-view"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text fw={500} size="sm">
              {t(
                "settings.general.defaultStartupView",
                "Default view on launch",
              )}{" "}
              <InfoTooltip
                label={t(
                  "settings.general.defaultStartupViewDescription",
                  "Choose which view is active when the app starts",
                )}
              />
            </Text>
          </div>
          <SegmentedControl
            value={preferences.defaultStartupView}
            onChange={(val: string) =>
              updatePreference("defaultStartupView", val as StartupView)
            }
            options={[
              {
                label: t("settings.general.startupView.tools", "Tools"),
                value: "tools",
              },
              {
                label: t("settings.general.startupView.read", "Reader"),
                value: "read",
              },
              {
                label: t("settings.general.startupView.automate", "Automate"),
                value: "automate",
              },
            ]}
          />
        </div>
        <div
          id="setting-reader-zoom"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text id={viewerZoomLabelId} fw={500} size="sm">
              {t("settings.general.defaultViewerZoom", "Default reader zoom")}{" "}
              <InfoTooltip
                label={t(
                  "settings.general.defaultViewerZoomDescription",
                  "Set the default zoom level when opening PDFs in the reader",
                )}
              />
            </Text>
          </div>
          <Select
            aria-labelledby={viewerZoomLabelId}
            value={preferences.defaultViewerZoom}
            onChange={(val: string | null) => {
              if (val)
                updatePreference("defaultViewerZoom", val as ViewerZoomSetting);
            }}
            data={[
              {
                label: t("settings.general.zoomLevel.auto", "Auto"),
                value: "auto",
              },
              {
                label: t("settings.general.zoomLevel.fitWidth", "Fit width"),
                value: "fitWidth",
              },
              {
                label: t("settings.general.zoomLevel.fitPage", "Fit page"),
                value: "fitPage",
              },
              { label: "50%", value: "50" },
              { label: "75%", value: "75" },
              { label: "100%", value: "100" },
              { label: "125%", value: "125" },
              { label: "150%", value: "150" },
              { label: "200%", value: "200" },
            ]}
            style={{ width: 140 }}
            allowDeselect={false}
            comboboxProps={{
              withinPortal: true,
              zIndex: Z_INDEX_OVER_CONFIG_MODAL,
            }}
          />
        </div>
        <div
          id="setting-hide-unavailable-tools"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text id={hideToolsLabelId} fw={500} size="sm">
              {t(
                "settings.general.hideUnavailableTools",
                "Hide unavailable tools",
              )}{" "}
              <InfoTooltip
                label={t(
                  "settings.general.hideUnavailableToolsDescription",
                  "Remove tools that have been disabled by your server instead of showing them greyed out.",
                )}
              />
            </Text>
          </div>
          <Switch
            aria-labelledby={hideToolsLabelId}
            checked={preferences.hideUnavailableTools}
            onChange={(event) =>
              updatePreference(
                "hideUnavailableTools",
                event.currentTarget.checked,
              )
            }
          />
        </div>
        <div
          id="setting-hide-unavailable-conversions"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Text id={hideConversionsLabelId} fw={500} size="sm">
              {t(
                "settings.general.hideUnavailableConversions",
                "Hide unavailable conversions",
              )}{" "}
              <InfoTooltip
                label={t(
                  "settings.general.hideUnavailableConversionsDescription",
                  "Remove disabled conversion options in the Convert tool instead of showing them greyed out.",
                )}
              />
            </Text>
          </div>
          <Switch
            aria-labelledby={hideConversionsLabelId}
            checked={preferences.hideUnavailableConversions}
            onChange={(event) =>
              updatePreference(
                "hideUnavailableConversions",
                event.currentTarget.checked,
              )
            }
          />
        </div>
      </Stack>
    </Paper>
  );
}
