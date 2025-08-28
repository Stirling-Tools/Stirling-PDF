import { ToolId } from '../types/toolId';

// Map URL paths to tool keys (multiple URLs can map to same tool)
export const URL_TO_TOOL_MAP: Record<string, ToolId> = {
  '/split-pdfs': 'split',
  '/split': 'split',
  '/merge-pdfs': 'mergePdfs',
  '/compress-pdf': 'compress',
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
  '/add-password': 'addPassword',
  '/change-permissions': 'change-permissions',
  '/sanitize-pdf': 'sanitize',
  '/ocr': 'ocr',
  '/ocr-pdf': 'ocr',
  '/add-watermark': 'addWatermark',
  '/remove-password': 'remove-password',
  '/single-large-page': 'single-large-page',
  '/repair': 'repair',
  '/unlock-pdf-forms': 'unlock-pdf-forms',
  '/remove-certificate-sign': 'remove-certificate-sign',
  '/remove-cert-sign': 'remove-certificate-sign'
};
