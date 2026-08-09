/**
 * Story helper for tool settings panels.
 *
 * Most settings panels take a whole parameters *hook* rather than a plain
 * object, so a story can't just pass args — it needs the hook's shape, with
 * state that actually updates when the panel writes to it. `useStoryParameters`
 * builds that from real React state, so a story stays interactive (type in a
 * field, watch it hold) instead of freezing on a static snapshot.
 */
import { useCallback, useMemo, useState } from "react";
import type { BaseParametersHook } from "@app/hooks/tools/shared/useBaseParameters";

export interface StoryParametersOptions<T> {
  /** Endpoint the real hook would report; only a few panels surface it. */
  endpointName?: string;
  /** Validity gate, mirroring the tool's own validateFn. Defaults to always valid. */
  validate?: (params: T) => boolean;
}

/** A live BaseParametersHook backed by story state. */
export function useStoryParameters<T extends object>(
  initial: T,
  { endpointName = "story", validate }: StoryParametersOptions<T> = {},
): BaseParametersHook<T> {
  const [parameters, setParameters] = useState<T>(initial);

  const updateParameter = useCallback(
    <K extends keyof T>(parameter: K, value: T[K]) =>
      setParameters((prev) => ({ ...prev, [parameter]: value })),
    [],
  );

  const resetParameters = useCallback(() => setParameters(initial), [initial]);

  return useMemo(
    () => ({
      parameters,
      setParameters,
      updateParameter,
      resetParameters,
      validateParameters: () => validate?.(parameters) ?? true,
      getEndpointName: () => endpointName,
    }),
    [parameters, updateParameter, resetParameters, validate, endpointName],
  );
}
