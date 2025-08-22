/**
 * Shared navigation types to avoid circular dependencies
 */

// Navigation mode types - complete list to match contexts
export type ModeType =
  | 'viewer'
  | 'pageEditor'
  | 'fileEditor'
  | 'merge'
  | 'split'
  | 'compress'
  | 'ocr'
  | 'convert'
  | 'sanitize'
  | 'addPassword'
  | 'changePermissions'
  | 'addWatermark'
  | 'removePassword'
  | 'single-large-page'
  | 'repair'
  | 'unlockPdfForms'
  | 'removeCertificateSign';

// Utility functions for mode handling
export const isValidMode = (mode: string): mode is ModeType => {
  const validModes: ModeType[] = [
    'viewer', 'pageEditor', 'fileEditor', 'merge', 'split', 
    'compress', 'ocr', 'convert', 'addPassword', 'changePermissions', 
    'sanitize', 'addWatermark', 'removePassword', 'single-large-page',
    'repair', 'unlockPdfForms', 'removeCertificateSign'
  ];
  return validModes.includes(mode as ModeType);
};

export const getDefaultMode = (): ModeType => 'pageEditor';

// Route parsing result
export interface ToolRoute {
  mode: ModeType;
  toolKey: string | null;
}