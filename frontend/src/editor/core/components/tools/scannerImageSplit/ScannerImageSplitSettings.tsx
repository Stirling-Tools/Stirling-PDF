import React from "react";
import { useTranslation } from "react-i18next";
import { NumberInput, Stack } from "@mantine/core";
import { ScannerImageSplitParameters } from "@editor/hooks/tools/scannerImageSplit/useScannerImageSplitParameters";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";

interface ScannerImageSplitSettingsProps {
  parameters: ScannerImageSplitParameters;
  onParameterChange: <K extends keyof ScannerImageSplitParameters>(
    key: K,
    value: ScannerImageSplitParameters[K],
  ) => void;
  disabled?: boolean;
}

const ScannerImageSplitSettings: React.FC<ScannerImageSplitSettingsProps> = ({
  parameters,
  onParameterChange,
  disabled = false,
}) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <NumberInput
        {...infoLabelProps(
          t("ScannerImageSplit.selectText.1", "Angle Threshold"),
          t(
            "ScannerImageSplit.selectText.2",
            "Tilt (in degrees) needed before we auto-straighten a photo.",
          ),
        )}
        value={parameters.angle_threshold}
        onChange={(value) =>
          onParameterChange("angle_threshold", Number(value) || 10)
        }
        min={0}
        step={1}
        disabled={disabled}
      />

      <NumberInput
        {...infoLabelProps(
          t("ScannerImageSplit.selectText.3", "Tolerance"),
          t(
            "ScannerImageSplit.selectText.4",
            "How closely a color must match the page background to count as background. Higher = looser, lower = stricter.",
          ),
        )}
        value={parameters.tolerance}
        onChange={(value) =>
          onParameterChange("tolerance", Number(value) || 30)
        }
        min={0}
        step={1}
        disabled={disabled}
      />

      <NumberInput
        {...infoLabelProps(
          t("ScannerImageSplit.selectText.5", "Minimum Area"),
          t(
            "ScannerImageSplit.selectText.6",
            "Smallest photo size (in pixels²) we'll keep to avoid tiny fragments.",
          ),
        )}
        value={parameters.min_area}
        onChange={(value) =>
          onParameterChange("min_area", Number(value) || 10000)
        }
        min={0}
        step={100}
        disabled={disabled}
      />

      <NumberInput
        {...infoLabelProps(
          t("ScannerImageSplit.selectText.7", "Minimum Contour Area"),
          t(
            "ScannerImageSplit.selectText.8",
            "Smallest edge/shape we consider when finding photos (filters dust and specks).",
          ),
        )}
        value={parameters.min_contour_area}
        onChange={(value) =>
          onParameterChange("min_contour_area", Number(value) || 500)
        }
        min={0}
        step={10}
        disabled={disabled}
      />

      <NumberInput
        {...infoLabelProps(
          t("ScannerImageSplit.selectText.9", "Border Size"),
          t(
            "ScannerImageSplit.selectText.10",
            "Extra padding (in pixels) around each saved photo so edges aren't cut.",
          ),
        )}
        value={parameters.border_size}
        onChange={(value) =>
          onParameterChange("border_size", Number(value) || 1)
        }
        min={0}
        step={1}
        disabled={disabled}
      />
    </Stack>
  );
};

export default ScannerImageSplitSettings;
