import type React from "react";

/**
 * The super search's shared contract: what a results provider returns and the
 * shapes hosts exchange with the shared rankers. Pure types, kept apart from
 * the provider implementations so leaf modules (flavor seams, the portal's
 * entity search) can depend on the contract without importing a provider —
 * which would be a circular import.
 */

export type SuperSearchGroupId = "files" | "tools" | "settings" | "processor";

export interface SuperSearchResult {
  /** Stable unique key across all groups. */
  key: string;
  /** Group id — the editor uses SuperSearchGroupId; other hosts use their own. */
  group: string;
  title: string;
  subtitle?: string;
  /** LocalIcon name (files/settings); tools provide a React node via `icon`. */
  iconName?: string;
  icon?: React.ReactNode;
  score: number;
  onSelect: () => void | Promise<void>;
}

export interface SuperSearchGroup {
  id: string;
  label: string;
  /** Optional higher-level section label rendered above consecutive groups. */
  sectionLabel?: string;
  results: SuperSearchResult[];
}

export interface SuperSearchScope {
  id: string;
  label: string;
  aliases?: string[];
}

export interface UseSuperSearchResult {
  /** Non-empty groups, in display order. */
  groups: SuperSearchGroup[];
  /** All results flattened in display order (for keyboard navigation). */
  flatResults: SuperSearchResult[];
  /** True while the My Files store is loading for the first time. */
  loadingFiles: boolean;
}

export interface SuperSearchQueryOptions {
  scopeIds?: readonly string[];
}

/**
 * Visibility gates shared by the settings and Processor sources. Hosts pass
 * `null` while the app config is still loading — the rankers treat that as
 * "most restrictive" so gated results can appear once config lands but never
 * flash open before it.
 */
export interface SuperSearchGates {
  isAdmin: boolean;
  loginEnabled: boolean;
  portalAccessible?: boolean;
}

/**
 * The Processor's entity lanes as scope definitions — ids, the portal view
 * each targets, chip labels and typed-prefix aliases. Both hosts' chip lists
 * and the portal's entity module derive from this one list, so the chips
 * can't drift apart; it lives in the types leaf because the editor's chip
 * list must not import portal code.
 */
export interface PortalEntityScopeDef {
  id:
    | "portal-users"
    | "portal-policies"
    | "portal-pipelines"
    | "portal-sources";
  /** Portal view id the scope targets (visibility check vs the page index). */
  viewId: string;
  labelKey: string;
  labelFallback: string;
  aliases: readonly string[];
}

/**
 * The developer-docs scope. Separate from the entity defs above: docs are a
 * bundled full-text manifest, not a fetched entity list, so they don't ride
 * the fetch cache — but they get a chip and a results group like the rest.
 */
export const PORTAL_DOCS_SCOPE_ID = "portal-docs";

export const PORTAL_ENTITY_SCOPE_DEFS: readonly PortalEntityScopeDef[] = [
  {
    id: "portal-users",
    viewId: "users",
    labelKey: "portal.nav.users",
    labelFallback: "Users",
    aliases: ["user", "users", "member", "members"],
  },
  {
    id: "portal-policies",
    viewId: "policies",
    labelKey: "portal.nav.policies",
    labelFallback: "Policies",
    aliases: ["policy", "policies"],
  },
  {
    id: "portal-pipelines",
    viewId: "pipelines",
    labelKey: "portal.nav.pipelines",
    labelFallback: "Pipelines",
    aliases: ["pipeline", "pipelines"],
  },
  {
    id: "portal-sources",
    viewId: "sources",
    labelKey: "portal.nav.sources",
    labelFallback: "Sources",
    aliases: ["source", "sources"],
  },
];
