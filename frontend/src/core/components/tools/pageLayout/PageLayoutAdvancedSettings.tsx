import { Divider, Select, Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { PageLayoutParameters } from "@app/hooks/tools/pageLayout/usePageLayoutParameters";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@app/styles/zIndex";

export default function PageLayoutAdvancedSettings({
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
  return (
    <Stack gap="sm">
      <Select
        label={t("pageLayout.orientation.label", "Orientation:")}
        data={[
          {
            value: "PORTRAIT",
            label: t("pageLayout.orientation.portrait", "Portrait"),
          },
          {
            value: "LANDSCAPE",
            label: t("pageLayout.orientation.landscape", "Landscape"),
          },
        ]}
        value={String(parameters.orientation)}
        onChange={(v) => {
          if (v === "PORTRAIT" || v === "LANDSCAPE") {
            onParameterChange("orientation", v);
          }
        }}
        disabled={disabled}
        comboboxProps={{
          withinPortal: true,
          zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
        }}
      />

      <Divider />

      <Select
        label={t("pageLayout.arrangement.label", "Page arrangement:")}
        data={[
          {
            value: "BY_ROWS",
            label: t("pageLayout.arrangement.byRows", "By Rows"),
          },
          {
            value: "BY_COLUMNS",
            label: t("pageLayout.arrangement.byColumns", "By Columns"),
          },
        ]}
        value={String(parameters.arrangement)}
        onChange={(v) => {
          if (v === "BY_COLUMNS" || v === "BY_ROWS") {
            onParameterChange("arrangement", v);
          }
        }}
        disabled={disabled}
        comboboxProps={{
          withinPortal: true,
          zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
        }}
      />

      <Select
        label={t("pageLayout.readingDirection.label", "Reading Direction:")}
        data={[
          {
            value: "LTR",
            label: t("pageLayout.readingDirection.ltr", "Left to Right"),
          },
          {
            value: "RTL",
            label: t("pageLayout.readingDirection.rtl", "Right to Left"),
          },
        ]}
        value={String(parameters.readingDirection)}
        onChange={(v) => {
          if (v === "LTR" || v === "RTL") {
            onParameterChange("readingDirection", v);
          }
        }}
        disabled={disabled}
        comboboxProps={{
          withinPortal: true,
          zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
        }}
      />
    </Stack>
  );
}
