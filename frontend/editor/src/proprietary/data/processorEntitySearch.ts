import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useScopedFetchCache } from "@app/hooks/useScopedFetchCache";
import type { SuperSearchGroup } from "@app/types/superSearch";
import type {
  PortalEntityItems,
  PortalEntityScopeId,
} from "@portal/search/entitySearch";

type EntitySearchModule = typeof import("@portal/search/entitySearch");

// Mirrors the admin-route seam's gate: the portal route-set is only mounted in
// dev and in builds made with VITE_INCLUDE_PORTAL=true, so the search must not
// fetch or offer entities that have nowhere to open.
const includePortal =
  import.meta.env.VITE_INCLUDE_PORTAL === "true" || import.meta.env.DEV;

const NO_GROUPS: SuperSearchGroup[] = [];
const NO_SCOPES: readonly PortalEntityScopeId[] = [];

/**
 * Processor entity results for the editor's super search. The portal's
 * entity-search module is imported on demand (first search keystroke) — a
 * static value import here would pull the portal into the main bundle, the
 * same constraint the static page index (processorSearchIndex) lives under.
 * Fetch discipline (TTL, in-flight dedupe, generation guard) comes from the
 * same useScopedFetchCache the portal bar uses.
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
  focusedScopeId: string | null = null,
): SuperSearchGroup[] {
  const [mod, setMod] = useState<EntitySearchModule | null>(null);
  const modRef = useRef<EntitySearchModule | null>(null);
  const active = enabled && includePortal;
  const hasQuery = trimmed.length > 0;

  useEffect(() => {
    if (!active || modRef.current) return;
    let cancelled = false;
    void import("@portal/search/entitySearch").then((loaded) => {
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
        .defaultPortalEntityScopes()
        .filter((scopeId) => scopeEnabled(scopeId)),
    );
  }, [active, hasQuery, mod, scopeEnabled]);

  const fetchScope = useCallback(
    async (scopeId: PortalEntityScopeId): Promise<PortalEntityItems> => {
      const loaded =
        modRef.current ?? (await import("@portal/search/entitySearch"));
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
      focusedScopeId,
    });
  }, [
    mod,
    entities,
    active,
    hasQuery,
    trimmed,
    t,
    navigate,
    scopeEnabled,
    focusedScopeId,
  ]);
}
