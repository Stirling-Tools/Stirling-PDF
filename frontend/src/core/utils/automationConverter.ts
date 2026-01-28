/**
 * Utility functions for converting between automation formats
 */

import { AutomationConfig } from '@app/types/automation';
import { ToolRegistry } from '@app/data/toolsTaxonomy';
import { ToolId } from '@app/types/toolId';

/**
 * Pipeline configuration format used by folder scanning
 */
interface FolderScanningPipeline {
  name: string;
  pipeline: Array<{
    operation: string;
    parameters: Record<string, any>;
  }>;
  _examples: {
    outputDir: string;
    outputFileName: string;
  };
  outputDir: string;
  outputFileName: string;
}

/**
 * Converts an AutomationConfig to a folder scanning pipeline configuration
 * @param automation The automation configuration to convert
 * @param toolRegistry The tool registry to map operation types to endpoints
 * @returns Folder scanning pipeline configuration
 */
export function convertToFolderScanningConfig(
  automation: AutomationConfig,
  toolRegistry: Partial<ToolRegistry>
): FolderScanningPipeline {
  return {
    name: automation.name,
    pipeline: automation.operations.map(op => {
      // Map operationType to full API endpoint path
      const toolId = op.operation as ToolId;
      const toolEntry = toolRegistry[toolId];
      const endpointConfig = toolEntry?.operationConfig?.endpoint;

      let endpoint: string | undefined;

      if (typeof endpointConfig === 'string') {
        endpoint = endpointConfig;
      } else if (typeof endpointConfig === 'function') {
        // For dynamic endpoints, call with the saved parameters
        try {
          endpoint = endpointConfig(op.parameters);
        } catch (error) {
          console.warn(
            `Failed to resolve dynamic endpoint for operation "${op.operation}". ` +
            `This may happen if the tool requires specific parameters. ` +
            `Error: ${error}`
          );
        }
      }

      if (!endpoint) {
        console.warn(
          `No endpoint found for operation "${op.operation}". ` +
          `This operation may fail in folder scanning. ` +
          `Using operation type as fallback.`
        );
      }

      return {
        operation: endpoint || op.operation,
        parameters: {
          ...op.parameters,
          fileInput: "automated"
        }
      };
    }),
    _examples: {
      outputDir: "{outputFolder}/{folderName}",
      outputFileName: "{filename}-{pipelineName}-{date}-{time}"
    },
    outputDir: "{outputFolder}",
    outputFileName: "{filename}"
  };
}

/**
 * Downloads a folder scanning configuration as a JSON file
 * @param automation The automation configuration to export
 * @param toolRegistry The tool registry to map operation types to endpoints
 */
export function downloadFolderScanningConfig(
  automation: AutomationConfig,
  toolRegistry: Partial<ToolRegistry>
): void {
  const config = convertToFolderScanningConfig(automation, toolRegistry);
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${automation.name}.json`;
  a.style.display = 'none';

  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  URL.revokeObjectURL(url);
}
