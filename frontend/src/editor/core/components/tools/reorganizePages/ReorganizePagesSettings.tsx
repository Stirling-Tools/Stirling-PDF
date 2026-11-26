import { Select, Stack, TextInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { ReorganizePagesParameters } from "@editor/hooks/tools/reorganizePages/useReorganizePagesParameters";
import { getReorganizePagesModeData } from "@editor/components/tools/reorganizePages/constants";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";

export default function ReorganizePagesSettings({
  parameters,
  onParameterChange,
  disabled,
}: {
  parameters: ReorganizePagesParameters;
  onParameterChange: <K extends keyof ReorganizePagesParameters>(
    key: K,
    value: ReorganizePagesParameters[K],
  ) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const modeData = getReorganizePagesModeData(t);

  const requiresOrder =
    parameters.customMode === "" || parameters.customMode === "DUPLICATE";
  const selectedMode =
    modeData.find((mode) => mode.value === parameters.customMode) ||
    modeData[0];
  return (
    <Stack gap="md">
      <Select
        {...infoLabelProps(
          t("pdfOrganiser.mode._value", "Organization mode"),
          selectedMode?.description,
        )}
        data={modeData}
        value={parameters.customMode}
        onChange={(v) => onParameterChange("customMode", v ?? "")}
        disabled={disabled}
        comboboxProps={{
          withinPortal: true,
          zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
        }}
      />

      {requiresOrder && (
        <TextInput
          {...infoLabelProps(
            t("pageOrderPrompt", "Page Order"),
            t(
              "reorganizePages.pageOrder.info",
              "A comma-separated list of page numbers, ranges such as 4-8, or functions such as 2n+1. For Duplicate all pages, enter how many copies of each page to make.",
            ),
          )}
          placeholder={t(
            "pdfOrganiser.placeholder",
            "(e.g. 1,3,2 or 4-8,2,10-12 or 2n-1)",
          )}
          value={parameters.pageNumbers}
          onChange={(e) =>
            onParameterChange("pageNumbers", e.currentTarget.value)
          }
          disabled={disabled}
        />
      )}
    </Stack>
  );
}
