/**
 * Form Editor tool panel: fill values, create new fields, or modify existing ones.
 */
import React, {
  useEffect,
  useCallback,
  useState,
  useRef,
  useMemo,
} from "react";
import {
  Text,
  Alert,
  Switch,
  Loader,
  ScrollArea,
  Progress,
  Tooltip,
  Stack,
} from "@mantine/core";
import { createToolSteps } from "@editor/components/tools/shared/ToolStep";
import { UnsavedChangesDialog } from "@editor/components/shared/UnsavedChangesDialog";
import { SegmentedControl } from "@editor/ui/SegmentedControl";
import { Button } from "@editor/ui/Button";
import { Modal } from "@editor/ui/Modal";
import { ActionIcon } from "@editor/ui/ActionIcon";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import {
  useFormFill,
  useAllFormValues,
} from "@editor/tools/formFill/FormFillContext";
import { useNavigation } from "@editor/contexts/NavigationContext";
import { useFieldShortcuts } from "@editor/tools/formFill/useFieldShortcuts";
import { serverMessage } from "@editor/tools/formFill/useFormCommit";
import { useViewer } from "@editor/contexts/ViewerContext";
import { usePdfAccess } from "@editor/hooks/usePdfAccess";
import { useAllFiles, useFileState } from "@editor/contexts/FileContext";
import { Skeleton } from "@mantine/core";
import { isStirlingFile, getFormFillFileId } from "@editor/types/fileContext";
import type { BaseToolProps } from "@editor/types/tool";
import type { FormField } from "@editor/tools/formFill/types";
import { FieldInput } from "@editor/tools/formFill/FieldInput";
import {
  FIELD_TYPE_ICON,
  FIELD_TYPE_COLOR,
} from "@editor/tools/formFill/fieldMeta";
import { Icon } from "@editor/ui/Icon";
import {
  extractFormFieldsCsv,
  extractFormFieldsXlsx,
} from "@editor/tools/formFill/formApi";
import {
  buildXfdf,
  FormDataParseError,
  FormDataTooLargeError,
  MAX_FORM_DATA_BYTES,
  parseFormDataFile,
  reconcileImportedValues,
  type FormDataParseErrorCode,
} from "@editor/utils/formDataExchange";
import type { FormMode } from "@editor/tools/formFill/types";
import { FormFieldCreatePanel } from "@editor/tools/formFill/FormFieldCreatePanel";
import { FormFieldModifyPanel } from "@editor/tools/formFill/FormFieldModifyPanel";
import { assertFilesNotBlocked } from "@editor/services/policyFileGuard";
import { dispatchFormApply } from "@editor/tools/formFill/formFillEvents";
import { useFormAutoMode } from "@editor/tools/formFill/useFormAutoMode";
import { privateContentClassName } from "@editor/components/shared/privateContentClassName";
import styles from "@editor/tools/formFill/FormFill.module.css";

// ---------------------------------------------------------------------------
// Mode tabs — extensible for future form tools
// ---------------------------------------------------------------------------

interface ModeTabDef {
  id: FormMode;
  label: string;
  icon: React.ReactNode;
}

/** Locale key and English fallback per parse-failure code. */
const IMPORT_ERROR_KEYS: Record<FormDataParseErrorCode, [string, string]> = {
  invalidXml: [
    "formFill.importInvalidXml",
    "File is not valid XML: {{detail}}",
  ],
  xfdfDoctype: [
    "formFill.importXfdfDoctype",
    "XFDF must not declare a DOCTYPE.",
  ],
  notXfdf: [
    "formFill.importNotXfdf",
    "Not an XFDF file: expected an <xfdf> root element.",
  ],
  notFdf: [
    "formFill.importNotFdf",
    "Not an FDF file: no /FDF dictionary found.",
  ],
  fdfNoFields: [
    "formFill.importFdfNoFields",
    "FDF file has no /Fields array - there is no form data to import.",
  ],
  unrecognised: [
    "formFill.importUnrecognised",
    "Unrecognised form data file. Expected XFDF (<xfdf> XML) or FDF (%FDF-).",
  ],
};

// ---------------------------------------------------------------------------
// Main FormFill component
// ---------------------------------------------------------------------------

async function applyFormChanges(blob: Blob): Promise<void> {
  assertFilesNotBlocked();
  await dispatchFormApply(blob);
}

const FormFill = (_props: BaseToolProps) => {
  const { t } = useTranslation();
  const {
    selectedTool,
    registerUnsavedChangesChecker,
    unregisterUnsavedChangesChecker,
    setHasUnsavedChanges,
    registerNavigationWarningHandlers,
    unregisterNavigationWarningHandlers,
  } = useNavigation();
  const { state: fileState } = useFileState();

  const {
    state: formState,
    fetchFields,
    submitForm,
    setValue,
    setActiveField,
    validateForm,
    mode,
    setMode,
    hasUncommittedChanges,
    commitDesign,
    discardDesign,
    discardValues,
    pendingFields,
    modifiedFields,
    deletedFieldNames,
    saving,
    setSaving,
    setCreationType,
    setSelectedField,
    setPreviewing,
  } = useFormFill();

  const MODE_TABS: ModeTabDef[] = useMemo(
    () => [
      {
        id: "fill",
        label: t("formFill.mode.fill", "Fill"),
        icon: (
          <Icon name="file-pen" size="1rem" className={styles.modeTabIcon} />
        ),
      },
      {
        id: "create",
        label: t("formFill.mode.create", "Create"),
        icon: (
          <Icon name="file-plus" size="1rem" className={styles.modeTabIcon} />
        ),
      },
      {
        id: "modify",
        label: t("formFill.mode.modify", "Modify"),
        icon: <Icon name="wrench" size="1rem" className={styles.modeTabIcon} />,
      },
    ],
    [t],
  );

  const allValues = useAllFormValues();
  const { validationErrors } = formState;

  const { scrollActions, activeFileId } = useViewer();

  const [flatten, setFlatten] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [importSummary, setImportSummary] = useState<{
    message: string;
    anyApplied: boolean;
  } | null>(null);
  const [pendingImport, setPendingImport] = useState<{
    applied: Record<string, string>;
    summary: { message: string; anyApplied: boolean };
    replaced: string[];
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const importedValuesRef = useRef<Record<string, string>>({});

  useEffect(() => {
    importedValuesRef.current = {};
  }, [formState.fields]);

  const flattenChanged = flatten;

  const savingRef = useRef(false);

  const handleExtractJson = useCallback(() => {
    setExtracting(true);
    try {
      const data = JSON.stringify(allValues, null, 2);
      const blob = new Blob([data], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
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
  useFieldShortcuts();

  const isDirtyRef = useRef(formState.isDirty);
  isDirtyRef.current = formState.isDirty || flatten;

  // Fields drawn or edited but never applied are lost on navigation, so the app's existing
  // leave-warning needs to hear about them the way other tools report theirs.
  const hasUncommittedRef = useRef(false);
  hasUncommittedRef.current = hasUncommittedChanges;
  useEffect(() => {
    registerUnsavedChangesChecker(
      () =>
        hasUncommittedRef.current || isDirtyRef.current || savingRef.current,
    );
    return () => unregisterUnsavedChangesChecker();
  }, [registerUnsavedChangesChecker, unregisterUnsavedChangesChecker]);

  // requestNavigation gates on this flag rather than on the checker above.
  useEffect(() => {
    setHasUnsavedChanges(
      hasUncommittedChanges || formState.isDirty || flatten || saving,
    );
  }, [
    hasUncommittedChanges,
    formState.isDirty,
    flatten,
    saving,
    setHasUnsavedChanges,
  ]);

  // Subscribing read: getFiles() during render doesn't re-run when the workbench
  // changes, so the panel kept showing the pre-hydration (or pre-version) file.
  const { files: activeFiles } = useAllFiles();
  const selectedFileIds = fileState.ui.selectedFileIds;
  const viewedFile = useMemo(() => {
    if (activeFiles.length === 0) return null;
    const viewed = activeFiles.find(
      (file) => isStirlingFile(file) && file.fileId === activeFileId,
    );
    if (viewed) return viewed;
    if (selectedFileIds.length > 0) {
      const sel = activeFiles.find(
        (f) => isStirlingFile(f) && selectedFileIds.includes(f.fileId),
      );
      if (sel) return sel;
    }
    return activeFiles[0];
  }, [activeFiles, selectedFileIds, activeFileId]);
  const pdfAccess = usePdfAccess(viewedFile);
  const currentFile = pdfAccess?.encrypted === false ? viewedFile : null;

  const handleExtractCsv = useCallback(async () => {
    if (!currentFile) return;
    setExtracting(true);
    try {
      const blob = await extractFormFieldsCsv(currentFile, allValues);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `form-data-${new Date().getTime()}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 250);
    } catch (err) {
      console.error("[FormFill] CSV extraction failed:", err);
      setSaveError(t("formFill.extractCsvError", "Failed to extract CSV"));
    } finally {
      setExtracting(false);
    }
  }, [currentFile, allValues]);

  /**
   * Export as XFDF - the interchange format Acrobat's "Import Data" reads, so
   * a form filled here can be handed back to an Acrobat-based process.
   */
  const handleExportXfdf = useCallback(() => {
    setExtracting(true);
    try {
      const multiSelectFields = formState.fields
        .filter((field) => field.multiSelect)
        .map((field) => field.name);
      const xfdf = buildXfdf(allValues, {
        pdfHref: currentFile instanceof File ? currentFile.name : undefined,
        multiSelectFields,
      });
      const blob = new Blob([xfdf], { type: "application/vnd.adobe.xfdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `form-data-${new Date().getTime()}.xfdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 250);
    } finally {
      setExtracting(false);
    }
  }, [allValues, currentFile, formState.fields]);

  const formatNameList = useCallback(
    (names: string[]) => {
      const NAME_LIMIT = 5;
      return names.length > NAME_LIMIT
        ? t("formFill.importSkippedNames", "{{names}} and {{rest}} more", {
            names: names.slice(0, NAME_LIMIT).join(", "),
            rest: names.length - NAME_LIMIT,
          })
        : names.join(", ");
    },
    [t],
  );

  const applyImport = useCallback(
    (
      applied: Record<string, string>,
      summary: { message: string; anyApplied: boolean },
    ) => {
      for (const [name, value] of Object.entries(applied)) {
        setValue(name, value);
      }
      Object.assign(importedValuesRef.current, applied);
      setImportSummary(summary);
    },
    [setValue],
  );

  /**
   * Import an Acrobat XFDF/FDF export into the open form. Values for fields
   * this document doesn't have are reported rather than silently dropped.
   */
  const handleImportFormData = useCallback(
    async (file: File) => {
      setSaveError(null);
      setImportSummary(null);
      try {
        const { values, format } = await parseFormDataFile(file);
        const { applied, unmatched } = reconcileImportedValues(
          values,
          formState.fields.map((field) => field.name),
        );
        // Two sentences, not one: each count needs its own plural form, so
        // "Imported 1 field" can sit next to "3 fields are not in this PDF".
        const imported = t(
          "formFill.importSuccess",
          "Imported {{count}} field(s) from {{format}}",
          { count: Object.keys(applied).length, format: format.toUpperCase() },
        );
        const skipped =
          unmatched.length > 0
            ? t(
                "formFill.importSkipped",
                "{{count}} field(s) are not in this PDF: {{names}}",
                { count: unmatched.length, names: formatNameList(unmatched) },
              )
            : "";
        const summary = {
          message: [imported, skipped].filter(Boolean).join(". "),
          anyApplied: Object.keys(applied).length > 0,
        };
        const replaced = formState.fields
          .filter((field) => {
            if (!(field.name in applied)) return false;
            const current = allValues[field.name] ?? "";
            return (
              current !== (field.value ?? "") &&
              current !== importedValuesRef.current[field.name] &&
              current !== applied[field.name]
            );
          })
          .map((field) => field.label || field.name);
        if (replaced.length > 0) {
          setPendingImport({ applied, summary, replaced });
          return;
        }
        applyImport(applied, summary);
      } catch (err) {
        console.error("[FormFill] Form data import failed:", err);
        if (err instanceof FormDataTooLargeError) {
          setSaveError(
            t(
              "formFill.importTooLarge",
              "That file is too large to import. Form data files must be under {{limit}} MB.",
              { limit: Math.round(MAX_FORM_DATA_BYTES / (1024 * 1024)) },
            ),
          );
          return;
        }
        if (err instanceof FormDataParseError) {
          const [key, fallback] = IMPORT_ERROR_KEYS[err.code];
          setSaveError(t(key, fallback, { detail: err.detail ?? "" }));
          return;
        }
        setSaveError(
          err instanceof Error
            ? err.message
            : t("formFill.importError", "Failed to import form data"),
        );
      }
    },
    [formState.fields, allValues, applyImport, formatNameList, t],
  );

  const confirmPendingImport = useCallback(() => {
    if (!pendingImport) return;
    applyImport(pendingImport.applied, pendingImport.summary);
    setPendingImport(null);
  }, [pendingImport, applyImport]);

  const handleExtractXlsx = useCallback(async () => {
    if (!currentFile) return;
    setExtracting(true);
    try {
      const blob = await extractFormFieldsXlsx(currentFile, allValues);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `form-data-${new Date().getTime()}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 250);
    } catch (err) {
      console.error("[FormFill] XLSX extraction failed:", err);
      setSaveError(t("formFill.extractXlsxError", "Failed to extract XLSX"));
    } finally {
      setExtracting(false);
    }
  }, [currentFile, allValues]);

  const isActive = selectedTool === "formFill";
  useFormAutoMode(getFormFillFileId(currentFile), isActive);

  // Arming lives in an app-level provider, so leaving the tool would otherwise keep the page
  // in crosshair mode and stage fields for whatever the user opened next.
  useEffect(() => {
    if (isActive) return;
    setCreationType(null);
    setSelectedField(null);
    setPreviewing(false);
  }, [isActive, setCreationType, setSelectedField, setPreviewing]);

  useEffect(() => {
    if (formState.activeFieldName && activeFieldRef.current) {
      activeFieldRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [formState.activeFieldName]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (
      savingRef.current ||
      formState.loading ||
      !currentFile ||
      !isStirlingFile(currentFile)
    )
      return false;
    if (mode === "fill" && !validateForm()) {
      setSaveError(
        t("formFill.requiredFieldsError", "Please fill in all required fields"),
      );
      return false;
    }
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setImportSummary(null);
    try {
      assertFilesNotBlocked();
      if (mode === "fill") {
        await applyFormChanges(await submitForm(currentFile, flatten));
        setFlatten(false);
      } else {
        await commitDesign(currentFile, applyFormChanges);
      }
      return true;
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      setSaveError(
        (await serverMessage(err)) ||
          (status === 413
            ? "File too large. Try reducing the PDF size first."
            : undefined) ||
          (err instanceof Error ? err.message : undefined) ||
          t("formFill.applyFailed", "Could not apply the changes"),
      );
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [
    formState.loading,
    currentFile,
    mode,
    validateForm,
    t,
    setSaving,
    submitForm,
    flatten,
    commitDesign,
  ]);

  const discardCurrentDraft = useCallback(() => {
    if (mode === "fill") {
      discardValues();
      setFlatten(false);
    } else {
      discardDesign();
    }
    setSaveError(null);
    setImportSummary(null);
  }, [mode, discardValues, discardDesign]);

  useEffect(() => {
    if (!isActive) return;
    registerNavigationWarningHandlers({
      onApplyAndContinue: async () => {
        if (!(await handleSave()))
          throw new Error("Form changes could not be saved.");
      },
      onDiscardAndContinue: async () => {
        discardCurrentDraft();
      },
    });
    return () => unregisterNavigationWarningHandlers();
  }, [
    isActive,
    handleSave,
    discardCurrentDraft,
    registerNavigationWarningHandlers,
    unregisterNavigationWarningHandlers,
  ]);

  const [pendingMode, setPendingMode] = useState<FormMode | null>(null);
  const requestMode = useCallback(
    (next: FormMode) => {
      if (next === mode || saving || formState.loading) return;
      const crossesSurface = (mode === "fill") !== (next === "fill");
      if (
        crossesSurface &&
        (formState.isDirty || flatten || hasUncommittedChanges)
      ) {
        setPendingMode(next);
        return;
      }
      setSaveError(null);
      setImportSummary(null);
      setMode(next);
    },
    [
      mode,
      saving,
      formState.loading,
      formState.isDirty,
      flatten,
      hasUncommittedChanges,
      setMode,
    ],
  );

  const discardAndSwitch = useCallback(() => {
    if (savingRef.current) return;
    discardCurrentDraft();
    if (pendingMode) setMode(pendingMode);
    setPendingMode(null);
  }, [discardCurrentDraft, pendingMode, setMode]);

  const applyAndSwitch = useCallback(async () => {
    const saved = await handleSave();
    if (saved && pendingMode) setMode(pendingMode);
    setPendingMode(null);
  }, [handleSave, pendingMode, setMode]);

  // Keyboard shortcut: Ctrl+S to save
  const flattenChangedRef = useRef(flattenChanged);
  flattenChangedRef.current = flattenChanged;
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (
          isDirtyRef.current ||
          flattenChangedRef.current ||
          hasUncommittedRef.current
        )
          void handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isActive, handleSave]);

  // Data loss prevention: warn on beforeunload if dirty
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (formState.isDirty || flatten || hasUncommittedChanges || saving) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [formState.isDirty, flatten, hasUncommittedChanges, saving]);

  const handleRefresh = useCallback(() => {
    if (currentFile) {
      fetchFields(currentFile, getFormFillFileId(currentFile) ?? undefined);
    }
  }, [currentFile, fetchFields]);

  const handleValueChange = useCallback(
    (fieldName: string, value: string) => {
      setValue(fieldName, value);
    },
    [setValue],
  );

  const handleFieldClick = useCallback(
    (fieldName: string, pageIndex?: number) => {
      setActiveField(fieldName);
      if (pageIndex !== undefined) {
        scrollActions.scrollToPage(pageIndex + 1);
      }
    },
    [setActiveField, scrollActions],
  );

  // Progress tracking
  const fillableFields = useMemo(() => {
    return formState.fields.filter(
      (f) => f.type !== "button" && f.type !== "signature",
    );
  }, [formState.fields]);

  // Memoize fillable fields grouped by page (signatures/buttons excluded)
  const { sortedPages, fieldsByPage } = useMemo(() => {
    const byPage = new Map<number, FormField[]>();
    for (const field of fillableFields) {
      const pageIndex =
        field.widgets && field.widgets.length > 0
          ? field.widgets[0].pageIndex
          : 0;
      if (!byPage.has(pageIndex)) {
        byPage.set(pageIndex, []);
      }
      byPage.get(pageIndex)!.push(field);
    }
    const pages = Array.from(byPage.keys()).sort((a, b) => a - b);
    return { sortedPages: pages, fieldsByPage: byPage };
  }, [fillableFields]);

  const fillableCount = fillableFields.length;

  const filledCount = useMemo(() => {
    return fillableFields.filter((f) => {
      const v = allValues[f.name];
      return v && v !== "Off" && v.trim() !== "";
    }).length;
  }, [fillableFields, allValues]);

  const requiredFields = useMemo(() => {
    return fillableFields.filter((f) => f.required);
  }, [fillableFields]);

  const requiredCount = requiredFields.length;

  const filledRequiredCount = useMemo(() => {
    return requiredFields.filter((f) => {
      const v = allValues[f.name];
      return v && v !== "Off" && v.trim() !== "";
    }).length;
  }, [requiredFields, allValues]);

  if (!isActive) return null;
  if (viewedFile && pdfAccess?.encrypted) {
    return (
      <Stack gap="sm" p="sm">
        {createToolSteps().createFilesStep({ selectedFiles: [] })}
      </Stack>
    );
  }
  if (viewedFile && !currentFile) {
    return (
      <div className={styles.root}>
        <Text size="sm" role="status">
          {t("loading", "Loading...")}
        </Text>
      </div>
    );
  }

  const changeCount =
    pendingFields.length +
    deletedFieldNames.length +
    Object.keys(modifiedFields).filter(
      (name) => !deletedFieldNames.includes(name),
    ).length;
  const designProps = { currentFile, onSave: handleSave, saving, changeCount };

  return (
    <div className={styles.root} inert={saving}>
      <Modal
        open={pendingImport !== null}
        onClose={() => setPendingImport(null)}
        title={t(
          "formFill.importReplaceTitle",
          "Replace {{count}} value(s) you entered?",
          { count: pendingImport?.replaced.length ?? 0 },
        )}
        width="sm"
        footer={
          <>
            <Button variant="tertiary" onClick={() => setPendingImport(null)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button onClick={confirmPendingImport}>
              {t("formFill.importReplace", "Replace")}
            </Button>
          </>
        }
      >
        <Text size="sm" c="var(--c-text-muted)">
          {t(
            "formFill.importReplaceBody",
            "The imported file has different values for: {{names}}",
            { names: formatNameList(pendingImport?.replaced ?? []) },
          )}
        </Text>
      </Modal>

      <UnsavedChangesDialog
        opened={pendingMode !== null}
        saving={saving}
        onKeepWorking={() => {
          if (!savingRef.current) setPendingMode(null);
        }}
        onDiscard={discardAndSwitch}
        onSave={applyAndSwitch}
      />

      {/* ---- Mode selection ---- */}
      <div className={styles.modeTabs}>
        <SegmentedControl
          value={mode}
          onChange={(val) => requestMode(val)}
          options={MODE_TABS.map((tab) => ({
            value: tab.id,
            label: (
              // title carries the full label for locales where it has to ellipsise.
              <div className={styles.segmentedLabel} title={tab.label}>
                {tab.icon}
                <span className={styles.segmentedInnerLabel}>{tab.label}</span>
              </div>
            ),
          }))}
          fullWidth
          size="xs"
          ariaLabel={t("formFill.mode.label", "Form editor mode")}
        />
      </div>

      {saveError && (
        <Alert color="red" variant="light" p="xs" radius="sm">
          <Text size="xs">{saveError}</Text>
        </Alert>
      )}
      {importSummary && (
        <Alert
          icon={
            importSummary.anyApplied ? undefined : (
              <Icon name="triangle-alert" size={16} />
            )
          }
          color={importSummary.anyApplied ? "blue" : "yellow"}
          variant="light"
          p="xs"
          radius="sm"
          withCloseButton
          closeButtonLabel={t("common.close", "Close")}
          onClose={() => setImportSummary(null)}
          data-testid="form-import-summary"
        >
          <Text size="xs">{importSummary.message}</Text>
        </Alert>
      )}
      {mode !== "fill" && formState.loading && (
        <Text size="xs">
          {t("formFill.analyzingFields", "Analysing form fields...")}
        </Text>
      )}
      {mode !== "fill" && formState.error && (
        <Alert color="red">{formState.error}</Alert>
      )}

      {/* ---- Create mode ---- */}
      {mode === "create" && <FormFieldCreatePanel {...designProps} />}

      {/* ---- Modify mode ---- */}
      {mode === "modify" && <FormFieldModifyPanel {...designProps} />}

      {/* ---- Fill Form content ---- */}
      {mode === "fill" && (
        <>
          {/* Header / controls */}
          <div className={styles.header}>
            {/* Loading state */}
            {formState.loading && (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <Loader size={14} />
                  <Text size="xs" c="dimmed">
                    {t("formFill.analyzingFields", "Analysing form fields...")}
                  </Text>
                </div>
                <Skeleton height={48} radius="sm" />
                <Skeleton height={48} radius="sm" />
              </>
            )}

            {/* Error state */}
            {formState.error && (
              <Alert
                icon={<Icon name="triangle-alert" size={16} />}
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
                      {filledCount} / {fillableCount}{" "}
                      {t("formFill.filled", "filled")}
                      {requiredCount > 0 && (
                        <span style={{ marginLeft: "0.5rem", opacity: 0.7 }}>
                          ({filledRequiredCount}/{requiredCount}{" "}
                          {t("formFill.requiredAbbreviation", "req")}.)
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
                    value={
                      fillableCount > 0
                        ? (filledCount / fillableCount) * 100
                        : 0
                    }
                    size={6}
                    radius="xl"
                    color={
                      filledRequiredCount === requiredCount ? "teal" : "blue"
                    }
                    mt={4}
                  />
                </div>

                {/* Flatten toggle */}
                <Switch
                  label={t(
                    "formFill.flattenAfterFilling",
                    "Flatten after filling",
                  )}
                  checked={flatten}
                  onChange={(e) => setFlatten(e.currentTarget.checked)}
                  size="xs"
                  styles={{
                    label: { fontSize: "0.75rem", cursor: "pointer" },
                  }}
                />

                {/* Action buttons */}
                <div className={styles.actionBar}>
                  <div className={styles.primaryActions}>
                    <Button
                      leftSection={<Icon name="save" size={14} />}
                      size="sm"
                      onClick={handleSave}
                      loading={saving}
                      disabled={
                        formState.loading ||
                        (!formState.isDirty && !flattenChanged)
                      }
                    >
                      {t("formFill.save", "Save")}
                    </Button>

                    <Tooltip
                      label={t("formFill.rescanFields", "Re-scan fields")}
                      withArrow
                      position="bottom"
                    >
                      <ActionIcon
                        variant="secondary"
                        size="md"
                        onClick={handleRefresh}
                        aria-label={t(
                          "formFill.rescanFormFields",
                          "Re-scan form fields",
                        )}
                      >
                        <Icon name="refresh-cw" size={16} />
                      </ActionIcon>
                    </Tooltip>
                  </div>

                  <div className={styles.importRow}>
                    <Tooltip
                      label={t(
                        "formFill.importTooltip",
                        "Import values from an Acrobat XFDF or FDF export",
                      )}
                      withArrow
                      position="left"
                    >
                      <Button
                        variant="secondary"
                        leftSection={<Icon name="upload" size={14} />}
                        onClick={() => importInputRef.current?.click()}
                        size="sm"
                      >
                        {t("formFill.importData", "Import form data")}
                      </Button>
                    </Tooltip>

                    <input
                      ref={importInputRef}
                      type="file"
                      accept=".xfdf,.fdf,application/vnd.adobe.xfdf,application/vnd.fdf"
                      hidden
                      onChange={(e) => {
                        const file = e.currentTarget.files?.[0];
                        // Clear first so re-picking the same file re-fires.
                        e.currentTarget.value = "";
                        if (file) void handleImportFormData(file);
                      }}
                    />
                  </div>

                  <Text size="xs" c="dimmed" className={styles.exportLabel}>
                    {t("formFill.exportAs", "Export data as")}
                  </Text>
                  <div className={styles.secondaryActions}>
                    {(
                      [
                        ["XFDF", handleExportXfdf],
                        ["JSON", handleExtractJson],
                        ["CSV", handleExtractCsv],
                        ["XLSX", handleExtractXlsx],
                      ] as const
                    ).map(([label, onClick]) => (
                      <Button
                        key={label}
                        variant="secondary"
                        leftSection={<Icon name="download" size={14} />}
                        loading={extracting}
                        onClick={() => void onClick()}
                        size="sm"
                        aria-label={t(
                          "formFill.exportAsFormat",
                          "Export as {{format}}",
                          {
                            format: label,
                          },
                        )}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Error message */}
              </>
            )}

            {/* Empty state */}
            {!formState.loading &&
              formState.fields.length === 0 &&
              !formState.error && (
                <div className={styles.emptyState}>
                  <Icon
                    name="file-text"
                    size="2.5rem"
                    className={styles.emptyStateIcon}
                  />
                  <span className={styles.emptyStateText}>
                    {t(
                      "formFill.noFields",
                      "No fillable form fields found in this PDF.",
                    )}
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
                        {t("page", "Page")} {pageIdx + 1}
                      </Text>
                    </div>

                    {fieldsByPage.get(pageIdx)!.map((field) => {
                      const isFieldActive =
                        formState.activeFieldName === field.name;
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
                            isFieldActive ? styles.fieldCardActive : ""
                          } ${hasError ? styles.fieldCardError : ""} ${privateContentClassName}`}
                          onClick={() =>
                            handleFieldClick(field.name, pageIndex)
                          }
                        >
                          <div className={styles.fieldHeader}>
                            <span
                              className={styles.fieldTypeIcon}
                              style={{
                                color: `var(--mantine-color-${FIELD_TYPE_COLOR[field.type]}-6)`,
                              }}
                            >
                              <Icon
                                name={FIELD_TYPE_ICON[field.type]}
                                size={14}
                              />
                            </span>
                            <span className={styles.fieldName}>
                              {field.label || field.name}
                            </span>
                            {field.required && (
                              <span className={styles.fieldRequired}>
                                {t("formFill.requiredAbbreviation", "req")}
                              </span>
                            )}
                          </div>

                          {field.type !== "button" &&
                            field.type !== "signature" && (
                              <div className={styles.fieldInputWrap}>
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
                {(formState.isDirty || flattenChanged) && (
                  <span className={styles.unsavedDot} />
                )}
                {saving
                  ? t("formFill.saving", "Saving...")
                  : formState.isDirty || flattenChanged
                    ? t("formFill.unsavedChanges", "Unsaved changes")
                    : t("formFill.allSaved", "All saved")}
              </span>
              <span>{t("formFill.saveShortcut", "Ctrl+S to save")}</span>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FormFill;
