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
import {
  AddPageNumbersParameters,
  BATES_DEFAULT_DIGITS,
  BATES_MAX_DIGITS,
  type PageNumberingStyle,
} from "@editor/components/tools/addPageNumbers/useAddPageNumbersParameters";
import { infoLabelProps } from "@editor/components/tools/shared/infoLabel";
import ButtonSelector from "@editor/components/shared/ButtonSelector";
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
  const bates = parameters.numberingStyle === "bates";
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

  const changeStyle = (style: PageNumberingStyle) => {
    onParameterChange("numberingStyle", style);
    if (style === "bates") {
      onParameterChange("position", 9);
      if (parameters.zeroPad < 1) {
        onParameterChange("zeroPad", BATES_DEFAULT_DIGITS);
      }
    }
  };

  const startingNumber = (
    <NumberInput
      {...infoLabelProps(
        t("addPageNumbers.selectText.4", "Start at"),
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
  );

  return (
    <Stack gap="md">
      <ButtonSelector
        {...infoLabelProps(
          t("addPageNumbers.numberingStyle", "Style"),
          t(
            "addPageNumbers.numberingStyleInfo",
            "Bates numbering gives every page one running number across all the selected files, in the order shown, with a fixed number of digits, such as ABC000001.",
          ),
        )}
        value={parameters.numberingStyle}
        onChange={changeStyle}
        disabled={disabled}
        options={[
          {
            value: "pageNumbers",
            label: t("addPageNumbers.styles.pageNumbers", "Page numbers"),
          },
          {
            value: "bates",
            label: t("addPageNumbers.styles.bates", "Bates"),
          },
        ]}
      />

      <PageNumberPreview
        parameters={parameters}
        onParameterChange={onParameterChange}
        file={file}
        showQuickGrid
      />

      {bates ? (
        <Group grow align="flex-end" wrap="nowrap">
          <TextInput
            label={t("addPageNumbers.batesPrefix", "Prefix")}
            value={parameters.batesPrefix}
            className={privateContentClassName}
            onChange={(e) =>
              onParameterChange("batesPrefix", e.currentTarget.value)
            }
            disabled={disabled}
          />
          <TextInput
            label={t("addPageNumbers.batesSuffix", "Suffix")}
            value={parameters.batesSuffix}
            className={privateContentClassName}
            onChange={(e) =>
              onParameterChange("batesSuffix", e.currentTarget.value)
            }
            disabled={disabled}
          />
        </Group>
      ) : (
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
              "e.g. Page {n} of {total}",
            )}
            disabled={disabled}
          />
          <PageNumberVariablePicker
            onInsert={insertVariable}
            disabled={disabled}
          />
        </Box>
      )}

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

      {bates ? (
        <Group grow align="flex-end" wrap="nowrap">
          <NumberInput
            label={t("addPageNumbers.batesDigits", "Digits")}
            value={parameters.zeroPad}
            onChange={(v) =>
              onParameterChange(
                "zeroPad",
                typeof v === "number" ? v : BATES_DEFAULT_DIGITS,
              )
            }
            min={1}
            max={BATES_MAX_DIGITS}
            disabled={disabled}
          />
          {startingNumber}
        </Group>
      ) : (
        <>
          <Group grow align="flex-end" wrap="nowrap">
            {startingNumber}
            <NumberInput
              {...infoLabelProps(
                t("addPageNumbers.zeroPad", "Zero-pad"),
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
        </>
      )}
    </Stack>
  );
};

export default AddPageNumbersSettings;
