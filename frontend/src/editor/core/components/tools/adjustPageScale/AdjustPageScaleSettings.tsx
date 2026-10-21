import { Group, Stack, NumberInput, Select } from "@mantine/core";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@app/ui/SegmentedControl";
import { useTranslation } from "react-i18next";
import {
  AdjustPageScaleParameters,
  CustomSizeUnit,
  Orientation,
  PageSize,
  convertCustomSide,
  customSideLimits,
} from "@app/hooks/tools/adjustPageScale/useAdjustPageScaleParameters";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

const CUSTOM_UNIT_OPTIONS: SegmentedOption<CustomSizeUnit>[] = [
  { value: "mm", label: "mm" },
  { value: "cm", label: "cm" },
  { value: "in", label: "in" },
];

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

  const isKeepSelected = parameters.pageSize === PageSize.KEEP;
  const isCustomSelected = parameters.pageSize === PageSize.CUSTOM;

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
    {
      value: PageSize.CUSTOM,
      label: t("adjustPageScale.pageSize.custom", "Custom"),
    },
  ];

  const sideLimits = customSideLimits(parameters.customUnit);

  const handleCustomUnitChange = (unit: CustomSizeUnit) => {
    const from = parameters.customUnit;
    onParameterChange(
      "customWidth",
      convertCustomSide(parameters.customWidth, from, unit),
    );
    onParameterChange(
      "customHeight",
      convertCustomSide(parameters.customHeight, from, unit),
    );
    onParameterChange("customUnit", unit);
  };

  const orientationDisabled = disabled || isKeepSelected || isCustomSelected;
  const orientationOptions: SegmentedOption<Orientation>[] = [
    {
      value: "PORTRAIT",
      label: t("adjustPageScale.orientation.portrait", "Portrait"),
      disabled: orientationDisabled,
    },
    {
      value: "LANDSCAPE",
      label: t("adjustPageScale.orientation.landscape", "Landscape"),
      disabled: orientationDisabled,
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
        value={parameters.pageSize}
        onChange={(value) => {
          if (!value) return;
          const next = value as PageSize;
          if (!Object.values(PageSize).includes(next)) return;
          onParameterChange("pageSize", next);
        }}
        data={pageSizeOptions}
        disabled={disabled}
        comboboxProps={{
          withinPortal: true,
          zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
        }}
      />

      {isCustomSelected && (
        <>
          <Group grow>
            <NumberInput
              label={t("adjustPageScale.customSize.width", "Width")}
              value={parameters.customWidth}
              onChange={(value) =>
                onParameterChange(
                  "customWidth",
                  typeof value === "number" ? value : 0,
                )
              }
              min={sideLimits.min}
              max={sideLimits.max}
              decimalScale={2}
              disabled={disabled}
            />
            <NumberInput
              label={t("adjustPageScale.customSize.height", "Height")}
              value={parameters.customHeight}
              onChange={(value) =>
                onParameterChange(
                  "customHeight",
                  typeof value === "number" ? value : 0,
                )
              }
              min={sideLimits.min}
              max={sideLimits.max}
              decimalScale={2}
              disabled={disabled}
            />
          </Group>
          <SegmentedControl
            ariaLabel={t("adjustPageScale.customSize.unit", "Unit")}
            value={parameters.customUnit}
            onChange={handleCustomUnitChange}
            options={CUSTOM_UNIT_OPTIONS}
            disabled={disabled}
            fullWidth
          />
        </>
      )}

      <SegmentedControl
        aria-label={t("adjustPageScale.orientation.label", "Page orientation")}
        value={parameters.orientation}
        onChange={(value) => onParameterChange("orientation", value)}
        options={orientationOptions}
        fullWidth
      />
    </Stack>
  );
};

export default AdjustPageScaleSettings;
