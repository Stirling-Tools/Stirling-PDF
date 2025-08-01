import { useToolOperation, ToolOperationHook } from '../shared/useToolOperation';

export interface RepairOperationState {
  files: File[];
  thumbnails: string[];
  isGeneratingThumbnails: boolean;
  downloadUrl: string | null;
  downloadFilename: string;
  isLoading: boolean;
  status: string;
  errorMessage: string | null;
  executeOperation: (selectedFiles: File[]) => Promise<void>;
  resetResults: () => void;
  clearError: () => void;
}

export const useRepairOperation = (): RepairOperationState => {
  const toolOperation = useToolOperation({
    operationType: 'repair',
    endpoint: '/api/v1/misc/repair',
    buildFormData: (file: File) => {
      const formData = new FormData();
      formData.append('fileInput', file);
      return formData;
    },
    filePrefix: 'repaired_'
  });

  return {
    ...toolOperation,
    executeOperation: (selectedFiles: File[]) => toolOperation.executeOperation(undefined, selectedFiles)
  };
};