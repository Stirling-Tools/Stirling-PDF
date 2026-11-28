import { useState } from "react";
import { Group, Stack, NumberInput, Select } from "@mantine/core";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@editor/ui/SegmentedControl";
import { useTranslation } from "react-i18next";
import {
  AdjustPageScaleParameters,
  CustomSizeUnit,
  Orientation,
  PageSize,
  convertCustomSide,
  customSideLimits,
} from "@editor/hooks/tools/adjustPageScale/useAdjustPageScaleParameters";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";
import { orderPaperSizeOptions } from "@editor/utils/paperSize";

const CUSTOM_UNIT_OPTIONS: SegmentedOption<CustomSizeUnit>[] = [
  { value: "mm", label: "mm" },
  { value: "cm", label: "cm" },
  { value: "in", label: "in" },
];

interface CustomSideInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  disabled: boolean;
}

// Mantine reports a half-typed number such as "8." as a string. Feeding the
// parsed number back as the controlled value would erase the separator
// mid-keystroke, so the text lives in a local draft and is reset only when the
// value changes from outside, such as a unit switch.
const CustomSideInput = ({
  label,
  value,
  onChange,
  min,
  max,
  disabled,
}: CustomSideInputProps) => {
  const [draft, setDraft] = useState<number | string>(value);
  const [reported, setReported] = useState(value);
  if (value !== reported) {
    setReported(value);
    setDraft(value);
  }

  const handleChange = (next: number | string) => {
    const parsed = typeof next === "number" ? next : Number(next) || 0;
    setDraft(next);
    setReported(parsed);
    onChange(parsed);
  };

  return (
    <NumberInput
      label={label}
      value={draft}
      onChange={handleChange}
      min={min}
      max={max}
      decimalScale={2}
      disabled={disabled}
    />
  );
};

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

  const pageSizeOptions = orderPaperSizeOptions([
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
  ]);

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
            <CustomSideInput
              label={t("adjustPageScale.customSize.width", "Width")}
              value={parameters.customWidth}
              onChange={(value) => onParameterChange("customWidth", value)}
              min={sideLimits.min}
              max={sideLimits.max}
              disabled={disabled}
            />
            <CustomSideInput
              label={t("adjustPageScale.customSize.height", "Height")}
              value={parameters.customHeight}
              onChange={(value) => onParameterChange("customHeight", value)}
              min={sideLimits.min}
              max={sideLimits.max}
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
        ariaLabel={t("adjustPageScale.orientation.label", "Page orientation")}
        value={parameters.orientation}
        onChange={(value) => onParameterChange("orientation", value)}
        options={orientationOptions}
        fullWidth
      />
    </Stack>
  );
};

export default AdjustPageScaleSettings;
