import React, { useCallback, useEffect, useState } from "react";
import {
  Group,
  Button,
  NumberInput,
  Select,
  Stack,
  Text,
  Grid,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { MeasureScale } from "@app/utils/measurementTypes";
import {
  generateScaleLabel,
  parsePresetRatio,
  calculateScaleFactor,
  UNIT_OPTIONS,
} from "@app/utils/measurementUtils";

// ─── Constants ─────────────────────────────────────────────────────────────
// Preset scales as architectural ratios (e.g., "1:100" = 1 page unit = 100 real-world units)
const PRESET_SCALES = ["1:5", "1:10", "1:20", "1:50", "1:100", "1:150"];

// ─── Component ────────────────────────────────────────────────────────────
interface ScaleSettingsPanelProps {
  onApplyScale: (scale: MeasureScale) => void;
  onResetScale?: () => void;
  onStartCalibration?: () => void;
  isCalibrationActive?: boolean;
  currentScale?: MeasureScale | null;
  onClose?: () => void;
}

export function ScaleSettingsPanel({
  onApplyScale,
  onResetScale,
  onStartCalibration,
  isCalibrationActive = false,
  currentScale,
  onClose,
}: ScaleSettingsPanelProps) {
  const { t } = useTranslation();
  const [ratio, setRatio] = useState<string | number>(
    currentScale?.ratio ?? "",
  );
  const [unit, setUnit] = useState<string>(currentScale?.unit || "m");
  const [presetSelected, setPresetSelected] = useState<string | null>(null);
  const [ratioError, setRatioError] = useState<string | null>(null);
  const [unitError, setUnitError] = useState<string | null>(null);

  // Helper functions to clear errors
  const clearErrors = useCallback(() => {
    setRatioError(null);
    setUnitError(null);
  }, []);

  const clearRatioError = useCallback(() => {
    setRatioError(null);
  }, []);

  const clearUnitError = useCallback(() => {
    setUnitError(null);
  }, []);

  // Sync form fields when currentScale changes
  useEffect(() => {
    if (currentScale) {
      // ratio can be null, so only set it if it exists
      setRatio(currentScale.ratio ?? "");
      setUnit(currentScale.unit);
      clearErrors();

      // Check if current scale matches any preset
      const matchedPreset = currentScale.ratio
        ? PRESET_SCALES.find(
            (preset) => parsePresetRatio(preset) === currentScale.ratio,
          )
        : null;
      setPresetSelected(matchedPreset ?? null);
    } else {
      // Reset to defaults when no active scale
      setRatio("");
      setUnit("m");
      setPresetSelected(null);
      clearErrors();
    }
  }, [currentScale, clearErrors]);

  const handlePresetClick = (preset: string) => {
    setPresetSelected(preset);
    const presetRatio = parsePresetRatio(preset);
    setRatio(presetRatio);
    clearRatioError();
    // Live update: apply immediately for presets
    applyScale(presetRatio, unit);
    // Close panel after applying preset
    onClose?.();
  };

  const handleRatioChange = (value: string | number) => {
    clearRatioError();

    if (value === "") {
      setRatio("");
      setPresetSelected(null);
      return;
    }

    setRatio(value);
    // Clear preset selection when user enters custom value
    setPresetSelected(null);
  };

  const parseRatioValue = (value: string | number): number | null => {
    if (typeof value === "number") return Number.isNaN(value) ? null : value;

    const trimmedValue = value.trim();
    if (!trimmedValue) return null;

    const numValue = Number(trimmedValue);
    return Number.isNaN(numValue) ? null : numValue;
  };

  const handleUnitChange = (val: string | null) => {
    if (!val) return;
    setUnit(val);
    clearUnitError();
    // Auto-apply immediately if ratio is set (better UX consistency)
    const numValue = parseRatioValue(ratio);
    if (numValue && numValue > 0) {
      // Close panel after auto-applying unit change
      applyScale(numValue, val, true);
    }
  };

  const validateRatio = (): number | null => {
    const numValue = parseRatioValue(ratio);
    if (numValue === null || numValue === undefined || isNaN(numValue)) {
      setRatioError(t("scaleSettings.ratioRequired", "Ratio is required"));
      return null;
    }
    if (numValue <= 0) {
      setRatioError(
        t("scaleSettings.ratioPositive", "Ratio must be greater than zero"),
      );
      return null;
    }
    return numValue;
  };

  const applyScale = (
    scaleRatio: number,
    scaleUnit: string,
    shouldClose = false,
  ) => {
    if (!scaleRatio || scaleRatio <= 0) return;

    try {
      // Calculate the raw factor from the ratio
      const factor = calculateScaleFactor(scaleRatio, scaleUnit);

      const scale: MeasureScale = {
        factor,
        ratio: scaleRatio,
        unit: scaleUnit,
      };

      onApplyScale(scale);
      clearUnitError();
      // Close panel only if explicitly requested
      if (shouldClose) {
        onClose?.();
      }
    } catch (err) {
      console.error("Invalid unit:", scaleUnit, err);
      setUnitError(
        t("scaleSettings.unitInvalid", "Invalid unit: {{scaleUnit}}", {
          scaleUnit,
        }),
      );
    }
  };

  const handleApply = () => {
    const numValue = validateRatio();
    if (numValue === null) return;
    // Close panel after manual apply (if validation passed)
    applyScale(numValue, unit, true);
  };

  const handleStartCalibration = () => {
    clearErrors();
    onStartCalibration?.();
    // Close panel after starting calibration
    onClose?.();
  };

  return (
    <Stack gap="md" style={{ padding: "0.75rem", minWidth: "300px" }}>
      {/* Preset Scales Section */}
      <div>
        <Text size="sm" fw={600} mb="xs">
          {t("scaleSettings.presets", "Preset Scales")}
        </Text>
        <Grid gutter="xs">
          {PRESET_SCALES.map((preset) => (
            <Grid.Col span={4} key={preset}>
              <Button
                variant={presetSelected === preset ? "filled" : "light"}
                size="xs"
                fullWidth
                onClick={() => handlePresetClick(preset)}
              >
                {preset}
              </Button>
            </Grid.Col>
          ))}
        </Grid>
      </div>

      {/* Custom Scale Section */}
      <div>
        <Text size="sm" fw={600} mb="xs">
          {t("scaleSettings.customScale", "Custom Scale")}
        </Text>
        <Group grow>
          <div>
            <NumberInput
              key={`ratio-${currentScale?.ratio ?? "empty"}`}
              label={t("scaleSettings.ratio", "Scale Ratio")}
              placeholder={t(
                "scaleSettings.ratioPlaceholder",
                "e.g., 100 (1 page unit = 100 real units)",
              )}
              value={ratio}
              onChange={handleRatioChange}
              min={0.1}
              step={1}
              size="xs"
              error={ratioError}
            />
          </div>
          <div onMouseDown={(e) => e.stopPropagation()}>
            <Select
              label={t("scaleSettings.unit", "Unit")}
              data={UNIT_OPTIONS}
              value={unit}
              onChange={handleUnitChange}
              size="xs"
              searchable
              error={unitError}
            />
          </div>
        </Group>
        <Text size="xs" c="dimmed" mt="xs">
          {t(
            "scaleSettings.ratioHelp",
            "Ratio: 1 page unit = X real-world units",
          )}
        </Text>
      </div>

      <Button onClick={handleApply} fullWidth color="blue" size="sm">
        {t("scaleSettings.apply", "Apply Scale")}
      </Button>

      {/* Active Scale Display */}
      <div
        style={{
          padding: "0.5rem",
          backgroundColor: currentScale
            ? "rgba(30, 136, 229, 0.1)"
            : "rgba(158, 158, 158, 0.1)",
          borderRadius: "4px",
        }}
      >
        <Text size="xs" c={currentScale ? "blue" : "dimmed"}>
          <strong>{t("scaleSettings.activeScale", "Active Scale")}:</strong>{" "}
          {currentScale && currentScale.ratio
            ? generateScaleLabel(currentScale.ratio, currentScale.unit)
            : currentScale && !currentScale.ratio
              ? `${currentScale.unit} (custom)`
              : t("scaleSettings.noneSet", "No custom scale set")}
        </Text>
      </div>

      {/* Calibration Mode */}
      <Button
        onClick={handleStartCalibration}
        fullWidth
        variant={isCalibrationActive ? "filled" : "outline"}
        size="sm"
        disabled={!onStartCalibration}
        title={t(
          "scaleSettings.calibrationTooltip",
          "Measure a known distance to calculate the scale automatically",
        )}
      >
        {isCalibrationActive
          ? t("scaleSettings.calibrating", "Calibrating...")
          : t("scaleSettings.calibrate", "Calibrate")}
      </Button>

      {/* Reset Button */}
      {currentScale && (
        <Button
          onClick={() => onResetScale?.()}
          fullWidth
          variant="default"
          size="sm"
        >
          {t("scaleSettings.reset", "Reset to Defaults")}
        </Button>
      )}
    </Stack>
  );
}
