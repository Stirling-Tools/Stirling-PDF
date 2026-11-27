/**
 * AddPageNumbersAppearanceSettings - Customize Appearance step
 */

import { Stack, Select, TextInput, NumberInput } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { AddPageNumbersParameters } from "@editor/components/tools/addPageNumbers/useAddPageNumbersParameters";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";

interface AddPageNumbersAppearanceSettingsProps {
  parameters: AddPageNumbersParameters;
  onParameterChange: <K extends keyof AddPageNumbersParameters>(
    key: K,
    value: AddPageNumbersParameters[K],
  ) => void;
  disabled?: boolean;
}

const AddPageNumbersAppearanceSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
}: AddPageNumbersAppearanceSettingsProps) => {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Select
        {...infoLabelProps(
          t("addPageNumbers.selectText.2", "Margin"),
          t(
            "marginTooltip",
            "Distance between the page number and the edge of the page.",
          ),
        )}
        value={parameters.customMargin}
        onChange={(v) =>
          onParameterChange(
            "customMargin",
            (v as AddPageNumbersParameters["customMargin"]) || "medium",
          )
        }
        data={[
          { value: "small", label: t("sizes.small", "Small") },
          { value: "medium", label: t("sizes.medium", "Medium") },
          { value: "large", label: t("sizes.large", "Large") },
          { value: "x-large", label: t("sizes.x-large", "Extra Large") },
        ]}
        disabled={disabled}
        comboboxProps={{
          withinPortal: true,
          zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
        }}
      />

      <NumberInput
        {...infoLabelProps(
          t("addPageNumbers.fontSize", "Font Size"),
          t(
            "fontSizeTooltip",
            "Size of the page number text in points. Larger numbers create bigger text.",
          ),
        )}
        value={parameters.fontSize}
        onChange={(v) =>
          onParameterChange("fontSize", typeof v === "number" ? v : 12)
        }
        min={1}
        disabled={disabled}
      />

      <NumberInput
        {...infoLabelProps(
          t("addPageNumbers.zeroPad", "Zero-pad Width"),
          t(
            "addPageNumbers.zeroPadTooltip",
            "Zero-pad (Bates Stamp) page numbers to this width (e.g. 3 => 001). Set 0 to disable.",
          ),
        )}
        value={parameters.zeroPad}
        onChange={(v) =>
          onParameterChange("zeroPad", typeof v === "number" ? v : 0)
        }
        min={0}
        disabled={disabled}
      />

      <Select
        label={t("addPageNumbers.fontName", "Font Type")}
        value={parameters.fontType}
        onChange={(v) =>
          onParameterChange(
            "fontType",
            (v as AddPageNumbersParameters["fontType"]) || "Times",
          )
        }
        data={[
          { value: "Times", label: "Times Roman" },
          { value: "Helvetica", label: "Helvetica" },
          { value: "Courier", label: "Courier New" },
        ]}
        disabled={disabled}
        comboboxProps={{
          withinPortal: true,
          zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
        }}
      />

      <TextInput
        {...infoLabelProps(
          t("addPageNumbers.selectText.6", "Custom Text Format"),
          t(
            "customTextTooltip",
            'Optional custom format for page numbers. Use {n} as placeholder for the number. Example: "Page {n}" will show "Page 1", "Page 2", etc.',
          ),
        )}
        value={parameters.customText || ""}
        onChange={(e) => onParameterChange("customText", e.currentTarget.value)}
        placeholder={t(
          "addPageNumbers.customNumberDesc",
          'e.g., "Page {n}" or leave blank for just numbers',
        )}
        disabled={disabled}
      />
    </Stack>
  );
};

export default AddPageNumbersAppearanceSettings;
