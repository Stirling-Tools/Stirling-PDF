/**
 * Registry-level automation logic: which tools can be run as a backend operation step, how much
 * of their parameters can be edited in a UI, and conversion between a tool's frontend parameter
 * shape and the backend step contract (endpoint + backend parameters).
 *
 * This is core behaviour shared by every surface that composes or replays tool operations against
 * the backend engine (portal pipelines today; backend-executed automations and AI plans later),
 * so the "is this tool usable, and how" decision lives with the tools rather than in any one
 * feature. It builds on each tool's `operationConfig` mappers (`toApiParams` / `fromApiParams`),
 * keeping the frontend<->backend parameter mapping single-sourced in the tools.
 */

import { type ReactNode } from "react";
import {
  getToolSupportsAutomate,
  type SubcategoryId,
  type ToolRegistry,
  type ToolRegistryEntry,
} from "@app/data/toolsTaxonomy";
import { type ToolId } from "@app/types/toolId";
import {
  isToolEndpoint,
  type ToolEndpoint,
} from "@app/hooks/tools/shared/toolApiMapping";
import {
  type ErasedToolParams,
  type RegistryToolOperationConfig,
} from "@app/hooks/tools/shared/toolOperationTypes";

/**
 * How much of a tool's parameters a UI can edit when composing a backend step:
 * - `editable`: has both mappers and a settings UI -> render the settings UI.
 * - `noSettings`: migrated to the mapper seam but has no parameters to configure.
 * - `unsupported`: not migrated to the mapper seam -> parameters can't be mapped for editing yet;
 *   the step runs with the backend's defaults.
 */
export type ToolStepSupport = "editable" | "noSettings" | "unsupported";

/** A tool that can be added to a backend operation chain, with its editing support. */
export interface ExecutableTool {
  toolId: ToolId;
  name: string;
  icon: ReactNode;
  /** Subcategory the tool belongs to, so a picker can group tools without re-reading the registry. */
  subcategoryId: SubcategoryId;
  /** Endpoint resolved from default parameters, for display/inclusion. The stored step's endpoint is re-resolved from the configured parameters at serialization time. */
  endpoint: ToolEndpoint;
  support: ToolStepSupport;
}

/**
 * The backend step contract: an endpoint path plus its backend-shaped parameters. `operation` is a
 * plain string, not a {@link ToolEndpoint}, because this is the raw backend boundary (it mirrors
 * the stored policy step) and a pipeline may reference endpoints the frontend does not model.
 */
export interface ToolApiStep {
  operation: string;
  parameters: Record<string, unknown>;
}

/** A step being edited in a UI that maps to a known tool: parameters are in the tool's frontend shape. */
export interface KnownToolStep {
  toolId: ToolId;
  operation: ToolEndpoint;
  params: ErasedToolParams;
  support: ToolStepSupport;
}

/** A stored step whose endpoint maps to no known tool: preserved verbatim, not editable. */
export interface UnknownToolStep {
  toolId: null;
  operation: string;
  params: ErasedToolParams;
  support: "unknown";
}

/** A step being edited in a UI, discriminated by whether its endpoint maps to a known tool. */
export type WorkingToolStep = KnownToolStep | UnknownToolStep;

/**
 * Resolve a tool's endpoint from parameters. Static endpoints ignore params; dynamic ones may
 * return undefined if the params don't determine one. The result is validated against the generated
 * endpoint set (via {@link isToolEndpoint}) rather than cast, so a config endpoint that is not a
 * known {@link ToolEndpoint} (e.g. a custom tool's arbitrary string) resolves to undefined.
 */
function resolveEndpoint(
  config: RegistryToolOperationConfig | undefined,
  params: ErasedToolParams,
): ToolEndpoint | undefined {
  const endpoint = config?.endpoint;
  if (typeof endpoint === "string") {
    return isToolEndpoint(endpoint) ? endpoint : undefined;
  }
  if (typeof endpoint === "function") {
    const resolved = safeCall(endpoint, params);
    return typeof resolved === "string" && isToolEndpoint(resolved)
      ? resolved
      : undefined;
  }
  return undefined;
}

/** Invoke a dynamic-endpoint function defensively; a throw means the params don't determine one. */
function safeCall(
  fn: (params: ErasedToolParams) => string | null | undefined,
  params: ErasedToolParams,
): string | null | undefined {
  try {
    return fn(params);
  } catch {
    return undefined;
  }
}

/** Classify how much of a tool's parameters a UI can edit when composing a step. */
export function classifyToolStepSupport(
  entry: ToolRegistryEntry,
): ToolStepSupport {
  const config = entry.operationConfig;
  const hasMappers = Boolean(config?.toApiParams && config?.fromApiParams);
  if (!hasMappers) return "unsupported";
  return entry.automationSettings ? "editable" : "noSettings";
}

function isFileValue(value: unknown): boolean {
  if (typeof File === "undefined") return false;
  if (value instanceof File) return true;
  return Array.isArray(value) && value.some((item) => item instanceof File);
}

/**
 * True if any of a step's parameters is an uploaded file (or list of files). Such a step cannot be
 * saved into a stored pipeline yet: the file bytes are not persisted with the policy, so a later
 * (e.g. scheduled) run would have nothing to send for that named file field.
 */
export function stepRequiresUpload(step: WorkingToolStep): boolean {
  return Object.values(step.params).some(isFileValue);
}

/**
 * The tools that can be run as a backend operation step, sorted by name. Includes only automatable
 * tools whose endpoint resolves from defaults (so they can become a backend step); this drops
 * tools with no operationConfig and tools whose endpoint needs runtime input (e.g. convert).
 */
export function getExecutableTools(
  registry: Partial<ToolRegistry>,
): ExecutableTool[] {
  const tools: ExecutableTool[] = [];
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
      subcategoryId: entry.subcategoryId,
      endpoint,
      support: classifyToolStepSupport(entry),
    });
  }
  return tools.sort((a, b) => a.name.localeCompare(b.name));
}

/** A fresh working step for a tool just added to a chain, seeded with its default parameters. */
export function newWorkingToolStep(
  tool: ExecutableTool,
  registry: Partial<ToolRegistry>,
): KnownToolStep {
  const config = registry[tool.toolId]?.operationConfig;
  return {
    toolId: tool.toolId,
    operation: tool.endpoint,
    params: { ...(config?.defaultParameters ?? {}) },
    support: tool.support,
  };
}

/** Serialize a working step into the backend step contract (endpoint + backend parameters). */
export function serializeToolStep(
  step: WorkingToolStep,
  registry: Partial<ToolRegistry>,
): ToolApiStep {
  const config =
    step.toolId !== null ? registry[step.toolId]?.operationConfig : undefined;
  if (!config) {
    // Unmapped step (unknown endpoint on edit): round-trip it unchanged.
    return { operation: step.operation, parameters: step.params };
  }
  const merged = { ...(config.defaultParameters ?? {}), ...step.params };
  const operation = resolveEndpoint(config, merged) ?? step.operation;
  const parameters = config.toApiParams
    ? (config.toApiParams(merged) as Record<string, unknown>)
    : {};
  return { operation, parameters };
}

/** Find the registry tool whose endpoint matches a stored step's endpoint (static match, then dynamic replay). */
function findToolByEndpoint(
  step: ToolApiStep,
  registry: Partial<ToolRegistry>,
): [ToolId, ToolRegistryEntry] | undefined {
  let dynamic: [ToolId, ToolRegistryEntry] | undefined;
  for (const [id, entry] of Object.entries(registry)) {
    const endpoint = entry?.operationConfig?.endpoint;
    if (typeof endpoint === "string") {
      if (endpoint === step.operation) return [id as ToolId, entry];
    } else if (typeof endpoint === "function" && !dynamic) {
      if (safeCall(endpoint, step.parameters) === step.operation) {
        dynamic = [id as ToolId, entry];
      }
    }
  }
  return dynamic;
}

/** A stored step kept verbatim because its endpoint maps to no known tool. */
function unmappedStep(step: ToolApiStep): UnknownToolStep {
  return {
    toolId: null,
    operation: step.operation,
    params: { ...step.parameters },
    support: "unknown",
  };
}

/**
 * Rehydrate a stored backend step into a working step for editing: map the endpoint back to a tool
 * and its backend parameters back to the frontend shape via `fromApiParams`. Steps whose endpoint
 * maps to no known tool are kept as an unmapped, non-editable working step (parameters preserved).
 */
export function deserializeToolStep(
  step: ToolApiStep,
  registry: Partial<ToolRegistry>,
): WorkingToolStep {
  const match = findToolByEndpoint(step, registry);
  if (!match) return unmappedStep(step);
  const [toolId, entry] = match;
  const config = entry.operationConfig;
  const params: ErasedToolParams = config?.fromApiParams
    ? {
        ...(config.defaultParameters ?? {}),
        ...config.fromApiParams(step.parameters as never),
      }
    : { ...(config?.defaultParameters ?? {}) };
  // Validate against the generated endpoint set instead of casting the matched string.
  const operation =
    resolveEndpoint(config, params) ??
    (isToolEndpoint(step.operation) ? step.operation : undefined);
  if (operation === undefined) return unmappedStep(step);
  return { toolId, operation, params, support: classifyToolStepSupport(entry) };
}
