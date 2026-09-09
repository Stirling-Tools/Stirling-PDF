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

/**
 * Structural subset of a tool's config. `CE` is the config's declared endpoint type, inferred from
 * the `endpoint` field: the literal for static tools, or the whole `ToolEndpoint` union for
 * dynamic-endpoint tools (whose endpoint is a function typed against the union).
 */
export interface BidirectionalToolConfig<TParams, CE extends ToolEndpoint> {
  endpoint: CE | null | ((params: TParams) => CE | null);
  defaultParameters?: TParams;
  toApiParams?(params: TParams): ToolApiParams[CE];
  fromApiParams?(api: ToolApiParams[CE]): Partial<TParams>;
}

/**
 * Pin a config to `endpoint` (passed explicitly, since dynamic-endpoint tools declare `endpoint` as
 * a function). `E extends CE` rejects pairing a static tool's config with the wrong endpoint, while
 * allowing a dynamic tool whose `CE` is the full union. Throws when mappers or defaults are missing.
 */
export function describeToolOperation<
  E extends CE,
  CE extends ToolEndpoint,
  TParams,
>(
  endpoint: E,
  config: BidirectionalToolConfig<TParams, CE>,
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
    // A dynamic tool's mapper is typed against the union; narrow to this endpoint (sound - the
    // runtime mapper produces this endpoint's model).
    toApi: (params) => toApiParams(params) as ToolApiParams[E],
    fromApi: (api) =>
      ({
        ...defaultParameters,
        ...fromApiParams(api as ToolApiParams[CE]),
      }) as TParams,
  };
}
