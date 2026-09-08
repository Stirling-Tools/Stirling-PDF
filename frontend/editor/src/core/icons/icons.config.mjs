// Hand-maintained inputs to the registry generator; it derives everything else
// from the names the app references and the two svg dirs.

// Stroke geometry for every monochrome icon. 1.75 is the weight the processor
// chrome was drawn at; changing it re-weights the whole app at once.
export const STROKE_WIDTH = 1.75;

// Default rendered size in px when a call site does not pass one. 24 matches
// what @mui/icons-material rendered at its default `fontSize="medium"`.
export const DEFAULT_SIZE = 24;

// Bundled even though no source literal names them: BrandMark resolves
// connection-type ids the API returns straight to registry names, and lucide
// happens to have a glyph for these ids. Exempt from the unused report.
export const EXTRA_NAMES = ["webhook"];
