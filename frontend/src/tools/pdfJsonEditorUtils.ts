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

const getWidth = (element: PdfJsonTextElement): number => {
  const width = valueOr(element.width, 0);
  if (width === 0 && element.text) {
    const fontSize = valueOr(element.fontSize, 12);
    return fontSize * Math.max(element.text.length * 0.45, 0.5);
  }
  return width;
};

const getFontSize = (element: PdfJsonTextElement): number => valueOr(element.fontMatrixSize ?? element.fontSize, 12);

const getHeight = (element: PdfJsonTextElement): number => {
  const height = valueOr(element.height);
  if (height === 0) {
    return getFontSize(element) * 1.05;
  }
  return height;
};

const getElementBounds = (element: PdfJsonTextElement): BoundingBox => {
  const left = getX(element);
  const width = getWidth(element);
  const bottom = getBaseline(element);
  const height = getHeight(element);
  const top = bottom - height;
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

const estimateCharWidth = (element: PdfJsonTextElement, avgFontSize: number): number => {
  const rawWidth = getWidth(element);
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

const shouldInsertSpace = (prev: PdfJsonTextElement, current: PdfJsonTextElement): boolean => {
  const prevRight = getX(prev) + getWidth(prev);
  const trailingGap = Math.max(0, getX(current) - prevRight);
  const avgFontSize = (getFontSize(prev) + getFontSize(current)) / 2;
  const baselineAdvance = Math.max(0, getX(current) - getX(prev));
  const charWidthEstimate = estimateCharWidth(prev, avgFontSize);
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

const buildGroupText = (elements: PdfJsonTextElement[]): string => {
  let result = '';
  elements.forEach((element, index) => {
    const value = element.text ?? '';
    if (index === 0) {
      result += value;
      return;
    }

    const previous = elements[index - 1];
    const needsSpace = shouldInsertSpace(previous, element);
    const startsWithWhitespace = /^\s/u.test(value);

    if (needsSpace && !startsWithWhitespace) {
      result += ' ';
    }
    result += value;
  });
  return result;
};

const createGroup = (
  pageIndex: number,
  idSuffix: number,
  elements: PdfJsonTextElement[],
): TextGroup => {
  const clones = elements.map(cloneTextElement);
  const originalClones = clones.map(cloneTextElement);
  const bounds = mergeBounds(elements.map(getElementBounds));

  return {
    id: `${pageIndex}-${idSuffix}`,
    pageIndex,
    fontId: elements[0]?.fontId,
    fontSize: elements[0]?.fontSize,
    fontMatrixSize: elements[0]?.fontMatrixSize,
    elements: clones,
    originalElements: originalClones,
    text: buildGroupText(elements),
    originalText: buildGroupText(elements),
    bounds,
  };
};

export const groupPageTextElements = (page: PdfJsonPage | null | undefined, pageIndex: number): TextGroup[] => {
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
      const gap = getX(element) - (getX(previous) + getWidth(previous));
      const avgFontSize = (getFontSize(previous) + getFontSize(element)) / 2;
      const splitThreshold = Math.max(SPACE_MIN_GAP, avgFontSize * GAP_FACTOR);

      const sameFont = previous.fontId === element.fontId;
      const shouldSplit = gap > splitThreshold * (sameFont ? 1.4 : 1.0);

      if (shouldSplit) {
        groups.push(createGroup(pageIndex, groupCounter, currentBucket));
        groupCounter += 1;
        currentBucket = [element];
      } else {
        currentBucket.push(element);
      }
    });

    if (currentBucket.length > 0) {
      groups.push(createGroup(pageIndex, groupCounter, currentBucket));
      groupCounter += 1;
    }
  });

  return groups;
};

export const groupDocumentText = (document: PdfJsonDocument | null | undefined): TextGroup[][] => {
  const pages = document?.pages ?? [];
  return pages.map((page, index) => groupPageTextElements(page, index));
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
