/**
 * FormSaveBar stub for the core build.
 * This file is overridden in src/proprietary/tools/formFill/FormSaveBar.tsx
 * when building the proprietary variant.
 */

interface FormSaveBarProps {
  file: File | Blob | null;
  isFormFillToolActive: boolean;
  onApply?: (filledBlob: Blob) => Promise<void>;
}

export function FormSaveBar(_props: FormSaveBarProps) {
  return null;
}

export default FormSaveBar;
