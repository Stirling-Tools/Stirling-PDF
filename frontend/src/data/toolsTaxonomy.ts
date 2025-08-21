import { type TFunction } from 'i18next';
import React from 'react';
import { BaseToolProps } from '../types/tool';

export enum ToolId {
  CERT_SIGN = 'certSign',
  SIGN = 'sign',
  ADD_PASSWORD = 'addPassword',
  WATERMARK = 'watermark',
  ADD_STAMP = 'add-stamp',
  SANITIZE = 'sanitize',
  FLATTEN = 'flatten',
  UNLOCK_PDF_FORMS = 'unlock-pdf-forms',
  MANAGE_CERTIFICATES = 'manage-certificates',
  CHANGE_PERMISSIONS = 'change-permissions',
  GET_ALL_INFO_ON_PDF = 'get-all-info-on-pdf',
  VALIDATE_PDF_SIGNATURE = 'validate-pdf-signature',
  READ = 'read',
  CHANGE_METADATA = 'change-metadata',
  CROP_PDF = 'cropPdf',
  ROTATE = 'rotate',
  SPLIT_PDF = 'splitPdf',
  REORGANIZE_PAGES = 'reorganize-pages',
  ADJUST_PAGE_SIZE_SCALE = 'adjust-page-size-scale',
  ADD_PAGE_NUMBERS = 'addPageNumbers',
  MULTI_PAGE_LAYOUT = 'multi-page-layout',
  SINGLE_LARGE_PAGE = 'single-large-page',
  ADD_ATTACHMENTS = 'add-attachments',
  EXTRACT_PAGES = 'extractPages',
  EXTRACT_IMAGES = 'extract-images',
  REMOVE_PAGES = 'removePages',
  REMOVE_BLANK_PAGES = 'remove-blank-pages',
  REMOVE_ANNOTATIONS = 'remove-annotations',
  REMOVE_IMAGE = 'remove-image',
  REMOVE_PASSWORD = 'remove-password',
  REMOVE_CERTIFICATE_SIGN = 'remove-certificate-sign',
  AUTOMATE = 'automate',
  AUTO_RENAME_PDF_FILE = 'auto-rename-pdf-file',
  AUTO_SPLIT_PAGES = 'auto-split-pages',
  AUTO_SPLIT_BY_SIZE_COUNT = 'auto-split-by-size-count',
  ADJUST_CONTRAST = 'adjustContrast',
  REPAIR = 'repair',
  DETECT_SPLIT_SCANNED_PHOTOS = 'detect-split-scanned-photos',
  OVERLAY_PDFS = 'overlay-pdfs',
  REPLACE_AND_INVERT_COLOR = 'replace-and-invert-color',
  ADD_IMAGE = 'add-image',
  EDIT_TABLE_OF_CONTENTS = 'edit-table-of-contents',
  SCANNER_EFFECT = 'scanner-effect',
  SHOW_JAVASCRIPT = 'show-javascript',
  DEV_API = 'dev-api',
  DEV_FOLDER_SCANNING = 'dev-folder-scanning',
  DEV_SSO_GUIDE = 'dev-sso-guide',
  DEV_AIRGAPPED = 'dev-airgapped',
  COMPARE = 'compare',
  COMPRESS = 'compress',
  CONVERT = 'convert',
  MERGE_PDFS = 'mergePdfs',
  MULTI_TOOL = 'multi-tool',
  OCR = 'ocr',
  REDACT = 'redact'
};

export enum SubcategoryId {
  SIGNING = 'signing',
  DOCUMENT_SECURITY = 'documentSecurity',
  VERIFICATION = 'verification',
  DOCUMENT_REVIEW = 'documentReview',
  PAGE_FORMATTING = 'pageFormatting',
  EXTRACTION = 'extraction',
  REMOVAL = 'removal',
  AUTOMATION = 'automation',
  GENERAL = 'general',
  ADVANCED_FORMATTING = 'advancedFormatting',
  DEVELOPER_TOOLS = 'developerTools'
}

export enum ToolCategoryId {
  STANDARD_TOOLS = 'standardTools',
  ADVANCED_TOOLS = 'advancedTools',
  RECOMMENDED_TOOLS = 'recommendedTools'
}

export type ToolRegistryEntry = {
  icon: React.ReactNode;
  name: string;
  component: React.ComponentType<BaseToolProps> | null;
  view: 'sign' | 'security' | 'format' | 'extract' | 'view' | 'merge' | 'pageEditor' | 'convert' | 'redact' | 'split' | 'convert' | 'remove' | 'compress' | 'external';
  description: string;
  categoryId: ToolCategoryId;
  subcategoryId: SubcategoryId;
  maxFiles?: number;
  supportedFormats?: string[];
  endpoints?: string[];
  link?: string;
  type?: string;
}

export type ToolRegistry = Record<ToolId, ToolRegistryEntry>;

export const SUBCATEGORY_ORDER: SubcategoryId[] = [
  SubcategoryId.SIGNING,
  SubcategoryId.DOCUMENT_SECURITY,
  SubcategoryId.VERIFICATION,
  SubcategoryId.DOCUMENT_REVIEW,
  SubcategoryId.PAGE_FORMATTING,
  SubcategoryId.EXTRACTION,
  SubcategoryId.REMOVAL,
  SubcategoryId.AUTOMATION,
  SubcategoryId.GENERAL,
  SubcategoryId.ADVANCED_FORMATTING,
  SubcategoryId.DEVELOPER_TOOLS,
];

export const SUBCATEGORY_COLOR_MAP: Record<SubcategoryId, string> = {
  [SubcategoryId.SIGNING]: '#FF7892',
  [SubcategoryId.DOCUMENT_SECURITY]: '#FF7892',
  [SubcategoryId.VERIFICATION]: '#1BB1D4',
  [SubcategoryId.DOCUMENT_REVIEW]: '#48BD54',
  [SubcategoryId.PAGE_FORMATTING]: '#7882FF',
  [SubcategoryId.EXTRACTION]: '#1BB1D4',
  [SubcategoryId.REMOVAL]: '#7882FF',
  [SubcategoryId.AUTOMATION]: '#69DC95',
  [SubcategoryId.GENERAL]: '#69DC95',
  [SubcategoryId.ADVANCED_FORMATTING]: '#F55454',
  [SubcategoryId.DEVELOPER_TOOLS]: '#F55454',
};

export const getCategoryLabel = (t: TFunction, id: ToolCategoryId): string => t(`toolPicker.categories.${id}`, id);
export const getSubcategoryLabel = (t: TFunction, id: SubcategoryId): string => t(`toolPicker.subcategories.${id}`, id);
export const getSubcategoryColor = (subcategory: SubcategoryId): string => SUBCATEGORY_COLOR_MAP[subcategory] || '#7882FF';



export const getAllEndpoints = (registry: ToolRegistry): string[] => {
  const lists: string[][] = [];
  Object.values(registry).forEach(entry => {
    if (entry.endpoints && entry.endpoints.length > 0) {
      lists.push(entry.endpoints);
    }
  });
  return Array.from(new Set(lists.flat()));
};

export const getConversionEndpoints = (extensionToEndpoint: Record<string, Record<string, string>>): string[] => {
  const endpoints = new Set<string>();
  Object.values(extensionToEndpoint).forEach(toEndpoints => {
    Object.values(toEndpoints).forEach(endpoint => {
      endpoints.add(endpoint);
    });
  });
  return Array.from(endpoints);
};

export const getAllApplicationEndpoints = (
  registry: ToolRegistry,
  extensionToEndpoint?: Record<string, Record<string, string>>
): string[] => {
  const toolEp = getAllEndpoints(registry);
  const convEp = extensionToEndpoint ? getConversionEndpoints(extensionToEndpoint) : [];
  return Array.from(new Set([...toolEp, ...convEp]));
};
