import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Collapsible } from "@editor/ui/Collapsible";
import { Select } from "@editor/ui/Select";
import { Slider } from "@editor/ui/Slider";
import { ToggleSwitch } from "@editor/ui/ToggleSwitch";
import { useMeasurements } from "@editor/contexts/MeasurementContext";
import type {
  MeasurementLabelVisibility,
  MeasurementPrecision,
} from "@editor/utils/measurementTypes";
import {
  MAX_STROKE_WIDTH,
  MIN_STROKE_WIDTH,
  getUnitOptions,
} from "@editor/utils/measurementUtils";
import { ColorSwatches } from "@editor/tools/measure/ColorSwatches";
import styles from "@editor/tools/measure/Measure.module.css";

const PRECISION_OPTIONS = ["auto", "0", "1", "2", "3", "4"];

export function MeasureSettings() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useMeasurements();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible
      open={isOpen}
      onToggle={() => setIsOpen((open) => !open)}
      header={t("measure.settings.title", "Snapping and display")}
    >
      <div className={styles.settingsBody}>
        <ToggleSwitch
          size="sm"
          checked={settings.snapToPoints}
          onChange={(snapToPoints) => updateSettings({ snapToPoints })}
          label={t("measure.settings.snapPoints", "Snap to points and guides")}
        />
        <ToggleSwitch
          size="sm"
          checked={settings.snapToAngles}
          onChange={(snapToAngles) => updateSettings({ snapToAngles })}
          label={t("measure.settings.snapAngles", "Snap angles to 45° and 90°")}
        />

        <div className={styles.settingsGrid}>
          <label className={styles.numberField}>
            <span className={styles.numberFieldLabel}>
              {t("measure.settings.unit", "Units")}
            </span>
            <Select
              inputSize="sm"
              value={settings.displayUnit}
              onChange={(value) =>
                value && updateSettings({ displayUnit: value })
              }
              options={[
                {
                  value: "auto",
                  label: t("measure.settings.unitAuto", "Scale unit"),
                },
                ...getUnitOptions(t),
              ]}
            />
          </label>
          <label className={styles.numberField}>
            <span className={styles.numberFieldLabel}>
              {t("measure.settings.precision", "Decimals")}
            </span>
            <Select
              inputSize="sm"
              value={String(settings.precision)}
              onChange={(value) =>
                value &&
                updateSettings({
                  precision: (value === "auto"
                    ? "auto"
                    : Number(value)) satisfies MeasurementPrecision,
                })
              }
              options={PRECISION_OPTIONS.map((value) => ({
                value,
                label:
                  value === "auto"
                    ? t("measure.settings.precisionAuto", "Auto")
                    : value,
              }))}
            />
          </label>
        </div>

        <label className={styles.numberField}>
          <span className={styles.numberFieldLabel}>
            {t("measure.settings.labels", "Labels on the page")}
          </span>
          <Select
            inputSize="sm"
            value={settings.labelVisibility}
            onChange={(value) =>
              value &&
              updateSettings({
                labelVisibility: value as MeasurementLabelVisibility,
              })
            }
            options={[
              {
                value: "hideSmall",
                label: t("measure.settings.labelsAuto", "Where they fit"),
              },
              {
                value: "showAll",
                label: t("measure.settings.labelsAll", "Always"),
              },
              {
                value: "hideAll",
                label: t("measure.settings.labelsNone", "On hover only"),
              },
            ]}
          />
        </label>

        <div>
          <span className={styles.numberFieldLabel}>
            {t("measure.settings.newStyle", "New measurements")}
          </span>
          <div className={styles.styleRow}>
            <ColorSwatches
              value={settings.defaultColor}
              onChange={(defaultColor) => updateSettings({ defaultColor })}
            />
            <div className={styles.thickness}>
              <Slider
                inputSize="sm"
                min={MIN_STROKE_WIDTH}
                max={MAX_STROKE_WIDTH}
                step={0.5}
                value={settings.defaultStrokeWidth}
                onChange={(defaultStrokeWidth) =>
                  updateSettings({ defaultStrokeWidth })
                }
                aria-label={t(
                  "measure.settings.newWidth",
                  "Line thickness for new measurements",
                )}
              />
            </div>
          </div>
        </div>
      </div>
    </Collapsible>
  );
}
