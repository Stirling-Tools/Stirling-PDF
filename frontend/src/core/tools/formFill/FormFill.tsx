/**
 * FormFill: The tool component that renders in the left ToolPanel
 * when the "Fill Form" tool is selected.
 *
 * Redesigned with:
 * - Mode tabs for future extensibility (Fill / Make / Batch / Modify)
 * - Clean visual hierarchy with proper spacing
 * - Shared FieldInput component (eliminates duplication)
 * - CSS module for theme-consistent styling
 * - Status bar at bottom for contextual info
 */
import React, { useEffect, useCallback, useState, useRef, useMemo } from 'react';
import {
  Button,
  Text,
  Alert,
  Switch,
  Loader,
  ScrollArea,
  Progress,
  Tooltip,
  ActionIcon,
} from '@mantine/core';
import { useFormFill, useAllFormValues } from '@app/tools/formFill/FormFillContext';
import { useNavigation } from '@app/contexts/NavigationContext';
import { useViewer } from '@app/contexts/ViewerContext';
import { useFileState } from '@app/contexts/FileContext';
import { Skeleton } from '@mantine/core';
import { isStirlingFile, getFormFillFileId } from '@app/types/fileContext';
import type { BaseToolProps } from '@app/types/tool';
import type { FormField } from '@app/tools/formFill/types';
import { FieldInput } from '@app/tools/formFill/FieldInput';
import { FIELD_TYPE_ICON, FIELD_TYPE_COLOR } from '@app/tools/formFill/fieldMeta';
import SaveIcon from '@mui/icons-material/Save';
import RefreshIcon from '@mui/icons-material/Refresh';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import EditNoteIcon from '@mui/icons-material/EditNote';
import PostAddIcon from '@mui/icons-material/PostAdd';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import BuildCircleIcon from '@mui/icons-material/BuildCircle';
import DescriptionIcon from '@mui/icons-material/Description';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import { extractFormFieldsCsv, extractFormFieldsXlsx } from '@app/tools/formFill/formApi';
import styles from '@app/tools/formFill/FormFill.module.css';

// ---------------------------------------------------------------------------
// Mode tabs — extensible for future form tools
// ---------------------------------------------------------------------------

type FormMode = 'fill' | 'make' | 'batch' | 'modify';

interface ModeTabDef {
  id: FormMode;
  label: string;
  icon: React.ReactNode;
  ready: boolean;
}

const _MODE_TABS: ModeTabDef[] = [
  { id: 'fill', label: 'Fill', icon: <EditNoteIcon className={styles.modeTabIcon} />, ready: true },
  { id: 'make', label: 'Create', icon: <PostAddIcon className={styles.modeTabIcon} />, ready: false },
  { id: 'batch', label: 'Batch', icon: <FileCopyIcon className={styles.modeTabIcon} />, ready: false },
  { id: 'modify', label: 'Modify', icon: <BuildCircleIcon className={styles.modeTabIcon} />, ready: false },
];

// ---------------------------------------------------------------------------
// Coming-soon placeholder for unimplemented tabs
// ---------------------------------------------------------------------------

// ComingSoonPlaceholder — re-enable when mode tabs are exposed
// function ComingSoonPlaceholder({ mode }: { mode: ModeTabDef }) {
//   return (
//     <div className={styles.comingSoon}>
//       <DescriptionIcon className={styles.comingSoonIcon} />
//       <div className={styles.comingSoonTitle}>{mode.label} Forms</div>
//       <div className={styles.comingSoonDesc}>
//         This feature is coming soon. Stay tuned!
//       </div>
//     </div>
//   );
// }

// ---------------------------------------------------------------------------
// Main FormFill component
// ---------------------------------------------------------------------------

const FormFill = (_props: BaseToolProps) => {
  const { selectedTool } = useNavigation();
  const { selectors, state: fileState } = useFileState();

  const {
    state: formState,
    fetchFields,
    submitForm,
    setValue,
    setActiveField,
    validateForm,
  } = useFormFill();

  const allValues = useAllFormValues();
  const { validationErrors } = formState;

  const { scrollActions } = useViewer();

  // Mode system is temporarily restricted to 'fill' only.
  // Other modes (make, batch, modify) are defined above but not yet exposed in the UI.
  // When ready, uncomment the SegmentedControl and mode state below.
  // const [mode, setMode] = useState<FormMode>('fill');
  const mode: FormMode = 'fill';
  const [flatten, setFlatten] = useState(false);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [lastSavedFlatten, setLastSavedFlatten] = useState<boolean | null>(null);
  const flattenChanged = lastSavedFlatten !== null && flatten !== lastSavedFlatten;

  const savingRef = useRef(false);

  const handleExtractJson = useCallback(() => {
    setExtracting(true);
    try {
      const data = JSON.stringify(allValues, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `form-data-${new Date().getTime()}.json`;
      a.click();
      // Delay revocation so the browser has time to start the download
      setTimeout(() => URL.revokeObjectURL(url), 250);
    } finally {
      setExtracting(false);
    }
  }, [allValues]);
  const activeFieldRef = useRef<HTMLDivElement>(null);
  const isDirtyRef = useRef(formState.isDirty);
  isDirtyRef.current = formState.isDirty;

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

  const handleExtractCsv = useCallback(async () => {
    if (!currentFile) return;
    setExtracting(true);
    try {
      const blob = await extractFormFieldsCsv(currentFile, allValues);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `form-data-${new Date().getTime()}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 250);
    } catch (err) {
      console.error('[FormFill] CSV extraction failed:', err);
      setSaveError('Failed to extract CSV');
    } finally {
      setExtracting(false);
    }
  }, [currentFile, allValues]);

  const handleExtractXlsx = useCallback(async () => {
    if (!currentFile) return;
    setExtracting(true);
    try {
      const blob = await extractFormFieldsXlsx(currentFile, allValues);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `form-data-${new Date().getTime()}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 250);
    } catch (err) {
      console.error('[FormFill] XLSX extraction failed:', err);
      setSaveError('Failed to extract XLSX');
    } finally {
      setExtracting(false);
    }
  }, [currentFile, allValues]);

  const isActive = selectedTool === 'formFill';

  useEffect(() => {
    if (formState.activeFieldName && activeFieldRef.current) {
      activeFieldRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [formState.activeFieldName]);

  const handleSave = useCallback(async () => {
    // Ref-based guard prevents concurrent saves that cause file duplication
    if (savingRef.current) return;
    if (!currentFile || !isStirlingFile(currentFile)) return;

    if (!validateForm()) {
      setSaveError('Please fill in all required fields');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setSaveError(null);

    try {
      const filledBlob = await submitForm(currentFile, flatten);

      // Track the flatten value at save so toggling it later re-enables Save
      setLastSavedFlatten(flatten);

      // Dispatch to the viewer's handleFormApply via custom event.
      // This ensures the viewer tracks the new file ID, preserves
      // scroll position and rotation — instead of our own consumeFiles
      // call which would lose the viewer's file tracking context.
      const event = new CustomEvent('formfill:apply', { detail: { blob: filledBlob } });
      window.dispatchEvent(event);
    } catch (err: any) {
      const message = err?.response?.status === 413
        ? 'File too large. Try reducing the PDF size first.'
        : err?.response?.status === 400
        ? 'Invalid form data. Please check all fields.'
        : err?.message || 'Failed to save filled form';
      setSaveError(message);
      console.error('[FormFill] Save failed:', err);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [currentFile, submitForm, flatten, validateForm]);

  // Keyboard shortcut: Ctrl+S to save
  const flattenChangedRef = useRef(flattenChanged);
  flattenChangedRef.current = flattenChanged;
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isDirtyRef.current || flattenChangedRef.current) handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, handleSave]);

  // Data loss prevention: warn on beforeunload if dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (formState.isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [formState.isDirty]);

  const handleRefresh = useCallback(() => {
    if (currentFile) {
      fetchFields(currentFile, getFormFillFileId(currentFile) ?? undefined);
    }
  }, [currentFile, fetchFields]);

  const handleValueChange = useCallback(
    (fieldName: string, value: string) => {
      setValue(fieldName, value);
    },
    [setValue]
  );

  const handleFieldClick = useCallback(
    (fieldName: string, pageIndex?: number) => {
      setActiveField(fieldName);
      if (pageIndex !== undefined) {
        scrollActions.scrollToPage(pageIndex + 1);
      }
    },
    [setActiveField, scrollActions]
  );

  // Memoize fields grouped by page
  const { sortedPages, fieldsByPage } = useMemo(() => {
    const byPage = new Map<number, FormField[]>();
    for (const field of formState.fields) {
      const pageIndex =
        field.widgets && field.widgets.length > 0 ? field.widgets[0].pageIndex : 0;
      if (!byPage.has(pageIndex)) {
        byPage.set(pageIndex, []);
      }
      byPage.get(pageIndex)!.push(field);
    }
    const pages = Array.from(byPage.keys()).sort((a, b) => a - b);
    return { sortedPages: pages, fieldsByPage: byPage };
  }, [formState.fields]);

  // Progress tracking

  const fillableFields = useMemo(() => {
    return formState.fields.filter((f) => f.type !== 'button' && f.type !== 'signature');
  }, [formState.fields]);

  const fillableCount = fillableFields.length;

  const filledCount = useMemo(() => {
    return fillableFields.filter((f) => {
      const v = allValues[f.name];
      return v && v !== 'Off' && v.trim() !== '';
    }).length;
  }, [fillableFields, allValues]);

  const requiredFields = useMemo(() => {
    return fillableFields.filter((f) => f.required);
  }, [fillableFields]);

  const requiredCount = requiredFields.length;

  const filledRequiredCount = useMemo(() => {
    return requiredFields.filter((f) => {
      const v = allValues[f.name];
      return v && v !== 'Off' && v.trim() !== '';
    }).length;
  }, [requiredFields, allValues]);

  if (!isActive) return null;

  // const currentModeDef = MODE_TABS.find((t) => t.id === mode)!;

  return (
    <div className={styles.root}>
      {/* ---- Mode selection (commented out until additional modes are implemented) ----
      <div className={styles.modeTabs}>
        <SegmentedControl
          value={mode}
          onChange={(val) => setMode(val as FormMode)}
          data={MODE_TABS.map((tab) => ({
            value: tab.id,
            label: (
              <div className={styles.segmentedLabel}>
                {tab.icon}
                <span>{tab.label}</span>
              </div>
            ),
          }))}
          fullWidth
          radius="xs"
          size="xs"
          classNames={{
            root: styles.segmentedRoot,
            indicator: styles.segmentedIndicator,
            control: styles.segmentedControl,
            label: styles.segmentedInnerLabel,
          }}
        />
      </div>
      ---- */}

      {/* ---- Coming-soon for non-ready tabs (hidden while mode tabs are disabled) ---- */}
      {/* !currentModeDef.ready && <ComingSoonPlaceholder mode={currentModeDef} /> */}

      {/* ---- Fill Form content ---- */}
      {mode === 'fill' && (
        <>
          {/* Header / controls */}
          <div className={styles.header}>
            {/* Loading state */}
            {formState.loading && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Loader size={14} />
                  <Text size="xs" c="dimmed">
                    Analysing form fields...
                  </Text>
                </div>
                <Skeleton height={48} radius="sm" />
                <Skeleton height={48} radius="sm" />
              </>
            )}

            {/* Error state */}
            {formState.error && (
              <Alert
                icon={<WarningAmberIcon sx={{ fontSize: 16 }} />}
                color="red"
                variant="light"
                p="xs"
                radius="sm"
              >
                <Text size="xs">{formState.error}</Text>
              </Alert>
            )}

            {/* Ready state with fields */}
            {!formState.loading && formState.fields.length > 0 && (
              <>
                {/* Progress bar */}
                <div>
                  <div className={styles.progressRow}>
                    <span className={styles.progressLabel}>
                      {filledCount} / {fillableCount} filled
                      {requiredCount > 0 && (
                        <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>
                          ({filledRequiredCount}/{requiredCount} req.)
                        </span>
                      )}
                    </span>
                    <span className={styles.progressLabel}>
                      {fillableCount > 0
                        ? Math.round((filledCount / fillableCount) * 100)
                        : 0}
                      %
                    </span>
                  </div>
                  <Progress
                    value={fillableCount > 0 ? (filledCount / fillableCount) * 100 : 0}
                    size={6}
                    radius="xl"
                    color={filledRequiredCount === requiredCount ? 'teal' : 'blue'}
                    mt={4}
                  />
                </div>

                {/* Flatten toggle */}
                <Switch
                  label="Flatten after filling"
                  checked={flatten}
                  onChange={(e) => setFlatten(e.currentTarget.checked)}
                  size="xs"
                  styles={{
                    label: { fontSize: '0.75rem', cursor: 'pointer' },
                  }}
                />

                {/* Action buttons */}
                <div className={styles.actionBar}>
                  <div className={styles.primaryActions}>
                    <Button
                      leftSection={<SaveIcon sx={{ fontSize: 14 }} />}
                      size="xs"
                      onClick={handleSave}
                      loading={saving}
                      disabled={!formState.isDirty && !flattenChanged}
                    >
                      Save
                    </Button>

                    <Tooltip label="Re-scan fields" withArrow position="bottom">
                      <ActionIcon
                        variant="light"
                        size="md"
                        onClick={handleRefresh}
                        aria-label="Re-scan form fields"
                      >
                        <RefreshIcon sx={{ fontSize: 16 }} />
                      </ActionIcon>
                    </Tooltip>
                  </div>

                  <div className={styles.secondaryActions}>
                    <Button
                      variant="light"
                      color="blue"
                      leftSection={<FileDownloadIcon sx={{ fontSize: 14 }} />}
                      loading={extracting}
                      onClick={handleExtractJson}
                      size="xs"
                    >
                      JSON
                    </Button>

                    <Button
                      variant="light"
                      color="blue"
                      leftSection={<FileDownloadIcon sx={{ fontSize: 14 }} />}
                      loading={extracting}
                      onClick={handleExtractCsv}
                      size="xs"
                    >
                      CSV
                    </Button>

                    <Button
                      variant="light"
                      color="blue"
                      leftSection={<FileDownloadIcon sx={{ fontSize: 14 }} />}
                      loading={extracting}
                      onClick={handleExtractXlsx}
                      size="xs"
                    >
                      XLSX
                    </Button>
                  </div>
                </div>

                {/* Error message */}
                {saveError && (
                  <Alert color="red" variant="light" p="xs" radius="sm">
                    <Text size="xs">{saveError}</Text>
                  </Alert>
                )}
              </>
            )}

            {/* Empty state */}
            {!formState.loading && formState.fields.length === 0 && !formState.error && (
              <div className={styles.emptyState}>
                <DescriptionIcon className={styles.emptyStateIcon} />
                <span className={styles.emptyStateText}>
                  No fillable form fields found in this PDF.
                </span>
              </div>
            )}
          </div>

          {/* ---- Scrollable field list ---- */}
          {!formState.loading && formState.fields.length > 0 && (
            <ScrollArea className={styles.fieldList}>
              <div className={styles.fieldListInner}>
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
                      const isFieldActive = formState.activeFieldName === field.name;
                      const hasError = !!validationErrors[field.name];
                      const pageIndex =
                        field.widgets && field.widgets.length > 0
                          ? field.widgets[0].pageIndex
                          : undefined;

                      return (
                        <div
                          key={field.name}
                          ref={isFieldActive ? activeFieldRef : undefined}
                          className={`${styles.fieldCard} ${
                            isFieldActive ? styles.fieldCardActive : ''
                          } ${hasError ? styles.fieldCardError : ''}`}
                          onClick={() => handleFieldClick(field.name, pageIndex)}
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
                            {field.required && (
                              <span className={styles.fieldRequired}>req</span>
                            )}
                          </div>

                          {field.type !== 'button' && field.type !== 'signature' && (
                            <div
                              className={styles.fieldInputWrap}
                            >
                              <FieldInput
                                field={field}
                                onValueChange={handleValueChange}
                              />
                            </div>
                          )}

                          {hasError && (
                            <div className={styles.fieldError}>
                              {validationErrors[field.name]}
                            </div>
                          )}

                          {field.tooltip && (
                            <div className={styles.fieldHint}>
                              {field.tooltip}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))}
              </div>
            </ScrollArea>
          )}

          {/* ---- Status bar ---- */}
          {!formState.loading && formState.fields.length > 0 && (
            <div className={styles.statusBar}>
              <span>
                {(formState.isDirty || flattenChanged) && <span className={styles.unsavedDot} />}
                {formState.isDirty || flattenChanged ? 'Unsaved changes' : 'All saved'}
              </span>
              <span>Ctrl+S to save</span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FormFill;
