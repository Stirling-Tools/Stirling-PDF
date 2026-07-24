/**
 * FormFieldCreatePanel — left-panel UI for "create" mode.
 *
 * Pick a field type to arm placement, draw fields on the page (handled by
 * FormFieldCreationOverlay), tweak each queued field's properties, then commit
 * them to the PDF in one request.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Stack,
  Text,
  Button,
  Group,
  Alert,
  Collapse,
  ActionIcon,
  Paper,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineRounded";
import EditIcon from "@mui/icons-material/Edit";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useFormFill } from "@app/tools/formFill/FormFillContext";
import {
  CREATABLE_FIELD_TYPES,
  type CreatableFieldType,
  type NewFieldDefinition,
} from "@app/tools/formFill/types";
import {
  FIELD_TYPE_ICON,
  FIELD_TYPE_COLOR,
} from "@app/tools/formFill/fieldMeta";
import { FormFieldPropertyEditor } from "@app/tools/formFill/FormFieldPropertyEditor";
import { useFormCommit } from "@app/tools/formFill/useFormCommit";
import styles from "@app/tools/formFill/FormFill.module.css";

interface FormFieldCreatePanelProps {
  currentFile: File | Blob | null;
  onApplied?: (blob: Blob) => void;
}

const TYPE_LABEL: Record<CreatableFieldType, string> = {
  text: "Text",
  checkbox: "Checkbox",
  combobox: "Dropdown",
  listbox: "List box",
  radio: "Radio",
  button: "Button",
  signature: "Signature",
};

export function FormFieldCreatePanel({
  currentFile,
  onApplied,
}: FormFieldCreatePanelProps) {
  const { t } = useTranslation();
  const {
    creationType,
    setCreationType,
    pendingFields,
    updatePendingField,
    removePendingField,
    commitNewFields,
  } = useFormFill();

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { committing, error, commit } = useFormCommit(onApplied);

  // Auto-expand the property editor of a freshly-drawn field so its settings
  // (especially options for choice/radio) are visible immediately.
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (pendingFields.length > prevCountRef.current) {
      setExpandedId(pendingFields[pendingFields.length - 1].id);
    }
    prevCountRef.current = pendingFields.length;
  }, [pendingFields]);

  const handleCommit = useCallback(() => {
    if (!currentFile || pendingFields.length === 0) return;
    commit(
      () => commitNewFields(currentFile),
      "formFill.create.failed",
      "Failed to add fields",
    );
  }, [currentFile, pendingFields, commitNewFields, commit]);

  return (
    <div className={styles.header}>
      <Stack gap="xs">
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
                size="xs"
                variant={armed ? "filled" : "default"}
                leftSection={FIELD_TYPE_ICON[type]}
                onClick={() => setCreationType(armed ? null : type)}
                data-testid={`form-create-type-${type}`}
              >
                {TYPE_LABEL[type]}
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
                { type: TYPE_LABEL[creationType] },
              )}
            </Text>
          </Alert>
        )}

        {error && (
          <Alert
            icon={<WarningAmberIcon sx={{ fontSize: 16 }} />}
            color="red"
            variant="light"
            p="xs"
            radius="sm"
          >
            <Text size="xs">{error}</Text>
          </Alert>
        )}

        {/* Queued fields */}
        {pendingFields.length === 0 ? (
          <Text size="xs" c="dimmed" ta="center" py="md">
            {t("formFill.create.empty", "No fields drawn yet.")}
          </Text>
        ) : (
          <Stack gap={6}>
            {pendingFields.map((pf) => {
              const expanded = expandedId === pf.id;
              return (
                <Paper key={pf.id} withBorder p={6} radius="sm">
                  <Group gap={6} wrap="nowrap" justify="space-between">
                    <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                      <span
                        style={{
                          color: `var(--mantine-color-${FIELD_TYPE_COLOR[pf.type]}-6)`,
                          display: "flex",
                        }}
                      >
                        {FIELD_TYPE_ICON[pf.type]}
                      </span>
                      <Text size="xs" truncate>
                        {pf.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        p{pf.pageIndex + 1}
                      </Text>
                    </Group>
                    <Group gap={2} wrap="nowrap">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        aria-label={t(
                          "formFill.create.editField",
                          "Edit field",
                        )}
                        onClick={() => setExpandedId(expanded ? null : pf.id)}
                        data-testid={`form-pending-edit-${pf.id}`}
                      >
                        <EditIcon sx={{ fontSize: 16 }} />
                      </ActionIcon>
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        aria-label={t(
                          "formFill.create.removeField",
                          "Remove field",
                        )}
                        onClick={() => removePendingField(pf.id)}
                        data-testid={`form-pending-remove-${pf.id}`}
                      >
                        <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                      </ActionIcon>
                    </Group>
                  </Group>
                  <Collapse in={expanded}>
                    <div style={{ marginTop: 8 }}>
                      <FormFieldPropertyEditor
                        value={pf}
                        onChange={(patch) =>
                          updatePendingField(
                            pf.id,
                            patch as Partial<NewFieldDefinition>,
                          )
                        }
                        showName
                      />
                    </div>
                  </Collapse>
                </Paper>
              );
            })}
          </Stack>
        )}

        <Button
          size="xs"
          onClick={handleCommit}
          loading={committing}
          disabled={!currentFile || pendingFields.length === 0}
          data-testid="form-create-commit"
        >
          {t("formFill.create.commit", "Add {{count}} field(s) to PDF", {
            count: pendingFields.length,
          })}
        </Button>
      </Stack>
    </div>
  );
}

export default FormFieldCreatePanel;
