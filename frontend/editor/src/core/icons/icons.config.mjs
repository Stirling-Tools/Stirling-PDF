// Hand-maintained inputs to the registry generator; it derives everything else
// from the names the app references and the two svg dirs.

// Stroke geometry for every monochrome icon. 1.75 is the weight the processor
// chrome was drawn at; changing it re-weights the whole app at once.
export const STROKE_WIDTH = 1.75;

// Default rendered size in px when a call site does not pass one. 24 matches
// what @mui/icons-material rendered at its default `fontSize="medium"`.
export const DEFAULT_SIZE = 24;

// Bundled even though no mapping targets them: names built at runtime, or
// needed before their call site exists. Exempt from the unused report.
export const EXTRA_NAMES = [];
