import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { OCRParameters } from '../../../components/tools/ocr/OCRSettings';
import { useToolOperation, ToolOperationConfig } from '../shared/useToolOperation';
import { createDockerToolErrorHandler } from '../../../utils/toolErrorHandler';
import { useToolResources } from '../shared/useToolResources';

// Helper: get MIME type based on file extension
function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'pdf': return 'application/pdf';
    case 'txt': return 'text/plain';
    case 'zip': return 'application/zip';
    default: return 'application/octet-stream';
  }
}

// Helper: strip extension
function stripExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

// Signature must be (file, params)
const buildFormData = (file: File, parameters: OCRParameters): FormData => {
  const formData = new FormData();
  formData.append('fileInput', file);
  parameters.languages.forEach((lang) => formData.append('languages', lang));
  formData.append('ocrType', parameters.ocrType);
  formData.append('ocrRenderType', parameters.ocrRenderType);
  formData.append('sidecar', parameters.additionalOptions.includes('sidecar').toString());
  formData.append('deskew', parameters.additionalOptions.includes('deskew').toString());
  formData.append('clean', parameters.additionalOptions.includes('clean').toString());
  formData.append('cleanFinal', parameters.additionalOptions.includes('cleanFinal').toString());
  formData.append('removeImagesAfter', parameters.additionalOptions.includes('removeImagesAfter').toString());
  return formData;
};

export const useOCROperation = () => {
  const { t } = useTranslation();
  const { extractZipFiles } = useToolResources();

  // OCR-specific parsing: ZIP (sidecar) vs PDF vs HTML error
  const responseHandler = useCallback(async (blob: Blob, originalFiles: File[]): Promise<File[]> => {
    const headBuf = await blob.slice(0, 8).arrayBuffer();
    const head = new TextDecoder().decode(new Uint8Array(headBuf));

    // ZIP: sidecar or multi-asset output
    if (head.startsWith('PK')) {
      const base = stripExt(originalFiles[0].name);
      
      try {
        const extracted = await extractZipFiles(blob);
        if (extracted.length > 0) return extracted;
      } catch (error) {
        // Log extraction failure but don't throw - fall back to raw ZIP
        console.warn(`OCR ZIP extraction failed for ${base}, returning as ZIP file:`, error);
      }
      
      // Fallback: return as ZIP file (this prevents "does nothing" behavior)
      return [new File([blob], `ocr_${base}.zip`, { type: 'application/zip' })];
    }

    // Not a PDF: surface error details if present
    if (!head.startsWith('%PDF')) {
      const textBuf = await blob.slice(0, 1024).arrayBuffer();
      const text = new TextDecoder().decode(new Uint8Array(textBuf));
      if (/error|exception|html/i.test(text)) {
        if (text.includes('OCR tools') && text.includes('not installed')) {
          throw new Error('OCR tools (OCRmyPDF or Tesseract) are not installed on the server. Use the standard or fat Docker image instead of ultra-lite, or install OCR tools manually.');
        }
        const title =
          text.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ||
          text.match(/<h1[^>]*>([^<]+)<\/h1>/i)?.[1] ||
          t('ocr.error.unknown', 'Unknown error');
        throw new Error(`OCR service error: ${title}`);
      }
      throw new Error(`Response is not a valid PDF. Header: "${head}"`);
    }

    const base = stripExt(originalFiles[0].name);
    return [new File([blob], `ocr_${base}.pdf`, { type: 'application/pdf' })];
  }, [t, extractZipFiles]);

  const ocrConfig: ToolOperationConfig<OCRParameters> = {
    operationType: 'ocr',
    endpoint: '/api/v1/misc/ocr-pdf',
    buildFormData,
    filePrefix: 'ocr_',
    multiFileEndpoint: false, // Process files individually
    responseHandler, // use shared flow
    validateParams: (params) =>
      params.languages.length === 0
        ? { valid: false, errors: [t('ocr.validation.languageRequired', 'Please select at least one language for OCR processing.')] }
        : { valid: true },
    getErrorMessage: createDockerToolErrorHandler(
      'OCR',
      'standard or fat',
      t('ocr.error.failed', 'OCR operation failed'),
      ['OCRmyPDF', 'Tesseract']
    ),
  };

  return useToolOperation(ocrConfig);
};
