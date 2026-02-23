/**
 * IFormDataProvider — Common interface for form data providers.
 *
 * This abstraction allows the form fill UI to work with different backends:
 * - PdfLibFormProvider: Frontend-only, uses pdf-lib to extract/fill form fields
 *   (used in normal viewer mode to avoid sending large PDFs to the backend)
 * - PdfBoxFormProvider: Backend API, uses PDFBox via REST endpoints
 *   (used in the dedicated formFill tool for full-fidelity form handling)
 *
 * The UI components (FormFieldOverlay, FormFill, FormFieldSidebar) consume
 * data through FormFillContext, which delegates to whichever provider is active.
 */
import type { FormField, NewFieldDefinition, ModifyFieldDefinition } from '@app/tools/formFill/types';

export interface IFormDataProvider {
  /** Unique identifier for the provider (for debugging/logging) */
  readonly name: string;

  /**
   * Extract form fields with their coordinates from a PDF file.
   * Returns the same FormField[] shape regardless of provider.
   */
  fetchFields(file: File | Blob): Promise<FormField[]>;

  /**
   * Apply filled values to a PDF and return the resulting PDF blob.
   * @param file - The original PDF
   * @param values - Map of field name → value
   * @param flatten - Whether to flatten the form (make fields non-editable)
   * @returns The filled PDF as a Blob
   */
  fillForm(
    file: File | Blob,
    values: Record<string, string>,
    flatten: boolean,
  ): Promise<Blob>;

  /**
   * Add new form fields to a PDF.
   * Optional — only supported by backend providers.
   */
  addFields?(
    file: File | Blob,
    fields: NewFieldDefinition[],
  ): Promise<Blob>;

  /**
   * Modify existing form fields (properties and/or coordinates).
   * Optional — only supported by backend providers.
   */
  modifyFields?(
    file: File | Blob,
    updates: ModifyFieldDefinition[],
  ): Promise<Blob>;
}
