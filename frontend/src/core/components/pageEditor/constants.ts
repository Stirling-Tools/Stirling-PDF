// Shared constants for PageEditor grid layout
export const GRID_CONSTANTS = {
  ITEM_WIDTH: '20rem', // page width
  ITEM_HEIGHT: '21.5rem', // 20rem + 1.5rem gap
  ITEM_GAP: '1.5rem', // gap between items
  OVERSCAN_SMALL: 8, // Overscan for normal documents
  OVERSCAN_LARGE: 12, // Overscan for large documents (12 rows = ~96 pages pre-rendered)
} as const;