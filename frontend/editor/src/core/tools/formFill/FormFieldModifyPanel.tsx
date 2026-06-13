/**
 * FormFieldModifyPanel — left-panel UI for "modify" mode.
 *
 * Lists existing fields grouped by page. Selecting one highlights it on the
 * page (via FormFieldEditOverlay) and reveals a property editor plus precise
 * X/Y/W/H inputs. Fields can be marked for deletion. All staged changes commit
 * in one round-trip.
 */
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Text,
  Button,
  Group,
  Alert,
  Collapse,
  ActionIcon,
  Paper,
  NumberInput,
  ScrollArea,
  Tooltip,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlineRounded";
import RestoreIcon from "@mui/icons-material/Restore";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { useFormFill } from "@app/tools/formFill/FormFillContext";
import type {
  FormField,
  ModifyFieldDefinition,
} from "@app/tools/formFill/types";
import {
  FIELD_TYPE_ICON,
  FIELD_TYPE_COLOR,
} from "@app/tools/formFill/fieldMeta";
import {
  FormFieldPropertyEditor,
  type EditableFieldProps,
} from "@app/tools/formFill/FormFieldPropertyEditor";
import { useFormCommit } from "@app/tools/formFill/useFormCommit";
import styles from "@app/tools/formFill/FormFill.module.css";

interface FormFieldModifyPanelProps {
  currentFile: File | Blob | null;
  onApplied?: (blob: Blob) => void;
}

/** Current backend (lower-left origin) coords for a field's first widget. */
function currentCoords(field: FormField, staged?: ModifyFieldDefinition) {
  const w = field.widgets?.[0];
  if (!w) return null;
  if (
    staged &&
    staged.x != null &&
    staged.y != null &&
    staged.width != null &&
    staged.height != null
  ) {
    return {
      x: staged.x,
      y: staged.y,
      width: staged.width,
      height: staged.height,
    };
  }
  const cropH = w.cropBoxHeight ?? 0;
  return {
    x: w.x,
    y: cropH ? cropH - w.y - w.height : w.y,
    width: w.width,
    height: w.height,
  };
}

export function FormFieldModifyPanel({
  currentFile,
  onApplied,
}: FormFieldModifyPanelProps) {
  const { t } = useTranslation();
  const {
    state,
    selectedFieldName,
    setSelectedField,
    modifiedFields,
    stageModification,
    deletedFieldNames,
    toggleFieldDeleted,
    commitModifications,
    hasUncommittedChanges,
  } = useFormFill();

  const { committing, error, commit } = useFormCommit(onApplied);
  const selectedRowRef = useRef<HTMLDivElement>(null);

  // Group fields by their first widget's page.
  const { sortedPages, fieldsByPage } = useMemo(() => {
    const byPage = new Map<number, FormField[]>();
    for (const field of state.fields) {
      const pageIndex = field.widgets?.[0]?.pageIndex ?? 0;
      if (!byPage.has(pageIndex)) byPage.set(pageIndex, []);
      byPage.get(pageIndex)!.push(field);
    }
    return {
      sortedPages: Array.from(byPage.keys()).sort((a, b) => a - b),
      fieldsByPage: byPage,
    };
  }, [state.fields]);

  // Auto-scroll the list to the selected field (e.g. selected via the overlay).
  useEffect(() => {
    if (selectedFieldName && selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [selectedFieldName]);

  const changeCount =
    Object.keys(modifiedFields).length + deletedFieldNames.length;

  const handleCommit = useCallback(() => {
    if (!currentFile || !hasUncommittedChanges) return;
    commit(
      () => commitModifications(currentFile),
      "formFill.modify.failed",
      "Failed to save changes",
    );
  }, [currentFile, hasUncommittedChanges, commitModifications, commit]);

  const editorValue = useCallback(
    (field: FormField): EditableFieldProps => {
      const staged = modifiedFields[field.name];
      return {
        name: staged?.name ?? field.name,
        label: staged?.label ?? field.label,
        type: staged?.type ?? field.type,
        defaultValue: staged?.defaultValue ?? field.value,
        tooltip: staged?.tooltip ?? field.tooltip ?? "",
        fontSize: staged?.fontSize ?? field.widgets?.[0]?.fontSize,
        required: staged?.required ?? field.required,
        readOnly: staged?.readOnly ?? field.readOnly,
        multiline: staged?.multiline ?? field.multiline,
        multiSelect: staged?.multiSelect ?? field.multiSelect,
        options: staged?.options ?? field.options ?? [],
      };
    },
    [modifiedFields],
  );

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text size="xs" c="dimmed">
          {t(
            "formFill.modify.hint",
            "Select a field to edit its properties, drag it on the page, or delete it.",
          )}
        </Text>

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

        <Button
          size="xs"
          onClick={handleCommit}
          loading={committing}
          disabled={!currentFile || !hasUncommittedChanges}
          data-testid="form-modify-commit"
        >
          {t("formFill.modify.commit", "Save {{count}} change(s)", {
            count: changeCount,
          })}
        </Button>

        {state.fields.length === 0 && !state.loading && (
          <Text size="xs" c="dimmed" ta="center" py="md">
            {t("formFill.modify.empty", "This PDF has no form fields yet.")}
          </Text>
        )}
      </div>

      <ScrollArea className={styles.fieldList}>
        <div className={styles.fieldListInner}>
          {sortedPages.map((pageIdx, i) => (
            <React.Fragment key={pageIdx}>
              <div
                className={styles.pageDivider}
                style={i === 0 ? { marginTop: 0 } : undefined}
              >
                <Text className={styles.pageDividerLabel}>
                  {t("formFill.page", "Page")} {pageIdx + 1}
                </Text>
              </div>

              {fieldsByPage.get(pageIdx)!.map((field) => {
                const selected = selectedFieldName === field.name;
                const deleted = deletedFieldNames.includes(field.name);
                const coords = currentCoords(field, modifiedFields[field.name]);
                return (
                  <Paper
                    key={field.name}
                    ref={selected ? selectedRowRef : undefined}
                    withBorder
                    p={6}
                    radius="sm"
                    style={{
                      cursor: "pointer",
                      borderColor: selected
                        ? "var(--mantine-color-blue-5)"
                        : undefined,
                      opacity: deleted ? 0.55 : 1,
                    }}
                    onClick={() =>
                      setSelectedField(selected ? null : field.name)
                    }
                    data-testid={`form-modify-row-${field.name}`}
                  >
                    <Group gap={6} wrap="nowrap" justify="space-between">
                      <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                        <span
                          style={{
                            color: `var(--mantine-color-${FIELD_TYPE_COLOR[field.type]}-6)`,
                            display: "flex",
                          }}
                        >
                          {FIELD_TYPE_ICON[field.type]}
                        </span>
                        <Text
                          size="xs"
                          truncate
                          td={deleted ? "line-through" : undefined}
                        >
                          {field.label || field.name}
                        </Text>
                      </Group>
                      <Tooltip
                        label={
                          deleted
                            ? t("formFill.modify.restore", "Restore")
                            : t("formFill.modify.delete", "Delete")
                        }
                        withArrow
                      >
                        <ActionIcon
                          size="sm"
                          variant="subtle"
                          color={deleted ? "blue" : "red"}
                          aria-label={
                            deleted
                              ? t("formFill.modify.restore", "Restore")
                              : t("formFill.modify.delete", "Delete")
                          }
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFieldDeleted(field.name);
                          }}
                          data-testid={`form-modify-delete-${field.name}`}
                        >
                          {deleted ? (
                            <RestoreIcon sx={{ fontSize: 16 }} />
                          ) : (
                            <DeleteOutlineIcon sx={{ fontSize: 16 }} />
                          )}
                        </ActionIcon>
                      </Tooltip>
                    </Group>

                    <Collapse in={selected && !deleted}>
                      <div
                        style={{ marginTop: 8 }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <FormFieldPropertyEditor
                          value={editorValue(field)}
                          onChange={(patch) =>
                            stageModification(
                              field.name,
                              patch as Partial<ModifyFieldDefinition>,
                            )
                          }
                          showName
                          allowTypeChange
                        />

                        {coords && (
                          <Group gap={6} mt="xs" grow>
                            <NumberInput
                              size="xs"
                              label="X"
                              value={Math.round(coords.x)}
                              onChange={(v) =>
                                typeof v === "number" &&
                                stageModification(field.name, {
                                  pageIndex: pageIdx,
                                  x: v,
                                  y: coords.y,
                                  width: coords.width,
                                  height: coords.height,
                                })
                              }
                            />
                            <NumberInput
                              size="xs"
                              label="Y"
                              value={Math.round(coords.y)}
                              onChange={(v) =>
                                typeof v === "number" &&
                                stageModification(field.name, {
                                  pageIndex: pageIdx,
                                  x: coords.x,
                                  y: v,
                                  width: coords.width,
                                  height: coords.height,
                                })
                              }
                            />
                            <NumberInput
                              size="xs"
                              label="W"
                              value={Math.round(coords.width)}
                              min={1}
                              onChange={(v) =>
                                typeof v === "number" &&
                                stageModification(field.name, {
                                  pageIndex: pageIdx,
                                  x: coords.x,
                                  y: coords.y,
                                  width: v,
                                  height: coords.height,
                                })
                              }
                            />
                            <NumberInput
                              size="xs"
                              label="H"
                              value={Math.round(coords.height)}
                              min={1}
                              onChange={(v) =>
                                typeof v === "number" &&
                                stageModification(field.name, {
                                  pageIndex: pageIdx,
                                  x: coords.x,
                                  y: coords.y,
                                  width: coords.width,
                                  height: v,
                                })
                              }
                            />
                          </Group>
                        )}
                      </div>
                    </Collapse>
                  </Paper>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

export default FormFieldModifyPanel;
