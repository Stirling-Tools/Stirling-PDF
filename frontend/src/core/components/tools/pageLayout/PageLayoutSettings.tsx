import { Select, Stack, NumberInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { PageLayoutParameters } from "@app/hooks/tools/pageLayout/usePageLayoutParameters";
import { getPagesPerSheetOptions } from "@app/components/tools/pageLayout/constants";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";
import ButtonSelector from "@app/components/shared/ButtonSelector";

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
        label={t("pageLayout.mode.label", "Mode:")}
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
          <Select
            label={t("pageLayout.pagesPerSheet", "Pages per sheet:")}
            data={pagesPerSheetOptions.map((o) => ({
              value: String(o.value),
              label: o.label,
            }))}
            value={String(parameters.pagesPerSheet)}
            onChange={(v) => onParameterChange("pagesPerSheet", Number(v))}
            allowDeselect={false}
            disabled={disabled}
            comboboxProps={{
              withinPortal: true,
              zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
            }}
          />
          {selectedPagesPerSheetOption && (
            <div
              style={{
                backgroundColor: "var(--information-text-bg)",
                color: "var(--information-text-color)",
                padding: "8px 12px",
                borderRadius: "8px",
                marginTop: "4px",
                fontSize: "0.75rem",
                textAlign: "center",
              }}
            >
              {selectedPagesPerSheetOption.description}
            </div>
          )}
        </>
      )}

      {parameters.mode === "CUSTOM" && (
        <>
          <NumberInput
            label={t("pageLayout.rows", "Rows")}
            placeholder="Enter rows"
            value={parameters.rows}
            onChange={(v) => onParameterChange("rows", Number(v))}
            min={1}
            disabled={disabled}
            style={{ flex: 1 }}
          />

          <NumberInput
            label={t("pageLayout.cols", "Columns")}
            placeholder="Enter columns"
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
