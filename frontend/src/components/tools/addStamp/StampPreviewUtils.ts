import type { AddStampParameters } from './useAddStampParameters';

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
      return 'Meiryo, Yu Gothic, Hiragino Sans, sans-serif';
    case 'korean':
      return 'Malgun Gothic, Dotum, sans-serif';
    case 'chinese':
      return 'SimSun, Microsoft YaHei, sans-serif';
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
  const heightPtsContent = parameters.fontSize; // UI size in points
  let widthPtsContent = heightPtsContent;

  // Approximate PDF cap height ratio per alphabet to mirror backend's calculateTextCapHeight usage
  const getCapHeightRatio = (alphabet: string): number => {
    switch (alphabet) {
      case 'roman':
        return 0.70; // Noto Sans/Helvetica ~0.7 em
      case 'arabic':
        return 0.68;
      case 'thai':
        return 0.66;
      case 'japanese':
      case 'korean':
      case 'chinese':
        return 0.72; // CJK glyph boxes
      default:
        return 0.70;
    }
  };

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

      // Empirical tweak to better match PDFBox string width for Roman fonts
      // PDFBox often yields ~8-12% narrower widths than browser canvas for the same font family
      let adjustmentFactor = 1.0;
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
      ? heightPtsContent * getCapHeightRatio(parameters.alphabet)
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
  const xPx = xPts * scaleX;
  let yPx = yPts * scaleY;
  // Vertical correction: text appears lower in preview vs output for middle/bottom rows
  if (parameters.stampType === 'text') {
    try {
      const rootFontSizePx = parseFloat(getComputedStyle(document.documentElement).fontSize || '16') || 16;
      const middleRowOffsetPx = 1 * rootFontSizePx; 
      const bottomRowOffsetPx = 1.25 * rootFontSizePx; 
      const rowIndex = Math.floor((position - 1) / 3); 
      if (rowIndex === 1) {
        yPx += middleRowOffsetPx;
      } else if (rowIndex === 2) {
        yPx += bottomRowOffsetPx;
      }
    } catch (e) {
      console.error(e);
    }
  }
  const widthPx = widthPtsContent * scaleX;
  const heightPx = heightPtsContent * scaleY;

  const opacity = Math.max(0, Math.min(1, parameters.opacity / 100));
  const displayOpacity = opacity;

  // Horizontal alignment inside the preview item for text stamps
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
      backgroundColor: hasPageThumbnail ? 'transparent' : 'rgba(255,255,255,0.03)',
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
      lineHeight: 1,
      alignItems,
      cursor: showQuickGrid ? 'default' : 'move',
      pointerEvents: showQuickGrid ? 'none' : 'auto',
    }
  };
}
