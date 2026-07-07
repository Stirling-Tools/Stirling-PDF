import { lazy, type ComponentType } from "react";
import { StirlingFile } from "@app/types/fileContext";
import type { ResponseHandler } from "@app/utils/toolResponseProcessor";
import { ToolId } from "@app/types/toolId";
import type { ProcessingProgress } from "@app/hooks/tools/shared/useToolState";
import type { ToolApiParams, ToolEndpoint } from "@app/types/toolApiTypes";

export type { ProcessingProgress, ResponseHandler };

/**
 * A tool operation's backend endpoint, checked against the generated ToolEndpoint
 * set, or `null` when the operation has no backend endpoint.
 */
export type ToolOperationEndpoint = ToolEndpoint | null;

export enum ToolType {
  singleFile,
  multiFile,
  custom,
}

/**
 * Reason the execute button is disabled. Resolved to a translated tooltip by OperationButton.
 * null means the button is enabled.
 */
export type ExecuteDisabledReason =
  | "endpointUnavailable"
  | "filesLoading"
  | "noFiles"
  | "invalidParams"
  | "viewerMode"
  | null;

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
interface BaseToolOperationConfig<TParams, TEndpoint extends ToolEndpoint> {
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
   * Typed frontend params -> backend request model. When a tool provides this,
   * it is the spec-checked source of truth for the request body and its
   * buildFormData is derived from it via objectToFormData. Bound to the tool's
   * endpoint, so a spec rename of that endpoint's model breaks the build here.
   */
  toApiParams?(params: TParams): ToolApiParams[TEndpoint];

  /**
   * Backend request model -> partial frontend params, so a stored API call
   * can be re-hydrated into this tool's settings UI.
   */
  fromApiParams?(apiParams: ToolApiParams[TEndpoint]): Partial<TParams>;

  /**
   * For custom tools: if true, success implies all input files were successfully processed.
   * Use this for tools like Automate or Merge where Many-to-One relationships exist
   * and exact input-output mapping is difficult.
   */
  consumesAllInputs?: boolean;
}

export interface SingleFileToolOperationConfig<
  TParams,
  TEndpoint extends ToolEndpoint = ToolEndpoint,
> extends BaseToolOperationConfig<TParams, TEndpoint> {
  /** This tool processes one file at a time. */
  toolType: ToolType.singleFile;

  /** Builds FormData for API request. */
  buildFormData: (params: TParams, file: File) => FormData;

  /**
   * API endpoint for the operation, or a function for dynamic routing. `null`
   * when the operation has no backend endpoint (see {@link ToolOperationEndpoint}).
   */
  endpoint: TEndpoint | null | ((params: TParams) => TEndpoint | null);

  customProcessor?: undefined;
}

export interface MultiFileToolOperationConfig<
  TParams,
  TEndpoint extends ToolEndpoint = ToolEndpoint,
> extends BaseToolOperationConfig<TParams, TEndpoint> {
  /** This tool processes multiple files at once. */
  toolType: ToolType.multiFile;

  /** Prefix added to processed filename (e.g., 'merged_', 'split_') */
  filePrefix: string;

  /** Builds FormData for API request. */
  buildFormData: (params: TParams, files: File[]) => FormData;

  /**
   * API endpoint for the operation, or a function for dynamic routing. `null`
   * when the operation has no backend endpoint (see {@link ToolOperationEndpoint}).
   */
  endpoint: TEndpoint | null | ((params: TParams) => TEndpoint | null);

  customProcessor?: undefined;
}

export interface CustomToolOperationConfig<
  TParams,
> extends BaseToolOperationConfig<TParams, ToolEndpoint> {
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

export type ToolOperationConfig<
  TParams = void,
  TEndpoint extends ToolEndpoint = ToolEndpoint,
> =
  | SingleFileToolOperationConfig<TParams, TEndpoint>
  | MultiFileToolOperationConfig<TParams, TEndpoint>
  | CustomToolOperationConfig<TParams>;

/**
 * Define a single-file tool's operation config. Infers the endpoint literal from
 * `endpoint` and binds toApiParams/fromApiParams to that endpoint's request
 * model, so a mapper cannot silently drift from the generated spec.
 */
export function defineSingleFileTool<
  TParams,
  const TEndpoint extends ToolEndpoint,
>(
  config: Omit<SingleFileToolOperationConfig<TParams, TEndpoint>, "toolType">,
): SingleFileToolOperationConfig<TParams, TEndpoint> {
  return { ...config, toolType: ToolType.singleFile };
}

/** Multi-file counterpart of {@link defineSingleFileTool}. */
export function defineMultiFileTool<
  TParams,
  const TEndpoint extends ToolEndpoint,
>(
  config: Omit<MultiFileToolOperationConfig<TParams, TEndpoint>, "toolType">,
): MultiFileToolOperationConfig<TParams, TEndpoint> {
  return { ...config, toolType: ToolType.multiFile };
}

/**
 * One generic source-of-truth for the props every automation settings component
 * accepts: the tool's parameters plus a typed change handler.
 */
export interface ToolAutomationSettingsProps<TParams> {
  parameters: TParams;
  onParameterChange: <K extends keyof TParams>(
    key: K,
    value: TParams[K],
  ) => void;
  disabled?: boolean;
}

/**
 * Erased parameter shape stored in the registry. Spreadable and callable, so
 * consumers can merge defaults and invoke buildFormData/customProcessor/endpoint
 * without per-tool type knowledge.
 */
export type ErasedToolParams = Record<string, unknown>;

export type RegistryToolOperationConfig = ToolOperationConfig<ErasedToolParams>;
export type RegistryAutomationSettings = ComponentType<
  ToolAutomationSettingsProps<ErasedToolParams>
> | null;

/**
 * Store a tool's typed operationConfig in the registry. The input is validated as
 * a real ToolOperationConfig<TParams>, then TParams is erased here. TParams is
 * invariant in ToolOperationConfig, so the erasure cannot be a plain assignment;
 * the `as unknown as` is the localized existential boundary.
 */
export function asRegistryConfig<TParams>(
  config: ToolOperationConfig<TParams>,
): RegistryToolOperationConfig {
  return config as unknown as RegistryToolOperationConfig;
}

/**
 * Lazily load a tool's automation settings component for the registry. The loaded
 * component is validated against ToolAutomationSettingsProps<TParams> (inferred
 * from the module), then erased to the registry's shared props shape.
 */
export function lazySettings<TParams>(
  loader: () => Promise<{
    default: ComponentType<ToolAutomationSettingsProps<TParams>>;
  }>,
): RegistryAutomationSettings {
  return lazy(loader) as unknown as RegistryAutomationSettings;
}

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
