/**
 * Typed wrapper over a tool's `toApiParams`/`fromApiParams` mappers, binding one endpoint to safe
 * frontend<->backend parameter conversion.
 */

import type { ToolApiParams, ToolEndpoint } from "@app/types/toolApiTypes";

export interface ToolOperationDescriptor<E extends ToolEndpoint, TParams> {
  readonly endpoint: E;
  readonly defaultParameters: TParams;
  toApi(params: TParams): ToolApiParams[E];
  /** Backend model -> full frontend params (defaults merged under the mapped values). */
  fromApi(api: ToolApiParams[E]): TParams;
}

/** Structural subset of a tool's config; separate so `E` is inferred from the endpoint argument. */
export interface BidirectionalToolConfig<TParams, E extends ToolEndpoint> {
  defaultParameters?: TParams;
  toApiParams?(params: TParams): ToolApiParams[E];
  fromApiParams?(api: ToolApiParams[E]): Partial<TParams>;
}

/**
 * Pin a config to `endpoint` (passed explicitly, since dynamic-endpoint tools declare `endpoint` as
 * a function). Throws when the mappers or defaults are missing.
 */
export function describeToolOperation<E extends ToolEndpoint, TParams>(
  endpoint: E,
  config: BidirectionalToolConfig<TParams, E>,
): ToolOperationDescriptor<E, TParams> {
  const { toApiParams, fromApiParams, defaultParameters } = config;
  if (!toApiParams || !fromApiParams || defaultParameters === undefined) {
    throw new Error(
      `describeToolOperation: "${endpoint}" is missing mappers or defaults`,
    );
  }
  return {
    endpoint,
    defaultParameters,
    toApi: (params) => toApiParams(params),
    fromApi: (api) => ({ ...defaultParameters, ...fromApiParams(api) }),
  };
}
