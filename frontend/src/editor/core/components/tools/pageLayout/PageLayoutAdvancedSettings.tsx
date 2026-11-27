import { Stack } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { PageLayoutParameters } from "@editor/hooks/tools/pageLayout/usePageLayoutParameters";
import ButtonSelector from "@editor/components/shared/ButtonSelector";

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
      <ButtonSelector
        label={t("pageLayout.orientation.label", "Orientation")}
        options={[
          {
            value: "PORTRAIT",
            label: t("pageLayout.orientation.portrait", "Portrait"),
          },
          {
            value: "LANDSCAPE",
            label: t("pageLayout.orientation.landscape", "Landscape"),
          },
        ]}
        value={parameters.orientation}
        onChange={(v) => {
          if (v === "PORTRAIT" || v === "LANDSCAPE") {
            onParameterChange("orientation", v);
          }
        }}
        disabled={disabled}
      />

      <ButtonSelector
        label={t("pageLayout.arrangement.label", "Page arrangement")}
        options={[
          {
            value: "BY_ROWS",
            label: t("pageLayout.arrangement.byRows", "By Rows"),
          },
          {
            value: "BY_COLUMNS",
            label: t("pageLayout.arrangement.byColumns", "By Columns"),
          },
        ]}
        value={parameters.arrangement}
        onChange={(v) => {
          if (v === "BY_COLUMNS" || v === "BY_ROWS") {
            onParameterChange("arrangement", v);
          }
        }}
        disabled={disabled}
      />

      <ButtonSelector
        label={t("pageLayout.readingDirection.label", "Reading Direction")}
        options={[
          {
            value: "LTR",
            label: t("pageLayout.readingDirection.ltr", "Left to Right"),
          },
          {
            value: "RTL",
            label: t("pageLayout.readingDirection.rtl", "Right to Left"),
          },
        ]}
        value={parameters.readingDirection}
        onChange={(v) => {
          if (v === "LTR" || v === "RTL") {
            onParameterChange("readingDirection", v);
          }
        }}
        disabled={disabled}
      />
    </Stack>
  );
}
