import React, { useEffect, useState, useRef } from "react";
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
import { MeasureScale } from "@app/components/viewer/RulerOverlay";
import {
  generateScaleLabel,
  parsePresetRatio,
  calculateScaleFactor,
  UNIT_OPTIONS,
} from "@app/utils/measurementUtils";

// ─── Constants ─────────────────────────────────────────────────────────────
// Preset scales as architectural ratios (e.g., "1:100" = 1 unit on drawing = 100 real-world units)
const PRESET_SCALES = ["1:5", "1:10", "1:20", "1:50", "1:100", "1:150"];

// ─── Component ────────────────────────────────────────────────────────────
interface ScaleSettingsPanelProps {
  onApplyScale: (scale: MeasureScale) => void;
  onResetScale?: () => void;
  currentScale?: MeasureScale | null;
}

export function ScaleSettingsPanel({
  onApplyScale,
  onResetScale,
  currentScale,
}: ScaleSettingsPanelProps) {
  const { t } = useTranslation();
  const ratioInputRef = useRef<HTMLInputElement>(null);
  const [ratio, setRatio] = useState<number | null>(
    currentScale?.ratio ?? null,
  );
  const [unit, setUnit] = useState<string>(currentScale?.unit || "m");
  const [presetSelected, setPresetSelected] = useState<string | null>(null);
  const [ratioError, setRatioError] = useState<string | null>(null);

  // Sync form fields when currentScale changes
  useEffect(() => {
    if (currentScale) {
      // ratio can be null, so only set it if it exists
      setRatio(currentScale.ratio ?? null);
      setUnit(currentScale.unit);
      setRatioError(null);

      // Check if current scale matches any preset
      const matchedPreset = currentScale.ratio
        ? PRESET_SCALES.find(
            (preset) => parsePresetRatio(preset) === currentScale.ratio,
          )
        : null;
      setPresetSelected(matchedPreset ?? null);
    } else {
      // Reset to defaults when no active scale
      setRatio(null);
      setUnit("m");
      setPresetSelected(null);
      setRatioError(null);
    }
  }, [currentScale]);

  const handlePresetClick = (preset: string) => {
    setPresetSelected(preset);
    const presetRatio = parsePresetRatio(preset);
    setRatio(presetRatio);
    setRatioError(null);
    // Live update: apply immediately for presets
    applyScale(presetRatio, unit);
  };

  const handleRatioChange = (value: string | number | undefined) => {
    setRatioError(null);

    if (value === undefined || value === "") {
      setRatio(null);
      setPresetSelected(null);
      return;
    }

    const numValue = typeof value === "string" ? parseFloat(value) : value;
    if (!isNaN(numValue)) {
      setRatio(numValue);
    }
    // Clear preset selection when user enters custom value
    setPresetSelected(null);
  };

  const handleUnitChange = (val: string | null) => {
    if (!val) return;
    setUnit(val);
    // Auto-apply immediately if ratio is set (better UX consistency)
    if (ratio && ratio > 0) {
      applyScale(ratio, val);
    }
  };

  const validateRatio = (): boolean => {
    // Read value directly from input to ensure it's synchronized
    const inputValue = ratioInputRef.current?.value;
    const numValue = inputValue ? parseFloat(inputValue) : null;

    if (numValue === null || numValue === undefined || isNaN(numValue)) {
      setRatioError(t("scaleSettings.ratioRequired", "Ratio is required"));
      return false;
    }
    if (numValue <= 0) {
      setRatioError(
        t("scaleSettings.ratioPositive", "Ratio must be greater than zero"),
      );
      return false;
    }
    return true;
  };

  const applyScale = (scaleRatio: number, scaleUnit: string) => {
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
    } catch (err) {
      console.error("Invalid unit:", scaleUnit, err);
      setRatioError(`Invalid unit: ${scaleUnit}`);
    }
  };

  const handleApply = () => {
    if (!validateRatio()) return;
    const inputValue = ratioInputRef.current?.value;
    const numValue = inputValue ? parseFloat(inputValue) : null;
    if (numValue && numValue > 0) {
      applyScale(numValue, unit);
    }
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
              ref={ratioInputRef}
              key={`ratio-${currentScale?.ratio ?? "empty"}`}
              label="Ratio"
              placeholder="e.g., 100"
              value={ratio ?? undefined}
              onChange={handleRatioChange}
              min={0.1}
              step={1}
              size="xs"
              error={ratioError}
            />
          </div>
          <div onMouseDown={(e) => e.stopPropagation()}>
            <Select
              label="Unit"
              data={UNIT_OPTIONS}
              value={unit}
              onChange={handleUnitChange}
              size="xs"
              searchable
            />
          </div>
        </Group>
        <Text size="xs" c="dimmed" mt="xs">
          {t(
            "scaleSettings.ratioHelp",
            "Ratio: 1 drawing unit = X real-world units",
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

      {/* Calibration Mode (Reserved for future) */}
      <Button
        fullWidth
        variant="outline"
        size="sm"
        disabled
        title={t(
          "scaleSettings.calibrationTooltip",
          "Calibration mode coming soon",
        )}
      >
        {t("scaleSettings.calibrate", "Calibrate")}
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
