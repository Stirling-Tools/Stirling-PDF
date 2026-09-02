import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useScopedFetchCache } from "@app/hooks/useScopedFetchCache";
import type { SuperSearchGroup } from "@app/types/superSearch";
import type {
  PortalEntityItems,
  PortalEntityScopeId,
} from "@processor/search/entitySearch";
import { HAS_PROCESSOR } from "@app/routes/hasProcessor";

type EntitySearchModule = typeof import("@processor/search/entitySearch");

const NO_GROUPS: SuperSearchGroup[] = [];
const NO_SCOPES: readonly PortalEntityScopeId[] = [];

/**
 * Processor entity results for the editor's super search. The portal's
 * entity-search module is imported on demand (first search keystroke) — a
 * static value import here would pull the portal into the main bundle, the
 * same constraint the static page index (processorSearchIndex) lives under.
 * Fetch discipline (TTL, in-flight dedupe, generation guard) comes from
 * useScopedFetchCache; the scope list is dynamic and the fetcher lives in the
 * lazily loaded module, which useQuery's static-key shape handles awkwardly.
 *
 * `tier` shapes only presentational fields on the users payload, never the
 * lists (see fetchPortalEntityScope), so the editor passes "free" rather than
 * mounting the portal's TierContext.
 */
export function useProcessorEntityGroups(
  trimmed: string,
  enabled: boolean,
  t: TFunction,
  navigate: (path: string) => void,
  scopeEnabled: (scopeId: string) => boolean = () => true,
  isAdmin = false,
): SuperSearchGroup[] {
  const [mod, setMod] = useState<EntitySearchModule | null>(null);
  const modRef = useRef<EntitySearchModule | null>(null);
  // Without the processor these entities have nowhere to open, so don't fetch them.
  const active = enabled && HAS_PROCESSOR;
  const hasQuery = trimmed.length > 0;

  useEffect(() => {
    if (!active || modRef.current) return;
    let cancelled = false;
    void import("@processor/search/entitySearch").then((loaded) => {
      if (cancelled) return;
      modRef.current = loaded;
      setMod(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [active]);

  const requestedScopes = useMemo<readonly PortalEntityScopeId[]>(() => {
    if (!active || !hasQuery || !mod) return NO_SCOPES;
    return mod.withPortalEntityDependencies(
      mod
        .defaultPortalEntityScopes(isAdmin)
        .filter((scopeId) => scopeEnabled(scopeId)),
    );
  }, [active, hasQuery, mod, scopeEnabled, isAdmin]);

  const fetchScope = useCallback(
    async (scopeId: PortalEntityScopeId): Promise<PortalEntityItems> => {
      const loaded =
        modRef.current ?? (await import("@processor/search/entitySearch"));
      return loaded.fetchPortalEntityScope(scopeId, "free");
    },
    [],
  );

  const { values } = useScopedFetchCache(
    requestedScopes,
    fetchScope,
    // The TTL lives in the (lazily loaded) module; until it arrives no scope
    // is requested, so the placeholder never gates a real fetch.
    mod?.ENTITY_REFRESH_MS ?? Number.MAX_SAFE_INTEGER,
  );

  const entities = useMemo(
    () => (mod ? mod.toProcessorEntities(values) : null),
    [mod, values],
  );

  return useMemo(() => {
    if (!mod || !entities || !active || !hasQuery) return NO_GROUPS;
    return mod.buildProcessorEntityGroups(entities, trimmed, t, navigate, {
      scopeEnabled,
    });
  }, [mod, entities, active, hasQuery, trimmed, t, navigate, scopeEnabled]);
}
