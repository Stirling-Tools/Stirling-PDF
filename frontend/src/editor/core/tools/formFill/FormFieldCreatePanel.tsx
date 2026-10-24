/** Left panel for "create" mode; drawing happens in FormFieldCreationOverlay. */
import { Text, Group, Alert, Tooltip } from "@mantine/core";
import { Button } from "@editor/ui/Button";
import { useTranslation } from "react-i18next";
import { Icon } from "@editor/ui/Icon";
import { useFormFill } from "@editor/tools/formFill/FormFillContext";
import {
  CREATABLE_FIELD_TYPES,
  type CreatableFieldType,
} from "@editor/tools/formFill/types";
import { FIELD_TYPE_ICON } from "@editor/tools/formFill/fieldMeta";
import { PendingFields } from "@editor/tools/formFill/PendingFields";
import { SkippedEditsAlert } from "@editor/tools/formFill/SkippedEditsAlert";
import styles from "@editor/tools/formFill/FormFill.module.css";

interface FormFieldCreatePanelProps {
  currentFile: File | Blob | null;
  onSave: () => Promise<boolean>;
  saving: boolean;
  changeCount: number;
}

const TYPE_LABEL: Record<
  CreatableFieldType,
  { key: string; fallback: string }
> = {
  text: { key: "formFill.fieldTypes.text", fallback: "Text" },
  checkbox: { key: "formFill.fieldTypes.checkbox", fallback: "Checkbox" },
  combobox: { key: "formFill.fieldTypes.combobox", fallback: "Dropdown" },
  listbox: { key: "formFill.fieldTypes.listbox", fallback: "List box" },
  radio: { key: "formFill.fieldTypes.radio", fallback: "Radio" },
  button: { key: "formFill.fieldTypes.button", fallback: "Button" },
  signature: { key: "formFill.fieldTypes.signature", fallback: "Signature" },
};

export function FormFieldCreatePanel({
  currentFile,
  onSave,
  saving,
  changeCount,
}: FormFieldCreatePanelProps) {
  const { t } = useTranslation();
  const typeLabel = (type: CreatableFieldType) =>
    t(TYPE_LABEL[type].key, TYPE_LABEL[type].fallback);
  const { creationType, setCreationType, pendingFields, setPreviewing } =
    useFormFill();

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text size="xs" c="dimmed">
          {t(
            "formFill.create.hint",
            "Pick a field type, then draw it on the page.",
          )}
        </Text>

        {/* Type palette */}
        <Group gap={6} wrap="wrap">
          {CREATABLE_FIELD_TYPES.map((type) => {
            const armed = creationType === type;
            return (
              <Button
                key={type}
                size="sm"
                variant={armed ? "primary" : "secondary"}
                leftSection={<Icon name={FIELD_TYPE_ICON[type]} size={16} />}
                onClick={() => setCreationType(armed ? null : type)}
                data-testid={`form-create-type-${type}`}
              >
                {typeLabel(type)}
              </Button>
            );
          })}
        </Group>

        {creationType && (
          <Alert color="blue" variant="light" p="xs" radius="sm">
            <Text size="xs">
              {t(
                "formFill.create.placing",
                "Draw a {{type}} field on the page. Press Esc to stop.",
                { type: typeLabel(creationType) },
              )}
            </Text>
          </Alert>
        )}

        <SkippedEditsAlert />
      </div>

      <PendingFields />

      <div className={styles.footer}>
        <Tooltip
          label={t(
            "formFill.create.previewHelp",
            "Hold to see the fields as they will look once added, without the editing outlines.",
          )}
          openDelay={250}
          withArrow
        >
          <Button
            size="sm"
            variant="secondary"
            accent="neutral"
            fullWidth
            disabled={pendingFields.length === 0}
            data-testid="form-create-preview"
            // Held, not toggled: releasing always restores the editing view, so preview
            // cannot be left switched on by accident.
            onPointerDown={() => setPreviewing(true)}
            onPointerUp={() => setPreviewing(false)}
            onPointerLeave={() => setPreviewing(false)}
            onPointerCancel={() => setPreviewing(false)}
            onBlur={() => setPreviewing(false)}
            leftSection={<Icon name="eye" size={20} />}
          >
            {t("formFill.create.preview", "Hold to preview")}
          </Button>
        </Tooltip>
        <Button
          size="sm"
          onClick={onSave}
          loading={saving}
          disabled={!currentFile || changeCount === 0}
          data-testid="form-create-commit"
        >
          {t("formFill.modify.commit", "Save {{count}} change(s)", {
            count: changeCount,
          })}
        </Button>
      </div>
    </div>
  );
}

export default FormFieldCreatePanel;
