import { StirlingFile } from "@app/types/fileContext";
import type { ResponseHandler } from "@app/utils/toolResponseProcessor";
import { ToolId } from "@app/types/toolId";
import type { ProcessingProgress } from "@app/hooks/tools/shared/useToolState";

export type { ProcessingProgress, ResponseHandler };

export enum ToolType {
  singleFile,
  multiFile,
  custom,
}

/**
 * Reason the execute button is disabled. Resolved to a translated tooltip by OperationButton.
 * null means the button is enabled.
 */
export type ExecuteDisabledReason = "endpointUnavailable" | "filesLoading" | "noFiles" | "invalidParams" | "viewerMode" | null;

/**
 * Result from custom processor with optional metadata about input consumption.
 */
export interface CustomProcessorResult {
  /** Processed output files */
  files: File[];
  /**
   * When true, marks all input files as successfully consumed regardless of output count.
   * Use when operation combines N inputs into fewer outputs (e.g., 3 images → 1 PDF).
   * When false/undefined, uses filename-based mapping to determine which inputs succeeded.
   */
  consumedAllInputs?: boolean;
}

/**
 * Configuration for tool operations defining processing behavior and API integration.
 *
 * Supports three patterns:
 * 1. Single-file tools: toolType: singleFile, processes files individually
 * 2. Multi-file tools: toolType: multiFile, single API call with all files
 * 3. Complex tools: toolType: custom, customProcessor handles all processing logic
 */
interface BaseToolOperationConfig<TParams> {
  /** Operation identifier for tracking and logging */
  operationType: ToolId;

  /**
   * Prefix added to processed filenames (e.g., 'compressed_', 'split_').
   * Only generally useful for multiFile interfaces.
   */
  filePrefix?: string;

  /**
   * Whether to preserve the filename provided by the backend in response headers.
   * When true, ignores filePrefix and uses the filename from Content-Disposition header.
   * Useful for tools like auto-rename where the backend determines the final filename.
   */
  preserveBackendFilename?: boolean;

  /** How to handle API responses (e.g., ZIP extraction, single file response) */
  responseHandler?: ResponseHandler;

  /** Extract user-friendly error messages from API errors */
  getErrorMessage?: (error: any) => string;

  /** Default parameter values for automation */
  defaultParameters?: TParams;

  /**
   * For custom tools: if true, success implies all input files were successfully processed.
   * Use this for tools like Automate or Merge where Many-to-One relationships exist
   * and exact input-output mapping is difficult.
   */
  consumesAllInputs?: boolean;
}

export interface SingleFileToolOperationConfig<
  TParams,
> extends BaseToolOperationConfig<TParams> {
  /** This tool processes one file at a time. */
  toolType: ToolType.singleFile;

  /** Builds FormData for API request. */
  buildFormData: (params: TParams, file: File) => FormData;

  /** API endpoint for the operation. Can be static string or function for dynamic routing. */
  endpoint: string | ((params: TParams) => string);

  customProcessor?: undefined;
}

export interface MultiFileToolOperationConfig<
  TParams,
> extends BaseToolOperationConfig<TParams> {
  /** This tool processes multiple files at once. */
  toolType: ToolType.multiFile;

  /** Prefix added to processed filename (e.g., 'merged_', 'split_') */
  filePrefix: string;

  /** Builds FormData for API request. */
  buildFormData: (params: TParams, files: File[]) => FormData;

  /** API endpoint for the operation. Can be static string or function for dynamic routing. */
  endpoint: string | ((params: TParams) => string);

  customProcessor?: undefined;
}

export interface CustomToolOperationConfig<
  TParams,
> extends BaseToolOperationConfig<TParams> {
  /** This tool has custom behaviour. */
  toolType: ToolType.custom;

  buildFormData?: undefined;

  /**
   * Optional endpoint for routing decisions (credit check, cloud detection).
   * Not used for the API call itself — customProcessor handles that directly.
   * Provide a function when the endpoint depends on runtime parameters.
   */
  endpoint?: string | ((params: TParams) => string | undefined);

  /**
   * Custom processing logic that completely bypasses standard file processing.
   * This tool handles all API calls, response processing, and file creation.
   * Use for tools with complex routing logic or non-standard processing requirements.
   *
   * Returns CustomProcessorResult with:
   * - files: Processed output files
   * - consumedAllInputs: true if operation combines N inputs → fewer outputs
   */
  customProcessor: (
    params: TParams,
    files: File[],
  ) => Promise<CustomProcessorResult>;
}

export type ToolOperationConfig<TParams = void> =
  | SingleFileToolOperationConfig<TParams>
  | MultiFileToolOperationConfig<TParams>
  | CustomToolOperationConfig<TParams>;

/**
 * Complete tool operation interface returned by useToolOperation.
 */
export interface ToolOperationHook<TParams = void> {
  // State
  files: File[];
  thumbnails: string[];
  isGeneratingThumbnails: boolean;
  downloadUrl: string | null;
  downloadFilename: string;
  downloadLocalPath?: string | null;
  outputFileIds?: string[] | null;
  isLoading: boolean;
  status: string;
  errorMessage: string | null;
  progress: ProcessingProgress | null;
  willUseCloud?: boolean;

  // Actions
  executeOperation: (
    params: TParams,
    selectedFiles: StirlingFile[],
  ) => Promise<void>;
  resetResults: () => void;
  clearError: () => void;
  cancelOperation: () => void;
  undoOperation: () => Promise<void>;
}
