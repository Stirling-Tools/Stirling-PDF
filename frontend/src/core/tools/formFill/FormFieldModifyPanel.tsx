/**
 * FormFieldModifyPanel — Left panel for "Modify" mode.
 *
 * Shows existing fields, allows selecting one for coordinate editing
 * via the overlay, and batches all modifications into one backend call.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  Button,
  Text,
  ScrollArea,
  Alert,
  Loader,
} from '@mantine/core';
import SaveIcon from '@mui/icons-material/Save';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useFormFill } from '@app/tools/formFill/FormFillContext';
import { useFileState } from '@app/contexts/FileContext';
import { isStirlingFile } from '@app/types/fileContext';
import { FIELD_TYPE_ICON, FIELD_TYPE_COLOR } from '@app/tools/formFill/fieldMeta';
import { FormFieldPropertyEditor } from '@app/tools/formFill/FormFieldPropertyEditor';
import type { NewFieldDefinition, FormField } from '@app/tools/formFill/types';
import styles from '@app/tools/formFill/FormFill.module.css';

export function FormFieldModifyPanel() {
  const {
    state: formState,
    editState,
    setEditState,
    modifiedFields,
    updateFieldCoordinates,
    updateFieldProperties,
    commitFieldModifications,
    fetchFields,
  } = useFormFill();

  const { selectors, state: fileState } = useFileState();
  const activeFiles = selectors.getFiles();
  const selectedFileIds = fileState.ui.selectedFileIds;
  const currentFile = useMemo(() => {
    if (activeFiles.length === 0) return null;
    if (selectedFileIds.length > 0) {
      const sel = activeFiles.find(
        (f) => isStirlingFile(f) && selectedFileIds.includes(f.fileId)
      );
      if (sel) return sel;
    }
    return activeFiles[0];
  }, [activeFiles, selectedFileIds]);

  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCommit = useCallback(async () => {
    if (!currentFile || !isStirlingFile(currentFile)) return;
    if (modifiedFields.size === 0) return;

    setCommitting(true);
    setError(null);
    try {
      const blob = await commitFieldModifications(currentFile);
      const event = new CustomEvent('formfill:apply', { detail: { blob } });
      window.dispatchEvent(event);
      fetchFields(currentFile, currentFile.fileId);
    } catch (err: any) {
      setError(err?.message || 'Failed to save modifications');
    } finally {
      setCommitting(false);
    }
  }, [currentFile, modifiedFields, commitFieldModifications, fetchFields]);

  const handleSelectField = useCallback((fieldName: string) => {
    setEditState({
      selectedFieldName: editState.selectedFieldName === fieldName ? null : fieldName,
      interaction: 'idle',
      pendingRect: null,
    });
  }, [editState.selectedFieldName, setEditState]);

  const { fields } = formState;

  // Build a NewFieldDefinition-like object for the property editor from the selected field
  const selectedField = useMemo<FormField | undefined>(
    () => editState.selectedFieldName ? fields.find(f => f.name === editState.selectedFieldName) : undefined,
    [fields, editState.selectedFieldName]
  );

  const selectedFieldEditorData = useMemo<NewFieldDefinition | null>(() => {
    if (!selectedField) return null;
    const widget = selectedField.widgets?.[0];
    const pending = modifiedFields.get(selectedField.name) || {};
    // Coords: modifiedFields stores PDF BL origin. Widget coords are CSS TL (y-flipped).
    // Convert widget CSS TL → PDF BL for display consistency when no pending modification.
    const cropH = widget?.cropBoxHeight ?? 0;
    const widgetPdfY = cropH > 0 && widget
      ? cropH - widget.y - widget.height
      : widget?.y ?? 0;
    const x = pending.x ?? widget?.x ?? 0;
    const y = pending.y ?? widgetPdfY;
    const w = pending.width ?? widget?.width ?? 100;
    const h = pending.height ?? widget?.height ?? 20;
    return {
      name: pending.name ?? selectedField.name,
      label: pending.label ?? selectedField.label ?? undefined,
      type: (pending.type ?? selectedField.type) as NewFieldDefinition['type'],
      pageIndex: widget?.pageIndex ?? 0,
      x,
      y,
      width: w,
      height: h,
      required: pending.required ?? selectedField.required,
      tooltip: pending.tooltip ?? selectedField.tooltip ?? undefined,
      defaultValue: pending.defaultValue ?? selectedField.value ?? undefined,
      fontSize: pending.fontSize ?? widget?.fontSize ?? undefined,
      readOnly: pending.readOnly ?? selectedField.readOnly,
      multiline: pending.multiline ?? selectedField.multiline,
      multiSelect: pending.multiSelect ?? selectedField.multiSelect,
      options: pending.options ?? selectedField.options ?? undefined,
    };
  }, [selectedField, modifiedFields]);

  const handlePropertyChange = useCallback((updated: NewFieldDefinition) => {
    if (!selectedField) return;
    const props: Record<string, unknown> = {};
    if (updated.name !== selectedField.name) props.name = updated.name;
    if (updated.label !== (selectedField.label ?? undefined)) props.label = updated.label ?? '';
    if (updated.tooltip !== (selectedField.tooltip ?? undefined)) props.tooltip = updated.tooltip ?? '';
    if (updated.defaultValue !== (selectedField.value ?? undefined)) props.defaultValue = updated.defaultValue ?? '';
    if (updated.required !== selectedField.required) props.required = updated.required;
    if (updated.readOnly !== selectedField.readOnly) props.readOnly = updated.readOnly;
    if (updated.multiline !== selectedField.multiline) props.multiline = updated.multiline;
    if (updated.multiSelect !== selectedField.multiSelect) props.multiSelect = updated.multiSelect;
    if (updated.fontSize !== (selectedField.widgets?.[0]?.fontSize ?? undefined)) props.fontSize = updated.fontSize;
    if (updated.options !== (selectedField.options ?? undefined)) props.options = updated.options;
    if (updated.type !== selectedField.type) props.type = updated.type;
    if (Object.keys(props).length > 0) {
      updateFieldProperties(selectedField.name, props);
    }
  }, [selectedField, updateFieldProperties]);

  const handleCoordsChange = useCallback((coords: { x: number; y: number; width: number; height: number }) => {
    if (!selectedField) return;
    updateFieldCoordinates(selectedField.name, coords);
  }, [selectedField, updateFieldCoordinates]);

  // Group fields by page
  const fieldsByPage = useMemo(() => {
    const byPage = new Map<number, typeof fields>();
    for (const field of fields) {
      const pageIndex = field.widgets?.[0]?.pageIndex ?? 0;
      if (!byPage.has(pageIndex)) byPage.set(pageIndex, []);
      byPage.get(pageIndex)!.push(field);
    }
    return byPage;
  }, [fields]);

  const sortedPages = useMemo(
    () => Array.from(fieldsByPage.keys()).sort((a, b) => a - b),
    [fieldsByPage]
  );

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text size="xs" fw={600}>
          Click a field below or on the PDF to select it. Drag to move, use handles to resize.
        </Text>

        {modifiedFields.size > 0 && (
          <Button
            leftSection={committing ? <Loader size={14} color="white" /> : <SaveIcon sx={{ fontSize: 14 }} />}
            size="xs"
            onClick={handleCommit}
            loading={committing}
            fullWidth
          >
            Save {modifiedFields.size} Change{modifiedFields.size !== 1 ? 's' : ''}
          </Button>
        )}

        {error && (
          <Alert icon={<WarningAmberIcon sx={{ fontSize: 16 }} />} color="red" variant="light" p="xs" radius="sm">
            <Text size="xs">{error}</Text>
          </Alert>
        )}
      </div>

      <ScrollArea className={styles.fieldList}>
        <div className={styles.fieldListInner}>
          {formState.loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '1rem' }}>
              <Loader size={14} />
              <Text size="xs" c="dimmed">Loading fields...</Text>
            </div>
          )}

          {!formState.loading && fields.length === 0 && (
            <div className={styles.emptyState} style={{ padding: '2rem 1rem' }}>
              <Text size="xs" c="dimmed" ta="center">
                No form fields found. Use Create mode to add fields first.
              </Text>
            </div>
          )}

          {sortedPages.map((pageIdx, i) => (
            <React.Fragment key={pageIdx}>
              <div
                className={styles.pageDivider}
                style={i === 0 ? { marginTop: 0 } : undefined}
              >
                <Text className={styles.pageDividerLabel}>
                  Page {pageIdx + 1}
                </Text>
              </div>

              {fieldsByPage.get(pageIdx)!.map((field) => {
                const isSelected = editState.selectedFieldName === field.name;
                const isModified = modifiedFields.has(field.name);
                const coords = modifiedFields.get(field.name);
                const widget = field.widgets?.[0];

                return (
                  <div
                    key={field.name}
                    className={`${styles.fieldCard} ${isSelected ? styles.fieldCardActive : ''}`}
                    onClick={() => handleSelectField(field.name)}
                  >
                    <div className={styles.fieldHeader}>
                      <span
                        className={styles.fieldTypeIcon}
                        style={{
                          color: `var(--mantine-color-${FIELD_TYPE_COLOR[field.type]}-6)`,
                          fontSize: '0.875rem',
                        }}
                      >
                        {FIELD_TYPE_ICON[field.type]}
                      </span>
                      <span className={styles.fieldName}>
                        {field.label || field.name}
                      </span>
                      {isModified && (
                        <span style={{
                          fontSize: '0.5625rem',
                          padding: '0.0625rem 0.375rem',
                          borderRadius: 'var(--radius-xs)',
                          background: 'var(--mantine-color-yellow-light)',
                          color: 'var(--mantine-color-yellow-light-color)',
                          fontWeight: 800,
                          textTransform: 'uppercase',
                        }}>
                          modified
                        </span>
                      )}
                    </div>

                    {!isSelected && widget && (
                      <Text size="xs" c="dimmed" style={{ fontSize: '0.625rem' }}>
                        {coords && coords.x != null && coords.y != null && coords.width != null && coords.height != null
                          ? `(${Math.round(coords.x)}, ${Math.round(coords.y)}) ${Math.round(coords.width)}×${Math.round(coords.height)} pt`
                          : `(${Math.round(widget.x)}, ${Math.round(widget.y)}) ${Math.round(widget.width)}×${Math.round(widget.height)} pt`
                        }
                      </Text>
                    )}

                    {/* Inline property editor for the selected field */}
                    {isSelected && selectedFieldEditorData && (
                      <div
                        style={{ borderTop: '1px solid var(--mantine-color-default-border)', marginTop: '0.375rem', paddingTop: '0.375rem' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <FormFieldPropertyEditor
                          field={selectedFieldEditorData}
                          onChange={handlePropertyChange}
                          allowTypeChange
                          showCoordinates
                          onCoordsChange={handleCoordsChange}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </ScrollArea>

      {/* Status bar */}
      {modifiedFields.size > 0 && (
        <div className={styles.statusBar}>
          <span>
            <span className={styles.unsavedDot} />
            {modifiedFields.size} unsaved change{modifiedFields.size !== 1 ? 's' : ''}
          </span>
        </div>
      )}
    </div>
  );
}
