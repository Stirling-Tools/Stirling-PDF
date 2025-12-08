import { PAGE_SIZES } from "@app/constants/pageSizeConstants";

// Default crop area (covers entire page)
export const DEFAULT_CROP_AREA = {
  x: 0,
  y: 0,
  width: PAGE_SIZES.A4.width,
  height: PAGE_SIZES.A4.height,
} as const;


export type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w' | null;
