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
import type { FormField } from '@proprietary/tools/formFill/types';
import type { IFormDataProvider } from '@proprietary/tools/formFill/providers/types';
import {
  fetchFormFieldsWithCoordinates,
  fillFormFields,
} from '@proprietary/tools/formFill/formApi';

export class PdfBoxFormProvider implements IFormDataProvider {
  readonly name = 'pdfbox';

  async fetchFields(file: File | Blob): Promise<FormField[]> {
    return fetchFormFieldsWithCoordinates(file);
  }

  async fillForm(
    file: File | Blob,
    values: Record<string, string>,
    flatten: boolean,
  ): Promise<Blob> {
    return fillFormFields(file, values, flatten);
  }
}
