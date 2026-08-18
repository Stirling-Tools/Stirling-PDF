// Extension seam for how the Files sidebar groups its list; core returns null (one flat, recency-sorted list) and a higher layer overrides this to group by classification. The shared sidebar just renders whatever groups it's handed.

import type { StirlingFileStub } from "@app/types/fileContext";

export interface FileSidebarGroup {
  /** Stable key for collapse state + React keys. */
  id: string;
  /** Group header text. */
  label: string;
  /** Optional Material Symbols icon key (rendered via LocalIcon). */
  icon?: string;
  /** Optional CSS colour for the group's icon (e.g. a per-category accent). */
  color?: string;
  /** Files in this group, in display order. */
  stubs: StirlingFileStub[];
  /** Whether the group starts expanded (the sidebar owns the live toggle state). */
  defaultExpanded: boolean;
}

// Groups to render, or null for a flat list (core = flat). A hook so overrides may read app state.
export function useFileSidebarGroups(
  _stubs: StirlingFileStub[],
): FileSidebarGroup[] | null {
  return null;
}

/** One classification label as a file card wears it: its own icon and the
 *  accent its category carries in the sidebar, named on hover. */
export interface LabelBadge {
  id: string;
  /** Translated display name, for the hover. */
  name: string;
  /** Material Symbols icon key (rendered via LocalIcon). */
  icon: string;
  /** CSS colour matching the label's sidebar category accent. */
  color?: string;
}

const NO_BADGES: LabelBadge[] = [];

/** Badge descriptors for a file's labels; core (no classification) has none. */
export function useLabelBadges(_labels?: string[] | null): LabelBadge[] {
  return NO_BADGES;
}

/**
 * Badge descriptors for the categories (label families) a file's labels roll
 * up into — the same identities the sidebar groups by. Core has none.
 */
export function useFamilyBadges(_labels?: string[] | null): LabelBadge[] {
  return NO_BADGES;
}

/** One category (label family) as a files-page filter offers it. */
export interface CategoryFilterOption {
  id: string;
  name: string;
  /** Material Symbols icon key — the family's own sidebar icon. */
  icon: string;
  /** The accent its sidebar group wears. */
  color?: string;
  /** Label ids the category rolls up — a file matches if it carries any. */
  labelKeys: string[];
}

const NO_CATEGORIES: CategoryFilterOption[] = [];

/** Categories to filter by; core (no classification) offers none. */
export function useCategoryFilterOptions(): CategoryFilterOption[] {
  return NO_CATEGORIES;
}

const NEVER_MATCHES = () => false;

/**
 * Text matcher over a file's classification: whether any of its labels' or
 * their categories' display names contain the needle. Core, which has no
 * classification, never matches — the files-page text filter then falls back
 * to names alone.
 */
export function useLabelSearchMatcher(): (
  labels: string[] | null | undefined,
  needle: string,
) => boolean {
  return NEVER_MATCHES;
}

// Header control for customizing the grouping; core has none, an override renders a group picker.
export function FileSidebarGroupControls(_props: {
  stubs: StirlingFileStub[];
}) {
  return null;
}
