import type { AddStampParameters } from '@app/components/tools/addStamp/useAddStampParameters';

export type ContainerSize = { width: number; height: number };
export type PageSizePts = { widthPts: number; heightPts: number } | null;
export type ImageMeta = { url: string; width: number; height: number } | null;

// Map UI margin option to backend margin factor
export const marginFactorMap: Record<AddStampParameters['customMargin'], number> = {
  'small': 0.02,
  'medium': 0.035,
  'large': 0.05,
  'x-large': 0.075,
};

export const A4_ASPECT_RATIO = 0.707; // width/height used elsewhere in legacy UI

// Get font family based on selected alphabet (matching backend logic)
export const getFontFamily = (alphabet: string): string => {
  switch (alphabet) {
    case 'arabic':
      return 'Noto Sans Arabic, Arial Unicode MS, sans-serif';
    case 'japanese':
      return 'Noto Sans JP, Yu Gothic, Hiragino Sans, sans-serif';
    case 'korean':
      return 'Noto Sans KR, Malgun Gothic, Dotum, sans-serif';
    case 'chinese':
      return 'Noto Sans SC, Microsoft YaHei, SimSun, sans-serif';
    case 'thai':
      return 'Noto Sans Thai, Tahoma, sans-serif';
    case 'roman':
    default:
      return 'Noto Sans, Arial, Helvetica, sans-serif';
  }
};

// Lightweight parser: returns first page number from CSV/range input, otherwise 1
export const getFirstSelectedPage = (input: string): number => {
  if (!input) return 1;
  const parts = input.split(',').map(s => s.trim()).filter(Boolean);
  for (const part of parts) {
    if (/^\d+\s*-\s*\d+$/.test(part)) {
      const low = parseInt(part.split('-')[0].trim(), 10);
      if (Number.isFinite(low) && low > 0) return low;
    }
    const n = parseInt(part, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 1;
};

export type StampPreviewStyle = { container: any; item: any };

// Unified per-alphabet preview adjustments
export type Alphabet = 'roman' | 'arabic' | 'japanese' | 'korean' | 'chinese' | 'thai';
export type AlphabetTweaks = { scale: number; rowOffsetRem: [number, number, number]; lineHeight: number; capHeightRatio: number; defaultFontSize: number };
export const ALPHABET_PREVIEW_TWEAKS: Record<Alphabet, AlphabetTweaks> = {
  // [top, middle, bottom] row offsets in rem
  roman: { scale: 1.0/1.18, rowOffsetRem: [0, 1, 2.2], lineHeight: 1.28, capHeightRatio: 0.70, defaultFontSize: 80 },
  arabic: { scale: 1.2, rowOffsetRem: [0, 1.5, 2.5], lineHeight: 1, capHeightRatio: 0.68, defaultFontSize: 80 },
  japanese: { scale: 1/1.2, rowOffsetRem: [-0.1, 1, 2], lineHeight: 1, capHeightRatio: 0.72, defaultFontSize: 80 },
  korean: { scale: 1.0/1.05, rowOffsetRem: [-0.2, 0.5, 1.4], lineHeight: 1, capHeightRatio: 0.72, defaultFontSize: 80 },
  chinese: { scale: 1/1.2, rowOffsetRem: [0, 2, 2.8], lineHeight: 1, capHeightRatio: 0.72, defaultFontSize: 30 }, // temporary default font size so that it fits on the PDF
  thai: { scale: 1/1.2, rowOffsetRem: [-1, 0, .8], lineHeight: 1, capHeightRatio: 0.66, defaultFontSize: 80 },
};
export const getAlphabetPreviewScale = (alphabet: string): number => (ALPHABET_PREVIEW_TWEAKS as any)[alphabet]?.scale ?? 1.0;

export const getDefaultFontSizeForAlphabet = (alphabet: string): number => {
  return (ALPHABET_PREVIEW_TWEAKS as any)[alphabet]?.defaultFontSize ?? 80;
};

export function computeStampPreviewStyle(
  parameters: AddStampParameters,
  imageMeta: ImageMeta,
  pageSize: PageSizePts,
  containerSize: ContainerSize,
  showQuickGrid: boolean | undefined,
  _hoverTile: number | null,
  hasPageThumbnail: boolean
): StampPreviewStyle {
  const pageWidthPx = containerSize.width;
  const pageHeightPx = containerSize.height;
  const widthPts = pageSize?.widthPts ?? 595.28; // A4 width at 72 DPI
  const heightPts = pageSize?.heightPts ?? 841.89; // A4 height at 72 DPI
  const scaleX = pageWidthPx / widthPts;
  const scaleY = pageHeightPx / heightPts;
  if (pageWidthPx <= 0 || pageHeightPx <= 0) return { item: {}, container: {} } as any;

  const marginPts = (widthPts + heightPts) / 2 * (marginFactorMap[parameters.customMargin] ?? 0.035);

  // Compute content dimensions
  const heightPtsContent = parameters.fontSize * getAlphabetPreviewScale(parameters.alphabet);
  let widthPtsContent = heightPtsContent;


  if (parameters.stampType === 'image' && imageMeta) {
    const aspect = imageMeta.width / imageMeta.height;
    widthPtsContent = heightPtsContent * aspect;
  } else if (parameters.stampType === 'text') {
    // Use Canvas 2D to measure text width for better fidelity than DOM spans
    const textLine = (parameters.stampText || '').split('\n')[0] ?? '';
    const fontPx = heightPtsContent * scaleY; // Convert point size to px using vertical scale
    const fontFamily = getFontFamily(parameters.alphabet);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.font = `${fontPx}px ${fontFamily}`;
      const metrics = ctx.measureText(textLine);
      const measuredWidthPx = metrics.width;
      // Convert measured px width back to PDF points using horizontal scale
      widthPtsContent = measuredWidthPx / scaleX;

      let adjustmentFactor: number;
      switch (parameters.alphabet) {
        case 'roman':
          adjustmentFactor = 0.90;
          break;
        case 'arabic':
        case 'thai':
          adjustmentFactor = 0.92;
          break;
        case 'japanese':
        case 'korean':
        case 'chinese':
          adjustmentFactor = 0.88;
          break;
        default:
          adjustmentFactor = 0.93;
          break;
      }
      widthPtsContent *= adjustmentFactor;
    }
  }

  // Positioning helpers - mirror backend logic
  const position = parameters.position;
  const calcX = () => {
    if (parameters.overrideX >= 0 && parameters.overrideY >= 0) return parameters.overrideX;
    switch (position % 3) {
      case 1: // Left
        return marginPts;
      case 2: // Center
        return (widthPts - widthPtsContent) / 2;
      case 0: // Right
        return widthPts - widthPtsContent - marginPts;
      default:
        return 0;
    }
  };
  const calcY = () => {
    if (parameters.overrideX >= 0 && parameters.overrideY >= 0) return parameters.overrideY;
    // For text, backend positions using cap height, not full font size
    const heightForY = parameters.stampType === 'text'
      ? heightPtsContent * ((ALPHABET_PREVIEW_TWEAKS as any)[parameters.alphabet]?.capHeightRatio ?? 0.70)
      : heightPtsContent;
    switch (Math.floor((position - 1) / 3)) {
      case 0: // Top
        return heightPts - heightForY - marginPts;
      case 1: // Middle
        return (heightPts - heightForY) / 2;
      case 2: // Bottom
        return marginPts;
      default:
        return 0;
    }
  };

  const xPts = calcX();
  const yPts = calcY();
  let xPx = xPts * scaleX;
  let yPx = yPts * scaleY;
  if (parameters.stampType === 'text') {
    try {
      const rootFontSizePx = parseFloat(getComputedStyle(document.documentElement).fontSize || '16') || 16;
      const rowIndex = Math.floor((position - 1) / 3); // 0 top, 1 middle, 2 bottom
      const offsets = (ALPHABET_PREVIEW_TWEAKS as any)[parameters.alphabet]?.rowOffsetRem ?? [0, 0, 0];
      const offsetRem = offsets[rowIndex] ?? 0;
      yPx += offsetRem * rootFontSizePx;
    } catch (e) {
      // no-op
      console.error(e);
    }
  }
  const widthPx = widthPtsContent * scaleX;
  const heightPx = heightPtsContent * scaleY;

  xPx = Math.max(0, Math.min(xPx, pageWidthPx - widthPx));
  yPx = Math.max(0, Math.min(yPx, pageHeightPx - heightPx));

  const opacity = Math.max(0, Math.min(1, parameters.opacity / 100));
  const displayOpacity = opacity;

  let alignItems: 'flex-start' | 'center' | 'flex-end' = 'flex-start';
  if (parameters.stampType === 'text') {
    const colIndex = position % 3; // 1: left, 2: center, 0: right
    switch (colIndex) {
      case 2: // center column
        alignItems = 'center';
        break;
      case 0: // right column
        alignItems = 'flex-end';
        break;
      default:
        alignItems = 'flex-start';
    }
  }

  return {
    container: {
      position: 'relative',
      width: '100%',
      aspectRatio: `${(pageSize?.widthPts ?? 595.28) / (pageSize?.heightPts ?? 841.89)} / 1`,
      backgroundColor: hasPageThumbnail ? 'white' : 'rgba(255,255,255,0.03)',
      border: '1px solid var(--border-default, #333)',
      overflow: 'hidden'
    },
    item: {
      position: 'absolute',
      left: `${xPx}px`,
      bottom: `${yPx}px`,
      width: `${widthPx}px`,
      height: `${heightPx}px`,
      opacity: displayOpacity,
      transform: `rotate(${-parameters.rotation}deg)`,
      transformOrigin: 'center center',
      color: parameters.customColor,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'flex-start',
      lineHeight: (ALPHABET_PREVIEW_TWEAKS as any)[parameters.alphabet]?.lineHeight ?? 1,
      alignItems,
      cursor: showQuickGrid ? 'default' : 'move',
      pointerEvents: showQuickGrid ? 'none' : 'auto',
    }
  };
}
