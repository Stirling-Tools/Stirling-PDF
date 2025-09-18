import { useEffect, useCallback, useRef } from 'react';
import { useFileSelection } from '../../../contexts/FileContext';
import { useEndpointEnabled } from '../../useEndpointConfig';
import { BaseToolProps } from '../../../types/tool';
import { ToolOperationHook } from './useToolOperation';
import { BaseParametersHook } from './useBaseParameters';
import { StirlingFile } from '../../../types/fileContext';

interface BaseToolReturn<TParams, TParamsHook extends BaseParametersHook<TParams>> {
  // File management
  selectedFiles: StirlingFile[];

  // Tool-specific hooks
  params: TParamsHook;
  operation: ToolOperationHook<TParams>;

  // Endpoint validation
  endpointEnabled: boolean | null;
  endpointLoading: boolean;

  // Standard handlers
  handleExecute: () => Promise<void>;
  handleThumbnailClick: (file: File) => void;
  handleSettingsReset: () => void;
  handleUndo: () => Promise<void>;

  // Standard computed state
  hasFiles: boolean;
  hasResults: boolean;
  settingsCollapsed: boolean;
}

/**
 * Base tool hook for tool components. Manages standard behaviour for tools.
 */
export function useBaseTool<TParams, TParamsHook extends BaseParametersHook<TParams>>(
  toolName: string,
  useParams: () => TParamsHook,
  useOperation: () => ToolOperationHook<TParams>,
  props: BaseToolProps,
  options?: { minFiles?: number }
): BaseToolReturn<TParams, TParamsHook> {
  const minFiles = options?.minFiles ?? 1;
  const { onPreviewFile, onComplete, onError } = props;

  // File selection
  const { selectedFiles } = useFileSelection();
  const previousFileCount = useRef(selectedFiles.length);

  // Tool-specific hooks
  const params = useParams();
  const operation = useOperation();

  // Endpoint validation using parameters hook
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(params.getEndpointName());

  // Reset results when parameters change
  useEffect(() => {
    operation.resetResults();
    onPreviewFile?.(null);
  }, [params.parameters]);

  // Reset results when selected files change
  useEffect(() => {
    if (selectedFiles.length > 0) {
      operation.resetResults();
      onPreviewFile?.(null);
    }
  }, [selectedFiles.length]);

  // Reset parameters when transitioning from 0 files to at least 1 file
  useEffect(() => {
    const currentFileCount = selectedFiles.length;
    const prevFileCount = previousFileCount.current;

    if (prevFileCount === 0 && currentFileCount > 0) {
      params.resetParameters();
    }

    previousFileCount.current = currentFileCount;
  }, [selectedFiles.length]);

  // Standard handlers
  const handleExecute = useCallback(async () => {
    try {
      await operation.executeOperation(params.parameters, selectedFiles);
      if (operation.files && onComplete) {
        onComplete(operation.files);
      }
    } catch (error) {
      if (onError) {
        const message = error instanceof Error ? error.message : `${toolName} operation failed`;
        onError(message);
      }
    }
  }, [operation, params.parameters, selectedFiles, onComplete, onError, toolName]);

  const handleThumbnailClick = useCallback((file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem('previousMode', toolName);
  }, [onPreviewFile, toolName]);

  const handleSettingsReset = useCallback(() => {
    operation.resetResults();
    onPreviewFile?.(null);
  }, [operation, onPreviewFile]);

  const handleUndo = useCallback(async () => {
    await operation.undoOperation();
    onPreviewFile?.(null);
  }, [operation, onPreviewFile]);

  // Standard computed state
  const hasFiles = selectedFiles.length >= minFiles;
  const hasResults = operation.files.length > 0 || operation.downloadUrl !== null;
  const settingsCollapsed = !hasFiles || hasResults;

  return {
    // File management
    selectedFiles,

    // Tool-specific hooks
    params,
    operation,

    // Endpoint validation
    endpointEnabled,
    endpointLoading,

    // Handlers
    handleExecute,
    handleThumbnailClick,
    handleSettingsReset,
    handleUndo,

    // State
    hasFiles,
    hasResults,
    settingsCollapsed
  };
}
