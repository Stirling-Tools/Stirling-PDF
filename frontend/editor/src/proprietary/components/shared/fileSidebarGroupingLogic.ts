// Pure grouping logic for the Files sidebar, split from the React seam module so it can be imported (and unit-tested) without pulling in the category-picker component and its heavy UI deps.

import { DEFAULT_LABEL_ICON } from "@app/data/labelIcons";
import { accentColor, accentCycleColor } from "@app/utils/accentColors";
import type { SidebarCategory } from "@app/services/fileSidebarCategories";
import type { StirlingFileStub } from "@app/types/fileContext";
import type { FileSidebarGroup } from "@core/components/shared/fileSidebarGrouping";

export type { FileSidebarGroup };

/** Files shown in the always-expanded "Recent" group. */
const RECENT_COUNT = 8;

/** Per label id (a file's stored classification ids) → the stubs carrying it. */
export function bucketStubsByLabel(
  stubs: StirlingFileStub[],
): Map<string, { stubs: StirlingFileStub[] }> {
  const byLabel = new Map<string, { stubs: StirlingFileStub[] }>();
  for (const stub of stubs) {
    for (const labelId of stub.classificationLabels ?? []) {
      const bucket = byLabel.get(labelId);
      if (bucket) bucket.stubs.push(stub);
      else byLabel.set(labelId, { stubs: [stub] });
    }
  }
  return byLabel;
}

/**
 * Pure grouping: Recent (top {@link RECENT_COUNT} by lastModified), then one group per VISIBLE
 * category with ≥1 file (a file lands in every category it has a label in), sorted alphabetically,
 * then Other (files in no visible category) last. Categories are the fixed, shared set; a category
 * the user has hidden forms no group, so its files fall to Other.
 */
export function buildLabelGroups(
  stubs: StirlingFileStub[],
  t: (key: string, fallback: string) => string,
  categories: SidebarCategory[],
): FileSidebarGroup[] | null {
  if (stubs.length === 0) return null;

  const recent = [...stubs]
    .sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0))
    .slice(0, RECENT_COUNT);

  const visible: Omit<FileSidebarGroup, "color">[] = [];

  // One group per visible category: every file carrying any of its labels, in the input's order
  // (deduped — a file with two of the category's labels appears once).
  for (const category of categories) {
    if (category.hidden) continue;
    const ids = new Set(category.labelKeys);
    const members = stubs.filter((stub) =>
      (stub.classificationLabels ?? []).some((labelId) => ids.has(labelId)),
    );
    if (members.length === 0) continue;
    visible.push({
      id: `category:${category.id}`,
      label: category.name,
      icon: category.icon,
      stubs: members,
      defaultExpanded: false,
    });
  }

  visible.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
  );

  // Other = files in no visible group: unlabelled, or labelled only under hidden categories.
  const covered = new Set<string>();
  for (const group of visible) {
    for (const stub of group.stubs) covered.add(stub.id as string);
  }
  const other = stubs.filter((stub) => !covered.has(stub.id as string));

  const groups: FileSidebarGroup[] = [
    {
      id: "recent",
      label: t("fileSidebar.recent", "Recent"),
      icon: "history",
      stubs: recent,
      defaultExpanded: true,
    },
    ...visible.map((group, index) => ({
      ...group,
      // Theme-adaptive accent cycled in display order, so each icon reads at a glance.
      color: accentCycleColor(index),
    })),
  ];
  if (other.length > 0) {
    groups.push({
      id: "other",
      label: t("fileSidebar.other", "Other"),
      icon: DEFAULT_LABEL_ICON,
      // Neutral grey for the "Other" (unlabelled) group.
      color: accentColor("gray"),
      stubs: other,
      defaultExpanded: false,
    });
  }
  return groups;
}
