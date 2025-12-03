import { useEffect, useCallback, useRef } from 'react';
import { useFileSelection } from '@app/contexts/FileContext';
import { useEndpointEnabled } from '@app/hooks/useEndpointConfig';
import { BaseToolProps } from '@app/types/tool';
import { ToolOperationHook } from '@app/hooks/tools/shared/useToolOperation';
import { BaseParametersHook } from '@app/hooks/tools/shared/useBaseParameters';
import { StirlingFile } from '@app/types/fileContext';

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

  // Prevent reset immediately after operation completes (when consumeFiles auto-selects outputs)
  const skipNextSelectionResetRef = useRef(false);
  const previousSelectionRef = useRef<string>('');

  // Tool-specific hooks
  const params = useParams();
  const operation = useOperation();

  // Endpoint validation using parameters hook
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(params.getEndpointName());

  // Standard computed state - defined early so it's available in useEffects
  const hasFiles = selectedFiles.length >= minFiles;
  const hasResults = operation.files.length > 0 || operation.downloadUrl !== null;
  const settingsCollapsed = !hasFiles || hasResults;

  // Reset results when parameters change
  useEffect(() => {
    operation.resetResults();
    onPreviewFile?.(null);
  }, [params.parameters]);

  // When operation completes, flag the next selection change to skip reset
  // (consumeFiles auto-selects outputs immediately after processing)
  useEffect(() => {
    if (hasResults) {
      skipNextSelectionResetRef.current = true;
    }
  }, [hasResults]);

  // Reset results when user manually changes file selection
  useEffect(() => {
    if (selectedFiles.length === 0) return;

    const currentSelection = selectedFiles.map(f => f.fileId).sort().join(',');

    if (currentSelection === previousSelectionRef.current) return; // No change

    // Skip reset if this is the auto-selection after operation completed
    if (skipNextSelectionResetRef.current) {
      skipNextSelectionResetRef.current = false;
      previousSelectionRef.current = currentSelection;
      return;
    }

    // User manually selected different files - reset results
    previousSelectionRef.current = currentSelection;
    operation.resetResults();
    onPreviewFile?.(null);
  }, [selectedFiles]);

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
    skipNextSelectionResetRef.current = false;
    operation.resetResults();
    onPreviewFile?.(null);
  }, [operation, onPreviewFile]);

  const handleUndo = useCallback(async () => {
    await operation.undoOperation();
    onPreviewFile?.(null);
  }, [operation, onPreviewFile]);

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
