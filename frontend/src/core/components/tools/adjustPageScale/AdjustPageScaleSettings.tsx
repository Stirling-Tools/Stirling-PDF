import { Stack, NumberInput, Select, SegmentedControl } from "@mantine/core";
import { useTranslation } from "react-i18next";
import {
  AdjustPageScaleParameters,
  Orientation,
  PageSize,
  getBasePageSize,
  isLandscapePageSize,
  withOrientation,
} from "@app/hooks/tools/adjustPageScale/useAdjustPageScaleParameters";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

interface AdjustPageScaleSettingsProps {
  parameters: AdjustPageScaleParameters;
  onParameterChange: <K extends keyof AdjustPageScaleParameters>(
    key: K,
    value: AdjustPageScaleParameters[K],
  ) => void;
  disabled?: boolean;
}

const AdjustPageScaleSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: AdjustPageScaleSettingsProps) => {
  const { t } = useTranslation();

  const baseSize = getBasePageSize(parameters.pageSize);
  const orientation: Orientation = isLandscapePageSize(parameters.pageSize)
    ? "LANDSCAPE"
    : "PORTRAIT";
  const isKeepSelected = parameters.pageSize === PageSize.KEEP;

  const pageSizeOptions = [
    {
      value: PageSize.KEEP,
      label: t("adjustPageScale.pageSize.keep", "Keep Original Size"),
    },
    { value: PageSize.A0, label: "A0" },
    { value: PageSize.A1, label: "A1" },
    { value: PageSize.A2, label: "A2" },
    { value: PageSize.A3, label: "A3" },
    { value: PageSize.A4, label: "A4" },
    { value: PageSize.A5, label: "A5" },
    { value: PageSize.A6, label: "A6" },
    {
      value: PageSize.LETTER,
      label: t("adjustPageScale.pageSize.letter", "Letter"),
    },
    {
      value: PageSize.LEGAL,
      label: t("adjustPageScale.pageSize.legal", "Legal"),
    },
  ];

  const orientationOptions = [
    {
      value: "PORTRAIT",
      label: t("adjustPageScale.orientation.portrait", "Portrait"),
    },
    {
      value: "LANDSCAPE",
      label: t("adjustPageScale.orientation.landscape", "Landscape"),
    },
  ];

  return (
    <Stack gap="md">
      <NumberInput
        label={t("adjustPageScale.scaleFactor.label", "Scale Factor")}
        value={parameters.scaleFactor}
        onChange={(value) =>
          onParameterChange(
            "scaleFactor",
            typeof value === "number" ? value : 1.0,
          )
        }
        min={0.1}
        max={10.0}
        step={0.1}
        decimalScale={2}
        disabled={disabled}
      />

      <Select
        label={t("adjustPageScale.pageSize.label", "Target Page Size")}
        value={baseSize}
        onChange={(value) => {
          if (!value) return;
          const selectedBase = value as PageSize;
          if (!Object.values(PageSize).includes(selectedBase)) return;
          onParameterChange(
            "pageSize",
            withOrientation(selectedBase, orientation),
          );
        }}
        data={pageSizeOptions}
        disabled={disabled}
        comboboxProps={{
          withinPortal: true,
          zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
        }}
      />

      <SegmentedControl
        aria-label={t("adjustPageScale.orientation.label", "Page orientation")}
        value={orientation}
        onChange={(value) =>
          onParameterChange(
            "pageSize",
            withOrientation(baseSize, value as Orientation),
          )
        }
        data={orientationOptions}
        disabled={disabled || isKeepSelected}
        fullWidth
      />
    </Stack>
  );
};

export default AdjustPageScaleSettings;
