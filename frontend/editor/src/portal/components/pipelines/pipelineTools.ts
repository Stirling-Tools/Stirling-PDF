/**
 * Bridges the editor's tool registry to the portal pipelines composer.
 *
 * The composer edits tool steps in the frontend parameter shape (the same shape the tools' own
 * settings UIs use) and serializes them to the backend `PipelineStep` contract on save, using the
 * per-tool mappers that live on `operationConfig` (`toApiParams` / `fromApiParams`). This keeps the
 * frontend<->backend parameter mapping in one place (the tools) rather than duplicating it here.
 *
 * A tool is offered in the composer only if it is automatable AND can be turned into a backend
 * step (its endpoint resolves without runtime input). Tools that are automatable but not yet
 * migrated to the mapper seam are still offered, but their parameters cannot be edited in the UI
 * (see {@link PipelineToolSupport}); the step runs with the backend's defaults.
 */

import { type ReactNode } from "react";
import {
  getToolSupportsAutomate,
  type ToolRegistry,
  type ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";
import { type ToolId } from "@app/types/toolId";
import {
  type ErasedToolParams,
  type RegistryToolOperationConfig,
} from "@app/hooks/tools/shared/toolOperationTypes";
import { type PipelineStep } from "@portal/api/pipelines";

/**
 * How much of a tool's parameters the composer can edit:
 * - `editable`: has both mappers and a settings UI -> render the settings UI.
 * - `noSettings`: migrated but has no parameters to configure -> nothing to edit.
 * - `unsupported`: not migrated to the mapper seam -> parameters can't be shown for editing yet;
 *   the step runs with the backend's defaults.
 */
export type PipelineToolSupport = "editable" | "noSettings" | "unsupported";

/** A tool the composer can add to a pipeline. */
export interface PipelineTool {
  toolId: ToolId;
  name: string;
  icon: ReactNode;
  /** Endpoint resolved from default parameters, for display/inclusion. The stored step's endpoint is re-resolved from the configured parameters at save time. */
  endpoint: string;
  support: PipelineToolSupport;
}

/** A step being edited in the composer, in frontend parameter shape. */
export interface WorkingStep {
  /** The tool this step runs, or null if the stored endpoint didn't map to a known tool. */
  toolId: ToolId | null;
  /** Original backend endpoint path; kept for unmapped steps so they round-trip untouched. */
  operation: string;
  /** Frontend-shaped parameters (empty for unsupported/unmapped steps). */
  params: ErasedToolParams;
  support: PipelineToolSupport | "unknown";
}

/** Resolve a tool's endpoint from parameters. Static endpoints ignore params; dynamic ones may return undefined if the params don't determine one. */
function resolveEndpoint(
  config: RegistryToolOperationConfig | undefined,
  params: ErasedToolParams,
): string | undefined {
  const endpoint = config?.endpoint;
  if (typeof endpoint === "string") return endpoint;
  if (typeof endpoint === "function") {
    try {
      const resolved = endpoint(params);
      return typeof resolved === "string" ? resolved : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function classify(entry: ToolRegistryEntry): PipelineToolSupport {
  const config = entry.operationConfig;
  const hasMappers = Boolean(config?.toApiParams && config?.fromApiParams);
  if (!hasMappers) return "unsupported";
  return entry.automationSettings ? "editable" : "noSettings";
}

/**
 * The tools the composer can offer, sorted by name. Includes only automatable tools whose
 * endpoint resolves from defaults (so they can become a backend step); this drops tools with no
 * operationConfig and tools whose endpoint needs runtime input (e.g. convert).
 */
export function getPipelineTools(
  registry: Partial<ToolRegistry>,
): PipelineTool[] {
  const tools: PipelineTool[] = [];
  for (const [id, entry] of Object.entries(registry)) {
    if (!entry || !getToolSupportsAutomate(entry)) continue;
    const config = entry.operationConfig;
    if (!config) continue;
    const endpoint = resolveEndpoint(config, config.defaultParameters ?? {});
    if (!endpoint) continue;
    tools.push({
      toolId: id as ToolId,
      name: entry.name,
      icon: entry.icon,
      endpoint,
      support: classify(entry),
    });
  }
  return tools.sort((a, b) => a.name.localeCompare(b.name));
}

/** A fresh working step for a tool just added to the pipeline, seeded with its default parameters. */
export function newWorkingStep(
  toolId: ToolId,
  registry: Partial<ToolRegistry>,
): WorkingStep {
  const entry = registry[toolId];
  const config = entry?.operationConfig;
  const params: ErasedToolParams = { ...(config?.defaultParameters ?? {}) };
  return {
    toolId,
    operation: resolveEndpoint(config, params) ?? "",
    params,
    support: entry ? classify(entry) : "unsupported",
  };
}

/** Serialize a working step into the backend `PipelineStep` contract (endpoint + backend parameters). */
export function serializeStep(
  step: WorkingStep,
  registry: Partial<ToolRegistry>,
): PipelineStep {
  const entry = step.toolId ? registry[step.toolId] : undefined;
  const config = entry?.operationConfig;
  if (!config) {
    // Unmapped step (unknown endpoint on edit): round-trip it unchanged.
    return { operation: step.operation, parameters: step.params };
  }
  const merged = { ...(config.defaultParameters ?? {}), ...step.params };
  const operation =
    resolveEndpoint(config, merged) ??
    resolveEndpoint(config, config.defaultParameters ?? {}) ??
    step.operation;
  const parameters = config.toApiParams
    ? (config.toApiParams(merged) as Record<string, unknown>)
    : {};
  return { operation, parameters };
}

/** Find the registry tool whose endpoint matches a stored step's endpoint (static match, then dynamic replay). */
function findToolByEndpoint(
  step: PipelineStep,
  registry: Partial<ToolRegistry>,
): [ToolId, ToolRegistryEntry] | undefined {
  let dynamic: [ToolId, ToolRegistryEntry] | undefined;
  for (const [id, entry] of Object.entries(registry)) {
    const endpoint = entry?.operationConfig?.endpoint;
    if (typeof endpoint === "string") {
      if (endpoint === step.operation) return [id as ToolId, entry];
    } else if (typeof endpoint === "function" && !dynamic) {
      try {
        if (endpoint(step.parameters) === step.operation) {
          dynamic = [id as ToolId, entry];
        }
      } catch {
        // Endpoint function needed different params; ignore.
      }
    }
  }
  return dynamic;
}

/**
 * Rehydrate a stored `PipelineStep` into a working step for editing: map the endpoint back to a
 * tool and its backend parameters back to the frontend shape via `fromApiParams`. Steps whose
 * endpoint maps to no known tool are kept as an unmapped, non-editable working step.
 */
export function deserializeStep(
  step: PipelineStep,
  registry: Partial<ToolRegistry>,
): WorkingStep {
  const match = findToolByEndpoint(step, registry);
  if (!match) {
    // Unknown endpoint: keep the original backend parameters so the step round-trips untouched.
    return {
      toolId: null,
      operation: step.operation,
      params: { ...step.parameters },
      support: "unknown",
    };
  }
  const [toolId, entry] = match;
  const config = entry.operationConfig;
  const support = classify(entry);
  const params: ErasedToolParams = config?.fromApiParams
    ? {
        ...(config.defaultParameters ?? {}),
        ...config.fromApiParams(step.parameters as never),
      }
    : { ...(config?.defaultParameters ?? {}) };
  return { toolId, operation: step.operation, params, support };
}
