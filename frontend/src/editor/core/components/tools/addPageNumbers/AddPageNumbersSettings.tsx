/**
 * The tool's one settings step. The preview sits on top because every field
 * below it changes what it shows: the text, the numbers, the font and where it
 * lands.
 */

import { useRef } from "react";
import {
  Box,
  Group,
  NumberInput,
  Select,
  Stack,
  TextInput,
} from "@mantine/core";
import { Trans, useTranslation } from "react-i18next";
import { AddPageNumbersParameters } from "@editor/components/tools/addPageNumbers/useAddPageNumbersParameters";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";
import { Z_INDEX_AUTOMATE_DROPDOWN } from "@editor/styles/zIndex";
import PageNumberPreview from "@editor/components/tools/addPageNumbers/PageNumberPreview";
import { PageNumberVariablePicker } from "@editor/components/tools/addPageNumbers/PageNumberVariablePicker";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";

interface AddPageNumbersSettingsProps {
  parameters: AddPageNumbersParameters;
  onParameterChange: <K extends keyof AddPageNumbersParameters>(
    key: K,
    value: AddPageNumbersParameters[K],
  ) => void;
  disabled?: boolean;
  file?: File | null;
}

const comboboxProps = {
  withinPortal: true,
  zIndex: Z_INDEX_AUTOMATE_DROPDOWN,
};

const AddPageNumbersSettings = ({
  parameters,
  onParameterChange,
  disabled = false,
  file = null,
}: AddPageNumbersSettingsProps) => {
  const { t } = useTranslation();
  const customTextCaret = useRef<{ start: number; end: number } | null>(null);

  const rememberCaret = (input: HTMLInputElement) => {
    customTextCaret.current = {
      start: input.selectionStart ?? input.value.length,
      end: input.selectionEnd ?? input.value.length,
    };
  };

  // At the caret the field last had, or at the end before it has had one.
  const insertVariable = (token: string) => {
    const text = parameters.customText || "";
    const caret = customTextCaret.current;
    const start = Math.min(caret?.start ?? text.length, text.length);
    const end = Math.min(caret?.end ?? text.length, text.length);
    onParameterChange(
      "customText",
      text.slice(0, start) + token + text.slice(end),
    );
    const after = start + token.length;
    customTextCaret.current = { start: after, end: after };
  };

  return (
    <Stack gap="md">
      <PageNumberPreview
        parameters={parameters}
        onParameterChange={onParameterChange}
        file={file}
        showQuickGrid
      />

      <Box pos="relative">
        <TextInput
          {...infoLabelProps(
            t("addPageNumbers.selectText.6", "Custom Text Format"),
            <Trans
              i18nKey="customTextTooltip"
              defaults="Printed on each numbered page. <code>{n}</code> is the page number, <code>{total}</code> the number of pages in the file and <code>{filename}</code> the file name. Leave blank to print just the number."
              components={{ code: <code /> }}
            />,
          )}
          value={parameters.customText || ""}
          className={privateContentClassName}
          onChange={(e) => {
            rememberCaret(e.currentTarget);
            onParameterChange("customText", e.currentTarget.value);
          }}
          onSelect={(e) => rememberCaret(e.currentTarget)}
          placeholder={t(
            "addPageNumbers.customNumberDesc",
            'e.g., "Page {n}" or leave blank for just numbers',
          )}
          disabled={disabled}
        />
        <PageNumberVariablePicker
          onInsert={insertVariable}
          disabled={disabled}
        />
      </Box>

      <Group grow align="flex-end" wrap="nowrap">
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
      </Group>

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
        comboboxProps={comboboxProps}
      />

      <Group grow align="flex-end" wrap="nowrap">
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
          comboboxProps={comboboxProps}
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
      </Group>
    </Stack>
  );
};

export default AddPageNumbersSettings;
