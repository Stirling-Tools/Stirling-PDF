/**
 * AddPageNumbersPositionSettings - Position & Pages step
 */

import { Stack, TextInput, NumberInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddPageNumbersParameters } from "@editor/components/tools/addPageNumbers/useAddPageNumbersParameters";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";
import PageNumberPreview from "@editor/components/tools/addPageNumbers/PageNumberPreview";

interface AddPageNumbersPositionSettingsProps {
  parameters: AddPageNumbersParameters;
  onParameterChange: <K extends keyof AddPageNumbersParameters>(
    key: K,
    value: AddPageNumbersParameters[K],
  ) => void;
  disabled?: boolean;
  file?: File | null;
  showQuickGrid?: boolean;
}

const AddPageNumbersPositionSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  file = null,
  showQuickGrid = true,
}: AddPageNumbersPositionSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <PageNumberPreview
        parameters={parameters}
        onParameterChange={onParameterChange}
        file={file}
        showQuickGrid={showQuickGrid}
      />

      <TextInput
        {...infoLabelProps(
          t("addPageNumbers.selectText.5", "Pages to Number"),
          t(
            "addPageNumbers.pagesToNumberInfo",
            "Comma-separated page numbers or ranges, such as 1,3,5-8, or a function such as 2n+1. Leave blank to number every page.",
          ),
        )}
        value={parameters.pagesToNumber || ""}
        onChange={(e) =>
          onParameterChange("pagesToNumber", e.currentTarget.value)
        }
        placeholder={t("addPageNumbers.numberPagesDesc", "All pages")}
        disabled={disabled}
      />

      <NumberInput
        {...infoLabelProps(
          t("addPageNumbers.selectText.4", "Starting Number"),
          t(
            "startingNumberTooltip",
            "The first number to display. Subsequent pages will increment from this number.",
          ),
        )}
        value={parameters.startingNumber}
        onChange={(v) =>
          onParameterChange("startingNumber", typeof v === "number" ? v : 1)
        }
        min={1}
        disabled={disabled}
      />
    </Stack>
  );
};

export default AddPageNumbersPositionSettings;
