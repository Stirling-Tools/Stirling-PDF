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
} from 'react';
import { useDebouncedCallback } from '@mantine/hooks';
import type { FormField, FormFillState, WidgetCoordinates } from '@proprietary/tools/formFill/types';
import type { IFormDataProvider } from '@proprietary/tools/formFill/providers/types';
import { PdfLibFormProvider } from '@proprietary/tools/formFill/providers/PdfLibFormProvider';
import { PdfBoxFormProvider } from '@proprietary/tools/formFill/providers/PdfBoxFormProvider';

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
    return this._values[fieldName] ?? '';
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
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; fields: FormField[] }
  | { type: 'FETCH_ERROR'; error: string }
  | { type: 'MARK_DIRTY' }
  | { type: 'SET_ACTIVE_FIELD'; fieldName: string | null }
  | { type: 'SET_VALIDATION_ERRORS'; errors: Record<string, string> }
  | { type: 'CLEAR_VALIDATION_ERROR'; fieldName: string }
  | { type: 'MARK_CLEAN' }
  | { type: 'RESET' };

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
    case 'FETCH_START':
      return { ...state, loading: true, error: null };
    case 'FETCH_SUCCESS': {
      return {
        ...state,
        fields: action.fields,
        values: {}, // values managed by FormValuesStore
        loading: false,
        error: null,
        isDirty: false,
      };
    }
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.error };
    case 'MARK_DIRTY':
      if (state.isDirty) return state; // avoid unnecessary re-render
      return { ...state, isDirty: true };
    case 'SET_ACTIVE_FIELD':
      return { ...state, activeFieldName: action.fieldName };
    case 'SET_VALIDATION_ERRORS':
      return { ...state, validationErrors: action.errors };
    case 'CLEAR_VALIDATION_ERROR': {
      if (!state.validationErrors[action.fieldName]) return state;
      const { [action.fieldName]: _, ...rest } = state.validationErrors;
      return { ...state, validationErrors: rest };
    }
    case 'MARK_CLEAN':
      return { ...state, isDirty: false };
    case 'RESET':
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
  submitForm: (
    file: File | Blob,
    flatten?: boolean
  ) => Promise<Blob>;
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
  setProviderMode: (mode: 'pdflib' | 'pdfbox') => void;
  /** The file ID that the current form fields belong to (null if no fields loaded) */
  forFileId: string | null;
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
    throw new Error('useFormFill must be used within a FormFillProvider');
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
    throw new Error('useFieldValue must be used within a FormFillProvider');
  }

  const subscribe = useCallback(
    (cb: () => void) => store.subscribeField(fieldName, cb),
    [store, fieldName]
  );
  const getSnapshot = useCallback(
    () => store.getValue(fieldName),
    [store, fieldName]
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
    throw new Error('useAllFormValues must be used within a FormFillProvider');
  }

  const subscribe = useCallback(
    (cb: () => void) => store.subscribeGlobal(cb),
    [store]
  );
  const getSnapshot = useCallback(
    () => store.values,
    [store]
  );

  return useSyncExternalStore(subscribe, getSnapshot);
}

/** Singleton provider instances */
const pdfLibProvider = new PdfLibFormProvider();
const pdfBoxProvider = new PdfBoxFormProvider();

export function FormFillProvider({
  children,
  provider: providerProp,
}: {
  children: React.ReactNode;
  /** Override the initial provider. If not given, defaults to pdf-lib. */
  provider?: IFormDataProvider;
}) {
  const initialMode = providerProp?.name === 'pdfbox' ? 'pdfbox' : 'pdflib';
  const [providerMode, setProviderModeState] = useState<'pdflib' | 'pdfbox'>(initialMode);
  const providerModeRef = useRef(initialMode as 'pdflib' | 'pdfbox');
  providerModeRef.current = providerMode;
  const provider = providerProp ?? (providerMode === 'pdfbox' ? pdfBoxProvider : pdfLibProvider);
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

  const fetchFields = useCallback(async (file: File | Blob, fileId?: string) => {
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
    dispatch({ type: 'RESET' });
    dispatch({ type: 'FETCH_START' });
    try {
      const fields = await providerRef.current.fetchFields(file);
      // If another fetch or reset happened while we were waiting, discard this result
      if (fetchVersionRef.current !== version) {
        console.log('[FormFill] Discarding stale fetch result (version mismatch)');
        return;
      }
      // Initialise values in the external store
      const values: Record<string, string> = {};
      for (const field of fields) {
        values[field.name] = field.value ?? '';
      }
      valuesStore.reset(values);
      forFileIdRef.current = fileId ?? null;
      setForFileId(fileId ?? null);
      dispatch({ type: 'FETCH_SUCCESS', fields });
    } catch (err: any) {
      if (fetchVersionRef.current !== version) return; // stale
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to fetch form fields';
      dispatch({ type: 'FETCH_ERROR', error: msg });
    }
  }, [valuesStore]);

  const validateFieldDebounced = useDebouncedCallback((fieldName: string) => {
    const field = fieldsRef.current.find((f) => f.name === fieldName);
    if (!field || !field.required) return;

    const val = valuesStore.getValue(fieldName);
    if (!val || val.trim() === '' || val === 'Off') {
      dispatch({
        type: 'SET_VALIDATION_ERRORS',
        errors: { ...state.validationErrors, [fieldName]: `${field.label} is required` },
      });
    } else {
      dispatch({ type: 'CLEAR_VALIDATION_ERROR', fieldName });
    }
  }, 300);

  const validateForm = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    for (const field of fieldsRef.current) {
      const val = valuesStore.getValue(field.name);
      if (field.required && (!val || val.trim() === '' || val === 'Off')) {
        errors[field.name] = `${field.label} is required`;
      }
    }
    dispatch({ type: 'SET_VALIDATION_ERRORS', errors });
    return Object.keys(errors).length === 0;
  }, [valuesStore]);

  const setValue = useCallback(
    (fieldName: string, value: string) => {
      // Update external store (triggers per-field subscribers only)
      valuesStore.setValue(fieldName, value);
      // Mark form as dirty in React state (only triggers re-render once)
      dispatch({ type: 'MARK_DIRTY' });
      validateFieldDebounced(fieldName);
    },
    [valuesStore, validateFieldDebounced]
  );

  const setActiveField = useCallback(
    (fieldName: string | null) => {
      dispatch({ type: 'SET_ACTIVE_FIELD', fieldName });
    },
    []
  );

  const submitForm = useCallback(
    async (file: File | Blob, flatten = true) => {
      const blob = await providerRef.current.fillForm(file, valuesStore.values, flatten);
      dispatch({ type: 'MARK_CLEAN' });
      return blob;
    },
    [valuesStore]
  );

  const setProviderMode = useCallback(
    (mode: 'pdflib' | 'pdfbox') => {
      // Use the ref to check the current mode synchronously — avoids
      // relying on stale closure state and allows the early return.
      if (providerModeRef.current === mode) return;

      // provider (pdfbox vs pdflib).
      const newProvider = mode === 'pdfbox' ? pdfBoxProvider : pdfLibProvider;
      providerRef.current = newProvider;
      providerModeRef.current = mode;

      fetchVersionRef.current++;
      forFileIdRef.current = null;
      setForFileId(null);
      valuesStore.reset({});
      dispatch({ type: 'RESET' });

      setProviderModeState(mode);
    },
    [valuesStore]
  );

  const getField = useCallback(
    (fieldName: string) =>
      fieldsRef.current.find((f) => f.name === fieldName),
    []
  );

  const getFieldsForPage = useCallback(
    (pageIndex: number) =>
      fieldsRef.current.filter((f) =>
        f.widgets?.some((w: WidgetCoordinates) => w.pageIndex === pageIndex)
      ),
    []
  );

  const getValue = useCallback(
    (fieldName: string) => valuesStore.getValue(fieldName),
    [valuesStore]
  );

  const reset = useCallback(() => {
    // Increment version to invalidate any in-flight fetch
    fetchVersionRef.current++;
    forFileIdRef.current = null;
    setForFileId(null);
    valuesStore.reset({});
    dispatch({ type: 'RESET' });
  }, [valuesStore]);

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
    ]
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
