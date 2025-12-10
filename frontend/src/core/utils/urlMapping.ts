import { ToolId } from '@app/types/toolId';

// Map URL paths to tool keys (multiple URLs can map to same tool)
export const URL_TO_TOOL_MAP: Record<string, ToolId> = {
  // Basic tools - standard patterns
  '/split': 'split',
  '/split-pdfs': 'split',
  '/merge': 'merge',
  '/merge-pdfs': 'merge',
  '/compress': 'compress',
  '/compress-pdf': 'compress',
  '/rotate': 'rotate',
  '/rotate-pdf': 'rotate',
  '/repair': 'repair',
  '/flatten': 'flatten',
  '/crop': 'crop',

  // Convert tool and all its variants
  '/convert': 'convert',
  '/convert-pdf': 'convert',
  '/file-to-pdf': 'convert',
  '/eml-to-pdf': 'convert',
  '/html-to-pdf': 'convert',
  '/markdown-to-pdf': 'convert',
  '/pdf-to-csv': 'convert',
  '/pdf-to-img': 'convert',
  '/pdf-to-markdown': 'convert',
  '/pdf-to-pdfa': 'convert',
  '/pdf-to-word': 'convert',
  '/pdf-to-xml': 'convert',
  '/cbr-to-pdf': 'convert',
  '/pdf-to-cbr': 'convert',
  '/cbz-to-pdf': 'convert',
  '/pdf-to-cbz': 'convert',

  // Security tools
  '/add-password': 'addPassword',
  '/remove-password': 'removePassword',
  '/change-permissions': 'changePermissions',
  '/cert-sign': 'certSign',
  '/manage-signatures': 'certSign',
  '/remove-certificate-sign': 'removeCertSign',
  '/remove-cert-sign': 'removeCertSign',
  '/unlock-pdf-forms': 'unlockPDFForms',
  '/validate-signature': 'validateSignature',

  // Content manipulation
  '/sanitize': 'sanitize',
  '/sanitize-pdf': 'sanitize',
  '/ocr': 'ocr',
  '/ocr-pdf': 'ocr',
  '/watermark': 'watermark',
  '/add-watermark': 'watermark',
  '/add-image': 'addImage',
  '/add-stamp': 'addStamp',
  '/add-page-numbers': 'addPageNumbers',
  '/redact': 'redact',

  // Page manipulation
  '/remove-pages': 'removePages',
  '/remove-blanks': 'removeBlanks',
  '/extract-pages': 'extractPages',
  '/reorganize-pages': 'reorganizePages',
  '/single-large-page': 'pdfToSinglePage',
  '/page-layout': 'pageLayout',
  '/scale-pages': 'scalePages',
  '/booklet-imposition': 'bookletImposition',

  // Splitting tools
  '/auto-split-pdf': 'split',
  '/auto-size-split-pdf': 'split',
  '/scanner-image-split': 'scannerImageSplit',

  // Annotation and content removal
  '/remove-annotations': 'removeAnnotations',
  '/remove-image': 'removeImage',

  // Image and visual tools
  '/extract-images': 'extractImages',
  '/adjust-contrast': 'adjustContrast',
  '/fake-scan': 'scannerEffect',
  '/replace-color-pdf': 'replaceColor',

  // Metadata and info
  '/change-metadata': 'changeMetadata',
  '/get-pdf-info': 'getPdfInfo',
  '/add-attachments': 'addAttachments',

  // Advanced tools
  '/overlay-pdfs': 'overlayPdfs',
  '/edit-table-of-contents': 'editTableOfContents',
  '/auto-rename': 'autoRename',
  '/compare': 'compare',
  '/multi-tool': 'multiTool',
  '/show-js': 'showJS',

  // Special/utility tools
  '/read': 'read',
  '/automate': 'automate',
  '/sign': 'sign',
  '/add-text': 'addText',
  '/pdf-text-editor': 'pdfTextEditor',

  // Developer tools
  '/dev-api': 'devApi',
  '/dev-folder-scanning': 'devFolderScanning',
  '/dev-sso-guide': 'devSsoGuide',
  '/dev-airgapped': 'devAirgapped',

  // Legacy URL mappings from sitemap
  '/pdf-organizer': 'reorganizePages',
  '/multi-page-layout': 'pageLayout',
  '/extract-page': 'extractPages',
  '/pdf-to-single-page': 'pdfToSinglePage',
  '/img-to-pdf': 'convert',
  '/pdf-to-presentation': 'convert',
  '/pdf-to-text': 'convert',
  '/pdf-to-html': 'convert',
  '/auto-redact': 'redact',
  '/stamp': 'addStamp',
  '/view-pdf': 'read',
  '/get-info-on-pdf': 'getPdfInfo',
  '/remove-image-pdf': 'removeImage',
  '/replace-and-invert-color-pdf': 'replaceColor',
  '/pipeline': 'automate',
  '/extract-image-scans': 'scannerImageSplit',
  '/show-javascript': 'showJS',
  '/scanner-effect': 'scannerEffect',
  '/split-by-size-or-count': 'split',
  '/overlay-pdf': 'overlayPdfs',
  '/split-pdf-by-sections': 'split',
  '/split-pdf-by-chapters': 'split',
};
