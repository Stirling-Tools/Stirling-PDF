import { PORTAL_ENTITY_SCOPE_DEFS } from "@app/types/superSearch";
import { PROCESSOR_SEARCH_INDEX } from "@app/data/processorSearchIndex";
import { SETTINGS_SECTION_REGISTRY } from "@app/data/settingsSectionRegistry";

/**
 * Whether this build ships somewhere a Processor entity lane's results open:
 * the portal view it targets, or — for entities that now live in settings
 * (users) — that settings section. Build-level only; whether this session may
 * see it is the host's to add (see isPortalEntityScopeOffered).
 */
export function isPortalEntityScopeShipped(scopeId: string): boolean {
  const def = PORTAL_ENTITY_SCOPE_DEFS.find((d) => d.id === scopeId);
  if (!def) return false;
  return def.settingsKey !== undefined
    ? SETTINGS_SECTION_REGISTRY.some((s) => s.key === def.settingsKey)
    : PROCESSOR_SEARCH_INDEX.some((entry) => entry.id === def.viewId);
}
