/**
 * FormFillContext — React context for form fill state management.
 *
 * Provides:
 * - Form field metadata (with coordinates) from the backend
 * - Current user-entered values
 * - Active/focused field tracking (for sidebar <-> PDF sync)
 * - Actions to update values, fetch fields, submit, etc.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { useDebouncedCallback } from '@mantine/hooks';
import type { FormField, FormFillState } from '@proprietary/tools/formFill/types';
import {
  fetchFormFieldsWithCoordinates,
  fillFormFields,
} from '@proprietary/tools/formFill/formApi';

type Action =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; fields: FormField[] }
  | { type: 'FETCH_ERROR'; error: string }
  | { type: 'SET_VALUE'; fieldName: string; value: string }
  | { type: 'SET_VALUES'; values: Record<string, string> }
  | { type: 'SET_ACTIVE_FIELD'; fieldName: string | null }
  | { type: 'SET_VALIDATION_ERRORS'; errors: Record<string, string> }
  | { type: 'CLEAR_VALIDATION_ERROR'; fieldName: string }
  | { type: 'MARK_CLEAN' }
  | { type: 'RESET' };

const initialState: FormFillState = {
  fields: [],
  values: {},
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
      // Initialise values from current field values
      const values: Record<string, string> = {};
      for (const field of action.fields) {
        values[field.name] = field.value ?? '';
      }
      return {
        ...state,
        fields: action.fields,
        values,
        loading: false,
        error: null,
        isDirty: false,
      };
    }
    case 'FETCH_ERROR':
      return { ...state, loading: false, error: action.error };
    case 'SET_VALUE':
      return {
        ...state,
        values: { ...state.values, [action.fieldName]: action.value },
        isDirty: true,
      };
    case 'SET_VALUES':
      return {
        ...state,
        values: { ...state.values, ...action.values },
        isDirty: true,
      };
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
  /** Fetch form fields from backend for the given file */
  fetchFields: (file: File | Blob) => Promise<void>;
  /** Update a single field value */
  setValue: (fieldName: string, value: string) => void;
  /** Set the currently focused field */
  setActiveField: (fieldName: string | null) => void;
  /** Submit filled form to backend and return the filled PDF blob */
  submitForm: (
    file: File | Blob,
    flatten?: boolean
  ) => Promise<Blob>;
  /** Get field by name */
  getField: (fieldName: string) => FormField | undefined;
  /** Get fields for a specific page index */
  getFieldsForPage: (pageIndex: number) => FormField[];
  /** Get the current value for a field without subscribing to all state changes */
  getValue: (fieldName: string) => string;
  /** Version counter that increments on every value change (for targeted re-renders) */
  valuesVersion: number;
  /** Validate the current form state and return true if valid */
  validateForm: () => boolean;
  /** Clear all form state (fields, values, errors) */
  reset: () => void;
  /** Pre-computed map of page index to fields for performance */
  fieldsByPage: Map<number, FormField[]>;
}

const FormFillContext = createContext<FormFillContextValue | null>(null);

export const useFormFill = (): FormFillContextValue => {
  const ctx = useContext(FormFillContext);
  if (!ctx) {
    throw new Error('useFormFill must be used within a FormFillProvider');
  }
  return ctx;
};

export function FormFillProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const fieldsRef = useRef<FormField[]>([]);
  fieldsRef.current = state.fields;

  // Keep a mutable ref for values to avoid context churn on every keystroke.
  // Components that need to read values can use getValue() or valuesVersion.
  const valuesRef = useRef<Record<string, string>>(state.values);
  valuesRef.current = state.values;
  const [valuesVersion, setValuesVersion] = useState(0);

  const fetchFields = useCallback(async (file: File | Blob) => {
    dispatch({ type: 'FETCH_START' });
    try {
      const fields = await fetchFormFieldsWithCoordinates(file);
      dispatch({ type: 'FETCH_SUCCESS', fields });
    } catch (err: any) {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        'Failed to fetch form fields';
      dispatch({ type: 'FETCH_ERROR', error: msg });
    }
  }, []);

  const validateFieldDebounced = useDebouncedCallback((fieldName: string) => {
    const field = fieldsRef.current.find((f) => f.name === fieldName);
    if (!field || !field.required) return;

    const val = valuesRef.current[fieldName];
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
      const val = valuesRef.current[field.name];
      if (field.required && (!val || val.trim() === '' || val === 'Off')) {
        errors[field.name] = `${field.label} is required`;
      }
    }
    dispatch({ type: 'SET_VALIDATION_ERRORS', errors });
    return Object.keys(errors).length === 0;
  }, []);

  const setValue = useCallback(
    (fieldName: string, value: string) => {
      dispatch({ type: 'SET_VALUE', fieldName, value });
      validateFieldDebounced(fieldName);
      setValuesVersion((v) => v + 1);
    },
    [validateFieldDebounced, state.validationErrors]
  );

  const setActiveField = useCallback(
    (fieldName: string | null) => {
      dispatch({ type: 'SET_ACTIVE_FIELD', fieldName });
    },
    []
  );

  const submitForm = useCallback(
    async (file: File | Blob, flatten = false) => {
      const blob = await fillFormFields(file, state.values, flatten);
      dispatch({ type: 'MARK_CLEAN' });
      return blob;
    },
    [state.values]
  );

  const getField = useCallback(
    (fieldName: string) =>
      fieldsRef.current.find((f) => f.name === fieldName),
    []
  );

  const getFieldsForPage = useCallback(
    (pageIndex: number) =>
      fieldsRef.current.filter((f) =>
        f.widgets?.some((w) => w.pageIndex === pageIndex)
      ),
    []
  );

  const getValue = useCallback(
    (fieldName: string) => valuesRef.current[fieldName] ?? '',
    []
  );

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  const fieldsByPage = useMemo(() => {
    const map = new Map<number, FormField[]>();
    for (const field of state.fields) {
      const pageIdx = field.widgets?.[0]?.pageIndex ?? 0;
      if (!map.has(pageIdx)) map.set(pageIdx, []);
      map.get(pageIdx)!.push(field);
    }
    return map;
  }, [state.fields]);

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
      valuesVersion,
      validateForm,
      reset,
      fieldsByPage,
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
      valuesVersion,
      validateForm,
      reset,
      fieldsByPage,
    ]
  );

  return (
    <FormFillContext.Provider value={value}>
      {children}
    </FormFillContext.Provider>
  );
}

export default FormFillContext;
