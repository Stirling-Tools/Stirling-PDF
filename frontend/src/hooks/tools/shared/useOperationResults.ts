import { useState, useCallback } from 'react';

export interface OperationResult {
  files: File[];
  thumbnails: string[];
  isGeneratingThumbnails: boolean;
}

export interface OperationResultsHook {
  results: OperationResult;
  downloadUrl: string | null;
  status: string;
  errorMessage: string | null;
  isLoading: boolean;
  
  setResults: (results: OperationResult) => void;
  setDownloadUrl: (url: string | null) => void;
  setStatus: (status: string) => void;
  setErrorMessage: (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;
  
  resetResults: () => void;
  clearError: () => void;
}

const initialResults: OperationResult = {
  files: [],
  thumbnails: [],
  isGeneratingThumbnails: false,
};

export const useOperationResults = (): OperationResultsHook => {
  const [results, setResults] = useState<OperationResult>(initialResults);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const resetResults = useCallback(() => {
    setResults(initialResults);
    setDownloadUrl(null);
    setStatus('');
    setErrorMessage(null);
    setIsLoading(false);
  }, []);

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  return {
    results,
    downloadUrl,
    status,
    errorMessage,
    isLoading,
    
    setResults,
    setDownloadUrl,
    setStatus,
    setErrorMessage,
    setIsLoading,
    
    resetResults,
    clearError,
  };
};