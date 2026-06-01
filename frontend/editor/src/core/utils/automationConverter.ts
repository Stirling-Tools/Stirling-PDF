/**
 * Utility functions for converting between automation formats.
 *
 * Two on-disk formats are supported:
 *
 * 1. **Automate JSON** (native) — mirrors {@link AutomationConfig}; the format
 *    used internally by the Automate tool and persisted in IndexedDB. Operation
 *    names are frontend tool IDs (e.g. "merge", "compress").
 *
 * 2. **Folder Scanning JSON** — the format consumed by the backend
 *    PipelineDirectoryProcessor. Operation names are full backend endpoint
 *    paths (e.g. "/api/v1/general/merge-pdfs").
 */

import { AutomationConfig, AutomationOperation } from "@app/types/automation";
import { ToolRegistry } from "@app/data/toolsTaxonomy";
import { downloadFile } from "@app/services/downloadService";
import { ToolId } from "@app/types/toolId";

/**
 * Pipeline configuration format used by folder scanning.
 *
 * `description` and `icon` are unused by the backend pipeline runner but are
 * preserved so a folder-scan export can round-trip cleanly back into the
 * Automate UI without losing display metadata.
 */
interface FolderScanningPipeline {
  name: string;
  description?: string;
  icon?: string;
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
 * Discriminated result returned by {@link parseAutomationFile}.
 */
export type ParsedAutomationImport =
  | {
      format: "automate";
      automation: Omit<AutomationConfig, "id" | "createdAt" | "updatedAt">;
      unresolvedOperations: string[];
    }
  | {
      format: "folderScanning";
      automation: Omit<AutomationConfig, "id" | "createdAt" | "updatedAt">;
      unresolvedOperations: string[];
    };

/**
 * Sanitize a filename so it works on Windows / macOS / Linux.
 */
const sanitizeFilename = (name: string): string =>
  (name || "automation").replace(/[\\/:*?"<>|]+/g, "_").trim() || "automation";

/**
 * Converts an AutomationConfig to a folder scanning pipeline configuration.
 */
export function convertToFolderScanningConfig(
  automation: AutomationConfig,
  toolRegistry: Partial<ToolRegistry>,
): FolderScanningPipeline {
  return {
    name: automation.name,
    ...(automation.description ? { description: automation.description } : {}),
    ...(automation.icon ? { icon: automation.icon } : {}),
    pipeline: automation.operations.map((op) => {
      const toolId = op.operation as ToolId;
      const toolEntry = toolRegistry[toolId];
      const endpointConfig = toolEntry?.operationConfig?.endpoint;

      let endpoint: string | undefined;

      if (typeof endpointConfig === "string") {
        endpoint = endpointConfig;
      } else if (typeof endpointConfig === "function") {
        try {
          endpoint = endpointConfig(op.parameters);
        } catch (error) {
          console.warn(
            `Failed to resolve dynamic endpoint for operation "${op.operation}". ` +
              `This may happen if the tool requires specific parameters. ` +
              `Error: ${error}`,
          );
        }
      }

      if (!endpoint) {
        console.warn(
          `No endpoint found for operation "${op.operation}". ` +
            `This operation may fail in folder scanning. ` +
            `Using operation type as fallback.`,
        );
      }

      return {
        operation: endpoint || op.operation,
        parameters: {
          ...op.parameters,
          fileInput: "automated",
        },
      };
    }),
    _examples: {
      outputDir: "{outputFolder}/{folderName}",
      outputFileName: "{filename}-{pipelineName}-{date}-{time}",
    },
    outputDir: "{outputFolder}",
    outputFileName: "{filename}",
  };
}

/**
 * Downloads a folder scanning configuration as a JSON file.
 */
export function downloadFolderScanningConfig(
  automation: AutomationConfig,
  toolRegistry: Partial<ToolRegistry>,
): void {
  const config = convertToFolderScanningConfig(automation, toolRegistry);
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  void downloadFile({
    data: blob,
    filename: `${sanitizeFilename(automation.name)}.folder-scan.json`,
  });
}

/**
 * Builds an exportable native Automate JSON object. Strips the IndexedDB
 * primary key and timestamps so an imported copy looks fresh.
 */
export function convertToAutomationConfig(
  automation: AutomationConfig,
): Omit<AutomationConfig, "id" | "createdAt" | "updatedAt"> {
  return {
    name: automation.name,
    description: automation.description,
    icon: automation.icon,
    operations: automation.operations.map((op) => ({
      operation: op.operation,
      parameters: { ...(op.parameters || {}) },
    })),
  };
}

/**
 * Downloads an automation in the native Automate JSON format. The file can be
 * re-imported via {@link parseAutomationFile} to restore the automation on a
 * different machine or browser profile.
 */
export function downloadAutomationConfig(automation: AutomationConfig): void {
  const config = convertToAutomationConfig(automation);
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  void downloadFile({
    data: blob,
    filename: `${sanitizeFilename(automation.name)}.automate.json`,
  });
}

/**
 * Build an inverse map of `endpoint string` → `frontend tool ID` from the
 * tool registry. Only static string endpoints are added — dynamic
 * (function) endpoints are matched at parse time by replaying them.
 */
function buildEndpointToToolIdMap(
  toolRegistry: Partial<ToolRegistry>,
): Map<string, ToolId> {
  const map = new Map<string, ToolId>();
  for (const [toolId, entry] of Object.entries(toolRegistry)) {
    const endpoint = entry?.operationConfig?.endpoint;
    if (typeof endpoint === "string" && !map.has(endpoint)) {
      map.set(endpoint, toolId as ToolId);
    }
  }
  return map;
}

/**
 * Try every dynamic endpoint in the registry with the supplied parameters,
 * returning the first tool ID whose endpoint function produces `targetEndpoint`.
 */
function findDynamicEndpointMatch(
  targetEndpoint: string,
  parameters: Record<string, any>,
  toolRegistry: Partial<ToolRegistry>,
): ToolId | undefined {
  for (const [toolId, entry] of Object.entries(toolRegistry)) {
    const endpoint = entry?.operationConfig?.endpoint;
    if (typeof endpoint === "function") {
      try {
        if (endpoint(parameters) === targetEndpoint) {
          return toolId as ToolId;
        }
      } catch {
        // Endpoint function expected different parameters — ignore.
      }
    }
  }
  return undefined;
}

const isToolIdInRegistry = (
  candidate: string,
  toolRegistry: Partial<ToolRegistry>,
): boolean => Object.prototype.hasOwnProperty.call(toolRegistry, candidate);

/**
 * Parse a folder-scanning pipeline JSON into the native AutomationConfig
 * shape. Endpoint paths are reverse-mapped to frontend tool IDs via the
 * supplied registry; unmappable operations are kept verbatim and reported in
 * `unresolvedOperations`.
 */
export function parseFolderScanningConfig(
  raw: unknown,
  toolRegistry: Partial<ToolRegistry>,
): {
  automation: Omit<AutomationConfig, "id" | "createdAt" | "updatedAt">;
  unresolvedOperations: string[];
} {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid folder scanning config: expected JSON object");
  }
  const obj = raw as Record<string, unknown>;
  const pipeline = obj.pipeline;
  if (!Array.isArray(pipeline)) {
    throw new Error("Invalid folder scanning config: missing 'pipeline' array");
  }

  const endpointMap = buildEndpointToToolIdMap(toolRegistry);
  const unresolved: string[] = [];

  const operations: AutomationOperation[] = pipeline.map(
    (step: unknown, index: number) => {
      if (!step || typeof step !== "object") {
        throw new Error(
          `Invalid folder scanning config: pipeline[${index}] is not an object`,
        );
      }
      const stepObj = step as Record<string, unknown>;
      const rawOperation = stepObj.operation;
      if (typeof rawOperation !== "string" || rawOperation.length === 0) {
        throw new Error(
          `Invalid folder scanning config: pipeline[${index}].operation must be a non-empty string`,
        );
      }
      const rawParameters = (stepObj.parameters as Record<string, any>) || {};
      // Strip the export-time marker so the imported automation runs cleanly.
      const { fileInput: _fileInput, ...parameters } = rawParameters;

      // 1) Direct frontend-tool-id match (handles the converter's fallback when
      //    no endpoint could be resolved at export time).
      if (isToolIdInRegistry(rawOperation, toolRegistry)) {
        return { operation: rawOperation, parameters };
      }

      // 2) Static endpoint string match.
      const staticMatch = endpointMap.get(rawOperation);
      if (staticMatch) {
        return { operation: staticMatch, parameters };
      }

      // 3) Dynamic endpoint match — replay each function endpoint with the
      //    parameters we have and look for a match.
      const dynamicMatch = findDynamicEndpointMatch(
        rawOperation,
        parameters,
        toolRegistry,
      );
      if (dynamicMatch) {
        return { operation: dynamicMatch, parameters };
      }

      unresolved.push(rawOperation);
      return { operation: rawOperation, parameters };
    },
  );

  const name =
    typeof obj.name === "string" && obj.name.length > 0
      ? obj.name
      : "Imported Automation";

  return {
    automation: {
      name,
      description: typeof obj.description === "string" ? obj.description : "",
      icon: typeof obj.icon === "string" ? obj.icon : undefined,
      operations,
    },
    unresolvedOperations: unresolved,
  };
}

/**
 * Parse a native Automate JSON file (a previously-exported AutomationConfig).
 * The id / createdAt / updatedAt fields are dropped — the storage layer
 * regenerates them on save.
 */
export function parseAutomationConfigJson(
  raw: unknown,
  toolRegistry: Partial<ToolRegistry>,
): {
  automation: Omit<AutomationConfig, "id" | "createdAt" | "updatedAt">;
  unresolvedOperations: string[];
} {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid automation config: expected JSON object");
  }
  const obj = raw as Record<string, unknown>;
  const operations = obj.operations;
  if (!Array.isArray(operations)) {
    throw new Error("Invalid automation config: missing 'operations' array");
  }

  const unresolved: string[] = [];
  const parsedOperations: AutomationOperation[] = operations.map(
    (op: unknown, index: number) => {
      if (!op || typeof op !== "object") {
        throw new Error(
          `Invalid automation config: operations[${index}] is not an object`,
        );
      }
      const opObj = op as Record<string, unknown>;
      const operation = opObj.operation;
      if (typeof operation !== "string" || operation.length === 0) {
        throw new Error(
          `Invalid automation config: operations[${index}].operation must be a non-empty string`,
        );
      }
      const parameters = (opObj.parameters as Record<string, any>) || {};
      if (!isToolIdInRegistry(operation, toolRegistry)) {
        unresolved.push(operation);
      }
      return { operation, parameters };
    },
  );

  const name =
    typeof obj.name === "string" && obj.name.length > 0
      ? obj.name
      : "Imported Automation";

  return {
    automation: {
      name,
      description: typeof obj.description === "string" ? obj.description : "",
      icon: typeof obj.icon === "string" ? obj.icon : undefined,
      operations: parsedOperations,
    },
    unresolvedOperations: unresolved,
  };
}

/**
 * Heuristic format detector. Folder-scanning JSON uses a `pipeline` array;
 * native Automate JSON uses an `operations` array. Both is invalid.
 */
export function detectAutomationFormat(
  raw: unknown,
): "automate" | "folderScanning" | "unknown" {
  if (!raw || typeof raw !== "object") return "unknown";
  const obj = raw as Record<string, unknown>;
  const hasPipeline = Array.isArray(obj.pipeline);
  const hasOperations = Array.isArray(obj.operations);
  if (hasPipeline && !hasOperations) return "folderScanning";
  if (hasOperations && !hasPipeline) return "automate";
  return "unknown";
}

/**
 * Parse a JSON file's text content into a normalized AutomationConfig.
 * Auto-detects the format unless `expectedFormat` is supplied; throws with a
 * user-readable message on any structural problem.
 */
export function parseAutomationFile(
  fileText: string,
  toolRegistry: Partial<ToolRegistry>,
  expectedFormat?: "automate" | "folderScanning",
): ParsedAutomationImport {
  let raw: unknown;
  try {
    raw = JSON.parse(fileText);
  } catch (err) {
    throw new Error(`File is not valid JSON: ${(err as Error).message}`, {
      cause: err,
    });
  }

  const detected = detectAutomationFormat(raw);
  const format = expectedFormat ?? detected;

  if (expectedFormat && detected !== "unknown" && detected !== expectedFormat) {
    throw new Error(
      `Expected ${
        expectedFormat === "automate"
          ? "Automate JSON (operations array)"
          : "Folder Scanning JSON (pipeline array)"
      } but file looks like ${
        detected === "automate" ? "Automate JSON" : "Folder Scanning JSON"
      }.`,
    );
  }

  if (format === "automate") {
    const result = parseAutomationConfigJson(raw, toolRegistry);
    return { format: "automate", ...result };
  }
  if (format === "folderScanning") {
    const result = parseFolderScanningConfig(raw, toolRegistry);
    return { format: "folderScanning", ...result };
  }

  throw new Error(
    "Unrecognized JSON shape. Expected an Automate config (operations[]) or a Folder Scanning config (pipeline[]).",
  );
}
