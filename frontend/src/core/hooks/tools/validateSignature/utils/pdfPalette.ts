import { rgb } from 'pdf-lib';

type RgbTuple = [number, number, number];
type PdfRgb = ReturnType<typeof rgb>;

const defaultLightPalette: Record<
  | 'headerBackground'
  | 'accent'
  | 'textPrimary'
  | 'textMuted'
  | 'boxBackground'
  | 'boxBorder'
  | 'warning'
  | 'danger'
  | 'success'
  | 'neutral',
  RgbTuple
> = {
  headerBackground: [239, 246, 255],
  accent: [59, 130, 246],
  textPrimary: [30, 41, 59],
  textMuted: [100, 116, 139],
  boxBackground: [248, 250, 252],
  boxBorder: [226, 232, 240],
  warning: [234, 179, 8],
  danger: [248, 113, 113],
  success: [34, 197, 94],
  neutral: [148, 163, 184],
};

const toRgb = ([r, g, b]: RgbTuple) => rgb(r / 255, g / 255, b / 255);

/**
 * Utility function to get CSS variable values and convert them to pdf-lib RGB format.
 * Falls back to sensible defaults when the CSS variable cannot be resolved.
 */
function getCssVariableAsRgb(variableName: string, fallback: RgbTuple) {
  if (typeof window === 'undefined') {
    return toRgb(fallback);
  }

  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();

  if (!value) {
    console.warn(`CSS variable ${variableName} not found, using fallback`);
    return toRgb(fallback);
  }

  const [r, g, b] = value.split(' ').map(Number);

  if ([r, g, b].some((component) => Number.isNaN(component))) {
    console.warn(`Invalid CSS variable format for ${variableName}: ${value}`);
    return toRgb(fallback);
  }

  return rgb(r / 255, g / 255, b / 255);
}

type ColorPalette = Record<keyof typeof defaultLightPalette, PdfRgb>;

const pdfCssVariables: Record<keyof typeof defaultLightPalette, string> = {
  headerBackground: '--pdf-light-header-bg',
  accent: '--pdf-light-accent',
  textPrimary: '--pdf-light-text-primary',
  textMuted: '--pdf-light-text-muted',
  boxBackground: '--pdf-light-box-bg',
  boxBorder: '--pdf-light-box-border',
  warning: '--pdf-light-warning',
  danger: '--pdf-light-danger',
  success: '--pdf-light-success',
  neutral: '--pdf-light-neutral',
};

const paletteCache: Partial<ColorPalette> = {};
let paletteInitialized = false;
let lastWindowAvailable = typeof window !== 'undefined';

const paletteKeys = Object.keys(pdfCssVariables) as Array<keyof typeof defaultLightPalette>;

const ensurePaletteInitialized = () => {
  const windowIsAvailable = typeof window !== 'undefined';
  if (paletteInitialized && windowIsAvailable && lastWindowAvailable) {
    return;
  }

  paletteInitialized = true;
  lastWindowAvailable = windowIsAvailable;

  paletteKeys.forEach((key) => {
    paletteCache[key] = getCssVariableAsRgb(pdfCssVariables[key], defaultLightPalette[key]);
  });
};

export const colorPalette = {} as ColorPalette;

paletteKeys.forEach((key) => {
  Object.defineProperty(colorPalette, key, {
    enumerable: true,
    get() {
      ensurePaletteInitialized();
      return paletteCache[key]!;
    },
  });
});
