// Timeout delays (ms) to allow PDF viewer to complete rendering before activating placement mode
export const PLACEMENT_ACTIVATION_DELAY = 60;  // Standard delay for signature changes
export const FILE_SWITCH_ACTIVATION_DELAY = 80; // Slightly longer delay when switching files

// Signature preview sizing
export const MAX_PREVIEW_WIDTH_RATIO = 0.35;   // Max preview width as percentage of container
export const MAX_PREVIEW_HEIGHT_RATIO = 0.35;  // Max preview height as percentage of container
export const MAX_PREVIEW_WIDTH_REM = 15;       // Absolute max width in rem
export const MAX_PREVIEW_HEIGHT_REM = 10;      // Absolute max height in rem
export const MIN_SIGNATURE_DIMENSION_REM = 0.75; // Min dimension for visibility
export const OVERLAY_EDGE_PADDING_REM = 0.25;  // Padding from container edges

// Text signature padding (relative to font size)
export const HORIZONTAL_PADDING_RATIO = 0.8;
export const VERTICAL_PADDING_RATIO = 0.6;
