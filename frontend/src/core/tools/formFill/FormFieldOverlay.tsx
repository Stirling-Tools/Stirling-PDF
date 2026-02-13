/**
 * FormFieldOverlay stub for the core build.
 * This file is overridden in src/proprietary/tools/formFill/FormFieldOverlay.tsx
 * when building the proprietary variant.
 */

interface FormFieldOverlayProps {
  documentId: string;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
  fileId?: string | null;
}

export function FormFieldOverlay(_props: FormFieldOverlayProps) {
  // Core build stub — renders nothing
  return null;
}

export default FormFieldOverlay;
