import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Select } from "@mantine/core";
import { InfoTooltip } from "@editor/ui/InfoTooltip";
import PendingBadge from "@editor/components/shared/config/PendingBadge";
import { SettingsToggleRow } from "@editor/components/shared/config/SettingsToggleRow";
import "@editor/components/shared/config/SettingsToggleRow.css";
import type { GeneralCardProps } from "@editor/components/shared/config/configSections/server/serverCardProps";
import { useSaveModeOptions } from "@editor/hooks/useSaveModeOptions";
import { DEFAULT_SAVE_MODE } from "@editor/services/saveMode";
import { Z_INDEX_OVER_CONFIG_MODAL } from "@editor/styles/zIndex";

export function SaveModeDefaults({
  settings,
  setSettings,
  isFieldPending,
  loginEnabled,
}: GeneralCardProps) {
  const { t } = useTranslation();
  const labelId = useId();
  const options = useSaveModeOptions();

  return (
    <>
      <div className="settings-toggle">
        <div className="settings-toggle__row">
          <span className="settings-toggle__label">
            <span id={labelId} className="settings-toggle__title">
              {t(
                "admin.settings.general.saveMode.label",
                "When you save a file",
              )}
            </span>
            <PendingBadge show={isFieldPending("system.saveMode")} />
            <InfoTooltip
              label={t(
                "admin.settings.general.saveMode.description",
                "For a file that came from someone's computer or a connected drive. People start with this and can change it in their preferences.",
              )}
            />
          </span>
          <Select
            className="settings-toggle__control"
            aria-labelledby={labelId}
            value={settings.system?.saveMode || DEFAULT_SAVE_MODE}
            onChange={(value) =>
              setSettings({
                ...settings,
                system: {
                  ...settings.system,
                  saveMode: value || DEFAULT_SAVE_MODE,
                },
              })
            }
            data={options}
            allowDeselect={false}
            style={{ width: 210 }}
            comboboxProps={{
              withinPortal: true,
              zIndex: Z_INDEX_OVER_CONFIG_MODAL,
            }}
            disabled={!loginEnabled}
          />
        </div>
      </div>

      <SettingsToggleRow
        label={t(
          "admin.settings.general.allowUserSaveMode.label",
          "Let people choose this for themselves",
        )}
        info={t(
          "admin.settings.general.allowUserSaveMode.description",
          'Turn off to apply "When you save a file" to everyone.',
        )}
        pending={isFieldPending("system.allowUserSaveMode")}
        checked={settings.system?.allowUserSaveMode ?? true}
        onChange={(checked) =>
          setSettings({
            ...settings,
            system: { ...settings.system, allowUserSaveMode: checked },
          })
        }
        disabled={!loginEnabled}
      />
    </>
  );
}
