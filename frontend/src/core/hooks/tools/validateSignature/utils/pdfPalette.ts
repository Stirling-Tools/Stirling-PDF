import { rgb } from 'pdf-lib';
import '@app/styles/theme.css';

type RgbTuple = [number, number, number];

const defaultLightPalette: Record<
  'headerBackground' | 'accent' | 'textPrimary' | 'textMuted' | 'boxBackground' | 'boxBorder' | 'warning' | 'danger' | 'success' | 'neutral',
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

export const colorPalette = {
  headerBackground: getCssVariableAsRgb('--pdf-light-header-bg', defaultLightPalette.headerBackground),
  accent: getCssVariableAsRgb('--pdf-light-accent', defaultLightPalette.accent),
  textPrimary: getCssVariableAsRgb('--pdf-light-text-primary', defaultLightPalette.textPrimary),
  textMuted: getCssVariableAsRgb('--pdf-light-text-muted', defaultLightPalette.textMuted),
  boxBackground: getCssVariableAsRgb('--pdf-light-box-bg', defaultLightPalette.boxBackground),
  boxBorder: getCssVariableAsRgb('--pdf-light-box-border', defaultLightPalette.boxBorder),
  warning: getCssVariableAsRgb('--pdf-light-warning', defaultLightPalette.warning),
  danger: getCssVariableAsRgb('--pdf-light-danger', defaultLightPalette.danger),
  success: getCssVariableAsRgb('--pdf-light-success', defaultLightPalette.success),
  neutral: getCssVariableAsRgb('--pdf-light-neutral', defaultLightPalette.neutral),
};
