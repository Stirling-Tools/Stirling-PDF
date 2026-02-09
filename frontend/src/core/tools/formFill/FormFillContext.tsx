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
  };
  fetchFields: (file: File | Blob) => Promise<void>;
  setValue: (fieldName: string, value: string) => void;
  setActiveField: (fieldName: string | null) => void;
  submitForm: (file: File | Blob, flatten?: boolean) => Promise<Blob>;
  getField: (fieldName: string) => any | undefined;
  getFieldsForPage: (pageIndex: number) => any[];
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
      },
      fetchFields: noopAsync,
      setValue: noop,
      setActiveField: noop,
      submitForm: async () => new Blob(),
      getField: () => undefined,
      getFieldsForPage: () => [],
    };
  }
  return ctx;
};

export function FormFillProvider({ children }: { children: React.ReactNode }) {
  // In core build, just render children without provider
  return <>{children}</>;
}

export default FormFillContext;
