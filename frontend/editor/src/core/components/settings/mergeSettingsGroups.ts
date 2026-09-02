import type { ConfigNavSection } from "@app/components/shared/config/types";

/**
 * Folds another layer's settings groups into the build's own. Groups with a
 * matching `id` merge - the incoming items lead, since they replace the ones
 * listed in `superseded` - and unmatched groups slot in after Workspace (or
 * after the first group when there is none), so the order stays readable
 * whichever layer contributed what.
 */
export function mergeSettingsGroups(
  base: ConfigNavSection[],
  extra: ConfigNavSection[],
  superseded: readonly string[],
): ConfigNavSection[] {
  const drop = new Set<string>(superseded);
  const merged = base
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !drop.has(item.key)),
    }))
    .filter((section) => section.items.length > 0);

  for (const group of extra) {
    const target = group.id
      ? merged.find((section) => section.id === group.id)
      : undefined;
    if (target) {
      target.items = [...group.items, ...target.items];
      continue;
    }
    const workspace = merged.findIndex((section) => section.id === "workspace");
    const at = workspace >= 0 ? workspace + 1 : Math.min(1, merged.length);
    merged.splice(at, 0, group);
  }
  return merged;
}
