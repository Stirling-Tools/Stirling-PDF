import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon } from "@app/ui/ActionIcon";
import { Button } from "@app/ui/Button";
import { Icon } from "@app/ui/Icon";
import FitText from "@app/components/shared/FitText";
import { NumberInput } from "@app/ui/NumberInput";
import { SegmentedControl } from "@app/ui/SegmentedControl";
import { Select } from "@app/ui/Select";
import {
  useMeasurements,
  type ScaleTarget,
} from "@app/contexts/MeasurementContext";
import type { MeasureScale } from "@app/utils/measurementTypes";
import {
  calculateScaleFactor,
  convertUnit,
  generateScaleLabel,
  getUnitOptions,
  parsePresetRatio,
} from "@app/utils/measurementUtils";
import styles from "@app/tools/measure/Measure.module.css";

const PRESET_SCALES = [
  "1:1",
  "1:10",
  "1:20",
  "1:50",
  "1:100",
  "1:200",
  "1:500",
];
const PRESET_RATIOS = PRESET_SCALES.map(parsePresetRatio);

function ratioText(scale: MeasureScale): string {
  return generateScaleLabel(scale.ratio, scale.unit).replace(/ \(.*\)$/, "");
}

/**
 * Size step for the custom cell's text, by how long the ratio is: an input
 * cannot shrink its text to fit the way FitText does, and the cell is a
 * quarter of the panel wide.
 */
function customTextSize(value: number | string): "normal" | "long" | "longer" {
  const length = `1:${value}`.length;
  if (length <= 5) return "normal";
  return length <= 7 ? "long" : "longer";
}

interface MeasureScaleCardProps {
  currentPageIndex: number;
}

/**
 * The drawing scale for the page in view, collapsed to one line until the
 * user chooses to change it.
 */
export function MeasureScaleCard({ currentPageIndex }: MeasureScaleCardProps) {
  const { t } = useTranslation();
  const {
    fileScales,
    scaleForPage,
    setScale,
    scaleTargetKind,
    setScaleTargetKind,
    mode,
    setMode,
  } = useMeasurements();
  const [isEditing, setIsEditing] = useState(false);
  const pageNumber = currentPageIndex + 1;

  const target: ScaleTarget =
    scaleTargetKind === "page"
      ? { kind: "page", pageIndex: currentPageIndex }
      : { kind: "all" };
  const targetScale =
    target.kind === "page"
      ? (fileScales.pageScales[currentPageIndex] ?? null)
      : fileScales.defaultScale;
  const activeScale = scaleForPage(currentPageIndex);
  const pageOverride = fileScales.pageScales[currentPageIndex];

  const [unit, setUnit] = useState<string>(activeScale?.unit ?? "m");
  const [customRatio, setCustomRatio] = useState<number | string>("");
  const isCalibrating = mode === "calibrate";

  // The custom cell shows the current ratio whenever it is not a preset.
  const customRatioInUse =
    targetScale?.ratio != null && !PRESET_RATIOS.includes(targetScale.ratio)
      ? Number(targetScale.ratio.toFixed(2))
      : null;

  useEffect(() => {
    if (targetScale) setUnit(targetScale.unit);
  }, [targetScale]);

  useEffect(() => {
    setCustomRatio(customRatioInUse ?? "");
  }, [customRatioInUse]);

  const applyRatio = (ratio: number) => {
    setScale(
      { factor: calculateScaleFactor(ratio, unit), ratio, unit },
      target,
    );
  };

  const handleUnitChange = (next: string | null) => {
    if (!next) return;
    setUnit(next);
    if (!targetScale) return;
    const factor = convertUnit(targetScale.factor, targetScale.unit, next);
    if (factor !== null) {
      setScale({ factor, ratio: targetScale.ratio, unit: next }, target);
    }
  };

  const ratioValue =
    typeof customRatio === "number" ? customRatio : Number(customRatio);
  const isCustomRatioValid = Number.isFinite(ratioValue) && ratioValue > 0;
  const overrides = Object.entries(fileScales.pageScales)
    .map(([page, scale]) => ({ pageIndex: Number(page), scale }))
    .sort((a, b) => a.pageIndex - b.pageIndex);

  const source = pageOverride
    ? t("measure.scale.sourcePage", "Page {{page}} only", { page: pageNumber })
    : fileScales.defaultScale
      ? t("measure.scale.sourceAll", "All pages")
      : activeScale
        ? t("measure.scale.sourcePdf", "Set in the PDF")
        : t("measure.scale.sourceNone", "Measuring paper size");

  return (
    <section className={styles.card}>
      <div className={styles.scaleSummary}>
        <div className={styles.scaleSummaryText}>
          <span className={styles.eyebrow}>
            {t("measure.scale.title", "Scale")}
          </span>
          <span className={styles.scaleValue}>
            {activeScale ? (
              <>
                {ratioText(activeScale)}
                <span className={styles.scaleUnit}>{activeScale.unit}</span>
              </>
            ) : (
              t("measure.scale.notSet", "Not set")
            )}
          </span>
          <span className={styles.scaleSource}>{source}</span>
        </div>
        <Button
          size="sm"
          variant={activeScale || isEditing ? "secondary" : "primary"}
          onClick={() => setIsEditing((open) => !open)}
        >
          {isEditing
            ? t("measure.scale.done", "Done")
            : activeScale
              ? t("measure.scale.change", "Change")
              : t("measure.scale.set", "Set scale")}
        </Button>
      </div>

      {isEditing && (
        <div className={styles.scaleEditor}>
          <SegmentedControl
            fullWidth
            size="sm"
            value={scaleTargetKind}
            onChange={setScaleTargetKind}
            ariaLabel={t("measure.scale.appliesTo", "Apply scale to")}
            options={[
              {
                value: "all",
                label: t("measure.scale.allPages", "All pages"),
              },
              {
                value: "page",
                label: t("measure.scale.thisPage", "Page {{page}} only", {
                  page: pageNumber,
                }),
              },
            ]}
          />

          <div className={styles.presetGrid}>
            {PRESET_SCALES.map((preset, index) => {
              const ratio = PRESET_RATIOS[index];
              const isActive = ratio !== null && targetScale?.ratio === ratio;
              return (
                <Button
                  key={preset}
                  size="sm"
                  variant={isActive ? "primary" : "secondary"}
                  onClick={() => ratio !== null && applyRatio(ratio)}
                >
                  <FitText
                    text={preset}
                    minimumFontScale={0.6}
                    className={styles.presetLabel}
                  />
                </Button>
              );
            })}
            <div
              className={`${styles.customCell} ${customRatioInUse !== null ? styles.customCellActive : ""}`}
              data-length={customTextSize(customRatio)}
            >
              <NumberInput
                inputSize="sm"
                hideControls
                aria-label={t("measure.scale.customRatio", "Custom scale")}
                prefix="1:"
                placeholder={t("measure.scale.custom", "Custom")}
                min={0}
                value={customRatio}
                onChange={setCustomRatio}
                onBlur={() => {
                  if (isCustomRatioValid && ratioValue !== customRatioInUse) {
                    applyRatio(ratioValue);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </div>
          </div>

          <label className={styles.unitRow}>
            <span className={styles.numberFieldLabel}>
              {t("measure.scale.unit", "Real-world unit")}
            </span>
            <Select
              inputSize="sm"
              aria-label={t("measure.scale.unit", "Real-world unit")}
              options={getUnitOptions(t)}
              value={unit}
              onChange={handleUnitChange}
            />
          </label>

          <div className={styles.orDivider}>
            <span>{t("measure.scale.or", "or")}</span>
          </div>

          <Button
            size="sm"
            variant={isCalibrating ? "primary" : "secondary"}
            fullWidth
            leftSection={<Icon name="drafting-compass" size={14} />}
            onClick={() => setMode(isCalibrating ? "distance" : "calibrate")}
          >
            {isCalibrating
              ? t("measure.scale.cancelCalibration", "Cancel calibration")
              : t("measure.scale.calibrate", "Calibrate from a known length")}
          </Button>

          {overrides.length > 0 && (
            <div className={styles.overrideList}>
              {overrides.map(({ pageIndex, scale }) => (
                <div key={pageIndex} className={styles.overrideRow}>
                  <span>
                    {t("measure.scale.pageScale", "Page {{page}}: {{scale}}", {
                      page: pageIndex + 1,
                      scale: generateScaleLabel(scale.ratio, scale.unit),
                    })}
                  </span>
                  <ActionIcon
                    variant="tertiary"
                    size="sm"
                    aria-label={t(
                      "measure.scale.removePageScale",
                      "Remove scale for page {{page}}",
                      { page: pageIndex + 1 },
                    )}
                    onClick={() => setScale(null, { kind: "page", pageIndex })}
                  >
                    <Icon name="x" size={14} />
                  </ActionIcon>
                </div>
              ))}
            </div>
          )}

          {targetScale && (
            <Button
              size="sm"
              variant="quiet"
              onClick={() => setScale(null, target)}
            >
              {target.kind === "page"
                ? t("measure.scale.clearPage", "Remove this page's scale")
                : t("measure.scale.clearAll", "Remove scale")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
