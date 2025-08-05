import { useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { OCRParameters } from '../../../components/tools/ocr/OCRSettings';
import { useToolOperation, ToolOperationConfig } from '../shared/useToolOperation';
import { createStandardErrorHandler } from '../../../utils/toolErrorHandler';

//Extract files from a ZIP blob
async function extractZipFile(zipBlob: Blob): Promise<File[]> {
  const JSZip = await import('jszip');
  const zip = new JSZip.default();
  
  const arrayBuffer = await zipBlob.arrayBuffer();
  const zipContent = await zip.loadAsync(arrayBuffer);
  
  const extractedFiles: File[] = [];
  
  for (const [filename, file] of Object.entries(zipContent.files)) {
    if (!file.dir) {
      const content = await file.async('blob');
      const extractedFile = new File([content], filename, { type: getMimeType(filename) });
      extractedFiles.push(extractedFile);
    }
  }
  
  return extractedFiles;
}

//Get MIME type based on file extension 
function getMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  switch (ext) {
    case 'pdf':
      return 'application/pdf';
    case 'txt':
      return 'text/plain';
    case 'zip':
      return 'application/zip';
    default:
      return 'application/octet-stream';
  }
}

const buildFormData = (parameters: OCRParameters, file: File): FormData => {
  const formData = new FormData();

  // Add the file
  formData.append('fileInput', file);

  // Add languages as multiple parameters with same name (like checkboxes)
  parameters.languages.forEach(lang => {
    formData.append('languages', lang);
  });

  // Add other parameters
  formData.append('ocrType', parameters.ocrType);
  formData.append('ocrRenderType', parameters.ocrRenderType);
  
  // Handle additional options - convert array to individual boolean parameters
  formData.append('sidecar', parameters.additionalOptions.includes('sidecar').toString());
  formData.append('deskew', parameters.additionalOptions.includes('deskew').toString());
  formData.append('clean', parameters.additionalOptions.includes('clean').toString());
  formData.append('cleanFinal', parameters.additionalOptions.includes('cleanFinal').toString());
  formData.append('removeImagesAfter', parameters.additionalOptions.includes('removeImagesAfter').toString());

  return formData;
};

export const useOCROperation = () => {
  const { t } = useTranslation();
  
  const customOCRProcessor = useCallback(async (
    parameters: OCRParameters,
    selectedFiles: File[]
  ): Promise<File[]> => {
    if (parameters.languages.length === 0) {
      throw new Error(t('ocr.validation.languageRequired', 'Please select at least one language for OCR processing.'));
    }

    const processedFiles: File[] = [];
    const failedFiles: string[] = [];

    // OCR typically processes one file at a time
    for (let i = 0; i < selectedFiles.length; i++) {
      const file = selectedFiles[i];

      try {
        const formData = buildFormData(file, parameters);
        const response = await axios.post('/api/v1/misc/ocr-pdf', formData, { 
          responseType: "blob"
        });

        // Check for HTTP errors
        if (response.status >= 400) {
          const errorText = await response.data.text();
          throw new Error(`OCR service HTTP error ${response.status}: ${errorText.substring(0, 300)}`);
        }

        // Validate response
        if (!response.data || response.data.size === 0) {
          throw new Error('Empty response from OCR service');
        }

        const contentType = response.headers['content-type'] || 'application/pdf';
        
        // Check if response is actually a PDF by examining the first few bytes
        const arrayBuffer = await response.data.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        const header = new TextDecoder().decode(uint8Array.slice(0, 4));
        
        // Check if it's a ZIP file (OCR service returns ZIP when sidecar is enabled or for multi-file results)
        if (header.startsWith('PK')) {
          try {
            // Extract ZIP file contents
            const zipFiles = await extractZipFile(response.data);
            
            // Add extracted files to processed files
            processedFiles.push(...zipFiles);
          } catch (extractError) {
            // Fallback to treating as single ZIP file
            const blob = new Blob([response.data], { type: 'application/zip' });
            const processedFile = new File([blob], `ocr_${file.name}.zip`, { type: 'application/zip' });
            processedFiles.push(processedFile);
          }
          continue; // Skip the PDF validation for ZIP files
        }
        
        if (!header.startsWith('%PDF')) {
          // Check if it's an error response
          const text = new TextDecoder().decode(uint8Array.slice(0, 500));
          
          if (text.includes('error') || text.includes('Error') || text.includes('exception') || text.includes('html')) {
            // Check for specific OCR tool unavailable error
            if (text.includes('OCR tools') && text.includes('not installed')) {
              throw new Error('OCR tools (OCRmyPDF or Tesseract) are not installed on the server. Use the standard or fat Docker image instead of ultra-lite, or install OCR tools manually.');
            }
            throw new Error(`OCR service error: ${text.substring(0, 300)}`);
          }
          
          // Check if it's an HTML error page
          if (text.includes('<html') || text.includes('<!DOCTYPE')) {
            // Try to extract error message from HTML
            const errorMatch = text.match(/<title[^>]*>([^<]+)<\/title>/i) || 
                             text.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                             text.match(/<body[^>]*>([^<]+)<\/body>/i);
            const errorMessage = errorMatch ? errorMatch[1].trim() : t('ocr.error.unknown', 'Unknown error');
            throw new Error(`OCR service error: ${errorMessage}`);
          }
          
          throw new Error(`Response is not a valid PDF file. Header: "${header}"`);
        }

        const blob = new Blob([response.data], { type: contentType });
        const processedFile = new File([blob], `ocr_${file.name}`, { type: contentType });

        processedFiles.push(processedFile);
      } catch (fileError) {
        const errorMessage = fileError instanceof Error ? fileError.message : t('ocr.error.unknown', 'Unknown error');
        failedFiles.push(`${file.name} (${errorMessage})`);
      }
    }

    if (failedFiles.length > 0 && processedFiles.length === 0) {
      throw new Error(`Failed to process OCR for all files: ${failedFiles.join(', ')}`);
    }

    return processedFiles;
  }, [t]);

  const ocrConfig: ToolOperationConfig<OCRParameters> = {
    operationType: 'ocr',
    endpoint: '/api/v1/misc/ocr-pdf', // Not used with customProcessor but required
    buildFormData, // Not used with customProcessor but required
    filePrefix: 'ocr_',
    customProcessor: customOCRProcessor,
    validateParams: (params) => {
      if (params.languages.length === 0) {
        return { valid: false, errors: [t('ocr.validation.languageRequired', 'Please select at least one language for OCR processing.')] };
      }
      return { valid: true };
    },
    getErrorMessage: (error) => {
      // Handle OCR-specific error first
      if (error.message?.includes('OCR tools') && error.message?.includes('not installed')) {
        return 'OCR tools (OCRmyPDF or Tesseract) are not installed on the server. Use the standard or fat Docker image instead of ultra-lite, or install OCR tools manually.';
      }
      // Fall back to standard error handling
      return createStandardErrorHandler(t('ocr.error.failed', 'OCR operation failed'))(error);
    }
  };

  return useToolOperation(ocrConfig);
}; 