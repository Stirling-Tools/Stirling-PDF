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
import type { FormField, NewFieldDefinition, ModifyFieldDefinition } from '@app/tools/formFill/types';
import type { IFormDataProvider } from '@app/tools/formFill/providers/types';
import {
  fetchFormFieldsWithCoordinates,
  fillFormFields,
  addFormFields,
  modifyFormFields,
} from '@app/tools/formFill/formApi';

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

  async addFields(
    file: File | Blob,
    fields: NewFieldDefinition[],
  ): Promise<Blob> {
    return addFormFields(file, fields);
  }

  async modifyFields(
    file: File | Blob,
    updates: ModifyFieldDefinition[],
  ): Promise<Blob> {
    return modifyFormFields(file, updates);
  }
}
