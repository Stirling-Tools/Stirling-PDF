import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { OCRParameters, defaultParameters } from '@app/hooks/tools/ocr/useOCRParameters';
import { useToolOperation, ToolOperationConfig, ToolType } from '@app/hooks/tools/shared/useToolOperation';
import { createStandardErrorHandler } from '@app/utils/toolErrorHandler';
import { useToolResources } from '@app/hooks/tools/shared/useToolResources';

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

// Lightweight ZIP extractor (keep or replace with a shared util if you have one)
async function extractZipFile(zipBlob: Blob): Promise<File[]> {
  const JSZip = await import('jszip');
  const zip = new JSZip.default();
  const zipContent = await zip.loadAsync(await zipBlob.arrayBuffer());
  const out: File[] = [];
  for (const [filename, file] of Object.entries(zipContent.files)) {
    if (!file.dir) {
      const content = await file.async('blob');
      out.push(new File([content], filename, { type: getMimeType(filename) }));
    }
  }
  return out;
}

// Helper: strip extension
function stripExt(name: string): string {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

// Static function that can be used by both the hook and automation executor
export const buildOCRFormData = (parameters: OCRParameters, file: File): FormData => {
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
  formData.append('invalidateDigitalSignatures', parameters.additionalOptions.includes('invalidateDigitalSignatures').toString());
  return formData;
};

// Static response handler for OCR - can be used by automation executor
export const ocrResponseHandler = async (blob: Blob, originalFiles: File[], extractZipFiles: (blob: Blob) => Promise<File[]>): Promise<File[]> => {
  const headBuf = await blob.slice(0, 8).arrayBuffer();
  const head = new TextDecoder().decode(new Uint8Array(headBuf));

  // ZIP: sidecar or multi-asset output
  if (head.startsWith('PK')) {
    const base = stripExt(originalFiles[0].name);
    try {
      const extractedFiles = await extractZipFiles(blob);
      if (extractedFiles.length > 0) return extractedFiles;
    } catch { /* ignore and try local extractor */ }
    try {
      const local = await extractZipFile(blob); // local fallback
      if (local.length > 0) return local;
    } catch { /* fall through */ }
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
        'Unknown error';
      throw new Error(`OCR service error: ${title}`);
    }
    throw new Error(`Response is not a valid PDF. Header: "${head}"`);
  }

  const originalName = originalFiles[0].name;
  return [new File([blob], originalName, { type: 'application/pdf' })];
};

// Static configuration object (without t function dependencies)
export const ocrOperationConfig = {
  toolType: ToolType.singleFile,
  buildFormData: buildOCRFormData,
  operationType: 'ocr',
  endpoint: '/api/v1/misc/ocr-pdf',
  defaultParameters,
} as const;

export const useOCROperation = () => {
  const { t } = useTranslation();
  const { extractZipFiles } = useToolResources();

  // OCR-specific parsing: ZIP (sidecar) vs PDF vs HTML error
  const responseHandler = useCallback(async (blob: Blob, originalFiles: File[]): Promise<File[]> => {
    // extractZipFiles from useToolResources already returns File[] directly
    const simpleExtractZipFiles = extractZipFiles;
    return ocrResponseHandler(blob, originalFiles, simpleExtractZipFiles);
  }, [extractZipFiles]);

  const ocrConfig: ToolOperationConfig<OCRParameters> = {
    ...ocrOperationConfig,
    responseHandler,
    getErrorMessage: (error) =>
      error.message?.includes('OCR tools') && error.message?.includes('not installed')
        ? 'OCR tools (OCRmyPDF or Tesseract) are not installed on the server. Use the standard or fat Docker image instead of ultra-lite, or install OCR tools manually.'
        : createStandardErrorHandler(t('ocr.error.failed', 'OCR operation failed'))(error),
  };

  return useToolOperation(ocrConfig);
};
