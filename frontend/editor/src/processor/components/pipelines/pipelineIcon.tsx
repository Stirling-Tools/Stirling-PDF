// A pipeline's icon, keyed by a small named vocabulary the icon picker offers. Distinct from
// policyCategoryIcon (which is keyed by category id): a custom pipeline has no category, so it needs
// a general set to choose from. Category ids are also accepted as keys, so a template-derived
// pipeline that only stores its categoryId still resolves to the matching glyph.

import type { ReactNode } from "react";
import type { IconPickerOption } from "@app/ui";
import type { SxProps, Theme } from "@mui/material";
import { PIPELINE_ROUTE_GLYPH } from "@processor/components/icons";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import AltRouteOutlinedIcon from "@mui/icons-material/AltRouteOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";
import BrandingWatermarkOutlinedIcon from "@mui/icons-material/BrandingWatermarkOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import DocumentScannerOutlinedIcon from "@mui/icons-material/DocumentScannerOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";

type MuiIcon = React.ComponentType<{ sx?: SxProps<Theme>; className?: string }>;

// "route" is the default, drawn bespoke (see pipelineIcon) to match the sidebar glyph, so it is not
// in this MUI map. Every other key resolves to an outline Material glyph.
const ICONS: Record<string, MuiIcon> = {
  // Pickable vocabulary.
  shield: ShieldOutlinedIcon,
  lock: LockOutlinedIcon,
  label: LabelOutlinedIcon,
  layers: LayersOutlinedIcon,
  check: CheckCircleOutlinedIcon,
  route: AltRouteOutlinedIcon,
  schedule: ScheduleOutlinedIcon,
  watermark: BrandingWatermarkOutlinedIcon,
  doc: DescriptionOutlinedIcon,
  folder: FolderOutlinedIcon,
  scan: DocumentScannerOutlinedIcon,
  bolt: BoltOutlinedIcon,
  sparkle: AutoAwesomeOutlinedIcon,
  // Category-id aliases (same glyphs as policyCategoryIcon), so a template-derived pipeline that
  // stores only its categoryId still resolves without an explicit pick.
  ingestion: LayersOutlinedIcon,
  security: ShieldOutlinedIcon,
  classification: LabelOutlinedIcon,
  compliance: CheckCircleOutlinedIcon,
  routing: AltRouteOutlinedIcon,
  retention: ScheduleOutlinedIcon,
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
  const resolved = key && (key === "route" || ICONS[key]) ? key : "route";
  if (resolved === "route") {
    // The default/route glyph is bespoke (matches the sidebar), em-sized like the Material icons.
    return (
      <svg
        viewBox="0 0 24 24"
        width="1em"
        height="1em"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ fontSize }}
        className={className}
        aria-hidden
      >
        {PIPELINE_ROUTE_GLYPH}
      </svg>
    );
  }
  const Icon = ICONS[resolved];
  const sx: SxProps<Theme> = { fontSize };
  return <Icon sx={sx} className={className} />;
}

/** The pipeline's icon vocabulary as options for the shared SUI `IconPicker`. */
export const PIPELINE_ICON_OPTIONS: IconPickerOption[] = PIPELINE_ICON_KEYS.map(
  (key) => ({ key, label: key, node: pipelineIcon(key, "1.25rem") }),
);
