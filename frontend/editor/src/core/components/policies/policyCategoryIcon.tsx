// Shared source of truth for a policy category's outline icon, keyed by category
// id (not a parallel icon-name vocabulary). Used by the editor's policy
// definitions and the portal's catalogue cards, summaries, and setup wizard.

import type { ReactNode } from "react";
import type { SxProps, Theme } from "@mui/material";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import ShieldOutlinedIcon from "@mui/icons-material/ShieldOutlined";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import AltRouteOutlinedIcon from "@mui/icons-material/AltRouteOutlined";
import ScheduleOutlinedIcon from "@mui/icons-material/ScheduleOutlined";

type MuiIcon = React.ComponentType<{ sx?: SxProps<Theme>; className?: string }>;

/** Policy category id → outline glyph. */
const POLICY_CATEGORY_ICONS: Record<string, MuiIcon> = {
  ingestion: LayersOutlinedIcon,
  security: ShieldOutlinedIcon,
  classification: LabelOutlinedIcon,
  compliance: CheckCircleOutlinedIcon,
  routing: AltRouteOutlinedIcon,
  retention: ScheduleOutlinedIcon,
};

const FALLBACK_ICON = LabelOutlinedIcon;

// Defaults to inheriting the surrounding font-size so a wrapping box controls size.
export function policyCategoryIcon(
  categoryId: string,
  sx: SxProps<Theme> = { fontSize: "inherit" },
  className?: string,
): ReactNode {
  const Icon = POLICY_CATEGORY_ICONS[categoryId] ?? FALLBACK_ICON;
  return <Icon sx={sx} className={className} />;
}
