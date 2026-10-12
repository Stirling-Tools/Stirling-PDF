import "@fontsource/mrs-saint-delafield/400.css";
import "@fontsource/great-vibes/400.css";
import "@fontsource/dancing-script/500.css";
import "@fontsource/caveat/500.css";
import "@fontsource/homemade-apple/400.css";
import "@fontsource/allura/400.css";

export interface SignatureFont {
  family: string;
  previewScale: number;
}

export const SIGNATURE_FONTS: SignatureFont[] = [
  { family: "Mrs Saint Delafield", previewScale: 1.3 },
  { family: "Great Vibes", previewScale: 1 },
  { family: "Dancing Script", previewScale: 0.85 },
  { family: "Caveat", previewScale: 0.95 },
  { family: "Homemade Apple", previewScale: 0.58 },
  { family: "Allura", previewScale: 1.1 },
];

export interface InkColor {
  id: "black" | "navy" | "blue";
  value: string;
}

export const INK_COLORS: InkColor[] = [
  { id: "black", value: "#111111" }, // theme-allow-color signature ink on paper
  { id: "navy", value: "#16233f" }, // theme-allow-color signature ink on paper
  { id: "blue", value: "#1d4ed8" }, // theme-allow-color signature ink on paper
];

export const DEFAULT_INK = INK_COLORS[0];
