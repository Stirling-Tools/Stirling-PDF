/**
 * FormFieldOverlay stub for the core build.
 * This file is overridden in src/proprietary/tools/formFill/FormFieldOverlay.tsx
 * when building the proprietary variant.
 */
import React from 'react';

interface FormFieldOverlayProps {
  documentId: string;
  pageIndex: number;
  pageWidth: number;
  pageHeight: number;
}

export function FormFieldOverlay(_props: FormFieldOverlayProps) {
  // Core build stub — renders nothing
  return null;
}

export default FormFieldOverlay;
