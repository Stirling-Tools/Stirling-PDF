import { ToolRegistry } from '@app/data/toolsTaxonomy';
import { ApiOperationId } from '@app/generated/openapi';
import { BackendToolMapping, ToolOperationConfig } from '@app/hooks/tools/shared/toolOperationTypes';
import { ToolId } from '@app/types/toolId';

export interface BackendMappedToolOperation<
  TParams = unknown,
  TOperationId extends ApiOperationId = ApiOperationId,
> {
  toolId: ToolId;
  operationConfig: ToolOperationConfig<TParams>;
  backendMapping: BackendToolMapping<TParams, TOperationId>;
}

export function getBackendMappedToolOperation(
  toolRegistry: Partial<ToolRegistry>,
  operationId: ApiOperationId
): BackendMappedToolOperation | null {
  for (const [toolId, entry] of Object.entries(toolRegistry)) {
    const operationConfig = entry?.operationConfig;
    const backendMapping = operationConfig?.backendMapping;

    if (operationConfig && backendMapping?.operationId === operationId) {
      return {
        toolId: toolId as ToolId,
        operationConfig,
        backendMapping,
      };
    }
  }

  return null;
}

export function isBackendOperationSupported(
  toolRegistry: Partial<ToolRegistry>,
  operationId: ApiOperationId
): boolean {
  return getBackendMappedToolOperation(toolRegistry, operationId) !== null;
}
