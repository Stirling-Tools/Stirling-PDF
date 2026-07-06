/**
 * Extension seam for how the Files sidebar groups its file list.
 *
 * Core returns `null` → the sidebar renders one flat, recency-sorted list (the
 * default everywhere: OSS, desktop, proprietary). The SaaS layer overrides this
 * (shadowing the same `@app/*` path) to group files by document-classification
 * category — a "Recent" group on top plus a collapsible group per category —
 * since classification/policies only exist on SaaS.
 *
 * Keeping the strategy behind a seam means the shared sidebar carries no
 * SaaS/classification awareness; it just renders whatever groups it's handed.
 */

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

/**
 * Return the groups to render, or `null` for a flat list. Core = flat.
 * Implemented as a hook so overrides may read app state (labels, config).
 */
export function useFileSidebarGroups(
  _stubs: StirlingFileStub[],
): FileSidebarGroup[] | null {
  return null;
}

/**
 * Header control for customizing the grouping (rendered next to the Files
 * section's buttons). Core has no grouping, so no control; the SaaS override
 * renders a group picker here.
 */
export function FileSidebarGroupControls(_props: {
  stubs: StirlingFileStub[];
}) {
  return null;
}
