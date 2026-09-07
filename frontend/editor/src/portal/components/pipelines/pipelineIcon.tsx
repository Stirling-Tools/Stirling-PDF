// A pipeline's icon, keyed by a small named vocabulary the icon picker offers. Distinct from
// policyCategoryIcon (which is keyed by category id): a custom pipeline has no category, so it needs
// a general set to choose from. Category ids are also accepted as keys, so a template-derived
// pipeline that only stores its categoryId still resolves to the matching glyph.

import type { ReactNode } from "react";
import type { IconPickerOption } from "@app/ui";
import { Icon, type IconName } from "@app/ui/Icon";

// Every key resolves to a registry icon; "route" is the default.
const ICONS: Record<string, IconName> = {
  // Pickable vocabulary.
  shield: "shield",
  lock: "lock",
  label: "tag",
  layers: "layers",
  check: "circle-check",
  route: "route",
  schedule: "clock",
  watermark: "watermark",
  doc: "file-text",
  folder: "folder",
  scan: "scan-line",
  bolt: "zap",
  sparkle: "sparkles",
  // Category-id aliases (same glyphs as policyCategoryIcon), so a template-derived pipeline that
  // stores only its categoryId still resolves without an explicit pick.
  ingestion: "layers",
  security: "shield",
  classification: "tag",
  compliance: "circle-check",
  routing: "route",
  retention: "clock",
};

// A category id doubles as an icon value (see the ICONS aliases), but the picker only offers the
// canonical keys below, so a category-id value must be mapped to its canonical key or IconPicker
// can't match it and falls back to the default glyph. Keep in sync with the ICONS aliases.
const CATEGORY_ICON_KEY: Record<string, string> = {
  ingestion: "layers",
  security: "shield",
  classification: "label",
  compliance: "check",
  routing: "route",
  retention: "schedule",
};

/** An icon value (a pickable key, or a category-id alias) mapped to the canonical key the picker
 * offers, so a template-derived pipeline shows its glyph as the selected option. */
export function canonicalPipelineIconKey(key: string): string {
  return CATEGORY_ICON_KEY[key] ?? key;
}

/** The glyph for a pipeline with no icon set (and the picker's default): the bespoke route mark. */
export const DEFAULT_PIPELINE_ICON = "route";

/** Icon keys the picker offers, in display order. */
export const PIPELINE_ICON_KEYS: readonly string[] = [
  "route",
  "shield",
  "lock",
  "label",
  "layers",
  "check",
  "schedule",
  "watermark",
  "doc",
  "folder",
  "scan",
  "bolt",
  "sparkle",
];

// Defaults to inheriting the surrounding font-size so a wrapping box controls size.
export function pipelineIcon(
  key?: string,
  fontSize: string = "inherit",
  className?: string,
): ReactNode {
  const resolved = key && ICONS[key] ? key : DEFAULT_PIPELINE_ICON;
  return <Icon name={ICONS[resolved]} size={fontSize} className={className} />;
}

/** The pipeline's icon vocabulary as options for the shared SUI `IconPicker`. */
export const PIPELINE_ICON_OPTIONS: IconPickerOption[] = PIPELINE_ICON_KEYS.map(
  (key) => ({ key, label: key, node: pipelineIcon(key, "1.25rem") }),
);
