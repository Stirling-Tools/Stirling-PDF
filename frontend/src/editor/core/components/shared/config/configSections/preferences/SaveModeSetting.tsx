import { useId } from "react";
import { Select, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
import { useSaveMode } from "@editor/hooks/useSaveMode";
import { useSaveTargets } from "@editor/hooks/useSaveTargets";
import { useFileActionIcons } from "@editor/hooks/useFileActionIcons";
import { parseSaveMode, type SaveMode } from "@editor/services/saveMode";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@editor/styles/zIndex";

/** What Save does for a file that came from somewhere. */
export function SaveModeSetting() {
  const { t } = useTranslation();
  const labelId = useId();
  const { mode, locked, setMode } = useSaveMode();
  const targets = useSaveTargets();
  // Desktop files live on disk; on the web only a save target gives a file a home.
  const savesToDisk = Boolean(useFileActionIcons().saveAs);
  if (!savesToDisk && targets.length === 0) return null;

  const options: { value: SaveMode; label: string }[] = [
    { value: "replace", label: t("saveFile.mode.replace", "Update it") },
    { value: "copy", label: t("saveFile.mode.copy", "Save a copy next to it") },
    { value: "ask", label: t("saveFile.mode.ask", "Ask me") },
  ];

  return (
    <div
      id="setting-save-mode"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1rem",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <Text id={labelId} fw={500} size="sm">
          {t("settings.general.saveMode", "When I save a file")}{" "}
          <InfoTooltip
            label={t(
              "settings.general.saveModeDescription",
              "What Save does for a file that came from your computer or a connected drive. Other options are always in the menu next to Save.",
            )}
          />
        </Text>
        {locked && (
          <Text size="xs" c="dimmed">
            {t("settings.general.saveModeLocked", "Set by your administrator")}
          </Text>
        )}
      </div>
      <Select
        aria-labelledby={labelId}
        value={mode}
        onChange={(value) => {
          const next = parseSaveMode(value);
          if (next) setMode(next);
        }}
        data={options}
        disabled={locked}
        allowDeselect={false}
        style={{ width: 210 }}
        comboboxProps={{
          withinPortal: true,
          zIndex: Z_INDEX_OVER_CONFIG_MODAL,
        }}
      />
    </div>
  );
}
