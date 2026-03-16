import { ToolId } from '@app/types/toolId';

// Credit costs based on ResourceWeight enum from backend
export const CREDIT_COSTS = {
  NONE: 0,
  SMALL: 1,
  MEDIUM: 3,
  LARGE: 5,
  XLARGE: 10,
} as const;

/**
 * Mapping of tool IDs to their credit costs
 * Based on backend ResourceWeight annotations
 */
export const TOOL_CREDIT_COSTS: Record<ToolId, number> = {
  // No cost operations (0 credits)
  showJS: CREDIT_COSTS.NONE,
  devApi: CREDIT_COSTS.NONE,
  devFolderScanning: CREDIT_COSTS.NONE,
  devSsoGuide: CREDIT_COSTS.NONE,
  devAirgapped: CREDIT_COSTS.NONE,

  // Small operations (1 credit)
  rotate: CREDIT_COSTS.SMALL,
  removePages: CREDIT_COSTS.SMALL,
  addText: CREDIT_COSTS.SMALL,
  addPassword: CREDIT_COSTS.SMALL,
  removePassword: CREDIT_COSTS.SMALL,
  changePermissions: CREDIT_COSTS.SMALL,
  flatten: CREDIT_COSTS.SMALL,
  repair: CREDIT_COSTS.SMALL,
  unlockPDFForms: CREDIT_COSTS.SMALL,
  crop: CREDIT_COSTS.SMALL,
  addPageNumbers: CREDIT_COSTS.SMALL,
  extractPages: CREDIT_COSTS.SMALL,
  reorganizePages: CREDIT_COSTS.SMALL,
  scalePages: CREDIT_COSTS.SMALL,
  editTableOfContents: CREDIT_COSTS.SMALL,
  sign: CREDIT_COSTS.SMALL,
  removeAnnotations: CREDIT_COSTS.SMALL,
  removeImage: CREDIT_COSTS.SMALL,
  scannerImageSplit: CREDIT_COSTS.SMALL,
  adjustContrast: CREDIT_COSTS.SMALL,
  multiTool: CREDIT_COSTS.SMALL,
  compare: CREDIT_COSTS.SMALL,
  addAttachments: CREDIT_COSTS.SMALL,
  getPdfInfo: CREDIT_COSTS.MEDIUM,
  validateSignature: CREDIT_COSTS.SMALL,
  read: CREDIT_COSTS.SMALL,

  // Medium operations (3 credits)
  split: CREDIT_COSTS.MEDIUM,
  merge: CREDIT_COSTS.MEDIUM,
  pdfTextEditor: CREDIT_COSTS.MEDIUM,
  changeMetadata: CREDIT_COSTS.MEDIUM,
  watermark: CREDIT_COSTS.MEDIUM,
  bookletImposition: CREDIT_COSTS.MEDIUM,
  pdfToSinglePage: CREDIT_COSTS.MEDIUM,
  removeBlanks: CREDIT_COSTS.MEDIUM,
  autoRename: CREDIT_COSTS.MEDIUM,
  sanitize: CREDIT_COSTS.MEDIUM,
  addImage: CREDIT_COSTS.MEDIUM,
  addStamp: CREDIT_COSTS.MEDIUM,
  extractImages: CREDIT_COSTS.MEDIUM,
  overlayPdfs: CREDIT_COSTS.MEDIUM,
  pageLayout: CREDIT_COSTS.MEDIUM,
  redact: CREDIT_COSTS.MEDIUM,
  removeCertSign: CREDIT_COSTS.MEDIUM,
  scannerEffect: CREDIT_COSTS.MEDIUM,
  replaceColor: CREDIT_COSTS.MEDIUM,
  annotate: CREDIT_COSTS.MEDIUM,
  formFill: CREDIT_COSTS.MEDIUM,

  // Large operations (5 credits)
  compress: CREDIT_COSTS.LARGE,
  convert: CREDIT_COSTS.LARGE,
  ocr: CREDIT_COSTS.LARGE,
  certSign: CREDIT_COSTS.LARGE,

  // Extra large operations (10 credits)
  automate: CREDIT_COSTS.XLARGE,
};

/**
 * Get the credit cost for a specific tool
 * @param toolId - The tool identifier
 * @returns The credit cost for the tool, defaults to MEDIUM if not found
 */
export const getToolCreditCost = (toolId: ToolId): number => {
  return TOOL_CREDIT_COSTS[toolId] ?? CREDIT_COSTS.MEDIUM;
};
