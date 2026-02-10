/**
 * FormFillProvider stub for the core build.
 * This file is overridden in src/proprietary/tools/formFill/FormFillContext.tsx
 * when building the proprietary variant.
 */
import React, { createContext, useContext } from 'react';

interface FormFillContextValue {
  state: {
    fields: any[];
    values: Record<string, string>;
    loading: boolean;
    error: string | null;
    activeFieldName: string | null;
    isDirty: boolean;
    validationErrors: Record<string, string>;
  };
  fetchFields: (file: File | Blob, fileId?: string) => Promise<void>;
  setValue: (fieldName: string, value: string) => void;
  setActiveField: (fieldName: string | null) => void;
  submitForm: (file: File | Blob, flatten?: boolean) => Promise<Blob>;
  getField: (fieldName: string) => any | undefined;
  getFieldsForPage: (pageIndex: number) => any[];
  getValue: (fieldName: string) => string;
  validateForm: () => boolean;
  reset: () => void;
  fieldsByPage: Map<number, any[]>;
  activeProviderName: string;
  setProviderMode: (mode: 'pdflib' | 'pdfbox') => void;
  forFileId: string | null;
}

const noopAsync = async () => {};
const noop = () => {};

const FormFillContext = createContext<FormFillContextValue | null>(null);

export const useFormFill = (): FormFillContextValue => {
  const ctx = useContext(FormFillContext);
  if (!ctx) {
    // Return a default no-op value for core builds
    return {
      state: {
        fields: [],
        values: {},
        loading: false,
        error: null,
        activeFieldName: null,
        isDirty: false,
        validationErrors: {},
      },
      fetchFields: noopAsync,
      setValue: noop,
      setActiveField: noop,
      submitForm: async () => new Blob(),
      getField: () => undefined,
      getFieldsForPage: () => [],
      getValue: () => '',
      validateForm: () => true,
      reset: noop,
      fieldsByPage: new Map(),
      activeProviderName: 'none',
      setProviderMode: noop,
      forFileId: null,
    };
  }
  return ctx;
};

/** No-op stub for core builds */
export function useFieldValue(_fieldName: string): string {
  return '';
}

/** No-op stub for core builds */
export function useAllFormValues(): Record<string, string> {
  return {};
}

export function FormFillProvider({ children }: { children: React.ReactNode }) {
  // In core build, just render children without provider
  return <>{children}</>;
}

export default FormFillContext;
