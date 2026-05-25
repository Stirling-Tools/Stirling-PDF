import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { MeasureScale, PagePoint } from "@app/utils/measurementTypes";
import {
  UNIT_OPTIONS,
  formatPaperDistance,
  validateRealDistance,
  calculateCalibratedScale,
  generateScaleLabel,
} from "@app/utils/measurementUtils";
import {
  getLastCalibrationUnit,
  setLastCalibrationUnit,
} from "@app/utils/measurementPreferences";

// Result of user drawing measurement on PDF (from RulerOverlay)
export interface ScaleCalibrationMeasurement {
  start: PagePoint;
  end: PagePoint;
  pdfDistancePts: number;
}

interface ScaleCalibrationDialogProps {
  opened: boolean;
  measurement: ScaleCalibrationMeasurement | null;
  defaultUnit: string;
  onApplyScale: (scale: MeasureScale) => void;
  onClose: () => void;
}

export function ScaleCalibrationDialog({
  opened,
  measurement,
  defaultUnit,
  onApplyScale,
  onClose,
}: ScaleCalibrationDialogProps) {
  const { t } = useTranslation();

  const [realDistance, setRealDistance] = useState<number | null>(null);
  const [unit, setUnit] = useState(() => getLastCalibrationUnit(defaultUnit));
  const [error, setError] = useState<string | null>(null);

  const previewScale = useMemo(() => {
    if (measurement == null || realDistance == null) {
      return null;
    }

    try {
      return calculateCalibratedScale(
        measurement.pdfDistancePts,
        realDistance,
        unit,
      );
    } catch {
      return null;
    }
  }, [measurement, realDistance, unit]);

  useEffect(() => {
    if (opened) {
      setRealDistance(null);
      setUnit(getLastCalibrationUnit(defaultUnit));
      setError(null);
    }
  }, [opened, defaultUnit]);

  const handleRealDistanceChange = (value: number | string | null) => {
    setError(null);

    const validated = validateRealDistance(value);
    setRealDistance(validated);
  };

  const handleUnitChange = (newUnit: string | null) => {
    if (newUnit == null) return;

    setUnit(newUnit);
    setLastCalibrationUnit(newUnit);
    setError(null);
  };

  const handleApply = () => {
    if (measurement == null || realDistance == null) {
      setError(
        t(
          "scaleSettings.calibrationDistanceRequired",
          "Enter a real-world distance greater than zero",
        ),
      );
      return;
    }

    try {
      const scale = calculateCalibratedScale(
        measurement.pdfDistancePts,
        realDistance,
        unit,
      );

      setLastCalibrationUnit(unit);
      onApplyScale(scale);
    } catch (err) {
      console.error("[Calibration] Failed to apply:", err);
      setError(
        t(
          "scaleSettings.calibrationInvalid",
          "Unable to calculate scale from this measurement",
        ),
      );
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t("scaleSettings.calibrationTitle", "Calibrate Scale")}
      centered
      size="sm"
    >
      <Stack gap="md">
        {/* Show paper distance automatically */}
        {measurement && (
          <Text size="sm" c="dimmed">
            {t(
              "scaleSettings.calibrationPaperDistance",
              "Measured drawing distance: {{distance}}",
              {
                distance: formatPaperDistance(measurement.pdfDistancePts),
              },
            )}
          </Text>
        )}

        {/* Input: real distance + unit selector */}
        <Group grow align="flex-start">
          <NumberInput
            label={t("scaleSettings.realDistance", "Real distance")}
            placeholder={t("scaleSettings.realDistancePlaceholder", "e.g., 5")}
            value={realDistance ?? undefined}
            onChange={handleRealDistanceChange}
            min={0}
            step={0.1}
            decimalScale={4}
            error={error}
          />
          <Select
            label={t("scaleSettings.unit", "Unit")}
            data={UNIT_OPTIONS}
            value={unit}
            onChange={handleUnitChange}
            searchable
          />
        </Group>

        {/* Preview: show calculated scale */}
        {previewScale && (
          <Text size="sm" c="blue">
            {t("scaleSettings.calculatedScale", "Calculated scale")}:{" "}
            {generateScaleLabel(previewScale.ratio, previewScale.unit)}
          </Text>
        )}

        {/* Actions: Cancel or Apply */}
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("common.cancel", "Cancel")}
          </Button>
          <Button onClick={handleApply}>
            {t("scaleSettings.applyCalibration", "Apply Calibration")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
