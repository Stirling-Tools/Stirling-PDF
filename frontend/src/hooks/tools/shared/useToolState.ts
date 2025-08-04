import { useReducer, useCallback } from 'react';

export interface ProcessingProgress {
  current: number;
  total: number;
  currentFileName?: string;
}

export interface OperationState {
  files: File[];
  thumbnails: string[];
  isGeneratingThumbnails: boolean;
  downloadUrl: string | null;
  downloadFilename: string;
  isLoading: boolean;
  status: string;
  errorMessage: string | null;
  progress: ProcessingProgress | null;
}

type OperationAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_FILES'; payload: File[] }
  | { type: 'SET_THUMBNAILS'; payload: string[] }
  | { type: 'SET_GENERATING_THUMBNAILS'; payload: boolean }
  | { type: 'SET_DOWNLOAD_INFO'; payload: { url: string | null; filename: string } }
  | { type: 'SET_STATUS'; payload: string }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_PROGRESS'; payload: ProcessingProgress | null }
  | { type: 'RESET_RESULTS' }
  | { type: 'CLEAR_ERROR' };

const initialState: OperationState = {
  files: [],
  thumbnails: [],
  isGeneratingThumbnails: false,
  downloadUrl: null,
  downloadFilename: '',
  isLoading: false,
  status: '',
  errorMessage: null,
  progress: null,
};

const operationReducer = (state: OperationState, action: OperationAction): OperationState => {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_FILES':
      return { ...state, files: action.payload };
    case 'SET_THUMBNAILS':
      return { ...state, thumbnails: action.payload };
    case 'SET_GENERATING_THUMBNAILS':
      return { ...state, isGeneratingThumbnails: action.payload };
    case 'SET_DOWNLOAD_INFO':
      return { 
        ...state, 
        downloadUrl: action.payload.url, 
        downloadFilename: action.payload.filename 
      };
    case 'SET_STATUS':
      return { ...state, status: action.payload };
    case 'SET_ERROR':
      return { ...state, errorMessage: action.payload };
    case 'SET_PROGRESS':
      return { ...state, progress: action.payload };
    case 'RESET_RESULTS':
      return {
        ...initialState,
        isLoading: state.isLoading, // Preserve loading state during reset
      };
    case 'CLEAR_ERROR':
      return { ...state, errorMessage: null };
    default:
      return state;
  }
};

export const useToolState = () => {
  const [state, dispatch] = useReducer(operationReducer, initialState);

  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: loading });
  }, []);

  const setFiles = useCallback((files: File[]) => {
    dispatch({ type: 'SET_FILES', payload: files });
  }, []);

  const setThumbnails = useCallback((thumbnails: string[]) => {
    dispatch({ type: 'SET_THUMBNAILS', payload: thumbnails });
  }, []);

  const setGeneratingThumbnails = useCallback((generating: boolean) => {
    dispatch({ type: 'SET_GENERATING_THUMBNAILS', payload: generating });
  }, []);

  const setDownloadInfo = useCallback((url: string | null, filename: string) => {
    dispatch({ type: 'SET_DOWNLOAD_INFO', payload: { url, filename } });
  }, []);

  const setStatus = useCallback((status: string) => {
    dispatch({ type: 'SET_STATUS', payload: status });
  }, []);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: error });
  }, []);

  const setProgress = useCallback((progress: ProcessingProgress | null) => {
    dispatch({ type: 'SET_PROGRESS', payload: progress });
  }, []);

  const resetResults = useCallback(() => {
    dispatch({ type: 'RESET_RESULTS' });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
  }, []);

  return {
    state,
    actions: {
      setLoading,
      setFiles,
      setThumbnails,
      setGeneratingThumbnails,
      setDownloadInfo,
      setStatus,
      setError,
      setProgress,
      resetResults,
      clearError,
    },
  };
};