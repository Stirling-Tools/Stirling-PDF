/**
 * Form-fill context for the formFill stories.
 *
 * Every form-fill component reads its fields and values from FormFillProvider,
 * and the provider only ever gets them by asking a data provider to parse a real
 * PDF. Both shipped providers need either the pdfium WASM module or the backend,
 * neither of which exists in a story — so these helpers hand the provider a stub
 * that returns fixed fields, and drive it the way the app does: fetch on mount,
 * then type into the form.
 */
import { useEffect, useRef, type ReactElement, type ReactNode } from "react";
import {
  FormFillProvider,
  useFormFill,
} from "@app/tools/formFill/FormFillContext";
import type { IFormDataProvider } from "@app/tools/formFill/providers/types";
import type { FormField } from "@app/tools/formFill/types";

/** Stands in for the open document; the stub provider never reads its bytes. */
export const STORY_PDF = new Blob(["%PDF-1.7"], { type: "application/pdf" });

export function field(
  overrides: Partial<FormField> & { name: string },
): FormField {
  return {
    label: overrides.name,
    type: "text",
    value: "",
    options: null,
    displayOptions: null,
    required: false,
    readOnly: false,
    multiSelect: false,
    multiline: false,
    tooltip: null,
    widgets: [{ pageIndex: 0, x: 72, y: 120, width: 220, height: 22 }],
    ...overrides,
  };
}

/** A small cross-section of field types, as a filled-in form would carry. */
export const SAMPLE_FIELDS: FormField[] = [
  field({ name: "fullName", label: "Full name", required: true }),
  field({
    name: "address",
    label: "Address",
    multiline: true,
    tooltip: "Include the postcode",
  }),
  field({
    name: "agreeToTerms",
    label: "I agree to the terms",
    type: "checkbox",
  }),
  field({
    name: "country",
    label: "Country",
    type: "combobox",
    options: ["uk", "fr", "de"],
    displayOptions: ["United Kingdom", "France", "Germany"],
  }),
  field({
    name: "reference",
    label: "Reference number",
    readOnly: true,
    value: "INV-20418",
  }),
  field({
    name: "signature",
    label: "Signature",
    type: "signature",
    widgets: [{ pageIndex: 1, x: 72, y: 480, width: 180, height: 60 }],
  }),
];

export interface FormFillOptions {
  /** Fields the stub provider reports for the document. */
  fields?: FormField[];
  /** Hold the fetch open, so the form stays in its loading state. */
  pending?: boolean;
  /** Values applied after load — this is what marks the form dirty. */
  filled?: Record<string, string>;
  /** Field to focus, as clicking its widget on the page would. */
  activeField?: string;
}

function stubProvider({
  fields = SAMPLE_FIELDS,
  pending = false,
}: FormFillOptions): IFormDataProvider {
  return {
    name: "pdf-lib",
    fetchFields: () =>
      pending ? new Promise<FormField[]>(() => {}) : Promise.resolve(fields),
    fillForm: async () => STORY_PDF,
  };
}

/**
 * Drives the provider once on mount. The fetch is what populates the fields and
 * seeds the value store; anything applied afterwards counts as user input.
 */
function FormFillLoader({
  filled,
  activeField,
  children,
}: FormFillOptions & { children: ReactNode }) {
  const { fetchFields, setValue, setActiveField } = useFormFill();
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void fetchFields(STORY_PDF, "story-document").then(() => {
      Object.entries(filled ?? {}).forEach(([name, value]) =>
        setValue(name, value),
      );
      if (activeField) setActiveField(activeField);
    });
  }, [fetchFields, setValue, setActiveField, filled, activeField]);

  return <>{children}</>;
}

export function withFormFill(options: FormFillOptions = {}) {
  return (Story: () => ReactElement): ReactElement => (
    <FormFillProvider provider={stubProvider(options)}>
      <FormFillLoader {...options}>
        <Story />
      </FormFillLoader>
    </FormFillProvider>
  );
}
