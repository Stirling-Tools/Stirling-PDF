import { Stack, NumberInput, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { PageLayoutParameters } from "@editor/hooks/tools/pageLayout/usePageLayoutParameters";
import { getPagesPerSheetOptions } from "@editor/components/tools/pageLayout/constants";
import ButtonSelector from "@editor/components/shared/ButtonSelector";

export default function PageLayoutSettings({
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

  const pagesPerSheetOptions = getPagesPerSheetOptions(t);
  const selectedPagesPerSheetOption =
    pagesPerSheetOptions.find((o) => o.value === parameters.pagesPerSheet) ||
    pagesPerSheetOptions[0];

  return (
    <Stack gap="sm">
      <ButtonSelector
        label={t("pageLayout.mode.label", "Mode")}
        options={[
          { value: "DEFAULT", label: t("pageLayout.mode.default", "Default") },
          { value: "CUSTOM", label: t("pageLayout.mode.custom", "Custom") },
        ]}
        value={String(parameters.mode)}
        onChange={(v) => {
          if (v === "CUSTOM" || v === "DEFAULT") {
            onParameterChange("mode", v);
          }
        }}
        disabled={disabled}
      />

      {parameters.mode === "DEFAULT" && (
        <>
          <ButtonSelector
            label={t("pageLayout.pagesPerSheet", "Pages per sheet")}
            options={pagesPerSheetOptions.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            value={parameters.pagesPerSheet}
            onChange={(v) => onParameterChange("pagesPerSheet", v)}
            disabled={disabled}
          />
          {selectedPagesPerSheetOption && (
            <Text size="xs" c="dimmed">
              {selectedPagesPerSheetOption.description}
            </Text>
          )}
        </>
      )}

      {parameters.mode === "CUSTOM" && (
        <>
          <NumberInput
            label={t("pageLayout.rows", "Rows")}
            placeholder={t("pageLayout.rowsPlaceholder", "Enter rows")}
            value={parameters.rows}
            onChange={(v) => onParameterChange("rows", Number(v))}
            min={1}
            disabled={disabled}
            style={{ flex: 1 }}
          />

          <NumberInput
            label={t("pageLayout.cols", "Columns")}
            placeholder={t("pageLayout.colsPlaceholder", "Enter columns")}
            value={parameters.cols}
            onChange={(v) => onParameterChange("cols", Number(v))}
            min={1}
            disabled={disabled}
            style={{ flex: 1 }}
          />
        </>
      )}
    </Stack>
  );
}
