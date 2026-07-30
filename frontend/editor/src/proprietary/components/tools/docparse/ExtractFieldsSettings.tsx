import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Group, Select, Stack, Text, TextInput, Textarea } from "@mantine/core";
import { Button } from "@app/ui";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AutoAwesomeRoundedIcon from "@mui/icons-material/AutoAwesomeRounded";
import { alert } from "@app/components/toast";
import type { ToolAutomationSettingsProps } from "@app/hooks/tools/shared/toolOperationTypes";
import type { ExtractFieldsParameters } from "@app/hooks/tools/extractFields/useExtractFieldsParameters";
import type { DocparseMode } from "@app/hooks/tools/shared/docparseTypes";
import {
  FIELD_TYPES,
  emptyFieldRow,
  type FieldRow,
  type FieldType,
} from "@app/hooks/tools/extractFields/fieldsSchema";
import {
  CUSTOM_PRESET,
  FIELD_PRESET_IDS,
  matchPreset,
  presetRows,
  type FieldPresetId,
} from "@app/hooks/tools/extractFields/fieldsSchemaPresets";
import { requestSuggestedFields } from "@app/hooks/tools/extractFields/suggestSchema";
import DocparseToolIntro from "@app/components/tools/docparse/DocparseToolIntro";
import styles from "@app/components/tools/docparse/ExtractFieldsSettings.module.css";

interface ExtractFieldsSettingsProps extends ToolAutomationSettingsProps<ExtractFieldsParameters> {
  /** The selected input file; enables the AI schema suggestion. */
  selectedFile?: File | null;
}

/** Schema builder: rows of name/type/description plus free-form instructions. */
const ExtractFieldsSettings = ({
  parameters,
  onParameterChange,
  disabled,
  selectedFile,
}: ExtractFieldsSettingsProps) => {
  const { t } = useTranslation();
  const [suggesting, setSuggesting] = useState(false);

  const setRow = (index: number, patch: Partial<FieldRow>) => {
    const fields = parameters.fields.map((row, i) =>
      i === index ? { ...row, ...patch } : row,
    );
    onParameterChange("fields", fields);
  };

  const removeRow = (index: number) => {
    const fields = parameters.fields.filter((_, i) => i !== index);
    onParameterChange("fields", fields.length > 0 ? fields : [emptyFieldRow()]);
  };

  const applyPreset = (value: string | null) => {
    if (value === CUSTOM_PRESET) {
      onParameterChange("fields", [emptyFieldRow()]);
    } else if (value) {
      onParameterChange("fields", presetRows(value as FieldPresetId));
    }
  };

  const suggestFields = async () => {
    if (!selectedFile || suggesting) return;
    setSuggesting(true);
    try {
      const rows = await requestSuggestedFields(selectedFile);
      onParameterChange("fields", rows.length > 0 ? rows : [emptyFieldRow()]);
    } catch {
      alert({
        alertType: "error",
        title: t("extractFields.suggest.failed", "Could not suggest fields"),
        body: t(
          "extractFields.suggest.failedBody",
          "The document could not be analyzed. Add fields manually or try again.",
        ),
        expandable: false,
      });
    } finally {
      setSuggesting(false);
    }
  };

  const presetLabels: Record<FieldPresetId, string> = {
    invoice: t("extractFields.presets.invoice", "Invoice"),
    receipt: t("extractFields.presets.receipt", "Receipt"),
    contract: t("extractFields.presets.contract", "Contract"),
    purchaseOrder: t("extractFields.presets.purchaseOrder", "Purchase order"),
  };

  return (
    <Stack gap="sm">
      <DocparseToolIntro
        description={t(
          "extractFields.intro",
          "Describe the fields you need and AI reads the document and returns each value with a confidence score and a citation you can verify.",
        )}
        aiBadge="llm"
      />
      <Select
        label={t("extractFields.presets.label", "Preset template")}
        value={matchPreset(parameters.fields)}
        onChange={applyPreset}
        data={[
          ...FIELD_PRESET_IDS.map((preset) => ({
            value: preset,
            label: presetLabels[preset],
          })),
          {
            value: CUSTOM_PRESET,
            label: t("extractFields.presets.custom", "Custom"),
          },
        ]}
        disabled={disabled}
      />
      <Text size="sm" fw={500}>
        {t("extractFields.fields.label", "Fields to extract")}
      </Text>
      <div className={styles.schema}>
        {parameters.fields.map((row, index) => (
          <div key={index} className={styles.row}>
            <TextInput
              className={styles.nameInput}
              aria-label={t("extractFields.fields.name", "Name")}
              placeholder={t(
                "extractFields.fields.namePlaceholder",
                "invoice_number",
              )}
              value={row.name}
              onChange={(event) =>
                setRow(index, { name: event.currentTarget.value })
              }
              disabled={disabled}
            />
            <Select
              className={styles.typeSelect}
              aria-label={t("extractFields.fields.type", "Type")}
              value={row.type}
              onChange={(value) =>
                setRow(index, { type: (value ?? "string") as FieldType })
              }
              data={FIELD_TYPES.map((type) => ({ value: type, label: type }))}
              disabled={disabled}
            />
            <TextInput
              className={styles.descriptionInput}
              aria-label={t("extractFields.fields.description", "Description")}
              placeholder={t(
                "extractFields.fields.descriptionPlaceholder",
                "What to look for",
              )}
              value={row.description}
              onChange={(event) =>
                setRow(index, { description: event.currentTarget.value })
              }
              disabled={disabled}
            />
            <Button
              variant="quiet"
              size="sm"
              shape="circle"
              leftSection={
                <DeleteOutlineRoundedIcon style={{ fontSize: "1.1rem" }} />
              }
              aria-label={t("extractFields.fields.remove", "Remove field")}
              onClick={() => removeRow(index)}
              disabled={disabled}
            />
          </div>
        ))}
      </div>
      <Group gap="xs">
        <Button
          variant="secondary"
          size="sm"
          leftSection={<AddRoundedIcon style={{ fontSize: "1rem" }} />}
          onClick={() =>
            onParameterChange("fields", [...parameters.fields, emptyFieldRow()])
          }
          disabled={disabled}
        >
          {t("extractFields.fields.add", "Add field")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          leftSection={<AutoAwesomeRoundedIcon style={{ fontSize: "1rem" }} />}
          onClick={suggestFields}
          loading={suggesting}
          disabled={disabled || !selectedFile}
        >
          {t("extractFields.suggest.button", "Suggest fields (AI)")}
        </Button>
      </Group>
      {!selectedFile && (
        <Text size="xs" c="dimmed">
          {t(
            "extractFields.suggest.needsFile",
            "Select a file first to suggest fields",
          )}
        </Text>
      )}
      <Select
        label={t("extractFields.mode.label", "Mode")}
        value={parameters.mode}
        onChange={(value) =>
          onParameterChange("mode", (value ?? "auto") as DocparseMode)
        }
        data={[
          { value: "auto", label: t("extractFields.mode.auto", "Auto") },
          { value: "basic", label: t("extractFields.mode.basic", "Basic") },
          {
            value: "advanced",
            label: t("extractFields.mode.advanced", "Advanced"),
          },
        ]}
        disabled={disabled}
      />
      <Textarea
        label={t("extractFields.instructions.label", "Instructions")}
        placeholder={t(
          "extractFields.instructions.placeholder",
          "e.g. Amounts are in EUR unless stated otherwise",
        )}
        value={parameters.instructions}
        onChange={(event) =>
          onParameterChange("instructions", event.currentTarget.value)
        }
        minRows={2}
        autosize
        disabled={disabled}
      />
    </Stack>
  );
};

export default ExtractFieldsSettings;
