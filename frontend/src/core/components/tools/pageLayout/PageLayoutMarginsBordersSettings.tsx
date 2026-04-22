import { Divider, Stack, NumberInput, Switch } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { PageLayoutParameters } from "@app/hooks/tools/pageLayout/usePageLayoutParameters";

export default function PageLayoutMarginsBordersSettings({
  parameters,
  onParameterChange,
  disabled,
}: {
  parameters: PageLayoutParameters;
  onParameterChange: <K extends keyof PageLayoutParameters>(
    key: K,
    value: PageLayoutParameters[K],
  ) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();

  const cols =
    parameters.mode === "DEFAULT"
      ? Math.ceil(Math.sqrt(parameters.pagesPerSheet))
      : parameters.cols;
  const rows =
    parameters.mode === "DEFAULT"
      ? Math.ceil(parameters.pagesPerSheet / cols)
      : parameters.rows;

  const left = parameters.leftMargin ?? 0;
  const right = parameters.rightMargin ?? 0;
  const top = parameters.topMargin ?? 0;
  const bottom = parameters.bottomMargin ?? 0;
  const inner = parameters.innerMargin ?? 0;

  const pageWidth =
    parameters.orientation === "PORTRAIT"
      ? 595.28 // A4 width in points
      : 841.89; // A4 height in points

  const pageHeight =
    parameters.orientation === "PORTRAIT"
      ? 841.89 // A4 height in points
      : 595.28; // A4 width in points

  const cellWidth = (pageWidth - left - right) / cols;
  const cellHeight = (pageHeight - top - bottom) / rows;
  const innerWidth = cellWidth - 2 * inner;
  const innerHeight = cellHeight - 2 * inner;

  const invalidOuterWidth = left + right >= pageWidth;
  const invalidOuterHeight = top + bottom >= pageHeight;
  const invalidInnerSize = (innerWidth <= 0 || innerHeight <= 0) && inner > 0;

  const outerHeightError = invalidOuterHeight
    ? t(
        "pageLayout.error.outerVerticalMarginsTooLarge",
        "Top/Bottom margins are too large for this page size.",
      )
    : undefined;

  const outerWidthError = invalidOuterWidth
    ? t(
        "pageLayout.error.outerHorizontalMarginsTooLarge",
        "Left/Right margins are too large for this page size.",
      )
    : undefined;

  const innerError = invalidInnerSize
    ? t(
        "pageLayout.error.innerMarginTooLarge",
        "Inner margin is too large for the selected layout.",
      )
    : undefined;

  return (
    <Stack gap="sm">
      <NumberInput
        label={t("pageLayout.top", "Top Margin")}
        placeholder="Enter top margin"
        value={parameters.topMargin}
        onChange={(v) => onParameterChange("topMargin", Number(v))}
        min={0}
        disabled={disabled}
        style={{ flex: 1 }}
        error={outerHeightError}
      />
      <NumberInput
        label={t("pageLayout.bottom", "Bottom Margin")}
        placeholder="Enter bottom margin"
        value={parameters.bottomMargin}
        onChange={(v) => onParameterChange("bottomMargin", Number(v))}
        min={0}
        disabled={disabled}
        style={{ flex: 1 }}
        error={outerHeightError}
      />
      <NumberInput
        label={t("pageLayout.left", "Left Margin")}
        placeholder="Enter left margin"
        value={parameters.leftMargin}
        onChange={(v) => onParameterChange("leftMargin", Number(v))}
        min={0}
        disabled={disabled}
        error={outerWidthError}
      />
      <NumberInput
        label={t("pageLayout.right", "Right Margin")}
        placeholder="Enter right margin"
        value={parameters.rightMargin}
        onChange={(v) => onParameterChange("rightMargin", Number(v))}
        min={0}
        disabled={disabled}
        style={{ flex: 1 }}
        error={outerWidthError}
      />
      <NumberInput
        label={t("pageLayout.innerMargin", "Inner Margin")}
        placeholder="Enter inner margin"
        value={parameters.innerMargin}
        onChange={(v) => onParameterChange("innerMargin", Number(v))}
        min={0}
        disabled={disabled}
        style={{ flex: 1 }}
        error={innerError}
      />

      <Divider />

      <Switch
        checked={parameters.addBorder}
        onChange={(e) =>
          onParameterChange("addBorder", e.currentTarget.checked)
        }
        label={t("pageLayout.addBorder", "Add Borders")}
        disabled={disabled}
      />

      {parameters.addBorder && (
        <NumberInput
          label={t("pageLayout.borderWidth", "Border Thickness")}
          placeholder="Enter border thickness"
          value={parameters.borderWidth}
          onChange={(v) => onParameterChange("borderWidth", Number(v))}
          min={1}
          disabled={disabled}
          style={{ flex: 1 }}
        />
      )}
    </Stack>
  );
}
