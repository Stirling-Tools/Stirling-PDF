import { useCallback, useState } from 'react';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useFileContext } from '../../../contexts/FileContext';
import { FileOperation } from '../../../types/fileContext';
import { zipFileService } from '../../../services/zipFileService';
import { generateThumbnailForFile } from '../../../utils/thumbnailUtils';
import { SplitParameters } from '../../../components/tools/split/SplitSettings';
import { SPLIT_MODES, ENDPOINTS, type SplitMode } from '../../../constants/splitConstants';
import { makeApiUrl } from '../../../utils/api';

export interface SplitOperationHook {
  executeOperation: (
    mode: SplitMode | '',
    parameters: SplitParameters,
    selectedFiles: File[]
  ) => Promise<void>;
  
  // Flattened result properties for cleaner access
  files: File[];
  thumbnails: string[];
  isGeneratingThumbnails: boolean;
  downloadUrl: string | null;
  status: string;
  errorMessage: string | null;
  isLoading: boolean;
  
  // Result management functions
  resetResults: () => void;
  clearError: () => void;
}

export const useSplitOperation = (): SplitOperationHook => {
  const { t } = useTranslation();
  const { 
    recordOperation, 
    markOperationApplied, 
    markOperationFailed,
    addFiles
  } = useFileContext();
  
  // Internal state management (replacing useOperationResults)
  const [files, setFiles] = useState<File[]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [isGeneratingThumbnails, setIsGeneratingThumbnails] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const buildFormData = useCallback((
    mode: SplitMode | '',
    parameters: SplitParameters,
    selectedFiles: File[]
  ) => {
    const formData = new FormData();
    
    selectedFiles.forEach(file => {
      formData.append("fileInput", file);
    });

    if (!mode) {
      throw new Error('Split mode is required');
    }

    let endpoint = "";

    switch (mode) {
      case SPLIT_MODES.BY_PAGES:
        formData.append("pageNumbers", parameters.pages);
        endpoint = "/api/v1/general/split-pages";
        break;
      case SPLIT_MODES.BY_SECTIONS:
        formData.append("horizontalDivisions", parameters.hDiv);
        formData.append("verticalDivisions", parameters.vDiv);
        formData.append("merge", parameters.merge.toString());
        endpoint = "/api/v1/general/split-pdf-by-sections";
        break;
      case SPLIT_MODES.BY_SIZE_OR_COUNT:
        formData.append(
          "splitType",
          parameters.splitType === "size" ? "0" : parameters.splitType === "pages" ? "1" : "2"
        );
        formData.append("splitValue", parameters.splitValue);
        endpoint = "/api/v1/general/split-by-size-or-count";
        break;
      case SPLIT_MODES.BY_CHAPTERS:
        formData.append("bookmarkLevel", parameters.bookmarkLevel);
        formData.append("includeMetadata", parameters.includeMetadata.toString());
        formData.append("allowDuplicates", parameters.allowDuplicates.toString());
        endpoint = "/api/v1/general/split-pdf-by-chapters";
        break;
      default:
        throw new Error(`Unknown split mode: ${mode}`);
    }

    return { formData, endpoint };
  }, []);

  const createOperation = useCallback((
    mode: SplitMode | '',
    parameters: SplitParameters,
    selectedFiles: File[]
  ): { operation: FileOperation; operationId: string; fileId: string } => {
    const operationId = `split-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const fileId = selectedFiles[0].name;

    const operation: FileOperation = {
      id: operationId,
      type: 'split',
      timestamp: Date.now(),
      fileIds: selectedFiles.map(f => f.name),
      status: 'pending',
      metadata: {
        originalFileName: selectedFiles[0].name,
        parameters: {
          mode,
          pages: mode === SPLIT_MODES.BY_PAGES ? parameters.pages : undefined,
          hDiv: mode === SPLIT_MODES.BY_SECTIONS ? parameters.hDiv : undefined,
          vDiv: mode === SPLIT_MODES.BY_SECTIONS ? parameters.vDiv : undefined,
          merge: mode === SPLIT_MODES.BY_SECTIONS ? parameters.merge : undefined,
          splitType: mode === SPLIT_MODES.BY_SIZE_OR_COUNT ? parameters.splitType : undefined,
          splitValue: mode === SPLIT_MODES.BY_SIZE_OR_COUNT ? parameters.splitValue : undefined,
          bookmarkLevel: mode === SPLIT_MODES.BY_CHAPTERS ? parameters.bookmarkLevel : undefined,
          includeMetadata: mode === SPLIT_MODES.BY_CHAPTERS ? parameters.includeMetadata : undefined,
          allowDuplicates: mode === SPLIT_MODES.BY_CHAPTERS ? parameters.allowDuplicates : undefined,
        },
        fileSize: selectedFiles[0].size
      }
    };

    return { operation, operationId, fileId };
  }, []);

  const processResults = useCallback(async (blob: Blob) => {
    try {
      const zipFile = new File([blob], "split_result.zip", { type: "application/zip" });
      const extractionResult = await zipFileService.extractPdfFiles(zipFile);

      if (extractionResult.success && extractionResult.extractedFiles.length > 0) {
        // Set local state for preview
        setFiles(extractionResult.extractedFiles);
        setThumbnails([]);
        setIsGeneratingThumbnails(true);

        // Add extracted files to FileContext for future use
        await addFiles(extractionResult.extractedFiles);

        const thumbnails = await Promise.all(
          extractionResult.extractedFiles.map(async (file) => {
            try {
              return await generateThumbnailForFile(file);
            } catch (error) {
              console.warn(`Failed to generate thumbnail for ${file.name}:`, error);
              return '';
            }
          })
        );

        setThumbnails(thumbnails);
        setIsGeneratingThumbnails(false);
      }
    } catch (extractError) {
      console.warn('Failed to extract files for preview:', extractError);
    }
  }, [addFiles]);

  const executeOperation = useCallback(async (
    mode: SplitMode | '',
    parameters: SplitParameters,
    selectedFiles: File[]
  ) => {
    if (selectedFiles.length === 0) {
      setStatus(t("noFileSelected"));
      return;
    }

    const { operation, operationId, fileId } = createOperation(mode, parameters, selectedFiles);
    const { formData, endpoint } = buildFormData(mode, parameters, selectedFiles);

    recordOperation(fileId, operation);

    setStatus(t("loading"));
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await axios.post(makeApiUrl(endpoint), formData, { responseType: "blob" });
      const blob = new Blob([response.data], { type: "application/zip" });
      const url = window.URL.createObjectURL(blob);
      
      setDownloadUrl(url);
      setStatus(t("downloadComplete"));

      await processResults(blob);
      markOperationApplied(fileId, operationId);
    } catch (error: any) {
      console.error(error);
      let errorMsg = t("error.pdfPassword", "An error occurred while splitting the PDF.");
      if (error.response?.data && typeof error.response.data === 'string') {
        errorMsg = error.response.data;
      } else if (error.message) {
        errorMsg = error.message;
      }
      setErrorMessage(errorMsg);
      setStatus(t("error._value", "Split failed."));
      markOperationFailed(fileId, operationId, errorMsg);
    } finally {
      setIsLoading(false);
    }
  }, [t, createOperation, buildFormData, recordOperation, markOperationApplied, markOperationFailed, processResults]);

  const resetResults = useCallback(() => {
    setFiles([]);
    setThumbnails([]);
    setIsGeneratingThumbnails(false);
    setDownloadUrl(null);
    setStatus('');
    setErrorMessage(null);
    setIsLoading(false);
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  return {
    executeOperation,
    
    // Flattened result properties for cleaner access
    files,
    thumbnails,
    isGeneratingThumbnails,
    downloadUrl,
    status,
    errorMessage,
    isLoading,
    
    // Result management functions
    resetResults,
    clearError,
  };
};