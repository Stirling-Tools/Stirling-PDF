import type { PolicyConfigDef, PolicyState } from "@app/types/policies";

/**
 * Resolve each field's effective value for a policy: the saved override from
 * state, falling back to the definition's default.
 */
export function resolveFieldValues(
  config: PolicyConfigDef,
  state: PolicyState,
): Record<string, boolean | string | string[]> {
  const out: Record<string, boolean | string | string[]> = {};
  for (const f of config.fields) {
    out[f.key] = state.fieldValues[f.key] ?? f.value;
  }
  return out;
}
