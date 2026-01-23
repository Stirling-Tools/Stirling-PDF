/**
 * Utility functions for converting between automation formats
 */

import { AutomationConfig } from '@app/types/automation';

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
 * @returns Folder scanning pipeline configuration
 */
export function convertToFolderScanningConfig(automation: AutomationConfig): FolderScanningPipeline {
  return {
    name: automation.name,
    pipeline: automation.operations.map(op => ({
      operation: op.operation,
      parameters: {
        ...op.parameters,
        fileInput: "automated"
      }
    })),
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
 */
export function downloadFolderScanningConfig(automation: AutomationConfig): void {
  const config = convertToFolderScanningConfig(automation);
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
