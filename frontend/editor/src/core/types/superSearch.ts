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
