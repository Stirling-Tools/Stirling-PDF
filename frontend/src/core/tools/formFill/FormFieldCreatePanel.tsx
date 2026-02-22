/**
 * FormFieldCreatePanel — Left panel for "Create" mode.
 *
 * Contains:
 * - Field type palette (click to start placing)
 * - Pending fields list with property editing
 * - "Add Fields to PDF" commit button
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  Button,
  Text,
  ScrollArea,
  ActionIcon,
  Alert,
  Tooltip,
  UnstyledButton,
  Collapse,
  Loader,
} from '@mantine/core';
import SaveIcon from '@mui/icons-material/Save';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useFormFill } from '@app/tools/formFill/FormFillContext';
import { useFileState } from '@app/contexts/FileContext';
import { isStirlingFile } from '@app/types/fileContext';
import { FIELD_TYPE_ICON, FIELD_TYPE_COLOR } from '@app/tools/formFill/fieldMeta';
import { FormFieldPropertyEditor } from '@app/tools/formFill/FormFieldPropertyEditor';
import type { FormFieldType } from '@app/tools/formFill/types';
import styles from '@app/tools/formFill/FormFill.module.css';

const CREATABLE_TYPES: { type: FormFieldType; label: string }[] = [
  { type: 'text', label: 'Text' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'combobox', label: 'Dropdown' },
  { type: 'listbox', label: 'List' },
];

export function FormFieldCreatePanel() {
  const {
    creationState,
    setPlacingFieldType,
    removePendingField,
    updatePendingField,
    commitNewFields,
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

  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCommit = useCallback(async () => {
    if (!currentFile || !isStirlingFile(currentFile)) return;
    if (creationState.pendingFields.length === 0) return;

    setCommitting(true);
    setError(null);
    try {
      const blob = await commitNewFields(currentFile);
      // Apply the result to the viewer via custom event (same pattern as FormFill save)
      const event = new CustomEvent('formfill:apply', { detail: { blob } });
      window.dispatchEvent(event);
      // Re-fetch fields to pick up the new ones
      fetchFields(currentFile, currentFile.fileId);
    } catch (err: any) {
      setError(err?.message || 'Failed to add fields');
    } finally {
      setCommitting(false);
    }
  }, [currentFile, creationState.pendingFields, commitNewFields, fetchFields]);

  const { pendingFields, placingFieldType } = creationState;

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <Text size="xs" fw={600}>Select a field type, then drag on the PDF to place it.</Text>

        {/* Field type palette */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {CREATABLE_TYPES.map(({ type, label }) => {
            const isActive = placingFieldType === type;
            return (
              <Tooltip key={type} label={label} withArrow position="bottom">
                <UnstyledButton
                  onClick={() => setPlacingFieldType(isActive ? null : type)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 2,
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1.5px solid ${isActive ? `var(--mantine-color-${FIELD_TYPE_COLOR[type]}-5)` : 'var(--border-default, var(--mantine-color-default-border))'}`,
                    background: isActive ? `var(--mantine-color-${FIELD_TYPE_COLOR[type]}-light)` : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    minWidth: 52,
                  }}
                >
                  <span style={{ fontSize: '1.125rem', color: `var(--mantine-color-${FIELD_TYPE_COLOR[type]}-6)`, lineHeight: 1, display: 'flex' }}>
                    {FIELD_TYPE_ICON[type]}
                  </span>
                  <Text size="xs" fw={600} style={{ fontSize: '0.625rem', textTransform: 'uppercase' }}>
                    {label}
                  </Text>
                </UnstyledButton>
              </Tooltip>
            );
          })}
        </div>

        {pendingFields.length > 0 && (
          <Button
            leftSection={committing ? <Loader size={14} color="white" /> : <SaveIcon sx={{ fontSize: 14 }} />}
            size="xs"
            onClick={handleCommit}
            loading={committing}
            fullWidth
          >
            Add {pendingFields.length} Field{pendingFields.length !== 1 ? 's' : ''} to PDF
          </Button>
        )}

        {error && (
          <Alert icon={<WarningAmberIcon sx={{ fontSize: 16 }} />} color="red" variant="light" p="xs" radius="sm">
            <Text size="xs">{error}</Text>
          </Alert>
        )}
      </div>

      {/* Pending fields list */}
      <ScrollArea className={styles.fieldList}>
        <div className={styles.fieldListInner}>
          {pendingFields.length === 0 && (
            <div className={styles.emptyState} style={{ padding: '2rem 1rem' }}>
              <Text size="xs" c="dimmed" ta="center">
                No pending fields. Select a type above and drag on the PDF to create one.
              </Text>
            </div>
          )}

          {pendingFields.map((field, idx) => (
            <div key={idx} className={styles.fieldCard}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
              >
                <span style={{ fontSize: '0.875rem', color: `var(--mantine-color-${FIELD_TYPE_COLOR[field.type]}-6)`, display: 'flex' }}>
                  {FIELD_TYPE_ICON[field.type]}
                </span>
                <Text size="xs" fw={600} style={{ flex: 1 }}>
                  {field.name || `New ${field.type}`}
                </Text>
                <Text size="xs" c="dimmed">p.{field.pageIndex + 1}</Text>
                <ActionIcon variant="subtle" color="red" size="sm" onClick={(e) => { e.stopPropagation(); removePendingField(idx); }}>
                  <DeleteIcon sx={{ fontSize: 14 }} />
                </ActionIcon>
                {expandedIdx === idx
                  ? <ExpandLessIcon sx={{ fontSize: 16, opacity: 0.5 }} />
                  : <ExpandMoreIcon sx={{ fontSize: 16, opacity: 0.5 }} />
                }
              </div>

              <Collapse in={expandedIdx === idx}>
                <div style={{ paddingTop: 8 }}>
                  <FormFieldPropertyEditor
                    field={field}
                    onChange={(updated) => updatePendingField(idx, updated)}
                    showCoordinates
                  />
                </div>
              </Collapse>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
