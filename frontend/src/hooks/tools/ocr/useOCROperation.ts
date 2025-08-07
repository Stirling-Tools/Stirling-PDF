import { useState, useCallback } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useFileContext } from '../../../contexts/FileContext';
import { FileOperation } from '../../../types/fileContext';
import { OCRParameters } from '../../../components/tools/ocr/OCRSettings';

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

export interface OCROperationHook {
  files: File[];
  thumbnails: string[];
  downloadUrl: string | null;
  downloadFilename: string | null;
  isLoading: boolean;
  isGeneratingThumbnails: boolean;
  status: string;
  errorMessage: string | null;
  executeOperation: (parameters: OCRParameters, selectedFiles: File[]) => Promise<void>;
  resetResults: () => void;
  clearError: () => void;
}

export const useOCROperation = (): OCROperationHook => {
  const { t } = useTranslation();
  const {
    recordOperation,
    markOperationApplied,
    markOperationFailed,
    addFiles
  } = useFileContext();

  // Internal state management
  const [files, setFiles] = useState<File[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadFilename, setDownloadFilename] = useState<string>('');
  const [status, setStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Track blob URLs for cleanup
  const [blobUrls, setBlobUrls] = useState<string[]>([]);

  const cleanupBlobUrls = useCallback(() => {
    blobUrls.forEach(url => {
      try {
        URL.revokeObjectURL(url);
      } catch (error) {
        console.warn('Failed to revoke blob URL:', error);
      }
    });
    setBlobUrls([]);
  }, [blobUrls]);

  const buildFormData = useCallback((
    parameters: OCRParameters,
    file: File
  ) => {
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

    const endpoint = '/api/v1/misc/ocr-pdf';

    return { formData, endpoint };
  }, []);

  const createOperation = useCallback((
    parameters: OCRParameters,
    selectedFiles: File[]
  ): { operation: FileOperation; operationId: string; fileId: string } => {
    const operationId = `ocr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fileId = selectedFiles.map(f => f.name).join(',');

    const operation: FileOperation = {
      id: operationId,
      type: 'ocr',
      timestamp: Date.now(),
      fileIds: selectedFiles.map(f => f.name),
      status: 'pending',
      metadata: {
        originalFileName: selectedFiles[0]?.name,
        parameters: {
          languages: parameters.languages,
          ocrType: parameters.ocrType,
          ocrRenderType: parameters.ocrRenderType,
          additionalOptions: parameters.additionalOptions,
        },
        fileSize: selectedFiles.reduce((sum, f) => sum + f.size, 0)
      }
    };

    return { operation, operationId, fileId };
  }, []);

  const executeOperation = useCallback(async (
    parameters: OCRParameters,
    selectedFiles: File[]
  ) => {
    if (selectedFiles.length === 0) {
      setStatus(t("noFileSelected") || "No file selected");
      return;
    }
    
    if (parameters.languages.length === 0) {
      setErrorMessage('Please select at least one language for OCR processing.');
      return;
    }

    const validFiles = selectedFiles.filter(file => file.size > 0);
    if (validFiles.length === 0) {
      setErrorMessage('No valid files to process. All selected files are empty.');
      return;
    }

    if (validFiles.length < selectedFiles.length) {
      console.warn(`Skipping ${selectedFiles.length - validFiles.length} empty files`);
    }

    const { operation, operationId, fileId } = createOperation(parameters, selectedFiles);

    recordOperation(fileId, operation);

    setStatus(t("loading") || "Loading...");
    setIsLoading(true);
    setErrorMessage(null);
    setFiles([]);
    setThumbnails([]);

    try {
      const processedFiles: File[] = [];
      const failedFiles: string[] = [];

      // OCR typically processes one file at a time
      for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        setStatus(`Processing OCR for ${file.name} (${i + 1}/${validFiles.length})`);

        try {
          const { formData, endpoint } = buildFormData(parameters, file);
          const response = await axios.post(endpoint, formData, { 
            responseType: "blob",
            timeout: 300000 // 5 minute timeout for OCR
          });

          // Check for HTTP errors
          if (response.status >= 400) {
            // Try to read error response as text
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
              const errorMessage = errorMatch ? errorMatch[1].trim() : 'Unknown error';
              throw new Error(`OCR service error: ${errorMessage}`);
            }
            
            throw new Error(`Response is not a valid PDF file. Header: "${header}"`);
          }

          const blob = new Blob([response.data], { type: contentType });
          const processedFile = new File([blob], `ocr_${file.name}`, { type: contentType });

          processedFiles.push(processedFile);
        } catch (fileError) {
          const errorMessage = fileError instanceof Error ? fileError.message : 'Unknown error';
          failedFiles.push(`${file.name} (${errorMessage})`);
        }
      }

      if (failedFiles.length > 0 && processedFiles.length === 0) {
        throw new Error(`Failed to process OCR for all files: ${failedFiles.join(', ')}`);
      }

      if (failedFiles.length > 0) {
        setStatus(`Processed ${processedFiles.length}/${validFiles.length} files. Failed: ${failedFiles.join(', ')}`);
      } else {
        const hasPdfFiles = processedFiles.some(file => file.name.endsWith('.pdf'));
        const hasTxtFiles = processedFiles.some(file => file.name.endsWith('.txt'));
        let statusMessage = `OCR completed successfully for ${processedFiles.length} file(s)`;
        
        if (hasPdfFiles && hasTxtFiles) {
          statusMessage += ' (Extracted PDF and text files)';
        } else if (hasPdfFiles) {
          statusMessage += ' (Extracted PDF files)';
        } else if (hasTxtFiles) {
          statusMessage += ' (Extracted text files)';
        }
        
        setStatus(statusMessage);
      }

      setFiles(processedFiles);
      setIsGeneratingThumbnails(true);

      await addFiles(processedFiles);

      // Cleanup old blob URLs
      cleanupBlobUrls();

      // Create download URL - for multiple files, we'll create a new ZIP
      if (processedFiles.length === 1) {
        const url = window.URL.createObjectURL(processedFiles[0]);
        setDownloadUrl(url);
        setBlobUrls([url]);
        setDownloadFilename(processedFiles[0].name);
      } else {
        // For multiple files, create a new ZIP containing all extracted files
        try {
          const JSZip = await import('jszip');
          const zip = new JSZip.default();
          
          for (const file of processedFiles) {
            zip.file(file.name, file);
          }
          
          const zipBlob = await zip.generateAsync({ type: 'blob' });
          const url = window.URL.createObjectURL(zipBlob);
          setDownloadUrl(url);
          setBlobUrls([url]);
          setDownloadFilename(`ocr_extracted_files.zip`);
        } catch (zipError) {
          // Fallback to first file
          const url = window.URL.createObjectURL(processedFiles[0]);
          setDownloadUrl(url);
          setBlobUrls([url]);
          setDownloadFilename(processedFiles[0].name);
        }
      }

             markOperationApplied(fileId, operationId);
       setIsGeneratingThumbnails(false);
     } catch (error) {
       console.error('OCR operation error:', error);
       const errorMessage = error instanceof Error ? error.message : 'OCR operation failed';
       setErrorMessage(errorMessage);
       setStatus('');
       markOperationFailed(fileId, operationId, errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [buildFormData, createOperation, recordOperation, addFiles, cleanupBlobUrls, markOperationApplied, markOperationFailed, t]);

  const resetResults = useCallback(() => {
    setFiles([]);
    setThumbnails([]);
    setDownloadUrl(null);
    setDownloadFilename('');
    setStatus('');
    setErrorMessage(null);
    setIsLoading(false);
    setIsGeneratingThumbnails(false);
    cleanupBlobUrls();
  }, [cleanupBlobUrls]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  return {
    files,
    thumbnails,
    downloadUrl,
    downloadFilename,
    isLoading,
    isGeneratingThumbnails,
    status,
    errorMessage,
    executeOperation,
    resetResults,
    clearError,
  };
}; 