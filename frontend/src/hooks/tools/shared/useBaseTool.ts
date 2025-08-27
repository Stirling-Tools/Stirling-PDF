import { useEffect, useMemo } from 'react';
import { useFileSelection } from '../../../contexts/FileContext';
import { useEndpointEnabled } from '../../useEndpointConfig';
import { BaseToolProps } from '../../../types/tool';
import { ToolOperationHook } from './useToolOperation';
import { BaseParametersHook } from './useBaseParameters';

interface BaseToolReturn<TParams> {
  // File management (used internally)
  selectedFiles: File[];

  // Tool-specific hooks (passed through for convenience)
  params: BaseParametersHook<TParams>;
  operation: ToolOperationHook<TParams>;

  // Endpoint validation
  endpointEnabled: boolean | null;
  endpointLoading: boolean;

  // Standard handlers
  handleExecute: () => Promise<void>;
  handleThumbnailClick: (file: File) => void;
  handleSettingsReset: () => void;

  // Standard computed state
  hasFiles: boolean;
  hasResults: boolean;
  settingsCollapsed: boolean;
}

/**
 * Base tool hook for tool components.
 *
 * Manages standard behaviour for tools:
 * - File selection
 * - Standard handlers (execute, thumbnail click, settings reset)
 * - Standard computed state (hasFiles, hasResults, settingsCollapsed)
 *
 * Tools should use the behaviour from this hook to build their UI and
 * have it behave like other tools.
 */
export function useBaseTool<TParams>(
  toolName: string,
  useParams: () => BaseParametersHook<TParams>,
  useOperation: () => ToolOperationHook<TParams>,
  props: BaseToolProps,
): BaseToolReturn<TParams> {
  const { onPreviewFile, onComplete, onError } = props;

  // File selection (used internally in handleExecute)
  const { selectedFiles } = useFileSelection();

  // Tool-specific hooks (passed through)
  const params = useParams();
  const operation = useOperation();

  // Endpoint validation using parameters hook
  const { enabled: endpointEnabled, loading: endpointLoading } = useEndpointEnabled(params.getEndpointName());

  // Reset results when parameters change
  useEffect(() => {
    operation.resetResults();
    onPreviewFile?.(null);
  }, [params.parameters, operation, onPreviewFile]);

  // Reset results when selected files change
  useEffect(() => {
    if (selectedFiles.length > 0) {
      operation.resetResults();
      onPreviewFile?.(null);
    }
  }, [selectedFiles, operation, onPreviewFile]);

  // Standard handlers
  const handleExecute = async () => {
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
  };

  const handleThumbnailClick = (file: File) => {
    onPreviewFile?.(file);
    sessionStorage.setItem('previousMode', toolName);
  };

  const handleSettingsReset = () => {
    operation.resetResults();
    onPreviewFile?.(null);
  };

  // Standard computed state
  const hasFiles = selectedFiles.length > 0;
  const hasResults = operation.files.length > 0 || operation.downloadUrl !== null;
  const settingsCollapsed = !hasFiles || hasResults;

  return useMemo(() => ({
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

    // State
    hasFiles,
    hasResults,
    settingsCollapsed
  }), [
    selectedFiles,
    params,
    operation,
    endpointEnabled,
    endpointLoading,
    handleExecute,
    handleThumbnailClick,
    handleSettingsReset,
    hasFiles,
    hasResults,
    settingsCollapsed
  ]);
}
