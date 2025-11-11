import {
  BoundingBox,
  PdfJsonDocument,
  PdfJsonPage,
  PdfJsonTextElement,
  PdfJsonImageElement,
  TextGroup,
  DEFAULT_PAGE_HEIGHT,
  DEFAULT_PAGE_WIDTH,
} from './pdfJsonEditorTypes';

const LINE_TOLERANCE = 2;
const GAP_FACTOR = 0.6;
const SPACE_MIN_GAP = 1.5;
const MIN_CHAR_WIDTH_FACTOR = 0.35;
const MAX_CHAR_WIDTH_FACTOR = 1.25;
const EXTRA_GAP_RATIO = 0.8;

type FontMetrics = {
  unitsPerEm: number;
  ascent: number;
  descent: number;
};

type FontMetricsMap = Map<string, FontMetrics>;

const sanitizeParagraphText = (text: string | undefined | null): string => {
  if (!text) {
    return '';
  }
  return text.replace(/\r?\n/g, '');
};

const splitParagraphIntoLines = (text: string | undefined | null): string[] => {
  if (text === null || text === undefined) {
    return [''];
  }
  return text.replace(/\r/g, '').split('\n');
};

const extractElementBaseline = (element: PdfJsonTextElement): number | null => {
  if (!element) {
    return null;
  }
  if (element.textMatrix && element.textMatrix.length >= 6) {
    const baseline = element.textMatrix[5];
    return typeof baseline === 'number' ? baseline : null;
  }
  if (typeof element.y === 'number') {
    return element.y;
  }
  return null;
};

const shiftElementsBy = (elements: PdfJsonTextElement[], delta: number): PdfJsonTextElement[] => {
  if (delta === 0) {
    return elements.map(cloneTextElement);
  }
  return elements.map((element) => {
    const clone = cloneTextElement(element);
    if (clone.textMatrix && clone.textMatrix.length >= 6) {
      const matrix = [...clone.textMatrix];
      matrix[5] = (matrix[5] ?? 0) + delta;
      clone.textMatrix = matrix;
    }
    if (typeof clone.y === 'number') {
      clone.y += delta;
    } else if (clone.y === null || clone.y === undefined) {
      clone.y = delta;
    }
    return clone;
  });
};

const countGraphemes = (text: string): number => {
  if (!text) {
    return 0;
  }
  return Array.from(text).length;
};

const metricsFor = (metrics: FontMetricsMap | undefined, fontId?: string | null): FontMetrics | undefined => {
  if (!metrics || !fontId) {
    return undefined;
  }
  return metrics.get(fontId) ?? undefined;
};

const buildFontMetrics = (document: PdfJsonDocument | null | undefined): FontMetricsMap => {
  const metrics: FontMetricsMap = new Map();
  document?.fonts?.forEach((font) => {
    if (!font) {
      return;
    }
    const unitsPerEm = font.unitsPerEm && font.unitsPerEm > 0 ? font.unitsPerEm : 1000;
    const ascent = font.ascent ?? unitsPerEm * 0.8;
    const descent = font.descent ?? -(unitsPerEm * 0.2);
    const metric: FontMetrics = { unitsPerEm, ascent, descent };
    if (font.id) {
      metrics.set(font.id, metric);
    }
    if (font.uid) {
      metrics.set(font.uid, metric);
    }
  });
  return metrics;
};

export const valueOr = (value: number | null | undefined, fallback = 0): number => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return fallback;
  }
  return value;
};

export const cloneTextElement = (element: PdfJsonTextElement): PdfJsonTextElement => ({
  ...element,
  textMatrix: element.textMatrix ? [...element.textMatrix] : element.textMatrix ?? undefined,
});

const clearGlyphHints = (element: PdfJsonTextElement): void => {
  if (!element) {
    return;
  }
  element.charCodes = undefined;
};

export const cloneImageElement = (element: PdfJsonImageElement): PdfJsonImageElement => ({
  ...element,
  transform: element.transform ? [...element.transform] : element.transform ?? undefined,
});

const getBaseline = (element: PdfJsonTextElement): number => {
  if (element.textMatrix && element.textMatrix.length === 6) {
    return valueOr(element.textMatrix[5]);
  }
  return valueOr(element.y);
};

const getX = (element: PdfJsonTextElement): number => {
  if (element.textMatrix && element.textMatrix.length === 6) {
    return valueOr(element.textMatrix[4]);
  }
  return valueOr(element.x);
};

const getWidth = (element: PdfJsonTextElement, metrics?: FontMetricsMap): number => {
  const width = valueOr(element.width, 0);
  if (width > 0) {
    return width;
  }

  const text = element.text ?? '';
  const glyphCount = Math.max(1, countGraphemes(text));
  const spacingFallback = Math.max(
    valueOr(element.spaceWidth, 0),
    valueOr(element.wordSpacing, 0),
    valueOr(element.characterSpacing, 0),
  );

  if (spacingFallback > 0 && text.trim().length === 0) {
    return spacingFallback;
  }

  const fontSize = getFontSize(element);
  const fontMetrics = metricsFor(metrics, element.fontId);
  if (fontMetrics) {
    const unitsPerEm = fontMetrics.unitsPerEm > 0 ? fontMetrics.unitsPerEm : 1000;
    const ascentUnits = fontMetrics.ascent ?? unitsPerEm * 0.8;
    const descentUnits = Math.abs(fontMetrics.descent ?? -(unitsPerEm * 0.2));
    const combinedUnits = Math.max(unitsPerEm * 0.8, ascentUnits + descentUnits);
    const averageAdvanceUnits = Math.max(unitsPerEm * 0.5, combinedUnits / Math.max(1, glyphCount));
    const fallbackWidth = (averageAdvanceUnits / unitsPerEm) * glyphCount * fontSize;
    if (fallbackWidth > 0) {
      return fallbackWidth;
    }
  }

  return fontSize * glyphCount * 0.5;
};

const getFontSize = (element: PdfJsonTextElement): number => valueOr(element.fontMatrixSize ?? element.fontSize, 12);

const getHeight = (element: PdfJsonTextElement, metrics?: FontMetricsMap): number => {
  const height = valueOr(element.height, 0);
  if (height > 0) {
    return height;
  }
  const fontSize = getFontSize(element);
  const fontMetrics = metricsFor(metrics, element.fontId);
  if (fontMetrics) {
    const unitsPerEm = fontMetrics.unitsPerEm > 0 ? fontMetrics.unitsPerEm : 1000;
    const ascentUnits = fontMetrics.ascent ?? unitsPerEm * 0.8;
    const descentUnits = Math.abs(fontMetrics.descent ?? -(unitsPerEm * 0.2));
    const totalUnits = Math.max(unitsPerEm, ascentUnits + descentUnits);
    if (totalUnits > 0) {
      return (totalUnits / unitsPerEm) * fontSize;
    }
  }
  return fontSize;
};

const getElementBounds = (
  element: PdfJsonTextElement,
  metrics?: FontMetricsMap,
): BoundingBox => {
  const left = getX(element);
  const width = getWidth(element, metrics);
  const baseline = getBaseline(element);
  const height = getHeight(element, metrics);

  let ascentRatio = 0.8;
  let descentRatio = 0.2;
  const fontMetrics = metricsFor(metrics, element.fontId);
  if (fontMetrics) {
    const unitsPerEm = fontMetrics.unitsPerEm > 0 ? fontMetrics.unitsPerEm : 1000;
    const ascentUnits = fontMetrics.ascent ?? unitsPerEm * 0.8;
    const descentUnits = Math.abs(fontMetrics.descent ?? -(unitsPerEm * 0.2));
    const totalUnits = Math.max(unitsPerEm, ascentUnits + descentUnits);
    if (totalUnits > 0) {
      ascentRatio = ascentUnits / totalUnits;
      descentRatio = descentUnits / totalUnits;
    }
  }

  const bottom = baseline + height * ascentRatio;
  const top = baseline - height * descentRatio;
  return {
    left,
    right: left + width,
    top,
    bottom,
  };
};

export const getImageBounds = (element: PdfJsonImageElement): BoundingBox => {
  const left = valueOr(element.left ?? element.x, 0);
  const computedWidth = valueOr(element.width, Math.max(valueOr(element.right, left) - left, 0));
  const right = valueOr(element.right ?? left + computedWidth, left + computedWidth);
  const bottom = valueOr(element.bottom ?? element.y, 0);
  const computedHeight = valueOr(element.height, Math.max(valueOr(element.top, bottom) - bottom, 0));
  const top = valueOr(element.top ?? bottom + computedHeight, bottom + computedHeight);
  return {
    left,
    right,
    bottom,
    top,
  };
};

const getSpacingHint = (element: PdfJsonTextElement): number => {
  const spaceWidth = valueOr(element.spaceWidth, 0);
  if (spaceWidth > 0) {
    return spaceWidth;
  }
  const wordSpacing = valueOr(element.wordSpacing, 0);
  if (wordSpacing > 0) {
    return wordSpacing;
  }
  const characterSpacing = valueOr(element.characterSpacing, 0);
  return Math.max(characterSpacing, 0);
};

const estimateCharWidth = (
  element: PdfJsonTextElement,
  avgFontSize: number,
  metrics?: FontMetricsMap,
): number => {
  const rawWidth = getWidth(element, metrics);
  const minWidth = avgFontSize * MIN_CHAR_WIDTH_FACTOR;
  const maxWidth = avgFontSize * MAX_CHAR_WIDTH_FACTOR;
  return Math.min(Math.max(rawWidth, minWidth), maxWidth);
};

const mergeBounds = (bounds: BoundingBox[]): BoundingBox => {
  if (bounds.length === 0) {
    return { left: 0, right: 0, top: 0, bottom: 0 };
  }
  return bounds.reduce(
    (acc, current) => ({
      left: Math.min(acc.left, current.left),
      right: Math.max(acc.right, current.right),
      top: Math.min(acc.top, current.top),
      bottom: Math.max(acc.bottom, current.bottom),
    }),
    { ...bounds[0] }
  );
};

const shouldInsertSpace = (
  prev: PdfJsonTextElement,
  current: PdfJsonTextElement,
  metrics?: FontMetricsMap,
): boolean => {
  const prevRight = getX(prev) + getWidth(prev, metrics);
  const trailingGap = Math.max(0, getX(current) - prevRight);
  const avgFontSize = (getFontSize(prev) + getFontSize(current)) / 2;
  const baselineAdvance = Math.max(0, getX(current) - getX(prev));
  const charWidthEstimate = estimateCharWidth(prev, avgFontSize, metrics);
  const inferredGap = Math.max(0, baselineAdvance - charWidthEstimate);
  const spacingHint = Math.max(
    SPACE_MIN_GAP,
    getSpacingHint(prev),
    getSpacingHint(current),
    avgFontSize * GAP_FACTOR,
  );

  if (trailingGap > spacingHint) {
    return true;
  }

  if (inferredGap > spacingHint * EXTRA_GAP_RATIO) {
    return true;
  }

  const prevText = (prev.text ?? '').trimEnd();
  if (prevText.endsWith('-')) {
    return false;
  }

  return false;
};

const buildGroupText = (elements: PdfJsonTextElement[], metrics?: FontMetricsMap): string => {
  let result = '';
  elements.forEach((element, index) => {
    const value = element.text ?? '';
    if (index === 0) {
      result += value;
      return;
    }

    const previous = elements[index - 1];
    const needsSpace = shouldInsertSpace(previous, element, metrics);
    const startsWithWhitespace = /^\s/u.test(value);

    if (needsSpace && !startsWithWhitespace) {
      result += ' ';
    }
    result += value;
  });
  return result;
};

const rgbToCss = (components: number[]): string => {
  if (components.length >= 3) {
    const r = Math.round(Math.max(0, Math.min(1, components[0])) * 255);
    const g = Math.round(Math.max(0, Math.min(1, components[1])) * 255);
    const b = Math.round(Math.max(0, Math.min(1, components[2])) * 255);
    return `rgb(${r}, ${g}, ${b})`;
  }
  return 'rgb(0, 0, 0)';
};

const cmykToCss = (components: number[]): string => {
  if (components.length >= 4) {
    const c = Math.max(0, Math.min(1, components[0]));
    const m = Math.max(0, Math.min(1, components[1]));
    const y = Math.max(0, Math.min(1, components[2]));
    const k = Math.max(0, Math.min(1, components[3]));
    const r = Math.round(255 * (1 - c) * (1 - k));
    const g = Math.round(255 * (1 - m) * (1 - k));
    const b = Math.round(255 * (1 - y) * (1 - k));
    return `rgb(${r}, ${g}, ${b})`;
  }
  return 'rgb(0, 0, 0)';
};

const grayToCss = (components: number[]): string => {
  if (components.length >= 1) {
    const gray = Math.round(Math.max(0, Math.min(1, components[0])) * 255);
    return `rgb(${gray}, ${gray}, ${gray})`;
  }
  return 'rgb(0, 0, 0)';
};

const extractColor = (element: PdfJsonTextElement): string | null => {
  const fillColor = element.fillColor;
  if (!fillColor || !fillColor.components || fillColor.components.length === 0) {
    return null;
  }

  const colorSpace = (fillColor.colorSpace ?? '').toLowerCase();

  if (colorSpace.includes('rgb') || colorSpace.includes('srgb')) {
    return rgbToCss(fillColor.components);
  }
  if (colorSpace.includes('cmyk')) {
    return cmykToCss(fillColor.components);
  }
  if (colorSpace.includes('gray') || colorSpace.includes('grey')) {
    return grayToCss(fillColor.components);
  }

  // Default to RGB interpretation
  if (fillColor.components.length >= 3) {
    return rgbToCss(fillColor.components);
  }
  if (fillColor.components.length === 1) {
    return grayToCss(fillColor.components);
  }

  return null;
};

const RAD_TO_DEG = 180 / Math.PI;

const normalizeAngle = (angle: number): number => {
  let normalized = angle % 360;
  if (normalized > 180) {
    normalized -= 360;
  } else if (normalized <= -180) {
    normalized += 360;
  }
  return normalized;
};

const extractElementRotation = (element: PdfJsonTextElement): number | null => {
  const matrix = element.textMatrix;
  if (!matrix || matrix.length !== 6) {
    return null;
  }
  const a = matrix[0];
  const b = matrix[1];
  if (Math.abs(a) < 1e-6 && Math.abs(b) < 1e-6) {
    return null;
  }
  const angle = Math.atan2(b, a) * RAD_TO_DEG;
  if (Math.abs(angle) < 0.5) {
    return null;
  }
  return normalizeAngle(angle);
};

const computeGroupRotation = (elements: PdfJsonTextElement[]): number | null => {
  const angles = elements
    .map(extractElementRotation)
    .filter((angle): angle is number => angle !== null);
  if (angles.length === 0) {
    return null;
  }
  const vector = angles.reduce(
    (acc, angle) => {
      const radians = (angle * Math.PI) / 180;
      acc.x += Math.cos(radians);
      acc.y += Math.sin(radians);
      return acc;
    },
    { x: 0, y: 0 },
  );
  if (Math.abs(vector.x) < 1e-6 && Math.abs(vector.y) < 1e-6) {
    return null;
  }
  const average = Math.atan2(vector.y, vector.x) * RAD_TO_DEG;
  const normalized = normalizeAngle(average);
  return Math.abs(normalized) < 0.5 ? null : normalized;
};

const getAnchorPoint = (element: PdfJsonTextElement): { x: number; y: number } => {
  if (element.textMatrix && element.textMatrix.length === 6) {
    return {
      x: valueOr(element.textMatrix[4]),
      y: valueOr(element.textMatrix[5]),
    };
  }
  return {
    x: valueOr(element.x),
    y: valueOr(element.y),
  };
};

const computeBaselineLength = (
  elements: PdfJsonTextElement[],
  metrics?: FontMetricsMap,
): number => elements.reduce((acc, current) => acc + getWidth(current, metrics), 0);

const computeAverageBaseline = (elements: PdfJsonTextElement[]): number | null => {
  if (elements.length === 0) {
    return null;
  }
  let sum = 0;
  elements.forEach((element) => {
    sum += getBaseline(element);
  });
  return sum / elements.length;
};

const createGroup = (
  pageIndex: number,
  idSuffix: number,
  elements: PdfJsonTextElement[],
  metrics?: FontMetricsMap,
): TextGroup => {
  const clones = elements.map(cloneTextElement);
  const originalClones = clones.map(cloneTextElement);
  const bounds = mergeBounds(elements.map((element) => getElementBounds(element, metrics)));
  const firstElement = elements[0];
  const rotation = computeGroupRotation(elements);
  const anchor = rotation !== null ? getAnchorPoint(firstElement) : null;
  const baselineLength = computeBaselineLength(elements, metrics);
  const baseline = computeAverageBaseline(elements);

  return {
    id: `${pageIndex}-${idSuffix}`,
    pageIndex,
    fontId: firstElement?.fontId,
    fontSize: firstElement?.fontSize,
    fontMatrixSize: firstElement?.fontMatrixSize,
    color: firstElement ? extractColor(firstElement) : null,
    fontWeight: null, // Will be determined from font descriptor
    rotation,
    anchor,
    baselineLength,
    baseline,
    elements: clones,
    originalElements: originalClones,
    text: buildGroupText(elements, metrics),
    originalText: buildGroupText(elements, metrics),
    bounds,
  };
};

const groupLinesIntoParagraphs = (
  lineGroups: TextGroup[],
  metrics?: FontMetricsMap,
): TextGroup[] => {
  if (lineGroups.length === 0) {
    return [];
  }

  const paragraphs: TextGroup[][] = [];
  let currentParagraph: TextGroup[] = [lineGroups[0]];

  for (let i = 1; i < lineGroups.length; i++) {
    const prevLine = lineGroups[i - 1];
    const currentLine = lineGroups[i];

    // Calculate line spacing
    const prevBaseline = prevLine.baseline ?? 0;
    const currentBaseline = currentLine.baseline ?? 0;
    const lineSpacing = Math.abs(prevBaseline - currentBaseline);

    // Calculate average font size
    const prevFontSize = prevLine.fontSize ?? 12;
    const currentFontSize = currentLine.fontSize ?? 12;
    const avgFontSize = (prevFontSize + currentFontSize) / 2;

    // Check horizontal alignment (left edge)
    const prevLeft = prevLine.bounds.left;
    const currentLeft = currentLine.bounds.left;
    const leftAlignmentTolerance = avgFontSize * 0.3;
    const isLeftAligned = Math.abs(prevLeft - currentLeft) <= leftAlignmentTolerance;

    // Check if fonts match
    const sameFont = prevLine.fontId === currentLine.fontId;

    // Check for consistent spacing rather than expected spacing
    // Line spacing in PDFs can range from 1.0x to 3.0x font size
    // We just want to ensure spacing is consistent between consecutive lines
    // and not excessively large (which would indicate a paragraph break)
    const maxReasonableSpacing = avgFontSize * 3.0; // Max ~3x font size for normal line spacing
    const hasReasonableSpacing = lineSpacing <= maxReasonableSpacing;

    // Merge into paragraph if:
    // 1. Left aligned
    // 2. Same font
    // 3. Reasonable line spacing (not a large gap indicating paragraph break)
    const shouldMerge = isLeftAligned && sameFont && hasReasonableSpacing;

    if (shouldMerge) {
      currentParagraph.push(currentLine);
    } else {
      paragraphs.push(currentParagraph);
      currentParagraph = [currentLine];
    }
  }

  // Don't forget the last paragraph
  if (currentParagraph.length > 0) {
    paragraphs.push(currentParagraph);
  }

  // Merge line groups into single paragraph groups
  return paragraphs.map((lines, paragraphIndex) => {
    if (lines.length === 1) {
      return lines[0];
    }

    // Combine all elements from all lines
    const allElements = lines.flatMap(line => line.originalElements);
    const pageIndex = lines[0].pageIndex;
    const lineElementCounts = lines.map((line) => line.originalElements.length);

    // Create merged group with newlines between lines
    const paragraphText = lines.map(line => line.text).join('\n');
    const mergedBounds = mergeBounds(lines.map(line => line.bounds));
    const spacingValues: number[] = [];
    for (let i = 1; i < lines.length; i++) {
      const prevBaseline = lines[i - 1].baseline ?? lines[i - 1].bounds.bottom;
      const currentBaseline = lines[i].baseline ?? lines[i].bounds.bottom;
      const spacing = Math.abs(prevBaseline - currentBaseline);
      if (spacing > 0) {
        spacingValues.push(spacing);
      }
    }
    const averageSpacing =
      spacingValues.length > 0
        ? spacingValues.reduce((sum, value) => sum + value, 0) / spacingValues.length
        : null;

    const firstElement = allElements[0];
    const rotation = computeGroupRotation(allElements);
    const anchor = rotation !== null ? getAnchorPoint(firstElement) : null;
    const baselineLength = computeBaselineLength(allElements, metrics);
    const baseline = computeAverageBaseline(allElements);

    return {
      id: lines[0].id, // Keep the first line's ID
      pageIndex,
      fontId: firstElement?.fontId,
      fontSize: firstElement?.fontSize,
      fontMatrixSize: firstElement?.fontMatrixSize,
      lineSpacing: averageSpacing,
      lineElementCounts: lines.length > 1 ? lineElementCounts : null,
      color: firstElement ? extractColor(firstElement) : null,
      fontWeight: null,
      rotation,
      anchor,
      baselineLength,
      baseline,
      elements: allElements.map(cloneTextElement),
      originalElements: allElements.map(cloneTextElement),
      text: paragraphText,
      originalText: paragraphText,
      bounds: mergedBounds,
    };
  });
};

export const groupPageTextElements = (
  page: PdfJsonPage | null | undefined,
  pageIndex: number,
  metrics?: FontMetricsMap,
  groupingMode: 'auto' | 'paragraph' | 'singleLine' = 'auto',
): TextGroup[] => {
  if (!page?.textElements || page.textElements.length === 0) {
    return [];
  }

  const elements = page.textElements
    .map(cloneTextElement)
    .filter((element) => element.text !== null && element.text !== undefined);

  elements.sort((a, b) => getBaseline(b) - getBaseline(a));

  const lines: { baseline: number; elements: PdfJsonTextElement[] }[] = [];

  elements.forEach((element) => {
    const baseline = getBaseline(element);
    const fontSize = getFontSize(element);
    const tolerance = Math.max(LINE_TOLERANCE, fontSize * 0.12);

    const existingLine = lines.find((line) => Math.abs(line.baseline - baseline) <= tolerance);

    if (existingLine) {
      existingLine.elements.push(element);
    } else {
      lines.push({ baseline, elements: [element] });
    }
  });

  lines.forEach((line) => {
    line.elements.sort((a, b) => getX(a) - getX(b));
  });

  let groupCounter = 0;
  const lineGroups: TextGroup[] = [];

  lines.forEach((line) => {
    let currentBucket: PdfJsonTextElement[] = [];

    line.elements.forEach((element) => {
      if (currentBucket.length === 0) {
        currentBucket.push(element);
        return;
      }

      const previous = currentBucket[currentBucket.length - 1];
      const gap = getX(element) - (getX(previous) + getWidth(previous, metrics));
      const avgFontSize = (getFontSize(previous) + getFontSize(element)) / 2;
      const splitThreshold = Math.max(SPACE_MIN_GAP, avgFontSize * GAP_FACTOR);

      const sameFont = previous.fontId === element.fontId;
      let shouldSplit = gap > splitThreshold * (sameFont ? 1.4 : 1.0);

      if (shouldSplit) {
        const prevBaseline = getBaseline(previous);
        const currentBaseline = getBaseline(element);
        const baselineDelta = Math.abs(prevBaseline - currentBaseline);
        const prevEndX = getX(previous) + getWidth(previous, metrics);
        const prevEndY = prevBaseline;
        const diagonalGap = Math.hypot(Math.max(0, getX(element) - prevEndX), baselineDelta);
        const diagonalThreshold = Math.max(avgFontSize * 0.8, splitThreshold);
        if (diagonalGap <= diagonalThreshold) {
          shouldSplit = false;
        }
      }

      const previousRotation = extractElementRotation(previous);
      const currentRotation = extractElementRotation(element);
      if (
        shouldSplit &&
        previousRotation !== null &&
        currentRotation !== null &&
        Math.abs(normalizeAngle(previousRotation - currentRotation)) < 1
      ) {
        shouldSplit = false;
      }

      if (shouldSplit) {
        lineGroups.push(createGroup(pageIndex, groupCounter, currentBucket, metrics));
        groupCounter += 1;
        currentBucket = [element];
      } else {
        currentBucket.push(element);
      }
    });

    if (currentBucket.length > 0) {
      lineGroups.push(createGroup(pageIndex, groupCounter, currentBucket, metrics));
      groupCounter += 1;
    }
  });

  // Apply paragraph grouping based on mode
  if (groupingMode === 'singleLine') {
    // Single line mode: skip paragraph grouping
    return lineGroups;
  }

  if (groupingMode === 'paragraph') {
    // Paragraph mode: always apply grouping
    return groupLinesIntoParagraphs(lineGroups, metrics);
  }

  // Auto mode: use heuristic to determine if we should group
  // Analyze the page content to decide
  let multiLineGroups = 0;
  let totalWords = 0;
  let longTextGroups = 0;
  let totalGroups = 0;

  lineGroups.forEach((group) => {
    const text = (group.text || '').trim();
    if (text.length === 0) return;

    totalGroups++;
    const lines = text.split('\n');
    const lineCount = lines.length;
    const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;

    totalWords += wordCount;

    if (lineCount > 1) {
      multiLineGroups++;
    }

    if (wordCount >= 5 || text.length >= 30) {
      longTextGroups++;
    }
  });

  if (totalGroups === 0) {
    return lineGroups;
  }

  const avgWordsPerGroup = totalWords / totalGroups;
  const longTextRatio = longTextGroups / totalGroups;

  const isParagraphPage =
    (multiLineGroups >= 2 && avgWordsPerGroup > 8) ||
    avgWordsPerGroup > 12 ||
    longTextRatio > 0.4;

  // Only apply paragraph grouping if it looks like a paragraph-heavy page
  if (isParagraphPage) {
    return groupLinesIntoParagraphs(lineGroups, metrics);
  }

  // For sparse pages, keep lines separate
  return lineGroups;
};

export const groupDocumentText = (
  document: PdfJsonDocument | null | undefined,
  groupingMode: 'auto' | 'paragraph' | 'singleLine' = 'auto',
): TextGroup[][] => {
  const pages = document?.pages ?? [];
  const metrics = buildFontMetrics(document);
  return pages.map((page, index) => groupPageTextElements(page, index, metrics, groupingMode));
};

export const extractPageImages = (
  page: PdfJsonPage | null | undefined,
  pageIndex: number,
): PdfJsonImageElement[] => {
  const images = page?.imageElements ?? [];
  return images.map((image, imageIndex) => {
    const clone = cloneImageElement(image);
    if (!clone.id || clone.id.trim().length === 0) {
      clone.id = `page-${pageIndex}-image-${imageIndex}`;
    }
    return clone;
  });
};

export const extractDocumentImages = (
  document: PdfJsonDocument | null | undefined,
): PdfJsonImageElement[][] => {
  const pages = document?.pages ?? [];
  return pages.map((page, index) => extractPageImages(page, index));
};

export const deepCloneDocument = (document: PdfJsonDocument): PdfJsonDocument => {
  if (typeof structuredClone === 'function') {
    return structuredClone(document);
  }
  return JSON.parse(JSON.stringify(document));
};

export const pageDimensions = (page: PdfJsonPage | null | undefined): { width: number; height: number } => {
  return {
    width: valueOr(page?.width, DEFAULT_PAGE_WIDTH),
    height: valueOr(page?.height, DEFAULT_PAGE_HEIGHT),
  };
};

export const createMergedElement = (group: TextGroup): PdfJsonTextElement => {
  const reference = group.originalElements[0];
  const merged = cloneTextElement(reference);
  merged.text = sanitizeParagraphText(group.text);
  clearGlyphHints(merged);
  if (reference.textMatrix && reference.textMatrix.length === 6) {
    merged.textMatrix = [...reference.textMatrix];
  }
  return merged;
};

const distributeTextAcrossElements = (text: string | undefined, elements: PdfJsonTextElement[]): boolean => {
  if (elements.length === 0) {
    return true;
  }

  const normalizedText = sanitizeParagraphText(text);
  const targetChars = Array.from(normalizedText);
  if (targetChars.length === 0) {
    elements.forEach((element) => {
      element.text = '';
      clearGlyphHints(element);
    });
    return true;
  }

  const capacities = elements.map((element) => {
    const originalText = element.text ?? '';
    const graphemeCount = Array.from(originalText).length;
    return graphemeCount > 0 ? graphemeCount : 1;
  });

  let cursor = 0;
  elements.forEach((element, index) => {
    const remaining = targetChars.length - cursor;
    let sliceLength = 0;
    if (remaining > 0) {
      if (index === elements.length - 1) {
        sliceLength = remaining;
      } else {
        const capacity = Math.max(capacities[index], 1);
        const minRemainingForRest = Math.max(elements.length - index - 1, 0);
        sliceLength = Math.min(capacity, Math.max(remaining - minRemainingForRest, 1));
      }
    }

    element.text = sliceLength > 0 ? targetChars.slice(cursor, cursor + sliceLength).join('') : '';
    clearGlyphHints(element);
    cursor += sliceLength;
  });

  elements.forEach((element) => {
    if (element.text == null) {
      element.text = '';
    }
  });

  return true;
};

const sliceElementsByLineCounts = (group: TextGroup): PdfJsonTextElement[][] => {
  const counts = group.lineElementCounts;
  if (!counts || counts.length === 0) {
    if (!group.originalElements.length) {
      return [];
    }
    return [group.originalElements];
  }

  const result: PdfJsonTextElement[][] = [];
  let cursor = 0;
  counts.forEach((count) => {
    if (count <= 0) {
      return;
    }
    const slice = group.originalElements.slice(cursor, cursor + count);
    if (slice.length > 0) {
      result.push(slice);
    }
    cursor += count;
  });
  return result;
};

const rebuildParagraphLineElements = (group: TextGroup): PdfJsonTextElement[] | null => {
  if (!group.text || !group.text.includes('\n')) {
    return null;
  }

  const lineTexts = splitParagraphIntoLines(group.text);
  if (lineTexts.length === 0) {
    return [];
  }

  const lineElementGroups = sliceElementsByLineCounts(group);
  if (!lineElementGroups.length) {
    return null;
  }

  const lineBaselines = lineElementGroups.map((elements) => {
    for (const element of elements) {
      const baseline = extractElementBaseline(element);
      if (baseline !== null) {
        return baseline;
      }
    }
    return group.baseline ?? null;
  });

  const spacingFromBaselines = (() => {
    for (let i = 1; i < lineBaselines.length; i += 1) {
      const prev = lineBaselines[i - 1];
      const current = lineBaselines[i];
      if (prev !== null && current !== null) {
        const diff = Math.abs(prev - current);
        if (diff > 0) {
          return diff;
        }
      }
    }
    return null;
  })();

  const spacing =
    (group.lineSpacing && group.lineSpacing > 0
      ? group.lineSpacing
      : spacingFromBaselines) ??
    Math.max(group.fontMatrixSize ?? group.fontSize ?? 12, 6) * 1.2;

  let direction = -1;
  for (let i = 1; i < lineBaselines.length; i += 1) {
    const prev = lineBaselines[i - 1];
    const current = lineBaselines[i];
    if (prev !== null && current !== null && Math.abs(prev - current) > 0.05) {
      direction = current < prev ? -1 : 1;
      break;
    }
  }

  const templateCount = lineElementGroups.length;
  const lastTemplateIndex = Math.max(templateCount - 1, 0);
  const rebuilt: PdfJsonTextElement[] = [];

  for (let index = 0; index < lineTexts.length; index += 1) {
    const templateIndex = Math.min(index, lastTemplateIndex);
    const templateElements = lineElementGroups[templateIndex];
    if (!templateElements || templateElements.length === 0) {
      return null;
    }

    const shiftSteps = index - templateIndex;
    const delta = shiftSteps * spacing * direction;
    const clones = shiftElementsBy(templateElements, delta);
    const normalizedLine = sanitizeParagraphText(lineTexts[index]);
    const distributed = distributeTextAcrossElements(normalizedLine, clones);

    if (!distributed) {
      const primary = clones[0];
      primary.text = normalizedLine;
      clearGlyphHints(primary);
      for (let i = 1; i < clones.length; i += 1) {
        clones[i].text = '';
        clearGlyphHints(clones[i]);
      }
    }

    rebuilt.push(...clones);
  }

  return rebuilt;
};

export const buildUpdatedDocument = (
  source: PdfJsonDocument,
  groupsByPage: TextGroup[][],
  imagesByPage: PdfJsonImageElement[][],
): PdfJsonDocument => {
  const updated = deepCloneDocument(source);
  const pages = updated.pages ?? [];

  updated.pages = pages.map((page, pageIndex) => {
    const groups = groupsByPage[pageIndex] ?? [];
    const images = imagesByPage[pageIndex] ?? [];
    if (!groups.length) {
      return {
        ...page,
        imageElements: images.map(cloneImageElement),
      };
    }

    const updatedElements: PdfJsonTextElement[] = groups.flatMap((group) => {
      if (group.text === group.originalText) {
        return group.originalElements.map(cloneTextElement);
      }
      return [createMergedElement(group)];
    });

    return {
      ...page,
      textElements: updatedElements,
      imageElements: images.map(cloneImageElement),
      contentStreams: page.contentStreams ?? [],
    };
  });

  return updated;
};

export const restoreGlyphElements = (
  source: PdfJsonDocument,
  groupsByPage: TextGroup[][],
  imagesByPage: PdfJsonImageElement[][],
  originalImagesByPage: PdfJsonImageElement[][],
  forceMergedGroups: boolean = false,
): PdfJsonDocument => {
  const updated = deepCloneDocument(source);
  const pages = updated.pages ?? [];

  updated.pages = pages.map((page, pageIndex) => {
    const groups = groupsByPage[pageIndex] ?? [];
    const images = imagesByPage[pageIndex] ?? [];
    const baselineImages = originalImagesByPage[pageIndex] ?? [];

    if (!groups.length) {
      return {
        ...page,
        imageElements: images.map(cloneImageElement),
      };
    }

    const rebuiltElements: PdfJsonTextElement[] = [];

    groups.forEach((group) => {
      if (group.text !== group.originalText) {
        if (forceMergedGroups) {
          rebuiltElements.push(createMergedElement(group));
          return;
        }
        const paragraphElements = rebuildParagraphLineElements(group);
        if (paragraphElements && paragraphElements.length > 0) {
          rebuiltElements.push(...paragraphElements);
          return;
        }
        const originalGlyphCount = group.originalElements.reduce(
          (sum, element) => sum + countGraphemes(element.text ?? ''),
          0,
        );
        const normalizedText = sanitizeParagraphText(group.text);
        const targetGlyphCount = countGraphemes(normalizedText);

        if (targetGlyphCount !== originalGlyphCount) {
          rebuiltElements.push(createMergedElement(group));
          return;
        }

        const originals = group.originalElements.map(cloneTextElement);
        const distributed = distributeTextAcrossElements(normalizedText, originals);
        if (distributed) {
          rebuiltElements.push(...originals);
        } else {
          rebuiltElements.push(createMergedElement(group));
        }
        return;
      }

      rebuiltElements.push(...group.originalElements.map(cloneTextElement));
    });

    return {
      ...page,
      textElements: rebuiltElements,
      imageElements: images.map(cloneImageElement),
      contentStreams: page.contentStreams ?? [],
    };
  });

  return updated;
};

const approxEqual = (a: number | null | undefined, b: number | null | undefined, tolerance = 0.25): boolean => {
  const first = typeof a === 'number' && Number.isFinite(a) ? a : 0;
  const second = typeof b === 'number' && Number.isFinite(b) ? b : 0;
  return Math.abs(first - second) <= tolerance;
};

const arrayApproxEqual = (
  first: number[] | null | undefined,
  second: number[] | null | undefined,
  tolerance = 0.25,
): boolean => {
  if (!first && !second) {
    return true;
  }
  if (!first || !second) {
    return false;
  }
  if (first.length !== second.length) {
    return false;
  }
  for (let index = 0; index < first.length; index += 1) {
    if (!approxEqual(first[index], second[index], tolerance)) {
      return false;
    }
  }
  return true;
};

const areImageElementsEqual = (
  current: PdfJsonImageElement,
  original: PdfJsonImageElement,
): boolean => {
  if (current === original) {
    return true;
  }
  if (!current || !original) {
    return false;
  }

  const sameData = (current.imageData ?? null) === (original.imageData ?? null);
  const sameFormat = (current.imageFormat ?? null) === (original.imageFormat ?? null);

  return (
    sameData &&
    sameFormat &&
    approxEqual(current.x, original.x) &&
    approxEqual(current.y, original.y) &&
    approxEqual(current.width, original.width) &&
    approxEqual(current.height, original.height) &&
    approxEqual(current.left, original.left) &&
    approxEqual(current.right, original.right) &&
    approxEqual(current.top, original.top) &&
    approxEqual(current.bottom, original.bottom) &&
    (current.zOrder ?? null) === (original.zOrder ?? null) &&
    arrayApproxEqual(current.transform, original.transform)
  );
};

export const areImageListsDifferent = (
  current: PdfJsonImageElement[],
  original: PdfJsonImageElement[],
): boolean => {
  if (current.length !== original.length) {
    return true;
  }
  for (let index = 0; index < current.length; index += 1) {
    if (!areImageElementsEqual(current[index], original[index])) {
      return true;
    }
  }
  return false;
};

export const getDirtyPages = (
  groupsByPage: TextGroup[][],
  imagesByPage: PdfJsonImageElement[][],
  originalImagesByPage: PdfJsonImageElement[][],
): boolean[] => {
  return groupsByPage.map((groups, index) => {
    const textDirty = groups.some((group) => group.text !== group.originalText);
    const imageDirty = areImageListsDifferent(
      imagesByPage[index] ?? [],
      originalImagesByPage[index] ?? [],
    );
    return textDirty || imageDirty;
  });
};
