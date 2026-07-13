/**
 * A tool operation described as a typed, self-contained unit: its endpoint plus the two mappers
 * that convert between the tool's frontend parameter shape and the backend request model for that
 * endpoint. This is the single seam through which callers convert safely between the two parameter
 * models without ever touching `Record<string, unknown>` themselves.
 *
 * It is a thin, typed wrapper over the bidirectional mappers already declared on every tool's
 * `operationConfig` (`toApiParams` / `fromApiParams`), keeping the frontend<->backend mapping
 * single-sourced in the tools while binding it to the generated per-endpoint request model
 * ({@link ToolApiParams}).
 */

import type { ToolApiParams, ToolEndpoint } from "@app/types/toolApiTypes";

/** A tool operation with a known endpoint and type-safe conversion in both directions. */
export interface ToolOperationDescriptor<E extends ToolEndpoint, TParams> {
  /** The endpoint this operation calls — always known, as a literal. */
  readonly endpoint: E;
  /** Complete default frontend parameters for the operation. */
  readonly defaultParameters: TParams;
  /** Frontend params -> the backend request model for {@link endpoint}. */
  toApi(params: TParams): ToolApiParams[E];
  /** Backend request model -> complete frontend params (defaults merged under the mapped values). */
  fromApi(api: ToolApiParams[E]): TParams;
}

/**
 * The subset of a tool's `operationConfig` this descriptor needs: the bidirectional mappers bound
 * to endpoint {@link E}, plus defaults. Structural (not the full config type) so `E` is inferred
 * from the `endpoint` argument and mismatched endpoint/config pairings are a compile error — a
 * config whose mappers target a different endpoint won't satisfy `ToolApiParams[E]`.
 */
export interface BidirectionalToolConfig<TParams, E extends ToolEndpoint> {
  defaultParameters?: TParams;
  toApiParams?(params: TParams): ToolApiParams[E];
  fromApiParams?(api: ToolApiParams[E]): Partial<TParams>;
}

/**
 * Build a {@link ToolOperationDescriptor} from a tool's operation config, pinned to `endpoint`.
 * The endpoint is passed explicitly (not read from `config.endpoint`) because dynamic-endpoint
 * tools declare `endpoint` as a function; passing the literal also binds `E` so the config's
 * mappers are checked against that endpoint's request model.
 *
 * Throws if the config lacks defaults or either mapper — a policy/pipeline tool must be able to
 * round-trip its parameters, so a missing mapper is a wiring error, not a runtime-recoverable state.
 */
export function describeToolOperation<E extends ToolEndpoint, TParams>(
  endpoint: E,
  config: BidirectionalToolConfig<TParams, E>,
): ToolOperationDescriptor<E, TParams> {
  const { toApiParams, fromApiParams, defaultParameters } = config;
  if (!toApiParams || !fromApiParams || defaultParameters === undefined) {
    throw new Error(
      `describeToolOperation: "${endpoint}" needs defaultParameters and both ` +
        `toApiParams/fromApiParams mappers`,
    );
  }
  return {
    endpoint,
    defaultParameters,
    toApi: (params) => toApiParams(params),
    fromApi: (api) => ({ ...defaultParameters, ...fromApiParams(api) }),
  };
}
