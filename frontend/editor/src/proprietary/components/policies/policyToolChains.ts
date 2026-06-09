/**
 * The fixed, configurable tool chain per policy category — the locked set the
 * config page shows (one section per tool). Tools can be configured + toggled
 * on/off, but not added or removed. Each id is a frontend tool-registry key (and
 * maps to that tool's backend endpoint via the registry's operationConfig).
 *
 * Only Security is wired today; other categories follow.
 */
export const POLICY_TOOL_CHAINS: Record<string, string[]> = {
  // Redact PII (on) · Watermark (off) · Remove JavaScript via sanitize (on).
  security: ["redact", "watermark", "sanitize"],
};

/** The configurable tool chain for a category, or null if it has none yet. */
export function getPolicyToolChain(categoryId: string): string[] | null {
  return POLICY_TOOL_CHAINS[categoryId] ?? null;
}
