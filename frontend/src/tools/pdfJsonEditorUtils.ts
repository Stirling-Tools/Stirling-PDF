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
    elements: clones,
    originalElements: originalClones,
    text: buildGroupText(elements, metrics),
    originalText: buildGroupText(elements, metrics),
    bounds,
  };
};

export const groupPageTextElements = (
  page: PdfJsonPage | null | undefined,
  pageIndex: number,
  metrics?: FontMetricsMap,
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
  const groups: TextGroup[] = [];

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
        groups.push(createGroup(pageIndex, groupCounter, currentBucket, metrics));
        groupCounter += 1;
        currentBucket = [element];
      } else {
        currentBucket.push(element);
      }
    });

    if (currentBucket.length > 0) {
      groups.push(createGroup(pageIndex, groupCounter, currentBucket, metrics));
      groupCounter += 1;
    }
  });

  return groups;
};

export const groupDocumentText = (document: PdfJsonDocument | null | undefined): TextGroup[][] => {
  const pages = document?.pages ?? [];
  const metrics = buildFontMetrics(document);
  return pages.map((page, index) => groupPageTextElements(page, index, metrics));
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
  merged.text = group.text;
  if (reference.textMatrix && reference.textMatrix.length === 6) {
    merged.textMatrix = [...reference.textMatrix];
  }
  return merged;
};

const distributeTextAcrossElements = (text: string | undefined, elements: PdfJsonTextElement[]): void => {
  if (elements.length === 0) {
    return;
  }

  const targetChars = Array.from(text ?? '');
  let cursor = 0;

  elements.forEach((element, index) => {
    const originalText = element.text ?? '';
    let sliceLength = Array.from(originalText).length;
    if (sliceLength <= 0) {
      sliceLength = 1;
    }

    if (index === elements.length - 1) {
      element.text = targetChars.slice(cursor).join('');
      cursor = targetChars.length;
      return;
    }

    const slice = targetChars.slice(cursor, cursor + sliceLength).join('');
    element.text = slice;
    cursor = Math.min(cursor + sliceLength, targetChars.length);
  });

  if (cursor < targetChars.length) {
    const last = elements[elements.length - 1];
    last.text = (last.text ?? '') + targetChars.slice(cursor).join('');
  }

  elements.forEach((element) => {
    if (element.text == null) {
      element.text = '';
    }
  });
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
      const originals = group.originalElements.map(cloneTextElement);
      if (group.text !== group.originalText) {
        distributeTextAcrossElements(group.text, originals);
      }
      rebuiltElements.push(...originals);
    });

    const textDirty = groups.some((group) => group.text !== group.originalText);
    const imageDirty = areImageListsDifferent(images, baselineImages);
    const nextStreams = textDirty || imageDirty ? [] : page.contentStreams ?? [];

    return {
      ...page,
      textElements: rebuiltElements,
      imageElements: images.map(cloneImageElement),
      contentStreams: nextStreams,
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
