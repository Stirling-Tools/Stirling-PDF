/**
 * FormFillContext — React context for form fill state management.
 *
 * Provider-agnostic: delegates data fetching/saving to an IFormDataProvider.
 * - PdfLibFormProvider: frontend-only, uses pdf-lib (for normal viewer mode)
 * - PdfBoxFormProvider: backend API via PDFBox (for dedicated formFill tool)
 *
 * The active provider can be switched at runtime via setProvider(). This allows
 * EmbedPdfViewer to auto-select:
 * - Normal viewer → PdfLibFormProvider (no backend calls for large PDFs)
 * - formFill tool → PdfBoxFormProvider (full-fidelity PDFBox handling)
 *
 * Performance Architecture:
 * Form values are stored in a FormValuesStore (external to React state) to
 * avoid full context re-renders on every keystroke. Individual widgets
 * subscribe to their specific field via useFieldValue() + useSyncExternalStore,
 * so only the active widget re-renders when its value changes.
 *
 * The UI components (FormFieldOverlay, FormFill, FormFieldSidebar) consume
 * this context regardless of which provider is active.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useDebouncedCallback } from "@mantine/hooks";
import { isAxiosError } from "axios";
import type {
  FormField,
  FormFillState,
  WidgetCoordinates,
  FormMode,
  CreatableFieldType,
  NewFieldDefinition,
  ModifyFieldDefinition,
} from "@app/tools/formFill/types";
import type { IFormDataProvider } from "@app/tools/formFill/providers/types";
import { PdfBoxFormProvider } from "@app/tools/formFill/providers/PdfBoxFormProvider";
import { PdfiumFormProvider } from "@app/tools/formFill/providers/PdfiumFormProvider";
import { fetchSignatureFieldsWithAppearances } from "@app/services/pdfiumService";
import { applyFieldEdits } from "@app/tools/formFill/formApi";
import { mergeSignatureAppearances } from "@app/tools/formFill/formFieldMerge";

/** A field queued for creation, with a client-side id for list keys. */
export interface PendingField extends NewFieldDefinition {
  id: string;
}

// ---------------------------------------------------------------------------
// FormValuesStore — external store for field values (outside React state)
// ---------------------------------------------------------------------------

type Listener = () => void;

/**
 * External store that holds form values outside of React state.
 *
 * This avoids triggering full context re-renders on every keystroke.
 * Components subscribe per-field via useSyncExternalStore, so only
 * the widget being edited re-renders.
 */
class FormValuesStore {
  private _fieldListeners = new Map<string, Set<Listener>>();
  private _globalListeners = new Set<Listener>();

  private _values: Record<string, string> = {};

  get values(): Record<string, string> {
    return this._values;
  }

  private _version = 0;

  get version(): number {
    return this._version;
  }

  getValue(fieldName: string): string {
    return this._values[fieldName] ?? "";
  }

  setValue(fieldName: string, value: string): void {
    if (this._values[fieldName] === value) return;
    this._values[fieldName] = value;
    this._version++;
    this._fieldListeners.get(fieldName)?.forEach((l) => l());
    this._globalListeners.forEach((l) => l());
  }

  /** Replace all values (e.g., on fetch or reset) */
  reset(values: Record<string, string> = {}): void {
    this._values = values;
    this._version++;
    for (const listeners of this._fieldListeners.values()) {
      listeners.forEach((l) => l());
    }
    this._globalListeners.forEach((l) => l());
  }

  /** Subscribe to a single field's value changes */
  subscribeField(fieldName: string, listener: Listener): () => void {
    if (!this._fieldListeners.has(fieldName)) {
      this._fieldListeners.set(fieldName, new Set());
    }
    this._fieldListeners.get(fieldName)!.add(listener);
    return () => {
      this._fieldListeners.get(fieldName)?.delete(listener);
    };
  }

  /** Subscribe to any value change */
  subscribeGlobal(listener: Listener): () => void {
    this._globalListeners.add(listener);
    return () => {
      this._globalListeners.delete(listener);
    };
  }
}

// ---------------------------------------------------------------------------
// Reducer — handles everything EXCEPT values (which live in FormValuesStore)
// ---------------------------------------------------------------------------

type Action =
  | { type: "FETCH_START" }
  | { type: "FETCH_SUCCESS"; fields: FormField[] }
  | { type: "FETCH_ERROR"; error: string }
  | { type: "MARK_DIRTY" }
  | { type: "SET_ACTIVE_FIELD"; fieldName: string | null }
  | { type: "SET_VALIDATION_ERRORS"; errors: Record<string, string> }
  | { type: "CLEAR_VALIDATION_ERROR"; fieldName: string }
  | { type: "MARK_CLEAN" }
  | { type: "RESET" };

const initialState: FormFillState = {
  fields: [],
  values: {}, // kept for backward compat but canonical values live in FormValuesStore
  loading: false,
  error: null,
  activeFieldName: null,
  isDirty: false,
  validationErrors: {},
};

function reducer(state: FormFillState, action: Action): FormFillState {
  switch (action.type) {
    case "FETCH_START":
      return { ...state, loading: true, error: null };
    case "FETCH_SUCCESS": {
      return {
        ...state,
        fields: action.fields,
        values: {}, // values managed by FormValuesStore
        loading: false,
        error: null,
        isDirty: false,
      };
    }
    case "FETCH_ERROR":
      return { ...state, loading: false, error: action.error };
    case "MARK_DIRTY":
      if (state.isDirty) return state; // avoid unnecessary re-render
      return { ...state, isDirty: true };
    case "SET_ACTIVE_FIELD":
      return { ...state, activeFieldName: action.fieldName };
    case "SET_VALIDATION_ERRORS":
      return { ...state, validationErrors: action.errors };
    case "CLEAR_VALIDATION_ERROR": {
      if (!state.validationErrors[action.fieldName]) return state;
      const { [action.fieldName]: _, ...rest } = state.validationErrors;
      return { ...state, validationErrors: rest };
    }
    case "MARK_CLEAN":
      return { ...state, isDirty: false };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

export interface FormFillContextValue {
  state: FormFillState;
  /** Fetch form fields for the given file using the active provider */
  fetchFields: (file: File | Blob, fileId?: string) => Promise<void>;
  /** Update a single field value */
  setValue: (fieldName: string, value: string) => void;
  /** Set the currently focused field */
  setActiveField: (fieldName: string | null) => void;
  /** Submit filled form and return the filled PDF blob */
  submitForm: (file: File | Blob, flatten?: boolean) => Promise<Blob>;
  /** Get field by name */
  getField: (fieldName: string) => FormField | undefined;
  /** Get fields for a specific page index */
  getFieldsForPage: (pageIndex: number) => FormField[];
  /** Get the current value for a field (reads from external store) */
  getValue: (fieldName: string) => string;
  /** Validate the current form state and return true if valid */
  validateForm: () => boolean;
  /** Clear all form state (fields, values, errors) */
  reset: () => void;
  /** Pre-computed map of page index to fields for performance */
  fieldsByPage: Map<number, FormField[]>;
  /** Name of the currently active provider ('pdf-lib' | 'pdfbox') */
  activeProviderName: string;
  /**
   * Switch the active data provider.
   * Use 'pdflib' for frontend-only pdf-lib, 'pdfbox' for backend PDFBox.
   * Resets form state when switching providers.
   */
  setProviderMode: (mode: "pdflib" | "pdfbox") => void;
  /** The file ID that the current form fields belong to (null if no fields loaded) */
  forFileId: string | null;

  // -------------------------------------------------------------------------
  // Structural editing (create / modify modes)
  // -------------------------------------------------------------------------

  /** Current tool mode. */
  mode: FormMode;
  /** Switch mode. Switching clears the other mode's uncommitted working state. */
  setMode: (mode: FormMode) => void;

  // --- Create mode ---
  /** Field type currently armed for placement (null = not placing). */
  creationType: CreatableFieldType | null;
  setCreationType: (type: CreatableFieldType | null) => void;
  /** Fields drawn but not yet committed to the PDF. */
  pendingFields: PendingField[];
  /** Queue a new field (id + default name auto-assigned). Returns the new id. */
  addPendingField: (
    field: Omit<NewFieldDefinition, "name"> & { name?: string },
  ) => string;
  updatePendingField: (id: string, patch: Partial<NewFieldDefinition>) => void;
  removePendingField: (id: string) => void;
  clearPendingFields: () => void;
  /** POST queued fields to the backend; resolves to the updated PDF blob. */
  commitNewFields: (file: File | Blob) => Promise<Blob>;

  // --- Modify mode ---
  /** Field currently selected for editing in modify mode. */
  selectedFieldName: string | null;
  setSelectedField: (name: string | null) => void;
  /** Staged (uncommitted) property/geometry changes, keyed by original field name. */
  modifiedFields: Record<string, ModifyFieldDefinition>;
  /** Merge a partial change for a field into the staged set. */
  stageModification: (
    targetName: string,
    patch: Partial<ModifyFieldDefinition>,
  ) => void;
  /** Discard staged changes for a single field. */
  clearModification: (targetName: string) => void;
  /** Field names marked for deletion. */
  deletedFieldNames: string[];
  /** Toggle a field's deletion mark. */
  toggleFieldDeleted: (name: string) => void;
  /** Discard all staged modifications and deletions. */
  clearModifications: () => void;
  /** POST staged modifications + deletions; resolves to the updated PDF blob. */
  commitModifications: (file: File | Blob) => Promise<Blob>;

  /** True when create or modify mode has uncommitted work. */
  hasUncommittedChanges: boolean;
}

const FormFillContext = createContext<FormFillContextValue | null>(null);

/**
 * Separate context for the values store.
 * This allows useFieldValue() to subscribe without depending on the main context.
 */
const FormValuesStoreContext = createContext<FormValuesStore | null>(null);

export const useFormFill = (): FormFillContextValue => {
  const ctx = useContext(FormFillContext);
  if (!ctx) {
    throw new Error("useFormFill must be used within a FormFillProvider");
  }
  return ctx;
};

/**
 * Subscribe to a single field's value. Only re-renders when that specific
 * field's value changes — not when any other form value changes.
 *
 * Uses useSyncExternalStore for tear-free reads.
 */
export function useFieldValue(fieldName: string): string {
  const store = useContext(FormValuesStoreContext);
  if (!store) {
    throw new Error("useFieldValue must be used within a FormFillProvider");
  }

  const subscribe = useCallback(
    (cb: () => void) => store.subscribeField(fieldName, cb),
    [store, fieldName],
  );
  const getSnapshot = useCallback(
    () => store.getValue(fieldName),
    [store, fieldName],
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}

/**
 * Subscribe to all values (e.g., for progress counters or form submission).
 * Re-renders on every value change — use sparingly.
 */
export function useAllFormValues(): Record<string, string> {
  const store = useContext(FormValuesStoreContext);
  if (!store) {
    throw new Error("useAllFormValues must be used within a FormFillProvider");
  }

  const subscribe = useCallback(
    (cb: () => void) => store.subscribeGlobal(cb),
    [store],
  );
  const getSnapshot = useCallback(() => store.values, [store]);

  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Singleton provider instances */
const pdfiumProvider = new PdfiumFormProvider();
const pdfBoxProvider = new PdfBoxFormProvider();

export function FormFillProvider({
  children,
  provider: providerProp,
}: {
  children: React.ReactNode;
  /** Override the initial provider. If not given, defaults to pdf-lib. */
  provider?: IFormDataProvider;
}) {
  const initialMode = providerProp?.name === "pdfbox" ? "pdfbox" : "pdflib";
  const [providerMode, setProviderModeState] = useState<"pdflib" | "pdfbox">(
    initialMode,
  );
  const providerModeRef = useRef(initialMode as "pdflib" | "pdfbox");
  providerModeRef.current = providerMode;
  const provider =
    providerProp ??
    (providerMode === "pdfbox" ? pdfBoxProvider : pdfiumProvider);
  const providerRef = useRef(provider);
  providerRef.current = provider;

  const [state, dispatch] = useReducer(reducer, initialState);
  const fieldsRef = useRef<FormField[]>([]);
  fieldsRef.current = state.fields;

  // Version counter to cancel stale async fetch responses.
  // Incremented on every fetchFields() and reset() call.
  const fetchVersionRef = useRef(0);

  // Track which file the current fields belong to
  const forFileIdRef = useRef<string | null>(null);
  const [forFileId, setForFileId] = useState<string | null>(null);

  // External values store — values live HERE, not in the reducer.
  // This prevents full context re-renders on every keystroke.
  const [valuesStore] = useState(() => new FormValuesStore());

  // --- Structural editing state (create / modify modes) ---
  const [mode, setModeState] = useState<FormMode>("fill");
  const [creationType, setCreationType] = useState<CreatableFieldType | null>(
    null,
  );
  const [pendingFields, setPendingFields] = useState<PendingField[]>([]);
  const [selectedFieldName, setSelectedField] = useState<string | null>(null);
  const [modifiedFields, setModifiedFields] = useState<
    Record<string, ModifyFieldDefinition>
  >({});
  const [deletedFieldNames, setDeletedFieldNames] = useState<string[]>([]);
  // Monotonic counter for client-side pending-field ids and default names.
  const pendingCounterRef = useRef(0);

  const clearEditingState = useCallback(() => {
    setCreationType(null);
    setPendingFields([]);
    setSelectedField(null);
    setModifiedFields({});
    setDeletedFieldNames([]);
  }, []);

  const fetchFields = useCallback(
    async (file: File | Blob, fileId?: string) => {
      // Increment version so any in-flight fetch for a previous file is discarded.
      // NOTE: setProviderMode() also increments fetchVersionRef to invalidate
      // in-flight fetches when switching providers. This is intentional — the
      // fetch started here captures the NEW version, so stale results are
      // correctly discarded.
      const version = ++fetchVersionRef.current;

      // Immediately clear previous state so FormFieldOverlay's stale-file guards
      // prevent rendering fields from a previous document during the fetch.
      forFileIdRef.current = null;
      setForFileId(null);
      valuesStore.reset({});
      dispatch({ type: "RESET" });
      // NOTE: deliberately do NOT clear create/modify editing state here.
      // EmbedPdfViewer re-fetches fields on provider switch and file load, and
      // those background fetches must not wipe a user's in-progress drawn
      // fields or staged edits. Editing state is cleared on explicit mode
      // switch (setMode) and reset() instead.
      dispatch({ type: "FETCH_START" });
      try {
        let fields = await providerRef.current.fetchFields(file);
        // If another fetch or reset happened while we were waiting, discard this result
        if (fetchVersionRef.current !== version) {
          console.debug(
            "[FormFill] Discarding stale fetch result (version mismatch)",
          );
          return;
        }

        // The pdfbox backend returns signature fields, but without a rendered
        // appearance. Fetch the rendered signature appearances via pdfium and
        // MERGE them by name — enrich an existing backend entry rather than
        // appending a duplicate (otherwise a signature shows up twice).
        if (providerModeRef.current === "pdfbox") {
          try {
            // Convert File/Blob to ArrayBuffer for pdfiumService
            const arrayBuffer = await file.arrayBuffer();
            const sigFields =
              await fetchSignatureFieldsWithAppearances(arrayBuffer);
            if (fetchVersionRef.current !== version) return; // stale check after async
            fields = mergeSignatureAppearances(fields, sigFields);
          } catch (e) {
            console.warn(
              "[FormFill] Failed to extract signature appearances for pdfbox mode:",
              e,
            );
          }
        }

        // Initialise values in the external store
        const values: Record<string, string> = {};
        for (const field of fields) {
          values[field.name] = field.value ?? "";
        }
        valuesStore.reset(values);
        forFileIdRef.current = fileId ?? null;
        setForFileId(fileId ?? null);
        dispatch({ type: "FETCH_SUCCESS", fields });
      } catch (err) {
        if (fetchVersionRef.current !== version) return; // stale
        const msg =
          (isAxiosError<{ message?: string }>(err)
            ? err.response?.data?.message
            : undefined) ||
          (err instanceof Error ? err.message : undefined) ||
          "Failed to fetch form fields";
        dispatch({ type: "FETCH_ERROR", error: msg });
      }
    },
    [valuesStore],
  );

  const validateFieldDebounced = useDebouncedCallback((fieldName: string) => {
    const field = fieldsRef.current.find((f) => f.name === fieldName);
    if (!field || !field.required) return;

    const val = valuesStore.getValue(fieldName);
    if (!val || val.trim() === "" || val === "Off") {
      dispatch({
        type: "SET_VALIDATION_ERRORS",
        errors: {
          ...state.validationErrors,
          [fieldName]: `${field.label} is required`,
        },
      });
    } else {
      dispatch({ type: "CLEAR_VALIDATION_ERROR", fieldName });
    }
  }, 300);

  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    for (const field of fieldsRef.current) {
      const val = valuesStore.getValue(field.name);
      if (field.required && (!val || val.trim() === "" || val === "Off")) {
        errors[field.name] = `${field.label} is required`;
      }
    }
    dispatch({ type: "SET_VALIDATION_ERRORS", errors });
    return Object.keys(errors).length === 0;
  }, [valuesStore]);

  const setValue = useCallback(
    (fieldName: string, value: string) => {
      // Update external store (triggers per-field subscribers only)
      valuesStore.setValue(fieldName, value);
      // Mark form as dirty in React state (only triggers re-render once)
      dispatch({ type: "MARK_DIRTY" });
      validateFieldDebounced(fieldName);
    },
    [valuesStore, validateFieldDebounced],
  );

  const setActiveField = useCallback((fieldName: string | null) => {
    dispatch({ type: "SET_ACTIVE_FIELD", fieldName });
  }, []);

  const submitForm = useCallback(
    async (file: File | Blob, flatten = false) => {
      const blob = await providerRef.current.fillForm(
        file,
        valuesStore.values,
        flatten,
      );
      dispatch({ type: "MARK_CLEAN" });
      return blob;
    },
    [valuesStore],
  );

  const setProviderMode = useCallback(
    (mode: "pdflib" | "pdfbox") => {
      // Use the ref to check the current mode synchronously — avoids
      // relying on stale closure state and allows the early return.
      if (providerModeRef.current === mode) return;

      // provider (pdfbox vs pdflib).
      const newProvider = mode === "pdfbox" ? pdfBoxProvider : pdfiumProvider;
      providerRef.current = newProvider;
      providerModeRef.current = mode;

      fetchVersionRef.current++;
      forFileIdRef.current = null;
      setForFileId(null);
      valuesStore.reset({});
      dispatch({ type: "RESET" });

      setProviderModeState(mode);
    },
    [valuesStore],
  );

  const getField = useCallback(
    (fieldName: string) => fieldsRef.current.find((f) => f.name === fieldName),
    [],
  );

  const getFieldsForPage = useCallback(
    (pageIndex: number) =>
      fieldsRef.current.filter((f) =>
        f.widgets?.some((w: WidgetCoordinates) => w.pageIndex === pageIndex),
      ),
    [],
  );

  const getValue = useCallback(
    (fieldName: string) => valuesStore.getValue(fieldName),
    [valuesStore],
  );

  const reset = useCallback(() => {
    // Increment version to invalidate any in-flight fetch
    fetchVersionRef.current++;
    forFileIdRef.current = null;
    setForFileId(null);
    valuesStore.reset({});
    dispatch({ type: "RESET" });
    clearEditingState();
  }, [valuesStore, clearEditingState]);

  // --- Mode switching ---
  const setMode = useCallback(
    (next: FormMode) => {
      setModeState((prev) => {
        if (prev === next) return prev;
        // Leaving a mode discards its uncommitted working state so the user
        // doesn't carry half-drawn fields or staged edits between modes.
        clearEditingState();
        return next;
      });
    },
    [clearEditingState],
  );

  // --- Create mode ---
  const addPendingField = useCallback(
    (field: Omit<NewFieldDefinition, "name"> & { name?: string }): string => {
      const seq = ++pendingCounterRef.current;
      const id = `pending-${seq}`;
      // Friendly, readable default names that match how the viewer labels
      // fields, instead of cryptic "Field_5".
      const TYPE_DEFAULT_NAME: Record<string, string> = {
        text: "Text field",
        checkbox: "Checkbox",
        combobox: "Dropdown",
        listbox: "List",
        radio: "Radio group",
        button: "Button",
        signature: "Signature",
      };
      const defaultName =
        field.name?.trim() ||
        `${TYPE_DEFAULT_NAME[field.type] ?? "Field"} ${seq}`;
      // Choice/radio fields need options to be useful — seed a sensible default
      // so the field isn't empty and the options editor has something to show.
      const needsOptions =
        field.type === "combobox" ||
        field.type === "listbox" ||
        field.type === "radio";
      const options =
        field.options ?? (needsOptions ? ["Option 1", "Option 2"] : undefined);
      setPendingFields((prev) => [
        ...prev,
        { ...field, name: defaultName, options, id } as PendingField,
      ]);
      return id;
    },
    [],
  );

  const updatePendingField = useCallback(
    (id: string, patch: Partial<NewFieldDefinition>) => {
      setPendingFields((prev) =>
        prev.map((f) => (f.id === id ? { ...f, ...patch } : f)),
      );
    },
    [],
  );

  const removePendingField = useCallback((id: string) => {
    setPendingFields((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const clearPendingFields = useCallback(() => {
    setPendingFields([]);
    setCreationType(null);
  }, []);

  const commitNewFields = useCallback(
    async (file: File | Blob): Promise<Blob> => {
      // Strip the client-side id before sending to the backend.
      const definitions: NewFieldDefinition[] = pendingFields.map(
        ({ id: _id, ...rest }) => rest,
      );
      const blob = await applyFieldEdits(file, { add: definitions });
      setPendingFields([]);
      setCreationType(null);
      return blob;
    },
    [pendingFields],
  );

  // --- Modify mode ---
  const stageModification = useCallback(
    (targetName: string, patch: Partial<ModifyFieldDefinition>) => {
      setModifiedFields((prev) => ({
        ...prev,
        [targetName]: { ...prev[targetName], targetName, ...patch },
      }));
    },
    [],
  );

  const clearModification = useCallback((targetName: string) => {
    setModifiedFields((prev) => {
      if (!(targetName in prev)) return prev;
      const { [targetName]: _removed, ...rest } = prev;
      return rest;
    });
  }, []);

  const toggleFieldDeleted = useCallback((name: string) => {
    setDeletedFieldNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name],
    );
  }, []);

  const clearModifications = useCallback(() => {
    setModifiedFields({});
    setDeletedFieldNames([]);
    setSelectedField(null);
  }, []);

  const commitModifications = useCallback(
    async (file: File | Blob): Promise<Blob> => {
      // Apply property/geometry changes (for fields not being deleted) and the
      // deletions in a single backend round-trip.
      const updates = Object.values(modifiedFields).filter(
        (m) => !deletedFieldNames.includes(m.targetName),
      );
      const blob = await applyFieldEdits(file, {
        modify: updates,
        delete: deletedFieldNames,
      });
      setModifiedFields({});
      setDeletedFieldNames([]);
      setSelectedField(null);
      return blob;
    },
    [modifiedFields, deletedFieldNames],
  );

  const hasUncommittedChanges =
    pendingFields.length > 0 ||
    Object.keys(modifiedFields).length > 0 ||
    deletedFieldNames.length > 0;

  const fieldsByPage = useMemo(() => {
    const map = new Map<number, FormField[]>();
    for (const field of state.fields) {
      const pageIdx = field.widgets?.[0]?.pageIndex ?? 0;
      if (!map.has(pageIdx)) map.set(pageIdx, []);
      map.get(pageIdx)!.push(field);
    }
    return map;
  }, [state.fields]);

  // Context value — does NOT depend on values, so keystrokes don't
  // trigger re-renders of all context consumers.
  const value = useMemo<FormFillContextValue>(
    () => ({
      state,
      fetchFields,
      setValue,
      setActiveField,
      submitForm,
      getField,
      getFieldsForPage,
      getValue,
      validateForm,
      reset,
      fieldsByPage,
      activeProviderName: providerRef.current.name,
      setProviderMode,
      forFileId,
      // editing
      mode,
      setMode,
      creationType,
      setCreationType,
      pendingFields,
      addPendingField,
      updatePendingField,
      removePendingField,
      clearPendingFields,
      commitNewFields,
      selectedFieldName,
      setSelectedField,
      modifiedFields,
      stageModification,
      clearModification,
      deletedFieldNames,
      toggleFieldDeleted,
      clearModifications,
      commitModifications,
      hasUncommittedChanges,
    }),
    [
      state,
      fetchFields,
      setValue,
      setActiveField,
      submitForm,
      getField,
      getFieldsForPage,
      getValue,
      validateForm,
      reset,
      fieldsByPage,
      providerMode,
      setProviderMode,
      forFileId,
      mode,
      setMode,
      creationType,
      pendingFields,
      addPendingField,
      updatePendingField,
      removePendingField,
      clearPendingFields,
      commitNewFields,
      selectedFieldName,
      modifiedFields,
      stageModification,
      clearModification,
      deletedFieldNames,
      toggleFieldDeleted,
      clearModifications,
      commitModifications,
      hasUncommittedChanges,
    ],
  );

  return (
    <FormValuesStoreContext.Provider value={valuesStore}>
      <FormFillContext.Provider value={value}>
        {children}
      </FormFillContext.Provider>
    </FormValuesStoreContext.Provider>
  );
}

export default FormFillContext;
