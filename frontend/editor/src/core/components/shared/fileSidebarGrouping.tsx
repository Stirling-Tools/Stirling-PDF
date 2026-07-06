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

// Header control for customizing the grouping; core has none, an override renders a group picker.
export function FileSidebarGroupControls(_props: {
  stubs: StirlingFileStub[];
}) {
  return null;
}
