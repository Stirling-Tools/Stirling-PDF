// The two dials the registry generator cannot derive. Everything else comes
// from lucide and the two svg dirs.

// Stroke geometry for every monochrome icon. 1.75 is the weight the processor
// chrome was drawn at; changing it re-weights the whole app at once.
export const STROKE_WIDTH = 1.75;

// Default rendered size in px when a call site does not pass one. 24 matches
// what @mui/icons-material rendered at its default `fontSize="medium"`.
export const DEFAULT_SIZE = 24;
