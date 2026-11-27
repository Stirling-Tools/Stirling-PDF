/**
 * PdfBoxFormProvider — Backend API form data provider using PDFBox.
 *
 * Delegates form field extraction and filling to the server-side Java
 * implementation via REST endpoints. This provides full-fidelity form
 * handling including complex field types, appearance generation, and
 * proper CJK font support.
 *
 * Used in the dedicated formFill tool mode.
 */
import type { FormField } from "@editor/tools/formFill/types";
import type { IFormDataProvider } from "@editor/tools/formFill/providers/types";
import {
  fetchFormFieldsWithCoordinates,
  fillFormFields,
} from "@editor/tools/formFill/formApi";
import {
  resolveCanonicalFormValues,
  resolveRadioWidgetIndex,
} from "@editor/tools/formFill/fieldValues";

export class PdfBoxFormProvider implements IFormDataProvider {
  readonly name = "pdfbox";
  private fields: FormField[] = [];

  setFields(fields: FormField[]): void {
    this.fields = fields;
  }

  async fetchFields(file: File | Blob): Promise<FormField[]> {
    const fields = await fetchFormFieldsWithCoordinates(file);
    for (const field of fields) {
      if (
        field.type === "radio" &&
        field.value &&
        field.widgets &&
        field.widgets.length > 0
      ) {
        field.value = resolveRadioWidgetIndex(field, field.value);
      }
    }
    return fields;
  }

  async fillForm(
    file: File | Blob,
    values: Record<string, string>,
    flatten: boolean,
  ): Promise<Blob> {
    const canonicalValues = resolveCanonicalFormValues(this.fields, values);
    return fillFormFields(file, canonicalValues, flatten);
  }
}
