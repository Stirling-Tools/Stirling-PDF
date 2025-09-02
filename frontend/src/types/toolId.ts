// Define all possible tool IDs as source of truth
const TOOL_IDS = [
  'certSign', 'sign', 'addPassword', 'remove-password', 'removePages', 'remove-blank-pages', 'remove-annotations', 'remove-image',
  'change-permissions', 'addWatermark',
  'sanitize', 'auto-split-pages', 'auto-split-by-size-count', 'split', 'mergePdfs',
  'convert', 'ocr', 'add-image', 'rotate',
  'detect-split-scanned-photos',
  'edit-table-of-contents',
  'scanner-effect',
  'auto-rename-pdf-file', 'multi-page-layout', 'adjust-page-size-scale', 'adjust-contrast', 'cropPdf', 'single-large-page', 'multi-tool',
  'repair', 'compare', 'addPageNumbers', 'redact',
  'flatten', 'remove-certificate-sign',
  'unlock-pdf-forms', 'compress', 'extract-page', 'reorganize-pages', 'extract-images',
  'add-stamp', 'add-attachments', 'change-metadata', 'overlay-pdfs',
  'manage-certificates', 'get-all-info-on-pdf', 'manageSignatures', 'read', 'automate', 'replace-and-invert-color',
  'show-javascript', 'dev-api', 'dev-folder-scanning', 'dev-sso-guide', 'dev-airgapped'
] as const;

// Tool identity - what PDF operation we're performing (type-safe)
export type ToolId = typeof TOOL_IDS[number];

// Type guard using the same source of truth
export const isValidToolId = (value: string): value is ToolId => {
  return TOOL_IDS.includes(value as ToolId);
};
