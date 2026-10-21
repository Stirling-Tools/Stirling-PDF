import type { IconName } from "@app/ui/Icon";
import type { CutPagesScope } from "@app/hooks/tools/cutAndTile/useCutAndTileParameters";

export interface CutAndTileModeChoice {
  mode: "grid" | "poster";
  icon: IconName;
  labelKey: string;
  descriptionKey: string;
}

/** Two outcomes, named by what the user gets rather than the endpoint. */
export const CUT_AND_TILE_MODES: CutAndTileModeChoice[] = [
  {
    mode: "grid",
    icon: "layout-grid",
    labelKey: "cutAndTile.mode.grid",
    descriptionKey: "cutAndTile.mode.gridHint",
  },
  {
    mode: "poster",
    icon: "printer",
    labelKey: "cutAndTile.mode.poster",
    descriptionKey: "cutAndTile.mode.posterHint",
  },
];

export const SPLIT_MODE_OPTIONS: {
  value: CutPagesScope;
  labelKey: string;
}[] = [
  { value: "all", labelKey: "cutAndTile.pages.all" },
  { value: "exceptFirst", labelKey: "cutAndTile.pages.exceptFirst" },
  { value: "exceptLast", labelKey: "cutAndTile.pages.exceptLast" },
  {
    value: "exceptFirstAndLast",
    labelKey: "cutAndTile.pages.exceptFirstAndLast",
  },
  { value: "custom", labelKey: "cutAndTile.pages.custom" },
];
